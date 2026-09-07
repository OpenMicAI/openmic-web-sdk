import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
  },
  {
    entry: { "web-sdk.standalone": "src/index.ts" },
    format: ["iife"],
    globalName: "OpenMicSDK",
    sourcemap: true,
    minify: true,
    noExternal: ["eventemitter3", "livekit-client"],
  },
]);
