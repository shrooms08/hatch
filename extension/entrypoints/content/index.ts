import "./buddy.css";
import { defineContentScript } from "wxt/utils/define-content-script";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";
import { browser } from "wxt/browser";
import { DEV_WEB_URLS, HATCH_WEB_ORIGINS } from "../../lib/config";
import { canAutoNotice, detectFromDom } from "../../lib/detect";
import { clean, collectPageContext } from "../../lib/page";
import { sendToBackground, type LinkLookupResponse, type NoticeResponse, type TabMessage } from "../../lib/messages";
import { createUrlWatcher, linkTarget } from "../../lib/linkCheck";
import { DEFAULT_EGG_POS, KEYS, getLocal, getSettings, incubatingCount, isHiddenOn, setLocal, updateSettings, type EggPos, type HatchesCache, type Settings } from "../../lib/storage";
import { BuddyView } from "./buddy";
import { collectHeadlines, localHint, matchHeadlines } from "../../lib/newsMatch";
import type { StockMap } from "../../lib/types";

/**
 * Content script on every page: the floating egg, local page detection, and answering the side
 * panel's "what's on this page?" request. Never calls the web app itself (the background does).
 */
export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  runAt: "document_idle",
  cssInjectionMode: "ui",
  async main(ctx) {
    if (window.top !== window) return; // top frame only
    if (HATCH_WEB_ORIGINS.includes(location.origin)) return; // the web app has its own UI (and the bridge script)
    if (DEV_WEB_URLS.some((u) => new URL(u).origin === location.origin)) return; // dev builds: the local web app

    let egg: BuddyView | null = null;
    let ui: Awaited<ReturnType<typeof createShadowRootUi>> | null = null;
    let settings: Settings = await getSettings();
    let pendingHatch = false;
    // Link coins (checkLink below): the page URL whose link bubble is showing, the last URL checked, a request counter.
    let linkShownFor: string | null = null;
    let linkChecked = "";
    let linkSeq = 0;
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && pendingHatch) {
        pendingHatch = false;
        void egg?.hatch();
      }
    });

    // The side panel asks for page context even when the egg is hidden.
    browser.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
      const msg = raw as TabMessage;
      switch (msg?.type) {
        case "get-context":
          sendResponse(collectPageContext());
          return false;
        case "egg-state":
          egg?.setState(msg.state);
          return false;
        case "bubble":
          egg?.showBubble(msg.text, { url: msg.url, linkText: "View" });
          return false;
        case "hatch":
          // Play when the user can see it: now, or the next time this tab is shown.
          if (document.hidden) pendingHatch = true;
          else void egg?.hatch();
          return false;
        default:
          return false;
      }
    });

    async function mount() {
      if (ui || isHiddenOn(settings, location.hostname)) return;
      const pos = await getLocal<EggPos>(KEYS.eggPos, DEFAULT_EGG_POS);
      ui = await createShadowRootUi(ctx, {
        name: "hatch-egg",
        position: "inline",
        anchor: "body",
        append: "last",
        onMount(container) {
          egg = new BuddyView(container, pos, {
            onOpen: () => void sendToBackground({ type: "open-side-panel" }),
            onMove: (p) => void setLocal(KEYS.eggPos, p),
            onHide: (scope) =>
              void updateSettings((s) =>
                scope === "everywhere"
                  ? { ...s, hiddenEverywhere: true }
                  : { ...s, hiddenSites: [...new Set([...s.hiddenSites, location.hostname])] },
              ),
          });
          return egg;
        },
        onRemove(view) {
          view?.destroy();
          egg = null;
        },
      });
      ui.mount();
      const cache = await getLocal<HatchesCache | null>(KEYS.hatches, null);
      egg?.setTrackingCount(cache ? incubatingCount(cache.list) : 0);
    }

    function unmount() {
      ui?.remove();
      ui = null;
      linkShownFor = null;
    }

    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      const settingsChange = changes[KEYS.settings];
      if (settingsChange) {
        settings = { ...settings, ...((settingsChange.newValue as Partial<Settings> | undefined) ?? {}) };
        if (isHiddenOn(settings, location.hostname)) unmount();
        else
          void mount().then(() => {
            void checkPage(true);
            void checkLink(location.href.split("#")[0]!, true);
          });
      }
      const hatchesChange = changes[KEYS.hatches];
      if (hatchesChange) {
        const cache = hatchesChange.newValue as HatchesCache | undefined;
        egg?.setTrackingCount(cache ? incubatingCount(cache.list) : 0);
      }
      const posChange = changes[KEYS.eggPos]?.newValue as EggPos | undefined;
      if (posChange) egg?.setPos(posChange);
    });

    // ---- noticing: stock pages and tweets only; the AI only for flagged ones (background dedups per URL) ----
    let checkedUrl = "";
    async function checkPage(force = false) {
      const url = location.href.split("#")[0]!;
      if (!egg || (!force && url === checkedUrl)) return;
      checkedUrl = url;
      if (linkShownFor !== url) egg.setState("idle");
      // Privacy: only stock pages and tweets are ever sent automatically, and only with the "Notice pages
      // automatically" setting on. Other pages get a LOCAL-only headline check (lib/newsMatch): nothing leaves
      // the browser unless the user clicks the hint.
      if (!settings.noticeAuto) return;
      if (!canAutoNotice(url)) return localNewsCheck(url);
      const d = detectFromDom();
      if (!d.flagged) return;
      const ctxPage = collectPageContext();
      const r = await sendToBackground<NoticeResponse>({
        type: "notice",
        page: { url: ctxPage.url, title: ctxPage.title, text: clean(ctxPage.text).slice(0, 1500), detected: ctxPage.detected },
      }).catch(() => ({ hint: null }));
      if (r?.hint && location.href.split("#")[0] === url && linkShownFor !== url) {
        egg?.setState("noticed");
        egg?.showBubble(r.hint, { timeoutMs: 15_000 });
        void sendToBackground({ type: "heads-up", url }).catch(() => undefined);
      }
    }

    /** News pages: compare the title, og:title and main headline with the supported stocks, on this device. */
    async function localNewsCheck(url: string) {
      const stocks = await sendToBackground<StockMap>({ type: "get-stocks" }).catch((): StockMap => ({}));
      const stock = matchHeadlines(collectHeadlines(document), stocks ?? {});
      if (!stock || !egg || location.href.split("#")[0] !== url || linkShownFor === url) return;
      egg.setState("noticed");
      egg.showBubble(localHint(stock), {
        timeoutMs: 15_000,
        // Clicking is the user's ask: open the panel and draft this page (only now is page text sent).
        onPrimary: () => void sendToBackground({ type: "open-side-panel", draft: { url } }),
      });
      void sendToBackground({ type: "heads-up", url }).catch(() => undefined);
    }

    // ---- link coins: egg (no coin yet) or chick (a coin for this link) on tweets, videos and repos ----
    // Only while the buddy shows (hidden on this site or everywhere: no lookups). Only an 8-hex hash prefix of
    // the link's canonical id leaves the browser (the background does the lookup); failures show nothing.
    async function checkLink(url: string, force = false) {
      if (!force && url === linkChecked) return;
      linkChecked = url;
      const seq = ++linkSeq;
      if (linkShownFor && linkShownFor !== url) {
        egg?.hideBubble();
        egg?.setState("idle");
        linkShownFor = null;
      }
      if (!egg) return;
      const target = linkTarget(url, { checkAnyWebsite: settings.checkAnyWebsite === true, title: document.title });
      if (!target) return;
      const r = await sendToBackground<LinkLookupResponse>({ type: "link-lookup", canonicalId: target.canonicalId }).catch(() => null);
      if (!r || seq !== linkSeq || !egg || location.href.split("#")[0] !== url) return;
      linkShownFor = url;
      if (r.status.state === "none") {
        egg.setState("noticed");
        egg.showBubble("No coin yet. Hatch it?", { url: `${r.base}/link?u=${encodeURIComponent(url)}`, linkText: "Hatch", timeoutMs: 15_000 });
      } else {
        const s = r.status;
        egg.setState("idle");
        egg.showBubble(`Coin for this link: ${s.ticker ? `$${s.ticker}` : (s.name ?? "a coin")}`, {
          url: `${r.base}/token/${encodeURIComponent(s.mint)}`,
          linkText: "View coin",
          timeoutMs: 15_000,
          badge: s.claimed ? { text: "Claimed", tone: "ok" } : { text: "Unclaimed", tone: "warn" },
        });
      }
    }

    await mount();
    // x.com and youtube.com are single-page apps: watch the URL and look up 500 ms after it settles.
    const linkWatcher = createUrlWatcher({ read: () => location.href, onChange: (u) => void checkLink(u) });
    ctx.setInterval(() => linkWatcher.poll(), 250);
    ctx.addEventListener(window, "popstate", () => linkWatcher.poll());
    ctx.onInvalidated(() => linkWatcher.stop());
    ctx.setTimeout(() => void checkLink(location.href.split("#")[0]!), 500);
    // Let SPA content (X, TradingView) render before the first look.
    ctx.setTimeout(() => void checkPage(), 1500);
    // SPA navigation: re-check when the URL changes, and tell an open side panel (without the "tabs"
    // permission it cannot see URL changes itself).
    let lastUrl = location.href.split("#")[0];
    ctx.setInterval(() => {
      const now = location.href.split("#")[0];
      if (now !== lastUrl) {
        lastUrl = now;
        void sendToBackground({ type: "page-changed" }).catch(() => undefined);
      }
      if (now !== checkedUrl) void checkPage();
    }, 2000);
  },
});
