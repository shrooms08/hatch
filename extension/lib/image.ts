/**
 * Images in the side panel load through the Hatch web app (GET /api/image-proxy): extension CSP and
 * sites' hotlink blocking can't break them, and the image's site sees Hatch, not the user.
 */
import { HATCH_WEB_URL, withPreviewBypass } from "./config";

export function panelImageSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith(HATCH_WEB_URL) || url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (!/^https?:\/\//i.test(url)) return null;
  return withPreviewBypass(`${HATCH_WEB_URL}/api/image-proxy?url=${encodeURIComponent(url)}`, true);
}
