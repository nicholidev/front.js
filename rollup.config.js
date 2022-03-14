import path from "path";
import babel from "@rollup/plugin-babel";
import nodeResolve from "@rollup/plugin-node-resolve";
import copy from "rollup-plugin-copy";
import fse from "fs-extra";

function isBareModuleId(id) {
  return !id.startsWith(".") && !path.isAbsolute(id);
}

let executableBanner = "#!/usr/bin/env node\n";

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

/** @returns {import("rollup").RollupOptions[]} */
function createRemix() {
  let sourceDir = "packages/create-remix";
  let outputDir = "build/node_modules/create-remix";
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
      ],
    },
  ];
}

/** @returns {import("rollup").RollupOptions[]} */
function remix() {
  let sourceDir = "packages/remix";
  let outputDir = "build/node_modules/remix";
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
      ],
    },
  ];
}

/** @returns {import("rollup").RollupOptions[]} */
function remixDev() {
  let sourceDir = "packages/remix-dev";
  let outputDir = "build/node_modules/@remix-run/dev";
  let version = getVersion(sourceDir);

  return [
    {
      external(id, parent) {
        if (
          id === "./package.json" &&
          parent === path.resolve(__dirname, "packages/remix-dev/create.ts")
        ) {
          return true;
        }

        return isBareModuleId(id);
      },
      input: [
        `${sourceDir}/cli/commands.ts`,
        `${sourceDir}/colors.ts`,
        `${sourceDir}/compiler.ts`,
        `${sourceDir}/config.ts`,
        `${sourceDir}/index.ts`,
      ],
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
      ],
    },
  ];
}

/** @returns {import("rollup").RollupOptions[]} */
function remixServerRuntime() {
  let sourceDir = "packages/remix-server-runtime";
  let outputDir = "build/node_modules/@remix-run/server-runtime";
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
      ],
    },
  ];
}

/** @returns {import("rollup").RollupOptions[]} */
function remixNode() {
  let sourceDir = "packages/remix-node";
  let outputDir = "build/node_modules/@remix-run/node";
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
      ],
    },
  ];
}

/** @returns {import("rollup").RollupOptions[]} */
function remixCloudflareWorkers() {
  let sourceDir = "packages/remix-cloudflare-workers";
  let outputDir = "build/node_modules/@remix-run/cloudflare-workers";
  let version = getVersion(sourceDir);

  return [
    {
      external() {
        return true;
      },
      input: `${sourceDir}/magicExports/remix.ts`,
      output: {
        banner: createBanner("@remix-run/cloudflare-workers", version),
        dir: `${outputDir}/magicExports`,
        format: "cjs",
      },
      plugins: [
        babel({
          babelHelpers: "bundled",
          exclude: /node_modules/,
          extensions: [".ts", ".tsx"],
        }),
      ],
    },
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
      ],
    },
    {
      external() {
        return true;
      },
      input: `${sourceDir}/magicExports/remix.ts`,
      output: {
        banner: createBanner("@remix-run/cloudflare-workers", version),
        dir: `${outputDir}/magicExports/esm`,
        format: "esm",
      },
      plugins: [
        babel({
          babelHelpers: "bundled",
          exclude: /node_modules/,
          extensions: [".ts", ".tsx"],
        }),
      ],
    },
  ];
}

/** @returns {import("rollup").RollupOptions[]} */
function remixCloudflarePages() {
  let sourceDir = "packages/remix-cloudflare-pages";
  let outputDir = "build/node_modules/@remix-run/cloudflare-pages";
  let version = getVersion(sourceDir);

  return [
    {
      external() {
        return true;
      },
      input: `${sourceDir}/magicExports/remix.ts`,
      output: {
        banner: createBanner("@remix-run/cloudflare-pages", version),
        dir: `${outputDir}/magicExports`,
        format: "cjs",
      },
      plugins: [
        babel({
          babelHelpers: "bundled",
          exclude: /node_modules/,
          extensions: [".ts", ".tsx"],
        }),
      ],
    },
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
      ],
    },
    {
      external() {
        return true;
      },
      input: `${sourceDir}/magicExports/remix.ts`,
      output: {
        banner: createBanner("@remix-run/cloudflare-pages", version),
        dir: `${outputDir}/magicExports/esm`,
        format: "esm",
      },
      plugins: [
        babel({
          babelHelpers: "bundled",
          exclude: /node_modules/,
          extensions: [".ts", ".tsx"],
        }),
      ],
    },
  ];
}

/** @returns {import("rollup").RollupOptions[]} */
function remixDeno() {
  let sourceDir = "packages/remix-deno";
  let outputDir = "build/node_modules/@remix-run/deno";
  let version = getVersion(sourceDir);

  return [
    {
      external(id) {
        return isBareModuleId(id);
      },
      input: `${sourceDir}/index.ts`,
      output: {
        banner: createBanner("@remix-run/deno", version),
        dir: outputDir,
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
        copy({
          targets: [
            { src: `LICENSE.md`, dest: outputDir },
            { src: `${sourceDir}/package.json`, dest: outputDir },
            { src: `${sourceDir}/README.md`, dest: outputDir },
          ],
        }),
      ],
    },
    {
      external() {
        return true;
      },
      input: `${sourceDir}/magicExports/remix.ts`,
      output: {
        banner: createBanner("@remix-run/deno", version),
        dir: `${outputDir}/magicExports/esm`,
        format: "esm",
      },
      plugins: [
        babel({
          babelHelpers: "bundled",
          exclude: /node_modules/,
          extensions: [".ts", ".tsx"],
        }),
      ],
    },
  ];
}

/** @returns {import("rollup").RollupOptions[]} */
function getAdapterConfig(adapterName) {
  let packageName = `@remix-run/${adapterName}`;
  let sourceDir = `packages/remix-${adapterName}`;
  let outputDir = `build/node_modules/${packageName}`;
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
  let outputDir = "build/node_modules/@remix-run/react";
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
  let outputDir = "build/node_modules/@remix-run/serve";
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
      ],
    },
  ];
}

export default function rollup(options) {
  let builds = [
    ...createRemix(options),
    ...remix(options),
    ...remixDev(options),
    ...remixDeno(options),
    ...remixServerRuntime(options),
    ...remixNode(options),
    ...remixCloudflarePages(options),
    ...remixCloudflareWorkers(options),
    ...remixServerAdapters(options),
    ...remixReact(options),
    ...remixServe(options),
  ];

  return builds;
}
