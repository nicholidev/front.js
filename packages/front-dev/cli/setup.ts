import * as path from "path";
import * as fse from "fs-extra";

export enum SetupPlatform {
  Cloudflare = "cloudflare",
  Node = "node",
}

export function isSetupPlatform(platform: any): platform is SetupPlatform {
  return [SetupPlatform.Cloudflare, SetupPlatform.Node].includes(platform);
}

export async function setupRemix(platform: SetupPlatform): Promise<void> {
  let remixPkgJsonFile: string;
  try {
    remixPkgJsonFile = resolvePackageJsonFile("remix");
  } catch (error: any) {
    if (error.code === "MODULE_NOT_FOUND") {
      console.error(
        `Missing the "remix" package. Please run \`npm install remix\` before \`remix setup\`.`
      );

      return;
    } else {
      throw error;
    }
  }

  // Update remix/package.json dependencies
  let remixDeps = {};

  let platformPkgJsonFile = resolvePackageJsonFile(`@remix-run/${platform}`);
  await assignDependency(remixDeps, platformPkgJsonFile);

  let serverPkgJsonFile = resolvePackageJsonFile(`@remix-run/server-runtime`);
  await assignDependency(remixDeps, serverPkgJsonFile);

  let clientPkgJsonFile = resolvePackageJsonFile(`@remix-run/react`);
  await assignDependency(remixDeps, clientPkgJsonFile);

  let remixPkgJson = await fse.readJSON(remixPkgJsonFile);
  // We can overwrite all dependencies at once because the remix package
  // doesn't actually have any dependencies.
  remixPkgJson.dependencies = remixDeps;

  await fse.writeJSON(remixPkgJsonFile, remixPkgJson, { spaces: 2 });

  // Copy magicExports directories to remix
  let remixPkgDir = path.dirname(remixPkgJsonFile);
  let platformExportsDir = path.resolve(
    platformPkgJsonFile,
    "..",
    "dist",
    "magicExports"
  );
  let serverExportsDir = path.resolve(
    serverPkgJsonFile,
    "..",
    "dist",
    "magicExports"
  );
  let clientExportsDir = path.resolve(
    clientPkgJsonFile,
    "..",
    "dist",
    "magicExports"
  );

  let magicTypes = await combineFilesInDirs(
    [platformExportsDir, serverExportsDir, clientExportsDir],
    ".d.ts"
  );

  let magicCJS = await combineFilesInDirs(
    [platformExportsDir, serverExportsDir, clientExportsDir],
    ".js"
  );

  let magicESM = await combineFilesInDirs(
    [
      path.join(platformExportsDir, "esm"),
      path.join(serverExportsDir, "esm"),
      path.join(clientExportsDir, "esm"),
    ],
    ".js"
  );

  await fse.writeFile(path.join(remixPkgDir, "dist", "index.d.ts"), magicTypes);
  await fse.writeFile(path.join(remixPkgDir, "dist", "index.js"), magicCJS);
  await fse.writeFile(path.join(remixPkgDir, "dist", "esm/index.js"), magicESM);
}

async function combineFilesInDirs(
  dirs: string[],
  ext: string
): Promise<string> {
  let combined = "";
  for (let dir of dirs) {
    let files = await fse.readdir(dir);
    for (let file of files) {
      if (!file.endsWith(ext)) {
        continue;
      }
      let contents = await fse.readFile(path.join(dir, file), "utf8");
      combined += contents + "\n";
    }
  }
  return combined;
}

function resolvePackageJsonFile(packageName: string): string {
  return require.resolve(path.join(packageName, "package.json"));
}

async function assignDependency(
  deps: { [key: string]: string },
  pkgJsonFile: string
) {
  let pkgJson = await fse.readJSON(pkgJsonFile);
  deps[pkgJson.name] = pkgJson.version;
}
