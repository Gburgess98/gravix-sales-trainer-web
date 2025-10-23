// src/pages/api/proxy/index.ts
export default async function handler(req, res) {
  const TARGET = process.env.API_PROXY_TARGET?.trim() || "https://api.gravixbots.com";
  const upstream = new URL("/", TARGET).toString();

  const r = await fetch(upstream, { method: "GET" });
  const text = await r.text();

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.status(r.status).send(text);
}