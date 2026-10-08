/** Side panel data hooks: storage, the active tab's page context, presets, and the draft chat. */
import { useCallback, useEffect, useRef, useState } from "react";
import { browser } from "wxt/browser";
import { api } from "../../lib/api";
import { sendToBackground, type TabMessage } from "../../lib/messages";
import type { BuddyDraft, ChatMessage, Draft, EggState, PageContext, PresetInfo, StockMap, PresetCopyMap } from "../../lib/types";
import { loadStocks } from "../../lib/stocks";
import { KEYS } from "../../lib/storage";

/** A chrome.storage.local value that stays in sync. */
export function useStorageValue<T>(key: string, fallback: T): T {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    void browser.storage.local.get(key).then((r) => setValue((r[key] as T | undefined) ?? fallback));
    const onChange = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === "local" && key in changes) setValue((changes[key]!.newValue as T | undefined) ?? fallback);
    };
    browser.storage.onChanged.addListener(onChange);
    return () => browser.storage.onChanged.removeListener(onChange);
    // fallback is a constant at every call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return value;
}

export type ActivePage =
  | { status: "loading" }
  | { status: "unavailable"; reason: string }
  | { status: "ready"; tabId: number; page: PageContext };

/**
 * The active tab's page context, re-read when the user switches tabs, the tab finishes loading, or
 * its content script reports an in-page navigation. Works without the "tabs" permission: the page's
 * URL comes from our content script, never from tab.url.
 */
export function useActivePage(): { active: ActivePage; reload: () => void } {
  const [active, setActive] = useState<ActivePage>({ status: "loading" });
  const activeTabId = useRef<number | null>(null);
  const load = useCallback(async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    activeTabId.current = tab?.id ?? null;
    if (!tab?.id) {
      setActive({ status: "unavailable", reason: "Open a web page to hatch a token from it." });
      return;
    }
    try {
      const page = (await browser.tabs.sendMessage(tab.id, { type: "get-context" } satisfies TabMessage)) as PageContext | undefined;
      if (!page || !/^https?:/.test(page.url)) throw new Error("no page");
      setActive({ status: "ready", tabId: tab.id, page });
    } catch {
      // No content script here: a browser page (chrome://, the web store) or a tab opened before install.
      setActive({ status: "unavailable", reason: "Open a web page (or reload this one) so Hatch can read it." });
    }
  }, []);

  useEffect(() => {
    void load();
    const onActivated = () => void load();
    const onUpdated = (tabId: number, info: { status?: string }) => {
      if (tabId === activeTabId.current && info.status === "complete") void load();
    };
    const onMessage = (msg: unknown, sender: { tab?: { id?: number } }) => {
      if ((msg as { type?: string })?.type === "page-changed" && sender.tab?.id === activeTabId.current) void load();
    };
    browser.tabs.onActivated.addListener(onActivated);
    browser.tabs.onUpdated.addListener(onUpdated);
    browser.runtime.onMessage.addListener(onMessage);
    return () => {
      browser.tabs.onActivated.removeListener(onActivated);
      browser.tabs.onUpdated.removeListener(onUpdated);
      browser.runtime.onMessage.removeListener(onMessage);
    };
  }, [load]);

  return { active, reload: () => void load() };
}

/** Presets and their launch copy from the web app (the same text as the launch form; never hardcoded here). */
export function usePresets(): { presets: PresetInfo[]; copy: PresetCopyMap } {
  const [data, setData] = useState<{ presets: PresetInfo[]; copy: PresetCopyMap }>({ presets: [], copy: {} });
  useEffect(() => {
    void api.presets().then((r) => r.ok && setData({ presets: r.data.presets, copy: r.data.copy ?? {} }));
  }, []);
  return data;
}

/** Pairable stocks on the web app's network (GET /api/stocks, cached). */
export function useStocks(): StockMap {
  const [stocks, setStocks] = useState<StockMap>({});
  useEffect(() => {
    void loadStocks().then(setStocks);
  }, []);
  return stocks;
}

export type ChatEntry = { role: "user" | "assistant"; text: string };

type Session = {
  draft: Draft | null;
  reasoning: string;
  history: ChatMessage[]; // sent to the API (assistant turns carry the draft JSON)
  chat: ChatEntry[]; // shown to the user
  edited: boolean;
};

const EMPTY: Session = { draft: null, reasoning: "", history: [], chat: [], edited: false };
const toDraft = ({ name, symbol, description, preset, imageUrl, stockTicker }: BuddyDraft): Draft => ({ name, symbol, description, preset, imageUrl, stockTicker });

/** Draft + chat for one page. Auto-drafts stock pages and tweets on first open; sessions are kept per URL while the panel is open. */
export function useDraftSession(tabId: number | null, page: PageContext | null) {
  const sessions = useRef(new Map<string, Session>());
  const key = page?.url.split("#")[0] ?? "";
  const [session, setSession] = useState<Session>(EMPTY);
  const sessionRef = useRef<Session>(EMPTY);
  sessionRef.current = session;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    (s: Session) => {
      if (key) sessions.current.set(key, s);
      setSession(s);
    },
    [key],
  );

  const egg = useCallback(
    (state: EggState) => {
      if (tabId != null) void sendToBackground({ type: "egg-state", tabId, state }).catch(() => undefined);
    },
    [tabId],
  );

  const run = useCallback(
    async (base: Session, userText?: string) => {
      if (!page) return;
      const history: ChatMessage[] = userText ? [...base.history, { role: "user", content: userText }] : base.history;
      const chat: ChatEntry[] = userText ? [...base.chat, { role: "user", text: userText }] : base.chat;
      save({ ...base, history, chat });
      setBusy(true);
      setError(null);
      egg("thinking");
      const r = await api.draft(page, history, base.edited && base.draft ? base.draft : undefined);
      setBusy(false);
      if (!r.ok) {
        setError(r.error);
        egg("idle");
        return;
      }
      const draft = toDraft(r.data);
      save({
        draft,
        reasoning: r.data.reasoning,
        history: [...history, { role: "assistant", content: JSON.stringify(draft) }],
        chat: [...chat, { role: "assistant", text: r.data.reply }],
        edited: false,
      });
      egg("ready");
    },
    [page, save, egg],
  );

  // New page: restore its session, or auto-draft the first time.
  useEffect(() => {
    if (!key || !page) return;
    const existing = sessions.current.get(key);
    if (existing) {
      setSession(existing);
      setError(null);
      return;
    }
    setSession(EMPTY);
    // Auto-draft only stock pages and tweets. Anything else waits for "Draft from this page" or a click on
    // the buddy's hint, so switching tabs never sends a page's text to the server on its own.
    if (page.detected.kind === "stock" || page.detected.kind === "tweet") void run(EMPTY);
    else void takeDraftRequest().then((asked) => asked && void run(EMPTY));
    // run only when the page changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // The hint was clicked while the panel was already open on this page.
  useEffect(() => {
    if (!page) return;
    const onChange = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== "session" || !changes[KEYS.draftRequest]?.newValue) return;
      void takeDraftRequest().then((asked) => asked && !busy && void run(sessionRef.current));
    };
    browser.storage.onChanged.addListener(onChange);
    return () => browser.storage.onChanged.removeListener(onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, busy]);

  /** A "draft this page" request from a clicked hint for this tab and page (consumed once, 2 min max). */
  async function takeDraftRequest(): Promise<boolean> {
    const req = (await browser.storage.session.get(KEYS.draftRequest))[KEYS.draftRequest] as { tabId: number; url: string; at: number } | undefined;
    if (!req || req.tabId !== tabId || !page || req.url.split("#")[0] !== page.url.split("#")[0] || Date.now() - req.at > 120_000) return false;
    await browser.storage.session.remove(KEYS.draftRequest);
    return true;
  }

  return {
    ...session,
    busy,
    error,
    send: (text: string) => void run(session, text),
    redraft: () => void run(session),
    edit: (patch: Partial<Draft>) => session.draft && save({ ...session, draft: { ...session.draft, ...patch }, edited: true }),
  };
}
