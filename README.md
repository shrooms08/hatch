# Hatch

**Launch anything you see.**

A Chrome buddy that spots coin-worthy pages, drafts a token with AI, and launches it on Meteora's
Dynamic Bonding Curve. The headline feature: **stock-paired launches**, where the pool is priced in
tokenized NVIDIA (NVDAx) instead of SOL, and buyers can still pay with plain SOL.

![Hatch: home page](docs/media/home.png)

<!-- Demo GIF slot: docs/media/demo.gif -->

- **Spot it.** A little dot-matrix chicken floats on the page. On a stock page or a tweet it turns into an egg and offers a coin idea.
- **Draft it.** The side panel drafts name, ticker, description, preset and image with AI. You edit it in plain words ("shorter ticker").
- **Hatch it.** One click opens the web app prefilled. You sign with your own wallet. The token incubates on a Meteora bonding curve and hatches into a full Meteora pool.

**Live:** [hatchfun.vercel.app](https://hatchfun.vercel.app) · **Extension:** [download for Chrome](https://hatchfun.vercel.app/extension) (load unpacked, ID `knfkjiebkbhddjogcbniiachhomkmdkm`)

| Token page | Side panel | Hatched! |
|---|---|---|
| ![Token page](docs/media/token-page.png) | ![Side panel](docs/media/extension-side-panel.png) | ![Hatched moment](docs/media/hatched-moment.png) |

## How Hatch uses Meteora

- **DBC configs as presets.** Each launch preset (Stock-paired, Meme) is a Dynamic Bonding Curve config Hatch created and owns as partner. The server only builds launches against this allowlist.
- **Stock-paired launches.** The STOCK config's quote token is NVDAx, the real xStock (Token-2022 with a scaled UI amount, permanent delegate and pausable). It uses the **Meteora token badge** for NVDAx so DBC accepts it as a quote mint.
- **Token-2022 base tokens.** Every launch mints a Token-2022 base token: no Metaplex fee, metadata in the mint.
- **Partner fees to Hatch.** Trades pay a 1% fee (plus DBC's dynamic fee), split 50/50 between the token's creator and Hatch as partner. Creators claim from the token page; the partner claims with `scripts/claim-partner-fees-mainnet`.
- **Auto-graduation.** When the quote raised reaches the config's threshold, Meteora's keepers migrate the pool to **DAMM v2**. The STOCK threshold (3.9 NVDAx ≈ $940) is set above the keepers' $750 minimum.
- **Pay with SOL.** For NVDAx-quoted pools, a buyer with no NVDAx pays SOL: Hatch builds **one versioned transaction** with Jupiter's SOL→NVDAx swap and the DBC buy. Both legs are slippage-protected; the DBC leg spends Jupiter's guaranteed minimum. It falls back to two steps if a route is too large.

## Live on mainnet

| What | Address |
|---|---|
| STOCK-NVDAx config | [`HX9EjDXFjazM5gLyN2hUG5SRsH9BMorKi1EhVVw1BzJ6`](https://solscan.io/account/HX9EjDXFjazM5gLyN2hUG5SRsH9BMorKi1EhVVw1BzJ6) |
| MEME config (SOL quote, 10 SOL threshold) | [`HjeeZN7aDtgfAoiVh8F17GeAKVAg4DFJsHx8Ap2GUfqv`](https://solscan.io/account/HjeeZN7aDtgfAoiVh8F17GeAKVAg4DFJsHx8Ap2GUfqv) |
| NVDAx (quote) · DBC token badge | [`Xsc9qvGR…x9qEh`](https://solscan.io/token/Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh) · [`mfacWnGh…9vBM`](https://solscan.io/account/mfacWnGh1Kn5ttHMMaNZhRZbCjvGrDQyDyZgqaR9vBM) |
| HGTEST mint ("Hatch Genesis Test", a test launch) | [`Eekou3Ckcd2Hxk1MaeVepRafCH6SHU7sybNrifizUZfb`](https://solscan.io/token/Eekou3Ckcd2Hxk1MaeVepRafCH6SHU7sybNrifizUZfb) |
| HGTEST DBC pool | [`6rnqNK44b77XUWcYBF1MCkzdfnfY6nCME7C6KhXkUTG1`](https://solscan.io/account/6rnqNK44b77XUWcYBF1MCkzdfnfY6nCME7C6KhXkUTG1) |

| Key transaction | Solscan |
|---|---|
| Create STOCK-NVDAx config | [2DrbY9…NoqGWN](https://solscan.io/tx/2DrbY9Fj1xDo7gS6f9ymwx65vmuHzCyduHdB9RmY97kR4mLksVTbdBFwDrJPxF9MKfkCAtHCYPTBZKXQFhoNoGWN) |
| Launch HGTEST (Token-2022 base, NVDAx quote) | [3onf33…Es3vbH](https://solscan.io/tx/3onf33ZByRzzHctAyKuM6ZgMu7YexD9tU3KKf6Dh6rTd1hNfHs5eiM1hvoDabvZApdCqJ8iZiKTiuf97a4Es3vbH) |
| Jupiter SOL → NVDAx | [5Sso5s…MkUAg5o](https://solscan.io/tx/5Sso5sATTXx7vgPqFQxVHkzagrpFFzRb7sGdGSzH61e3ownHemtw5ubh5R2sADMoNjJQhvkHQeNFD6sX2MkUAg5o) |
| First buy of HGTEST with NVDAx | [552BV4…rjqj6Kq](https://solscan.io/tx/552BV4veLmonNWKmiXeFKZKbAk1Gtm4NqPXzCvsGojHTn5oBQ95fe5YPdejLZGEE94CjKau6KyL2SKGx9rjqj6Kq) |
| Create MEME config | [3aEnFx…j81qdDzF](https://solscan.io/tx/3aEnFxMePdsvYSUfgAbfhUXYTCnJqhsNoqSR6SgBr4c8yqnR38PXNUKf6tmhnPzD5a6Q9z4HjytuaHpnj81qdDzF) |

## Architecture

```mermaid
flowchart LR
  ext["Chrome extension<br/>(buddy + side panel)"] -->|"drafts, notices, hatches"| api["Hatch web app API<br/>(Next.js on Vercel)"]
  browser["Web app in the browser<br/>(wallet signs + sends)"] -->|"/api/rpc (allowlisted)"| api
  api --> anthropic["Anthropic<br/>(drafts, notices)"]
  api --> helius["Helius RPC<br/>(server-side key)"]
  api --> r2["Cloudflare R2<br/>(images, metadata)"]
  browser --> dbc["Meteora DBC<br/>(launch, buy, sell, claim)"]
  browser --> jup["Jupiter<br/>(SOL → NVDAx quote)"]
  dbc -->|"keepers on graduation"| damm["Meteora DAMM v2"]
```

More in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Privacy

- The extension holds **no keys, wallets or API keys**. All AI calls go through the Hatch server.
- **Automatic hints** happen only on stock pages and tweets (a setting turns them off), once per page. They send the page title, URL without query string or hash, and a short text excerpt.
- **Drafts** happen when you ask, except that stock pages and tweets are drafted when you open the panel. They send the page title, URL without query or hash, visible text and image links.
- The only identifier stored is your public wallet address, reported by the web app after you connect.
- No `tabs` permission: the page and its URL come from Hatch's own content script.

## Security notes

- **The server never signs.** `/api/upload` returns an unsigned transaction; your wallet signs and sends it.
- **Config allowlist.** Launches are built only against Hatch's own DBC configs; unlisted stocks are refused.
- **Write-once metadata.** Uploads are refused for mints that already exist, and R2 objects are create-only, so a live token's metadata can't be replaced.
- **RPC proxy.** The browser's RPC is `/api/rpc`: allowlisted methods, `getProgramAccounts` only on DBC and only with filters, batches of at most 5, per-IP budget. The provider key stays server-side.
- **Rate limits and caps.** Per-IP limits on every route, plus daily caps on AI calls. Fetching user-supplied image URLs is SSRF-guarded: DNS is resolved and private ranges are refused.

## Run locally

```bash
# web (Next.js): devnet by default
cd web && pnpm install
cp .env.example .env.local             # fill in R2, Anthropic, RPC
pnpm dev                               # http://localhost:3000
pnpm dev:mainnet                       # mainnet, reads .env.mainnet.local (see .env.mainnet.example)
pnpm test                              # unit tests

# extension (WXT, Chrome MV3)
cd extension && pnpm install
pnpm build                             # dist/chrome-mv3 -> chrome://extensions -> Load unpacked
pnpm build:prod                        # against https://hatchfun.vercel.app
pnpm test

# scripts (configs, launches, fee claims): devnet by default, simulate-first
cd scripts && pnpm install && cp .env.example .env
pnpm status-mainnet                    # read-only
pnpm claim-partner-fees-mainnet        # simulates; --mainnet --live + typed YES MAINNET to send
```

## Roadmap

- More xStocks (TSLA, AAPL, …): each needs its own DBC config with a token badge.
- Anti-sniper fee schedules on new launches.
- Fee routing to the original creator of the page a token was hatched from.
- A dedicated AI-agent curve (the preset is hidden on mainnet until it has its own config).
- Voice: talk to the buddy.

## Credits

Built on Meteora's fun-launch scaffold and SDKs. The orb uses thinking-orbs. See [CREDITS.md](CREDITS.md) and [LICENSE](LICENSE).
