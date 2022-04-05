import fs from "fs/promises";
import path from "path";

import { createFixtureProject, js, json } from "./helpers/create-fixture";

describe("cloudflare compiler", () => {
  let projectDir: string;

  beforeAll(async () => {
    projectDir = await createFixtureProject({
      template: "cf-template",
      files: {
        "package.json": json`
          {
            "name": "remix-template-cloudflare-workers",
            "private": true,
            "sideEffects": false,
            "main": "build/index.js",
            "dependencies": {
              "@remix-run/cloudflare-workers": "0.0.0-local-version",
              "@remix-run/react": "0.0.0-local-version",
              "react": "0.0.0-local-version",
              "react-dom": "0.0.0-local-version",
              "worker-pkg": "0.0.0-local-version",
              "browser-pkg": "0.0.0-local-version",
              "esm-only-pkg": "0.0.0-local-version",
              "cjs-only-pkg": "0.0.0-local-version"
            },
            "devDependencies": {
              "@remix-run/dev": "0.0.0-local-version",
              "@remix-run/eslint-config": "0.0.0-local-version"
            }
          }
        `,
        "app/routes/index.jsx": js`
          import fake from "worker-pkg";
          import { content as browserPackage } from "browser-pkg";
          import { content as esmOnlyPackage } from "esm-only-pkg";
          import { content as cjsOnlyPackage } from "cjs-only-pkg";

          export default function Index() {
            return (
              <ul>
                <li>{fake}</li>
                <li>{browserPackage}</li>
                <li>{esmOnlyPackage}</li>
                <li>{cjsOnlyPackage}</li>
              </ul>
            )
          }
        `,
        "node_modules/worker-pkg/package.json": `{
          "name": "worker-pkg",
          "version": "1.0.0",
          "type": "module",
          "main": "./default.js",
          "exports": {
            "worker": "./worker.js",
            "default": "./default.js"
          }
        }`,
        "node_modules/worker-pkg/worker.js": js`
          export default "__WORKER_EXPORTS_SHOULD_BE_IN_BUNDLE__";
        `,
        "node_modules/worker-pkg/default.js": js`
          export default "__DEFAULT_EXPORTS_SHOULD_NOT_BE_IN_BUNDLE__";
        `,
        "node_modules/browser-pkg/package.json": `{
          "name": "browser-pkg",
          "version": "1.0.0",
          "main": "./node-cjs.js",
          "module": "./node-esm.mjs",
          "browser": {
              "./node-cjs.js": "./browser-cjs.js",
              "./node-esm.mjs": "./browser-esm.mjs"
          }
        }`,
        "node_modules/browser-pkg/browser-esm.mjs": js`
          export const content = "browser-pkg/browser-esm.mjs";
        `,
        "node_modules/browser-pkg/browser-cjs.js": js`
          module.exports = { content: "browser-pkg/browser-cjs.js" };
        `,
        "node_modules/browser-pkg/node-esm.mjs": js`
          export const content = "browser-pkg/node-esm.mjs";
        `,
        "node_modules/browser-pkg/node-cjs.js": js`
          module.exports = { content: "browser-pkg/node-cjs.js" };
        `,
        "node_modules/esm-only-pkg/package.json": `{
          "name": "esm-only-pkg",
          "version": "1.0.0",
          "type": "module",
          "main": "./node-esm.js",
          "browser": "./browser-esm.js"
        }`,
        "node_modules/esm-only-pkg/browser-esm.js": js`
          export const content = "esm-only-pkg/browser-esm.js";
        `,
        "node_modules/esm-only-pkg/node-esm.js": js`
          export const content = "esm-only-pkg/node-esm.js";
        `,
        "node_modules/cjs-only-pkg/package.json": `{
          "name": "cjs-only-pkg",
          "version": "1.0.0",
          "main": "./node-cjs.js",
          "browser": "./browser-cjs.js"
        }`,
        "node_modules/cjs-only-pkg/browser-cjs.js": js`
          module.exports = { content: "cjs-only-pkg/browser-cjs.js" };
        `,
        "node_modules/cjs-only-pkg/node-cjs.js": js`
          module.exports = { content: "cjs-only-pkg/node-cjs.js" };
        `,
      },
    });
  });

  it("bundles browser entry of 3rd party package correctly", async () => {
    let serverBundle = await fs.readFile(
      path.resolve(projectDir, "build/index.js"),
      "utf8"
    );

    expect(serverBundle).not.toMatch("browser-pkg/browser-esm.mjs");
    expect(serverBundle).not.toMatch("browser-pkg/browser-cjs.js");
    expect(serverBundle).toMatch("browser-pkg/node-esm.mjs");
    expect(serverBundle).not.toMatch("browser-pkg/node-cjs.js");

    expect(serverBundle).toMatch("esm-only-pkg/browser-esm.js");
    expect(serverBundle).not.toMatch("esm-only-pkg/node-esm.js");

    expect(serverBundle).toMatch("cjs-only-pkg/browser-cjs.js");
    expect(serverBundle).not.toMatch("cjs-only-pkg/node-cjs.js");
  });

  it("bundles worker export of 3rd party package", async () => {
    let serverBundle = await fs.readFile(
      path.resolve(projectDir, "build/index.js"),
      "utf8"
    );

    expect(serverBundle).toMatch("__WORKER_EXPORTS_SHOULD_BE_IN_BUNDLE__");
    expect(serverBundle).not.toMatch(
      "__DEFAULT_EXPORTS_SHOULD_NOT_BE_IN_BUNDLE__"
    );
  });
});
