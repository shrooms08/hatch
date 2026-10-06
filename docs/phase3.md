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
These values are not applied yet (the web app is still on devnet). Set them when switching:
`NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta`, `RPC_URL`/`NEXT_PUBLIC_RPC_URL` = the Helius URL,
`POOL_CONFIGS={"MEME":"HjeeZN7aDtgfAoiVh8F17GeAKVAg4DFJsHx8Ap2GUfqv","STOCK":"HX9EjDXFjazM5gLyN2hUG5SRsH9BMorKi1EhVVw1BzJ6","AI_AGENT":"HjeeZN7aDtgfAoiVh8F17GeAKVAg4DFJsHx8Ap2GUfqv"}`,
`NEXT_PUBLIC_STOCK_QUOTE_MINT=Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh`.

### Notes
- `scripts/.env` originally held the whole Helius URL pasted into its `api-key` parameter (HTTP 401).
  It was repaired to the single working URL; the original is kept as `scripts/.env.bak` (gitignored).
- Confirmations were typed through an `expect` wrapper that waits for the "Type YES MAINNET" prompt.
  A first attempt piped the text in too early, and the prompt aborted without sending anything.
