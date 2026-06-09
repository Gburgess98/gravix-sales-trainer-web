/**
 * impersonation.ts
 *
 * Client-side state management for SuperAdmin impersonation.
 * Uses localStorage for persistence across page reloads.
 * The token (targetUserId) is injected into every API call via
 * x-impersonated-user-id; the API validates the actor is SuperAdmin.
 */

const STORAGE_KEY = "gravix_impersonation";

export type ImpersonationState = {
  targetUserId: string;
  targetName:   string | null;
  targetTier:   string | null;
  startedAt:    string; // ISO
};

export function getImpersonationState(): ImpersonationState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ImpersonationState;
  } catch {
    return null;
  }
}

export function setImpersonationState(state: ImpersonationState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

export function clearImpersonationState(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

export function isImpersonating(): boolean {
  return getImpersonationState() !== null;
}

/** Returns the targetUserId if impersonating, null otherwise. */
export function getImpersonationTarget(): string | null {
  return getImpersonationState()?.targetUserId ?? null;
}
