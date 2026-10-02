/** Side panel data hooks: storage, the active tab's page context, presets, and the draft chat. */
import { useCallback, useEffect, useRef, useState } from "react";
import { browser } from "wxt/browser";
import { api } from "../../lib/api";
import { sendToBackground, type TabMessage } from "../../lib/messages";
import type { BuddyDraft, ChatMessage, Draft, EggState, PageContext, PresetInfo } from "../../lib/types";

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

/** The active tab's page context, re-read when the user switches tabs or the tab navigates. */
export function useActivePage(): { active: ActivePage; reload: () => void } {
  const [active, setActive] = useState<ActivePage>({ status: "loading" });
  const load = useCallback(async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) {
      setActive({ status: "unavailable", reason: "Open a web page to hatch a token from it." });
      return;
    }
    try {
      const page = (await browser.tabs.sendMessage(tab.id, { type: "get-context" } satisfies TabMessage)) as PageContext | undefined;
      if (!page) throw new Error("no response");
      setActive({ status: "ready", tabId: tab.id, page });
    } catch {
      setActive({ status: "unavailable", reason: "Reload this page so Hatch can read it." });
    }
  }, []);

  useEffect(() => {
    void load();
    const onActivated = () => void load();
    const onUpdated = (_id: number, info: { status?: string; url?: string }) => {
      if (info.status === "complete" || info.url) void load();
    };
    browser.tabs.onActivated.addListener(onActivated);
    browser.tabs.onUpdated.addListener(onUpdated);
    return () => {
      browser.tabs.onActivated.removeListener(onActivated);
      browser.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [load]);

  return { active, reload: () => void load() };
}

export function usePresets(): PresetInfo[] {
  const [presets, setPresets] = useState<PresetInfo[]>([]);
  useEffect(() => {
    void api.presets().then((r) => r.ok && setPresets(r.data.presets));
  }, []);
  return presets;
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

/** Draft + chat for one page. Auto-drafts on first open; sessions are kept per URL while the panel is open. */
export function useDraftSession(tabId: number | null, page: PageContext | null) {
  const sessions = useRef(new Map<string, Session>());
  const key = page?.url.split("#")[0] ?? "";
  const [session, setSession] = useState<Session>(EMPTY);
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
    void run(EMPTY);
    // run only when the page changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return {
    ...session,
    busy,
    error,
    send: (text: string) => void run(session, text),
    redraft: () => void run(session),
    edit: (patch: Partial<Draft>) => session.draft && save({ ...session, draft: { ...session.draft, ...patch }, edited: true }),
  };
}
