# Hatch — Phase 1: web app (devnet)

Date: 2026-10-02. Network: **devnet only**. Code: `web/` (Next.js pages router, forked from `meteora-invent/scaffolds/fun-launch`), `scripts/` (devnet ops).

## What changed

### Fork (`web/`)
- **Standalone app.** It has no workspace links back to meteora-invent. The shared tsconfig and prettier presets are inlined.
- **Pinned packages:** `@meteora-ag/dynamic-bonding-curve-sdk` **1.5.13**, `@meteora-ag/cp-amm-sdk` 1.5.1, `@solana/web3.js` v1.
- **Wallet adapters:** `@solana/wallet-adapter-wallets` was replaced by `@solana/wallet-adapter-phantom` + `-solflare`. The bundle's Ledger import broke `next build`. The Jupiter Unified Wallet kit is still the provider.
- **Builds are type-checked.** `typescript.ignoreBuildErrors` is now `false`. `strictNullChecks` stays off, as in the scaffold.
- **Branding** is renamed to "Hatch" (header, titles, wallet metadata) with no visual redesign. Logic lives in `src/lib/**` and `src/hooks/useHatch.ts`. The new UI is thin components in `src/components/Hatch/**`, ready for a restyle.

### Presets
- `src/lib/presets/index.ts` defines `MEME`, `STOCK` and `AI_AGENT`. Each has an id, label, one-line description, quote mint/symbol/decimals, and a plain-English explainer.
- The STOCK explainer includes: *"This token is not the stock. Its pool holds tokenized NVIDIA. The stock token's issuer can pause transfers."*
- Config keys come only from the server env `POOL_CONFIGS` (`src/lib/server/presets.ts`). `GET /api/presets` exposes the enabled presets and their (public) config keys to the UI.

| Preset | Quote | Devnet config | Curve |
|---|---|---|---|
| MEME | SOL | `4k48Svg4Zn7Fpp7Lc6t1P2Y7PkXoV8twrS36DpgTVwyt` | `buildCurve`, 20% supply to LP, 1 SOL threshold, 50/50 fees |
| STOCK | mock NVDAx (Token-2022) `EXcqWhNFD5wxiC6a2SQLB6gmxRvvxAFBTqsPafwhqBd3` | `9gyZQhjTWfeJES11Assg6MH77Qt6qLT9GaFxaeuKjNbR` | `buildCurve`, 25% to LP, 50 NVDAx threshold, 50/50 fees |
| AI_AGENT | SOL | `3nWaiTnWDUNhFJpmrUrG2h2ct5SHy7jGVpJiH97tUZ53` | `buildCurve`, 35% to LP (≈3.4× price run vs ≈16× for MEME), 1 SOL threshold, 80% creator fee share, creator LP 70%+5% locked |

The AI_AGENT config was created by `pnpm create-agent-config --live` (simulated first): [tx](https://explorer.solana.com/tx/21fhuJJ7EFHtDRB6j5EmT3Qo5q1yZrxxrZX8e4M7jLF2r4qNgLcRxRfMxr6troYa7QgWdCqSW8cNp6gSQNHTnBQ4?cluster=devnet).

`pnpm faucet-nvdax <ADDRESS> [AMOUNT]` mints mock NVDAx on devnet. It is dev-only, simulates first, and caps each call at 1,000,000.

### Launch flow (`/launch`, alias `/create-pool`)
**Form:**
- Preset picker (presets missing from `POOL_CONFIGS` are disabled).
- Name, symbol, description, image (file or URL), and optional website/twitter.
- The preset explainer sits directly above the **Hatch it** button.

**Prefill:** `?name=&symbol=&description=&image=&preset=&source=`.
- `preset` accepts `MEME`, `stock`, `ai-agent`, and similar spellings.
- `source` is stored in the metadata JSON as `external_url`.
- The token page shows **Inspired by \<domain\>**.

**`POST /api/upload`:**
1. Validates the input with zod (shared with the client).
2. Looks the preset up in the `POOL_CONFIGS` allowlist and rejects unknown presets.
3. Uploads the image and metadata JSON to R2.
4. Returns the **unsigned** `createPool` transaction.

The token badge is passed automatically when one exists for the quote mint.

**Client** (`src/lib/launch/client.ts`):
1. Generates the mint keypair.
2. Simulates the transaction.
3. `wallet.sendTransaction(tx, connection, { signers: [mint] })`: Phantom signs **and sends**.

### Trading for any quote mint
- **Builder:** `src/lib/dbc/transactions.ts` uses `swapQuote2` + `swap2` (ExactIn) with an explicit min-out. Slippage choices are 0.5%, 1% or 2%.
- **Quote token:** the quote mint and its token program come from the pool config, so Token-2022 quotes work.
- **SOL** is wrapped and unwrapped by the SDK.
- **Badges:** swaps need no token badge; only config and pool creation take one.
- **Display:** `src/lib/solana/mint.ts` handles SPL and Token-2022. It applies the `scaledUiAmount` multiplier to every displayed amount and price, and reverses it for input amounts.
- **Trade widget** (`TradePanel`): quote and base balances, estimated output, minimum after slippage, and a Max button that keeps 0.01 SOL for fees.

### Token page from chain (`/token/<mint>`)
`useHatchPool` → `fetchHatchPoolByMint` (DBC SDK, RPC only) shows:
- price in the quote token;
- curve progress toward the migration threshold;
- status: **Incubating**, **Almost hatched** (≥ 80%), or **Hatched** (migrated);
- the DAMM v2 pool with an explorer link once hatched.

**Claim creator fees** appears only when the connected wallet is the pool creator. The app builds `claimCreatorTradingFee` and Phantom signs and sends it.

### My Hatches (`/my-hatches`)
Lists pools where `creator == connected wallet` under the three config keys. Each row shows status, progress and claimable creator fees. The home page (`/`) lists every pool under the three configs, read from chain.

### Security
- **Relay removed:** `/api/send-transaction` is deleted (and so is the dead `useSendTransaction` hook). The server never sends user transactions.
- **Upload limits:**
  - Images: png, jpg, webp or gif only, verified by **magic bytes**; at most 2 MB (checked on the client and the server); body limit 3 MB.
  - Fields: name ≤ 32 chars; symbol 1–10 chars, `A-Z0-9`; description ≤ 500; URLs http(s).
- **Prefill image URLs** are fetched server-side:
  - private/localhost hosts are refused;
  - redirects are followed by hand, at most 3, and each hop is re-checked;
  - downloads are size-capped while streaming;
  - 10 s timeout.
- **Missing R2 env** → HTTP 503 `{"error":"R2 not configured"}`, not a crash.
- **Priority fee:** `NEXT_PUBLIC_PRIORITY_FEE_MICROLAMPORTS` (default 100,000), plus a compute-unit limit, on every transaction the app builds (`addPriorityFee`).

### Feature flags
`NEXT_PUBLIC_ENABLE_JUPITER_DATA=false` (default) hides everything that depends on undocumented Jupiter endpoints, which only index mainnet. The code is kept, not deleted:
- explore lists and search (`datapi.jup.ag`, `trench-stream`);
- TradingView chart;
- txns and holders tables;
- token stats header;
- the Jupiter Plugin swap widget and its script tag.

## Env vars (`web/.env.example`)
| Var | Side | Devnet `.env.local` |
|---|---|---|
| `NEXT_PUBLIC_SOLANA_NETWORK` | both | `devnet` |
| `RPC_URL` | server | `https://api.devnet.solana.com` |
| `NEXT_PUBLIC_RPC_URL` | browser | `https://api.devnet.solana.com` |
| `POOL_CONFIGS` | server | filled from `scripts/state/devnet.json` |
| `NEXT_PUBLIC_STOCK_QUOTE_MINT` | browser | mock NVDAx mint |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_PUBLIC_URL` | server | **empty: you must fill these** |
| `NEXT_PUBLIC_PRIORITY_FEE_MICROLAMPORTS` | browser | `100000` |
| `NEXT_PUBLIC_ENABLE_JUPITER_DATA` | browser | `false` |

## How to run
```bash
cd web && pnpm install && pnpm dev     # http://localhost:3000
cd web && pnpm build                   # type-checked production build
cd scripts && pnpm faucet-nvdax <YOUR_PHANTOM_ADDRESS> 1000   # get mock NVDAx to test STOCK buys
```
For Phantom on devnet: Settings → Developer Settings → Testnet mode → Solana Devnet.

## Verification done
- **`pnpm build`** passes with type checking on.
- **Dev server:** `/`, `/launch` (with and without prefill), `/create-pool`, `/my-hatches`, `/token/<mint>` and `/api/presets` return 200. `/api/send-transaction` returns 404.
- **`/api/upload`** returns 400 for invalid name/symbol and for unknown presets, 503 `R2 not configured` with R2 empty, and 405 for GET.
- **Web lib against devnet** (the same code the pages run):
  - Reads: the pool reader found the two Step 3 pools, and the statuses and DAMM v2 addresses match. The Metaplex and Token-2022 metadata parsers work.
  - Simulated: creator fee claims on both pools.
  - Sent: the launch builder made a live STOCK test pool, `Ft9BTsYLKy8XGGxhXeBqh4KVjNyRZsLFt9CyXixZ9ped` (pool `2bSz4brh1ahbDiTZJZDMW6TbuAR9d9xfrhFK9xnGDDcb`), [tx](https://explorer.solana.com/tx/3rbMyuQyTa5YxBLSnPuNghAxwJUaQCvhrLk2GqGjj73iRsnZ5UGoLzb9NJp6bmPU2vQkmVRKTA8Jn48rwkYobSAi?cluster=devnet).
  - Sent: the swap builder bought 1 NVDAx worth of it, [tx](https://explorer.solana.com/tx/4PHKy64iRmoYpbGi7ToEgDZVYUmE6cEuGPASTmZuCaHAua4K2xPEDLRhy9J2d7ND8yhQ7nVUcfCYKAbdhLDRCgci?cluster=devnet).
  - Simulated: a sell.
- **Not done:** Phantom clicks (signing in the browser) are for you to test.

## Known limits
- **R2 must be configured** before any launch works. Without it, upload returns "R2 not configured".
- **After hatching**, the trade widget links to the DAMM v2 pool instead of trading it in-app. cp-amm SDK swaps are not wired yet.
- **Pool lists** (home, My Hatches) use `getProgramAccounts` filtered by config or creator. This works on public devnet RPC but will need a premium RPC or an indexer at scale on mainnet.
- **Token-badge path is untested.** It is only exercised by real xStocks on mainnet. The launch builder passes the badge when it exists.
- **Image URL fetching** blocks private hosts by hostname only (no DNS-resolution check).
- **No first buy at launch, and no partner (Hatch) fee-claim UI.** Partner claims stay script-side.
- **Lint and nulls:** ESLint is not part of `build`, and `strictNullChecks` is still off, as in the scaffold.
