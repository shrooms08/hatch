# Hatch — Phase 0 review

Date: 2026-10-02. Read-only review. No transactions were sent, and no repository was modified apart from this file.

Sources:
- Meteora skill: `~/.claude/skills/meteora`, which pins DBC SDK 1.5.11.
- `~/Projects/meteora-invent` at commit `dd77ef3`.
- The DBC program repo (`MeteoraAg/dynamic-bonding-curve` @ `f552f20`, program 0.2.1) and the DBC SDK repo (`MeteoraAg/dynamic-bonding-curve-sdk` @ `a28b723`, SDK 1.5.13). Both were cloned to a scratch directory, outside any of your repos.
- docs.meteora.ag. The skill names it as the always-current reference.
- Read-only RPC reads (`getAccountInfo`) on mainnet and devnet.

---

## A. GLANCE extension

### Which repo was reviewed
- `github.com/heeylana/glance-by-heylana` exists. I cloned it read-only to `~/Projects/_ref/glance`. It contains only a `README.md` (543 lines): a documentation hub that links five code repos.
- The extension code itself is `heeylana/glance-extension-app`. A local copy is at `~/Projects/glance-extension-app` (HEAD `9856baa`, v1.0.4), and that is what this section reviews.
- I also read `~/Projects/glance-backend` for the server side.
- The Phantom console, `heeylana/glance-web`, was not on disk. I cloned it read-only to `~/Projects/_ref/glance-web` but did not review it in depth.

### Findings

| Topic | Finding |
|---|---|
| Framework / build | WXT ^0.21.4 + `@wxt-dev/module-react`, React 19, Tailwind v4 (`@tailwindcss/vite`), TypeScript, vitest, pnpm. Config is in `wxt.config.ts`: the extension ID is pinned from `.keys/extension-pubkey.txt`, and `.env` drives `host_permissions`. |
| Manifest | MV3, `minimum_chrome_version` 116. Permissions: `storage`, `sidePanel`, `activeTab`, `tabs`, `offscreen`. Host permissions: the backend origin, the console origin and `<all_urls>`. Command `Alt+G`. Strict CSP in production. |
| Surfaces | **Background SW**, `entrypoints/background.ts`: proxies every backend call, holds the token, opens the side panel, runs `captureVisibleTab`.<br>**Content script**, `entrypoints/content/index.ts`: `http(s)://*/*`, top frame only, document_idle. Results render in an in-page shadow-DOM bubble (`content/bubble.ts`).<br>**Side panel** (React), `entrypoints/sidepanel/{main.tsx,App.tsx,hooks.ts}`: Onboarding, Portfolio, Journal and Settings screens.<br>**Options page**, **mic setup page** and **offscreen recorder** (voice).<br>**No popup**: the toolbar button opens the side panel via `setPanelBehavior`. |
| Page reading | `lib/adapters.ts` → `detectSite()` returns x / youtube / article / generic.<br>`xAdapter()` + `pickFocalTweet()`: focal tweet text, time and status URL.<br>`youtubeAdapter()`: title, description and about 90 s of rolling captions.<br>`articleAdapter()`: og/meta title, publish time, canonical URL, up to 8k characters.<br>`visibleText()` / `readableText()`.<br>`collectContext()` builds the `GlanceInput` sent to the backend.<br>Screenshot fallback: `capture-visible-tab` (JPEG q60) → `lib/page-map.ts shrinkScreenshot()` (≤1280 px) → `/glance/vision`.<br>Ticker underlines come from a local dictionary (`lib/dictionary.ts`, `lib/highlights.ts`).<br>**No TradingView or chart-specific extractor**: charts are covered only by the screenshot fallback. |
| Backend comms | `lib/config.ts`: `WXT_BACKEND_URL` (default `localhost:8787`), `WXT_CONSOLE_URL`, `WXT_SOLANA_CLUSTER`, `WXT_SOLANA_RPC_URL`, `WXT_USDC_MINT`.<br>`lib/api.ts` `ApiClient`: fetch with a 30 s timeout, `Authorization: Bearer <JWT>`, normalized `{ok:false,code,message}` errors.<br>Typed message bus in `lib/messages.ts`.<br>Backend is Hono and has no streaming; every call is JSON request/response.<br>Production backend: `glance-backend-production-2bd4.up.railway.app`. |
| Auth | Phantom signs a nonce. The backend verifies the ed25519 signature (tweetnacl) and issues an HS256 JWT (jose, `SESSION_SECRET`). See `glance-backend/src/services/auth.ts` and `src/routes/auth.ts`. The token is stored in `chrome.storage.local`. CORS is locked to the extension origin. |
| Wallets | **The extension has no wallet SDK.** `lib/auth.tsx` implements a hosted-page handoff:<br>1. `POST /auth/handoff/start` returns a code.<br>2. A new tab opens `CONSOLE_URL/connect?code=…`, where Phantom signs.<br>3. The extension polls `/auth/handoff/:code` every 1.5 s for up to 10 min.<br>4. It stores the JWT.<br>Trades are signed server-side by a delegated agent key against the glance-vault program. |
| AI | All AI runs in the backend. `glance-backend/src/services/llm.ts` uses the Anthropic SDK with Zod structured output (`src/lib/structured.ts`), including vision via `readScreenshot()`. The model is chosen in `src/lib/llm-models.ts`. |

### Reuse for Hatch

| Module | Reuse | Why |
|---|---|---|
| `wxt.config.ts` + manifest setup | High | Ready MV3 + side panel + `<all_urls>` + hotkey. Drop `offscreen` and mic. |
| `lib/adapters.ts` (`xAdapter`, `articleAdapter`, `collectContext`) | High | Covers the tweet and news cases directly. Hatch needs a new chart adapter on top. |
| Screenshot path (`background.ts capture-visible-tab`, `page-map.ts shrinkScreenshot`) | High | Most of the stock-chart input path (capture → shrink → vision). |
| `lib/auth.tsx` handoff + backend `auth.ts` routes | High | Already the "open hosted page → Phantom signs → extension polls" flow. It can be extended from login to "sign launch tx". |
| `lib/api.ts`, `lib/messages.ts` | High / Med-High | Generic Bearer client and typed content→background→backend bus. Copy them and replace the message types. |
| Backend `llm.ts structured()` / `readScreenshot()`, `lib/structured.ts` | High | Claude structured output + vision, a direct fit for a "draft token + pick preset" schema. |
| `entrypoints/background.ts` skeleton | Med-High | Keep the side-panel behaviour, proxy, open-tab and open-side-panel handlers. Drop the trade, TTS and recorder handlers. |
| Side panel shell + `components/ui.tsx` (includes a Phantom button) | Medium | The shell and hooks are reusable; the screens are Glance-specific. |
| `content/index.ts`, `content/bubble.ts` | Low-Med | Over 2,000 lines tied to Glance's stock and voice features. Hatch shows output in the side panel. |
| Vault, trade, Jupiter and Pyth backend code; voice stack | Low | Not relevant to Hatch. |

**Overall rating: High.**
- The WXT/MV3 scaffold, X and article extractors, captureVisibleTab vision path, Bearer proxy and Phantom hosted-page handoff map almost one-to-one onto Hatch.
- Gaps: a chart extractor, moving output into the side panel, and the signing web app (fun-launch will provide it).

Security notes for Hatch to avoid copying:
- `openConsole()` puts the session JWT in a URL query string.
- The backend's `DEV_LOGIN=1` `/auth/dev` route issues tokens without a signature.

---

## B. fun-launch scaffold (`~/Projects/meteora-invent/scaffolds/fun-launch`)

### Structure
- **Stack:** Next.js 15.5 with the **Pages Router**, React 19, TypeScript, Tailwind 3, react-query v4, jotai, ky, zod 3.
- **Build settings:** `next.config.ts` sets `ignoreBuildErrors` and `ignoreDuringBuilds`, so type and lint errors are hidden at build time.
- **Pages:**
  - `pages/index.tsx` is Explore: recent, about to graduate and graduated columns.
  - `pages/create-pool.tsx` is the launch form.
  - `pages/token/[tokenId].tsx` is the token page: header, stats, TradingView chart, txns and holders tables, Jupiter Plugin swap.
- **API routes:**
  - `pages/api/upload.ts` uploads to R2 and builds the pool transaction.
  - `pages/api/send-transaction.ts` relays the signed transaction to RPC.

### Wallet connect
- **Library:** Jupiter Unified Wallet Kit (`@jup-ag/wallet-adapter` 0.2.6), with Phantom and Solflare adapters plus auto-detected Wallet Standard wallets.
- **Provider:** `pages/_app.tsx` `<UnifiedWalletProvider>`. Its metadata is placeholder Jupiter branding.
- **Signing:** the app uses only `signTransaction`. Sending happens on the server.
- **Dead code:** `hooks/useSendTransaction.ts` is unused and buggy (it applies extra signers after the wallet signs).

### DBC create-pool transaction
- **Builder:** `pages/api/upload.ts` → `createPoolTransaction()`, which runs on the server and calls:
  ```ts
  new DynamicBondingCurveClient(connection,'confirmed').creator.createPool({
    config: new PublicKey(POOL_CONFIG_KEY), baseMint, name, symbol, uri: metadataUrl,
    payer: userWallet, poolCreator: userWallet })
  ```
  - SDK `@meteora-ag/dynamic-bonding-curve-sdk` ^1.5.11, locked at 1.5.11.
  - Legacy `Transaction`, no first buy, no compute-budget or priority-fee instruction.
- **Mint keypair:** generated in the browser with `Keypair.generate()` in `create-pool.tsx` `onSubmit`. Only its pubkey goes to the server.
- **Round trip:**
  1. The server returns the transaction serialized to base64 with `requireAllSignatures: false`.
  2. The client signs with the mint keypair, then with the wallet (`signTransaction`).
  3. The client POSTs to `/api/send-transaction`.
  4. That route calls `sendAndConfirmRawTransaction` with no simulation.
- **Gaps:**
  - No auth or rate limit; the send route is an open relay.
  - The blockhash is fetched before the user signs, so it can expire if the user is slow.
  - Website and twitter are collected in the form but dropped.

### Images and metadata (R2)
- **Code:** `pages/api/upload.ts`, using `S3Client` against `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`.
- **Image:** sent as a base64 data URL and stored at `images/{mint}.{ext}`.
- **Metadata:** stored at `metadata/{mint}.json` with shape `{name, symbol, image}` only.
- **`PUBLIC_R2_URL` is hardcoded** to Meteora's bucket (`pub-85c7…r2.dev`) and must be replaced.
- **Upload limits:** no server-side size or MIME check; Next's 1 MB default body limit applies.

### Trading UI and token data
- **No API keys are used.** Everything is anonymous Jupiter.
- **Data API:** `https://datapi.jup.ag`, client in `components/Explore/client.ts`:
  - `POST /v1/pools/gems` (filtered by `partnerConfigs`)
  - `GET /v1/pools?assetIds=`
  - `/v1/holders/{id}`
  - `/v2/charts/{id}`
  - `/v1/txs/{id}`
  - `/v1/assets/{id}/description`
- **Live updates:** WebSocket `wss://trench-stream.jup.ag/ws` (`contexts/DataStreamProvider.tsx`).
- **Chart:** TradingView loaded from `static.jup.ag`.
- **Swaps:** the Jupiter Plugin (`plugin.jup.ag/plugin-v1.js`), set up in `components/Terminal/index.tsx` with `initialInputMint: SOL_MINT`. It is not the DBC SDK.
- **Dependency:** tokens and swaps only work once Jupiter indexes the DBC pool. These are undocumented Jupiter APIs with no fallback.

### Env vars

| Var | Purpose |
|---|---|
| `RPC_URL` | Server RPC (upload + send) |
| `POOL_CONFIG_KEY` | DBC config for `createPool`. The module throws at load if it is missing. |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET` | R2 upload |
| `NEXT_PUBLIC_POOL_CONFIG_KEY` | Comma-separated `partnerConfigs` filter for Explore and the stream. **Not in `.env.example`.** If it is unset, Explore shows every launchpad's tokens. |
| `NEXT_PUBLIC_VERCEL_BRANCH_URL` | Base URL for icons |
| *(to add)* | Public R2 URL (currently hardcoded) and a client RPC (none today) |

### Q: Does it assume a single POOL_CONFIG_KEY?
**Yes on the server, no on the client.**
- The server uses exactly one key, in `createPoolTransaction`.
- The client already splits `NEXT_PUBLIC_POOL_CONFIG_KEY` on commas, but only to filter listings.

Changes for 3 presets (meme / ai-agent / stock):
1. **Server allowlist:** add an env map such as `POOL_CONFIGS={"meme":"…","agent":"…","stock_nvdax":"…"}`. Also publish the preset metadata (label, quote mint, quote decimals, quote token program, quote symbol).
2. **Form (`create-pool.tsx`):** add a `preset` field to `FormValues` and the zod schema, add a preset picker (the AI can prefill it), and send `preset` to `/api/upload`.
3. **`api/upload.ts`:**
   - Map `preset` to the config key from the allowlist. Never accept a raw config pubkey from the client.
   - Pass the key into `createPoolTransaction`.
   - Optionally verify with `client.state.getPoolConfig(key)` that the quote mint matches the preset.
4. **Listing:** set `NEXT_PUBLIC_POOL_CONFIG_KEY=k1,k2,k3`. Per-preset tabs need a `partnerConfigs:[k]` filter per column. The datapi `Pool` type has no config or quote field, so tagging a pool with its preset needs an RPC read of `virtualPool.config` or a Hatch database.
5. **Swap widget:** set `initialInputMint` to the preset's quote mint.
6. **Stock preset only:** create-pool also needs the token badge. See the next question.

### Q: Does buy/sell assume SOL as the quote? What breaks with a Token-2022 stock quote?
The scaffold does almost no on-chain amount math. It assumes SOL in only one place: `components/Terminal/index.tsx:5`, where `SOL_MINT` is the swap input. Prices, market caps and volumes are USD values from Jupiter.

With an xStock quote such as NVDAx (Token-2022, 8 decimals, confirmed on-chain in §C):

1. **Create pool breaks as written.**
   - NVDAx is not a "permissionless" quote, so the DBC program requires its token badge as remaining account `[0]` on `initialize_virtual_pool_*`.
   - SDK 1.5.11, the version fun-launch and the studio lock, has no `tokenBadge` param.
   - Fix: bump to ≥1.5.12 (latest 1.5.13) and pass `tokenBadge: deriveTokenBadgeAddress(quoteMint)` in `createPool` for the stock preset.
2. **Swap input.**
   - The Jupiter Plugin defaults to SOL. SOL→token only works if Jupiter indexes the pool *and* routes SOL→NVDAx→token.
   - Otherwise set the input to NVDAx, which means the user must already hold NVDAx.
   - Any custom DBC-SDK swap or first buy must use the Token-2022 ATA, skip wrap/unwrap, and scale amounts by 10^8. The SDK derives the quote token program from the config's `quoteTokenFlag`.
3. **Display.**
   - xStocks carry `scaledUiAmountConfig`, so raw amounts × multiplier = UI amount. Anything Hatch computes itself (graduation progress in NVDAx, "≥ $750" checks) must apply the multiplier.
   - USD values from Jupiter are fine only if Jupiter prices the pool.
4. **Graduation.** The config must use DAMM v2 (`migrationOption: 1`); DAMM v1 is deprecated for new configs. Migration works because the DAMM v2 configs that DBC uses have `CreatePoolWithoutMintValidation`.
5. **Fees.** The user still needs SOL for rent and fees even though the quote is NVDAx.

Other cleanup worth doing during the fork:
- Hidden TS errors.
- Open-relay send route.
- Hardcoded R2 URL.
- Missing priority fees.
- `pool-utils.ts graduatedAt` logic bug.

---

## C. Stock token as the DBC quote

### 1. Can a DBC config use a Token-2022 mint as the QUOTE? Blocked extensions? Badge?
**Supported, with a token badge. For NVDAx and TSLAx the badge already exists on mainnet.**

**The rule.** Program source `utils/token.rs`, `is_supported_quote_mint` and `validate_quote_mint_with_token_badge`, enforced in `create_config*` and every `initialize_virtual_pool_*`:
- SPL Token quote mints are permissionless.
- Token-2022 quote mints are permissionless **only** if their sole extensions are `MetadataPointer` and `TokenMetadata`.
- Any other extension requires a **DBC token badge** PDA `["token_badge", mint]` under `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`. It is passed as remaining account index 0.
- Badges are created only by a Meteora operator (`create_token_badge`, `OperatorPermission::CreateTokenBadge`), so they are effectively a whitelist.
- The docs say: "This is the path used for Stock Tokens."

**Always blocked, even with a badge:**
- A non-zero transfer fee, current or scheduled. Error `QuoteMintHasNonZeroTransferFee`. It is checked at badge creation, at config and pool creation, and on every quote transfer, so if an issuer later turns a fee on, quote-side swaps and claims fail.
- Token-2022 native SOL (`UnsupportNativeMintToken2022`).

**Mainnet NVDAx and TSLAx (RPC read 2026-10-02):**

| | NVDAx | TSLAx |
|---|---|---|
| Mint | `Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh` | `XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB` |
| Program / decimals | Token-2022 / 8 | Token-2022 / 8 |
| DBC token badge | `mfacWnGh1Kn5ttHMMaNZhRZbCjvGrDQyDyZgqaR9vBM`, **exists** | `XhM8atXDua58KZnZFLu5vJjzaNWjXaEvpPPEVnHn1ax`, **exists** |

- **Extensions (both mints):** metadataPointer, permanentDelegate, defaultAccountState(initialized), scaledUiAmountConfig, pausableConfig (paused: false), confidentialTransferMint, transferHook (programId **null**), tokenMetadata.
- **No transferFeeConfig**, so the zero-fee rule is satisfied.
- Mint addresses came from Glance's curated `glance-backend/src/config/issuers.mainnet.json`. Re-check them against `api.xstocks.fi` before production.

**Transfer hooks.** The transfer-hook extension is present, but no hook program is set today. If the issuer sets one later, whether DBC quote transfers still work is **UNCONFIRMED**. The program's hook support covers *base* mints only (`create_config_with_transfer_hook`).

**SDK gap.**
- `tokenBadge` on `createConfig` / `createPool` / `createConfigAndPool` was added in SDK **1.5.12**; the current version is 1.5.13.
- The skill pins 1.5.11, and the studio and fun-launch lock 1.5.11.
- The studio passes no badge (`grep badge studio/src` finds nothing).
- So **`pnpm studio dbc-create-config` with an NVDAx quote should fail with `InvalidTokenBadge`** until the SDK is bumped and badge support is added. This is inferred from source; it has not been run.

### 2. migration_quote_threshold rule for Stock Token quote pairs (mainnet keepers)
Source: docs.meteora.ag, "DBC Migration and Liquidity → Mainnet Migration Keepers".
- **"Both keepers also migrate Stock Token quote pairs when the threshold is at least 750 USD equivalent in the quote token."**
- Keepers: `Asi5DTGEeiso6k7ya6ndDabEZ7DRCgfTpCBLPH5E3aQs` and `DeQ8dPv6ReZNQ45NfiWwS5CchWpB2BVq1QMyNV8L2uSW`.
- Below that, migration is still permissionless but manual: use `migrator.meteora.ag` (mainnet and devnet) or `pnpm studio dbc-migrate-to-damm-v2`.

Three things here are **UNCONFIRMED**:
- Whether "USD equivalent" is measured when the config is created or when migration happens.
- Whether it applies the xStock `scaledUiAmount` multiplier.
- Which price source it uses.

Size thresholds with margin, e.g. ≥ $900 worth of NVDAx at current UI price × multiplier.

### 3. `studio/config/dbc_config.jsonc` fields to set for a non-SOL quote
- `quoteMint`: the stock mint, e.g. `Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh`.
- `dbcConfig.token.tokenQuoteDecimal`: **8** for xStocks. The default is 9 and is used in curve and price math (`studio/src/lib/dbc/index.ts:84`).
- Curve amounts in **quote units**, i.e. NVDAx not SOL:
  - Mode 0: `migrationQuoteThreshold`, which must be ≥ $750 equivalent for keeper auto-migration.
  - Modes 1–5: `initialMarketCap`, `migrationMarketCap`, `midPrice`, `prices`.
- `dbcConfig.migration.migrationOption: 1` (DAMM v2). This is required in practice: DAMM v1 is deprecated, and DAMM v2 is the path for badged quotes.
- `collectFeeMode`: decide deliberately. `0` = fees in quote (NVDAx); `1` = output token. Do the same for the migrated pool's `collectFeeMode` if `migrationFeeOption: 6`.
- `token.tokenType`: base token type. This is independent of the quote; SPL (0) is fine.
- `dbcSwap.amountIn`: becomes NVDAx units when buying.
- **Not in the template:** the token badge. The studio needs a code change (SDK ≥1.5.12 plus passing `tokenBadge`), or Hatch creates its configs with its own SDK script.

### 4. Stock tokens on devnet?
**No.**
- The NVDAx mint address does not exist on devnet.
- The TSLAx mint address is only a system-owned 0-byte account holding lamports.
- Badges cannot be self-created: `create_token_badge` needs Meteora operator permission.
- Glance already uses its own **mock** xStocks on devnet. `glance-backend/src/scripts/setup-devnet.ts` creates Token-2022 mints with PermanentDelegate + MetadataPointer, 8 decimals.

**Cheapest test plan:**
1. **Devnet, Token-2022 quote path (no badge needed).**
   - Create a mock "NVDAx" Token-2022 mint with **only MetadataPointer + TokenMetadata**, 8 decimals. This is permissionless, so no badge is needed.
   - Run config → pool → buy/sell → manual migrate to DAMM v2 with a tiny threshold.
   - Exercises: 8-decimal math, Token-2022 ATAs, the preset routing in fun-launch, and the migrator. Cost: devnet SOL only.
2. **Devnet, badge path (optional).**
   - A mint copying the full xStock extension set (PermanentDelegate, Pausable, ScaledUiAmount, DefaultAccountState, ConfidentialTransferMint, TransferHook with null program) would fail with `InvalidTokenBadge` unless Meteora badges it on devnet.
   - Ask Meteora. Whether they badge devnet mints is **UNCONFIRMED**.
   - Use this to confirm the SDK ≥1.5.12 `tokenBadge` wiring rejects and accepts correctly.
3. **Mainnet smoke test with real NVDAx (badge exists).**
   - Hold about $5–20 of NVDAx and create one Hatch stock-preset config.
   - Create one pool with a small threshold (below $750 so no keeper races you), do a small buy and sell, then migrate manually via `migrator.meteora.ag`.
   - Cost: about 0.1–0.2 SOL in rent and fees plus the small NVDAx amount.
   - Requires your explicit go-ahead for mainnet.

---

## Risks and recommendations
- **SDK version gap is the first blocker.** Stock-quoted configs and pools need `tokenBadge` (SDK ≥1.5.12), but the skill, studio and fun-launch are on 1.5.11. Bump to 1.5.13 in the Hatch web app, and create configs with a Hatch script rather than the unmodified studio.
- **Issuer control over the quote token.** xStocks keep a permanent delegate, a pausable switch and a settable transfer hook. The issuer can pause transfers (freezing the curve and migration), move tokens out of pool vaults, or attach a hook. Disclose this in the preset explanation, and monitor `pausableConfig` before showing "launch".
- **Badge dependency.** Only badged stock mints work, and Meteora can close a badge (which stops new configs and pools). Read the badge PDA at launch time and gate the stock preset on it.
- **scaledUiAmount math.** Raw amounts ≠ UI amounts for xStocks. Apply the multiplier in every display, progress bar and $750 threshold calculation, or users will see wrong numbers.
- **Keeper threshold ambiguity.** The ≥ $750 rule's timing and price source are unconfirmed. Size stock presets with margin (≥ $900), and keep a manual-migration fallback (studio or migrator) in Hatch ops.
- **Jupiter dependence in fun-launch.** Listings, charts and swaps all ride undocumented Jupiter endpoints and indexing, and SOL→NVDAx→token routing may not exist for new pools. Plan a DBC-SDK swap fallback for the stock preset (quote = NVDAx, with an optional SOL→NVDAx Jupiter leg).
- **Harden the forked server before deploy.** fun-launch has an open-relay send route, no upload limits, a hardcoded R2 URL, no priority fees and hidden TS errors. Fix these first, and never accept a raw config key from the client; use a preset allowlist.
- **Reuse the Glance pieces, minus its shortcuts.** Reuse the WXT shell, adapters, screenshot path, auth handoff and structured-LLM backend. Add a chart adapter. Do not carry over the JWT-in-URL pattern or the `DEV_LOGIN` route.
