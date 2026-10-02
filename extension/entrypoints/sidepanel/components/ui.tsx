/** Tiny unstyled-ish building blocks for the side panel. Restyle freely; no logic here. */
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { eggSvg } from "../../../lib/egg";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export function Button({ variant = "primary", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  return (
    <button
      {...props}
      className={cx(
        "rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-50",
        variant === "primary" && "bg-[var(--accent)] text-black",
        variant === "secondary" && "border border-[var(--border)]",
        variant === "ghost" && "text-[var(--muted)] hover:text-[var(--foreground)]",
        className,
      )}
    />
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-lg border border-[var(--border)] p-3", className)}>{children}</div>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs text-[var(--muted)]">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

const inputClass = "w-full rounded-md border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm text-[var(--foreground)]";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputClass, props.className)} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputClass, props.className)} />;
}

export function Egg({ size = 20 }: { size?: number }) {
  return <span className="inline-block text-[var(--accent)]" dangerouslySetInnerHTML={{ __html: eggSvg(size) }} />;
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className="text-xs text-[var(--muted)]">{children}</p>;
}
