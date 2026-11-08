import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "tsdown";
import { pluginFiles, validateMetadata } from "./metadata";

export async function runBuild(root: string = process.cwd()) {
  const meta = validateMetadata(root);

  await build();

  const outPluginDir = resolve(root, "dist/plugin");
  for (const rel of pluginFiles) {
    const src = resolve(root, rel);
    const dest = resolve(outPluginDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
  }

  const builtEntry = resolve(outPluginDir, "index.js");
  const mod = await import(pathToFileURL(builtEntry).href);
  const actualExports = Object.keys(mod).sort();

  const expectedFixture = resolve(root, "tests/fixtures/exports.json");
  const expectedExports: string[] = JSON.parse(readFileSync(expectedFixture, "utf8")).sort();

  if (JSON.stringify(actualExports) !== JSON.stringify(expectedExports)) {
    throw new Error(
      `Exports mismatch.\nExpected: ${JSON.stringify(expectedExports)}\nActual: ${JSON.stringify(actualExports)}`,
    );
  }

  const stat = statSync(builtEntry);
  const metafile = {
    id: meta.id,
    version: meta.version,
    builtAt: new Date().toISOString(),
    size: stat.size,
    exports: actualExports,
  };
  writeFileSync(resolve(root, "dist/metafile.json"), JSON.stringify(metafile, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(process.cwd(), "scripts/build.ts")) {
  runBuild().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
