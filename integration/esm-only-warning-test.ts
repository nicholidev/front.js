import { test, expect } from "@playwright/test";
import { PassThrough } from "stream";

import { createFixtureProject, js, json } from "./helpers/create-fixture";

let buildOutput: string;

test.beforeAll(async () => {
  let buildStdio = new PassThrough();

  await createFixtureProject({
    buildStdio,
    files: {
      "package.json": json({
        name: "remix-integration-9v4bpv66vd",
        private: true,
        sideEffects: false,
        scripts: {
          build: "remix build",
          dev: "remix dev",
          start: "remix-serve build",
        },
        dependencies: {
          "@remix-run/node": "0.0.0-local-version",
          "@remix-run/react": "0.0.0-local-version",
          "@remix-run/serve": "0.0.0-local-version",
          react: "0.0.0-local-version",
          "react-dom": "0.0.0-local-version",
          "esm-only-no-exports": "0.0.0-local-version",
          "esm-only-exports": "0.0.0-local-version",
          "esm-only-sub-exports": "0.0.0-local-version",
          "esm-cjs-exports": "0.0.0-local-version",
        },
        devDependencies: {
          "@remix-run/dev": "0.0.0-local-version",
        },
      }),
      "app/routes/index.jsx": js`
        import { json } from "@remix-run/node";
        import { Link, useLoaderData } from "@remix-run/react";
        import a from "esm-only-no-exports";
        import b from "esm-only-exports";
        import c from "esm-only-sub-exports";
        import d from "esm-cjs-exports";

        export function loader() {
          return json({
            a: a(),
            b: b(),
            c: c(),
            d: d(),
          });
        }

        export default function Index() {
          let data = useLoaderData();
          return null;
        }
      `,
      "node_modules/esm-only-no-exports/package.json": json({
        name: "esm-only-no-exports",
        version: "1.0.0",
        type: "module",
        main: "index.js",
      }),
      "node_modules/esm-only-no-exports/index.js": js`
        export default () => "esm-only-no-exports";
      `,
      "node_modules/esm-only-exports/package.json": json({
        name: "esm-only-exports",
        version: "1.0.0",
        type: "module",
        main: "index.js",
        exports: {
          ".": "./index.js",
          "./package.json": "./package.json",
        },
      }),
      "node_modules/esm-only-exports/index.js": js`
        export default () => "esm-only-no-exports";
      `,
      "node_modules/esm-only-sub-exports/package.json": json({
        name: "esm-only-sub-exports",
        version: "1.0.0",
        type: "module",
        main: "index.js",
        exports: {
          ".": "./index.js",
          "./sub": "./sub.js",
          "./package.json": "./package.json",
        },
      }),
      "node_modules/esm-only-sub-exports/index.js": js`
        export default () => "esm-only-no-exports";
      `,
      "node_modules/esm-only-sub-exports/sub.js": js`
        export default () => "esm-only-no-exports/sub";
      `,
      "node_modules/esm-cjs-exports/package.json": json({
        name: "esm-cjs-exports",
        version: "1.0.0",
        type: "module",
        main: "index.js",
        exports: {
          ".": {
            require: "./index.cjs",
            default: "./index.js",
          },
          "./sub": {
            require: "./sub.cjs",
            default: "./sub.js",
          },
          "./package.json": "./package.json",
        },
      }),
      "node_modules/esm-cjs-exports/index.js": js`
        export default () => "esm-only-no-exports";
      `,
      "node_modules/esm-cjs-exports/index.cjs": js`
        module.exports = () => "esm-only-no-exports";
      `,
      "node_modules/esm-cjs-exports/sub.js": js`
        export default () => "esm-only-no-exports/sub";
      `,
      "node_modules/esm-cjs-exports/sub.cjs": js`
        module.exports = () => "esm-only-no-exports/sub";
      `,
    },
  });

  let chunks: Buffer[] = [];
  buildOutput = await new Promise<string>((resolve, reject) => {
    buildStdio.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    buildStdio.on("error", (err) => reject(err));
    buildStdio.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
});

test("logs warnings for ESM only packages", async () => {
  expect(buildOutput).toContain(
    "esm-only-no-exports is possibly an ESM only package"
  );
  expect(buildOutput).toContain(
    "esm-only-exports is possibly an ESM only package"
  );
  expect(buildOutput).toContain(
    "esm-only-sub-exports is possibly an ESM only package"
  );
  expect(buildOutput).not.toContain(
    "esm-cjs-exports is possibly an ESM only package"
  );
});
