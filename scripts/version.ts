import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export function setVersion(nextVersion: string, root: string = process.cwd()) {
  if (!/^\d+\.\d+\.\d+$/.test(nextVersion)) {
    throw new Error(`Invalid version format: ${nextVersion}`);
  }

  const pkgPath = resolve(root, "package.json");
  const pkgRaw = readFileSync(pkgPath, "utf8");
  const nextPkg = pkgRaw.replace(/"version":\s*"[^"]+"/, `"version": "${nextVersion}"`);
  writeFileSync(pkgPath, nextPkg);

  const pluginPath = resolve(root, "plugin.json");
  const pluginRaw = readFileSync(pluginPath, "utf8");
  const nextPlugin = pluginRaw.replace(/"version":\s*"[^"]+"/, `"version": "${nextVersion}"`);
  writeFileSync(pluginPath, nextPlugin);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(process.cwd(), "scripts/version.ts")) {
  const versionArg = process.argv[2];
  if (!versionArg) {
    console.error("Usage: pnpm version:set <version>");
    process.exit(1);
  }
  setVersion(versionArg);
}
