/** Loading / empty / error / resting states for the side panel (design/v1 E5-E8). */
import type { ReactNode } from "react";
import { BuddyDots, Button, Card, EGG_RADIUS, Skeleton } from "./ui";

export function DraftSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Drafting">
      <Card className="flex h-[52px] items-center gap-2.5 px-3">
        <Skeleton className="h-[30px] w-[30px] rounded-[9px]" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-[9px] w-4/5" />
          <Skeleton className="h-2 w-[45%]" />
        </div>
      </Card>
      <Card className="flex flex-col gap-3 rounded-[18px] p-3.5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-16 w-16 rounded-[12px]" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-[70%]" />
            <Skeleton className="h-[9px] w-[35%]" />
          </div>
        </div>
        <Skeleton className="h-[9px]" />
        <Skeleton className="h-[9px] w-[85%]" />
        <Skeleton className="h-[54px]" />
      </Card>
      <div className="flex items-center gap-2.5 px-0.5 py-2">
        <BuddyDots size={32} />
        <span className="text-[13px] text-ink-2">Reading the page and drafting a token…</span>
      </div>
    </div>
  );
}

export function EmptyState({ title, body, action, resting }: { title: string; body: ReactNode; action?: ReactNode; resting?: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-7 py-8 text-center">
      <div className="relative">
        <div className={resting ? "opacity-60" : ""}>
          <BuddyDots size={96} mood={resting ? "egg" : "chicken"} />
        </div>
        {resting && (
          <span aria-hidden className="absolute -right-[18px] -top-2 font-display text-lg font-bold text-ink-muted">
            z<span className="text-[13px]">z</span>
          </span>
        )}
      </div>
      <h2 className="font-display text-xl font-bold leading-[1.2] tracking-[-0.02em]">{title}</h2>
      <p className="text-sm leading-[1.55] text-ink-2">{body}</p>
      {action}
    </div>
  );
}

/** "Can't reach Hatch": red-tinted card with a flat-lined egg. */
export function ErrorCard({ message, onRetry, offline }: { message: string; onRetry: () => void; offline: boolean }) {
  return (
    <div className="flex animate-rise-in flex-col items-center gap-3 rounded-[18px] border border-danger/40 bg-danger/[0.08] px-[18px] py-[22px] text-center" role="alert">
      <div className="flex h-[60px] w-12 items-center justify-center border-[2.5px] border-danger" style={{ borderRadius: EGG_RADIUS }}>
        <svg width="30" height="16" viewBox="0 0 30 16" fill="none" stroke="#F25F5C" strokeWidth="2.4" strokeLinejoin="round" aria-hidden>
          <path d="M0 8L6 3L11 10L16 4L21 11L26 5L30 8" />
        </svg>
      </div>
      <span className="font-display text-lg font-bold tracking-[-0.02em]">{offline ? "Can't reach Hatch" : "That didn't work"}</span>
      <span className="text-[13px] leading-normal text-ink-2">{offline ? "Check your connection. Your draft is saved and will come back." : message}</span>
      {offline && <span className="break-all font-mono text-[11px] font-medium text-ink-muted">{message}</span>}
      <Button onClick={onRetry}>Try again</Button>
    </div>
  );
}
