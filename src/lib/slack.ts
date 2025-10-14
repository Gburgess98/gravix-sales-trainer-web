// api/src/lib/slack.ts
import fetch from "node-fetch";

/**
 * ENV:
 *  - SLACK_WEBHOOK_URL= https://hooks.slack.com/services/XXX/YYY/ZZZ
 *  - PUBLIC_WEB_BASE=https://gravix-sales-trainer-web.vercel.app   (or http://localhost:3000 in dev)
 */
const WEBHOOK = process.env.SLACK_WEBHOOK_URL || "";
const PUBLIC_WEB_BASE =
  (process.env.PUBLIC_WEB_BASE || "http://localhost:3000").replace(/\/$/, "");

// ---------------- Types ----------------
export type ScoreBreakdown = {
  intro: number;
  discovery: number;
  objection: number;
  close: number;
  voice?: number; // optional Voice Personality Score
  total: number;
};

export type SummaryInput = {
  callId: string;
  repName?: string;
  contactName?: string;
  company?: string;
  overallScore: number;
  section: { intro: number; discovery: number; objection: number; close: number };
  durationSec?: number;
  callUrl?: string;      // override; default: `${PUBLIC_WEB_BASE}/calls/<id>`
  recentUrl?: string;    // override; default: `${PUBLIC_WEB_BASE}/recent-calls`
  webhookUrl?: string;   // override; default: SLACK_WEBHOOK_URL
};

// --------------- Helpers ----------------
function fmtDuration(sec?: number) {
  if (typeof sec !== "number" || !isFinite(sec) || sec < 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}
function safeInt(n: number | undefined | null) {
  const v = Math.round(Number(n ?? 0));
  return isFinite(v) ? v : 0;
}

// Exported so you can unit test the block structure if you want
export function buildScoreBlocks(s: SummaryInput) {
  const total = safeInt(s.overallScore);
  const intro = safeInt(s.section?.intro);
  const disc  = safeInt(s.section?.discovery);
  const obj   = safeInt(s.section?.objection);
  const close = safeInt(s.section?.close);

  const callUrl = s.callUrl ?? `${PUBLIC_WEB_BASE}/calls/${s.callId}`;
  const recentUrl = s.recentUrl ?? `${PUBLIC_WEB_BASE}/recent-calls`;

  const header = `*${total}* / 100  •  Intro ${intro} | Disc ${disc} | Obj ${obj} | Close ${close}`;
  const subtitle = [
    s.repName ? `Rep: ${s.repName}` : null,
    s.contactName ? `Contact: ${s.contactName}` : null,
    s.company ? `@ ${s.company}` : null,
    `Duration: ${fmtDuration(s.durationSec)}`
  ].filter(Boolean).join("  •  ");

  return {
    blocks: [
      { type: "header", text: { type: "plain_text", text: "📞 Call Scored", emoji: true } },
      { type: "section", text: { type: "mrkdwn", text: header } },
      { type: "context", elements: [{ type: "mrkdwn", text: subtitle || "—" }] },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Intro*\n${intro}` },
          { type: "mrkdwn", text: `*Discovery*\n${disc}` },
          { type: "mrkdwn", text: `*Objection*\n${obj}` },
          { type: "mrkdwn", text: `*Close*\n${close}` },
        ],
      },
      {
        type: "actions",
        elements: [
          { type: "button", text: { type: "plain_text", text: "Open Call" }, url: callUrl, action_id: "open_call", style: "primary" },
          { type: "button", text: { type: "plain_text", text: "Recent Calls" }, url: recentUrl, action_id: "open_recent" },
        ],
      },
    ],
  };
}

// --------------- Primary function ----------------
export async function postScoreSummary(input: SummaryInput) {
  const webhook = input.webhookUrl || WEBHOOK;
  if (!webhook) return { ok: false, skipped: "no webhook configured" };

  const body = buildScoreBlocks({
    ...input,
    callUrl: input.callUrl ?? `${PUBLIC_WEB_BASE}/calls/${input.callId}`,
    recentUrl: input.recentUrl ?? `${PUBLIC_WEB_BASE}/recent-calls`,
  });

  const res = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Slack webhook failed: ${res.status} ${t}`);
  }
  return { ok: true, status: res.status };
}

// --------------- Back-compat wrapper ----------------
export async function postSlackSummary(opts: {
  webhookUrl: string;
  callId: string;
  repId: string;
  customer?: string | null;
  durationSec?: number | null;
  scores: ScoreBreakdown;
  webAppUrl: string; // base; we append /calls/<id>
}) {
  const base = opts.webAppUrl.replace(/\/$/, "");
  return postScoreSummary({
    webhookUrl: opts.webhookUrl,
    callId: opts.callId,
    repName: opts.repId,
    contactName: opts.customer ?? undefined,
    overallScore: opts.scores.total,
    section: {
      intro: opts.scores.intro,
      discovery: opts.scores.discovery,
      objection: opts.scores.objection,
      close: opts.scores.close,
    },
    durationSec: opts.durationSec ?? undefined,
    callUrl: `${base}/calls/${opts.callId}`,
    recentUrl: `${base}/recent-calls`,
  });
}