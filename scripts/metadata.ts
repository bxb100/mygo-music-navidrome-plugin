import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const pluginFiles = ["plugin.json", "locales/zh-CN.json", "README.md"];

export interface PluginMeta {
  id: string;
  name: string;
  version: string;
  minAppVersion?: string;
  main: string;
  playback?: string;
  permissions?: {
    network?: string[];
    process?: (string | boolean)[];
  };
  settings?: {
    key: string;
    label: string;
    help?: string;
    link?: string;
  }[];
  navigation?: any[];
}

export function validateMetadata(root: string = process.cwd()): PluginMeta {
  const file = resolve(root, "plugin.json");
  const raw = readFileSync(file, "utf8");
  const meta: PluginMeta = JSON.parse(raw);

  if (!meta.id || typeof meta.id !== "string") {
    throw new Error("plugin.json missing id");
  }
  if (!meta.name || typeof meta.name !== "string") {
    throw new Error("plugin.json missing name");
  }
  if (!/^\d+\.\d+\.\d+$/.test(meta.version)) {
    throw new Error(`Invalid version in plugin.json: ${meta.version}`);
  }
  if (meta.main !== "index.js") {
    throw new Error(`plugin.json main must be index.js, got: ${meta.main}`);
  }
  return meta;
}
