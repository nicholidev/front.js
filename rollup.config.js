import path from "path";
import babel from "@rollup/plugin-babel";
import nodeResolve from "@rollup/plugin-node-resolve";
import copy from "rollup-plugin-copy";
import fse from "fs-extra";
import fs from "fs";

const executableBanner = "#!/usr/bin/env node\n";

let activeOutputDir = "build";

if (process.env.REMIX_LOCAL_DEV_OUTPUT_DIRECTORY) {
  let appDir = path.join(
    process.cwd(),
    process.env.REMIX_LOCAL_DEV_OUTPUT_DIRECTORY
  );
  try {
    fse.readdirSync(path.join(appDir, "node_modules"));
  } catch (e) {
    console.error(
      "Oops! You pointed REMIX_LOCAL_DEV_OUTPUT_DIRECTORY to a directory that " +
        "does not have a node_modules/ folder. Please `npm install` in that " +
        "directory and try again."
    );
    process.exit(1);
  }
  console.log("Writing rollup output to", appDir);
  activeOutputDir = appDir;
}

function getOutputDir(pkg) {
  return path.join(activeOutputDir, "node_modules", pkg);
}

function createBanner(packageName, version) {
  return `/**
 * ${packageName} v${version}
 *
 * Copyright (c) Remix Software Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.md file in the root directory of this source tree.
 *
 * @license MIT
 */`;
}

function getVersion(packageDir) {
  return require(`./${packageDir}/package.json`).version;
}

function isBareModuleId(id) {
  return !id.startsWith(".") && !path.isAbsolute(id);
}

/** @returns {import("rollup").RollupOptions[]} */
function createRemix() {
  let sourceDir = "packages/create-remix";
  let outputDir = getOutputDir("create-remix");
  let version = getVersion(sourceDir);

  return [
    {
      external() {
        return true;
      },
      input: `${sourceDir}/cli.ts`,
      output: {
        format: "cjs",
        dir: outputDir,
        banner: executableBanner + createBanner("create-remix", version),
      },
      plugins: [
        babel({
          babelHelpers: "bundled",
          exclude: /node_modules/,
          extensions: [".ts"],
        }),
        nodeResolve({ extensions: [".ts"] }),
        copy({
          targets: [
            { src: `LICENSE.md`, dest: outputDir },
            { src: `${sourceDir}/package.json`, dest: outputDir },
            { src: `${sourceDir}/README.md`, dest: outputDir },
          ],
        }),
        copyToPlaygrounds(),
      ],
    },
  ];
}

/** @returns {import("rollup").RollupOptions[]} */
function remix() {
  let sourceDir = "packages/remix";
  let outputDir = getOutputDir("remix");
  let version = getVersion(sourceDir);

  return [
    {
      external() {
        return true;
      },
      input: `${sourceDir}/index.ts`,
      output: {
        format: "cjs",
        dir: outputDir,
        banner: createBanner("remix", version),
      },
      plugins: [
        babel({
          babelHelpers: "bundled",
          exclude: /node_modules/,
          extensions: [".ts"],
        }),
        copy({
          targets: [
            { src: `LICENSE.md`, dest: outputDir },
            { src: `${sourceDir}/package.json`, dest: outputDir },
            { src: `${sourceDir}/README.md`, dest: outputDir },
          ],
        }),
        copyToPlaygrounds(),
      ],
    },
    {
      external() {
        return true;
      },
      input: `${sourceDir}/index.ts`,
      output: {
        banner: createBanner("remix", version),
        dir: `${outputDir}/esm`,
        format: "esm",
      },
      plugins: [
        babel({
          babelHelpers: "bundled",
          exclude: /node_modules/,
          extensions: [".ts"],
        }),
        copyToPlaygrounds(),
      ],
    },
  ];
}

/** @returns {import("rollup").RollupOptions[]} */
function remixDev() {
  let sourceDir = "packages/remix-dev";
  let outputDir = getOutputDir("@remix-run/dev");
  let version = getVersion(sourceDir);

  return [
    {
      external(id, parent) {
        if (
          id === "../package.json" &&
          parent === path.resolve(__dirname, "packages/remix-dev/cli/create.ts")
        ) {
          return true;
        }

        return isBareModuleId(id);
      },
      input: `${sourceDir}/index.ts`,
      output: {
        banner: createBanner("@remix-run/dev", version),
        dir: outputDir,
        format: "cjs",
        preserveModules: true,
        exports: "named",
      },
      plugins: [
        babel({
          babelHelpers: "bundled",
          exclude: /node_modules/,
          extensions: [".ts"],
        }),
        nodeResolve({ extensions: [".ts"] }),
        copy({
          targets: [
            { src: `LICENSE.md`, dest: outputDir },
            { src: `${sourceDir}/package.json`, dest: outputDir },
            { src: `${sourceDir}/README.md`, dest: outputDir },
            {
              src: `${sourceDir}/compiler/shims`,
              dest: `${outputDir}/compiler`,
            },
          ],
        }),
        // Allow dynamic imports in CJS code to allow us to utilize
        // ESM modules as part of the compiler.
        {
          name: "dynamic-import-polyfill",
          renderDynamicImport() {
            return {
              left: "import(",
              right: ")",
            };
          },
        },
        copyToPlaygrounds(),
      ],
    },
    {
      external() {
        return true;
      },
      input: `${sourceDir}/cli.ts`,
      output: {
        banner: executableBanner + createBanner("@remix-run/dev", version),
        dir: outputDir,
        format: "cjs",
      },
      plugins: [
        babel({
          babelHelpers: "bundled",
          exclude: /node_modules/,
          extensions: [".ts"],
        }),
        nodeResolve({ extensions: [".ts"] }),
        copyToPlaygrounds(),
      ],
    },
    {
      external: (id) => isBareModuleId(id),
      input: [`${sourceDir}/cli/migrate/migrations/transforms.ts`],
      output: {
        banner: createBanner("@remix-run/dev", version),
        dir: `${outputDir}/cli/migrate/migrations`,
        exports: "named",
        format: "cjs",
        preserveModules: true,
      },
      plugins: [
        babel({
          babelHelpers: "bundled",
          exclude: /node_modules/,
          extensions: [".ts"],
        }),
        nodeResolve({ extensions: [".ts"] }),
        copyToPlaygrounds(),
      ],
    },
    {
      external() {
        return true;
      },
      input: `${sourceDir}/server-build.ts`,
      output: {
        banner: executableBanner + createBanner("@remix-run/dev", version),
        dir: outputDir,
        format: "cjs",
      },
      plugins: [
        babel({
          babelHelpers: "bundled",
          exclude: /node_modules/,
          extensions: [".ts"],
        }),
        nodeResolve({ extensions: [".ts"] }),
        copyToPlaygrounds(),
      ],
    },
  ];
}

/** @returns {import("rollup").RollupOptions[]} */
function remixServerRuntime() {
  let sourceDir = "packages/remix-server-runtime";
  let outputDir = getOutputDir("@remix-run/server-runtime");
  let version = getVersion(sourceDir);

  return [
    {
      external(id) {
        return isBareModuleId(id);
      },
      input: `${sourceDir}/index.ts`,
      output: {
        banner: createBanner("@remix-run/server-runtime", version),
        dir: outputDir,
        format: "cjs",
        preserveModules: true,
        exports: "named",
      },
      plugins: [
        babel({
          babelHelpers: "bundled",
          exclude: /node_modules/,
          extensions: [".ts", ".tsx"],
        }),
        nodeResolve({ extensions: [".ts", ".tsx"] }),
        copy({
          targets: [
            { src: `LICENSE.md`, dest: outputDir },
            { src: `${sourceDir}/package.json`, dest: outputDir },
            { src: `${sourceDir}/README.md`, dest: outputDir },
          ],
        }),
        copyToPlaygrounds(),
      ],
    },
    {
      external(id) {
        return isBareModuleId(id);
      },
      input: `${sourceDir}/index.ts`,
      output: {
        banner: createBanner("@remix-run/server-runtime", version),
        dir: `${outputDir}/esm`,
        format: "esm",
        preserveModules: true,
      },
      plugins: [
        babel({
          babelHelpers: "bundled",
          exclude: /node_modules/,
          extensions: [".ts", ".tsx"],
        }),
        nodeResolve({ extensions: [".ts", ".tsx"] }),
        copyToPlaygrounds(),
      ],
    },
    {
      external() {
        return true;
      },
      input: `${sourceDir}/magicExports/remix.ts`,
      output: {
        banner: createBanner("@remix-run/server-runtime", version),
        dir: `${outputDir}/magicExports`,
        format: "cjs",
      },
      plugins: [
        babel({
          babelHelpers: "bundled",
          exclude: /node_modules/,
          extensions: [".ts", ".tsx"],
        }),
        copyToPlaygrounds(),
      ],
    },
    {
      external() {
        return true;
      },
      input: `${sourceDir}/magicExports/remix.ts`,
      output: {
        banner: createBanner("@remix-run/server-runtime", version),
        dir: `${outputDir}/magicExports/esm`,
        format: "esm",
      },
      plugins: [
        babel({
          babelHelpers: "bundled",
          exclude: /node_modules/,
          extensions: [".ts", ".tsx"],
        }),
        copyToPlaygrounds(),
      ],
    },
  ];
}

/** @returns {import("rollup").RollupOptions[]} */
function remixNode() {
  let sourceDir = "packages/remix-node";
  let outputDir = getOutputDir("@remix-run/node");
  let version = getVersion(sourceDir);

  return [
    {
      external(id) {
        return isBareModuleId(id);
      },
      input: `${sourceDir}/index.ts`,
      output: {
        banner: createBanner("@remix-run/node", version),
        dir: outputDir,
        format: "cjs",
        preserveModules: true,
        exports: "named",
      },
      plugins: [
        babel({
          babelHelpers: "bundled",
          exclude: /node_modules/,
          extensions: [".ts", ".tsx"],
        }),
        nodeResolve({ extensions: [".ts", ".tsx"] }),
        copy({
          targets: [
            { src: `LICENSE.md`, dest: outputDir },
            { src: `${sourceDir}/package.json`, dest: outputDir },
            { src: `${sourceDir}/README.md`, dest: outputDir },
          ],
        }),
        copyToPlaygrounds(),
      ],
    },
    {
      external() {
        return true;
      },
      input: `${sourceDir}/magicExports/remix.ts`,
      output: {
        banner: createBanner("@remix-run/node", version),
        dir: `${outputDir}/magicExports`,
        format: "cjs",
      },
      plugins: [
        babel({
          babelHelpers: "bundled",
          exclude: /node_modules/,
          extensions: [".ts", ".tsx"],
        }),
        copyToPlaygrounds(),
      ],
    },
    {
      external() {
        return true;
      },
      input: `${sourceDir}/magicExports/remix.ts`,
      output: {
        banner: createBanner("@remix-run/node", version),
        dir: `${outputDir}/magicExports/esm`,
        format: "esm",
      },
      plugins: [
        babel({
          babelHelpers: "bundled",
          exclude: /node_modules/,
          extensions: [".ts", ".tsx"],
        }),
        copyToPlaygrounds(),
      ],
    },
  ];
}

/** @returns {import("rollup").RollupOptions[]} */
function remixCloudflare() {
  let sourceDir = "packages/remix-cloudflare";
  let outputDir = getOutputDir("@remix-run/cloudflare");
  let version = getVersion(sourceDir);

  return [
    {
      external(id) {
        return isBareModuleId(id);
      },
      input: `${sourceDir}/index.ts`,
      output: {
        banner: createBanner("@remix-run/cloudflare", version),
        dir: outputDir,
        format: "cjs",
        preserveModules: true,
        exports: "named",
      },
      plugins: [
        babel({
          babelHelpers: "bundled",
          exclude: /node_modules/,
          extensions: [".ts", ".tsx"],
        }),
        nodeResolve({ extensions: [".ts", ".tsx"] }),
        copy({
          targets: [
            { src: `LICENSE.md`, dest: outputDir },
            { src: `${sourceDir}/package.json`, dest: outputDir },
            { src: `${sourceDir}/README.md`, dest: outputDir },
          ],
        }),
        copyToPlaygrounds(),
      ],
    },
    {
      external() {
        return true;
      },
      input: `${sourceDir}/magicExports/remix.ts`,
      output: {
        banner: createBanner("@remix-run/cloudflare", version),
        dir: `${outputDir}/magicExports/esm`,
        format: "esm",
      },
      plugins: [
        babel({
          babelHelpers: "bundled",
          exclude: /node_modules/,
          extensions: [".ts", ".tsx"],
        }),
        copyToPlaygrounds(),
      ],
    },
    {
      external() {
        return true;
      },
      input: `${sourceDir}/magicExports/remix.ts`,
      output: {
        banner: createBanner("@remix-run/cloudflare", version),
        dir: `${outputDir}/magicExports`,
        format: "cjs",
      },
      plugins: [
        babel({
          babelHelpers: "bundled",
          exclude: /node_modules/,
          extensions: [".ts", ".tsx"],
        }),
        copyToPlaygrounds(),
      ],
    },
  ];
}

/** @returns {import("rollup").RollupOptions[]} */
function remixDeno() {
  let sourceDir = "packages/remix-deno";
  let outputDir = getOutputDir("@remix-run/deno");

  return [
    {
      input: `${sourceDir}/.empty.js`,
      plugins: [
        copy({
          targets: [
            { src: `LICENSE.md`, dest: outputDir },
            { src: `${sourceDir}/**/*`, dest: outputDir },
          ],
          gitignore: true,
        }),
        copyToPlaygrounds(),
      ],
    },
  ];
}

/** @returns {import("rollup").RollupOptions[]} */
function remixCloudflareWorkers() {
  let sourceDir = "packages/remix-cloudflare-workers";
  let outputDir = getOutputDir("@remix-run/cloudflare-workers");
  let version = getVersion(sourceDir);

  return [
    {
      external(id) {
        return isBareModuleId(id);
      },
      input: `${sourceDir}/index.ts`,
      output: {
        banner: createBanner("@remix-run/cloudflare-workers", version),
        dir: `${outputDir}/esm`,
        format: "esm",
        preserveModules: true,
      },
      plugins: [
        babel({
          babelHelpers: "bundled",
          exclude: /node_modules/,
          extensions: [".ts", ".tsx"],
        }),
        nodeResolve({ extensions: [".ts", ".tsx"] }),
        copyToPlaygrounds(),
      ],
    },
  ];
}

/** @returns {import("rollup").RollupOptions[]} */
function remixCloudflarePages() {
  let sourceDir = "packages/remix-cloudflare-pages";
  let outputDir = getOutputDir("@remix-run/cloudflare-pages");
  let version = getVersion(sourceDir);

  return [
    {
      external(id) {
        return isBareModuleId(id);
      },
      input: `${sourceDir}/index.ts`,
      output: {
        banner: createBanner("@remix-run/cloudflare-pages", version),
        dir: `${outputDir}/esm`,
        format: "esm",
        preserveModules: true,
      },
      plugins: [
        babel({
          babelHelpers: "bundled",
          exclude: /node_modules/,
          extensions: [".ts", ".tsx"],
        }),
        nodeResolve({ extensions: [".ts", ".tsx"] }),
        copyToPlaygrounds(),
      ],
    },
  ];
}

/** @returns {import("rollup").RollupOptions[]} */
function getAdapterConfig(adapterName) {
  let packageName = `@remix-run/${adapterName}`;
  let sourceDir = `packages/remix-${adapterName}`;
  let outputDir = getOutputDir(packageName);
  let version = getVersion(sourceDir);

  let hasMagicExports = fse.existsSync(`${sourceDir}/magicExports/remix.ts`);

  return [
    {
      external(id) {
        return isBareModuleId(id);
      },
      input: `${sourceDir}/index.ts`,
      output: {
        banner: createBanner(packageName, version),
        dir: outputDir,
        format: "cjs",
        preserveModules: true,
        exports: "auto",
      },
      plugins: [
        babel({
          babelHelpers: "bundled",
          exclude: /node_modules/,
          extensions: [".ts", ".tsx"],
        }),
        nodeResolve({ extensions: [".ts", ".tsx"] }),
        copy({
          targets: [
            { src: `LICENSE.md`, dest: outputDir },
            { src: `${sourceDir}/package.json`, dest: outputDir },
            { src: `${sourceDir}/README.md`, dest: outputDir },
          ],
        }),
        copyToPlaygrounds(),
      ],
    },
    ...(hasMagicExports
      ? [
          {
            external() {
              return true;
            },
            input: `${sourceDir}/magicExports/remix.ts`,
            output: {
              banner: createBanner(packageName, version),
              dir: `${outputDir}/magicExports`,
              format: "cjs",
            },
            plugins: [
              babel({
                babelHelpers: "bundled",
                exclude: /node_modules/,
                extensions: [".ts", ".tsx"],
              }),
              copyToPlaygrounds(),
            ],
          },
          {
            external() {
              return true;
            },
            input: `${sourceDir}/magicExports/remix.ts`,
            output: {
              banner: createBanner(packageName, version),
              dir: `${outputDir}/magicExports/esm`,
              format: "esm",
            },
            plugins: [
              babel({
                babelHelpers: "bundled",
                exclude: /node_modules/,
                extensions: [".ts", ".tsx"],
              }),
              copyToPlaygrounds(),
            ],
          },
        ]
      : []),
  ];
}

/** @returns {import("rollup").RollupOptions[]} */
function remixServerAdapters() {
  return [
    ...getAdapterConfig("architect"),
    ...getAdapterConfig("cloudflare-pages"),
    ...getAdapterConfig("cloudflare-workers"),
    ...getAdapterConfig("express"),
    ...getAdapterConfig("netlify"),
    ...getAdapterConfig("vercel"),
  ];
}

/** @returns {import("rollup").RollupOptions[]} */
function remixReact() {
  let sourceDir = "packages/remix-react";
  let outputDir = getOutputDir("@remix-run/react");
  let version = getVersion(sourceDir);

  // This CommonJS build of remix-react is for node; both for use in running our
  // server and for 3rd party tools that work with node.
  /** @type {import("rollup").RollupOptions} */
  let remixReactCJS = {
    external(id) {
      return isBareModuleId(id);
    },
    input: `${sourceDir}/index.tsx`,
    output: {
      banner: createBanner("@remix-run/react", version),
      dir: outputDir,
      format: "cjs",
      preserveModules: true,
      exports: "auto",
    },
    plugins: [
      babel({
        babelHelpers: "bundled",
        exclude: /node_modules/,
        extensions: [".ts", ".tsx"],
      }),
      nodeResolve({ extensions: [".ts", ".tsx"] }),
      copy({
        targets: [
          { src: `LICENSE.md`, dest: outputDir },
          { src: `${sourceDir}/package.json`, dest: outputDir },
          { src: `${sourceDir}/README.md`, dest: outputDir },
        ],
      }),
      copyToPlaygrounds(),
    ],
  };

  // The browser build of remix-react is ESM so we can treeshake it.
  /** @type {import("rollup").RollupOptions} */
  let remixReactESM = {
    external(id) {
      return isBareModuleId(id);
    },
    input: `${sourceDir}/index.tsx`,
    output: {
      banner: createBanner("@remix-run/react", version),
      dir: `${outputDir}/esm`,
      format: "esm",
      preserveModules: true,
    },
    plugins: [
      babel({
        babelHelpers: "bundled",
        exclude: /node_modules/,
        extensions: [".ts", ".tsx"],
      }),
      nodeResolve({ extensions: [".ts", ".tsx"] }),
      copyToPlaygrounds(),
    ],
  };

  /** @type {import("rollup").RollupOptions[]} */
  let remixReactMagicExportsCJS = {
    external() {
      return true;
    },
    input: `${sourceDir}/magicExports/remix.ts`,
    output: {
      banner: createBanner("@remix-run/react", version),
      dir: `${outputDir}/magicExports`,
      format: "cjs",
    },
    plugins: [
      babel({
        babelHelpers: "bundled",
        exclude: /node_modules/,
        extensions: [".ts", ".tsx"],
      }),
      copyToPlaygrounds(),
    ],
  };

  /** @type {import("rollup").RollupOptions[]} */
  let remixReactMagicExportsESM = {
    external() {
      return true;
    },
    input: `${sourceDir}/magicExports/remix.ts`,
    output: {
      banner: createBanner("@remix-run/react", version),
      dir: `${outputDir}/magicExports/esm`,
      format: "esm",
    },
    plugins: [
      babel({
        babelHelpers: "bundled",
        exclude: /node_modules/,
        extensions: [".ts", ".tsx"],
      }),
      copyToPlaygrounds(),
    ],
  };

  return [
    remixReactCJS,
    remixReactESM,
    remixReactMagicExportsCJS,
    remixReactMagicExportsESM,
  ];
}

/** @returns {import("rollup").RollupOptions[]} */
function remixServe() {
  let sourceDir = "packages/remix-serve";
  let outputDir = getOutputDir("@remix-run/serve");
  let version = getVersion(sourceDir);

  return [
    {
      external(id) {
        return isBareModuleId(id);
      },
      input: [`${sourceDir}/index.ts`, `${sourceDir}/env.ts`],
      output: {
        banner: createBanner("@remix-run/serve", version),
        dir: outputDir,
        format: "cjs",
        preserveModules: true,
        exports: "auto",
      },
      plugins: [
        babel({
          babelHelpers: "bundled",
          exclude: /node_modules/,
          extensions: [".ts", ".tsx"],
        }),
        nodeResolve({ extensions: [".ts", ".tsx"] }),
        copy({
          targets: [
            { src: `LICENSE.md`, dest: outputDir },
            { src: `${sourceDir}/package.json`, dest: outputDir },
            { src: `${sourceDir}/README.md`, dest: outputDir },
          ],
        }),
        copyToPlaygrounds(),
      ],
    },
    {
      external() {
        return true;
      },
      input: `${sourceDir}/cli.ts`,
      output: {
        banner: executableBanner + createBanner("@remix-run/serve", version),
        dir: outputDir,
        format: "cjs",
      },
      plugins: [
        babel({
          babelHelpers: "bundled",
          exclude: /node_modules/,
          extensions: [".ts"],
        }),
        nodeResolve({ extensions: [".ts"] }),
        copyToPlaygrounds(),
      ],
    },
  ];
}

export default function rollup(options) {
  let builds = [
    ...createRemix(options),
    // Do not blow away destination app node_modules/remix directory which is
    // correct for that deploy target setup
    ...(activeOutputDir === "build" ? remix(options) : []),
    ...remixDev(options),
    ...remixServerRuntime(options),
    ...remixNode(options),
    ...remixCloudflare(options),
    ...remixDeno(options),
    ...remixCloudflarePages(options),
    ...remixCloudflareWorkers(options),
    ...remixServerAdapters(options),
    ...remixReact(options),
    ...remixServe(options),
  ];

  return builds;
}

async function triggerLiveReload(appDir) {
  // Tickle live reload by touching the server entry
  // Consider all of entry.server.{tsx,ts,jsx,js} since React may be used
  // via `React.createElement` without the need for JSX.
  let serverEntryPaths = [
    "entry.server.ts",
    "entry.server.tsx",
    "entry.server.js",
    "entry.server.jsx",
  ];
  let serverEntryPath = serverEntryPaths
    .map((entryFile) => path.join(appDir, "app", entryFile))
    .find((entryPath) => fse.existsSync(entryPath));
  let date = new Date();
  await fs.promises.utimes(serverEntryPath, date, date);
}

function copyToPlaygrounds() {
  return {
    name: "copy-to-remix-playground",
    async writeBundle(options, bundle) {
      if (activeOutputDir === "build") {
        let playgroundsDir = path.join(__dirname, "playground");
        let playgrounds = await fs.promises.readdir(playgroundsDir);
        let writtenDir = path.join(__dirname, options.dir);
        for (let playground of playgrounds) {
          let playgroundDir = path.join(playgroundsDir, playground);
          if (!fse.statSync(playgroundDir).isDirectory()) {
            continue;
          }
          let destDir = writtenDir.replace(
            path.join(__dirname, "build"),
            playgroundDir
          );
          await fse.copy(writtenDir, destDir);
          await triggerLiveReload(playgroundDir);
        }
      } else {
        // If we're not building to "build" then trigger live reload on our
        // external "playground" app
        await triggerLiveReload(activeOutputDir);
      }
    },
  };
}
