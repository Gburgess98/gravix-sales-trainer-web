"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { proxyFetch } from "@/lib/api";

type Rep = {
  id: string;
  name: string;
  tier?: string;
};

type Assignment = {
  id: string;
  rep_id: string;
  manager_id: string;
  type: "custom" | "sparring" | "call_review";
  target_id: string | null;
  title: string;
  status: string;
  due_at: string | null;
  created_at: string;
  completed_at: string | null;
  completed_by?: string | null;
};

type Signals = {
  overdue: number;
  assigned_7d: number;
  completed_7d: number;
  completion_rate_7d: number;
  stale_reps_7d: { rep_id: string; name: string; tier?: string }[];
};

type Trust = {
  // All fields optional because the API payload may evolve.
  completion_rate_24h?: number;
  completion_rate_7d?: number;
  auto_completed_24h?: number;
  auto_completed_7d?: number;
  top_stuck_reason?: string;
  needs_help_today?: { rep_id: string; name?: string | null; overdue?: number; open?: number }[];
};

type StuckSignal = {
  label: string;
  tone: "danger" | "warn" | "neutral";
  reason: string; // manager-facing “why stuck”
};

// Helper for stuck state pills
function stuckPill(sig: StuckSignal) {
  const cls =
    sig.tone === "danger"
      ? "border-red-500/30 bg-red-500/10 text-red-200"
      : sig.tone === "warn"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
        : "border-neutral-700 bg-neutral-900 text-neutral-200";

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {sig.label}
    </span>
  );
}

function stuckSectionClass(tone: StuckSignal["tone"]) {
  // Keep the page calm: only a subtle accent border for stuck reps.
  // The row itself already highlights overdue items.
  if (tone === "danger") {
    return "border-red-500/35 bg-neutral-950";
  }
  if (tone === "warn") {
    return "border-amber-500/35 bg-neutral-950";
  }
  return "border-neutral-800 bg-neutral-950";
}

function repStuckSignal(args: {
  rep: Rep;
  raw: Assignment[];
  signals: Signals | null;
}): StuckSignal {
  const { rep, raw, signals } = args;

  const openCount = raw.filter((a) => String(a.status).toLowerCase() === "assigned").length;
  const overdueCount = raw.filter((a) => isOverdue(a)).length;

  if (overdueCount > 0) {
    return {
      label: `Overdue: ${overdueCount}`,
      tone: "danger",
      reason: `${overdueCount} overdue assignment${overdueCount === 1 ? "" : "s"}`,
    };
  }

  const isStale = !!signals?.stale_reps_7d?.some((r) => r.rep_id === rep.id);
  if (isStale) {
    return {
      label: "No completions (7d)",
      tone: "warn",
      reason: "No completed assignments in the last 7 days",
    };
  }

  if (openCount > 0) {
    return {
      label: `Open: ${openCount}`,
      tone: "neutral",
      reason: `${openCount} open assignment${openCount === 1 ? "" : "s"}`,
    };
  }

  return {
    label: "All clear",
    tone: "neutral",
    reason: "No open or overdue assignments",
  };
}

function repNextAction(args: {
  rep: Rep;
  raw: Assignment[];
  signals: Signals | null;
}): string | null {
  const { rep, raw, signals } = args;

  const overdue = raw.filter((a) => isOverdue(a));
  if (overdue.length > 0) {
    return "Chase overdue task or reassign with today’s due date";
  }

  const isStale = !!signals?.stale_reps_7d?.some((r) => r.rep_id === rep.id);
  if (isStale) {
    return "Assign 1 sparring drill today to restart momentum";
  }

  const openCount = raw.filter((a) => String(a.status).toLowerCase() === "assigned").length;
  if (openCount >= 3) {
    return "Reduce open tasks — assign only 1 priority today";
  }

  if (openCount > 0) {
    return "Follow up on current assignment";
  }

  return null;
}

function statusPill(status: string, overdue: boolean) {
  const s = String(status || "").toLowerCase();
  if (s === "completed") {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-200">
        COMPLETED
      </span>
    );
  }
  if (overdue) {
    return (
      <span className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-200">
        OVERDUE
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-xs font-semibold text-neutral-200">
      ASSIGNED
    </span>
  );
}

function fmt(dt?: string | null) {
  if (!dt) return "—";
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return dt;
  }
}

function isOverdue(a: Assignment) {
  if (!a.due_at) return false;
  const due = new Date(a.due_at).getTime();
  const now = Date.now();
  return a.status !== "completed" && Number.isFinite(due) && due < now;
}

function completedLast7d(a: Assignment) {
  if (!a.completed_at) return false;
  const t = new Date(a.completed_at).getTime();
  return Date.now() - t <= 7 * 24 * 60 * 60 * 1000;
}

function todayYmd() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function endOfTodayIso() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

function daysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function safeTypeLabel(t: any) {
  return t === "sparring"
    ? "Sparring"
    : t === "call_review"
      ? "Call review"
      : t === "custom"
        ? "Custom"
        : String(t || "Unknown");
}

function isAutoCompletedBy(v: any) {
  const s = String(v || "").toLowerCase();
  return s === "sparring" || s === "call_review" || s === "auto" || s === "system";
}

async function readJsonOrThrow(res: Response) {
  const txt = await res.text();
  let json: any = null;
  try {
    json = txt ? JSON.parse(txt) : null;
  } catch {
    // ignore
  }
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `request_failed_${res.status}`);
  }
  return json;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await proxyFetch(path, { cache: "no-store" });
  const txt = await res.text();
  let json: any = null;
  try {
    json = txt ? JSON.parse(txt) : null;
  } catch {
    // ignore
  }
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `request_failed_${res.status}`);
  }
  return json as T;
}

function targetLabel(type: Assignment["type"]) {
  if (type === "sparring") return "Persona";
  if (type === "call_review") return "Call";
  return "Target";
}

function targetPlaceholder(type: Assignment["type"]) {
  if (type === "sparring") return "persona id (optional)";
  if (type === "call_review") return "call id (optional)";
  return "id";
}

function buildDueAtIso(dateYmd: string) {
  // Treat the selected date as end-of-day in the user's local time.
  // `YYYY-MM-DDT23:59:59` (no Z) is parsed as local time by JS.
  try {
    const d = new Date(`${dateYmd}T23:59:59`);
    if (!Number.isFinite(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

function recentlyAssignedSameTitle(assignments: Assignment[], repId: string, title: string) {
  if (!repId || !title) return false;

  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const tNorm = title.trim().toLowerCase();

  return assignments.some((a) => {
    if (a.rep_id !== repId) return false;
    if ((a.title || "").trim().toLowerCase() !== tNorm) return false;
    const created = new Date(a.created_at).getTime();
    return Number.isFinite(created) && created >= cutoff;
  });
}

function readParam(sp: URLSearchParams, key: string, fallback = "") {
  const v = sp.get(key);
  return v == null || v === "" ? fallback : v;
}

function writeParam(sp: URLSearchParams, key: string, value: string | null) {
  if (value == null || value === "") sp.delete(key);
  else sp.set(key, value);
  return sp;
}


function safeJsonParse<T>(v: string | null, fallback: T): T {
  if (!v) return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    (v || "").trim()
  );
}

function normaliseOptionalUuid(v: string) {
  const t = (v || "").trim();
  if (!t) return null;
  return isUuid(t) ? t : "__INVALID__";
}

type AdminAssignmentsView = "overview" | "queue" | "create";

type AdminAssignmentsClientProps = {
  initialView?: AdminAssignmentsView;
};

export default function AdminAssignmentsClient(props: AdminAssignmentsClientProps) {
  const view: AdminAssignmentsView = props.initialView ?? "overview";
  const router = useRouter();
  const pathname = usePathname();
  const [reps, setReps] = useState<Rep[]>([]);
  const [rowsByRep, setRowsByRep] = useState<Record<string, Assignment[]>>({});
  const [signals, setSignals] = useState<Signals | null>(null);
  const [trust, setTrust] = useState<Trust | null>(null);

  // Trust panel: never crash on missing/changed fields
  const trustSafe = trust ?? {};
  const completion24h = Number((trustSafe as any).completion_rate_24h ?? 0);
  const completion7d = Number((trustSafe as any).completion_rate_7d ?? 0);
  const autoCompleted24h = Number((trustSafe as any).auto_completed_24h ?? 0);
  const autoCompleted7d = Number((trustSafe as any).auto_completed_7d ?? 0);
  const topStuckReason = String((trustSafe as any).top_stuck_reason ?? "—");
  const needsHelpToday = useMemo(() => {
    return Array.isArray((trustSafe as any).needs_help_today)
      ? ((trustSafe as any).needs_help_today as any[])
      : [];
  }, [trustSafe]);

  const [helpStreak2Plus, setHelpStreak2Plus] = useState<
    Array<{ rep_id: string; name?: string | null; days: number }>
  >([]);
  const helpStreakSigRef = useRef<string>("[]");

  useEffect(() => {
    try {
      const ymd = todayYmd();
      const key = "gravix:trust_help_streaks";
      const raw = localStorage.getItem(key);
      const prev = raw ? JSON.parse(raw) : { ymd: null, streaks: {} as Record<string, number> };

      if (prev?.ymd === ymd) {
        const streaks = prev?.streaks || {};
        const arr = Object.entries(streaks)
          .filter(([, days]) => Number(days) >= 2)
          .map(([rep_id, days]) => {
            const rep = (needsHelpToday || []).find((r: any) => String(r?.rep_id) === String(rep_id));
            return { rep_id, name: rep?.name ?? null, days: Number(days) };
          })
          .sort((a, b) => b.days - a.days);

        const sig = JSON.stringify(arr);
        if (sig !== helpStreakSigRef.current) {
          helpStreakSigRef.current = sig;
          setHelpStreak2Plus(arr);
        }
        return;
      }

      const prevStreaks: Record<string, number> =
        prev?.streaks && typeof prev.streaks === "object" ? prev.streaks : {};

      const todayIds = new Set((needsHelpToday || []).map((r: any) => String(r?.rep_id)).filter(Boolean));

      const nextStreaks: Record<string, number> = {};
      for (const id of todayIds) nextStreaks[id] = (prevStreaks[id] || 0) + 1;

      localStorage.setItem(key, JSON.stringify({ ymd, streaks: nextStreaks }));

      const arr = Object.entries(nextStreaks)
        .filter(([, days]) => Number(days) >= 2)
        .map(([rep_id, days]) => {
          const rep = (needsHelpToday || []).find((r: any) => String(r?.rep_id) === String(rep_id));
          return { rep_id, name: rep?.name ?? null, days: Number(days) };
        })
        .sort((a, b) => b.days - a.days);

      const sig = JSON.stringify(arr);
      if (sig !== helpStreakSigRef.current) {
        helpStreakSigRef.current = sig;
        setHelpStreak2Plus(arr);
      }
    } catch {
      if (helpStreakSigRef.current !== "[]") {
        helpStreakSigRef.current = "[]";
        setHelpStreak2Plus([]);
      }
    }
  }, [needsHelpToday]);

  const searchParams = useSearchParams();
  const sp = new URLSearchParams(searchParams.toString());

  const repIdFromUrl = readParam(sp, "rep_id", "");
  const repIdCamelFromUrl = readParam(sp, "repId", "");
  const repNameFromUrl = readParam(sp, "repName", "");
  const sourceFromUrl = readParam(sp, "source", "");
  const preferredRepIdFromUrl = repIdFromUrl || repIdCamelFromUrl;
  const createTypeFromUrl = readParam(sp, "create_type", "");
  const createTitleFromUrl = readParam(sp, "create_title", "");

  const filterFromUrl = readParam(sp, "filter", "open");
  const qFromUrl = readParam(sp, "q", "");
  const limitFromUrl = readParam(sp, "limit", "25");

  // Create panel state
  const [createRepId, setCreateRepId] = useState<string>("");
  const [createType, setCreateType] = useState<Assignment["type"]>("custom");
  const [createTitle, setCreateTitle] = useState<string>("");
  const [createDueAt, setCreateDueAt] = useState<string>(""); // yyyy-mm-dd
  const [createTargetId, setCreateTargetId] = useState<string>("");
  const [creating, setCreating] = useState<boolean>(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [createdOk, setCreatedOk] = useState(false);
  const createdOkTimer = useRef<number | null>(null);

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const createPanelRef = useRef<HTMLDivElement | null>(null);

  const duplicateTitleWarning = useMemo(() => {
    return recentlyAssignedSameTitle(
      rowsByRep[createRepId] || [],
      createRepId,
      createTitle
    );
  }, [rowsByRep, createRepId, createTitle]);

  const createTargetValidation = useMemo(() => {
    // Only validate for sparring/call_review. Custom ignores target.
    if (createType === "custom") {
      return { invalid: false, message: null as string | null };
    }

    const norm = normaliseOptionalUuid(createTargetId);
    if (norm === "__INVALID__") {
      return {
        invalid: true,
        message:
          createType === "sparring"
            ? "Persona ID must be a UUID (leave blank to use the default persona)."
            : "Call ID must be a UUID (leave blank to let the rep choose a call).",
      };
    }

    return { invalid: false, message: null as string | null };
  }, [createType, createTargetId]);

  // Helper: jump to create panel and prefill fields
  function jumpToCreateAndPrefill(args: {
    repId: string;
    type?: Assignment["type"];
    title?: string;
    dueYmd?: string;
  }) {
    setCreateRepId(args.repId);
    if (args.type) setCreateType(args.type);
    if (args.title != null) setCreateTitle(args.title);
    if (args.dueYmd != null) setCreateDueAt(args.dueYmd);

    // Safety: do not carry target_id when pre-filling (prevents wrong-target creation)
    setCreateTargetId("");

    // Scroll and focus
    setTimeout(() => {
      createPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      titleInputRef.current?.focus();
    }, 50);
  }

  useEffect(() => {
    if (!preferredRepIdFromUrl) return;
    if (sourceFromUrl !== "control-centre") return;
    if (view === "create") return;

    const next = new URLSearchParams();
    next.set("rep_id", preferredRepIdFromUrl);
    if (repNameFromUrl) next.set("repName", repNameFromUrl);
    next.set("source", sourceFromUrl);

    router.replace(`/admin/assignments/create?${next.toString()}#create-assignment`);
  }, [preferredRepIdFromUrl, repNameFromUrl, router, sourceFromUrl, view]);

  // Consume ?rep_id=.../?repId=... and ?create_type, ?create_title for the create panel (prefill)
  useEffect(() => {
    if (!preferredRepIdFromUrl) return;
    setCreateRepId(preferredRepIdFromUrl);
    if (createTypeFromUrl && (["custom", "sparring", "call_review"] as string[]).includes(createTypeFromUrl)) {
      setCreateType(createTypeFromUrl as Assignment["type"]);
    }
    if (createTitleFromUrl) {
      setCreateTitle(createTitleFromUrl);
    }
    // If manager came from Quick assign / Control Centre, keep momentum
    titleInputRef.current?.focus();
  }, [preferredRepIdFromUrl, createTypeFromUrl, createTitleFromUrl]);

  // Consume #create-assignment anchor: scroll + focus title
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#create-assignment") return;
    // If user deep-links the create anchor while on another view, route them to the create page.
    if (view !== "create") {
      router.replace("/admin/assignments/create#create-assignment");
      return;
    }
    // Let the DOM paint first
    const t = window.setTimeout(() => {
      createPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      titleInputRef.current?.focus();
    }, 50);

    return () => window.clearTimeout(t);
  }, [view]);

  async function createAssignment() {
    setCreateErr(null);
    setCreatedOk(false);
    if (createdOkTimer.current) {
      window.clearTimeout(createdOkTimer.current);
      createdOkTimer.current = null;
    }

    const repId = (createRepId || "").trim();
    const title = (createTitle || "").trim();

    if (!repId) {
      setCreateErr("pick_rep");
      return;
    }
    if (!title) {
      setCreateErr("title_required");
      titleInputRef.current?.focus();
      return;
    }

    setCreating(true);
    try {
      // Manager create endpoint (API): expects rep_id, type, title, optional due_at, optional target_id
      const due_at = createDueAt ? buildDueAtIso(createDueAt) : null;

      if (createTargetValidation.invalid) {
        setCreateErr(createTargetValidation.message || "invalid_target_id");
        setCreating(false);
        return;
      }

      const targetNorm = createType === "custom" ? null : normaliseOptionalUuid(createTargetId);
      const target_id = targetNorm && targetNorm !== "__INVALID__" ? targetNorm : null;

      const res = await proxyFetch("/api/proxy/v1/assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rep_id: repId, type: createType, title, due_at, target_id }),
      });

      await readJsonOrThrow(res);

      setCreatedOk(true);
      createdOkTimer.current = window.setTimeout(() => setCreatedOk(false), 1500);

      // Reset minimal fields (keep rep + type for rapid entry)
      setCreateTitle("");
      setCreateTargetId("");
      setCreateDueAt("");

      // Refresh data so the new assignment shows immediately
      await load();

      // Keep the flow fast
      titleInputRef.current?.focus();
    } catch (e: any) {
      setCreateErr(e?.message || "create_failed");
    } finally {
      setCreating(false);
    }
  }

  // --- Trust Dashboard v2 action handlers ---
  function prefillSparringForRep(repId: string) {
    setCreateErr(null);
    setCreatedOk(false);

    setCreateRepId(repId);
    setCreateType("sparring");
    setCreateTitle("Sparring drill");
    setCreateTargetId(""); // default persona
    setCreateDueAt(todayYmd());

    setTimeout(() => {
      createPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      titleInputRef.current?.focus();
    }, 50);
  }

  async function setTopOverdueDueToday(repId: string) {
    try {
      setCreateErr(null);

      const repRows = rowsByRep[repId] || [];
      const overdue = repRows
        .filter((a) => a.status !== "completed" && a.due_at)
        .filter((a) => new Date(a.due_at as string) < new Date())
        .sort((a, b) => new Date(a.due_at as string).getTime() - new Date(b.due_at as string).getTime());

      if (!overdue.length) return;

      const top = overdue[0];
      const res = await proxyFetch(`/api/proxy/v1/assignments/manager/${top.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ due_at: endOfTodayIso() }),
      });

      await readJsonOrThrow(res);
      await load();
    } catch (e: any) {
      setCreateErr(e?.message || "patch_failed");
    }
  }


  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [filter, setFilter] = useState<"open" | "completed7d" | "overdue">(
    filterFromUrl as any
  );
  const [q, setQ] = useState<string>(qFromUrl);
  const [perRepLimit, setPerRepLimit] = useState<number>(Number(limitFromUrl) || 25);

  // expanded state → localStorage (not URL)
  const EXP_KEY = "admin_assignments_expanded_v1";
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    return safeJsonParse<Record<string, boolean>>(
      window.localStorage.getItem(EXP_KEY),
      {}
    );
  });

  // Row actions
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // ---------------------------
  // Day 19: Bulk manager actions + confirmations
  // ---------------------------
  type BulkActionKind = "assign_stale_drill" | "clear_overdue_noise";

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkKind, setBulkKind] = useState<BulkActionKind | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ ok: number; fail: number } | null>(null);
  const [bulkErr, setBulkErr] = useState<string | null>(null);

  function closeBulk() {
    setBulkOpen(false);
    setBulkKind(null);
    setBulkBusy(false);
    setBulkResult(null);
    setBulkErr(null);
  }

  function openBulk(kind: BulkActionKind) {
    setBulkKind(kind);
    setBulkOpen(true);
    setBulkBusy(false);
    setBulkResult(null);
    setBulkErr(null);
  }

  function getOverdueAssignmentsAll(): Array<{ repId: string; a: Assignment }> {
    const out: Array<{ repId: string; a: Assignment }> = [];
    for (const repId of Object.keys(rowsByRep)) {
      for (const a of rowsByRep[repId] || []) {
        if (isOverdue(a)) out.push({ repId, a });
      }
    }
    return out;
  }

  function getStaleRepIds(): string[] {
    const ids = (signals?.stale_reps_7d || []).map((r) => r.rep_id).filter(Boolean);
    return Array.from(new Set(ids));
  }

  async function createManagerAssignment(args: {
    repId: string;
    type: Assignment["type"];
    title: string;
    dueAtIso?: string | null;
    targetId?: string | null;
  }) {
    const res = await proxyFetch("/api/proxy/v1/assignments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rep_id: args.repId,
        type: args.type,
        title: args.title,
        due_at: args.dueAtIso ?? null,
        target_id: args.targetId ?? null,
      }),
    });

    await readJsonOrThrow(res);
  }

  async function patchManagerAssignment(assignmentId: string, body: any) {
    const res = await proxyFetch(`/api/proxy/v1/assignments/manager/${encodeURIComponent(assignmentId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    await readJsonOrThrow(res);
  }

  async function runBulkAction() {
    if (!bulkKind) return;

    setBulkErr(null);
    setBulkResult(null);
    setBulkBusy(true);

    let ok = 0;
    let fail = 0;

    try {
      if (bulkKind === "assign_stale_drill") {
        const staleRepIds = getStaleRepIds();
        if (staleRepIds.length === 0) {
          setBulkErr("No stale reps to assign.");
          setBulkBusy(false);
          return;
        }

        const due_at = buildDueAtIso(todayYmd());
        for (const repId of staleRepIds) {
          try {
            await createManagerAssignment({
              repId,
              type: "sparring",
              title: "Run 1 sparring drill today",
              dueAtIso: due_at,
              targetId: null,
            });
            ok++;
          } catch {
            fail++;
          }
        }
      }

      if (bulkKind === "clear_overdue_noise") {
        const overdue = getOverdueAssignmentsAll();
        if (overdue.length === 0) {
          setBulkErr("No overdue assignments found.");
          setBulkBusy(false);
          return;
        }

        const due_at = buildDueAtIso(todayYmd());
        for (const item of overdue) {
          try {
            await patchManagerAssignment(item.a.id, { due_at });
            ok++;
          } catch {
            fail++;
          }
        }
      }

      setBulkResult({ ok, fail });
      setActionMsg(
        bulkKind === "assign_stale_drill"
          ? `Assigned drills ✓ (${ok} ok, ${fail} failed)`
          : `Rescheduled overdue ✓ (${ok} ok, ${fail} failed)`
      );

      await load();
      window.setTimeout(() => setActionMsg(null), 1500);
    } catch (e: any) {
      setBulkErr(e?.message || "bulk_failed");
    } finally {
      setBulkBusy(false);
    }
  }

  const bulkPreview = useMemo(() => {
    const stale = getStaleRepIds();
    const overdue = getOverdueAssignmentsAll();
    return {
      staleRepCount: stale.length,
      overdueCount: overdue.length,
    };
  }, [signals, rowsByRep]);

  function toggleExpanded(repId: string) {
    setExpanded((prev) => ({ ...prev, [repId]: !prev[repId] }));
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(EXP_KEY, JSON.stringify(expanded));
  }, [expanded]);

  function updateUrl(next: {
    rep_id?: string;
    filter?: string;
    q?: string;
    limit?: string;
  }) {
    const nextSp = new URLSearchParams(searchParams.toString());
    if ("rep_id" in next) writeParam(nextSp, "rep_id", next.rep_id ?? "");
    if ("filter" in next) writeParam(nextSp, "filter", next.filter ?? "open");
    if ("q" in next) writeParam(nextSp, "q", next.q ?? "");
    if ("limit" in next) writeParam(nextSp, "limit", next.limit ?? "");
    router.replace(`${pathname}?${nextSp.toString()}`);
  }

  function norm(s: any) {
    return String(s || "").toLowerCase();
  }

  function matches(rep: Rep, a: Assignment, query: string) {
    const qq = norm(query).trim();
    if (!qq) return true;
    return norm(rep.name).includes(qq) || norm(a.title).includes(qq) || norm(a.type).includes(qq);
  }

  function repNameById(repId: string) {
    const r = reps.find((x) => x.id === repId);
    return r?.name || repId;
  }

  function patchAssignmentInState(assignmentId: string, patch: Partial<Assignment>) {
    setRowsByRep((prev) => {
      const next: Record<string, Assignment[]> = {};
      for (const repId of Object.keys(prev)) {
        next[repId] = (prev[repId] || []).map((a) =>
          a.id === assignmentId ? { ...a, ...patch } : a
        );
      }
      return next;
    });
  }

  function removeAssignmentInState(assignmentId: string) {
    setRowsByRep((prev) => {
      const next: Record<string, Assignment[]> = {};
      for (const repId of Object.keys(prev)) {
        next[repId] = (prev[repId] || []).filter((a) => a.id !== assignmentId);
      }
      return next;
    });
  }

  async function markComplete(assignmentId: string) {
    const ok = window.confirm(
      "Force complete this assignment? This is a manager override and should only be used when the rep has genuinely finished it or the task should be closed manually."
    );
    if (!ok) return;

    setActionMsg(null);
    setActioningId(assignmentId);
    try {
      const completed_at = new Date().toISOString();
      const res = await proxyFetch(`/api/proxy/v1/assignments/manager/${encodeURIComponent(assignmentId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "completed",
          completed_at,
          completed_by: "manager",
        }),
      });
      await readJsonOrThrow(res);
      patchAssignmentInState(assignmentId, {
        status: "completed",
        completed_at,
        completed_by: "manager",
      });
      setActionMsg("Force completed ✓");
    } catch (e: any) {
      setActionMsg(e?.message || "complete_failed");
    } finally {
      setActioningId(null);
      window.setTimeout(() => setActionMsg(null), 1500);
    }
  }

  async function setDueToday(assignmentId: string) {
    setActionMsg(null);
    setActioningId(assignmentId);
    try {
      const due_at = buildDueAtIso(todayYmd());
      const res = await proxyFetch(`/api/proxy/v1/assignments/manager/${encodeURIComponent(assignmentId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ due_at }),
      });
      await readJsonOrThrow(res);
      patchAssignmentInState(assignmentId, { due_at: due_at ?? null });
      setActionMsg("Due set to today ✓");
    } catch (e: any) {
      setActionMsg(e?.message || "reschedule_failed");
    } finally {
      setActioningId(null);
      window.setTimeout(() => setActionMsg(null), 1500);
    }
  }

  async function nudgeRep(repId: string, assignmentId: string) {
    setActionMsg(null);
    setActioningId(assignmentId);
    try {
      const res = await proxyFetch(`/api/proxy/v1/assignments/${encodeURIComponent(assignmentId)}/nudge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });

      await readJsonOrThrow(res);

      setActionMsg("Nudge sent ✓");
    } catch (e: any) {
      setActionMsg(e?.message || "nudge_failed");
    } finally {
      setActioningId(null);
      window.setTimeout(() => setActionMsg(null), 1500);
    }
  }

  async function deleteAssignment(assignmentId: string) {
    const ok = window.confirm("Delete this assignment?");
    if (!ok) return;

    setActionMsg(null);
    setActioningId(assignmentId);
    try {
      const res = await proxyFetch(`/api/proxy/v1/assignments/${encodeURIComponent(assignmentId)}`, {
        method: "DELETE",
      });
      await readJsonOrThrow(res);
      removeAssignmentInState(assignmentId);
      setActionMsg("Deleted ✓");
    } catch (e: any) {
      setActionMsg(e?.message || "delete_failed");
    } finally {
      setActioningId(null);
      window.setTimeout(() => setActionMsg(null), 1500);
    }
  }

  function nudgeTopForRep(repId: string) {
    const repRows = rowsByRep[repId] || [];

    // Prefer top overdue (earliest due), else first open.
    const overdue = repRows
      .filter((a) => String(a.status).toLowerCase() !== "completed" && a.due_at)
      .filter((a) => new Date(a.due_at as string) < new Date())
      .sort((a, b) => new Date(a.due_at as string).getTime() - new Date(b.due_at as string).getTime());

    const open = repRows
      .filter((a) => String(a.status).toLowerCase() === "assigned")
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const target = overdue[0] || open[0] || null;
    if (!target) {
      setActionMsg("No open assignment to nudge");
      window.setTimeout(() => setActionMsg(null), 1500);
      return;
    }

    void nudgeRep(repId, target.id);
  }

  // Helper: fetch manager assignments for a rep with paging/limit
  async function fetchManagerAssignmentsForRep(
    repId: string,
    perRepLimit: number,
    getJson: <T>(path: string) => Promise<T>
  ): Promise<Assignment[]> {
    const wantAll = !Number.isFinite(perRepLimit);

    const pageLimit = wantAll ? 200 : Math.max(1, Math.min(200, perRepLimit));

    let cursor: string | null = null;
    let out: Assignment[] = [];

    // Defensive hard cap so a single rep can't DOS the UI.
    const HARD_MAX = wantAll ? 2000 : pageLimit;

    while (true) {
      const qs = new URLSearchParams();
      qs.set("rep_id", repId);
      qs.set("limit", String(pageLimit));
      if (cursor) qs.set("cursor", cursor);

      const resp: any = await getJson(`/api/proxy/v1/assignments/manager?${qs.toString()}`);

      const list: Assignment[] = (resp.assignments || resp.items || []).slice(0);
      out.push(...list);

      const next: string | null = resp.nextCursor ?? null;
      if (!wantAll) break;
      if (!next) break;
      if (out.length >= HARD_MAX) break;

      cursor = next;
    }

    if (!wantAll) {
      return out.slice(0, pageLimit);
    }

    return out;
  }

  async function load() {
    setErr(null);
    setLoading(true);

    try {
      // 1) Prove manager access (keeps rep users out)
      // If rep hits this page, proxy should return forbidden_not_manager
      await getJson<{ ok: true; config: any }>("/api/proxy/v1/admin/config");

      // 2) Reps list (for names)
      const repsData = await getJson<{ ok: true; reps: Rep[] }>("/api/proxy/v1/admin/reps");
      const repList = repsData.reps || [];
      setReps(repList);
      // If URL asked for a rep, prefer it. Otherwise default to first rep.
      setCreateRepId((prev) => {
        const wanted = preferredRepIdFromUrl || prev;
        if (wanted && repList.some((r) => r.id === wanted)) return wanted;
        if (prev && repList.some((r) => r.id === prev)) return prev;
        return repList[0]?.id || "";
      });

      // 3) Signals (lightweight, high value)
      const sig = await getJson<{ ok: true; signals: Signals }>("/api/proxy/v1/assignments/manager/signals");
      setSignals(sig.signals);

      // 3b) Trust (v2) — compact manager answers
      try {
        const t = await getJson<{ ok: true } & { [k: string]: any }>("/api/proxy/v1/assignments/manager/trust");
        // tolerate different server shapes (trust fields may be at root or nested)
        const payload = (t as any).trust ? (t as any).trust : t;

        setTrust({
          completion_rate_24h: payload?.completion_rate_24h,
          completion_rate_7d: payload?.completion_rate_7d,
          auto_completed_24h: payload?.auto_completed_24h,
          auto_completed_7d: payload?.auto_completed_7d,
          top_stuck_reason: payload?.top_stuck_reason,
          needs_help_today: payload?.needs_help_today,
        });
      } catch {
        // Don't fail the page if trust endpoint isn't available yet.
        setTrust(null);
      }

      // 4) Assignments per rep (manager-scoped)
      // Server-side paging: /v1/assignments/manager?rep_id=&limit=&cursor=
      const entries = await Promise.all(
        repList.map(async (r) => {
          try {
            const list = await fetchManagerAssignmentsForRep(r.id, perRepLimit, getJson);
            return [r.id, list] as const;
          } catch (e) {
            // If an individual rep fetch fails, don’t nuke the whole page.
            return [r.id, []] as const;
          }
        })
      );

      setRowsByRep(Object.fromEntries(entries));
    } catch (e: any) {
      setErr(e?.message || "failed_to_load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const flat = useMemo(() => {
    const all: Assignment[] = [];
    for (const repId of Object.keys(rowsByRep)) {
      all.push(...(rowsByRep[repId] || []));
    }
    return all;
  }, [rowsByRep]);

  const totals = useMemo(() => {
    const assigned = flat.filter((a) => String(a.status).toLowerCase() === "assigned").length;
    const completed = flat.filter((a) => String(a.status).toLowerCase() === "completed").length;
    const overdue = flat.filter((a) => isOverdue(a)).length;
    return { assigned, completed, overdue };
  }, [flat]);

  const trustPatterns = useMemo(() => {
    const list = Array.isArray(flat) ? flat : [];
    const sinceIso = daysAgoIso(7);

    const recent = list.filter((a) => {
      const created = a?.created_at ? new Date(a.created_at).toISOString() : null;
      return created ? created >= sinceIso : true;
    });

    const missed = recent.filter((a) => {
      if (String(a?.status).toLowerCase() === "completed") return false;
      if (!a?.due_at) return false;
      return new Date(a.due_at) < new Date();
    });

    const missedByType: Record<string, number> = {};
    for (const a of missed) {
      const k = String(a?.type || "unknown");
      missedByType[k] = (missedByType[k] || 0) + 1;
    }

    let mostMissedType: string | null = null;
    let mostMissedCount = 0;
    for (const [k, v] of Object.entries(missedByType)) {
      if (v > mostMissedCount) {
        mostMissedType = k;
        mostMissedCount = v;
      }
    }

    const completedRecent = recent.filter((a) => String(a?.status).toLowerCase() === "completed");
    let auto = 0;
    let manual = 0;
    for (const a of completedRecent) {
      if (isAutoCompletedBy(a?.completed_by)) auto++;
      else manual++;
    }

    const total = auto + manual;
    const autoPct = total > 0 ? Math.round((auto / total) * 100) : null;

    return {
      mostMissedType,
      mostMissedCount,
      auto,
      manual,
      autoPct,
      totalCompleted7d: total,
    };
  }, [flat]);

  const weeklyReview = useMemo(() => {
    const list = Array.isArray(flat) ? flat : [];
    const sinceIso = daysAgoIso(7);

    const recent = list.filter((a) => {
      const createdIso = a?.created_at ? new Date(a.created_at).toISOString() : null;
      return createdIso ? createdIso >= sinceIso : true;
    });

    // Completed in window
    const completed = recent.filter((a) => String(a?.status).toLowerCase() === "completed");

    // “Improved” = most completed assignment type (7d)
    const completedByType: Record<string, number> = {};
    for (const a of completed) {
      const k = String(a?.type || "unknown");
      completedByType[k] = (completedByType[k] || 0) + 1;
    }

    let improvedType: string | null = null;
    let improvedCount = 0;
    for (const [k, v] of Object.entries(completedByType)) {
      if (v > improvedCount) {
        improvedType = k;
        improvedCount = v;
      }
    }

    // “Ignored” = most missed assignment type (7d) from trustPatterns
    const ignoredType = trustPatterns?.mostMissedType ?? null;

    // “Focus” rules:
    // 1) If ignored exists → focus ignored
    // 2) Else if reps needing help 2+ days → focus sparring
    // 3) Else fallback to improved (or sparring)
    const focusType =
      ignoredType || (helpStreak2Plus.length ? "sparring" : improvedType || "sparring");

    return {
      improvedType,
      improvedCount,
      ignoredType,
      focusType,
      repeatHelpCount: helpStreak2Plus.length,
    };
  }, [flat, trustPatterns, helpStreak2Plus]);

  const confidence = useMemo(() => {
    const repIds = reps.map((r) => r.id);

    let overdueRepCount = 0;
    let staleRepCount = 0;
    let stuckRepCount = 0;
    let openRepCount = 0;

    const staleSet = new Set((signals?.stale_reps_7d || []).map((r) => r.rep_id));

    for (const repId of repIds) {
      const raw = rowsByRep[repId] || [];
      const open = raw.filter((a) => String(a.status).toLowerCase() === "assigned");
      const overdue = raw.filter((a) => isOverdue(a));
      const stale = staleSet.has(repId);

      if (open.length > 0) openRepCount++;
      if (overdue.length > 0) overdueRepCount++;
      if (stale) staleRepCount++;

      if (overdue.length > 0 || stale) stuckRepCount++;
    }

    const staleNames = (signals?.stale_reps_7d || [])
      .map((r) => r.name)
      .filter(Boolean)
      .slice(0, 6);

    return {
      openRepCount,
      overdueRepCount,
      staleRepCount,
      stuckRepCount,
      staleNames,
      staleTotal: (signals?.stale_reps_7d || []).length,
    };
  }, [reps, rowsByRep, signals]);

  const sortedReps = useMemo(() => {
    // Sort managers' view by "stuck first": overdue → stale (7d) → open count → name
    return [...reps].sort((a, b) => {
      const aRaw = rowsByRep[a.id] || [];
      const bRaw = rowsByRep[b.id] || [];

      const aOverdue = aRaw.filter(isOverdue).length;
      const bOverdue = bRaw.filter(isOverdue).length;
      if (aOverdue !== bOverdue) return bOverdue - aOverdue;

      const aStale = signals?.stale_reps_7d?.some((r) => r.rep_id === a.id) ? 1 : 0;
      const bStale = signals?.stale_reps_7d?.some((r) => r.rep_id === b.id) ? 1 : 0;
      if (aStale !== bStale) return bStale - aStale;

      const aOpen = aRaw.filter((x) => String(x.status).toLowerCase() === "assigned").length;
      const bOpen = bRaw.filter((x) => String(x.status).toLowerCase() === "assigned").length;
      if (aOpen !== bOpen) return bOpen - aOpen;

      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }, [reps, rowsByRep, signals]);

  return (
    <div className="mx-auto w-full max-w-[1600px] p-6 flex min-h-screen flex-col">
      {/* Debug: confirms the correct component is rendering */}
      <div className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-neutral-800 bg-neutral-950 px-3 py-1 text-xs text-neutral-400">
        <span className="font-semibold text-neutral-200">AdminAssignmentsClient</span>
        <span>v2</span>
        <span className="text-neutral-600">•</span>
        <span className="text-neutral-500">has Show/Expand controls</span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Admin · Assignments</h1>
          <p className="text-sm text-neutral-400">What you’ve assigned, what’s outstanding, what’s overdue.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={load}
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm font-semibold text-neutral-200 hover:bg-neutral-900 transition-all duration-150 active:scale-[0.98]"
          >
            Refresh
          </button>

          <Link href="/crm/overview" className="text-sm underline text-neutral-400 hover:text-neutral-200">
            ← Back
          </Link>
        </div>
      </div>

      {/* Day 25: Admin IA split (Overview / Queue / Create) */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link
          href="/admin/assignments"
          className={
            "inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold transition-all duration-150 active:scale-[0.98] " +
            (view === "overview"
              ? "bg-white text-black hover:brightness-95"
              : "border border-neutral-800 bg-neutral-950 text-neutral-200 hover:bg-neutral-900")
          }
        >
          Overview
        </Link>

        <Link
          href="/admin/assignments/queue"
          className={
            "inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold transition-all duration-150 active:scale-[0.98] " +
            (view === "queue"
              ? "bg-white text-black hover:brightness-95"
              : "border border-neutral-800 bg-neutral-950 text-neutral-200 hover:bg-neutral-900")
          }
        >
          Queue
        </Link>

        <Link
          href="/admin/assignments/create"
          className={
            "inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold transition-all duration-150 active:scale-[0.98] " +
            (view === "create"
              ? "bg-white text-black hover:brightness-95"
              : "border border-neutral-800 bg-neutral-950 text-neutral-200 hover:bg-neutral-900")
          }
        >
          Create
        </Link>

        <div className="ml-auto text-xs text-neutral-500">
          View: <span className="text-neutral-200">{view}</span>
        </div>
      </div>

      {err && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {err === "forbidden_not_manager" ? "You don’t have manager access for this page." : err}
        </div>
      )}
      {actionMsg && !err && (
        <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-300">
          {actionMsg}
        </div>
      )}

      {loading ? (
        <div className="mt-6 text-sm text-neutral-400">Loading {view}…</div>
      ) : (
        <div className="mt-6 flex-1 overflow-hidden flex flex-col">
          {/* Create panel */}
          {view === "create" ? (
            <div
              id="create-assignment"
              ref={createPanelRef}
              className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <div className="text-sm font-semibold">Create assignment</div>
                  <div className="mt-1 text-xs text-neutral-500">
                    Prefills from <span className="text-neutral-300">?rep_id=</span> / <span className="text-neutral-300">?repId=</span> and focuses title on
                    <span className="text-neutral-300"> #create-assignment</span>.
                  </div>
                  {sourceFromUrl === "control-centre" && preferredRepIdFromUrl ? (
                    <div className="mt-2 inline-flex items-center rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[11px] font-semibold text-indigo-200">
                      Prefilled from Control Centre{repNameFromUrl ? ` · ${repNameFromUrl}` : ""}
                    </div>
                  ) : null}
                </div>

                <div className="text-xs text-neutral-500">
                  Tip: sparring/call_review can carry an optional target id (persona id / call id).
                </div>
              </div>

              {createErr && (
                <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                  {createErr === "pick_rep"
                    ? "Pick a rep"
                    : createErr === "title_required"
                      ? "Title is required"
                      : createErr === "request_failed_404"
                        ? "Not found (create endpoint missing)"
                        : createErr}
                </div>
              )}
              {createTargetValidation.invalid ? (
                <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                  {createTargetValidation.message}
                </div>
              ) : null}

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-12">
                <div className="md:col-span-3">
                  <label className="text-xs text-neutral-500">Rep</label>
                  <select
                    value={createRepId}
                    onChange={(e) => setCreateRepId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200"
                  >
                    {reps.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs text-neutral-500">Type</label>
                  <select
                    value={createType}
                    onChange={(e) => {
                      const v = e.target.value as any;
                      setCreateType(v);
                      setCreateErr(null);
                      setCreatedOk(false);
                      if (v === "custom") setCreateTargetId("");
                    }}
                    className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200"
                  >
                    <option value="custom">custom</option>
                    <option value="sparring">sparring</option>
                    <option value="call_review">call_review</option>
                  </select>
                  {createType === "sparring" ? (
                    <div className="mt-1 text-[11px] text-neutral-500">
                      Persona is optional. If left blank, the default sparring persona will be used.
                    </div>
                  ) : createType === "call_review" ? (
                    <div className="mt-1 text-[11px] text-neutral-500">
                      Call ID is optional. If left blank, the rep can choose a call to review.
                    </div>
                  ) : null}
                </div>

                <div className="md:col-span-4">
                  <label className="text-xs text-neutral-500">Title</label>
                  <input
                    ref={titleInputRef}
                    value={createTitle}
                    onChange={(e) => {
                      setCreateTitle(e.target.value);
                      if (createErr) setCreateErr(null);
                    }}
                    placeholder="e.g. Run 1 sparring drill today"
                    className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200"
                  />
                  {duplicateTitleWarning ? (
                    <div className="mt-1 text-[11px] text-amber-300">
                      ⚠️ Similar assignment was created for this rep in the last 24h.
                    </div>
                  ) : null}
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs text-neutral-500">Due (optional)</label>
                  <input
                    type="date"
                    value={createDueAt}
                    onChange={(e) => setCreateDueAt(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200"
                  />
                </div>

                {createType === "custom" ? null : (
                  <div className="md:col-span-3">
                    <label className="text-xs text-neutral-500">
                      {createType === "sparring" ? "Persona (optional)" : "Call id (optional)"}
                    </label>
                    <input
                      value={createTargetId}
                      onChange={(e) => {
                        setCreateTargetId(e.target.value);
                        if (createErr) setCreateErr(null);
                      }}
                      placeholder={createType === "sparring" ? "persona id (optional)" : "call id (optional)"}
                      className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200"
                    />
                    <div className="mt-1 text-[11px] text-neutral-500">
                      {createType === "sparring"
                        ? "Optional persona id; leave blank to use the default persona."
                        : "Optional call id; leave blank to let the rep pick a call."}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between gap-2">
                <div className="text-xs">
                  {createdOk ? (
                    <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 font-semibold text-emerald-200">
                      Created ✓
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCreateTitle("");
                      setCreateTargetId("");
                      setCreateDueAt("");
                      setCreateErr(null);
                      titleInputRef.current?.focus();
                    }}
                    className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm font-semibold text-neutral-200 hover:bg-neutral-900 transition-all duration-150 active:scale-[0.98]"
                  >
                    Clear
                  </button>

                  <button
                    type="button"
                    disabled={creating || !createRepId || !createTitle.trim() || createTargetValidation.invalid}
                    onClick={createAssignment}
                    className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-neutral-200 transition-all duration-150 active:scale-[0.98] hover:brightness-95 disabled:opacity-50"
                  >
                    {creating ? "Creating…" : "Create"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* Signals */}
          {view === "overview" ? (
            <>
              <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
                  <div className="text-xs text-neutral-500">Assigned (visible)</div>
                  <div className="mt-1 text-2xl font-semibold">{totals.assigned}</div>
                </div>

                <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
                  <div className="text-xs text-neutral-500">Completed (visible)</div>
                  <div className="mt-1 text-2xl font-semibold">{totals.completed}</div>
                </div>

                <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
                  <div className="text-xs text-neutral-500">Overdue (visible)</div>
                  <div className="mt-1 text-2xl font-semibold">{totals.overdue}</div>
                </div>

                <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
                  <div className="text-xs text-neutral-500">Completion rate (7d)</div>
                  <div className="mt-1 text-2xl font-semibold">
                    {signals ? `${Math.round((signals.completion_rate_7d || 0) * 100)}%` : "—"}
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {signals ? `${signals.completed_7d}/${signals.assigned_7d} completed` : ""}
                  </div>
                </div>
              </div>

              {/* Trust Dashboard v2 */}
              <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-neutral-200">Trust</div>
                    <div className="mt-1 text-xs text-neutral-500">
                      10-second answers: is it working, what’s stuck, who needs help.
                    </div>
                  </div>

                  <div className="text-xs text-neutral-500">
                    {trust ? (
                      <>
                        Top stuck reason: <span className="text-neutral-200">{topStuckReason}</span>
                      </>
                    ) : (
                      <>Trust metrics unavailable</>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
                    <div className="text-xs text-neutral-500">Completion rate (24h)</div>
                    <div className="mt-1 text-2xl font-semibold">{trust ? `${Math.round(completion24h * 100)}%` : "—"}</div>
                  </div>

                  <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
                    <div className="text-xs text-neutral-500">Completion rate (7d)</div>
                    <div className="mt-1 text-2xl font-semibold">{trust ? `${Math.round(completion7d * 100)}%` : "—"}</div>
                  </div>

                  <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
                    <div className="text-xs text-neutral-500">Auto-completed (24h)</div>
                    <div className="mt-1 text-2xl font-semibold">{trust ? autoCompleted24h : "—"}</div>
                  </div>

                  <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
                    <div className="text-xs text-neutral-500">Auto-completed (7d)</div>
                    <div className="mt-1 text-2xl font-semibold">{trust ? autoCompleted7d : "—"}</div>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
                  <div className="text-xs font-semibold text-neutral-200">Patterns (7d)</div>
                  <div className="mt-1 text-xs text-neutral-500">Lightweight trends computed client-side.</div>

                  <div className="mt-2 grid gap-2">
                    <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm">
                      <div className="text-neutral-300">Most missed assignment type</div>
                      <div className="text-neutral-100">
                        {trustPatterns.mostMissedType
                          ? `${safeTypeLabel(trustPatterns.mostMissedType)} (${trustPatterns.mostMissedCount})`
                          : "—"}
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm">
                      <div className="text-neutral-300">Auto-completed vs manual</div>
                      <div className="text-neutral-100">
                        {trustPatterns.totalCompleted7d > 0
                          ? `${trustPatterns.auto} / ${trustPatterns.manual} (${trustPatterns.autoPct}% auto)`
                          : "—"}
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm">
                      <div className="text-neutral-300">Reps needing help 2+ days</div>
                      <div className="text-neutral-100">{helpStreak2Plus.length ? `${helpStreak2Plus.length} reps` : "—"}</div>
                    </div>

                    {helpStreak2Plus.length ? (
                      <div className="text-xs text-neutral-500">
                        {helpStreak2Plus.slice(0, 3).map((r) => (
                          <span key={r.rep_id} className="mr-3">
                            {r.name || r.rep_id}: {r.days}d
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Manager Weekly Review Panel v1 (read-only) */}
                <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
                  <div className="text-xs font-semibold text-neutral-200">Weekly review</div>
                  <div className="mt-1 text-xs text-neutral-500">This week’s summary (computed from visible assignments)</div>

                  <div className="mt-3 space-y-2 text-sm text-neutral-300">
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2">
                      <div className="text-neutral-300">You improved</div>
                      <div className="text-neutral-100">
                        {weeklyReview.improvedType ? `${safeTypeLabel(weeklyReview.improvedType)} (${weeklyReview.improvedCount})` : "—"}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2">
                      <div className="text-neutral-300">You ignored</div>
                      <div className="text-neutral-100">{weeklyReview.ignoredType ? safeTypeLabel(weeklyReview.ignoredType) : "—"}</div>
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2">
                      <div className="text-neutral-300">Focus next week</div>
                      <div className="text-neutral-100">{safeTypeLabel(weeklyReview.focusType)}</div>
                    </div>
                  </div>

                  {weeklyReview.repeatHelpCount >= 2 ? (
                    <div className="mt-2 text-xs text-amber-300">
                      Heads-up: {weeklyReview.repeatHelpCount} reps have needed help 2+ days in a row.
                    </div>
                  ) : null}
                </div>

                <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
                  <div className="text-xs font-semibold text-neutral-200">Who needs help today</div>
                  <div className="mt-1 text-xs text-neutral-500">Top 5 reps with overdue/open load.</div>

                  {!trust ? (
                    <div className="mt-2 text-sm text-neutral-500">—</div>
                  ) : needsHelpToday.length === 0 ? (
                    <div className="mt-2 text-sm text-neutral-500">No reps flagged.</div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {needsHelpToday.slice(0, 5).map((r: any) => {
                        const name = (r?.name as any) || repNameById(String(r?.rep_id || ""));
                        const overdue = Number(r?.overdue ?? 0);
                        const open = Number(r?.open ?? 0);
                        return (
                          <div key={String(r?.rep_id || name)} className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <div className="text-neutral-200">{name}</div>
                              <div className="text-neutral-400">
                                <span className={overdue > 0 ? "text-red-200" : "text-neutral-300"}>{overdue} overdue</span>
                                <span className="text-neutral-600"> · </span>
                                <span className="text-neutral-300">{open} open</span>
                              </div>
                            </div>

                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                onClick={() => prefillSparringForRep(String(r.rep_id))}
                                className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-neutral-200 transition-all duration-150 active:scale-[0.98] hover:brightness-95"
                              >
                                Assign sparring
                              </button>

                              <button
                                onClick={() => void setTopOverdueDueToday(String(r.rep_id))}
                                className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-900 transition-all duration-150 active:scale-[0.98]"
                              >
                                Set due today
                              </button>

                              <button
                                onClick={() => nudgeTopForRep(String(r.rep_id))}
                                className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-900 transition-all duration-150 active:scale-[0.98]"
                              >
                                Nudge
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Manager confidence signals (fast answers, no dashboards) */}
              <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-neutral-200">Manager confidence</div>
                    <div className="mt-1 text-xs text-neutral-500">Quick reality check: who’s stuck, who’s active, and where to focus.</div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full border border-neutral-800 bg-black px-2 py-1 text-neutral-300">
                      Reps w/ open: <span className="font-semibold text-neutral-100">{confidence.openRepCount}</span>
                    </span>

                    <span
                      className={
                        confidence.overdueRepCount > 0
                          ? "rounded-full border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-200"
                          : "rounded-full border border-neutral-800 bg-black px-2 py-1 text-neutral-300"
                      }
                    >
                      Overdue reps: <span className="font-semibold">{confidence.overdueRepCount}</span>
                    </span>

                    <span
                      className={
                        confidence.staleRepCount > 0
                          ? "rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-200"
                          : "rounded-full border border-neutral-800 bg-black px-2 py-1 text-neutral-300"
                      }
                    >
                      Stale reps (7d): <span className="font-semibold">{confidence.staleRepCount}</span>
                    </span>

                    <span
                      className={
                        confidence.stuckRepCount > 0
                          ? "rounded-full border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-200"
                          : "rounded-full border border-neutral-800 bg-black px-2 py-1 text-neutral-300"
                      }
                    >
                      Stuck total: <span className="font-semibold">{confidence.stuckRepCount}</span>
                    </span>
                  </div>
                </div>

                {confidence.staleTotal > 0 ? (
                  <div className="mt-2 text-xs text-neutral-500">
                    Stale reps (no completions in 7d):{" "}
                    <span className="text-neutral-200">
                      {confidence.staleNames.join(", ")}
                      {confidence.staleTotal > confidence.staleNames.length ? "…" : ""}
                    </span>
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-neutral-500">No stale reps detected in the last 7 days.</div>
                )}

                <div className="mt-3 text-xs text-neutral-500">
                  Interpretation: <span className="text-neutral-200">Overdue</span> = immediate follow-up,{" "}
                  <span className="text-neutral-200">Stale</span> = assign 1 drill today to restart momentum.
                </div>

                {confidence.stuckRepCount === 0 && (
                  <div className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-200">
                    Momentum looks healthy — no reps are currently stuck. Nice work keeping the system clean.
                  </div>
                )}

                {/* Day 19: Bulk actions */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openBulk("assign_stale_drill")}
                    className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black hover:bg-neutral-200 transition-all duration-150 active:scale-[0.98] hover:brightness-95"
                  >
                    Assign 1 drill to all stale reps
                  </button>

                  <button
                    type="button"
                    onClick={() => openBulk("clear_overdue_noise")}
                    className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs font-semibold text-neutral-200 hover:bg-neutral-900 transition-all duration-150 active:scale-[0.98]"
                  >
                    Clear overdue noise (set due today)
                  </button>

                  <div className="text-xs text-neutral-500">
                    Preview: <span className="text-neutral-200">{bulkPreview.staleRepCount}</span> stale reps,{" "}
                    <span className="text-neutral-200">{bulkPreview.overdueCount}</span> overdue items
                  </div>
                </div>
              </div>
            </>
          ) : null}
          {/* Controls + Queue (Day 25) */}
          {view === "queue" ? (
            <>
              <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setFilter("open");
                        updateUrl({ filter: "open" });
                      }}
                      className={`inline-flex items-center h-9 rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-150 active:scale-[0.98] ${filter === "open"
                        ? "bg-white text-black hover:brightness-95"
                        : "border border-neutral-800 bg-neutral-950 text-neutral-200 hover:bg-neutral-900"
                        }`}
                    >
                      Assigned
                    </button>

                    <button
                      onClick={() => {
                        setFilter("completed7d");
                        updateUrl({ filter: "completed7d" });
                      }}
                      className={`inline-flex items-center h-9 rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-150 active:scale-[0.98] ${filter === "completed7d"
                        ? "bg-white text-black hover:brightness-95"
                        : "border border-neutral-800 bg-neutral-950 text-neutral-200 hover:bg-neutral-900"
                        }`}
                    >
                      Completed (7d)
                    </button>

                    <button
                      onClick={() => {
                        setFilter("overdue");
                        updateUrl({ filter: "overdue" });
                      }}
                      className={`inline-flex items-center h-9 rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-150 active:scale-[0.98] ${filter === "overdue"
                        ? "bg-white text-black hover:brightness-95"
                        : "border border-neutral-800 bg-neutral-950 text-neutral-200 hover:bg-neutral-900"
                        }`}
                    >
                      Overdue
                    </button>
                  </div>

                  <div className="flex flex-col gap-2 md:flex-row md:items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-500">Search</span>
                      <input
                        value={q}
                        onChange={(e) => {
                          setQ(e.target.value);
                          updateUrl({ q: e.target.value });
                        }}
                        placeholder="rep, title, type…"
                        className="h-9 w-full md:w-64 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-500">Show</span>
                      <select
                        value={String(perRepLimit)}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setPerRepLimit(v);
                          updateUrl({ limit: String(v) });
                        }}
                        className="h-9 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200"
                      >
                        <option value={"25"}>25</option>
                        <option value={"50"}>50</option>
                        <option value={"100"}>100</option>
                        <option value={String(Number.POSITIVE_INFINITY)}>All</option>
                      </select>
                      <span className="text-xs text-neutral-500">per rep</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex-1 overflow-y-auto pr-2 space-y-6 max-h-[65vh] rounded-2xl border border-neutral-900 bg-neutral-950/20 p-3">
                {sortedReps.map((rep) => {
                  const raw = rowsByRep[rep.id] || [];
                  const list =
                    filter === "open"
                      ? raw.filter((a) => String(a.status).toLowerCase() === "assigned")
                      : filter === "completed7d"
                        ? raw.filter((a) => String(a.status).toLowerCase() === "completed" && completedLast7d(a))
                        : raw.filter((a) => isOverdue(a));

                  const open = raw.filter((a) => String(a.status).toLowerCase() === "assigned");
                  const done = raw.filter((a) => String(a.status).toLowerCase() === "completed");

                  const sig = repStuckSignal({ rep, raw, signals });

                  const filtered = list
                    .filter((a) => matches(rep, a, q))
                    .slice(0, Number.isFinite(perRepLimit) ? perRepLimit : list.length);

                  const shouldExpand = expanded[rep.id] ?? (sig.tone === "danger" || sig.tone === "warn");

                  if (!filtered.length) return null;

                  return (
                    <section
                      key={rep.id}
                      className={[
                        "rounded-2xl border p-4",
                        stuckSectionClass(sig.tone),
                        sig.tone === "danger" ? "shadow-[0_0_0_1px_rgba(239,68,68,0.10)]" : "",
                        sig.tone === "warn" ? "shadow-[0_0_0_1px_rgba(245,158,11,0.10)]" : "",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-base font-semibold text-neutral-100">{rep.name || rep.id}</div>
                            {rep.tier ? (
                              <span className="inline-flex items-center rounded-full border border-neutral-800 bg-black px-2 py-0.5 text-[11px] font-medium text-neutral-400">
                                {rep.tier}
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                            <span className="inline-flex items-center rounded-full border border-neutral-800 bg-black px-2 py-0.5 text-neutral-300">
                              Open: <span className="ml-1 font-semibold text-neutral-100">{open.length}</span>
                            </span>
                            <span className="inline-flex items-center rounded-full border border-neutral-800 bg-black px-2 py-0.5 text-neutral-300">
                              Completed: <span className="ml-1 font-semibold text-neutral-100">{done.length}</span>
                            </span>
                            <span className="inline-flex items-center rounded-full border border-neutral-800 bg-black px-2 py-0.5 text-neutral-300">
                              Why: <span className="ml-1 font-semibold text-neutral-100">{sig.reason}</span>
                            </span>
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleExpanded(rep.id)}
                            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs font-semibold text-neutral-200 hover:bg-neutral-900 transition-all duration-150 active:scale-[0.98]"
                          >
                            {shouldExpand ? "Collapse list" : "Expand list"}
                          </button>

                          {stuckPill(sig)}

                          <>
                            <button
                              type="button"
                              className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs font-semibold text-neutral-200 hover:bg-neutral-900 transition-all duration-150 active:scale-[0.98]"
                              onClick={() =>
                                jumpToCreateAndPrefill({
                                  repId: rep.id,
                                  type: "sparring",
                                  title: "Run 1 sparring drill today",
                                })
                              }
                            >
                              Assign sparring drill today
                            </button>

                            <button
                              type="button"
                              className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs font-semibold text-neutral-200 hover:bg-neutral-900 transition-all duration-150 active:scale-[0.98]"
                              onClick={() =>
                                jumpToCreateAndPrefill({
                                  repId: rep.id,
                                  type: "call_review",
                                  title: "Review a sales call today",
                                })
                              }
                            >
                              Assign call review today
                            </button>

                            <button
                              type="button"
                              className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs font-semibold text-neutral-200 hover:bg-neutral-900 transition-all duration-150 active:scale-[0.98]"
                              onClick={() =>
                                jumpToCreateAndPrefill({
                                  repId: rep.id,
                                  type: "custom",
                                  title: "Follow up on current assignment",
                                })
                              }
                            >
                              Assign follow-up task
                            </button>

                            <button
                              type="button"
                              className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs font-semibold text-neutral-200 hover:bg-neutral-900 transition-all duration-150 active:scale-[0.98]"
                              onClick={() => jumpToCreateAndPrefill({ repId: rep.id })}
                            >
                              Quick assign
                            </button>
                          </>
                        </div>
                      </div>

                      {(() => {
                        const suggestion = repNextAction({ rep, raw, signals });
                        if (!suggestion) return null;

                        return (
                          <div className="mt-3 rounded-lg border border-neutral-800 bg-black/40 px-3 py-2 text-xs text-neutral-400">
                            Suggested next move: <span className="font-medium text-neutral-200">{suggestion}</span>
                          </div>
                        );
                      })()}

                      <div className="mt-3 text-xs text-neutral-500">
                        Showing {filtered.length} of {list.filter((a) => matches(rep, a, q)).length} matching
                        {Number.isFinite(perRepLimit) ? ` (max ${perRepLimit})` : ""}
                      </div>

                      {shouldExpand ? (
                        <div className="mt-4 overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <thead className="text-xs text-neutral-500">
                              <tr>
                                <th className="py-2 pr-3">Title</th>
                                <th className="py-2 pr-3">Type</th>
                                <th className="py-2 pr-3">Status</th>
                                <th className="py-2 pr-3">Due</th>
                                <th className="py-2 pr-3">Created</th>
                                <th className="py-2 pr-0 text-right">Actions</th>
                              </tr>
                            </thead>

                            <tbody className="align-top">
                              {filtered.map((a) => {
                                const overdue = isOverdue(a);
                                return (
                                  <tr
                                    key={a.id}
                                    className={["border-t border-neutral-900", overdue ? "bg-red-500/5" : ""].join(" ")}
                                  >
                                    <td className="py-2 pr-3">
                                      <div className="font-semibold text-neutral-200">{a.title || "(Untitled)"}</div>
                                    </td>
                                    <td className="py-2 pr-3 text-neutral-300">{a.type}</td>
                                    <td className="py-2 pr-3">{statusPill(a.status, overdue)}</td>
                                    <td className="py-2 pr-3 text-neutral-300">{fmt(a.due_at)}</td>
                                    <td className="py-2 pr-3 text-neutral-500">{fmt(a.created_at)}</td>
                                    <td className="py-2 pr-0">
                                      {String(a.status).toLowerCase() === "completed" ? (
                                        <div className="flex items-center justify-end gap-2">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              jumpToCreateAndPrefill({
                                                repId: rep.id,
                                                type: a.type,
                                                title: a.title || "",
                                                dueYmd: todayYmd(),
                                              })
                                            }
                                            className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs font-semibold text-neutral-200 hover:bg-neutral-900 transition-all duration-150 active:scale-[0.98]"
                                          >
                                            Reassign
                                          </button>

                                          <button
                                            type="button"
                                            disabled={actioningId === a.id}
                                            onClick={() => void deleteAssignment(a.id)}
                                            className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs font-semibold text-neutral-200 hover:bg-neutral-900 transition-all duration-150 active:scale-[0.98] disabled:opacity-50"
                                          >
                                            Delete
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center justify-end gap-2">
                                          <button
                                            type="button"
                                            disabled={actioningId === a.id}
                                            onClick={() => void markComplete(a.id)}
                                            className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-black hover:bg-neutral-200 transition-all duration-150 active:scale-[0.98] hover:brightness-95 disabled:opacity-50"
                                          >
                                            Force complete
                                          </button>

                                          <button
                                            type="button"
                                            disabled={actioningId === a.id}
                                            onClick={() => void setDueToday(a.id)}
                                            className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs font-semibold text-neutral-200 hover:bg-neutral-900 transition-all duration-150 active:scale-[0.98] disabled:opacity-50"
                                          >
                                            Due today
                                          </button>

                                          <button
                                            type="button"
                                            disabled={actioningId === a.id}
                                            onClick={() => void nudgeRep(rep.id, a.id)}
                                            className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs font-semibold text-neutral-200 hover:bg-neutral-900 transition-all duration-150 active:scale-[0.98] disabled:opacity-50"
                                          >
                                            Nudge
                                          </button>

                                          <button
                                            type="button"
                                            disabled={actioningId === a.id}
                                            onClick={() => void deleteAssignment(a.id)}
                                            className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs font-semibold text-neutral-200 hover:bg-neutral-900 transition-all duration-150 active:scale-[0.98] disabled:opacity-50"
                                          >
                                            Delete
                                          </button>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </section>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
      )}

      {bulkOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-neutral-100">
                  {bulkKind === "assign_stale_drill" ? "Assign drills to stale reps" : "Clear overdue noise"}
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  {bulkKind === "assign_stale_drill"
                    ? `This will assign 1 sparring drill to ${bulkPreview.staleRepCount} stale rep${bulkPreview.staleRepCount === 1 ? "" : "s"}.`
                    : `This will set due today for ${bulkPreview.overdueCount} overdue assignment${bulkPreview.overdueCount === 1 ? "" : "s"}.`}
                </div>
              </div>

              <button
                type="button"
                onClick={closeBulk}
                className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs font-semibold text-neutral-200 hover:bg-neutral-900"
              >
                Close
              </button>
            </div>

            {bulkErr ? (
              <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                {bulkErr}
              </div>
            ) : null}

            {bulkResult ? (
              <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                Done. {bulkResult.ok} ok, {bulkResult.fail} failed.
              </div>
            ) : null}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={bulkBusy}
                onClick={closeBulk}
                className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm font-semibold text-neutral-200 hover:bg-neutral-900 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void runBulkAction()}
                className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-neutral-200 disabled:opacity-50"
              >
                {bulkBusy ? "Running…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}