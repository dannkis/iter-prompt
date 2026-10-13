import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

let count = 0;
for (const directory of ["src", "public", "test", "scripts"]) {
  for (const name of await readdir(directory)) {
    if (!/\.(mjs|js)$/.test(name)) continue;
    const file = join(directory, name);
    const result = spawnSync(process.execPath, ["--check", file], {
      stdio: "inherit",
    });
    if (result.status !== 0) process.exit(result.status || 1);
    count++;
  }
}
console.log("Syntax checked " + count + " JavaScript files.");
