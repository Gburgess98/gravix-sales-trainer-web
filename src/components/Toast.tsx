"use client";
import { createContext, useContext, useState, useCallback } from "react";

type ToastVariant = "default" | "success" | "error" | "info";
type Toast = { id: number; text: string; variant: ToastVariant; duration: number };

// Back-compat: allow calling push("msg") or push("msg", { variant, duration })
type PushOpts = { variant?: ToastVariant; duration?: number };
const ToastCtx = createContext<{ push: (text: string, opts?: PushOpts) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const push = useCallback((text: string, opts?: PushOpts) => {
    const id = Date.now();
    const variant: ToastVariant = opts?.variant ?? "default";
    const duration = Math.max(800, Math.min(opts?.duration ?? 1800, 8000)); // clamp 0.8s..8s
    const t: Toast = { id, text, variant, duration };
    setItems((xs) => [...xs, t]);
    const timer = setTimeout(() => {
      setItems((xs) => xs.filter((it) => it.id !== id));
    }, duration);
    // Return a disposer to allow manual dismissal if needed
    return () => {
      clearTimeout(timer);
      setItems((xs) => xs.filter((it) => it.id !== id));
    };
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      {/* pointer-events-none so it doesn't block page; inner toasts re-enable pointer events */}
      <div
        className="fixed bottom-4 right-4 z-[9999] space-y-2 pointer-events-none"
        aria-live="polite"
        aria-atomic="true"
      >
        {items.map((t) => {
          const base = "pointer-events-auto px-3 py-2 rounded shadow text-sm transition";
          const variantClass =
            t.variant === "success"
              ? "bg-emerald-500/90 text-black"
              : t.variant === "error"
              ? "bg-red-500/90 text-white"
              : t.variant === "info"
              ? "bg-sky-500/90 text-black"
              : "bg-white/90 text-black";
          return (
            <div key={t.id} role="status" className={`${base} ${variantClass}`}>
              {t.text}
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx.push;
}