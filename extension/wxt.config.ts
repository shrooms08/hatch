import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { existsSync, readdirSync, readFileSync } from "node:fs";

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
// Other origins that serve the same web app (e.g. the old hatchfun.vercel.app next to hatchem.fun): the
// bridge also runs there, so connecting a wallet works on either domain. Comma list of URLs.
const ALT_WEB_URLS = (process.env.WXT_HATCH_ALT_WEB_URLS ?? "").split(",").map((u) => u.trim()).filter(Boolean);
process.env.WXT_HATCH_ALT_WEB_URLS = ALT_WEB_URLS.join(",");
const HATCH_WEB_MATCHES = [...new Set([HATCH_WEB_URL, ...ALT_WEB_URLS].map((u) => `${new URL(u).origin}/*`))];
// Dev builds only (build:dev): web apps the link features may be pointed at for testing (a local devnet server).
// Host permission only: the wallet bridge never runs there.
const DEV_WEB_URLS = (process.env.WXT_HATCH_DEV_WEB_URLS ?? "").split(",").map((u) => u.trim()).filter(Boolean);
process.env.WXT_HATCH_DEV_WEB_URLS = DEV_WEB_URLS.join(",");
const DEV_WEB_MATCHES = DEV_WEB_URLS.map((u) => `${new URL(u).origin}/*`);
// Dev builds carry their own version so they are never mistaken for a store release (Chrome needs a numeric
// "version"; version_name is what chrome://extensions shows).
const DEV_VERSION = process.env.WXT_HATCH_DEV_VERSION; // e.g. "0.7.0-dev

// Stable extension ID (knfkjiebkbhddjogcbniiachhomkmdkm): the manifest "key" is the PUBLIC key, committed in
// extension-key.pub. The private key stays in .keys/hatch-extension.pem (gitignored) and is only needed to
// sign packaged builds. The web app's CORS allows exactly this ID.
const MANIFEST_KEY = readFileSync(fileURLToPath(new URL("./extension-key.pub", import.meta.url)), "utf8").trim();

// Buddy sounds live in the repo (design/sfx/hatch-sfx). Copied into the build as sfx/*.mp3;
// the build fails loudly if either file is missing.
const SFX_DIR = fileURLToPath(new URL("../design/sfx/hatch-sfx/", import.meta.url));
const SFX_FILES = ["chirp.mp3", "chirp-double.mp3"];

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  // build:mainnet writes to dist-mainnet so the devnet build in dist stays loadable.
  outDir: process.env.WXT_OUT_DIR ?? "dist",
  manifest: ({ mode }) => ({
    name: "Hatch",
    key: MANIFEST_KEY,
    short_name: "Hatch",
    description: "Your Hatch browser buddy: notices pages worth a token, drafts it with AI, and tracks your hatches.",
    minimum_chrome_version: "116",
    // offscreen: all buddy sounds play from an offscreen document (page autoplay rules can't block it).
    // No "tabs": the side panel gets the page (and its URL) from our content script, never tab.url.
    permissions: ["storage", "sidePanel", "alarms", "notifications", "offscreen"],
    // Only the Hatch web app (AI + hatches API) and its other domains. Content scripts declare their own matches.
    host_permissions: [...new Set([...HATCH_WEB_MATCHES, ...DEV_WEB_MATCHES])],
    ...(DEV_VERSION ? { version: DEV_VERSION.replace(/-.*$/, ""), version_name: DEV_VERSION } : {}),
    action: { default_title: "Hatch" },
    ...(mode === "production"
      ? { content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'; frame-ancestors 'none';" } }
      : {}),
  }),
  hooks: {
    // Release builds (build:prod) leave out the buddy debug page.
    "entrypoints:resolved": (_wxt, entrypoints) => {
      if (process.env.WXT_EXCLUDE_DEBUG !== "true") return;
      const i = entrypoints.findIndex((e) => e.name === "buddy-debug");
      if (i >= 0) entrypoints.splice(i, 1);
    },
    "build:publicAssets": (_wxt, files) => {
      const missing = SFX_FILES.filter((f) => !existsSync(`${SFX_DIR}${f}`));
      if (missing.length) {
        const listing = existsSync(SFX_DIR) ? readdirSync(SFX_DIR).join(", ") || "(empty)" : "(folder missing)";
        throw new Error(`Missing buddy sounds ${missing.join(", ")} in ${SFX_DIR}. Folder contains: ${listing}`);
      }
      for (const f of SFX_FILES) files.push({ absoluteSrc: `${SFX_DIR}${f}`, relativeDest: `sfx/${f}` });
    },
    // The bridge content script must run only on the Hatch web app, whose origins are build-time values.
    "build:manifestGenerated": (_wxt, manifest) => {
      for (const cs of manifest.content_scripts ?? []) {
        if (cs.js?.some((f) => f.includes("hatch-bridge"))) cs.matches = HATCH_WEB_MATCHES;
      }
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
    optimizeDeps: { entries: ["entrypoints/**/*.html", "entrypoints/**/*.ts", "entrypoints/**/*.tsx"] },
  }),
});
