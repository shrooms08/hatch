# Hatch — Phase 2: browser buddy (devnet)

Date: 2026-10-02. Network: **devnet only**. Code: `extension/` (new), `web/` (AI endpoints and the event bridge).

## Architecture

```
 any web page                         Hatch extension (MV3)                          Hatch web app (web/)
 ───────────                          ─────────────────────                          ────────────────────
 content script ── local detection ─► background worker ── POST /api/buddy/notice ─► Haiku (fast) ─┐
  (egg, shadow DOM)  (no network)      (only contact with   ── GET  /api/hatches ──────► chain (DBC)    │ Anthropic SDK,
        ▲                                the web app for     ◄─ hints, hatches, alarms                 │ key server-side
        │ get-context                    content scripts)                                              │
 side panel (React) ── POST /api/buddy/draft ───────────────────────────────────────► Sonnet (draft) ─┘
        │  "Hatch it"
        └──────────────► new tab: HATCH_WEB_URL/launch?name=&symbol=&description=&image=&preset=&source=
                                                         │ Phantom signs + sends (web app only)
 HATCH_WEB_URL pages: window.postMessage({type:"HATCH_EVENT", event:"wallet"|"launched", wallet, mint?})
        └─► hatch-bridge content script (event.origin === HATCH_WEB_URL) ─► background stores the public address
```

- **The extension never holds wallets, keys or API keys.** It stores only settings, the egg's position, the user's public wallet address and a cache of their hatches.
- **All AI calls go through the web app server.** Wallet signing happens only on the web app.
- **UI is kept apart from logic.** Plain components in `extension/entrypoints/sidepanel/components/*` and `entrypoints/content/egg.ts` (view only). Logic lives in `extension/lib/*`, the side-panel hooks and the background worker.

### Web app (Part 1)
- **`POST /api/buddy/draft`**:
  - **Input:** `{ page: { url, title, text (trimmed to 6k), images, detected: { kind, tickers } }, messages: [{role, content}], currentDraft? }`.
  - **Output:** `{ name, symbol, description, preset, imageUrl, stockTicker, reasoning, reply }`.
  - **Model:** `ANTHROPIC_MODEL_DRAFT` (default `claude-sonnet-5-5`, effort `low`), with structured outputs (`messages.parse` + zod).
- **`POST /api/buddy/notice`**:
  - **Model:** `ANTHROPIC_MODEL_FAST` (default `claude-haiku-4-5-20251001`).
  - **Output:** `{ worthIt, kind, hint (≤80) }`.
  - **When called:** only for pages the extension flagged locally, at most once per URL per session.
- **`GET /api/hatches?wallet=`** reuses the My Hatches chain reads. It returns name, symbol, mint, preset, progress %, status, claimable creator fees and the token page path.
- **`GET /api/presets`** now also returns each preset's label, description and explainer, so the extension shows the web app's text.
- **Untrusted content.** Page content goes to the model inside `<page_content>` as JSON data. The system prompt says it is never instructions.
- **Server-side clamping.** The server validates and clamps every field:
  - name ≤ 32 characters; symbol `A-Z0-9` ≤ 10; description ≤ 500;
  - `imageUrl` must be one of the page's images;
  - **STOCK only when the ticker is the page's subject:** it came from local detection (stock-page URL or `$CASHTAG`) or is in the page title. Otherwise the draft falls back to MEME.
  - Nothing launches automatically.
- **Errors:** no `ANTHROPIC_API_KEY` → 503 `AI not configured`. Refusals, truncation and SDK errors map to clean messages.
- **CORS:** `chrome-extension://*` and the app's own origin are allowed; other origins get 403.
- **Rate limits (in memory, per IP, per hour):** 20 drafts, 120 notices, 300 hatches requests.

### Extension (Parts 2–5)
**Ported from GLANCE:**
- WXT + React MV3 build setup (`wxt.config.ts`, tsconfig);
- background-worker message router and typed messages;
- the API client pattern (without Bearer auth);
- side panel entry;
- page text extraction and the focal-tweet picker (`lib/page.ts`).

**Not ported:** GLANCE's wallet sign-in handoff, Bearer/JWT auth, vault/trading, voice, offscreen recorder and themes.

**Floating egg:**
- **Rendering:** Shadow DOM root (`createShadowRootUi`), bottom-right by default, draggable, position saved.
- **States:** `idle`, `noticed` (wiggle + hint bubble), `thinking` / `ready` (while the side panel drafts), plus a tracking badge with the incubating count.
- **Click** opens the side panel. The `⋯` button or a right-click opens a menu with "Hide on this site" and "Hide everywhere"; Settings undoes either.
- **Not shown** on the Hatch web app itself.

**Noticing (`lib/detect.ts`, no network):**
- stock pages: `finance.yahoo.com/quote/*`, `google.com/finance/*`, `tradingview.com/symbols/*` and `/chart`;
- `$TICKER` cashtags (currencies and crypto excluded);
- X/Twitter status pages (text, author, media);
- articles (og:title, og:description, og:image).

**xStocks:** `lib/xstocks.ts` maps tickers to xStock symbols (NVDA→NVDAx, TSLA→TSLAx, AAPL→AAPLx and 13 more).
- Mainnet mints are `null` with a TODO.
- On devnet, every stock maps to the mock NVDAx mint, read from `scripts/state/devnet.json` at build time.

**Side panel:**
- **Draft tab:**
  - page summary, then an AI draft card made automatically on first open per page;
  - editable name, ticker, description, image and preset, with the preset explainer;
  - a refinement chat that sends history plus the edited draft;
  - **Hatch it** opens `/launch` prefilled in a new tab.
- **My Hatches tab:** the tracked wallet's tokens with progress, status and claimable fees, each linking to its token page.
- **Settings tab:** hidden sites, hide everywhere, stop tracking this wallet.

**Tracking (Part 5):**
1. The web app sends `HATCH_EVENT` on wallet connect (`useWalletHatchEvents` in `_app.tsx`) and after a launch (`create-pool.tsx`).
2. The `hatch-bridge` content script runs only on `HATCH_WEB_URL`; its matches are set at build time. It checks `event.origin` before forwarding.
3. The background stores the address and polls `/api/hatches` every 60 s (`chrome.alarms`).
4. **Announcements:**
   - crossing 80% → egg bubble + Chrome notification, e.g. "MINOS is 80% to hatching";
   - hatching → egg bubble + Chrome notification, "MINOS hatched!";
   - claimable creator fees → egg bubble with a link to the token page.
5. The toolbar badge shows the incubating count.

## Env vars
| Where | Var | Notes |
|---|---|---|
| web | `ANTHROPIC_API_KEY` | **required for AI**; server-side only. Empty → `AI not configured` |
| web | `ANTHROPIC_MODEL_DRAFT` | default `claude-sonnet-5-5` |
| web | `ANTHROPIC_MODEL_FAST` | default `claude-haiku-4-5-20251001` |
| extension | `WXT_HATCH_WEB_URL` | default `http://localhost:3000`. Sets host permissions and the bridge's matches; rebuild after changing |
| extension | `WXT_HATCH_NETWORK` | `devnet` (default) or `mainnet-beta` |
| extension | `WXT_DEVNET_STOCK_MINT` | optional; defaults to the mock NVDAx mint from `scripts/state/devnet.json` |

## How to run and load
```bash
cd web && pnpm dev                      # http://localhost:3000 (fill ANTHROPIC_API_KEY in web/.env.local)
cd extension && pnpm install && pnpm build
# Chrome → chrome://extensions → Developer mode → Load unpacked →
#   extension/dist/chrome-mv3
cd extension && pnpm test               # detection + milestone unit tests
cd web && pnpm test:buddy               # clamping always; live draft fixtures if ANTHROPIC_API_KEY is set
```
After loading, open the web app once and connect Phantom so the extension learns your wallet. On devnet, use `scripts/ pnpm faucet-nvdax <addr> 1000` for test NVDAx.

## Verification done
- **Builds:** `web` (`pnpm build`) and `extension` (`pnpm build`, `pnpm compile`) pass.
- **Unit tests:** 16 extension tests pass. `pnpm test:buddy` clamping passes; its live AI part was skipped because no `ANTHROPIC_API_KEY` is set. While writing it, the test caught a prompt-injection gap: a ticker named in body text satisfied the STOCK rule. That is now fixed.
- **API probes:**
  - draft preflight from a `chrome-extension://` origin → 204 with CORS headers; another origin → 403;
  - no key → 503 `AI not configured`; bad body → 400;
  - `/api/hatches` returns the devnet test tokens.
- **Browser e2e** (Playwright-driven Chromium with the built extension loaded):
  - the egg mounts in its shadow root on a `$NVDA` article, and the page was flagged and noticed once;
  - a `HATCH_EVENT` from the web app origin stored the wallet and started the 1-minute alarm;
  - a spoofed event from another origin was ignored;
  - the poll fetched HWEB (Incubating) and HMEME/HNVDA (Hatched), so the egg badge shows **1**;
  - the side panel's My Hatches tab renders the list;
  - "Hide on this site" removes the egg.

## Known limits
- **AI output unverified live.** The draft and notice calls were not run because there is no key; quality and latency are untested. Refusal fallbacks (`fallbacks`) are not enabled. A refusal returns a clean error, which is reasonable for low-risk drafting.
- **STOCK always launches against the one STOCK config.** The web app has a single STOCK config (mock NVDAx on devnet), so a TSLA page drafts STOCK with `stockTicker=TSLA` but launches against the NVDAx-quoted config. Per-ticker configs and `stockTicker` in `/launch` are future work. Mainnet xStock mints are null.
- **Not click-tested:**
  - the side panel Draft tab against a live page;
  - `sidePanel.open` from an egg click (it relies on Chrome passing the user gesture from the content script);
  - the Phantom launch flow.
- **CORS and rate limits are loose.** CORS accepts any `chrome-extension://` origin rather than our pinned ID, and the rate limit is in-memory per server instance.
- **Detection is heuristic.** It uses URL patterns, cashtags and og tags; SPA navigation is caught by polling the URL every 2 s. Draft sessions live only while the side panel is open.
