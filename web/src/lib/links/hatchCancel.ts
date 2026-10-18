// /link: when may the client release its reservation early? Only when the transaction cannot have been broadcast.
//   - the wallet did not sign (rejected, popup closed): nothing signed exists, it can never land
//   - the RPC refused the send before broadcasting it (preflight simulation failed, or the request was rate limited)
// A network error or timeout while sending is ambiguous (it may have gone out), so the reservation is kept; it frees
// itself after 120 s, longer than a blockhash lives, so it can never be taken over while the transaction could land.

/** The send was refused before broadcast (safe to release). Everything else after signing is treated as maybe-sent. */
export function sendRefusedBeforeBroadcast(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  return /simulation failed|preflight|429|too many requests|rate limit/i.test(msg);
}

export const CANCELLED_COPY = 'Cancelled. The link is free again, you can hatch it now.';
export const MAYBE_SENT_COPY = "We couldn't tell whether your transaction went out. If it didn't land, the link frees itself within 2 minutes.";
