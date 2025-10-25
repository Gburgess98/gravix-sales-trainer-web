"use client";
import { createContext, useContext, useState, useCallback, useRef } from "react";

// Variants + model
export type ToastVariant = "default" | "success" | "error" | "info";
export type Toast = { id: number; text: string; variant: ToastVariant; duration: number };

// Back-compat push options
export type PushOpts = { variant?: ToastVariant; duration?: number };

// Context shape: keep `push` for backward compatibility, add helpers
type ToastContext = {
  push: (text: string, opts?: PushOpts) => () => void; // disposer
  success: (text: string, duration?: number) => () => void;
  error: (text: string, duration?: number) => () => void;
  info: (text: string, duration?: number) => () => void;
  remove: (id: number) => void;
  clear: () => void;
};

const ToastCtx = createContext<ToastContext | null>(null);

// Reasonable defaults
const MIN_MS = 800;
const MAX_MS = 8000;
const DEFAULT_MS = 1800;
const MAX_QUEUE = 5; // prevent infinite piling

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const idRef = useRef<number>(1);

  const remove = useCallback((id: number) => {
    setItems((xs) => xs.filter((it) => it.id !== id));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const push = useCallback((text: string, opts?: PushOpts) => {
    const id = (idRef.current = idRef.current + 1);
    const variant: ToastVariant = opts?.variant ?? "default";
    const duration = Math.max(MIN_MS, Math.min(opts?.duration ?? DEFAULT_MS, MAX_MS));
    const t: Toast = { id, text, variant, duration };

    setItems((xs) => {
      const next = [...xs, t];
      // cap queue size
      return next.length > MAX_QUEUE ? next.slice(next.length - MAX_QUEUE) : next;
    });

    const timer = setTimeout(() => remove(id), duration);

    // disposer
    return () => {
      clearTimeout(timer);
      remove(id);
    };
  }, [remove]);

  const success = useCallback((text: string, duration?: number) => push(text, { variant: "success", duration }), [push]);
  const error = useCallback((text: string, duration?: number) => push(text, { variant: "error", duration }), [push]);
  const info = useCallback((text: string, duration?: number) => push(text, { variant: "info", duration }), [push]);

  return (
    <ToastCtx.Provider value={{ push, success, error, info, remove, clear }}>
      {children}
      {/* pointer-events-none so it doesn't block page; inner toasts re-enable pointer events */}
      <div
        className="fixed bottom-4 right-4 z-[9999] space-y-2 pointer-events-none"
        aria-live="polite"
        aria-atomic="true"
        role="status"
      >
        {items.map((t) => {
          const base = "pointer-events-auto px-3 py-2 rounded shadow text-sm transition flex items-start gap-2";
          const variantClass =
            t.variant === "success"
              ? "bg-emerald-500/90 text-black"
              : t.variant === "error"
              ? "bg-red-500/90 text-white"
              : t.variant === "info"
              ? "bg-sky-500/90 text-black"
              : "bg-white/90 text-black";
          return (
            <div key={t.id} className={`${base} ${variantClass}`}>
              <span className="leading-5">{t.text}</span>
              <button
                aria-label="Dismiss notification"
                className="ml-auto opacity-80 hover:opacity-100"
                onClick={() => remove(t.id)}
              >
                ×
              </button>
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
  // Maintain backward compatibility: return `push`, but also expose helpers
  return Object.assign(ctx.push, {
    success: ctx.success,
    error: ctx.error,
    info: ctx.info,
    remove: ctx.remove,
    clear: ctx.clear,
  });
}

// Optional named export if consumers prefer object style
export function useToastApi() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToastApi must be used inside <ToastProvider>");
  return ctx;
}

// Helpful for React DevTools
ToastProvider.displayName = "ToastProvider";