import path from "path";
import { spawnSync } from "child_process";
import fse from "fs-extra";
import toml from "@iarna/toml";

import {
  addCypress,
  getAppName,
  getSpawnOpts,
  runCypress,
  validatePackageVersions
} from "./_shared.mjs";
import { createApp } from "../../build/node_modules/create-remix/index.js";

let APP_NAME = getAppName("cf-workers");
let PROJECT_DIR = path.join(process.cwd(), "deployment-test", APP_NAME);
let CYPRESS_DEV_URL = "http://localhost:8787";

async function createNewApp() {
  await createApp({
    install: false,
    lang: "ts",
    server: "cloudflare-workers",
    projectDir: PROJECT_DIR,
    quiet: true
  });
}

try {
  // create a new remix app
  await createNewApp();

  // validate dependencies are available
  await validatePackageVersions(PROJECT_DIR);

  // add cypress to the project
  await Promise.all([
    fse.copy(
      path.join(process.cwd(), "scripts/deployment-test/cypress"),
      path.join(PROJECT_DIR, "cypress")
    ),

    fse.copy(
      path.join(process.cwd(), "scripts/deployment-test/cypress.json"),
      path.join(PROJECT_DIR, "cypress.json")
    ),

    addCypress(PROJECT_DIR, CYPRESS_DEV_URL)
  ]);

  let spawnOpts = getSpawnOpts(PROJECT_DIR);

  // install deps
  spawnSync("npm", ["install"], spawnOpts);
  spawnSync("npm", ["run", "build"], spawnOpts);

  // run cypress against the dev server
  runCypress(PROJECT_DIR, true, CYPRESS_DEV_URL);

  // we need to update the workers name
  let wranglerTomlPath = path.join(PROJECT_DIR, "wrangler.toml");
  let wranglerTomlContent = await fse.readFile(wranglerTomlPath);
  let wranglerToml = toml.parse(wranglerTomlContent);
  wranglerToml.name = APP_NAME;
  await fse.writeFile(wranglerTomlPath, toml.stringify(wranglerToml));
  let url = `https://${APP_NAME}.remix--run.workers.dev`;
  console.log(`worker url: ${url}`);

  // deploy the app
  let deployCommand = spawnSync("npx", ["wrangler", "publish"], spawnOpts);
  if (deployCommand.status !== 0) {
    throw new Error(`Failed to deploy app: ${deployCommand.stderr}`);
  }

  // run cypress against the deployed server
  runCypress(PROJECT_DIR, false, url);

  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
