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
const HATCH_WEB_MATCH = `${new URL(HATCH_WEB_URL).origin}/*`;

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
  outDir: "dist",
  manifest: ({ mode }) => ({
    name: "Hatch",
    key: MANIFEST_KEY,
    short_name: "Hatch",
    description: "Your Hatch browser buddy: notices pages worth a token, drafts it with AI, and tracks your hatches.",
    minimum_chrome_version: "116",
    // offscreen: all buddy sounds play from an offscreen document (page autoplay rules can't block it).
    permissions: ["storage", "sidePanel", "tabs", "alarms", "notifications", "offscreen"],
    // Only the Hatch web app (AI + hatches API). Content scripts declare their own matches.
    host_permissions: [HATCH_WEB_MATCH],
    action: { default_title: "Hatch" },
    ...(mode === "production"
      ? { content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'; frame-ancestors 'none';" } }
      : {}),
  }),
  hooks: {
    "build:publicAssets": (_wxt, files) => {
      const missing = SFX_FILES.filter((f) => !existsSync(`${SFX_DIR}${f}`));
      if (missing.length) {
        const listing = existsSync(SFX_DIR) ? readdirSync(SFX_DIR).join(", ") || "(empty)" : "(folder missing)";
        throw new Error(`Missing buddy sounds ${missing.join(", ")} in ${SFX_DIR}. Folder contains: ${listing}`);
      }
      for (const f of SFX_FILES) files.push({ absoluteSrc: `${SFX_DIR}${f}`, relativeDest: `sfx/${f}` });
    },
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
