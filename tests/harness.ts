import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Host } from "../src/types";

export interface HarnessOptions {
  settings?: Record<string, string>;
  initialStorage?: Record<string, any>;
  onSpawn?: (command: string, args: string[]) => void;
}

export function createHarness(options: HarnessOptions = {}) {
  const settings = { ...options.settings };
  const storage: Record<string, any> = { ...options.initialStorage };
  const spawns: { command: string; args: string[] }[] = [];

  const hostMock: Host = {
    platform: "darwin",
    arch: "arm64",
    dir: "/tmp",
    dataDir: "/tmp",
    setting: (key: string) => settings[key],
    storage: {
      get: (key: string) => storage[key],
      set: (key: string, value: any) => {
        storage[key] = value;
      },
      remove: (key: string) => {
        delete storage[key];
      },
    },
    crypto: {
      md5: (text: string) => createHash("md5").update(text).digest("hex"),
    },
    t: (text: string) => text,
    language: () => "en",
    spawn: (command: string, args: string[]) => {
      spawns.push({ command, args });
      options.onSpawn?.(command, args);
      const version = args[0] === "-version";
      let reads = 0;
      return {
        closeStdin() {},
        async readLine() {
          return null;
        },
        wait() {
          return new Promise((res) => setTimeout(() => res(0), version ? 0 : 500));
        },
        errorOutput() {
          if (version) return "ffmpeg version 9.0.2\n";
          reads++;
          const line = "  Stream #0:0[0x1](und): Audio: flac, 48000 Hz, stereo, s32 (24 bit)";
          return "    LYRICS: " + "x".repeat(8192) + "\n" + (reads < 2 ? line.slice(0, 20) : line + "\n");
        },
        kill() {},
      };
    },
  };

  (globalThis as any).host = hostMock;

  return {
    host: hostMock,
    settings,
    storage,
    spawns,
  };
}

export async function loadBuiltPlugin(root: string = process.cwd()) {
  const file = resolve(root, "dist/plugin/index.js");
  const source = await readFile(file, "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}
