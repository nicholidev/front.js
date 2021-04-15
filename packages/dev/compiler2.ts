import { promises as fsp } from "fs";
import * as path from "path";
import { builtinModules as nodeBuiltins } from "module";
import * as esbuild from "esbuild";
import debounce from "lodash.debounce";
import chokidar from "chokidar";

import { BuildMode, BuildTarget } from "./build";
import type { RemixConfig } from "./config";
import { readConfig } from "./config";
import invariant from "./invariant";
import { warnOnce } from "./warnings";
import { createAssetsManifest } from "./compiler2/assets";
import { getAppDependencies } from "./compiler2/dependencies";
import { loaders, getLoaderForFile } from "./compiler2/loaders";
import { getRouteExportsCached } from "./compiler2/routes";
import { writeFileSafe } from "./compiler2/utils/fs";

// When we build Remix, this shim file is copied directly into the output
// directory in the same place relative to this file. It is eventually injected
// as a source file when building the app.
const reactShim = path.resolve(__dirname, "compiler2/shims/react.ts");

interface BuildConfig {
  mode: BuildMode;
  target: BuildTarget;
}

function defaultWarningHandler(message: string, key: string) {
  warnOnce(false, message, key);
}

function defaultErrorHandler(message: string) {
  console.error(message);
}

interface BuildOptions extends Partial<BuildConfig> {
  onWarning?(message: string, key: string): void;
  onError?(message: string): void;
}

export async function build(
  config: RemixConfig,
  {
    mode = BuildMode.Production,
    target = BuildTarget.Node14,
    onWarning = defaultWarningHandler,
    onError = defaultErrorHandler
  }: BuildOptions = {}
): Promise<void> {
  await buildEverything(config, { mode, target, onWarning, onError });
}

interface WatchOptions extends BuildOptions {
  onRebuildStart?(): void;
  onRebuildFinish?(): void;
  onFileCreated?(file: string): void;
  onFileChanged?(file: string): void;
  onFileDeleted?(file: string): void;
}

export async function watch(
  config: RemixConfig,
  {
    mode = BuildMode.Development,
    target = BuildTarget.Node14,
    onWarning = defaultWarningHandler,
    onError = defaultErrorHandler,
    onRebuildStart,
    onRebuildFinish,
    onFileCreated,
    onFileChanged,
    onFileDeleted
  }: WatchOptions = {}
): Promise<() => void> {
  let options = { mode, target, onWarning, onError, incremental: true };
  let [browserBuild, serverBuild] = await buildEverything(config, options);

  async function disposeBuilders() {
    await Promise.all([
      browserBuild.rebuild?.dispose(),
      serverBuild.rebuild?.dispose()
    ]);
  }

  let restartBuilders = debounce(async (newConfig?: RemixConfig) => {
    await disposeBuilders();
    config = newConfig || (await readConfig(config.rootDirectory));
    if (onRebuildStart) onRebuildStart();
    let builders = await buildEverything(config, options);
    if (onRebuildFinish) onRebuildFinish();
    browserBuild = builders[0];
    serverBuild = builders[1];
  }, 500);

  let rebuildEverything = debounce(async () => {
    if (onRebuildStart) onRebuildStart();
    await Promise.all([
      browserBuild.rebuild!().then(build =>
        generateManifests(config, build.metafile!)
      ),
      serverBuild.rebuild!()
    ]);
    if (onRebuildFinish) onRebuildFinish();
  }, 100);

  let watcher = chokidar
    .watch(config.appDirectory, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 100
      }
    })
    .on("error", error => console.error(error))
    .on("change", async file => {
      if (onFileChanged) onFileChanged(file);
      await rebuildEverything();
    })
    .on("add", async file => {
      if (onFileCreated) onFileCreated(file);
      let newConfig = await readConfig(config.rootDirectory);
      if (isEntryPoint(newConfig, file)) {
        await restartBuilders(newConfig);
      } else {
        await rebuildEverything();
      }
    })
    .on("unlink", async file => {
      if (onFileDeleted) onFileDeleted(file);
      if (isEntryPoint(config, file)) {
        await restartBuilders();
      } else {
        await rebuildEverything();
      }
    });

  return async () => {
    await watcher.close();
    await disposeBuilders();
  };
}

function isEntryPoint(config: RemixConfig, file: string) {
  let appFile = path.relative(config.appDirectory, file);

  if (
    appFile === config.entryClientFile ||
    appFile === config.entryServerFile
  ) {
    return true;
  }
  for (let key in config.routes) {
    if (appFile === config.routes[key].file) return true;
  }

  return false;
}

///////////////////////////////////////////////////////////////////////////////

async function buildEverything(
  config: RemixConfig,
  options: Required<BuildOptions> & { incremental?: boolean }
): Promise<esbuild.BuildResult[]> {
  // TODO:
  // When building for node, we build both the browser and server builds in
  // parallel and emit the asset manifest as a separate file in the output
  // directory.
  // When building for Cloudflare Workers, we need to run the browser and server
  // builds serially so we can inline the asset manifest into the server build
  // in a single JavaScript file.

  let browserBuildPromise = createBrowserBuild(config, options);
  let serverBuildPromise = createServerBuild(config, options);

  return Promise.all([
    browserBuildPromise.then(async build => {
      await generateManifests(config, build.metafile!);
      return build;
    }),
    serverBuildPromise
  ]);
}

async function createBrowserBuild(
  config: RemixConfig,
  options: BuildOptions & { incremental?: boolean }
): Promise<esbuild.BuildResult> {
  // For the browser build, exclude node built-ins that don't have a
  // browser-safe alternative installed in node_modules. Nothing should
  // *actually* be external in the browser build (we want to bundle all deps) so
  // this is really just making sure we don't accidentally have any dependencies
  // on node built-ins in browser bundles.
  let dependencies = Object.keys(await getAppDependencies(config));
  let externals = nodeBuiltins.filter(mod => !dependencies.includes(mod));

  let entryPoints: esbuild.BuildOptions["entryPoints"] = {
    "entry.client": path.resolve(config.appDirectory, config.entryClientFile)
  };
  for (let id of Object.keys(config.routes)) {
    // All route entry points are virtual modules that will be loaded by the
    // browserEntryPointsPlugin. This allows us to tree-shake server-only code
    // that we don't want to run in the browser (i.e. action & loader).
    entryPoints[id] =
      path.resolve(config.appDirectory, config.routes[id].file) + "?browser";
  }

  return esbuild.build({
    entryPoints,
    outdir: config.assetsBuildDirectory,
    format: "esm",
    external: externals,
    inject: [reactShim],
    loader: loaders,
    bundle: true,
    splitting: true,
    metafile: true,
    incremental: options.incremental,
    minify: options.mode === BuildMode.Production,
    entryNames: "[dir]/[name]-[hash]",
    chunkNames: "_shared/[name]-[hash]",
    assetNames: "_assets/[name]-[hash]",
    publicPath: config.publicPath,
    define: {
      "process.env.NODE_ENV": JSON.stringify(options.mode)
    },
    plugins: [
      emptyRouteModulesPlugin(config),
      browserRouteModulesPlugin(config, /\?browser$/),
      manualExternalsPlugin((id, importer) => {
        let resolved = path.resolve(importer, id);

        if (
          resolved.startsWith(config.appDirectory) &&
          /\.server(\.[jt]sx?)?$/.test(resolved)
        ) {
          // Mark .server.js modules external in the browser build. These should
          // be tree-shaken from the browser bundles anyway, but making them
          // "external" tells esbuild to not even try to parse them. This is an
          // escape hatch for users that lets them avoid esbuild errors/warnings
          // from node-specific modules not intended for the browser.
          return true;
        }

        return false;
      })
    ]
  });
}

async function createServerBuild(
  config: RemixConfig,
  options: Required<BuildOptions> & { incremental?: boolean }
): Promise<esbuild.BuildResult> {
  let dependencies = Object.keys(await getAppDependencies(config));

  return esbuild.build({
    stdin: {
      contents: getServerEntryPointModule(config, options),
      resolveDir: config.serverBuildDirectory
    },
    outfile: path.resolve(config.serverBuildDirectory, "index.js"),
    format: "cjs",
    platform: "node",
    target: options.target,
    inject: [reactShim],
    loader: loaders,
    bundle: true,
    incremental: options.incremental,
    // The server build needs to know how to generate asset URLs for imports
    // of CSS and other files.
    assetNames: "_assets/[name]-[hash]",
    publicPath: config.publicPath,
    plugins: [
      emptyRouteModulesPlugin(config),
      manualExternalsPlugin((id, importer) => {
        // assets.json is external because this build runs in parallel with the
        // browser build and it's not there yet.
        if (id === "./assets.json" && importer === "<stdin>") return true;

        // We need to bundle @remix-run/react because it is ESM and we can't
        // require it from the CommonJS output.
        if (id === "@remix-run/react") return false;

        // Mark all bare imports as external. They will be require()'d at
        // runtime from node_modules.
        if (isBareModuleId(id)) {
          let packageName = getNpmPackageName(id);
          if (
            !/\bnode_modules\b/.test(importer) &&
            !nodeBuiltins.includes(packageName) &&
            !dependencies.includes(packageName)
          ) {
            options.onWarning(
              `The path "${id}" is imported in ` +
                `${path.relative(process.cwd(), importer)} but ` +
                `${packageName} is not listed in your package.json dependencies. ` +
                `Did you forget to install it?`,
              packageName
            );
          }
          return true;
        }

        return false;
      })
    ]
  });
}

function isBareModuleId(id: string): boolean {
  return !id.startsWith(".") && !path.isAbsolute(id);
}

function getNpmPackageName(id: string): string {
  let split = id.split("/");
  let packageName = split[0];
  if (packageName.startsWith("@")) packageName += `/${split[1]}`;
  return packageName;
}

async function generateManifests(
  config: RemixConfig,
  metafile: esbuild.Metafile
): Promise<string[]> {
  let assetsManifest = await createAssetsManifest(config, metafile);

  let filename = `manifest-${assetsManifest.version.toUpperCase()}.js`;
  assetsManifest.url = config.publicPath + filename;

  return Promise.all([
    writeFileSafe(
      path.join(config.assetsBuildDirectory, filename),
      `window.__remixManifest=${JSON.stringify(assetsManifest)}`
    ),
    writeFileSafe(
      path.join(config.serverBuildDirectory, "assets.json"),
      JSON.stringify(assetsManifest, null, 2)
    )
  ]);
}

type Route = RemixConfig["routes"][string];

const browserSafeRouteExports: { [name: string]: boolean } = {
  ErrorBoundary: true,
  default: true,
  handle: true,
  links: true,
  meta: true
};

/**
 * This plugin loads route modules for the browser build, using module shims
 * that export only thing that are safe for the browser.
 */
function browserRouteModulesPlugin(
  config: RemixConfig,
  suffixMatcher: RegExp
): esbuild.Plugin {
  return {
    name: "browser-route-modules",
    async setup(build) {
      let routesByFile: Map<string, Route> = Object.keys(config.routes).reduce(
        (map, key) => {
          let route = config.routes[key];
          map.set(path.resolve(config.appDirectory, route.file), route);
          return map;
        },
        new Map()
      );

      build.onResolve({ filter: suffixMatcher }, args => {
        return { path: args.path, namespace: "browser-route-module" };
      });

      build.onLoad(
        { filter: suffixMatcher, namespace: "browser-route-module" },
        async args => {
          let file = args.path.replace(suffixMatcher, "");
          let route = routesByFile.get(file);
          invariant(route, `Cannot get route by path: ${args.path}`);

          let exports = (await getRouteExportsCached(config, route.id)).filter(
            ex => !!browserSafeRouteExports[ex]
          );
          let spec = exports.length > 0 ? `{ ${exports.join(", ")} }` : "*";
          let contents = `export ${spec} from ${JSON.stringify(file)};`;

          return {
            contents,
            resolveDir: path.dirname(file),
            loader: "js"
          };
        }
      );
    }
  };
}

/**
 * This plugin interprets empty route modules as `export {}` so they are
 * not loaded as CommonJS (with `{ default: {} }`) by esbuild.
 * See https://github.com/evanw/esbuild/issues/1043
 */
function emptyRouteModulesPlugin(config: RemixConfig): esbuild.Plugin {
  return {
    name: "empty-route-modules",
    setup(build) {
      let routeFiles = new Set(
        Object.keys(config.routes).map(key =>
          path.resolve(config.appDirectory, config.routes[key].file)
        )
      );

      build.onResolve({ filter: /.*/ }, args => {
        if (routeFiles.has(args.path)) {
          return { path: args.path, namespace: "route-module" };
        }
      });

      build.onLoad({ filter: /.*/, namespace: "route-module" }, async args => {
        let file = args.path;
        let contents = await fsp.readFile(file, "utf-8");

        // Default to `export {}` if the file is empty so esbuild interprets
        // this file as ESM instead of CommonJS.
        if (!/\S/.test(contents)) {
          return { contents: "export {}", loader: "js" };
        }

        return {
          contents,
          resolveDir: path.dirname(file),
          loader: getLoaderForFile(file)
        };
      });
    }
  };
}

/**
 * This plugin marks paths external using a callback function.
 */
function manualExternalsPlugin(
  isExternal: (id: string, importer: string) => boolean
): esbuild.Plugin {
  return {
    name: "manual-externals",
    setup(build) {
      build.onResolve({ filter: /.*/ }, args => {
        if (isExternal(args.path, args.importer)) {
          return { path: args.path, external: true };
        }
      });
    }
  };
}

function getServerEntryPointModule(
  config: RemixConfig,
  options: BuildOptions
): string {
  switch (options.target) {
    case BuildTarget.Node14:
      return `
import * as entryServer from ${JSON.stringify(
        path.resolve(config.appDirectory, config.entryServerFile)
      )};
${Object.keys(config.routes)
  .map((key, index) => {
    let route = config.routes[key];
    return `import * as route${index} from ${JSON.stringify(
      path.resolve(config.appDirectory, route.file)
    )};`;
  })
  .join("\n")}
export { default as assets } from "./assets.json";
export const entry = { module: entryServer };
export const routes = {
  ${Object.keys(config.routes)
    .map((key, index) => {
      let route = config.routes[key];
      return `${JSON.stringify(key)}: {
    id: ${JSON.stringify(route.id)},
    parentId: ${JSON.stringify(route.parentId)},
    path: ${JSON.stringify(route.path)},
    caseSensitive: ${JSON.stringify(route.caseSensitive)},
    module: route${index}
  }`;
    })
    .join(",\n  ")}
};`;
    default:
      throw new Error(
        `Cannot generate server entry point module for target: ${options.target}`
      );
  }
}
