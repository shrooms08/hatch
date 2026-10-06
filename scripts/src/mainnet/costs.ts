// Cost model for the mainnet plan (lamports). Rent is read live by the estimator from these REAL
// account sizes. Launch numbers were MEASURED on mainnet on 2026-10-06 by simulating DBC
// createConfigAndPool against the real NVDAx mint + token badge (stand-in funded fee payer,
// sigVerify off, nothing sent) and reading the payer's post-simulation balance.

/** DBC PoolConfig account (bytes), read from a real config. */
export const CONFIG_BYTES = 1048
/**
 * NVDAx token account (wallet ATA and DBC quote vault): 179 bytes, measured on mainnet. NOT the 478
 * that spl-token's getAccountLenForMint() reports (it adds the optional confidential-transfer account).
 */
export const NVDAX_TOKEN_ACCOUNT_BYTES = 179
/** Base token account for the buy: SPL 165; Token-2022 base (metadata-only mint) 170 incl. ImmutableOwner. */
export const BASE_TOKEN_ACCOUNT_BYTES = { spl: 165, token2022: 170 } as const

/**
 * createPool on the STOCK (NVDAx) config, excluding tx fees: pool (424 B) + base mint + base vault +
 * NVDAx quote vault (179 B) + metadata. SPL base adds a 607-byte Metaplex metadata account AND Metaplex's
 * 0.01 SOL protocol fee; a Token-2022 base keeps metadata in the mint, so neither.
 * (mainnet sim: config+pool 26,621,520 spl / 14,741,920 token2022, minus config rent 5,974,080)
 */
export const STOCK_LAUNCH = { spl: 20_647_440, token2022: 8_767_840 } as const

export const SIG_FEE = 5_000
/** Signatures per transaction: config (payer + config), launch (payer + base mint), swap/buy (payer). */
export const SIGS = { config: 2, launch: 2, swap: 1, buy: 1 } as const
/** CU used per simulation (rounded up), for the minimal priority fee. */
export const APPROX_CU = { config: 45_000, launch: 120_000, swap: 100_000, buy: 80_000 } as const
