import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { unzipSync, zipSync } from "fflate";
import { runBuild } from "./build";
import { validateMetadata } from "./metadata";

function collectFiles(dir: string, base: string = dir): Record<string, [Uint8Array, { mtime: Date }]> {
  const result: Record<string, [Uint8Array, { mtime: Date }]> = {};
  const entries = readdirSync(dir).sort();
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      Object.assign(result, collectFiles(full, base));
    } else {
      const rel = relative(base, full);
      result[rel] = [new Uint8Array(readFileSync(full)), { mtime: new Date("1980-01-01T00:00:00Z") }];
    }
  }
  return result;
}

export async function runPackage(root: string = process.cwd()) {
  const meta = validateMetadata(root);

  await runBuild(root);
  const pluginDir = resolve(root, "dist/plugin");
  const files1 = collectFiles(pluginDir);
  const zip1 = zipSync(files1);
  const hash1 = createHash("sha256").update(zip1).digest("hex");

  await runBuild(root);
  const files2 = collectFiles(pluginDir);
  const zip2 = zipSync(files2);
  const hash2 = createHash("sha256").update(zip2).digest("hex");

  if (hash1 !== hash2) {
    throw new Error(`Non-deterministic build detected: ${hash1} !== ${hash2}`);
  }

  const unzipped = unzipSync(zip1);
  const required = ["index.js", "plugin.json", "locales/zh-CN.json", "README.md"];
  for (const file of required) {
    if (!unzipped[file]) {
      throw new Error(`Archive missing required file: ${file}`);
    }
  }

  const indexSource = Buffer.from(unzipped["index.js"]).toString("base64");
  const mod = await import(`data:text/javascript;base64,${indexSource}`);
  const actualExports = Object.keys(mod).sort();
  const expectedExports: string[] = JSON.parse(
    readFileSync(resolve(root, "tests/fixtures/exports.json"), "utf8"),
  ).sort();

  if (JSON.stringify(actualExports) !== JSON.stringify(expectedExports)) {
    throw new Error("Unpacked archive exports mismatch fixture");
  }

  const releaseDir = resolve(root, "dist/release");
  mkdirSync(releaseDir, { recursive: true });

  const zipName = `${meta.id}-v${meta.version}.zip`;
  const zipPath = resolve(releaseDir, zipName);
  writeFileSync(zipPath, zip1);

  const shaPath = resolve(releaseDir, `${zipName}.sha256`);
  writeFileSync(shaPath, `${hash1}  ${zipName}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(process.cwd(), "scripts/package.ts")) {
  runPackage().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
