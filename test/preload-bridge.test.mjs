import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("uses a CommonJS preload bridge for the sandboxed Electron renderer", async () => {
  const [mainSource, preloadSource] = await Promise.all([
    readFile(new URL("../src/electron/main.mjs", import.meta.url), "utf8"),
    readFile(new URL("../src/electron/preload.cjs", import.meta.url), "utf8"),
  ]);
  assert.match(mainSource, /preload\.cjs/);
  assert.match(preloadSource, /contextBridge\.exposeInMainWorld\("codexGuard"/);
  assert.match(preloadSource, /require\("electron"\)/);
});
