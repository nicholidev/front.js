const path = require("path");
const { execSync } = require("child_process");
const semver = require("semver");

const buildDir = path.resolve(__dirname, "../build/node_modules");

function getTaggedVersion() {
  let output = execSync("git tag --list --points-at HEAD").toString().trim();
  return output.replace(/^v/g, "");
}

function publish(dir, tag) {
  execSync(`npm publish --tag ${tag} ${dir}`, { stdio: "inherit" });
}

async function run() {
  // Make sure there's a current tag
  let taggedVersion = getTaggedVersion();
  if (taggedVersion === "") {
    console.error("Missing release version. Run the version script first.");
    process.exit(1);
  }

  let prerelease = semver.prerelease(taggedVersion);
  let tag = prerelease ? prerelease[0] : "latest";

  // Publish all @remix-run/* packages
  for (let name of [
    "create",
    "dev",
    "node", // publish node before node servers
    "architect",
    "express", // publish express before serve
    "vercel",
    "react",
    "serve"
  ]) {
    publish(path.join(buildDir, "@remix-run", name), tag);
  }

  // Publish remix package
  publish(path.join(buildDir, "remix"), tag);
}

run().then(
  () => {
    process.exit(0);
  },
  error => {
    console.error(error);
    process.exit(1);
  }
);
