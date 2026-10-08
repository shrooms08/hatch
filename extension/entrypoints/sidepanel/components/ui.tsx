/** Side panel building blocks in the Hatch design system v1 (same tokens and shapes as the web app). */
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import type { HatchStatus, PresetId } from "../../../lib/types";
import { CELL_COLOR, CHICKEN, EGG } from "../../../lib/buddy/art";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export const EGG_RADIUS = "50% 50% 50% 50% / 60% 60% 40% 40%";

const focus = "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-yolk/30";

export function Button({
  variant = "primary",
  size = "md",
  block,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "outline"; size?: "lg" | "md" | "sm"; block?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] disabled:pointer-events-none",
        focus,
        size === "lg" && "h-[54px] px-6 font-display text-[17px] font-bold",
        size === "md" && "h-11 px-5 text-sm",
        size === "sm" && "h-8 px-3 text-xs",
        variant === "primary" && "bg-yolk text-on-yolk hover:bg-yolk-hi active:bg-yolk-deep disabled:bg-surface-3 disabled:text-ink-disabled",
        variant === "secondary" && "border border-line-strong bg-surface-2 text-ink hover:border-ink-muted hover:bg-surface-3 disabled:text-ink-disabled",
        variant === "outline" && "border border-line text-ink-2 hover:border-line-strong hover:text-ink",
        variant === "ghost" && "text-ink-2 hover:text-ink",
        block && "w-full",
        className,
      )}
    />
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-[14px] border border-surface-3 bg-surface-1", className)}>{children}</div>;
}

export function Overline({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-muted", className)}>{children}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("block animate-shimmer rounded-full bg-[linear-gradient(90deg,#221B16_0%,#2C241E_50%,#221B16_100%)] bg-[length:200%_100%]", className)}
    />
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx("relative h-[26px] w-11 shrink-0 rounded-full border transition-colors duration-200", focus, checked ? "border-yolk bg-yolk" : "border-line-strong bg-surface-3")}
    >
      <span
        className={cx(
          "absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full transition-[left,background-color] duration-200",
          checked ? "left-[20px] bg-night" : "left-[2px] bg-ink-muted",
        )}
      />
    </button>
  );
}

export function Field({ label, children, aside }: { label: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between text-xs font-medium text-ink-2">
        {label}
        {aside && <span className="text-[11px] text-ink-muted">{aside}</span>}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-[12px] border border-line bg-inset px-3 text-sm text-ink outline-none transition-[border-color,box-shadow] placeholder:text-ink-muted hover:border-line-strong focus:border-yolk focus:shadow-focus";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputClass, "h-10", props.className)} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputClass, "resize-none py-2.5 leading-normal", props.className)} />;
}

export function Muted({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx("text-xs text-ink-muted", className)}>{children}</p>;
}

/** The meteor-egg mark. */
export function HatchMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden className="block shrink-0">
      <g transform="translate(-3.5 3.5)">
        <path d="M0 -40 L13.9 -5.6 A15 15 0 1 1 -13.9 -5.6 Z" transform="translate(24 40) rotate(45)" fill="#F6EEDC" stroke="#F6EEDC" strokeWidth="5" strokeLinejoin="round" />
        <circle cx="24" cy="40" r="9" fill="#F2A93B" />
        <path d="M53 35 L61.5 26.5 M27.6 12.4 L36 4" stroke="#F6EEDC" strokeWidth="6" strokeLinecap="round" />
      </g>
    </svg>
  );
}


/** Static dot picture of the buddy (chat avatars, empty states), art from lib/buddy/art. The live buddy is lib/buddy/grid. */
export function BuddyDots({ size = 26, mood = "egg", className }: { size?: number; mood?: "egg" | "chicken"; className?: string }) {
  const cell = (size * 0.56) / 11;
  const s = +(cell * 0.74).toFixed(2);
  const gap = +(cell * 0.26).toFixed(2);
  return (
    <span
      aria-hidden
      className={cx("flex shrink-0 items-center justify-center rounded-full border border-line-strong", className)}
      style={{ width: size, height: size, background: "radial-gradient(circle at 35% 28%, #2C241E 0%, #120E0B 72%)", boxShadow: `0 0 0 ${Math.max(2, Math.round(size / 24))}px rgba(242,169,59,0.10)` }}
    >
      <span style={{ display: "grid", gridTemplateColumns: `repeat(11, ${s}px)`, gap }}>
        {(mood === "egg" ? EGG : CHICKEN)
          .join("")
          .split("")
          .map((c, i) => (
            <span key={i} style={{ width: s, height: s, borderRadius: "50%", background: CELL_COLOR[c] }} />
          ))}
      </span>
    </span>
  );
}

/** Generated egg art, as on the web app (tone seeded by ticker). Used when a token has no image. */
const TONES = ["#F2A93B", "#E8572A", "#F6EEDC", "#7BD389", "#8DB4FF", "#FFBD57"];
export function toneFor(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return TONES[(h >>> 0) % TONES.length];
}

export function TokenArt({ ticker, size = 42, paired }: { ticker: string; size?: number; paired?: boolean }) {
  const t = (ticker || "HATCH").toUpperCase().slice(0, 10);
  const tone = toneFor(t);
  const fs = t.length <= 4 ? 118 : t.length === 5 ? 100 : t.length === 6 ? 86 : t.length === 7 ? 74 : 62;
  return (
    <span aria-hidden className="relative block shrink-0 overflow-hidden bg-night" style={{ width: size, height: size, borderRadius: Math.round(size * 0.16) }}>
      <span
        className="absolute left-0 top-0 block h-[512px] w-[512px] origin-top-left"
        style={{ transform: `scale(${size / 512})`, backgroundImage: "radial-gradient(rgba(246,238,220,0.10) 2px, transparent 2px)", backgroundSize: "32px 32px" }}
      >
        <span className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 38%, ${tone}33 0%, rgba(18,14,11,0) 55%)` }} />
        <span className="absolute left-[151px] top-[70px] h-[262px] w-[210px]" style={{ borderRadius: EGG_RADIUS, background: tone, boxShadow: "inset -18px -22px 0 rgba(0,0,0,0.14)" }} />
        <span className="absolute left-[190px] top-[122px] h-24 w-14 rotate-[16deg] rounded-full border-l-[13px] border-white/60" />
        <span className="absolute inset-x-0 top-[352px] text-center font-display font-bold leading-none tracking-[-0.035em] text-shell" style={{ fontSize: fs }}>
          {t}
        </span>
        {paired && <span className="absolute bottom-[30px] left-1/2 h-[42px] w-[300px] -translate-x-1/2 rounded-full border-2 border-yolk" />}
      </span>
    </span>
  );
}

/** Token image with the generated egg as fallback. */
export function TokenImage({ src, ticker, size, paired }: { src?: string | null; ticker: string; size: number; paired?: boolean }) {
  if (src) return <img src={src} alt="" className="shrink-0 bg-surface-2 object-cover" style={{ width: size, height: size, borderRadius: Math.round(size * 0.16) }} />;
  return <TokenArt ticker={ticker} size={size} paired={paired} />;
}

/** Status pill (Incubating / Almost hatched / Hatched). */
export function StatusPill({ status, small }: { status: HatchStatus; small?: boolean }) {
  const cls =
    status === "Hatched" ? "bg-ember text-on-yolk" : status === "Almost hatched" ? "bg-yolk text-on-yolk" : "border border-yolk/35 bg-yolk/[0.12] text-yolk";
  return (
    <span className={cx("inline-flex shrink-0 items-center whitespace-nowrap rounded-full font-semibold", small ? "h-5 px-2 text-[10px]" : "h-6 px-2.5 text-[11px]", cls)}>
      {status}
    </span>
  );
}

/** progress is 0..100. Yolk; warms to ember from 80; ember at 100. Tiny values show a sliver. */
export function ShellBar({ progress, height = 6 }: { progress: number; height?: number }) {
  const s = progress >= 100 ? 2 : progress >= 80 ? 1 : 0;
  const fill = ["#F2A93B", "linear-gradient(90deg,#F2A93B,#FF6E3F)", "#E8572A"][s];
  return (
    <span className="block w-full overflow-hidden rounded-full bg-surface-3" style={{ height }}>
      <span className="block h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `max(3px, ${Math.min(100, progress)}%)`, background: fill }} />
    </span>
  );
}
export const progressInk = (progress: number) => (progress >= 100 ? "text-ember" : progress >= 80 ? "text-yolk-hi" : "text-ink-2");

const PRESET_LABEL: Record<PresetId, string> = { STOCK: "Stock-paired", MEME: "Meme", AI_AGENT: "AI agent" };
export const presetLabel = (id: PresetId) => PRESET_LABEL[id];

export const TrendIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#F2A93B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />
  </svg>
);
export const SmileIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#F6EEDC" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 14c1 1.5 2.4 2.2 4 2.2s3-.7 4-2.2M9 9.5h.01M15 9.5h.01" />
  </svg>
);
export const SparkIcon = ({ size = 12, color = "#8DB4FF" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden className="shrink-0">
    <path d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z" />
  </svg>
);
export const ArrowUpRight = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden className="shrink-0">
    <path d="M7 17L17 7M8 7h9v9" />
  </svg>
);
export const EggGlyph = ({ size = 18 }: { size?: number }) => (
  <svg width={(size * 16) / 20} height={size} viewBox="0 0 16 20" aria-hidden>
    <path d="M8 1C12 1 15 8 15 12.5C15 16.5 12 19 8 19C4 19 1 16.5 1 12.5C1 8 4 1 8 1Z" fill="currentColor" />
  </svg>
);
export const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);

/** "Label ........ value" with a dotted leader. */
export function DefRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2.5 text-[13px]">
      <span className="text-ink-2">{label}</span>
      <span aria-hidden className="flex-1 -translate-y-1 border-b border-dotted border-line-strong" />
      <span className="font-mono text-xs font-medium text-ink">{children}</span>
    </div>
  );
}
