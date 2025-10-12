import fetch from "node-fetch";

type ScoreBreakdown = {
  intro: number; discovery: number; objection: number; close: number;
  voice?: number; // optional Voice Personality Score
  total: number;
};

// api/src/services/slack.ts
// ...your existing imports/helpers...

export type SummaryInput = {
  callId: string;
  repName?: string;
  contactName?: string;
  company?: string;
  overallScore: number;
  section: { intro: number; discovery: number; objection: number; close: number };
  durationSec?: number;
  callUrl: string;   // e.g. https://gravix-sales-trainer-web.vercel.app/calls/123
  recentUrl: string; // e.g. https://gravix-sales-trainer-web.vercel.app/recent-calls
};

export function buildScoreBlocks(s: SummaryInput) {
  const dur = s.durationSec != null ? `${Math.floor(s.durationSec/60)}m ${s.durationSec%60}s` : "—";
  const header = `*${Math.round(s.overallScore)}* / 100  •  Intro ${s.section.intro} | Disc ${s.section.discovery} | Obj ${s.section.objection} | Close ${s.section.close}`;
  const subtitle = [
    s.repName ? `Rep: ${s.repName}` : null,
    s.contactName ? `Contact: ${s.contactName}` : null,
    s.company ? `@ ${s.company}` : null,
    `Duration: ${dur}`
  ].filter(Boolean).join("  •  ");

  return {
    blocks: [
      { type: "header", text: { type: "plain_text", text: "Call Scored", emoji: true } },
      { type: "section", text: { type: "mrkdwn", text: header } },
      { type: "context", elements: [{ type: "mrkdwn", text: subtitle || "—" }] },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Intro*\n${s.section.intro}` },
          { type: "mrkdwn", text: `*Discovery*\n${s.section.discovery}` },
          { type: "mrkdwn", text: `*Objection*\n${s.section.objection}` },
          { type: "mrkdwn", text: `*Close*\n${s.section.close}` },
        ],
      },
      {
        type: "actions",
        elements: [
          { type: "button", text: { type: "plain_text", text: "Open Call" }, url: s.callUrl, action_id: "open_call" },
          { type: "button", text: { type: "plain_text", text: "Recent Calls" }, url: s.recentUrl, action_id: "open_recent" },
        ],
      },
    ],
  };
}

// Convenience wrapper if you want one:
export async function postScoreSummary(input: SummaryInput) {
  const payload = buildScoreBlocks(input);
  // you already have postSlackSummary; reuse it:
  return postSlackSummary(payload);
}

export async function postSlackSummary(opts: {
  webhookUrl: string;
  callId: string;
  repId: string;
  customer?: string | null;
  durationSec?: number | null;
  scores: ScoreBreakdown;
  webAppUrl: string; // e.g. https://.../calls/<id>
}) {
  const { webhookUrl, callId, repId, customer, durationSec, scores, webAppUrl } = opts;
  const url = `${webAppUrl}/calls/${callId}`;
  const mins = durationSec ? Math.round(durationSec / 60) : null;

  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: `📞 Call Scored: ${scores.total}/100` }
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Rep:* \`${repId}\`` },
        { type: "mrkdwn", text: `*Customer:* ${customer ?? "—"}` },
        { type: "mrkdwn", text: `*Duration:* ${mins ? `${mins} min` : "—"}` },
      ]
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
`*Rubric*
• Intro: *${scores.intro}*
• Discovery: *${scores.discovery}*
• Objection: *${scores.objection}*
• Close: *${scores.close}*
${typeof scores.voice === "number" ? `• VPS™: *${scores.voice}*` : ""}`
      }
    },
    {
      type: "actions",
      elements: [
        { type: "button", text: { type: "plain_text", text: "Open call" }, url, action_id: "open_call" }
      ]
    }
  ];

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ blocks })
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Slack webhook failed: ${res.status} ${t}`);
  }
}