import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";

// Ported from GLANCE's wxt.config.ts (WXT + React, MV3), renamed to Hatch.

// The WXT_* values reach the bundle through Vite, but not this file's process.env: read .env here too,
// so host_permissions and the bridge script's matches name the real web app. Values already set win.
try {
  process.loadEnvFile(fileURLToPath(new URL("./.env", import.meta.url)));
} catch {
  /* no .env: environment only */
}

const HATCH_WEB_URL = (process.env.WXT_HATCH_WEB_URL ?? "http://localhost:3000").replace(/\/$/, "");
process.env.WXT_HATCH_WEB_URL = HATCH_WEB_URL;
const HATCH_WEB_MATCH = `${new URL(HATCH_WEB_URL).origin}/*`;

// Devnet: every stock maps to the mock NVDAx mint created by scripts/ (scripts/state/devnet.json),
// unless WXT_DEVNET_STOCK_MINT is set explicitly.
if (!process.env.WXT_DEVNET_STOCK_MINT) {
  const statePath = fileURLToPath(new URL("../scripts/state/devnet.json", import.meta.url));
  if (existsSync(statePath)) {
    const mint = JSON.parse(readFileSync(statePath, "utf8"))?.mockStock?.mint;
    if (typeof mint === "string") process.env.WXT_DEVNET_STOCK_MINT = mint;
  }
}

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  outDir: "dist",
  manifest: ({ mode }) => ({
    name: "Hatch",
    short_name: "Hatch",
    description: "Your Hatch browser buddy: notices pages worth a token, drafts it with AI, and tracks your hatches.",
    minimum_chrome_version: "116",
    permissions: ["storage", "sidePanel", "tabs", "alarms", "notifications"],
    // Only the Hatch web app (AI + hatches API). Content scripts declare their own matches.
    host_permissions: [HATCH_WEB_MATCH],
    action: { default_title: "Hatch" },
    ...(mode === "production"
      ? { content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'; frame-ancestors 'none';" } }
      : {}),
  }),
  hooks: {
    // The bridge content script must run only on the Hatch web app, whose origin is a build-time value.
    "build:manifestGenerated": (_wxt, manifest) => {
      for (const cs of manifest.content_scripts ?? []) {
        if (cs.js?.some((f) => f.includes("hatch-bridge"))) cs.matches = [HATCH_WEB_MATCH];
      }
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
    optimizeDeps: { entries: ["entrypoints/**/*.html", "entrypoints/**/*.ts", "entrypoints/**/*.tsx"] },
  }),
});
