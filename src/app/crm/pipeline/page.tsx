"use client";

// src/app/crm/pipeline/page.tsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { proxyFetch } from "@/lib/api";
import { supabase } from "@/lib/supabaseClient"


type StageKey = string;

type Rep = {
  id: string;
  name?: string | null;
  tier?: string | null;
};

type Opportunity = {
  id: string;
  name?: string | null;
  title?: string | null;
  stage?: StageKey | null;
  amount?: number | null;
  value?: number | null;
  currency?: string | null;
  close_date?: string | null;
  account_id?: string | null;
  account_name?: string | null;
  contact_id?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type PipelineColumn = {
  key: StageKey;
  title: string;
  count?: number;
};

type PipelineResp = {
  ok: boolean;

  // Shape A (current API): { stages: string[], columns: {}, items: [] }
  stages?: string[];
  columns?: Record<string, any> | PipelineColumn[];
  items?: Opportunity[];

  // Shape B (older tolerant): { stages: [{key,title,name}], opportunities: [] }
  stages_obj?: Array<{ key: string; title?: string; name?: string }>;
  opportunities?: Opportunity[];

  error?: string;
};

function safeStr(v: any, fallback = ""): string {
  if (typeof v === "string") return v;
  if (v === null || v === undefined) return fallback;
  return String(v);
}

function isEmail(s: string): boolean {
  const v = s.trim();
  if (!v) return false;
  // simple, pragmatic
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function formatMoney(amount: number, currency?: string | null): string {
  const c = (currency ?? "").trim() || "GBP";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: c,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${c} ${Math.round(amount)}`;
  }
}

function formatShortDate(iso?: string | null): string {
  const s = (iso ?? "").trim();
  if (!s) return "";
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short" }).format(d);
  } catch {
    // Fallback: YYYY-MM-DD -> DD Mon
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return s;
    const day = m[3];
    const mon = m[2];
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const mi = Math.max(1, Math.min(12, Number(mon))) - 1;
    return `${day} ${months[mi]}`;
  }
}

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function StagePill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-neutral-800 bg-neutral-950 px-2 py-0.5 text-[11px] text-neutral-300">
      {label}
    </span>
  );
}

function Toast({ msg, onClose }: { msg: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2200);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-4 right-4 z-50 rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 shadow-xl">
      <div className="text-sm text-neutral-100">{msg}</div>
      <button
        onClick={onClose}
        className="mt-1 text-xs text-neutral-400 hover:text-neutral-200"
        type="button"
      >
        Dismiss
      </button>
    </div>
  );
}

function ModalShell({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div className="absolute left-1/2 top-1/2 w-[min(560px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-900 px-5 py-4">
          <div className="text-sm font-medium text-neutral-100">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-900"
          >
            Close
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function DrawerShell({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div className="absolute right-0 top-0 h-full w-[min(520px,calc(100vw-16px))] border-l border-neutral-800 bg-neutral-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-900 px-5 py-4">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Opportunity</div>
            <div className="truncate text-sm font-medium text-neutral-100">{title}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-900"
          >
            Close
          </button>
        </div>
        <div className="h-[calc(100%-56px)] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">
      {children}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        "h-10 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-white/10",
        props.className
      )}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={clsx(
        "h-10 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-200 focus:outline-none focus:ring-2 focus:ring-white/10",
        props.className
      )}
    />
  );
}

export default function PipelinePage() {
  const sp = useSearchParams();
  const initialQ = safeStr(sp.get("q") ?? "").trim();
  const initialScope =
    safeStr(sp.get("scope") ?? "").trim().toLowerCase() === "team" ? "team" : "mine";
  const initialRepId = safeStr(sp.get("repId") ?? "").trim();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Quick-create modal (Day 50)
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStage, setNewStage] = useState<StageKey>("new");
  const [newAmount, setNewAmount] = useState<string>("");
  const [newCurrency, setNewCurrency] = useState<string>("GBP");
  const [newAccountName, setNewAccountName] = useState<string>("");
  const [newContactEmail, setNewContactEmail] = useState<string>("");
  const [creating, setCreating] = useState(false);

  // Quick-create Contact / Account
  const [qcOpen, setQcOpen] = useState<null | "contact" | "account">(null)
  const [qcLoading, setQcLoading] = useState(false)
  const [qcError, setQcError] = useState<string | null>(null)

  const [qcFirstName, setQcFirstName] = useState("")
  const [qcLastName, setQcLastName] = useState("")
  const [qcEmail, setQcEmail] = useState("")
  const [qcCompany, setQcCompany] = useState("")

  const [qcAccountName, setQcAccountName] = useState("")

  function resetQc() {
    setQcError(null)
    setQcFirstName("")
    setQcLastName("")
    setQcEmail("")
    setQcCompany("")
    setQcAccountName("")
  }


  // Opportunity drawer (Day 50)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerOppId, setDrawerOppId] = useState<string>("");

  const [oppDetailLoading, setOppDetailLoading] = useState(false);
  const [oppSaving, setOppSaving] = useState(false);
  const [oppDetail, setOppDetail] = useState<Opportunity | null>(null);

  // Day 51: tasks linked to the selected opportunity
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueAt, setTaskDueAt] = useState("");
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);

  // Server summary (Day 50)
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summary, setSummary] = useState<any>(null);

  const [query, setQuery] = useState(initialQ);

  // Pipeline scope
  // - mine: show only my opportunities
  // - team: manager view (all reps) OR filtered to a specific rep via repId
  const [scope, setScope] = useState<"mine" | "team">(initialScope as "mine" | "team");
  const [repId, setRepId] = useState<string>(initialScope === "team" ? initialRepId : "");
  const [reps, setReps] = useState<Rep[]>([]);
  const [repsLoading, setRepsLoading] = useState(false);
  const [columns, setColumns] = useState<PipelineColumn[]>([
    { key: "new", title: "New" },
    { key: "contacted", title: "Contacted" },
    { key: "qualified", title: "Qualified" },
    { key: "proposal", title: "Proposal" },
    { key: "negotiation", title: "Negotiation" },
    { key: "won", title: "Won" },
    { key: "lost", title: "Lost" },
  ]);
  const [items, setItems] = useState<Opportunity[]>([]);

  // drag state
  const dragOppIdRef = useRef<string | null>(null);
  const dragFromStageRef = useRef<string | null>(null);

  const normalised = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = items;
    if (!q) return base;

    return base.filter((o) => {
      const name = safeStr(o.name ?? o.title ?? "").toLowerCase();
      const acct = safeStr(o.account_name ?? "").toLowerCase();
      const cName = safeStr(o.contact_name ?? "").toLowerCase();
      const cEmail = safeStr(o.contact_email ?? "").toLowerCase();
      return name.includes(q) || acct.includes(q) || cName.includes(q) || cEmail.includes(q);
    });
  }, [items, query]);

  const grouped = useMemo(() => {
    const map: Record<string, Opportunity[]> = {};
    for (const c of columns) map[c.key] = [];

    for (const opp of normalised) {
      const k0 = safeStr(opp.stage ?? "new") || "new";
      const k = map[k0] ? k0 : "new";
      if (!map[k]) map[k] = [];
      map[k].push(opp);
    }

    // keep stable ordering: updated_at desc, then created_at desc
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => {
        const aT = new Date(String(a.updated_at ?? a.created_at ?? 0)).getTime();
        const bT = new Date(String(b.updated_at ?? b.created_at ?? 0)).getTime();
        return bT - aT;
      });
    }

    return map;
  }, [normalised, columns]);

  const drawerOpp = useMemo(() => {
    const id = drawerOppId.trim();
    if (!id) return null;
    return items.find((o) => String(o.id) === String(id)) ?? null;
  }, [drawerOppId, items]);

  // Move openDrawer to after fetchTasksForOpportunity (per instructions)

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    setOppDetail(null);
    setDrawerOppId("");
    setTaskTitle("");
    setTaskDueAt("");
    setTasks([]);
  }, []);

  const apiPostJson = useCallback(async (path: string, payload: any) => {
    const r = await proxyFetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload ?? {}),
      cache: "no-store",
    });
    const j = await r.json().catch(() => null);
    return { r, j } as { r: Response; j: any };
  }, []);

  function extractIdFromAny(x: any): string {
    const candidates = [
      x?.id,
      x?.contact?.id,
      x?.account?.id,
      x?.opportunity?.id,
      x?.data?.id,
      x?.item?.id,
    ];
    for (const c of candidates) {
      const s = safeStr(c ?? "").trim();
      if (s) return s;
    }
    return "";
  }

  function buildScopeQS() {
    const qs = new URLSearchParams();
    if (scope === "team") {
      qs.set("scope", "team");
      if (repId.trim()) qs.set("repId", repId.trim());
    }
    const s = qs.toString();
    return s ? `?${s}` : "";
  }

  const apiPatchJson = useCallback(async (path: string, payload: any) => {
    const r = await proxyFetch(path, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload ?? {}),
      cache: "no-store",
    });
    const j = await r.json().catch(() => null);
    return { r, j } as { r: Response; j: any };
  }, []);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const url = `/v1/crm/opportunities/pipeline/summary${buildScopeQS()}`;
      const r = await proxyFetch(url, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        // fail-soft (don’t block pipeline)
        return;
      }
      setSummary(j);
    } catch {
      // ignore
    } finally {
      setSummaryLoading(false);
    }
  }, [scope, repId]);

  const fetchOpportunity = useCallback(
    async (id: string) => {
      const oppId = safeStr(id).trim();
      if (!oppId) return;
      setOppDetailLoading(true);
      try {
        const url = `/v1/crm/opportunities/${encodeURIComponent(oppId)}${buildScopeQS()}`;
        const r = await proxyFetch(url, { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) {
          setToast(`Load failed: ${safeStr(j?.error ?? `fetch_failed_${r.status}`)}`);
          return;
        }
        setOppDetail((j.opportunity ?? null) as Opportunity | null);
      } finally {
        setOppDetailLoading(false);
      }
    },
    [scope, repId]
  );


  const fetchTasksForOpportunity = useCallback(async (oppId: string) => {
    const id = safeStr(oppId).trim();
    if (!id) {
      setTasks([]);
      return;
    }
    setTasksLoading(true);
    try {
      const r = await proxyFetch("/v1/crm/activities?type=task", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setToast(`Tasks failed: ${safeStr(j?.error ?? `tasks_fetch_failed_${r.status}`)}`);
        setTasks([]);
        return;
      }
      const items = Array.isArray(j?.items) ? j.items : [];
      const filtered = items.filter((x: any) => safeStr(x?.opportunity_id ?? "") === id);
      filtered.sort((a: any, b: any) => {
        const ad = new Date(String(a?.due_at ?? a?.created_at ?? 0)).getTime();
        const bd = new Date(String(b?.due_at ?? b?.created_at ?? 0)).getTime();
        return ad - bd;
      });
      setTasks(filtered);
    } finally {
      setTasksLoading(false);
    }
  }, []);

  const openDrawer = useCallback(
    (oppId: string) => {
      const id = safeStr(oppId).trim();
      if (!id) return;
      setDrawerOppId(id);
      setDrawerOpen(true);
      setOppDetail(null);
      setTaskTitle("");
      setTaskDueAt("");
      setTasks([]);
      void fetchOpportunity(id);
      void fetchTasksForOpportunity(id);
    },
    [fetchOpportunity, fetchTasksForOpportunity]
  );

  const createTaskForOpportunity = useCallback(async (oppId: string) => {
    const id = safeStr(oppId).trim();
    const title = taskTitle.trim();
    if (!id) return;
    if (!title) {
      setToast("Task title is required");
      return;
    }

    setTaskSaving(true);
    try {
      const r = await proxyFetch("/v1/crm/activities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          type: "task",
          title,
          status: "open",
          due_at: taskDueAt.trim() || null,
          opportunity_id: id,
        }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setToast(`Task create failed: ${safeStr(j?.error ?? `task_create_failed_${r.status}`)}`);
        return;
      }
      setTaskTitle("");
      setTaskDueAt("");
      setToast("Task created ✓");
      await fetchTasksForOpportunity(id);
    } finally {
      setTaskSaving(false);
    }
  }, [taskTitle, taskDueAt, fetchTasksForOpportunity]);

  const completeTask = useCallback(async (taskId: string, oppId: string) => {
    const tid = safeStr(taskId).trim();
    const oid = safeStr(oppId).trim();
    if (!tid || !oid) return;
    try {
      const r = await proxyFetch(`/v1/crm/activities/${encodeURIComponent(tid)}/complete`, {
        method: "POST",
        cache: "no-store",
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setToast(`Task complete failed: ${safeStr(j?.error ?? `task_complete_failed_${r.status}`)}`);
        return;
      }
      setToast("Task completed ✓");
      await fetchTasksForOpportunity(oid);
    } catch (e: any) {
      setToast(`Task complete failed: ${safeStr(e?.message ?? "task_complete_failed")}`);
    }
  }, [fetchTasksForOpportunity]);

  const createProposalChaseCadence = useCallback(async (oppId: string) => {
    const id = safeStr(oppId).trim();
    if (!id) return;

    const now = new Date();
    const addDays = (days: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() + days);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };

    const steps = [
      { title: "Send proposal", due_at: addDays(0) },
      { title: "Follow up email", due_at: addDays(2) },
      { title: "Call decision maker", due_at: addDays(5) },
      { title: "Final check-in", due_at: addDays(8) },
    ];

    setTaskSaving(true);
    try {
      for (const step of steps) {
        const r = await proxyFetch("/v1/crm/activities", {
          method: "POST",
          headers: { "content-type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            type: "task",
            title: step.title,
            status: "open",
            due_at: step.due_at,
            opportunity_id: id,
          }),
        });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) {
          setToast(`Cadence failed: ${safeStr(j?.error ?? `cadence_create_failed_${r.status}`)}`);
          return;
        }
      }

      setToast("Proposal chase added ✓");
      await fetchTasksForOpportunity(id);
    } finally {
      setTaskSaving(false);
    }
  }, [fetchTasksForOpportunity]);

  const saveOpportunity = useCallback(
    async (id: string, patch: any) => {
      const oppId = safeStr(id).trim();
      if (!oppId) return;
      setOppSaving(true);
      try {
        const url = `/v1/crm/opportunities/${encodeURIComponent(oppId)}${buildScopeQS()}`;
        const { r, j } = await apiPatchJson(url, patch);
        if (!r.ok || !j?.ok) {
          setToast(`Save failed: ${safeStr(j?.error ?? `save_failed_${r.status}`)}`);
          return;
        }
        setToast("Saved ✓");
        // Keep UI consistent: refresh board + summary + reload detail
        await refresh();
        await fetchSummary();
        await fetchOpportunity(oppId);
      } finally {
        setOppSaving(false);
      }
    },
    [apiPatchJson, fetchOpportunity, fetchSummary]
  );

  const upsertContactByEmail = useCallback(
    async (email: string) => {
      const e = email.trim().toLowerCase();
      if (!e) return { id: "", warning: "" };

      // Best-effort: try common endpoint(s). If missing, fail-soft.
      const attempts: Array<{ path: string; payload: any }> = [
        { path: "/v1/crm/contacts", payload: { email: e } },
        { path: "/v1/crm/contacts/find-or-create", payload: { email: e } },
        { path: "/v1/crm/contacts/upsert", payload: { email: e } },
      ];

      for (const a of attempts) {
        try {
          const { r, j } = await apiPostJson(a.path, a.payload);
          if (!r.ok || !j?.ok) continue;
          const id = extractIdFromAny(j);
          if (id) return { id, warning: "" };
        } catch {
          // ignore
        }
      }

      return { id: "", warning: "contact_endpoint_unavailable" };
    },
    [apiPostJson]
  );

  const upsertAccountByName = useCallback(
    async (name: string) => {
      const n = name.trim();
      if (!n) return { id: "", warning: "" };

      const attempts: Array<{ path: string; payload: any }> = [
        { path: "/v1/crm/accounts", payload: { name: n } },
        { path: "/v1/crm/accounts/find-or-create", payload: { name: n } },
        { path: "/v1/crm/accounts/upsert", payload: { name: n } },
      ];

      for (const a of attempts) {
        try {
          const { r, j } = await apiPostJson(a.path, a.payload);
          if (!r.ok || !j?.ok) continue;
          const id = extractIdFromAny(j);
          if (id) return { id, warning: "" };
        } catch {
          // ignore
        }
      }

      return { id: "", warning: "account_endpoint_unavailable" };
    },
    [apiPostJson]
  );



  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (scope === "team") {
        qs.set("scope", "team");
        if (repId.trim()) qs.set("repId", repId.trim());
      }
      const url = qs.toString()
        ? `/v1/crm/opportunities/pipeline?${qs.toString()}`
        : "/v1/crm/opportunities/pipeline";

      const r = await proxyFetch(url, { cache: "no-store" });
      const json = (await r.json()) as PipelineResp;

      if (!json?.ok) {
        const errMsg = json?.error ?? "pipeline_fetch_failed";
        // If user isn't allowed for team scope, fail-soft back to mine.
        if (scope === "team" && (errMsg === "forbidden_not_manager" || errMsg === "forbidden")) {
          setScope("mine");
          setRepId("");
          setToast("Team view is manager-only");
          setError(null);
          return;
        }
        setError(errMsg);
        setItems([]);
        return;
      }

      // ---------------------------
      // Tolerant response handling
      // Current API returns:
      //   { ok:true, stages:["new",...], columns:{}, items:[] }
      // ---------------------------

      const apiStagesRaw: any = (json as any).stages;
      const apiStages: string[] = Array.isArray(apiStagesRaw)
        ? apiStagesRaw.map((s) => String(s)).filter(Boolean)
        : [];

      // Support older shape: stages as objects
      const apiStagesObjRaw: any = (json as any).stages_obj;
      const apiStagesObj: PipelineColumn[] = Array.isArray(apiStagesObjRaw)
        ? apiStagesObjRaw
          .map((s: any) => ({ key: String(s?.key ?? "").trim(), title: String(s?.title ?? s?.name ?? s?.key ?? "").trim() }))
          .filter((x) => !!x.key)
        : [];

      // Support `columns` as an array (legacy)
      const apiColumnsArrRaw: any = (json as any).columns;
      const apiColumnsArr: PipelineColumn[] = Array.isArray(apiColumnsArrRaw)
        ? apiColumnsArrRaw
          .map((c: any) => ({ key: String(c?.key ?? "").trim(), title: String(c?.title ?? c?.key ?? "").trim() }))
          .filter((x) => !!x.key)
        : [];

      // Items
      const opps: Opportunity[] = (json.items ?? json.opportunities ?? []) as Opportunity[];

      // Build columns list (prefer stages from API, then legacy columns, then existing defaults)
      const fromStages: PipelineColumn[] = apiStages.length
        ? apiStages.map((k) => ({ key: String(k), title: String(k).length ? String(k).slice(0, 1).toUpperCase() + String(k).slice(1) : "New" }))
        : [];

      const baseCols = (fromStages.length
        ? fromStages
        : apiColumnsArr.length
          ? apiColumnsArr
          : apiStagesObj.length
            ? apiStagesObj
            : []
      )
        .filter((c) => !!c && !!c.key)
        .map((c) => ({ key: String(c.key), title: String(c.title ?? c.key) }));

      // Merge onto previous columns so we keep a stable board even if API returns a subset.
      setColumns((prev) => {
        const mergedKeys = new Set<string>();
        const merged: PipelineColumn[] = [];

        for (const c of prev) {
          const k = String(c.key);
          if (!mergedKeys.has(k)) {
            mergedKeys.add(k);
            merged.push({ key: k, title: String(c.title ?? k) });
          }
        }

        for (const c of baseCols) {
          const k = String(c.key);
          if (!mergedKeys.has(k)) {
            mergedKeys.add(k);
            merged.push({ key: k, title: String(c.title ?? k) });
          }
        }

        return merged;
      });

      setItems(Array.isArray(opps) ? opps : []);
    } catch (e: any) {
      setError(e?.message ?? "pipeline_fetch_failed");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [scope, repId]);


  const createOpportunity = useCallback(
    async () => {
      const name = newName.trim();
      if (!name) {
        setToast("Name is required");
        return;
      }

      const stage = String(newStage || "new").trim() || "new";

      const amtRaw = newAmount.trim();
      const amt = amtRaw ? Number(amtRaw) : null;
      if (amtRaw && (!Number.isFinite(amt) || (amt as number) < 0)) {
        setToast("Amount must be a number");
        return;
      }

      const email = newContactEmail.trim();
      if (email && !isEmail(email)) {
        setToast("Contact email looks invalid");
        return;
      }

      const accountName = newAccountName.trim();

      setCreating(true);
      setError(null);

      try {
        const contactRes = email ? await upsertContactByEmail(email) : { id: "", warning: "" };
        const accountRes = accountName ? await upsertAccountByName(accountName) : { id: "", warning: "" };

        if (contactRes.warning || accountRes.warning) {
          const bits = [
            contactRes.warning ? "contact" : "",
            accountRes.warning ? "account" : "",
          ].filter(Boolean);
          if (bits.length) setToast(`Note: ${bits.join("+")} link endpoints not live yet — saved as text only`);
        }

        const payload: any = {
          name,
          title: name,
          stage,
          amount: amt,
          value: amt,
          currency: (newCurrency || "GBP").trim() || "GBP",
          account_id: accountRes.id || null,
          accountId: accountRes.id || null,
          contact_id: contactRes.id || null,
          contactId: contactRes.id || null,
          account_name: accountName || null,
          accountName: accountName || null,
          contact_email: email ? email.toLowerCase() : null,
          contactEmail: email ? email.toLowerCase() : null,
          email: email ? email.toLowerCase() : null,
          ...(scope === "team" && repId.trim() ? { repId: repId.trim(), rep_id: repId.trim() } : {}),
        };

        const { r, j } = await apiPostJson("/v1/crm/opportunities", payload);

        if (!r.ok || !j?.ok) {
          const err = j?.error ?? `create_failed_${r.status}`;
          setToast(String(err));
          return;
        }

        setToast("Created ✓");
        setNewOpen(false);
        setNewName("");
        setNewStage("new");
        setNewAmount("");
        setNewCurrency("GBP");
        setNewAccountName("");
        setNewContactEmail("");

        await refresh();
        await fetchSummary();
      } catch (e: any) {
        setToast(e?.message ?? "create_failed");
      } finally {
        setCreating(false);
      }
    },
    [
      newName,
      newStage,
      newAmount,
      newCurrency,
      newAccountName,
      newContactEmail,
      scope,
      repId,
      apiPostJson,
      refresh,
      fetchSummary,
      upsertContactByEmail,
      upsertAccountByName,
    ]
  );
  async function submitQuickCreate() {
    try {
      setQcLoading(true);
      setQcError(null);

      if (qcOpen === "contact") {
        const email = qcEmail.trim().toLowerCase();
        if (!email || !isEmail(email)) throw new Error("valid_email_required");

        const r = await proxyFetch("/v1/crm/contacts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            first_name: qcFirstName || null,
            last_name: qcLastName || null,
            email,
            company: qcCompany || null,
          }),
        });

        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(j?.error || `contact_create_failed_${r.status}`);

        setQcOpen(null);
        resetQc();
        await refresh();
        await fetchSummary();
        setToast("Contact created ✓");
        return;
      }

      if (qcOpen === "account") {
        const name = qcAccountName.trim();
        if (!name) throw new Error("account_name_required");

        const r = await proxyFetch("/v1/crm/accounts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ name }),
        });

        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(j?.error || `account_create_failed_${r.status}`);

        setQcOpen(null);
        resetQc();
        await refresh();
        await fetchSummary();
        setToast("Account created ✓");
        return;
      }
    } catch (e: any) {
      setQcError(String(e?.message ?? "quick_create_failed"));
    } finally {
      setQcLoading(false);
    }
  }

const fetchReps = useCallback(async () => {
  setRepsLoading(true);
  try {
    // Manager-gated; if forbidden, we silently keep the UI in "mine".
    const r = await proxyFetch("/v1/admin/reps", { cache: "no-store" });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) {
      // If this user isn't a manager, endpoint will 403.
      return;
    }

    const items: any[] = Array.isArray(j?.items) ? j.items : Array.isArray(j?.reps) ? j.reps : [];
    const parsed: Rep[] = items
      .map((x) => ({
        id: safeStr(x?.id ?? x?.user_id ?? "").trim(),
        name: safeStr(x?.name ?? x?.full_name ?? "").trim() || null,
        tier: safeStr(x?.tier ?? x?.role ?? "").trim() || null,
      }))
      .filter((x) => !!x.id);

    setReps(parsed);
  } catch {
    // ignore
  } finally {
    setRepsLoading(false);
  }
}, []);

useEffect(() => {
  refresh();
  fetchSummary();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

useEffect(() => {
  const channel = supabase
    .channel("crm-opportunities")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "crm_opportunities",
      },
      () => {
        void refresh();
        void fetchSummary();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [refresh, fetchSummary]);

useEffect(() => {
  // Manager-only, fetch on demand when switching to Team.
  if (scope === "team" && !repsLoading && reps.length === 0) {
    fetchReps();
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [scope]);

useEffect(() => {
  // Keep pipeline + summary in sync with scope/rep selection.
  refresh();
  fetchSummary();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [scope, repId]);

const patchStage = useCallback(
  async (oppId: string, toStage: string) => {
    const qs = new URLSearchParams();
    if (scope === "team") {
      qs.set("scope", "team");
      if (repId.trim()) qs.set("repId", repId.trim());
    }

    // IMPORTANT: always go through the Next proxy so headers/cookies are attached.
    const base = `/api/proxy/v1/crm/opportunities/${encodeURIComponent(oppId)}/stage`;
    const url = qs.toString() ? `${base}?${qs.toString()}` : base;

    const r = await proxyFetch(url, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage: toStage }),
      cache: "no-store",
    });
    const json = await r.json().catch(() => null);
    if (!r.ok || !json?.ok) {
      const err = json?.error ?? `stage_update_failed_${r.status}`;
      throw new Error(err);
    }
    return json;
  },
  [scope, repId]
);

const moveOptimistic = useCallback(
  (oppId: string, toStage: string) => {
    setItems((prev) =>
      prev.map((o) => (String(o.id) === String(oppId) ? { ...o, stage: toStage } : o))
    );
  },
  []
);

const onDropToStage = useCallback(
  async (toStage: string) => {
    const oppId = dragOppIdRef.current;
    const fromStage = dragFromStageRef.current;
    dragOppIdRef.current = null;
    dragFromStageRef.current = null;

    if (!oppId) return;
    if (fromStage && String(fromStage) === String(toStage)) return;

    // optimistic move
    moveOptimistic(oppId, toStage);
    setToast("Moved ✓");

    try {
      await patchStage(oppId, toStage);
      await refresh();
      await fetchSummary();
    } catch (e: any) {
      // revert + toast error
      if (fromStage) moveOptimistic(oppId, fromStage);
      const msg = String(e?.message ?? "stage_update_failed");
      setToast(`Move failed: ${msg}`);
    }
  },
  [moveOptimistic, patchStage, refresh, fetchSummary]
);

const totalValue = useMemo(() => {
  let sum = 0;
  for (const o of normalised) {
    const v = typeof o.amount === "number" ? o.amount : typeof o.value === "number" ? o.value : 0;
    if (Number.isFinite(v)) sum += v;
  }
  return sum;
}, [normalised]);

const managerSummary = useMemo(() => {
  // Leadership snapshot for team view. Derived from the already-loaded pipeline items.
  const all = normalised;

  const stageCounts: Record<string, number> = {};
  let openCount = 0;
  let wonCount = 0;
  let lostCount = 0;

  let openValue = 0;
  let wonValue = 0;

  const now = Date.now();
  const STUCK_DAYS = 7;
  const STUCK_MS = STUCK_DAYS * 24 * 60 * 60 * 1000;

  let stuckCount = 0;

  // This week (rolling 7d) close date count
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  let closingSoon = 0;

  for (const o of all) {
    const stage = safeStr(o.stage ?? "new") || "new";
    stageCounts[stage] = (stageCounts[stage] ?? 0) + 1;

    const v = typeof o.amount === "number" ? o.amount : typeof o.value === "number" ? o.value : 0;
    const val = Number.isFinite(v) ? v : 0;

    const isWon = stage === "won";
    const isLost = stage === "lost";
    const isOpen = !isWon && !isLost;

    if (isOpen) {
      openCount += 1;
      openValue += val;
    }
    if (isWon) {
      wonCount += 1;
      wonValue += val;
    }
    if (isLost) {
      lostCount += 1;
    }

    const updatedAt = new Date(String(o.updated_at ?? o.created_at ?? "")).getTime();
    if (Number.isFinite(updatedAt) && now - updatedAt > STUCK_MS && isOpen) {
      stuckCount += 1;
    }

    const cd = new Date(String((o as any).close_date ?? "")).getTime();
    if (Number.isFinite(cd) && cd > now && cd - now <= WEEK_MS && isOpen) {
      closingSoon += 1;
    }
  }

  // Top stages (excluding won/lost) for quick glance.
  const topStages = Object.entries(stageCounts)
    .filter(([k]) => k !== "won" && k !== "lost")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => ({ key: k, count: v }));

  return {
    totalCount: all.length,
    openCount,
    wonCount,
    lostCount,
    openValue,
    wonValue,
    stuckCount,
    closingSoon,
    topStages,
  };
}, [normalised]);

const showCreateCta = useMemo(() => {
  const q = query.trim();
  if (!q) return false;
  // premium feel: only show when typed looks like email and no results
  return isEmail(q) && normalised.length === 0;
}, [query, normalised.length]);

return (
  <div className="min-h-screen bg-neutral-950 text-neutral-100">
    {toast ? <Toast msg={toast} onClose={() => setToast(null)} /> : null}

    <DrawerShell
      title={safeStr(oppDetail?.name ?? drawerOpp?.name ?? drawerOpp?.title ?? "Untitled")}
      open={drawerOpen}
      onClose={closeDrawer}
    >
      {(() => {
        const d = oppDetail ?? drawerOpp;
        if (!d) {
          return <div className="text-sm text-neutral-400">No opportunity selected.</div>;
        }
        return (
          <div className="space-y-5">
            {oppDetailLoading ? (
              <div className="text-sm text-neutral-400">Loading…</div>
            ) : null}
            <div className="rounded-xl border border-neutral-900 bg-neutral-950 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-neutral-100">
                    <Input
                      value={oppDetail?.name ?? d.name ?? ""}
                      onChange={e => setOppDetail((prev) => ({ ...(prev ?? d), name: e.target.value } as any))}
                      placeholder="Opportunity name"
                    />
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">ID: {safeStr(d.id).slice(0, 12)}</div>
                </div>
                <StagePill label={safeStr(d.stage ?? "new")} />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>Stage</Label>
                  <div className="mt-1">
                    <Select
                      value={safeStr(d.stage ?? "new")}
                      onChange={async (e) => {
                        const toStage = e.target.value;
                        const prevStage = safeStr(d.stage ?? "new");
                        if (!d?.id) return;
                        if (toStage === prevStage) return;
                        // Optimistically move locally
                        setOppDetail((prev) => ({ ...(prev ?? d), stage: toStage } as any));
                        moveOptimistic(d.id, toStage);
                        setToast("Moved ✓");
                        try {
                          await saveOpportunity(d.id, { stage: toStage });
                        } catch (err: any) {
                          setOppDetail((prev) => ({ ...(prev ?? d), stage: prevStage } as any));
                          moveOptimistic(d.id, prevStage);
                          setToast(`Move failed: ${safeStr(err?.message ?? "stage_update_failed")}`);
                        }
                      }}
                    >
                      {columns.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.title}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>Value</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <Select
                      value={oppDetail?.currency ?? d.currency ?? "GBP"}
                      onChange={e => setOppDetail((prev) => ({ ...(prev ?? d), currency: e.target.value } as any))}
                      className="w-[120px]"
                    >
                      <option value="GBP">GBP</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                    </Select>
                    <Input
                      inputMode="decimal"
                      value={String(oppDetail?.amount ?? d.amount ?? "")}
                      onChange={e => {
                        let v = e.target.value;
                        // Only allow numbers
                        setOppDetail((prev) => ({
                          ...(prev ?? d),
                          amount: v === "" ? null : Number(v)
                        } as any));
                      }}
                      placeholder="Amount"
                    />
                  </div>
                </div>

                <div>
                  <Label>Close date</Label>
                  <div className="mt-1">
                    <Input
                      placeholder="YYYY-MM-DD"
                      value={safeStr(oppDetail?.close_date ?? d.close_date ?? "")}
                      onChange={e =>
                        setOppDetail((prev) => ({ ...(prev ?? d), close_date: e.target.value } as any))
                      }
                    />
                  </div>
                </div>

                <div>
                  <Label>Account</Label>
                  <div className="mt-1 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200">
                    {safeStr(d.account_name ?? "").trim() || "—"}
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <Label>Contact</Label>
                  <div className="mt-1 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200">
                    {safeStr(d.contact_name ?? "").trim() || safeStr(d.contact_email ?? "").trim() || "—"}
                  </div>
                </div>

                <div>
                  <Label>Updated</Label>
                  <div className="mt-1 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200">
                    {formatShortDate(d.updated_at) || "—"}
                  </div>
                </div>

                <div>
                  <Label>Created</Label>
                  <div className="mt-1 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200">
                    {formatShortDate(d.created_at) || "—"}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
                onClick={closeDrawer}
              >
                Done
              </button>
              <button
                type="button"
                className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-neutral-950 hover:opacity-90"
                onClick={async () => {
                  const cur = safeStr(d.stage ?? "new");
                  const idx = columns.findIndex((c) => c.key === cur);
                  const next = idx >= 0 ? columns[idx + 1]?.key : null;
                  if (!next) return;
                  setOppDetail((prev) => ({ ...(prev ?? d), stage: next } as any));
                  moveOptimistic(d.id, next);
                  setToast("Moved ✓");
                  try {
                    await saveOpportunity(d.id, { stage: next });
                  } catch (e: any) {
                    setOppDetail((prev) => ({ ...(prev ?? d), stage: cur } as any));
                    moveOptimistic(d.id, cur);
                    setToast(`Move failed: ${safeStr(e?.message ?? "stage_update_failed")}`);
                  }
                }}
              >
                Next stage →
              </button>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={oppSaving || !d?.id}
                className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-neutral-950 hover:opacity-90 disabled:opacity-60"
                onClick={async () => {
                  const cur = oppDetail ?? d;
                  await saveOpportunity(d.id, {
                    name: safeStr(cur?.name ?? "").trim() || null,
                    stage: safeStr(cur?.stage ?? "").trim() || null,
                    amount: cur?.amount ?? null,
                    currency: safeStr(cur?.currency ?? "").trim() || null,
                    close_date: safeStr((cur as any)?.close_date ?? "").trim() || null,
                  });
                }}
              >
                {oppSaving ? "Saving…" : "Save"}
              </button>
            </div>

            <div className="rounded-xl border border-neutral-900 bg-neutral-950 p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">Tasks</div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-900 disabled:opacity-60"
                  disabled={taskSaving || !d?.id}
                  onClick={async () => {
                    await createProposalChaseCadence(d.id);
                  }}
                >
                  + Proposal chase
                </button>
                <span className="text-[11px] text-neutral-500">
                  4 follow-up tasks over 8 days
                </span>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_160px_auto]">
                <Input
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="Add task title"
                />
                <Input
                  value={taskDueAt}
                  onChange={(e) => setTaskDueAt(e.target.value)}
                  placeholder="YYYY-MM-DD"
                />
                <button
                  type="button"
                  className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-neutral-950 hover:opacity-90 disabled:opacity-60"
                  disabled={taskSaving || !d?.id}
                  onClick={async () => {
                    await createTaskForOpportunity(d.id);
                  }}
                >
                  {taskSaving ? "Creating…" : "Add task"}
                </button>
              </div>

              <div className="mt-4 space-y-2">
                {tasksLoading ? (
                  <div className="text-sm text-neutral-400">Loading tasks…</div>
                ) : tasks.length === 0 ? (
                  <div className="text-sm text-neutral-500">No tasks yet.</div>
                ) : (
                  tasks.map((t) => {
                    const status = safeStr(t?.status ?? "open") || "open";
                    const done = status === "done";
                    return (
                      <div
                        key={safeStr(t?.id)}
                        className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className={clsx("text-sm", done ? "text-neutral-500 line-through" : "text-neutral-200")}>
                            {safeStr(t?.title ?? "Untitled task")}
                          </div>
                          <div className="mt-1 text-[11px] text-neutral-500">
                            Due: {formatShortDate(safeStr(t?.due_at ?? "")) || "none"}
                            <span className="ml-2 rounded-full border border-neutral-800 bg-neutral-950 px-2 py-0.5 text-[10px] text-neutral-400">
                              {status}
                            </span>
                          </div>
                        </div>

                        {!done ? (
                          <button
                            type="button"
                            className="shrink-0 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-900"
                            onClick={async () => {
                              await completeTask(safeStr(t?.id), d.id);
                            }}
                          >
                            Complete
                          </button>
                        ) : (
                          <span className="shrink-0 text-xs text-neutral-500">Done</span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            <div className="rounded-xl border border-neutral-900 bg-neutral-950 p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">Roadmap</div>
              <div className="mt-2 text-sm text-neutral-400">
                Next: notes, next step, tasks, and links to contact/account pages.
              </div>
            </div>
          </div>
        );
      })()}
    </DrawerShell>

    {/* Quick-Create ModalShell (sibling, before New Opportunity modal) */}
    <ModalShell
      title={qcOpen === "contact" ? "Create contact" : "Create account"}
      open={!!qcOpen}
      onClose={() => {
        setQcOpen(null);
        setQcError(null);
      }}
    >
      <div className="space-y-3">
        {qcOpen === "contact" ? (
          <>
            <div>
              <Label>First name (optional)</Label>
              <div className="mt-1">
                <Input value={qcFirstName} onChange={(e) => setQcFirstName(e.target.value)} placeholder="First name" />
              </div>
            </div>
            <div>
              <Label>Last name (optional)</Label>
              <div className="mt-1">
                <Input value={qcLastName} onChange={(e) => setQcLastName(e.target.value)} placeholder="Last name" />
              </div>
            </div>
            <div>
              <Label>Email</Label>
              <div className="mt-1">
                <Input value={qcEmail} onChange={(e) => setQcEmail(e.target.value)} placeholder="name@company.com" />
              </div>
            </div>
            <div>
              <Label>Company (optional)</Label>
              <div className="mt-1">
                <Input value={qcCompany} onChange={(e) => setQcCompany(e.target.value)} placeholder="Company" />
              </div>
            </div>
          </>
        ) : (
          <div>
            <Label>Account name</Label>
            <div className="mt-1">
              <Input value={qcAccountName} onChange={(e) => setQcAccountName(e.target.value)} placeholder="Account name" />
            </div>
          </div>
        )}

        {qcError ? <div className="text-xs text-red-400">{qcError}</div> : null}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
            onClick={() => setQcOpen(null)}
            disabled={qcLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-neutral-950 hover:opacity-90 disabled:opacity-60"
            onClick={submitQuickCreate}
            disabled={qcLoading}
          >
            {qcLoading ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </ModalShell>

    <ModalShell
      title="Create opportunity"
      open={newOpen}
      onClose={() => {
        if (creating) return;
        setNewOpen(false);
      }}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Name</Label>
            <div className="mt-1">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Acme renewal"
                autoFocus
              />
            </div>
          </div>

          <div>
            <Label>Stage</Label>
            <div className="mt-1">
              <Select value={newStage} onChange={(e) => setNewStage(e.target.value)}>
                {columns.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.title}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label>Amount (optional)</Label>
            <div className="mt-1 flex items-center gap-2">
              <Select
                value={newCurrency}
                onChange={(e) => setNewCurrency(e.target.value)}
                className="w-[120px]"
              >
                <option value="GBP">GBP</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </Select>
              <Input
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                placeholder="10000"
                inputMode="decimal"
              />
            </div>
          </div>

          <div>
            <Label>Account (optional)</Label>
            <div className="mt-1">
              <Input
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
                placeholder="e.g. Acme"
              />
            </div>
          </div>

          <div>
            <Label>Contact email (optional)</Label>
            <div className="mt-1">
              <Input
                value={newContactEmail}
                onChange={(e) => setNewContactEmail(e.target.value)}
                placeholder="name@company.com"
              />
            </div>
          </div>

          {scope === "team" ? (
            <div className="sm:col-span-2">
              <div className="rounded-xl border border-neutral-900 bg-neutral-950 p-3">
                <div className="text-xs text-neutral-400">
                  Team mode: if your API supports it, this will assign to the selected rep.
                </div>
                <div className="mt-2">
                  <Label>Owner rep (optional)</Label>
                  <div className="mt-1">
                    <Select value={repId} onChange={(e) => setRepId(e.target.value)}>
                      <option value="">All reps / Unassigned</option>
                      {reps.map((r) => (
                        <option key={r.id} value={r.id}>
                          {safeStr(r.name ?? "").trim() || r.id.slice(0, 8)}
                          {r.tier ? ` (${r.tier})` : ""}
                        </option>
                      ))}
                    </Select>
                  </div>
                  {repsLoading ? (
                    <div className="mt-2 text-xs text-neutral-500">Loading reps…</div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-neutral-500">
            API:{" "}
            <span className="rounded border border-neutral-800 bg-neutral-950 px-2 py-0.5">
              POST /v1/crm/opportunities
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setNewOpen(false)}
              disabled={creating}
              className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={createOpportunity}
              disabled={creating}
              className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-neutral-950 hover:opacity-90 disabled:opacity-60"
            >
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </ModalShell>

    <div className="mx-auto max-w-7xl px-6 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">Pipeline</h1>
            <StagePill label={loading ? "Loading" : "Live"} />
          </div>
          <p className="mt-1 text-sm text-neutral-400">
            Drag deals between stages. Keep it honest.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-neutral-800 bg-neutral-950 p-1">
            <button
              type="button"
              onClick={() => {
                setScope("mine");
                setRepId("");
                setToast("My pipeline");
              }}
              className={clsx(
                "rounded-md px-2 py-1 text-xs",
                scope === "mine"
                  ? "bg-white text-neutral-950"
                  : "text-neutral-200 hover:bg-neutral-900"
              )}
              title="Only my opportunities"
            >
              Mine
            </button>
            <button
              type="button"
              onClick={() => {
                setScope("team");
                setToast("Team pipeline");
                if (reps.length === 0 && !repsLoading) {
                  void fetchReps();
                }
              }}
              className={clsx(
                "rounded-md px-2 py-1 text-xs",
                scope === "team"
                  ? "bg-white text-neutral-950"
                  : "text-neutral-200 hover:bg-neutral-900"
              )}
              title="Manager view (team)"
            >
              Team
            </button>
          </div>

        {scope === "team" ? (
          <div className="flex items-center gap-2">
            <select
              value={repId}
              onChange={(e) => {
                setRepId(e.target.value);
              }}
              className="h-9 rounded-lg border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-200"
              title="Filter to a specific rep (optional)"
            >
              <option value="">All reps</option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>
                  {safeStr(r.name ?? "").trim() || r.id.slice(0, 8)}
                  {r.tier ? ` (${r.tier})` : ""}
                </option>
              ))}
            </select>
            {repsLoading ? (
              <span className="text-xs text-neutral-500">Loading reps…</span>
            ) : reps.length === 0 ? (
              <span className="text-xs text-neutral-500">(Manager only)</span>
            ) : null}
          </div>
        ) : null}

        <Link
          href="/crm/overview"
          className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
        >
          ← Overview
        </Link>
        <Link
          href="/crm/tasks"
          className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
        >
          Tasks →
        </Link>
        <button
          type="button"
          onClick={async () => {
            await refresh();
            await fetchSummary();
          }}
          className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={() => {
            setNewOpen(true);
            setNewStage("new");
            if (scope === "team" && reps.length === 0 && !repsLoading) {
              fetchReps();
            }
          }}
          className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-neutral-950 hover:opacity-90"
          title="Create opportunity"
        >
          + New
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded-md border border-neutral-800 bg-neutral-950 text-sm hover:bg-neutral-900"
          onClick={() => {
            resetQc();
            setQcOpen("contact");
          }}
        >
          + Contact
        </button>

        <button
          type="button"
          className="px-3 py-1.5 rounded-md border border-neutral-800 bg-neutral-950 text-sm hover:bg-neutral-900"
          onClick={() => {
            resetQc();
            setQcOpen("account");
          }}
        >
          + Account
        </button>
      </div>
    </div>
    {scope === "team" ? (
      <div className="mt-5 rounded-2xl border border-neutral-900 bg-neutral-950 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Manager snapshot</div>
            <div className="mt-1 text-sm text-neutral-200">
              {repId.trim()
                ? `Showing: ${reps.find((r) => r.id === repId)?.name ?? repId.slice(0, 8)}`
                : "Showing: all reps"}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-200">
              Open: <span className="ml-1 text-neutral-100">{summaryLoading ? "…" : safeStr(summary?.total_count ?? summary?.open_count ?? managerSummary.openCount)}</span>
            </span>
            <span className="inline-flex items-center rounded-full border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-200">
              Pipeline: <span className="ml-1 text-neutral-100">{summaryLoading ? "…" : (() => {
                const v = Number(summary?.total_amount ?? summary?.open_amount ?? managerSummary.openValue ?? 0);
                return v > 0 ? formatMoney(v, "GBP") : "—";
              })()}</span>
            </span>
            <span className="inline-flex items-center rounded-full border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-200">
              Won: <span className="ml-1 text-neutral-100">{summaryLoading ? "…" : safeStr(summary?.counts_by_stage?.won ?? summary?.won_count ?? managerSummary.wonCount)}</span>
            </span>
            <span className="inline-flex items-center rounded-full border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-200">
              Stuck &gt;7d: <span className="ml-1 text-neutral-100">{managerSummary.stuckCount}</span>
            </span>
            <span className="inline-flex items-center rounded-full border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-200">
              Closing 7d: <span className="ml-1 text-neutral-100">{managerSummary.closingSoon}</span>
            </span>
          </div>
        </div>

        {managerSummary.topStages.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="text-xs text-neutral-500">Top stages:</div>
            {managerSummary.topStages.map((s) => (
              <span
                key={s.key}
                className="inline-flex items-center rounded-full border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-300"
                title={s.key}
              >
                {s.key}: <span className="ml-1 text-neutral-100">{s.count}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    ) : null}

    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-neutral-900 bg-neutral-950 p-4">
        <div className="text-xs uppercase tracking-wide text-neutral-500">Total opportunities</div>
        <div className="mt-1 text-2xl font-semibold">{normalised.length}</div>
      </div>
      <div className="rounded-xl border border-neutral-900 bg-neutral-950 p-4">
        <div className="text-xs uppercase tracking-wide text-neutral-500">Total value</div>
        <div className="mt-1 text-2xl font-semibold">
          {totalValue > 0 ? formatMoney(totalValue, "GBP") : "—"}
        </div>
      </div>
      <div className="rounded-xl border border-neutral-900 bg-neutral-950 p-4">
        <div className="text-xs uppercase tracking-wide text-neutral-500">Search</div>
        <div className="mt-2 flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, account, contact, email…"
            className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-white/10"
          />
          <button
            type="button"
            onClick={() => setQuery("")}
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
          >
            Clear
          </button>
        </div>
        {showCreateCta ? (
          <div className="mt-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
            <div className="text-xs text-neutral-400">No results</div>
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-neutral-950 hover:opacity-90"
              onClick={() => {
                const email = query.trim();
                resetQc();
                setQcOpen("contact");
                if (isEmail(email)) setQcEmail(email);
              }}
            >
              Create contact: {query.trim()}
            </button>
          </div>
        ) : null}
      </div>
    </div>

    {error ? (
      <div className="mt-4 rounded-xl border border-red-900/40 bg-red-950/30 p-4">
        <div className="text-sm font-medium text-red-200">Pipeline error</div>
        <div className="mt-1 text-sm text-red-200/80 break-words">{error}</div>
        <div className="mt-3 text-xs text-neutral-400">
          Expected endpoints:
          <span className="ml-2 rounded border border-neutral-800 bg-neutral-950 px-2 py-0.5">
            GET /v1/crm/opportunities/pipeline
          </span>
          <span className="ml-2 rounded border border-neutral-800 bg-neutral-950 px-2 py-0.5">
            PATCH /v1/crm/opportunities/:id/stage
          </span>
        </div>
      </div>
    ) : null}

    <div className="mt-6 overflow-x-auto">
      <div className="min-w-[1100px]">
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, columns.length)}, 240px)` }}
        >
          {columns.map((col) => {
            const list = grouped[col.key] ?? [];

            return (
              <div
                key={col.key}
                className="rounded-2xl border border-neutral-900 bg-neutral-950/60"
                onDragOver={(e) => {
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  onDropToStage(col.key);
                }}
              >
                <div className="flex items-center justify-between border-b border-neutral-900 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium">{col.title}</div>
                    <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-xs text-neutral-300">
                      {list.length}
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-500">{safeStr(col.key)}</div>
                </div>

                <div className="p-3">
                  {list.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-neutral-800 bg-neutral-950 px-3 py-6 text-center text-xs text-neutral-600">
                      Drop here
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {list.map((opp) => {
                        const id = safeStr(opp.id);
                        const name = safeStr(opp.name ?? opp.title ?? "Untitled");
                        const acct = safeStr(opp.account_name ?? "").trim();
                        const cName = safeStr(opp.contact_name ?? "").trim();
                        const cEmail = safeStr(opp.contact_email ?? "").trim();
                        const amount =
                          typeof opp.amount === "number"
                            ? opp.amount
                            : typeof opp.value === "number"
                              ? opp.value
                              : null;

                        const closeDateIso = safeStr((opp as any).close_date ?? (opp as any).closeDate ?? "").trim();
                        const closeDateLabel = formatShortDate(closeDateIso);

                        const hasAcct = !!acct;
                        const hasContact = !!(cName || cEmail);

                        return (
                          <div
                            key={id}
                            draggable
                            onDragStart={() => {
                              dragOppIdRef.current = id;
                              dragFromStageRef.current = safeStr(opp.stage ?? col.key);
                            }}
                            onDoubleClick={() => openDrawer(id)}
                            className={clsx(
                              "rounded-xl border border-neutral-900 bg-neutral-950 p-3",
                              "hover:border-neutral-800 hover:bg-neutral-900/20",
                              "cursor-grab active:cursor-grabbing"
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-neutral-100 leading-snug line-clamp-1">
                                  {name}
                                </div>
                                {(hasAcct || hasContact) ? (
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {hasAcct ? (
                                      <span className="inline-flex max-w-full items-center rounded-full border border-neutral-800 bg-neutral-950 px-2 py-0.5 text-[11px] text-neutral-300">
                                        <span className="text-neutral-500 mr-1">Acct</span>
                                        <span className="truncate">{acct}</span>
                                      </span>
                                    ) : null}
                                    {hasContact ? (
                                      <span className="inline-flex max-w-full items-center rounded-full border border-neutral-800 bg-neutral-950 px-2 py-0.5 text-[11px] text-neutral-300">
                                        <span className="text-neutral-500 mr-1">Contact</span>
                                        <span className="truncate">{cName || cEmail}</span>
                                      </span>
                                    ) : null}
                                  </div>
                                ) : (
                                  <div className="mt-2 text-[11px] text-neutral-600">No links</div>
                                )}
                              </div>

                              <div className="shrink-0">
                                <div className="rounded-lg border border-neutral-900 bg-neutral-950 px-2 py-1 text-[11px] text-neutral-600">
                                  {safeStr(opp.stage ?? col.key)}
                                </div>
                              </div>
                            </div>

                            <div className="mt-3 flex items-center justify-between gap-2">
                              <div className="min-w-0 text-[11px] text-neutral-600">
                                {amount !== null && Number.isFinite(amount)
                                  ? formatMoney(amount, opp.currency)
                                  : "—"}
                              </div>
                              <div className="text-[11px] text-neutral-600">
                                {closeDateLabel ? `Close: ${closeDateLabel}` : "Close: none"}
                              </div>
                            </div>

                            <div className="mt-3 flex items-center justify-between">
                              <div className="text-[11px] text-neutral-700">{id.slice(0, 6)}</div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-[11px] text-neutral-200 hover:bg-neutral-900"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    openDrawer(id);
                                  }}
                                >
                                  View
                                </button>
                                <button
                                  type="button"
                                  className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-[11px] text-neutral-200 hover:bg-neutral-900"
                                  onClick={async () => {
                                    const idx = columns.findIndex((c) => c.key === col.key);
                                    const next = idx >= 0 ? columns[idx + 1]?.key : null;
                                    if (!next) return;
                                    const prevStage = safeStr(opp.stage ?? col.key);
                                    moveOptimistic(id, next);
                                    setToast("Moved ✓");
                                    try {
                                      await patchStage(id, next);
                                      await refresh();
                                      await fetchSummary();
                                    } catch (e: any) {
                                      moveOptimistic(id, prevStage);
                                      const msg = String(e?.message ?? "stage_update_failed");
                                      setToast(`Move failed: ${msg}`);
                                    }
                                  }}
                                  title="Move to next stage"
                                >
                                  Next
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>

    <div className="mt-8 rounded-2xl border border-neutral-900 bg-neutral-950 p-5">
      <div className="text-sm font-medium">Day 50 scope</div>
      <ul className="mt-2 space-y-1 text-sm text-neutral-400">
        <li>• Pipeline board (kanban) ✓</li>
        <li>• Quick-create opportunity ✓</li>
        <li>• Quick-create contact/account ✓</li>
      </ul>
    </div>
  </div>
  </div >
);
}