'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { WorkspaceTabs } from '@/components/shell/workspace-tabs';
import { useToast } from '@/components/Toast';
import { EmptyState } from '@/components/ui/empty-state';
import { EntitySearch, type EntityHit } from '@/components/ui/entity-search';
import {
  proxyFetch,
  escalateAccount,
  createAccountCoachingAction,
  listAccountEscalations,
  type AccountEscalation,
} from '@/lib/api';

/**
 * Day 281 — translate an account-action error into honest, actionable copy
 * without leaking raw database/provider errors. Known API error codes get a
 * human message; anything unrecognised (incl. 5xx that may carry a raw driver
 * message) collapses to a safe generic line.
 */
function friendlyActionError(err: unknown, kind: 'escalation' | 'coaching action'): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const code = raw.trim();
  if (/account_not_found/i.test(code)) return "This account isn't available to you.";
  if (/missing_company_context/i.test(code)) return 'Your profile isn’t linked to a company yet.';
  if (/invalid_account_id/i.test(code)) return 'This account link looks invalid.';
  if (/request_failed_401|unauthor/i.test(code)) return 'Your session expired — please sign in again.';
  if (/request_failed_403|forbidden/i.test(code)) return 'You don’t have access to this account.';
  if (/network_error|failed to fetch/i.test(code)) return 'Network problem — please try again.';
  // Unknown/5xx: never surface the raw message.
  return `Couldn’t create the ${kind}. Please try again.`;
}

/**
 * Day 289 — classify an account-detail LOAD failure into manager-safe copy.
 * Tenant isolation makes the API return `account_not_found` for BOTH unknown and
 * foreign-company IDs, so unknown and foreign render the identical state and we
 * never reveal whether a foreign account exists. Other failures keep honest,
 * retryable guidance — we do not collapse every error into a false 404. The raw
 * API code is never surfaced.
 */
function classifyAccountLoadError(error: string | null): {
  title: string;
  detail: string;
  showRetry: boolean;
} {
  const code = (error || '').trim();
  if (/account_not_found|invalid_account_id|not_found|request_failed_404|\b404\b/i.test(code)) {
    return {
      title: 'Account not found',
      detail: 'This account isn’t available. It may have been removed, or it doesn’t belong to your workspace.',
      showRetry: false,
    };
  }
  if (/request_failed_401|unauthor|\bsession\b/i.test(code)) {
    return {
      title: 'Session expired',
      detail: 'Your session expired. Please sign in again to view this account.',
      showRetry: false,
    };
  }
  if (/request_failed_403|forbidden/i.test(code)) {
    // Never confirm existence of an account the manager can't see.
    return {
      title: 'Account not found',
      detail: 'This account isn’t available to your workspace.',
      showRetry: false,
    };
  }
  return {
    title: 'Couldn’t load this account',
    detail: 'Something went wrong while loading this account. Please try again.',
    showRetry: true,
  };
}

/**
 * Day 289 — the account-detail "unavailable" surface. It renders ONLY a heading,
 * a plain message and a route back to Accounts — deliberately no tabs, KPIs,
 * ownership controls or actions, so a missing/foreign account can never expose an
 * empty-but-interactive shell.
 */
function AccountUnavailable({
  title,
  detail,
  showRetry,
  onRetry,
}: {
  title: string;
  detail: string;
  showRetry?: boolean;
  onRetry?: () => void;
}) {
  return (
    <div className="p-6">
      <Link
        href="/crm/accounts"
        className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
      >
        ← Accounts
      </Link>
      <div className="mx-auto mt-16 flex max-w-sm flex-col items-center justify-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900 text-xl">
          🔍
        </div>
        <h1 className="mt-4 text-lg font-semibold text-white">{title}</h1>
        <p className="mt-1.5 text-sm text-neutral-400">{detail}</p>
        <div className="mt-6 flex items-center gap-2">
          <Link
            href="/crm/accounts"
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800 transition-colors"
          >
            Back to Accounts
          </Link>
          {showRetry && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-200 hover:bg-indigo-500/20 transition-colors"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

type AccountTab = 'overview' | 'contacts' | 'calls' | 'rescue' | 'intelligence';

type LinkedContact = {
  id: string;
  name?: string | null;
  email?: string | null;
  company?: string | null;
  role?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type TimelineItem = {
  type: string;
  id: string;
  title?: string | null;
  description?: string | null;
  severity?: 'info' | 'warning' | 'critical' | string;
  occurred_at?: string | null;
  created_at?: string | null;
  metadata?: Record<string, any>;
};

type RepAccountPerformance = {
  rep_id: string;
  calls: number;
  avg_score: number;
  objection_risk: 'low' | 'medium' | 'high';
};

type AccountHealth = {
  health_score: number;
  risk_level: 'healthy' | 'watch' | 'at_risk';
  engagement_trend: 'improving' | 'stable' | 'declining';
  silence_detected: boolean;
  objection_risk: boolean;
  ai_summary: string;
  flags: string[];
  objection_trends: string[];
  weakest_rep_behaviour: string[];
  next_best_action: string;
  save_recommendations: string[];
  rep_performance: RepAccountPerformance[];
  weakest_rep_id: string | null;
  strongest_rep_id: string | null;
  manager_escalation_recommendations: string[];
};

type PersistedAccountSummary = {
  id?: string;
  summary?: string | null;
  health_status?: string | null;
  churn_risk?: number | null;
  next_best_action?: string | null;
  manager_notes?: string | null;
  generated_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type AccountTask = {
  id: string;
  account_id?: string;
  title?: string | null;
  description?: string | null;
  category?: string | null;
  urgency?: string | null;
  status?: string | null;
  assigned_to?: string | null;
  escalation_source?: string | null;
  due_at?: string | null;
  completed_at?: string | null;
  metadata?: Record<string, any> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type CoachingAction = {
  id: string;
  account_id?: string;
  action_type?: string | null;
  title?: string | null;
  description?: string | null;
  urgency?: string | null;
  status?: string | null;
  assigned_to?: string | null;
  linked_escalation_id?: string | null;
  linked_task_id?: string | null;
  replay_call_id?: string | null;
  sparring_scenario?: string | null;
  manager_notes?: string | null;
  due_at?: string | null;
  completed_at?: string | null;
  metadata?: Record<string, any> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function ScorePill({ score }: { score: number | null | undefined }) {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return <span className="text-xs opacity-60">—</span>;
  }
  const n = Math.round(score);
  const cls =
    n >= 80 ? 'bg-green-600/20 text-green-400'
      : n >= 60 ? 'bg-amber-600/20 text-amber-300'
        : 'bg-red-600/20 text-red-300';
  return <span className={`text-xs px-2 py-1 rounded ${cls}`}>{n}</span>;
}

function urgencyBorderClass(urgency?: string | null) {
  if (urgency === 'critical') return 'border-l-2 border-l-red-500';
  if (urgency === 'high') return 'border-l-2 border-l-amber-500';
  return 'border-l-2 border-l-neutral-700';
}

function UrgencyPill({ urgency }: { urgency?: string | null }) {
  const cls =
    urgency === 'critical' ? 'border-red-500/30 bg-red-500/10 text-red-300'
      : urgency === 'high' ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
        : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300';
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${cls}`}>
      {urgency || 'medium'}
    </span>
  );
}

export default function AccountPage() {
  const { id } = useParams() as { id: string };
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [contacts, setContacts] = useState<LinkedContact[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineSummary, setTimelineSummary] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [health, setHealth] = useState<AccountHealth | null>(null);
  const [ownerUpdating, setOwnerUpdating] = useState(false);
  const [ownerSelection, setOwnerSelection] = useState<EntityHit | null>(null);
  const [ownerExpanded, setOwnerExpanded] = useState(false);
  const [contactLinkLoading, setContactLinkLoading] = useState(false);
  const [contactLinkSelection, setContactLinkSelection] = useState<EntityHit | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summarySaving, setSummarySaving] = useState(false);
  const [persistedSummary, setPersistedSummary] = useState<PersistedAccountSummary | null>(null);
  const [summaryInput, setSummaryInput] = useState('');
  const [managerNotesInput, setManagerNotesInput] = useState('');
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskActionLoading, setTaskActionLoading] = useState(false);
  const [tasks, setTasks] = useState<AccountTask[]>([]);
  const [coachingActionsLoading, setCoachingActionsLoading] = useState(false);
  const [coachingActionLoading, setCoachingActionLoading] = useState(false);
  const [coachingActions, setCoachingActions] = useState<CoachingAction[]>([]);
  // Day 281 — manager account actions (escalate / coaching action)
  const [escalations, setEscalations] = useState<AccountEscalation[]>([]);
  const [escalationsLoading, setEscalationsLoading] = useState(false);
  const [actionModal, setActionModal] = useState<null | 'escalate' | 'coaching'>(null);
  const [actionSaving, setActionSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [escalateForm, setEscalateForm] = useState({
    severity: 'high',
    escalation_reason: '',
    intervention_required: true,
  });
  const [coachingForm, setCoachingForm] = useState({
    action_type: 'coaching',
    title: '',
    urgency: 'medium',
    description: '',
  });
  const [tab, setTab] = useState<AccountTab>('overview');
  const [rescueFilter, setRescueFilter] = useState<'all' | 'critical' | 'high' | 'medium'>('all');
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [addContactForm, setAddContactForm] = useState({ first_name: '', last_name: '', email: '', company: '', role: '' });
  const [addContactSaving, setAddContactSaving] = useState(false);

  async function handleAddContact(e: React.FormEvent) {
    e.preventDefault();
    if (!addContactForm.email.trim() && !addContactForm.first_name.trim()) {
      toast.error('Name or email is required.');
      return;
    }
    setAddContactSaving(true);
    try {
      const res = await proxyFetch('/v1/crm/contacts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          first_name: addContactForm.first_name.trim() || undefined,
          last_name: addContactForm.last_name.trim() || undefined,
          email: addContactForm.email.trim() || undefined,
          company: addContactForm.company.trim() || undefined,
          role: addContactForm.role.trim() || undefined,
          account_id: id,
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.ok === false) throw new Error(data?.error || 'Failed to create contact');
      const newContact: LinkedContact = data.contact ?? { id: data.id ?? String(Date.now()), name: [addContactForm.first_name, addContactForm.last_name].filter(Boolean).join(' ') || addContactForm.email, email: addContactForm.email || null };
      // Auto-link to this account if not already linked by backend
      if (newContact.id) {
        try {
          await proxyFetch(`/v1/crm/contacts/${encodeURIComponent(newContact.id)}/link-account`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ account_id: id }),
          });
        } catch { /* non-fatal — contact was created, link may have happened server-side */ }
      }
      setContacts((prev) => {
        const exists = prev.some((c) => c.id === newContact.id);
        return exists ? prev : [newContact, ...prev];
      });
      toast.success('Contact added.');
      setAddContactOpen(false);
      setAddContactForm({ first_name: '', last_name: '', email: '', company: '', role: '' });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add contact');
    } finally {
      setAddContactSaving(false);
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Day 281 — bootstrap through the authenticated proxy helper so the
        // Supabase session's identity (Bearer + x-user-id) reaches the proxy;
        // a raw fetch(credentials:'include') only sends cookies → missing_user.
        const r = await proxyFetch(`/v1/accounts/${id}`, { cache: 'no-store' });
        const j = await r.json();
        if (!alive) return;
        if (!j?.ok) throw new Error(j?.error || 'fetch_failed');

        // Day 288 — the persisted owner renders directly from account.owner
        // (KPI strip + ownership badge); the picker uses the separate
        // ownerSelection state. There is no owner-input state to seed here, so
        // the account payload is the single source of truth for the owner.
        setAccount(j.account || null);
        setStats(j.account?.stats || null);
        setRecent(Array.isArray(j.linked_calls) ? j.linked_calls : []);
        setContacts(Array.isArray(j.linked_contacts) ? j.linked_contacts : []);

        // Intelligence Timeline
        try {
          setTimelineLoading(true);
          const timelineRes = await proxyFetch(
            `/v1/accounts/${id}/intelligence-timeline`,
            { cache: 'no-store' }
          );
          const timelineJson = await timelineRes.json();
          if (timelineJson?.ok) {
            setTimeline(Array.isArray(timelineJson.timeline) ? timelineJson.timeline : []);
            setTimelineSummary(timelineJson.summary || null);
          }
        } catch (e) {
          console.error('timeline_load_failed', e);
        } finally {
          setTimelineLoading(false);
        }

        // AI Account Tasks
        try {
          setTasksLoading(true);
          const taskRes = await proxyFetch(
            `/v1/accounts/${id}/tasks`,
            { cache: 'no-store' }
          );
          const taskJson = await taskRes.json();
          if (taskJson?.ok) setTasks(Array.isArray(taskJson.tasks) ? taskJson.tasks : []);
        } catch (e) {
          console.error('task_load_failed', e);
        } finally {
          setTasksLoading(false);
        }

        // Coaching Actions
        try {
          setCoachingActionsLoading(true);
          const coachingRes = await proxyFetch(
            `/v1/accounts/${id}/coaching-actions`,
            { cache: 'no-store' }
          );
          const coachingJson = await coachingRes.json();
          if (coachingJson?.ok) {
            setCoachingActions(
              Array.isArray(coachingJson.coaching_actions) ? coachingJson.coaching_actions : []
            );
          }
        } catch (e) {
          console.error('coaching_actions_load_failed', e);
        } finally {
          setCoachingActionsLoading(false);
        }

        // Day 281 — Account escalations (company-scoped list, filtered to this
        // account). Proxy-only via lib/api helper; persists across reload.
        try {
          setEscalationsLoading(true);
          const rows = await listAccountEscalations(id);
          if (alive) setEscalations(rows);
        } catch (e) {
          console.error('escalations_load_failed', e);
        } finally {
          if (alive) setEscalationsLoading(false);
        }

        // Persistent AI Summary
        try {
          setSummaryLoading(true);
          const summaryRes = await proxyFetch(
            `/v1/accounts/${id}/summary`,
            { cache: 'no-store' }
          );
          const summaryJson = await summaryRes.json();
          if (summaryJson?.ok && summaryJson?.summary) {
            setPersistedSummary(summaryJson.summary);
            setSummaryInput(summaryJson.summary.summary || '');
            setManagerNotesInput(summaryJson.summary.manager_notes || '');
          }
        } catch (e) {
          console.error('summary_load_failed', e);
        } finally {
          setSummaryLoading(false);
        }

        // Account Health Engine
        const calls = Array.isArray(j.linked_calls) ? j.linked_calls : [];
        const avgScore = Number(j.account?.stats?.avg_score || 0);
        const latestCall = calls[0] || null;
        const latestCallDate = latestCall?.created_at
          ? new Date(latestCall.created_at).getTime()
          : null;
        const daysSinceActivity = latestCallDate
          ? Math.floor((Date.now() - latestCallDate) / (1000 * 60 * 60 * 24))
          : 999;
        const silenceDetected = daysSinceActivity > 14;
        const objectionRisk = avgScore < 60;
        const engagementTrend =
          avgScore >= 80 ? 'improving' : avgScore >= 60 ? 'stable' : 'declining';
        const healthScore = Math.max(
          0,
          Math.min(
            100,
            Math.round(avgScore * 0.7 + Math.max(0, 25 - daysSinceActivity) * 1.2)
          )
        );
        const flags: string[] = [];

        const repBuckets = new Map<string, { scores: number[]; calls: number }>();
        for (const call of calls) {
          const repId = String(call?.rep_id || 'unknown');
          if (!repBuckets.has(repId)) repBuckets.set(repId, { scores: [], calls: 0 });
          const bucket = repBuckets.get(repId)!;
          bucket.calls += 1;
          if (typeof call?.score === 'number') bucket.scores.push(Number(call.score));
        }

        const repPerformance: RepAccountPerformance[] = Array.from(repBuckets.entries()).map(
          ([repId, bucket]) => {
            const avg =
              bucket.scores.length > 0
                ? Math.round(bucket.scores.reduce((a, b) => a + b, 0) / bucket.scores.length)
                : 0;
            return {
              rep_id: repId,
              calls: bucket.calls,
              avg_score: avg,
              objection_risk: avg >= 80 ? 'low' : avg >= 60 ? 'medium' : 'high',
            };
          }
        );

        const sorted = [...repPerformance].sort((a, b) => a.avg_score - b.avg_score);
        const weakestRep = sorted.length > 0 ? sorted[0] : null;
        const strongestRep = sorted.length > 0 ? sorted[sorted.length - 1] : null;

        const objectionTrends: string[] = [];
        if (avgScore < 70) objectionTrends.push('Pricing resistance increasing');
        if (silenceDetected) objectionTrends.push('Customer engagement slowing');
        if (calls.length >= 3 && avgScore < 60) objectionTrends.push('Repeated weak call outcomes detected');

        const weakestRepBehaviour: string[] = [];
        if (avgScore < 65) weakestRepBehaviour.push('Weak objection handling');
        if (silenceDetected) weakestRepBehaviour.push('Poor follow-up consistency');
        if (avgScore < 55) weakestRepBehaviour.push('Low confidence during account conversations');

        if (silenceDetected) flags.push('No recent customer engagement detected');
        if (objectionRisk) flags.push('Low scoring calls detected across account');
        if (avgScore < 50) flags.push('Account relationship quality deteriorating');

        const riskLevel =
          healthScore >= 75 ? 'healthy' : healthScore >= 50 ? 'watch' : 'at_risk';

        const nextBestAction =
          riskLevel === 'healthy'
            ? 'Continue relationship momentum and identify upsell opportunities.'
            : riskLevel === 'watch'
              ? 'Schedule proactive follow-up call and reinforce value positioning.'
              : 'Urgent manager intervention recommended with focused objection recovery strategy.';

        const managerEscalationRecommendations: string[] = [];
        if (weakestRep && weakestRep.avg_score < 55) {
          managerEscalationRecommendations.push(
            `Rep ${weakestRep.rep_id} requires immediate coaching intervention on this account.`
          );
        }
        if (silenceDetected)
          managerEscalationRecommendations.push('Manager should manually re-engage customer relationship.');
        if (avgScore < 50)
          managerEscalationRecommendations.push('Escalate account to account recovery workflow.');

        const saveRecommendations: string[] = [];
        if (silenceDetected) saveRecommendations.push('Book customer re-engagement call within 48 hours');
        if (objectionRisk) saveRecommendations.push('Run objection-handling replay drills for assigned reps');
        if (avgScore < 50) saveRecommendations.push('Escalate account review to management');

        const aiSummary =
          riskLevel === 'healthy'
            ? 'Account engagement is healthy with stable sales conversations and positive interaction quality.'
            : riskLevel === 'watch'
              ? 'Some risk signals detected. Managers should monitor engagement levels and objection handling closely.'
              : 'High account risk detected. Falling engagement and weak call outcomes suggest immediate intervention may be required.';

        setHealth({
          health_score: healthScore,
          risk_level: riskLevel,
          engagement_trend: engagementTrend,
          silence_detected: silenceDetected,
          objection_risk: objectionRisk,
          ai_summary: aiSummary,
          flags,
          objection_trends: objectionTrends,
          weakest_rep_behaviour: weakestRepBehaviour,
          next_best_action: nextBestAction,
          save_recommendations: saveRecommendations,
          rep_performance: repPerformance,
          weakest_rep_id: weakestRep?.rep_id || null,
          strongest_rep_id: strongestRep?.rep_id || null,
          manager_escalation_recommendations: managerEscalationRecommendations,
        });
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || 'load_failed');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  // ── Actions ──

  async function assignOwner() {
    if (!ownerSelection) { toast.error('Select an owner first.'); return; }
    try {
      setOwnerUpdating(true);
      const r = await proxyFetch(`/v1/accounts/${id}/owner`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ owner_id: ownerSelection.id }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || 'assign_owner_failed');
      setAccount((prev: any) => ({
        ...(prev || {}),
        owner: j.account?.owner || null,
        owner_id: j.account?.owner_id || null,
        ownership_status: j.account?.ownership_status,
        coaching_ownership: j.account?.coaching_ownership,
      }));
      toast.success('Account owner assigned.');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to assign owner');
    } finally {
      setOwnerUpdating(false);
    }
  }

  async function unassignOwner() {
    try {
      setOwnerUpdating(true);
      const r = await proxyFetch(`/v1/accounts/${id}/owner`, {
        method: 'DELETE',
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || 'unassign_owner_failed');
      setAccount((prev: any) => ({
        ...(prev || {}),
        owner: null,
        owner_id: null,
        ownership_status: 'unassigned',
        coaching_ownership: j.account?.coaching_ownership,
      }));
      toast.success('Account owner removed.');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to unassign owner');
    } finally {
      setOwnerUpdating(false);
    }
  }

  async function linkContact() {
    if (!contactLinkSelection) { toast.error('Select a contact first.'); return; }
    try {
      setContactLinkLoading(true);
      const r = await proxyFetch(
        `/v1/crm/contacts/${encodeURIComponent(contactLinkSelection.id)}/link-account`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ account_id: id }),
        }
      );
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || 'link_contact_failed');
      const linked = j.contact || { id: contactLinkSelection.id, name: contactLinkSelection.label, email: contactLinkSelection.sublabel?.split(' · ')[0] ?? null };
      setContacts((prev) => {
        const exists = prev.some((c) => c.id === linked.id);
        return exists ? prev : [linked, ...prev];
      });
      setContactLinkSelection(null);
      toast.success('Contact linked to account.');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to link contact');
    } finally {
      setContactLinkLoading(false);
    }
  }

  async function unlinkContact(contactId: string) {
    try {
      setContactLinkLoading(true);
      const r = await proxyFetch(
        `/v1/crm/contacts/${contactId}/unlink-account`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ account_id: id }),
        }
      );
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || 'unlink_contact_failed');
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
      toast.success('Contact unlinked from account.');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to unlink contact');
    } finally {
      setContactLinkLoading(false);
    }
  }

  async function saveAccountSummary() {
    try {
      setSummarySaving(true);
      const payload = {
        summary: summaryInput,
        manager_notes: managerNotesInput,
        health_status: health?.risk_level || 'stable',
        churn_risk: health?.health_score ? Math.max(0, 100 - health.health_score) : 0,
        next_best_action: health?.next_best_action || '',
      };
      const r = await proxyFetch(`/v1/accounts/${id}/summary`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || 'summary_save_failed');
      setPersistedSummary(j.summary || null);
      toast.success('AI account summary saved.');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save account summary');
    } finally {
      setSummarySaving(false);
    }
  }

  async function generateAiTasks() {
    try {
      setTaskActionLoading(true);
      const r = await proxyFetch(`/v1/accounts/${id}/tasks/generate`, {
        method: 'POST',
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || 'task_generation_failed');
      const generated = Array.isArray(j.generated_tasks) ? j.generated_tasks : [];
      if (generated.length > 0) setTasks((prev) => [...generated, ...prev]);
      toast.success(generated.length > 0 ? `Generated ${generated.length} AI task${generated.length !== 1 ? 's' : ''}.` : 'No new AI tasks required.');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to generate AI tasks');
    } finally {
      setTaskActionLoading(false);
    }
  }

  async function completeTask(taskId: string) {
    try {
      setTaskActionLoading(true);
      const r = await proxyFetch(`/v1/accounts/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || 'task_complete_failed');
      setTasks((prev) =>
        prev.map((task) => (task.id === taskId ? { ...task, ...(j.task || {}) } : task))
      );
    } catch (e: any) {
      toast.error(e?.message || 'Failed to complete task');
    } finally {
      setTaskActionLoading(false);
    }
  }

  async function createReplayAssignment() {
    try {
      setCoachingActionLoading(true);
      const latestCall = recent?.[0];
      const r = await proxyFetch(`/v1/accounts/${id}/coaching-action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action_type: 'replay_assignment',
          title: 'Replay coaching assignment',
          description: 'Review latest account conversations and identify objection handling weaknesses.',
          urgency: health?.risk_level === 'at_risk' ? 'high' : 'medium',
          replay_call_id: latestCall?.id || null,
          manager_notes: 'AI-generated replay coaching intervention.',
        }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || 'replay_assignment_failed');
      if (j.coaching_action) setCoachingActions((prev) => [j.coaching_action, ...prev]);
      toast.success('Replay coaching assignment created.');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create replay assignment');
    } finally {
      setCoachingActionLoading(false);
    }
  }

  async function createSparringAssignment() {
    try {
      setCoachingActionLoading(true);
      const r = await proxyFetch(`/v1/accounts/${id}/coaching-action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action_type: 'sparring_drill',
          title: 'AI sparring drill assignment',
          description: 'Run targeted objection-handling sparring drills for this account.',
          urgency: health?.risk_level === 'at_risk' ? 'high' : 'medium',
          sparring_scenario: health?.objection_risk ? 'price_objection' : 'relationship_building',
          manager_notes: 'AI-generated sparring intervention workflow.',
        }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || 'sparring_assignment_failed');
      if (j.coaching_action) setCoachingActions((prev) => [j.coaching_action, ...prev]);
      toast.success('Sparring drill assignment created.');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create sparring assignment');
    } finally {
      setCoachingActionLoading(false);
    }
  }

  // ── Day 281: manager account actions ──

  function openActionModal(mode: 'escalate' | 'coaching') {
    setActionError(null);
    setActionModal(mode);
  }

  function closeActionModal() {
    if (actionSaving) return; // don't dismiss mid-save
    setActionModal(null);
    setActionError(null);
  }

  async function submitEscalation(e: React.FormEvent) {
    e.preventDefault();
    if (actionSaving) return;
    setActionSaving(true);
    setActionError(null);
    try {
      const escalation = await escalateAccount(id, {
        severity: escalateForm.severity,
        escalation_reason: escalateForm.escalation_reason.trim() || undefined,
        intervention_required: escalateForm.intervention_required,
      });
      if (escalation) setEscalations((prev) => [escalation, ...prev]);
      toast.success('Account escalated.');
      setActionModal(null);
      setEscalateForm({ severity: 'high', escalation_reason: '', intervention_required: true });
    } catch (err) {
      setActionError(friendlyActionError(err, 'escalation'));
    } finally {
      setActionSaving(false);
    }
  }

  async function submitCoachingAction(e: React.FormEvent) {
    e.preventDefault();
    if (actionSaving) return;
    setActionSaving(true);
    setActionError(null);
    try {
      const action = await createAccountCoachingAction(id, {
        action_type: coachingForm.action_type.trim() || 'coaching',
        title: coachingForm.title.trim() || 'Coaching action',
        urgency: coachingForm.urgency,
        description: coachingForm.description.trim() || undefined,
      });
      if (action) setCoachingActions((prev) => [action, ...prev]);
      toast.success('Coaching action created.');
      setActionModal(null);
      setCoachingForm({ action_type: 'coaching', title: '', urgency: 'medium', description: '' });
    } catch (err) {
      setActionError(friendlyActionError(err, 'coaching action'));
    } finally {
      setActionSaving(false);
    }
  }

  function completeCoachingAction(actionId: string) {
    setCoachingActions((prev) =>
      prev.map((action) =>
        action.id === actionId
          ? { ...action, status: 'completed', completed_at: new Date().toISOString() }
          : action
      )
    );
  }

  const accountName = account?.name || account?.domain || 'Account';
  const activeTasks = tasks.filter((t) => t.status !== 'completed').length;
  const filteredTasks =
    rescueFilter === 'all' ? tasks : tasks.filter((t) => t.urgency === rescueFilter);

  // Day 289 — account-detail state machine. The workspace shell below (tabs,
  // KPIs, ownership, actions) may only render once the account payload has
  // loaded. Until then we render a plain loading state; if the load failed and
  // left no account (e.g. account_not_found for an unknown OR foreign-company
  // ID), we render a manager-safe unavailable state instead of the raw error
  // code beside an empty-but-interactive shell.
  if (!account) {
    if (loading) {
      return (
        <div className="p-6">
          <Link
            href="/crm/accounts"
            className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            ← Accounts
          </Link>
          <div className="mt-16 text-center text-sm text-neutral-500">Loading account…</div>
        </div>
      );
    }
    const copy = classifyAccountLoadError(error);
    return (
      <AccountUnavailable
        title={copy.title}
        detail={copy.detail}
        showRetry={copy.showRetry}
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <Link
            href="/crm/accounts"
            className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            ← Accounts
          </Link>
          <h1 className="mt-0.5 text-xl font-semibold text-white">{accountName}</h1>
          {account?.domain && (
            <p className="mt-0.5 text-xs text-neutral-500">{account.domain}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {loading && <span className="text-xs text-neutral-500">Loading…</span>}
          {error && <span className="text-xs text-red-400">{error}</span>}
          {!loading && !error && account && (
            <>
              <button
                type="button"
                onClick={() => openActionModal('escalate')}
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-500/20 transition-colors"
              >
                Escalate
              </button>
              <button
                type="button"
                onClick={() => openActionModal('coaching')}
                className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-medium text-indigo-200 hover:bg-indigo-500/20 transition-colors"
              >
                Coaching Action
              </button>
            </>
          )}
          {health && (
            <span
              className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
                health.risk_level === 'healthy'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : health.risk_level === 'watch'
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                    : 'border-red-500/30 bg-red-500/10 text-red-300'
              }`}
            >
              {health.risk_level === 'healthy'
                ? 'Healthy'
                : health.risk_level === 'watch'
                  ? 'Watch'
                  : 'At Risk'}{' '}
              · {health.health_score}/100
            </span>
          )}
        </div>
      </div>

      <WorkspaceTabs
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'contacts', label: 'Contacts', badge: contacts.length },
          { id: 'calls', label: 'Calls', badge: recent.length || undefined },
          { id: 'rescue', label: 'Rescue', badge: activeTasks || undefined },
          { id: 'intelligence', label: 'Intelligence' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {/* Health signal card */}
          {health && (
            <div
              className={`rounded-xl border px-5 py-4 ${
                health.risk_level === 'healthy'
                  ? 'border-emerald-500/20 bg-emerald-500/5'
                  : health.risk_level === 'watch'
                    ? 'border-amber-500/20 bg-amber-500/5'
                    : 'border-red-500/20 bg-red-500/5'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-neutral-500">
                    Account Health
                  </div>
                  <div className="mt-1 flex items-baseline gap-3">
                    <span
                      className={`text-3xl font-semibold ${
                        health.risk_level === 'healthy'
                          ? 'text-emerald-300'
                          : health.risk_level === 'watch'
                            ? 'text-amber-300'
                            : 'text-red-300'
                      }`}
                    >
                      {health.health_score}
                    </span>
                    <span className="text-sm text-neutral-500">/100</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border capitalize ${
                        health.risk_level === 'healthy'
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                          : health.risk_level === 'watch'
                            ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                            : 'border-red-500/30 bg-red-500/10 text-red-300'
                      }`}
                    >
                      {health.risk_level === 'at_risk' ? 'At Risk' : health.risk_level}
                    </span>
                    <span className="text-xs text-neutral-500 capitalize">
                      {health.engagement_trend}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-neutral-400 max-w-2xl">{health.ai_summary}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span
                    className={`px-2.5 py-1 rounded-lg border ${
                      health.silence_detected
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                        : 'border-neutral-800 text-neutral-500'
                    }`}
                  >
                    {health.silence_detected ? 'Silence detected' : 'Active engagement'}
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded-lg border ${
                      health.objection_risk
                        ? 'border-red-500/30 bg-red-500/10 text-red-300'
                        : 'border-neutral-800 text-neutral-500'
                    }`}
                  >
                    {health.objection_risk ? 'Objection risk' : 'Low objection risk'}
                  </span>
                </div>
              </div>

              {health.flags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {health.flags.map((flag, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-red-500/20 bg-red-500/5 px-2.5 py-1 text-xs text-red-200"
                    >
                      ⚠ {flag}
                    </div>
                  ))}
                </div>
              )}

              {health.next_best_action && (
                <div className="mt-3 rounded-lg border border-neutral-800 bg-black/20 px-3 py-2 text-xs text-neutral-300">
                  <span className="text-neutral-500 mr-2">Next action:</span>
                  {health.next_best_action}
                </div>
              )}
            </div>
          )}

          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Contacts</div>
              <div className="mt-1.5 text-2xl font-semibold text-white">{stats?.contacts || 0}</div>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Calls</div>
              <div className="mt-1.5 text-2xl font-semibold text-white">{stats?.calls || 0}</div>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Avg Score</div>
              <div
                className={`mt-1.5 text-2xl font-semibold ${
                  (stats?.avg_score || 0) >= 75
                    ? 'text-emerald-300'
                    : (stats?.avg_score || 0) >= 60
                      ? 'text-amber-300'
                      : 'text-red-300'
                }`}
              >
                {typeof stats?.avg_score === 'number' ? Math.round(stats.avg_score) : '—'}
              </div>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Owner</div>
              <div className="mt-1.5 text-sm font-medium text-white truncate">
                {account?.owner?.full_name || account?.owner?.email || 'Unassigned'}
              </div>
              <div
                className={`mt-0.5 text-[10px] ${
                  account?.ownership_status === 'assigned' ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {account?.ownership_status === 'assigned' ? 'Assigned' : 'Unassigned'}
              </div>
            </div>
          </div>

          {/* Signal indicators */}
          {health && (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">
                  Engagement Trend
                </div>
                <div className="mt-1.5 text-lg font-semibold text-white capitalize">
                  {health.engagement_trend}
                </div>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">
                  Silence Detection
                </div>
                <div
                  className={`mt-1.5 text-lg font-semibold ${
                    health.silence_detected ? 'text-amber-300' : 'text-white'
                  }`}
                >
                  {health.silence_detected ? 'Detected' : 'Active'}
                </div>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">
                  Objection Risk
                </div>
                <div
                  className={`mt-1.5 text-lg font-semibold ${
                    health.objection_risk ? 'text-red-300' : 'text-white'
                  }`}
                >
                  {health.objection_risk ? 'Elevated' : 'Controlled'}
                </div>
              </div>
            </div>
          )}

          {/* Objection trends + rep behaviour */}
          {health &&
            (health.objection_trends.length > 0 || health.weakest_rep_behaviour.length > 0) && (
              <div className="grid gap-4 md:grid-cols-2">
                {health.objection_trends.length > 0 && (
                  <div className="rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden">
                    <div className="border-b border-neutral-800 px-4 py-2.5 text-sm font-medium text-white">
                      AI Objection Trends
                    </div>
                    <div className="space-y-1.5 px-4 py-3">
                      {health.objection_trends.map((trend, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200"
                        >
                          ⚡ {trend}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {health.weakest_rep_behaviour.length > 0 && (
                  <div className="rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden">
                    <div className="border-b border-neutral-800 px-4 py-2.5 text-sm font-medium text-white">
                      Weakest Rep Behaviour
                    </div>
                    <div className="space-y-1.5 px-4 py-3">
                      {health.weakest_rep_behaviour.map((item, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-200"
                        >
                          ↓ {item}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

          {/* Manager escalation */}
          {health && health.manager_escalation_recommendations.length > 0 && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 overflow-hidden">
              <div className="border-b border-red-500/10 px-4 py-2.5 text-sm font-medium text-red-200">
                Manager Escalation Required
              </div>
              <div className="space-y-1.5 px-4 py-3">
                {health.manager_escalation_recommendations.map((item, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-100"
                  >
                    🚨 {item}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Save recommendations */}
          {health && health.save_recommendations.length > 0 && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 overflow-hidden">
              <div className="border-b border-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-200">
                Account Save Recommendations
              </div>
              <div className="space-y-1.5 px-4 py-3">
                {health.save_recommendations.map((rec, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-100"
                  >
                    ✓ {rec}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rep performance table */}
          {health && health.rep_performance.length > 0 && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden">
              <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2.5">
                <div className="text-sm font-medium text-white">Account Rep Intelligence</div>
                <div className="text-xs text-neutral-500">AI analysis</div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-800 text-sm">
                  <thead className="bg-black/30 text-xs uppercase tracking-[0.12em] text-neutral-500">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Rep</th>
                      <th className="px-4 py-2.5 text-left">Calls</th>
                      <th className="px-4 py-2.5 text-left">Avg Score</th>
                      <th className="px-4 py-2.5 text-left">Objection Risk</th>
                      <th className="px-4 py-2.5 text-left">Assessment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {health.rep_performance.map((rep) => (
                      <tr key={rep.rep_id} className="hover:bg-neutral-900/40">
                        <td className="px-4 py-2.5 text-white">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/crm/reps/${rep.rep_id}`}
                              className="hover:underline text-neutral-200 text-xs"
                            >
                              {rep.rep_id.slice(0, 8)}…
                            </Link>
                            {health.strongest_rep_id === rep.rep_id && (
                              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">
                                Best
                              </span>
                            )}
                            {health.weakest_rep_id === rep.rep_id && (
                              <span className="rounded-full border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-300">
                                Weakest
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-neutral-300">{rep.calls}</td>
                        <td className="px-4 py-2.5">
                          <ScorePill score={rep.avg_score} />
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] uppercase border ${
                              rep.objection_risk === 'low'
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                : rep.objection_risk === 'medium'
                                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                                  : 'border-red-500/30 bg-red-500/10 text-red-300'
                            }`}
                          >
                            {rep.objection_risk}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-neutral-400">
                          {rep.avg_score >= 80
                            ? 'Strong account handling'
                            : rep.avg_score >= 60
                              ? 'Moderate objection risk'
                              : 'High coaching risk'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Ownership — collapsible */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden">
            <button
              type="button"
              onClick={() => setOwnerExpanded((e) => !e)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-white hover:bg-neutral-900/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span>Account Ownership</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full border ${
                    account?.ownership_status === 'assigned'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  }`}
                >
                  {account?.ownership_status === 'assigned'
                    ? account?.owner?.full_name || account?.owner?.email || 'Assigned'
                    : 'Unassigned'}
                </span>
                {account?.coaching_ownership?.escalation_route && (
                  <span className="text-xs text-neutral-500">
                    · {account.coaching_ownership.escalation_route}
                  </span>
                )}
              </div>
              <span className="text-neutral-500 text-xs">{ownerExpanded ? '↑' : '↓'}</span>
            </button>
            {ownerExpanded && (
              <div className="border-t border-neutral-800 px-4 py-4 space-y-3">
                {account?.coaching_ownership?.manager_rescue_workflow && (
                  <p className="text-xs text-neutral-400">
                    {account.coaching_ownership.manager_rescue_workflow}
                  </p>
                )}
                <div className="flex flex-col md:flex-row gap-2">
                  <EntitySearch
                    type="rep"
                    value={ownerSelection}
                    onChange={setOwnerSelection}
                    className="flex-1"
                    disabled={ownerUpdating}
                  />
                  <button
                    type="button"
                    disabled={ownerUpdating || !ownerSelection}
                    onClick={assignOwner}
                    className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-60"
                  >
                    {ownerUpdating ? 'Saving…' : 'Assign Owner'}
                  </button>
                  {account?.owner_id && (
                    <button
                      type="button"
                      disabled={ownerUpdating}
                      onClick={unassignOwner}
                      className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200 hover:bg-red-500/20 disabled:opacity-60"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CONTACTS ── */}
      {tab === 'contacts' && (
        <div className="space-y-3">
          {/* Action bar */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAddContactOpen(true)}
              className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/20 transition-colors"
            >
              + Add Contact
            </button>
            <div className="flex flex-1 items-center gap-2">
              <EntitySearch
                type="contact"
                value={contactLinkSelection}
                onChange={setContactLinkSelection}
                placeholder="Or link existing contact…"
                className="flex-1"
                disabled={contactLinkLoading}
              />
              <button
                type="button"
                disabled={contactLinkLoading || !contactLinkSelection}
                onClick={linkContact}
                className="rounded-md border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-40 transition-colors shrink-0"
              >
                {contactLinkLoading ? 'Linking…' : 'Link'}
              </button>
            </div>
          </div>

          {/* Contact list */}
          <div className="rounded-xl border border-neutral-800 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-neutral-800 flex items-center justify-between">
              <span className="text-sm font-medium text-white">
                Contacts
                {contacts.length > 0 && (
                  <span className="ml-2 rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] text-neutral-400 tabular-nums">{contacts.length}</span>
                )}
              </span>
            </div>
            <div className="divide-y divide-neutral-800">
              {contacts.length > 0 ? (
                contacts.map((contact) => (
                  <Link
                    key={contact.id}
                    href={`/crm/contacts/${contact.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-neutral-900/60 transition-colors"
                  >
                    <div>
                      <div className="text-sm text-white font-medium">
                        {contact.name || [contact.email].filter(Boolean).join(' ') || 'Contact'}
                      </div>
                      <div className="mt-0.5 text-xs text-neutral-500">
                        {[contact.role, contact.email].filter(Boolean).join(' · ') || 'No details'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); unlinkContact(contact.id); }}
                        className="rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1 text-[10px] text-neutral-400 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                      >
                        Unlink
                      </button>
                      <span className="text-xs text-neutral-400">Open →</span>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="px-4 py-6">
                  <EmptyState
                    message="No contacts yet"
                    sub="Add your first contact to start building account relationships."
                    action={{ label: '+ Add Contact', onClick: () => setAddContactOpen(true) }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Add Contact Modal */}
          {addContactOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setAddContactOpen(false)}
              />
              <div className="relative w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-950 shadow-2xl">
                <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
                  <div>
                    <h2 className="text-sm font-semibold text-white">Add Contact</h2>
                    <p className="text-xs text-neutral-500 mt-0.5">Creates and links a new contact to this account.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAddContactOpen(false)}
                    className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
                  >
                    ✕
                  </button>
                </div>
                <form onSubmit={handleAddContact} className="px-5 py-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-1">First Name</label>
                      <input
                        type="text"
                        value={addContactForm.first_name}
                        onChange={(e) => setAddContactForm((p) => ({ ...p, first_name: e.target.value }))}
                        placeholder="Jane"
                        className="w-full rounded-lg border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50 placeholder:text-neutral-600"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-1">Last Name</label>
                      <input
                        type="text"
                        value={addContactForm.last_name}
                        onChange={(e) => setAddContactForm((p) => ({ ...p, last_name: e.target.value }))}
                        placeholder="Smith"
                        className="w-full rounded-lg border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50 placeholder:text-neutral-600"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-1">Email</label>
                    <input
                      type="email"
                      value={addContactForm.email}
                      onChange={(e) => setAddContactForm((p) => ({ ...p, email: e.target.value }))}
                      placeholder="jane@company.com"
                      className="w-full rounded-lg border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50 placeholder:text-neutral-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-1">Role <span className="text-neutral-600">(optional)</span></label>
                    <input
                      type="text"
                      value={addContactForm.role}
                      onChange={(e) => setAddContactForm((p) => ({ ...p, role: e.target.value }))}
                      placeholder="VP Sales"
                      className="w-full rounded-lg border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50 placeholder:text-neutral-600"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setAddContactOpen(false)}
                      className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={addContactSaving || (!addContactForm.first_name.trim() && !addContactForm.email.trim())}
                      className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {addContactSaving ? 'Adding…' : 'Add Contact'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CALLS ── */}
      {tab === 'calls' && (
        <div className="rounded-xl border border-neutral-800 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-neutral-800 text-sm font-medium text-white">
            Recent Calls · {recent.length}
          </div>
          <div className="divide-y divide-neutral-800">
            {recent.length > 0 ? (
              recent.map((c) => (
                <div key={c.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/calls/${c.id}`}
                      className="text-sm hover:underline truncate block text-white"
                    >
                      {c.filename || c.id}
                    </Link>
                    <div className="text-xs text-neutral-500">
                      {new Date(c.created_at).toLocaleString()}
                    </div>
                  </div>
                  <ScorePill score={c.overall_score ?? c.score_overall} />
                </div>
              ))
            ) : (
              <div className="px-4 py-4 text-sm text-neutral-400">No recent calls.</div>
            )}
          </div>
        </div>
      )}

      {/* ── RESCUE ── */}
      {tab === 'rescue' && (
        <div className="space-y-4">
          {/* AI Task Centre */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-amber-500/10">
              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-amber-300">
                  AI Task Centre
                </div>
                <div className="mt-1 text-base font-semibold text-white">
                  Operational Rescue Workflows
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-neutral-500">
                  {activeTasks} active · {tasks.filter((t) => t.status === 'completed').length} done
                </span>
                <button
                  type="button"
                  disabled={taskActionLoading}
                  onClick={generateAiTasks}
                  className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/20 disabled:opacity-60"
                >
                  {taskActionLoading ? 'Generating…' : 'Generate Tasks'}
                </button>
              </div>
            </div>

            {/* Urgency filter */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-amber-500/10">
              {(['all', 'critical', 'high', 'medium'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setRescueFilter(f)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    rescueFilter === f
                      ? f === 'critical'
                        ? 'border-red-400 bg-red-500/20 text-red-200'
                        : f === 'high'
                          ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                          : f === 'medium'
                            ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                            : 'border-indigo-500/40 bg-indigo-500/15 font-medium text-indigo-200'
                      : 'border-neutral-700 text-neutral-400 hover:bg-neutral-800'
                  }`}
                >
                  {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            <div className="divide-y divide-neutral-800/50">
              {tasksLoading ? (
                <div className="px-5 py-4 text-sm text-neutral-400">Loading tasks…</div>
              ) : filteredTasks.length > 0 ? (
                filteredTasks.map((task) => (
                  <div key={task.id} className={`px-5 py-4 ${urgencyBorderClass(task.urgency)}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-white">
                            {task.title || 'Untitled task'}
                          </span>
                          <UrgencyPill urgency={task.urgency} />
                          <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-neutral-300">
                            {task.status || 'open'}
                          </span>
                        </div>
                        {task.description && (
                          <p className="mt-1.5 text-sm text-neutral-400 leading-relaxed">
                            {task.description}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {task.category && (
                            <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-300">
                              {task.category}
                            </span>
                          )}
                          {task.escalation_source && (
                            <span className="rounded-full border border-red-500/20 bg-red-500/5 px-2 py-0.5 text-[10px] text-red-300">
                              {task.escalation_source}
                            </span>
                          )}
                          {task.due_at && (
                            <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-300">
                              Due {new Date(task.due_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      {task.status !== 'completed' ? (
                        <button
                          type="button"
                          disabled={taskActionLoading}
                          onClick={() => completeTask(task.id)}
                          className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-60 shrink-0 transition-colors"
                        >
                          Complete
                        </button>
                      ) : (
                        <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300 shrink-0">
                          Done
                        </span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-5 py-4 text-sm text-neutral-400">
                  No tasks{rescueFilter !== 'all' ? ` with ${rescueFilter} urgency` : ''}.
                </div>
              )}
            </div>
          </div>

          {/* Day 281 — Escalations (persisted; company-scoped) */}
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-red-500/10">
              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-red-300">
                  Risk Workflow
                </div>
                <div className="mt-1 text-base font-semibold text-white">Account Escalations</div>
              </div>
              <button
                type="button"
                onClick={() => openActionModal('escalate')}
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-200 hover:bg-red-500/20 transition-colors"
              >
                Escalate Account
              </button>
            </div>
            <div className="divide-y divide-neutral-800/50">
              {escalationsLoading ? (
                <div className="px-5 py-4 text-sm text-neutral-400">Loading escalations…</div>
              ) : escalations.length > 0 ? (
                escalations.map((esc) => (
                  <div
                    key={esc.id}
                    className={`px-5 py-4 ${urgencyBorderClass(esc.severity === 'critical' ? 'critical' : esc.severity === 'high' ? 'high' : undefined)}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-white">
                        {esc.escalation_reason || 'Account escalation'}
                      </span>
                      <UrgencyPill urgency={esc.severity} />
                      <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-neutral-300">
                        {esc.status || 'open'}
                      </span>
                      {esc.intervention_required && (
                        <span className="rounded-full border border-red-500/20 bg-red-500/5 px-2 py-0.5 text-[10px] text-red-300">
                          Intervention required
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
                      {esc.workflow_stage && (
                        <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-neutral-300">
                          {esc.workflow_stage}
                        </span>
                      )}
                      {esc.created_at && (
                        <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-neutral-300">
                          {new Date(esc.created_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-5 py-4 text-sm text-neutral-400">
                  No escalations raised for this account.
                </div>
              )}
            </div>
          </div>

          {/* Coaching Actions */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-emerald-500/10">
              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-emerald-300">
                  Coaching Interventions
                </div>
                <div className="mt-1 text-base font-semibold text-white">AI Coaching Actions</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openActionModal('coaching')}
                  className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-200 hover:bg-indigo-500/20 transition-colors"
                >
                  New Action
                </button>
                <button
                  type="button"
                  disabled={coachingActionLoading}
                  onClick={createReplayAssignment}
                  className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-60 transition-colors"
                >
                  Assign Replay
                </button>
                <button
                  type="button"
                  disabled={coachingActionLoading}
                  onClick={createSparringAssignment}
                  className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-60 transition-colors"
                >
                  Assign Sparring
                </button>
              </div>
            </div>

            <div className="divide-y divide-neutral-800/50">
              {coachingActionsLoading ? (
                <div className="px-5 py-4 text-sm text-neutral-400">Loading interventions…</div>
              ) : coachingActions.length > 0 ? (
                coachingActions.map((action) => (
                  <div
                    key={action.id}
                    className={`px-5 py-4 ${urgencyBorderClass(action.urgency)}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-white">
                            {action.title || 'Coaching action'}
                          </span>
                          <UrgencyPill urgency={action.urgency} />
                          <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-300">
                            {action.action_type || 'coaching'}
                          </span>
                          {action.status === 'completed' && (
                            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">
                              done
                            </span>
                          )}
                        </div>
                        {action.description && (
                          <p className="mt-1.5 text-sm text-neutral-400 leading-relaxed">
                            {action.description}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {action.sparring_scenario && (
                            <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-300">
                              Scenario: {action.sparring_scenario}
                            </span>
                          )}
                          {action.replay_call_id && (
                            <span className="rounded-full border border-cyan-500/20 bg-cyan-500/5 px-2 py-0.5 text-[10px] text-cyan-300">
                              Replay linked
                            </span>
                          )}
                          {action.due_at && (
                            <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-300">
                              Due {new Date(action.due_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        {action.manager_notes && (
                          <div className="mt-2 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-400">
                            {action.manager_notes}
                          </div>
                        )}
                      </div>
                      {action.status !== 'completed' && (
                        <button
                          type="button"
                          onClick={() => completeCoachingAction(action.id)}
                          className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800 shrink-0 transition-colors"
                        >
                          Complete
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-5 py-4 text-sm text-neutral-400">
                  No coaching interventions yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── INTELLIGENCE ── */}
      {tab === 'intelligence' && (
        <div className="space-y-4">
          {/* AI Memory */}
          <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-indigo-500/10">
              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-indigo-300">
                  AI CRM Memory
                </div>
                <div className="mt-1 text-base font-semibold text-white">
                  Persistent Account Intelligence
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-neutral-500">
                  {summaryLoading
                    ? 'Loading…'
                    : persistedSummary?.updated_at
                      ? `Updated ${new Date(persistedSummary.updated_at).toLocaleString()}`
                      : 'No saved memory'}
                </span>
                <button
                  type="button"
                  disabled={summarySaving}
                  onClick={saveAccountSummary}
                  className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-60"
                >
                  {summarySaving ? 'Saving…' : 'Save Memory'}
                </button>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 p-5">
              <div>
                <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500 mb-2">
                  AI Account Summary
                </div>
                <textarea
                  value={summaryInput}
                  onChange={(e) => setSummaryInput(e.target.value)}
                  rows={8}
                  placeholder="Persist long-term AI account intelligence here…"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm text-white outline-none resize-none"
                />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500 mb-2">
                  Manager Notes
                </div>
                <textarea
                  value={managerNotesInput}
                  onChange={(e) => setManagerNotesInput(e.target.value)}
                  rows={8}
                  placeholder="Manager observations, escalation notes, recovery plans…"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm text-white outline-none resize-none"
                />
              </div>
            </div>
          </div>

          {/* Intelligence Timeline */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-neutral-800">
              <div>
                <div className="text-sm font-medium text-white">Intelligence Timeline</div>
                <div className="mt-0.5 text-xs text-neutral-500">
                  Account memory, coaching, escalation and operational history
                </div>
              </div>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em]">
                <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-300">
                  {timelineSummary?.total_events || 0} events
                </span>
                {(timelineSummary?.critical_events || 0) > 0 && (
                  <span className="rounded-full border border-red-500/20 bg-red-500/5 px-2 py-1 text-red-300">
                    {timelineSummary.critical_events} critical
                  </span>
                )}
                {(timelineSummary?.warning_events || 0) > 0 && (
                  <span className="rounded-full border border-amber-500/20 bg-amber-500/5 px-2 py-1 text-amber-300">
                    {timelineSummary.warning_events} warnings
                  </span>
                )}
              </div>
            </div>
            <div className="divide-y divide-neutral-800">
              {timelineLoading ? (
                <div className="px-5 py-5 text-sm text-neutral-400">Loading timeline…</div>
              ) : timeline.length > 0 ? (
                timeline.map((item) => {
                  const sc =
                    item.severity === 'critical'
                      ? 'border-red-500/20 bg-red-500/5 text-red-300'
                      : item.severity === 'warning'
                        ? 'border-amber-500/20 bg-amber-500/5 text-amber-300'
                        : 'border-cyan-500/20 bg-cyan-500/5 text-cyan-300';
                  const dotCls =
                    item.severity === 'critical'
                      ? 'border-red-500 bg-red-500'
                      : item.severity === 'warning'
                        ? 'border-amber-500 bg-amber-500'
                        : 'border-cyan-500 bg-cyan-500';
                  const ts = item.occurred_at || item.created_at;
                  return (
                    <div
                      key={`${item.type}-${item.id}`}
                      className="flex items-start gap-4 px-5 py-4"
                    >
                      <div
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full border ${dotCls}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-white">
                            {item.title || 'Event'}
                          </span>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${sc}`}
                          >
                            {item.severity || 'info'}
                          </span>
                          <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-400">
                            {item.type}
                          </span>
                        </div>
                        {item.description && (
                          <p className="mt-1 text-sm text-neutral-400 leading-relaxed">
                            {item.description}
                          </p>
                        )}
                        <div className="mt-1.5 text-xs text-neutral-500">
                          {ts ? new Date(ts).toLocaleString() : 'Unknown time'}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="px-5 py-5 text-sm text-neutral-400">
                  No timeline activity yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Day 281: Manager Action Modal (escalate / coaching action) ── */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeActionModal}
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  {actionModal === 'escalate' ? 'Escalate Account' : 'Create Coaching Action'}
                </h2>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {actionModal === 'escalate'
                    ? `Flag ${accountName} for manager intervention.`
                    : `Assign a coaching action on ${accountName}.`}
                </p>
              </div>
              <button
                type="button"
                onClick={closeActionModal}
                disabled={actionSaving}
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-40 transition-colors"
              >
                ✕
              </button>
            </div>

            {actionModal === 'escalate' ? (
              <form onSubmit={submitEscalation} className="px-5 py-4 space-y-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-1">Severity</label>
                  <select
                    value={escalateForm.severity}
                    onChange={(e) => setEscalateForm((p) => ({ ...p, severity: e.target.value }))}
                    disabled={actionSaving}
                    className="w-full rounded-lg border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50 disabled:opacity-60"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-1">
                    Reason <span className="text-neutral-600">(optional)</span>
                  </label>
                  <textarea
                    value={escalateForm.escalation_reason}
                    onChange={(e) => setEscalateForm((p) => ({ ...p, escalation_reason: e.target.value }))}
                    disabled={actionSaving}
                    rows={3}
                    placeholder="Why does this account need intervention?"
                    className="w-full rounded-lg border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-white outline-none resize-none focus:border-indigo-500/50 placeholder:text-neutral-600 disabled:opacity-60"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-neutral-300">
                  <input
                    type="checkbox"
                    checked={escalateForm.intervention_required}
                    onChange={(e) => setEscalateForm((p) => ({ ...p, intervention_required: e.target.checked }))}
                    disabled={actionSaving}
                    className="h-3.5 w-3.5 rounded border-neutral-700 bg-black/40"
                  />
                  Intervention required
                </label>
                {actionError && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                    {actionError}
                  </div>
                )}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={closeActionModal}
                    disabled={actionSaving}
                    className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 disabled:opacity-40 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionSaving}
                    className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {actionSaving ? 'Escalating…' : 'Escalate Account'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={submitCoachingAction} className="px-5 py-4 space-y-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-1">Title</label>
                  <input
                    type="text"
                    value={coachingForm.title}
                    onChange={(e) => setCoachingForm((p) => ({ ...p, title: e.target.value }))}
                    disabled={actionSaving}
                    placeholder="Coaching action"
                    className="w-full rounded-lg border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50 placeholder:text-neutral-600 disabled:opacity-60"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-1">Type</label>
                    <select
                      value={coachingForm.action_type}
                      onChange={(e) => setCoachingForm((p) => ({ ...p, action_type: e.target.value }))}
                      disabled={actionSaving}
                      className="w-full rounded-lg border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50 disabled:opacity-60"
                    >
                      <option value="coaching">Coaching</option>
                      <option value="replay_assignment">Replay</option>
                      <option value="sparring_drill">Sparring</option>
                      <option value="follow_up">Follow-up</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-1">Urgency</label>
                    <select
                      value={coachingForm.urgency}
                      onChange={(e) => setCoachingForm((p) => ({ ...p, urgency: e.target.value }))}
                      disabled={actionSaving}
                      className="w-full rounded-lg border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50 disabled:opacity-60"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-1">
                    Description <span className="text-neutral-600">(optional)</span>
                  </label>
                  <textarea
                    value={coachingForm.description}
                    onChange={(e) => setCoachingForm((p) => ({ ...p, description: e.target.value }))}
                    disabled={actionSaving}
                    rows={3}
                    placeholder="What should the rep work on?"
                    className="w-full rounded-lg border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-white outline-none resize-none focus:border-indigo-500/50 placeholder:text-neutral-600 disabled:opacity-60"
                  />
                </div>
                {actionError && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                    {actionError}
                  </div>
                )}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={closeActionModal}
                    disabled={actionSaving}
                    className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 disabled:opacity-40 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionSaving}
                    className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {actionSaving ? 'Creating…' : 'Create Action'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
