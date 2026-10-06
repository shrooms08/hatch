/** Build-time configuration. WXT exposes `WXT_*` env vars to the bundle (see wxt.config.ts). */
export const HATCH_WEB_URL = ((import.meta.env.WXT_HATCH_WEB_URL as string | undefined) ?? "http://localhost:3000").replace(/\/$/, "");
export const HATCH_WEB_ORIGIN = new URL(HATCH_WEB_URL).origin;

export type HatchNetwork = "devnet" | "mainnet-beta";
export const NETWORK: HatchNetwork = (import.meta.env.WXT_HATCH_NETWORK as string | undefined) === "mainnet-beta" ? "mainnet-beta" : "devnet";

/** How often the background refreshes the user's hatches while a wallet is known. */
export const POLL_MINUTES = 1;

export const tokenPageUrl = (mintOrPath: string) =>
  mintOrPath.startsWith("/") ? `${HATCH_WEB_URL}${mintOrPath}` : `${HATCH_WEB_URL}/token/${mintOrPath}`;
