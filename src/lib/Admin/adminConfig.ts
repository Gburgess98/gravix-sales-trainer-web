const API_URL = "/api/proxy";

export type AdminConfig = {
  streak_threshold: number;
  xp_multiplier: number;
  comeback_bonus: number;
  updated_at: string;
};

export async function getAdminConfig(): Promise<AdminConfig> {
  const res = await fetch(`${API_URL}/v1/admin/config`, {
    cache: "no-store",
    credentials: "include",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? "Failed to load admin config");
  return json.config;
}

export async function patchAdminConfig(patch: Partial<Pick<AdminConfig,
  "streak_threshold" | "xp_multiplier" | "comeback_bonus"
>>): Promise<AdminConfig> {
  const res = await fetch(`${API_URL}/v1/admin/config`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(patch),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? "Failed to update admin config");
  return json.config;
}