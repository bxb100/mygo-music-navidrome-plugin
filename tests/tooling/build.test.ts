import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { parse } from "yaml";

const root = process.cwd();

test("single file bundle specification", () => {
  const bundlePath = resolve(root, "dist/plugin/index.js");
  assert.ok(existsSync(bundlePath), "dist/plugin/index.js should exist");

  const content = readFileSync(bundlePath, "utf8");
  assert.doesNotMatch(content, /from\s+["']node:/, "bundle should not import node built-ins");
  assert.doesNotMatch(content, /require\s*\(\s*["']node:/, "bundle should not require node built-ins");
  assert.doesNotMatch(content, /\bprocess\./, "bundle should not use process global");
  assert.doesNotMatch(content, /\bBuffer\./, "bundle should not use Buffer global");
});

test("deterministic zip and checksum specification", () => {
  const releaseDir = resolve(root, "dist/release");
  assert.ok(existsSync(releaseDir), "dist/release should exist");

  const files = readdirSync(releaseDir);
  const zipFile = files.find((f) => f.endsWith(".zip"));
  assert.ok(zipFile, "release zip file should exist");

  const shaFile = files.find((f) => f.endsWith(".sha256"));
  assert.ok(shaFile, "sha256 file should exist");

  const zipBytes = readFileSync(resolve(releaseDir, zipFile));
  const expectedHash = createHash("sha256").update(zipBytes).digest("hex");

  const shaContent = readFileSync(resolve(releaseDir, shaFile), "utf8");
  assert.ok(
    shaContent.includes(expectedHash),
    `sha256 file content "${shaContent}" should match computed hash "${expectedHash}"`,
  );
});

test("version synchronization specification", () => {
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const plugin = JSON.parse(readFileSync(resolve(root, "plugin.json"), "utf8"));

  assert.equal(pkg.version, plugin.version, "package.json and plugin.json version must match");
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/, "version must be three-part semver");
});

test("lock pnpm specification", () => {
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  assert.ok(pkg.packageManager, "packageManager must be defined in package.json");
  assert.match(pkg.packageManager, /^pnpm@/, "packageManager must use pnpm");
});

test("workflow constraints specification", () => {
  const ciPath = resolve(root, ".github/workflows/ci.yml");
  const releasePath = resolve(root, ".github/workflows/release.yml");

  assert.ok(existsSync(ciPath), "ci.yml should exist");
  assert.ok(existsSync(releasePath), "release.yml should exist");

  const ciYaml = parse(readFileSync(ciPath, "utf8"));
  const releaseYaml = parse(readFileSync(releasePath, "utf8"));

  assert.equal(ciYaml.name, "CI");
  assert.equal(releaseYaml.name, "Release");
});
