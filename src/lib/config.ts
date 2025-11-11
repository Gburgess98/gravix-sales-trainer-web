// web/src/lib/config.ts

export function getBackendBase() {
  // Default to local API
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:4000";
  }

  // Production fallback (match your proxy setup)
  return process.env.NEXT_PUBLIC_API_BASE || "https://api.gravixbots.com";
}