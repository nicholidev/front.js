import path from "path";
import { execSync, spawnSync } from "child_process";
import { Octokit } from "@octokit/rest";
import fse from "fs-extra";
import fetch from "node-fetch";

import {
  addCypress,
  checkUp,
  getAppName,
  getSpawnOpts,
  runCypress,
  validatePackageVersions,
} from "./_shared.mjs";
import { createApp } from "../../build/node_modules/create-remix/index.js";

let APP_NAME = getAppName("cf-pages");
let PROJECT_DIR = path.join(process.cwd(), "deployment-test", APP_NAME);
let CYPRESS_DEV_URL = "http://localhost:8788";

async function createNewApp() {
  await createApp({
    install: false,
    lang: "ts",
    server: "cloudflare-pages",
    projectDir: PROJECT_DIR,
    quiet: true,
  });
}

async function createCloudflareProject() {
  let promise = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/pages/projects`,
    {
      method: "POST",
      headers: {
        "X-Auth-Email": process.env.CF_EMAIL,
        "X-Auth-Key": process.env.CF_GLOBAL_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: APP_NAME,
        source: {
          type: "github",
          config: {
            owner: "remixautomatedtests",
            repo_name: APP_NAME,
            production_branch: "main",
            pr_comments_enabled: true,
            deployments_enabled: true,
          },
        },
        build_config: {
          build_command: "npm run build",
          destination_dir: "public",
          root_dir: "",
        },
      }),
    }
  );

  if (!promise.ok) {
    if (promise.headers.get("Content-Type").includes("application/json")) {
      console.error(await promise.json());
    }
    throw new Error(`Failed to create cloudflare pages project`);
  }
}

async function createCloudflareDeployment() {
  let promise = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/pages/projects/${APP_NAME}/deployments`,
    {
      method: "POST",
      headers: {
        "X-Auth-Email": process.env.CF_EMAIL,
        "X-Auth-Key": process.env.CF_GLOBAL_API_KEY,
      },
    }
  );

  if (!promise.ok) {
    if (promise.headers.get("Content-Type").includes("application/json")) {
      console.error(await promise.json());
    }
    throw new Error(`Failed to create cloudflare pages project`);
  }
}

let octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

async function createRepoIfNeeded() {
  let repo = await octokit.repos.createForAuthenticatedUser({ name: APP_NAME });
  return repo.data;
}

let currentGitUser = {
  email: execSync("git config --get user.email").toString().trim(),
  name: execSync("git config --get user.name").toString().trim(),
};

let spawnOpts = getSpawnOpts(PROJECT_DIR);

try {
  // create a new remix app
  await createNewApp();

  // validate dependencies are available
  await validatePackageVersions(PROJECT_DIR);

  // create a new github repo
  let repo = await createRepoIfNeeded(APP_NAME);

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

    addCypress(PROJECT_DIR, CYPRESS_DEV_URL),
  ]);

  // install deps
  spawnSync("npm", ["install"], spawnOpts);
  spawnSync("npm", ["run", "build"], spawnOpts);

  // run cypress against the dev server
  runCypress(PROJECT_DIR, true, CYPRESS_DEV_URL);

  spawnSync("git", ["init"], spawnOpts);
  spawnSync(
    "git",
    ["config", "--global", "user.email", "hello@remix.run"],
    spawnOpts
  );
  spawnSync(
    "git",
    ["config", "--global", "user.name", "Remix Run Bot"],
    spawnOpts
  );
  spawnSync("git", ["branch", "-m", "main"], spawnOpts);
  spawnSync("git", ["add", "."], spawnOpts);
  spawnSync("git", ["commit", "-m", "initial commit"], spawnOpts);
  spawnSync(
    "git",
    [
      "remote",
      "add",
      "origin",
      `https://${process.env.GITHUB_TOKEN}@github.com/${repo.full_name}.git`,
    ],
    spawnOpts
  );
  spawnSync("git", ["push", "origin", "main"], spawnOpts);

  await createCloudflareProject();
  await createCloudflareDeployment();
  console.log(
    "Successfully created cloudflare pages project, the build is in progress, but will take a bit before it's ready to run cypress against it",
    "we'll sleep for 5 minutes to give it time to build"
  );

  // builds typically take between 2 and 3 minutes
  await new Promise((resolve) => setTimeout(resolve, 60_000 * 3));

  let appUrl = `https://${APP_NAME}.pages.dev`;

  await checkUp(appUrl);

  // run cypress against the cloudflare pages server
  runCypress(PROJECT_DIR, false, appUrl);

  if (currentGitUser.email && currentGitUser.name) {
    spawnSync(
      "git",
      ["config", "--global", "user.email", currentGitUser.email],
      spawnOpts
    );
    spawnSync(
      "git",
      ["config", "--global", "user.name", currentGitUser.name],
      spawnOpts
    );
  }

  process.exit(0);
} catch (error) {
  if (currentGitUser.email && currentGitUser.name) {
    spawnSync(
      "git",
      ["config", "--global", "user.email", currentGitUser.email],
      spawnOpts
    );
    spawnSync(
      "git",
      ["config", "--global", "user.name", currentGitUser.name],
      spawnOpts
    );
  }

  console.error(error);
  process.exit(1);
}
