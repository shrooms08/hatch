/** Build-time configuration. WXT exposes `WXT_*` env vars to the bundle (see wxt.config.ts). */
export const HATCH_WEB_URL = ((import.meta.env.WXT_HATCH_WEB_URL as string | undefined) ?? "http://localhost:3000").replace(/\/$/, "");
export const HATCH_WEB_ORIGIN = new URL(HATCH_WEB_URL).origin;
/** Every origin serving the web app: HATCH_WEB_URL first, then WXT_HATCH_ALT_WEB_URLS (e.g. the old vercel.app domain). */
export const HATCH_WEB_ORIGINS: string[] = [
  ...new Set([
    HATCH_WEB_ORIGIN,
    ...((import.meta.env.WXT_HATCH_ALT_WEB_URLS as string | undefined) ?? "")
      .split(",")
      .map((u) => u.trim())
      .filter(Boolean)
      .map((u) => new URL(u).origin),
  ]),
];

/**
 * Dev builds only (build:dev): other web apps the link features may point at for testing, e.g. a local devnet
 * server (http://localhost:3200). Empty in every other build, so the "Web app" dev setting does not exist there.
 */
export const DEV_WEB_URLS: string[] = ((import.meta.env.WXT_HATCH_DEV_WEB_URLS as string | undefined) ?? "")
  .split(",")
  .map((u) => u.trim().replace(/\/$/, ""))
  .filter(Boolean);

/** The web app the link features talk to: the dev setting when it names an allowed dev URL, else HATCH_WEB_URL. */
export function linkWebBase(devWebBase: string | null | undefined): string {
  return devWebBase && DEV_WEB_URLS.includes(devWebBase) ? devWebBase : HATCH_WEB_URL;
}

export type HatchNetwork = "devnet" | "mainnet-beta";
export const NETWORK: HatchNetwork = (import.meta.env.WXT_HATCH_NETWORK as string | undefined) === "mainnet-beta" ? "mainnet-beta" : "devnet";

/** How often the background refreshes the user's hatches while a wallet is known. */
export const POLL_MINUTES = 1;

export const tokenPageUrl = (mintOrPath: string) =>
  withPreviewBypass(mintOrPath.startsWith("/") ? `${HATCH_WEB_URL}${mintOrPath}` : `${HATCH_WEB_URL}/token/${mintOrPath}`, true);

/**
 * Preview builds only (build:preview): Vercel's protection-bypass secret for a protected preview
 * deployment, sent as a query parameter so it also passes CORS preflights. Empty in real builds.
 */
const VERCEL_BYPASS = (import.meta.env.WXT_VERCEL_BYPASS as string | undefined) ?? "";

/** Adds the preview bypass to a web app URL (and asks Vercel to set the bypass cookie for opened pages). */
export function withPreviewBypass(url: string, setCookie = false): string {
  if (!VERCEL_BYPASS) return url;
  const u = new URL(url);
  u.searchParams.set("x-vercel-protection-bypass", VERCEL_BYPASS);
  if (setCookie) u.searchParams.set("x-vercel-set-bypass-cookie", "samesitenone");
  return u.toString();
}

/** A web app page the panel opens in a tab (preview builds add the bypass). */
export const webUrl = (path = "") => withPreviewBypass(`${HATCH_WEB_URL}${path}`, true);
