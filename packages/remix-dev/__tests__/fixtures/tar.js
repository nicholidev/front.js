const tar = require("tar-fs");
const fs = require("fs");
const path = require("path");

let files = fs.readdirSync(__dirname);
let dirs = files.filter((file) =>
  fs.statSync(path.join(__dirname, file)).isDirectory()
);

for (const dir of dirs) {
  let fullPath = path.join(__dirname, dir);
  console.log(`Creating archive for ${fullPath}`);
  tar
    .pack(fullPath, {
      map(header) {
        header.name = dir + "/" + header.name;
        return header;
      },
    })
    .pipe(fs.createWriteStream(path.join(__dirname, `${dir}.tar.gz`)));
}
