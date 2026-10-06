// Jupiter Swap API (lite-api, no key) for the one SOL -> NVDAx test swap.
import { PublicKey, VersionedTransaction } from '@solana/web3.js'

const JUP = process.env.JUPITER_API_URL || 'https://lite-api.jup.ag'

export type JupQuote = {
  inAmount: string
  outAmount: string
  otherAmountThreshold: string
  slippageBps: number
  priceImpactPct: string
  routePlan: { swapInfo: { label: string } }[]
  [k: string]: unknown
}

/**
 * Quote. Direct routes by default: a multi-hop route leaves an intermediate token account open
 * (e.g. USDC, ~0.0015 SOL rent) that a $0.50 swap can't afford.
 */
export async function jupQuote(inputMint: PublicKey, outputMint: PublicKey, amount: bigint, slippageBps: number, opts: { direct?: boolean } = {}): Promise<JupQuote> {
  const direct = opts.direct ?? true
  const url = `${JUP}/swap/v1/quote?inputMint=${inputMint.toBase58()}&outputMint=${outputMint.toBase58()}&amount=${amount}&slippageBps=${slippageBps}&restrictIntermediateTokens=true&onlyDirectRoutes=${direct}`
  const r = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  const j = (await r.json()) as JupQuote & { error?: string }
  if (!r.ok || j.error || !j.routePlan) throw new Error(`Jupiter quote failed: ${j.error ?? r.status}`)
  return j
}

/** Swap transaction for `user`, with an explicit minimal priority price (we're not racing anyone). */
export async function jupSwapTx(quote: JupQuote, user: PublicKey, computeUnitPriceMicroLamports = 1_000): Promise<VersionedTransaction> {
  const r = await fetch(`${JUP}/swap/v1/swap`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: user.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      computeUnitPriceMicroLamports,
    }),
    signal: AbortSignal.timeout(20_000),
  })
  const j = (await r.json()) as { swapTransaction?: string; error?: string }
  if (!r.ok || !j.swapTransaction) throw new Error(`Jupiter swap build failed: ${j.error ?? r.status}`)
  return VersionedTransaction.deserialize(Buffer.from(j.swapTransaction, 'base64'))
}
