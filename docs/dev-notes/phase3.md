# Hatch — Phase 3

## Mainnet

Date: 2026-10-06. Operator budget: $5; partner wallet funded with 0.033 SOL. RPC: Helius
(`MAINNET_RPC_URL` in `scripts/.env`, gitignored). Every live step was simulated first, shown with its
exact SOL cost, approved in chat, then sent by `pnpm <script> --mainnet --live` with the typed
"YES MAINNET" confirmation. Base token for launches: **Token-2022** (no Metaplex 0.01 SOL fee).

### Addresses
| What | Address |
|---|---|
| Partner wallet (owns configs, receives partner fees) | [`B5bZhED5GM2L1uMHjBFZZg3W6gCeAq7zGqr8EqCsHUVR`](https://solscan.io/account/B5bZhED5GM2L1uMHjBFZZg3W6gCeAq7zGqr8EqCsHUVR) |
| NVDAx (real xStock, quote of STOCK) | [`Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh`](https://solscan.io/token/Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh) |
| NVDAx DBC token badge | [`mfacWnGh1Kn5ttHMMaNZhRZbCjvGrDQyDyZgqaR9vBM`](https://solscan.io/account/mfacWnGh1Kn5ttHMMaNZhRZbCjvGrDQyDyZgqaR9vBM) |
| **STOCK-NVDAx config** | [`HX9EjDXFjazM5gLyN2hUG5SRsH9BMorKi1EhVVw1BzJ6`](https://solscan.io/account/HX9EjDXFjazM5gLyN2hUG5SRsH9BMorKi1EhVVw1BzJ6) |
| **MEME config (also AI_AGENT on mainnet)** | [`HjeeZN7aDtgfAoiVh8F17GeAKVAg4DFJsHx8Ap2GUfqv`](https://solscan.io/account/HjeeZN7aDtgfAoiVh8F17GeAKVAg4DFJsHx8Ap2GUfqv) |
| HGTEST mint ("Hatch Genesis Test", Token-2022) | [`Eekou3Ckcd2Hxk1MaeVepRafCH6SHU7sybNrifizUZfb`](https://solscan.io/token/Eekou3Ckcd2Hxk1MaeVepRafCH6SHU7sybNrifizUZfb) |
| HGTEST DBC pool | [`6rnqNK44b77XUWcYBF1MCkzdfnfY6nCME7C6KhXkUTG1`](https://solscan.io/account/6rnqNK44b77XUWcYBF1MCkzdfnfY6nCME7C6KhXkUTG1) |

Config parameters:
- **STOCK-NVDAx**: quote NVDAx, `migrationQuoteThreshold` **390,000,000 raw** = 3.9 × 10^8 base units =
  3.906635 NVDAx in wallets (multiplier 1.001701196801074) ≈ **$938.5** at $240.24/NVDAx, i.e. the
  keepers' $750 minimum × 1.25 margin. Token-2022 base, 1% fee (50/50 partner/creator), DAMM v2 on graduation,
  NVDAx token badge passed (the badge path works on mainnet).
- **MEME**: quote SOL, threshold **exactly 10 SOL** (10,000,000,000 lamports), Token-2022 base, DAMM v2.
- HGTEST metadata on R2: `metadata/Eekou3Ckcd2Hxk1MaeVepRafCH6SHU7sybNrifizUZfb.json` (Hatch egg image,
  "Test launch of Hatch … Not a project token. Do not buy expecting value.").

### Transactions
| Step | Solscan | Cost (SOL) |
|---|---|---|
| 1. Create STOCK-NVDAx config | [2DrbY9…NoqGWN](https://solscan.io/tx/2DrbY9Fj1xDo7gS6f9ymwx65vmuHzCyduHdB9RmY97kR4mLksVTbdBFwDrJPxF9MKfkCAtHCYPTBZKXQFhoNoGWN) | 0.005984 |
| 2. Launch HGTEST | [3onf33…Es3vbH](https://solscan.io/tx/3onf33ZByRzzHctAyKuM6ZgMu7YexD9tU3KKf6Dh6rTd1hNfHs5eiM1hvoDabvZApdCqJ8iZiKTiuf97a4Es3vbH) | 0.008788 |
| 3. Jupiter SOL → NVDAx (0.004167 SOL, direct Meteora DLMM route, 1% slippage) | [5Sso5s…MkUAg5o](https://solscan.io/tx/5Sso5sATTXx7vgPqFQxVHkzagrpFFzRb7sGdGSzH61e3ownHemtw5ubh5R2sADMoNjJQhvkHQeNFD6sX2MkUAg5o) | 0.005731 |
| 4. Buy HGTEST with all NVDAx + close empty NVDAx account | [552BV4…rjqj6Kq](https://solscan.io/tx/552BV4veLmonNWKmiXeFKZKbAk1Gtm4NqPXzCvsGojHTn5oBQ95fe5YPdejLZGEE94CjKau6KyL2SKGx9rjqj6Kq) | −0.000041 (rent refund) |
| 5. Create MEME config | [3aEnFx…j81qdDzF](https://solscan.io/tx/3aEnFxMePdsvYSUfgAbfhUXYTCnJqhsNoqSR6SgBr4c8yqnR38PXNUKf6tmhnPzD5a6Q9z4HjytuaHpnj81qdDzF) | 0.005984 |
| **Total** | 5 transactions | **0.026447 (~$3.17)** |

Partner wallet left: **0.006553 SOL** (~$0.79).

### Results
- **NVDAx bought:** 207,241 raw = 0.00207552 NVDAx in wallets (~$0.50); all of it spent on HGTEST.
- **HGTEST bought:** 1,181,777.838942 HGTEST (held by the partner wallet).
- **Pool after the buy:** price 1.7363e-9 → 1.7399e-9 NVDAx per HGTEST; progress 0% → 0.0526%
  (205,058 / 390,000,000 raw NVDAx); claimable fees 40,575 raw NVDAx each for creator and partner.
- **Seen on mainnet:** within minutes of the launch, before our buy, a third party traded the new pool
  (fees appeared while the reserve went back to ~0). That's typical bot activity on new DBC pools; the
  fees are ours to claim.

### Web app on mainnet
Superseded by Phase 3b below (`web/.env.mainnet.example`, `pnpm dev:mainnet`).

### Notes
- `scripts/.env` originally held the whole Helius URL pasted into its `api-key` parameter (HTTP 401).
  It was repaired to the single working URL; the original is kept as `scripts/.env.bak` (gitignored).
- Confirmations were typed through an `expect` wrapper that waits for the "Type YES MAINNET" prompt.
  A first attempt piped the text in too early, and the prompt aborted without sending anything.

## Phase 3b: web app + extension on mainnet (local)

Nothing is deployed. Devnet stays the default (`pnpm dev`, `.env.local`, extension `pnpm build`);
mainnet runs side by side with its own env file, Next dist dir (`.next-mainnet`) and extension
output (`dist-mainnet`). No mainnet transaction was sent in this phase.

### Run it
```bash
cd web && pnpm dev:mainnet                # http://localhost:3000 (PORT=3200 pnpm dev:mainnet for another port)
cd extension && pnpm build:mainnet        # load extension/dist-mainnet/chrome-mv3 unpacked
cd scripts && pnpm claim-partner-fees-mainnet   # simulate; add --mainnet --live to claim (asks YES MAINNET)
```
Stop the devnet dev server first if it is on port 3000. Test token page:
http://localhost:3000/token/Eekou3Ckcd2Hxk1MaeVepRafCH6SHU7sybNrifizUZfb

### Env vars (`web/.env.mainnet.local`, gitignored; template `web/.env.mainnet.example`)
| Var | Value |
| --- | --- |
| `NEXT_PUBLIC_SOLANA_NETWORK` | `mainnet-beta` |
| `RPC_URL`, `NEXT_PUBLIC_RPC_URL` | mainnet RPC (Helius). The public one ships to the browser. |
| `POOL_CONFIGS` | `{"MEME":"HjeeZ…","AI_AGENT":"HjeeZ…"}` (AI_AGENT reuses MEME) |
| `STOCK_CONFIGS` | ticker → `{config, quoteMint, symbol, name}`; NVDA → `HX9Ej…` / NVDAx |
| `HIDDEN_MINTS` | comma list kept out of public lists (HGTEST) |
| `R2_*`, `ANTHROPIC_API_KEY` | same as devnet |
| `NEXT_PUBLIC_PRIORITY_FEE_MICROLAMPORTS` | `50000` |
| `HATCH_EXTENSION_IDS` | optional; overrides the allowed extension ID(s) for CORS |
| `NEXT_PUBLIC_JUPITER_API_URL` | optional; default `https://lite-api.jup.ag` |

Extension build vars: `WXT_HATCH_NETWORK=mainnet-beta`, `WXT_HATCH_WEB_URL=http://localhost:3000`,
`WXT_OUT_DIR=dist-mainnet` (set by `build:mainnet`).

### What changed
- **Network config:** presets come from `POOL_CONFIGS` + `STOCK_CONFIGS`; `GET /api/stocks` lists pairable
  stocks for the extension. STOCK launches only for listed tickers (server rejects others); the AI
  draft turns an unlisted stock into a MEME launch and says stock pairing is coming soon.
- **Pay with SOL** (mainnet, non-SOL-quote pools, buy side; on by default when the wallet holds none of
  the quote token): Jupiter quote SOL → quote token (direct route preferred, explicit slippage), then
  the DBC buy. Both legs are protected: the DBC leg spends Jupiter's guaranteed minimum and requires
  the curve's minimum out for that amount. Built as **one v0 transaction** (Jupiter
  swap-instructions + DBC swap, Jupiter's lookup tables). A 0.001 SOL buy of HGTEST simulated
  successfully on mainnet as one 1013-byte transaction. If a route is too large for one
  transaction, it falls back to two ("Step 1 of 2" swap, "Step 2 of 2" buy with what arrived).
  Jupiter 429s show "Jupiter is busy right now… Try again in a few seconds." Hidden on devnet.
- **Image fallback:** launches without an image get a 512×512 PNG (Night background, Yolk egg, ticker in
  Shell; "paired with NVDAx" for stock launches), rendered server-side with resvg + Archivo Black
  (OFL, `web/assets/fonts`). Drafts get it on R2 (`images/fallback/…`); launches re-render it for
  the final ticker as `images/<mint>.png`. Preview: `GET /api/fallback-image?symbol=&stock=`.
- **Stable extension ID `knfkjiebkbhddjogcbniiachhomkmdkm`:** the manifest `key` is the public key in
  `extension/extension-key.pub`; the private key is `extension/.keys/hatch-extension.pem` (gitignored,
  keep a backup; only needed to sign packaged builds). Web CORS allows only that ID and the app's own origin.
- **Partner fees:** `scripts/src/claim-partner-fees-mainnet.ts` claims from every pool under the mainnet
  configs to the partner wallet. Simulated: HGTEST has 40575 raw NVDAx (≈0.0004 NVDAx) to claim;
  cost ≈0.0016 SOL, mostly rent to reopen the partner's NVDAx account. Not run live.
- **Pool lookup:** token pages derive the DBC pool PDA from Hatch configs. The mainnet RPC's
  `getProgramAccounts` intermittently returned an empty list; list scans now retry once when empty.

### Checks (read-only)
- Web: `tsc` clean; production builds for devnet and mainnet. Extension: build + build:mainnet, 23 unit tests pass.
- HGTEST page on mainnet dev: price 0.0₈174 NVDAx per HGTEST, 0.05% to hatch (0.002054 / 3.9066 NVDAx),
  quote shown as NVDAx (Token-2022); hidden from the home list.
- Jupiter quote 0.001 SOL → NVDAx: 49836 raw out, 49338 min (Meteora DLMM).

### Known limits
- `NEXT_PUBLIC_RPC_URL` is in the browser bundle. Before deploying, use a separate RPC key restricted to
  the site's domain (or a proxy).
- Pay with SOL depends on Jupiter's free lite-api (rate limits) and leaves any quote-token surplus above
  Jupiter's minimum in the wallet. First buy also pays ~0.0016 SOL rent for the NVDAx account.
- Only NVDA is pairable on mainnet; other stocks need a config each (`STOCK_CONFIGS`).
- Rate limits for AI endpoints are in memory per server instance.
- Not tested with a real wallet signing on mainnet; the operator does the first buy.

## Phase 3c: production (Vercel) + extension release

- **Web app:** https://hatchem.fun, the canonical domain (Vercel project `hatch`, root directory `web/`, mainnet;
  www.hatchem.fun redirects to it). https://hatchfun.vercel.app serves the same app with no redirects, because
  extension 0.6.2 calls its /api/* and links wallets only on that origin; canonical tags point to hatchem.fun.
  Connected to GitHub `shrooms08/hatch`: every push to `master` deploys production.
- **Extension:** v0.1.0, ID `knfkjiebkbhddjogcbniiachhomkmdkm`. Download:
  https://pub-d237e2e1ade348e0af7801e5588300ab.r2.dev/releases/hatch-extension-v0.1.0.zip
  (also on the GitHub release https://github.com/shrooms08/hatch/releases/tag/v0.1.0, private while the repo is).
  Install steps are on https://hatchem.fun/extension.

### RPC: no provider key in the browser
The browser's Solana RPC is Hatch's own same-origin proxy, `POST /api/rpc`
(`NEXT_PUBLIC_RPC_URL=/api/rpc`; an absolute `.../api/rpc` value is rewritten to the page's own origin, so it
works on hatchem.fun and hatchfun.vercel.app alike). It forwards to the
server-only `HATCH_SERVER_RPC_URL` (falls back to `RPC_URL`):
- allowlisted methods only: getAccountInfo, getMultipleAccounts, getBalance, getTokenAccountBalance,
  getTokenAccountsByOwner, getProgramAccounts (Meteora DBC program only), getLatestBlockhash,
  getBlockHeight, getSlot, getBlockTime, getSignatureStatuses, getFeeForMessage,
  getRecentPrioritizationFees, getMinimumBalanceForRentExemption, simulateTransaction, sendTransaction;
- same origin only (requests without a matching `Origin` get 403), 120 requests per minute per IP,
  batches of up to 25 calls, bodies over 200 KB rejected (413);
- HTTP only: transactions confirm by polling `getSignatureStatuses` (no websocket subscriptions).

A refused method shows up in the Vercel logs as `rpc proxy refused: …`; add it to `ALLOWED` in
`web/src/pages/api/rpc.ts` if the app legitimately needs it.

### Production settings
- AI: 10 drafts and 30 notices per IP per hour; `AI_DAILY_CAP` (default 300) drafts per server
  instance per day, then "Hatch is resting, try again later".
- CORS for extension routes: the site's own origin and `chrome-extension://knfkjiebkbhddjogcbniiachhomkmdkm`.
- `NEXT_PUBLIC_ENABLE_JUPITER_DATA=false` (Hatch reads pools from chain; the Jupiter indexer features were not verified on mainnet).
- Vercel production env: `NEXT_PUBLIC_SOLANA_NETWORK`, `NEXT_PUBLIC_RPC_URL`, `HATCH_SERVER_RPC_URL`, `RPC_URL`,
  `POOL_CONFIGS`, `STOCK_CONFIGS`, `HIDDEN_MINTS`, `R2_*`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL_DRAFT`,
  `ANTHROPIC_MODEL_FAST`, `NEXT_PUBLIC_PRIORITY_FEE_MICROLAMPORTS`, `NEXT_PUBLIC_ENABLE_JUPITER_DATA`, `AI_DAILY_CAP`.
  Secrets are stored as sensitive. Change one with `printf '%s' "$VALUE" | npx vercel env add NAME production --force`
  (add `--sensitive` for secrets, `--type config` for `NEXT_PUBLIC_*`), then redeploy.
- `.vercelignore` limits CLI uploads to `web/` (never `scripts/keys`, env files or the extension key).
- `web/package.json` pins `rpc-websockets`' `uuid` to v11: v14 is ESM-only and crashed every API route on Vercel.

### Redeploy
```bash
git push origin master          # auto-deploys production
npx vercel --prod               # or deploy the working tree from the repo root
npx vercel logs -p hatch --since 30m --level error   # runtime errors
```

### Rebuild the extension release
```bash
cd extension
# bump "version" in package.json, then:
pnpm zip:prod                   # dist-prod + hatch-extension-v<version>.zip (prod URL, mainnet, no debug page)
cd ../web && node --env-file=.env.mainnet.local --import tsx -e "require('./src/lib/server/r2.ts').uploadToR2('releases/hatch-extension-v<version>.zip', require('fs').readFileSync('../extension/hatch-extension-v<version>.zip'), 'application/zip').then(console.log)"
gh release create v<version> extension/hatch-extension-v<version>.zip --repo shrooms08/hatch
```
Update `EXTENSION_VERSION` in `web/src/pages/extension.tsx` so the download button points at the new zip.

### Checks (read-only, production)
Home loads; HGTEST page by direct link shows price 0.0₈1741 NVDAx per HGTEST, 0.06% to hatch, NVDAx
quote, loaded entirely through `/api/rpc` (no direct RPC hosts, no websockets); `/extension` download
returns the zip (identical to the release asset); `/api/stocks` returns NVDA; one draft from the
production extension build (origin `chrome-extension://knfkjiebkbhddjogcbniiachhomkmdkm`) returned a
STOCK/NVDA draft with a generated image. Live browser JS (26 files) contains no `helius` or `api-key`.
