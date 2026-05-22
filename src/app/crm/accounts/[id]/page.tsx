'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

import { useParams } from 'next/navigation';

type LinkedContact = {
  id: string;
  name?: string | null;
  email?: string | null;
  company?: string | null;
  role?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type LinkedCall = {
  id: string;
  title?: string | null;
  score?: number | null;
  duration_seconds?: number | null;
  created_at?: string | null;
  rep_id?: string | null;
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

type AccountOwner = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  role?: string | null;
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

export default function AccountPage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [contacts, setContacts] = useState<LinkedContact[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [timelineLoading, setTimelineLoading] =
    useState(false);
  const [timelineSummary, setTimelineSummary] =
    useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [health, setHealth] = useState<AccountHealth | null>(null);
  const [ownerUpdating, setOwnerUpdating] = useState(false);
  const [ownerInput, setOwnerInput] = useState('');
  const [contactLinkLoading, setContactLinkLoading] =
    useState(false);
  const [contactIdInput, setContactIdInput] =
    useState('');

  const [summaryLoading, setSummaryLoading] =
    useState(false);

  const [summarySaving, setSummarySaving] =
    useState(false);

  const [persistedSummary, setPersistedSummary] =
    useState<PersistedAccountSummary | null>(null);

  const [summaryInput, setSummaryInput] =
    useState('');

  const [managerNotesInput, setManagerNotesInput] =
    useState('');

  const [tasksLoading, setTasksLoading] =
    useState(false);

  const [taskActionLoading, setTaskActionLoading] =
    useState(false);

  const [tasks, setTasks] = useState<AccountTask[]>([]);

  const [coachingActionsLoading, setCoachingActionsLoading] =
    useState(false);

  const [coachingActionLoading, setCoachingActionLoading] =
    useState(false);

  const [coachingActions, setCoachingActions] =
    useState<CoachingAction[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(`/api/proxy/v1/accounts/${id}`, {
          cache: 'no-store',
          credentials: 'include',
        });

        const j = await r.json();

        if (!alive) return;

        if (!j?.ok) {
          throw new Error(j?.error || 'fetch_failed');
        }

        setAccount(j.account || null);

        if (j.account?.owner?.id) {
          setOwnerInput(j.account.owner.id);
        }

        setStats(j.account?.stats || null);

        setRecent(Array.isArray(j.linked_calls) ? j.linked_calls : []);

        setContacts(
          Array.isArray(j.linked_contacts)
            ? j.linked_contacts
            : []
        );

        // --- Intelligence Timeline ---
        try {
          setTimelineLoading(true);

          const timelineRes = await fetch(
            `/api/proxy/v1/accounts/${id}/intelligence-timeline`,
            {
              cache: 'no-store',
              credentials: 'include',
            }
          );

          const timelineJson = await timelineRes.json();

          if (timelineJson?.ok) {
            setTimeline(
              Array.isArray(timelineJson.timeline)
                ? timelineJson.timeline
                : []
            );

            setTimelineSummary(
              timelineJson.summary || null
            );
          }
        } catch (e) {
          console.error('timeline_load_failed', e);
        } finally {
          setTimelineLoading(false);
        }

        // --- AI Account Tasks ---
        try {
          setTasksLoading(true);

          const taskRes = await fetch(
            `/api/proxy/v1/accounts/${id}/tasks`,
            {
              cache: 'no-store',
              credentials: 'include',
            }
          );

          const taskJson = await taskRes.json();

          if (taskJson?.ok) {
            setTasks(
              Array.isArray(taskJson.tasks)
                ? taskJson.tasks
                : []
            );
          }
        } catch (e) {
          console.error('task_load_failed', e);
        } finally {
          setTasksLoading(false);
        }

        // --- Coaching Actions ---
        try {
          setCoachingActionsLoading(true);

          const coachingRes = await fetch(
            `/api/proxy/v1/accounts/${id}/coaching-actions`,
            {
              cache: 'no-store',
              credentials: 'include',
            }
          );

          const coachingJson = await coachingRes.json();

          if (coachingJson?.ok) {
            setCoachingActions(
              Array.isArray(coachingJson.coaching_actions)
                ? coachingJson.coaching_actions
                : []
            );
          }
        } catch (e) {
          console.error('coaching_actions_load_failed', e);
        } finally {
          setCoachingActionsLoading(false);
        }
        // --- Persistent AI Summary ---
        try {
          setSummaryLoading(true);

          const summaryRes = await fetch(
            `/api/proxy/v1/accounts/${id}/summary`,
            {
              cache: 'no-store',
              credentials: 'include',
            }
          );

          const summaryJson = await summaryRes.json();

          if (summaryJson?.ok && summaryJson?.summary) {
            setPersistedSummary(summaryJson.summary);

            setSummaryInput(
              summaryJson.summary.summary || ''
            );

            setManagerNotesInput(
              summaryJson.summary.manager_notes || ''
            );
          }
        } catch (e) {
          console.error('summary_load_failed', e);
        } finally {
          setSummaryLoading(false);
        }
        // --- Account Health Engine ---
        const calls = Array.isArray(j.linked_calls)
          ? j.linked_calls
          : [];

        const avgScore = Number(j.account?.stats?.avg_score || 0);

        const latestCall = calls[0] || null;

        const latestCallDate = latestCall?.created_at
          ? new Date(latestCall.created_at).getTime()
          : null;

        const daysSinceActivity = latestCallDate
          ? Math.floor(
            (Date.now() - latestCallDate) /
            (1000 * 60 * 60 * 24)
          )
          : 999;

        const silenceDetected = daysSinceActivity > 14;

        const objectionRisk = avgScore < 60;

        const engagementTrend =
          avgScore >= 80
            ? 'improving'
            : avgScore >= 60
              ? 'stable'
              : 'declining';

        const healthScore = Math.max(
          0,
          Math.min(
            100,
            Math.round(
              avgScore * 0.7 +
              Math.max(0, 25 - daysSinceActivity) * 1.2
            )
          )
        );

        const flags: string[] = [];

        const repBuckets = new Map<string, {
          scores: number[];
          calls: number;
        }>();

        for (const call of calls) {
          const repId = String(call?.rep_id || 'unknown');

          if (!repBuckets.has(repId)) {
            repBuckets.set(repId, {
              scores: [],
              calls: 0,
            });
          }

          const bucket = repBuckets.get(repId)!;

          bucket.calls += 1;

          if (typeof call?.score === 'number') {
            bucket.scores.push(Number(call.score));
          }
        }

        const repPerformance: RepAccountPerformance[] = Array.from(
          repBuckets.entries()
        ).map(([repId, bucket]) => {
          const avg =
            bucket.scores.length > 0
              ? Math.round(
                bucket.scores.reduce((a, b) => a + b, 0) /
                bucket.scores.length
              )
              : 0;

          return {
            rep_id: repId,
            calls: bucket.calls,
            avg_score: avg,
            objection_risk:
              avg >= 80
                ? 'low'
                : avg >= 60
                  ? 'medium'
                  : 'high',
          };
        });

        const sortedRepPerformance = [...repPerformance].sort(
          (a, b) => a.avg_score - b.avg_score
        );

        const weakestRep =
          sortedRepPerformance.length > 0
            ? sortedRepPerformance[0]
            : null;

        const strongestRep =
          sortedRepPerformance.length > 0
            ? sortedRepPerformance[
            sortedRepPerformance.length - 1
            ]
            : null;

        const objectionTrends: string[] = [];

        if (avgScore < 70) {
          objectionTrends.push('Pricing resistance increasing');
        }

        if (silenceDetected) {
          objectionTrends.push('Customer engagement slowing');
        }

        if (calls.length >= 3 && avgScore < 60) {
          objectionTrends.push('Repeated weak call outcomes detected');
        }

        const weakestRepBehaviour: string[] = [];

        if (avgScore < 65) {
          weakestRepBehaviour.push('Weak objection handling');
        }

        if (silenceDetected) {
          weakestRepBehaviour.push('Poor follow-up consistency');
        }

        if (avgScore < 55) {
          weakestRepBehaviour.push('Low confidence during account conversations');
        }

        if (silenceDetected) {
          flags.push('No recent customer engagement detected');
        }

        if (objectionRisk) {
          flags.push('Low scoring calls detected across account');
        }

        if (avgScore < 50) {
          flags.push('Account relationship quality deteriorating');
        }

        const riskLevel =
          healthScore >= 75
            ? 'healthy'
            : healthScore >= 50
              ? 'watch'
              : 'at_risk';

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

        if (silenceDetected) {
          managerEscalationRecommendations.push(
            'Manager should manually re-engage customer relationship.'
          );
        }

        if (avgScore < 50) {
          managerEscalationRecommendations.push(
            'Escalate account to account recovery workflow.'
          );
        }

        const saveRecommendations: string[] = [];

        if (silenceDetected) {
          saveRecommendations.push('Book customer re-engagement call within 48 hours');
        }

        if (objectionRisk) {
          saveRecommendations.push('Run objection-handling replay drills for assigned reps');
        }

        if (avgScore < 50) {
          saveRecommendations.push('Escalate account review to management');
        }

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
          manager_escalation_recommendations:
            managerEscalationRecommendations,
        });

        // --- END Account Health Engine ---
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || 'load_failed');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  async function assignOwner() {
    if (!ownerInput.trim()) {
      alert('Enter an owner ID first.');
      return;
    }

    try {
      setOwnerUpdating(true);

      const r = await fetch(
        `/api/proxy/v1/accounts/${id}/owner`,
        {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            owner_id: ownerInput.trim(),
          }),
        }
      );

      const j = await r.json();

      if (!r.ok || !j?.ok) {
        throw new Error(j?.error || 'assign_owner_failed');
      }

      setAccount((prev: any) => ({
        ...(prev || {}),
        owner: j.account?.owner || null,
        owner_id: j.account?.owner_id || null,
        ownership_status: j.account?.ownership_status,
        coaching_ownership: j.account?.coaching_ownership,
      }));

      alert('Account owner assigned.');
    } catch (e: any) {
      console.error(e);
      alert(e?.message || 'Failed to assign owner');
    } finally {
      setOwnerUpdating(false);
    }
  }

  async function unassignOwner() {
    try {
      setOwnerUpdating(true);

      const r = await fetch(
        `/api/proxy/v1/accounts/${id}/owner`,
        {
          method: 'DELETE',
          credentials: 'include',
        }
      );

      const j = await r.json();

      if (!r.ok || !j?.ok) {
        throw new Error(j?.error || 'unassign_owner_failed');
      }

      setAccount((prev: any) => ({
        ...(prev || {}),
        owner: null,
        owner_id: null,
        ownership_status: 'unassigned',
        coaching_ownership: j.account?.coaching_ownership,
      }));

      alert('Account owner removed.');
    } catch (e: any) {
      console.error(e);
      alert(e?.message || 'Failed to unassign owner');
    } finally {
      setOwnerUpdating(false);
    }
  }

  async function linkContact() {
    if (!contactIdInput.trim()) {
      alert('Enter a contact ID first.');
      return;
    }

    try {
      setContactLinkLoading(true);

      const r = await fetch(
        `/api/proxy/v1/crm/contacts/${contactIdInput.trim()}/link-account`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            account_id: id,
          }),
        }
      );

      const j = await r.json();

      if (!r.ok || !j?.ok) {
        throw new Error(j?.error || 'link_contact_failed');
      }

      const linkedContact = j.contact || null;

      if (linkedContact?.id) {
        setContacts((prev) => {
          const exists = prev.some(
            (c) => c.id === linkedContact.id
          );

          if (exists) {
            return prev;
          }

          return [linkedContact, ...prev];
        });
      }

      setContactIdInput('');

      alert('Contact linked to account.');
    } catch (e: any) {
      console.error(e);
      alert(e?.message || 'Failed to link contact');
    } finally {
      setContactLinkLoading(false);
    }
  }

  async function unlinkContact(contactId: string) {
      try {
        setSummarySaving(true);

        const payload = {
          summary: summaryInput,
          manager_notes: managerNotesInput,
          health_status:
            health?.risk_level || 'stable',
          churn_risk:
            health?.health_score
              ? Math.max(0, 100 - health.health_score)
              : 0,
          next_best_action:
            health?.next_best_action || '',
        };

        const r = await fetch(
          `/api/proxy/v1/accounts/${id}/summary`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify(payload),
          }
        );

        const j = await r.json();

        if (!r.ok || !j?.ok) {
          throw new Error(j?.error || 'summary_save_failed');
        }

        setPersistedSummary(j.summary || null);

        alert('AI account summary saved.');
      } catch (e: any) {
        console.error(e);
        alert(e?.message || 'Failed to save account summary');
      } finally {
        setSummarySaving(false);
      }
    }

    async function generateAiTasks() {
      try {
        setTaskActionLoading(true);

        const r = await fetch(
          `/api/proxy/v1/accounts/${id}/tasks/generate`,
          {
            method: 'POST',
            credentials: 'include',
          }
        );

        const j = await r.json();

        if (!r.ok || !j?.ok) {
          throw new Error(
            j?.error || 'task_generation_failed'
          );
        }

        const generated = Array.isArray(j.generated_tasks)
          ? j.generated_tasks
          : [];

        if (generated.length > 0) {
          setTasks((prev) => [...generated, ...prev]);
        }

        alert(
          generated.length > 0
            ? `Generated ${generated.length} AI tasks.`
            : 'No new AI tasks required.'
        );
      } catch (e: any) {
        console.error(e);
        alert(e?.message || 'Failed to generate AI tasks');
      } finally {
        setTaskActionLoading(false);
      }
    }

    async function completeTask(taskId: string) {
      try {
        setTaskActionLoading(true);

        const r = await fetch(
          `/api/proxy/v1/accounts/tasks/${taskId}`,
          {
            method: 'PATCH',
            headers: {
              'content-type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
              status: 'completed',
            }),
          }
        );

        const j = await r.json();

        if (!r.ok || !j?.ok) {
          throw new Error(
            j?.error || 'task_complete_failed'
          );
        }

        setTasks((prev) =>
          prev.map((task) =>
            task.id === taskId
              ? {
                ...task,
                ...(j.task || {}),
              }
              : task
          )
        );
      } catch (e: any) {
        console.error(e);
        alert(e?.message || 'Failed to complete task');
      } finally {
        setTaskActionLoading(false);
      }
    }

    async function createReplayAssignment() {
      try {
        setCoachingActionLoading(true);

        const latestCall = recent?.[0];

        const r = await fetch(
          `/api/proxy/v1/accounts/${id}/coaching-action`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
              action_type: 'replay_assignment',
              title: 'Replay coaching assignment',
              description:
                'Review latest account conversations and identify objection handling weaknesses.',
              urgency:
                health?.risk_level === 'at_risk'
                  ? 'high'
                  : 'medium',
              replay_call_id: latestCall?.id || null,
              manager_notes:
                'AI-generated replay coaching intervention.',
            }),
          }
        );

        const j = await r.json();

        if (!r.ok || !j?.ok) {
          throw new Error(
            j?.error || 'replay_assignment_failed'
          );
        }

        if (j.coaching_action) {
          setCoachingActions((prev) => [
            j.coaching_action,
            ...prev,
          ]);
        }

        alert('Replay coaching assignment created.');
      } catch (e: any) {
        console.error(e);
        alert(e?.message || 'Failed to create replay assignment');
      } finally {
        setCoachingActionLoading(false);
      }
    }

    async function createSparringAssignment() {
      try {
        setCoachingActionLoading(true);

        const r = await fetch(
          `/api/proxy/v1/accounts/${id}/coaching-action`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
              action_type: 'sparring_drill',
              title: 'AI sparring drill assignment',
              description:
                'Run targeted objection-handling sparring drills for this account.',
              urgency:
                health?.risk_level === 'at_risk'
                  ? 'high'
                  : 'medium',
              sparring_scenario:
                health?.objection_risk
                  ? 'price_objection'
                  : 'relationship_building',
              manager_notes:
                'AI-generated sparring intervention workflow.',
            }),
          }
        );

        const j = await r.json();

        if (!r.ok || !j?.ok) {
          throw new Error(
            j?.error || 'sparring_assignment_failed'
          );
        }

        if (j.coaching_action) {
          setCoachingActions((prev) => [
            j.coaching_action,
            ...prev,
          ]);
        }

        alert('Sparring drill assignment created.');
      } catch (e: any) {
        console.error(e);
        alert(e?.message || 'Failed to create sparring assignment');
      } finally {
        setCoachingActionLoading(false);
      }
    }

    async function completeCoachingAction(actionId: string) {
      setCoachingActions((prev) =>
        prev.map((action) =>
          action.id === actionId
            ? {
                ...action,
                status: 'completed',
                completed_at: new Date().toISOString(),
              }
            : action
        )
      );
    }
    try {
      setContactLinkLoading(true);

      const r = await fetch(
        `/api/proxy/v1/crm/contacts/${contactId}/unlink-account`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            account_id: id,
          }),
        }
      );

      const j = await r.json();

      if (!r.ok || !j?.ok) {
        throw new Error(j?.error || 'unlink_contact_failed');
      }

      setContacts((prev) =>
        prev.filter((c) => c.id !== contactId)
      );

      alert('Contact unlinked from account.');
    } catch (e: any) {
      console.error(e);
      alert(e?.message || 'Failed to unlink contact');
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
        health_status:
          health?.risk_level || 'stable',
        churn_risk:
          health?.health_score
            ? Math.max(0, 100 - health.health_score)
            : 0,
        next_best_action:
          health?.next_best_action || '',
      };

      const r = await fetch(
        `/api/proxy/v1/accounts/${id}/summary`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(payload),
        }
      );

      const j = await r.json();

      if (!r.ok || !j?.ok) {
        throw new Error(
          j?.error || 'summary_save_failed'
        );
      }

      setPersistedSummary(j.summary || null);

      alert('AI account summary saved.');
    } catch (e: any) {
      console.error(e);
      alert(e?.message || 'Failed to save account summary');
    } finally {
      setSummarySaving(false);
    }
  }

  const accountName = account?.name || account?.domain || 'Account';
  const firstContact =
    contacts && contacts.length > 0
      ? contacts[0]
      : null;

  const firstContactName =
    firstContact?.name ||
    firstContact?.email ||
    'Contact';

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="mb-4">
        <Link href="/crm/overview" className="text-sm text-neutral-400 hover:text-neutral-200">← Back to Overview</Link>
      </div>

      <div className="flex items-baseline justify-between gap-4 mb-2">
        <h1 className="text-xl font-semibold">{accountName}</h1>
        <div className="flex items-center gap-2">
          {contacts.length > 0 && (
            <Link
              href={`/crm/contacts/${firstContact?.id}`}
              className="text-xs px-2 py-1 rounded border border-neutral-800 hover:bg-neutral-900"
              title={firstContactName ? `Open ${firstContactName}` : 'Open a contact linked to this account'}
            >
              👤 Contacts ({contacts.length})
            </Link>
          )}
          {loading && <span className="text-xs opacity-60">Loading…</span>}
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
      </div>

      {/* Persistent AI CRM Memory */}
      <div className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-5 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-fuchsia-300">
              AI CRM Memory
            </div>

            <div className="mt-2 text-2xl font-semibold text-white">
              Persistent Account Intelligence
            </div>

            <div className="mt-2 text-sm text-neutral-300 max-w-2xl">
              Save evolving account summaries, coaching intelligence,
              manager notes, and long-term relationship context.
            </div>
          </div>

          <div className="rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-1 text-xs font-medium text-fuchsia-200">
            {summaryLoading
              ? 'Loading memory…'
              : persistedSummary?.updated_at
                ? 'Memory active'
                : 'No saved memory'}
          </div>
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div className="rounded-xl border border-neutral-800 bg-black/20 p-4">
            <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500 mb-3">
              AI account summary
            </div>

            <textarea
              value={summaryInput}
              onChange={(e) =>
                setSummaryInput(e.target.value)
              }
              rows={8}
              placeholder="Persist long-term AI account intelligence here..."
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm text-white outline-none resize-none"
            />
          </div>

          <div className="rounded-xl border border-neutral-800 bg-black/20 p-4">
            <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500 mb-3">
              Manager notes
            </div>

            <textarea
              value={managerNotesInput}
              onChange={(e) =>
                setManagerNotesInput(e.target.value)
              }
              rows={8}
              placeholder="Manager observations, escalation notes, recovery plans..."
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm text-white outline-none resize-none"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <div className="text-xs text-neutral-500">
            {persistedSummary?.updated_at
              ? `Last updated ${new Date(
                persistedSummary.updated_at
              ).toLocaleString()}`
              : 'No persisted AI memory yet.'}
          </div>

          <button
            type="button"
            disabled={summarySaving}
            onClick={saveAccountSummary}
            className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/10 px-4 py-2 text-sm text-fuchsia-200 hover:bg-fuchsia-500/20 disabled:opacity-60"
          >
            {summarySaving
              ? 'Saving memory…'
              : 'Save AI Memory'}
          </button>
        </div>
      </div>

      {/* AI Account Task Centre */}
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 mt-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-amber-300">
              AI Account Task Centre
            </div>

            <div className="mt-2 text-2xl font-semibold text-white">
              Operational Rescue Workflows
            </div>

            <div className="mt-2 text-sm text-neutral-300 max-w-2xl">
              AI-generated account coaching, escalation, rescue,
              ownership, and engagement workflows.
            </div>
          </div>

          <button
            type="button"
            disabled={taskActionLoading}
            onClick={generateAiTasks}
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200 hover:bg-amber-500/20 disabled:opacity-60"
          >
            {taskActionLoading
              ? 'Generating…'
              : 'Generate AI Tasks'}
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {tasksLoading ? (
            <div className="rounded-xl border border-neutral-800 bg-black/20 px-4 py-4 text-sm text-neutral-400">
              Loading AI task workflows…
            </div>
          ) : tasks.length > 0 ? (
            tasks.map((task) => (
              <div
                key={task.id}
                className="rounded-xl border border-neutral-800 bg-black/20 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-medium text-white">
                        {task.title || 'Untitled task'}
                      </div>

                      <div
                        className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${task.urgency === 'critical'
                          ? 'border-red-500/30 bg-red-500/10 text-red-300'
                          : task.urgency === 'high'
                            ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                            : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
                          }`}
                      >
                        {task.urgency || 'medium'}
                      </div>

                      <div className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-neutral-300">
                        {task.status || 'open'}
                      </div>
                    </div>

                    <div className="mt-2 text-sm text-neutral-300 max-w-2xl">
                      {task.description || 'No description provided.'}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.12em] text-neutral-500">
                      {task.category ? (
                        <div className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-1">
                          {task.category}
                        </div>
                      ) : null}

                      {task.escalation_source ? (
                        <div className="rounded-full border border-red-500/20 bg-red-500/5 px-2 py-1 text-red-300">
                          {task.escalation_source}
                        </div>
                      ) : null}

                      {task.due_at ? (
                        <div className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-1">
                          Due {new Date(task.due_at).toLocaleDateString()}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {task.status !== 'completed' ? (
                    <button
                      type="button"
                      disabled={taskActionLoading}
                      onClick={() => completeTask(task.id)}
                      className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-60"
                    >
                      Mark Complete
                    </button>
                  ) : (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                      Completed
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-neutral-800 bg-black/20 px-4 py-4 text-sm text-neutral-400">
              No AI-generated workflows yet.
            </div>
          )}
        </div>
      </div>

      {/* Coaching Actions Centre */}
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 mt-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-emerald-300">
              Coaching Actions Centre
            </div>

            <div className="mt-2 text-2xl font-semibold text-white">
              AI Coaching Interventions
            </div>

            <div className="mt-2 text-sm text-neutral-300 max-w-2xl">
              Launch replay drills, sparring interventions, and
              account recovery coaching workflows.
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={coachingActionLoading}
              onClick={createReplayAssignment}
              className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-60"
            >
              Assign Replay
            </button>

            <button
              type="button"
              disabled={coachingActionLoading}
              onClick={createSparringAssignment}
              className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-60"
            >
              Assign Sparring Drill
            </button>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {coachingActionsLoading ? (
            <div className="rounded-xl border border-neutral-800 bg-black/20 px-4 py-4 text-sm text-neutral-400">
              Loading coaching interventions…
            </div>
          ) : coachingActions.length > 0 ? (
            coachingActions.map((action) => {
              const urgencyClass =
                action.urgency === 'critical'
                  ? 'border-red-500/30 bg-red-500/10 text-red-300'
                  : action.urgency === 'high'
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                    : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300';

              return (
                <div
                  key={action.id}
                  className="rounded-xl border border-neutral-800 bg-black/20 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-medium text-white">
                          {action.title || 'Coaching action'}
                        </div>

                        <div
                          className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${urgencyClass}`}
                        >
                          {action.urgency || 'medium'}
                        </div>

                        <div className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-neutral-300">
                          {action.action_type || 'coaching'}
                        </div>

                        {action.status === 'completed' ? (
                          <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-emerald-300">
                            completed
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-2 text-sm text-neutral-300 max-w-3xl leading-relaxed">
                        {action.description || 'No description provided.'}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.12em] text-neutral-500">
                        {action.sparring_scenario ? (
                          <div className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-1">
                            Scenario: {action.sparring_scenario}
                          </div>
                        ) : null}

                        {action.replay_call_id ? (
                          <div className="rounded-full border border-cyan-500/20 bg-cyan-500/5 px-2 py-1 text-cyan-300">
                            Replay linked
                          </div>
                        ) : null}

                        {action.due_at ? (
                          <div className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-1">
                            Due {new Date(action.due_at).toLocaleDateString()}
                          </div>
                        ) : null}
                      </div>

                      {action.manager_notes ? (
                        <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs text-neutral-300 leading-relaxed">
                          {action.manager_notes}
                        </div>
                      ) : null}
                    </div>

                    {action.status !== 'completed' ? (
                      <button
                        type="button"
                        onClick={() =>
                          completeCoachingAction(action.id)
                        }
                        className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-500/20"
                      >
                        Complete Action
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-xl border border-neutral-800 bg-black/20 px-4 py-4 text-sm text-neutral-400">
              No coaching interventions created yet.
            </div>
          )}
        </div>
      </div>

      {health && (
        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.16em] text-cyan-300">
                AI Account Health Engine
              </div>

              <div className="mt-2 text-3xl font-semibold text-white">
                {health.health_score}/100
              </div>

              <div className="mt-2 text-sm text-neutral-300">
                {health.ai_summary}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className={`rounded-full px-3 py-1 text-xs font-medium border ${health.risk_level === 'healthy'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : health.risk_level === 'watch'
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  : 'border-red-500/30 bg-red-500/10 text-red-300'
                }`}>
                {health.risk_level === 'healthy'
                  ? 'Healthy'
                  : health.risk_level === 'watch'
                    ? 'Watch account'
                    : 'At risk'}
              </div>

              <div className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-300">
                Trend: {health.engagement_trend}
              </div>
            </div>
          </div>

          {health.flags.length > 0 && (
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {health.flags.map((flag, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-200"
                >
                  ⚠️ {flag}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Account Ownership Intelligence */}
      <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-5 mt-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-indigo-300">
              Account Ownership
            </div>

            <div className="mt-2 text-2xl font-semibold text-white">
              {account?.owner?.full_name ||
                account?.owner?.email ||
                'Unassigned'}
            </div>

            <div className="mt-2 text-sm text-neutral-300">
              {account?.coaching_ownership
                ?.manager_rescue_workflow ||
                'No account owner assigned.'}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className={`rounded-full border px-3 py-1 text-xs font-medium ${account?.ownership_status === 'assigned'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                }`}
            >
              {account?.ownership_status === 'assigned'
                ? 'Assigned'
                : 'Unassigned'}
            </div>

            {account?.owner?.role ? (
              <div className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-300">
                {account.owner.role}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-neutral-800 bg-black/20 p-4">
            <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">
              Escalation route
            </div>

            <div className="mt-2 text-sm text-white">
              {account?.coaching_ownership?.escalation_route ||
                'manager_queue'}
            </div>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-black/20 p-4">
            <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">
              Manager rescue workflow
            </div>

            <div className="mt-2 text-sm text-white leading-relaxed">
              {account?.coaching_ownership
                ?.manager_rescue_workflow ||
                'No rescue workflow configured.'}
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-neutral-800 bg-black/20 p-4">
          <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500 mb-3">
            Assign / reassign owner
          </div>

          <div className="flex flex-col md:flex-row gap-3">
            <input
              value={ownerInput}
              onChange={(e) => setOwnerInput(e.target.value)}
              placeholder="Enter rep/user ID"
              className="flex-1 rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none"
            />

            <button
              type="button"
              disabled={ownerUpdating}
              onClick={assignOwner}
              className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-60"
            >
              {ownerUpdating ? 'Saving…' : 'Assign Owner'}
            </button>

            {account?.owner_id ? (
              <button
                type="button"
                disabled={ownerUpdating}
                onClick={unassignOwner}
                className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200 hover:bg-red-500/20 disabled:opacity-60"
              >
                Remove Owner
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4 mt-6">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-4">
          <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">
            Linked contacts
          </div>

          <div className="mt-2 text-2xl font-semibold text-white">
            {stats?.contacts || 0}
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-4">
          <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">
            Linked calls
          </div>

          <div className="mt-2 text-2xl font-semibold text-white">
            {stats?.calls || 0}
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-4">
          <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">
            Average score
          </div>

          <div className="mt-2 text-2xl font-semibold text-white">
            {typeof stats?.avg_score === 'number'
              ? stats.avg_score
              : '—'}
          </div>
        </div>

        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-4">
          <div className="text-[10px] uppercase tracking-[0.12em] text-cyan-300">
            CRM intelligence
          </div>

          <div className="mt-2 text-sm font-medium text-cyan-100">
            Enterprise account relationship tracking
          </div>
        </div>
      </div>

      {health && (
        <div className="grid gap-4 md:grid-cols-3 mt-6">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-4">
            <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">
              Engagement trend
            </div>

            <div className="mt-2 text-lg font-semibold text-white capitalize">
              {health.engagement_trend}
            </div>

            <div className="mt-2 text-xs text-neutral-400">
              AI detected overall relationship momentum.
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-4">
            <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">
              Silence detection
            </div>

            <div className="mt-2 text-lg font-semibold text-white">
              {health.silence_detected ? 'Detected' : 'Active'}
            </div>

            <div className="mt-2 text-xs text-neutral-400">
              Detects accounts with declining activity or follow-up gaps.
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-4">
            <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">
              Objection trend risk
            </div>

            <div className="mt-2 text-lg font-semibold text-white">
              {health.objection_risk ? 'Elevated' : 'Controlled'}
            </div>

            <div className="mt-2 text-xs text-neutral-400">
              AI monitors objection-heavy conversations and weak outcomes.
            </div>
          </div>
        </div>
      )}

      {health && (
        <div className="grid gap-6 md:grid-cols-2 mt-6">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 overflow-hidden">
            <div className="border-b border-neutral-800 px-4 py-3 font-medium text-white">
              AI objection trends
            </div>

            <div className="space-y-2 px-4 py-4">
              {health.objection_trends.length > 0 ? (
                health.objection_trends.map((trend, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200"
                  >
                    ⚡ {trend}
                  </div>
                ))
              ) : (
                <div className="text-sm text-neutral-400">
                  No objection risks detected.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 overflow-hidden">
            <div className="border-b border-neutral-800 px-4 py-3 font-medium text-white">
              Weakest rep behaviour
            </div>

            <div className="space-y-2 px-4 py-4">
              {health.weakest_rep_behaviour.length > 0 ? (
                health.weakest_rep_behaviour.map((item, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-200"
                  >
                    📉 {item}
                  </div>
                ))
              ) : (
                <div className="text-sm text-neutral-400">
                  No behavioural weaknesses detected.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {health && health.manager_escalation_recommendations.length > 0 && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 overflow-hidden mt-6">
          <div className="border-b border-red-500/10 px-4 py-3 font-medium text-red-200">
            Manager escalation recommendations
          </div>

          <div className="space-y-2 px-4 py-4">
            {health.manager_escalation_recommendations.map((item, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-100"
              >
                🚨 {item}
              </div>
            ))}
          </div>
        </div>
      )}

      {health && (
        <div className="grid gap-6 md:grid-cols-2 mt-6">
          <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-5">
            <div className="text-[11px] uppercase tracking-[0.16em] text-cyan-300">
              AI next best action
            </div>

            <div className="mt-3 text-sm text-cyan-100">
              {health.next_best_action}
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 overflow-hidden">
            <div className="border-b border-emerald-500/10 px-4 py-3 font-medium text-emerald-200">
              Account save recommendations
            </div>

            <div className="space-y-2 px-4 py-4">
              {health.save_recommendations.length > 0 ? (
                health.save_recommendations.map((rec, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-100"
                  >
                    ✅ {rec}
                  </div>
                ))
              ) : (
                <div className="text-sm text-neutral-400">
                  No save recommendations currently required.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {health && health.rep_performance.length > 0 && (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 overflow-hidden mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3">
            <div className="font-medium text-white">
              Account rep intelligence
            </div>

            <div className="text-xs text-neutral-500">
              AI account ownership analysis
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-800 text-sm">
              <thead className="bg-black/30 text-xs uppercase tracking-[0.12em] text-neutral-500">
                <tr>
                  <th className="px-4 py-3 text-left">Rep</th>
                  <th className="px-4 py-3 text-left">Calls</th>
                  <th className="px-4 py-3 text-left">Avg score</th>
                  <th className="px-4 py-3 text-left">Objection risk</th>
                  <th className="px-4 py-3 text-left">AI assessment</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-neutral-800">
                {health.rep_performance.map((rep) => (
                  <tr key={rep.rep_id} className="hover:bg-neutral-900/40">
                    <td className="px-4 py-3 text-white">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{rep.rep_id}</span>

                        {health.strongest_rep_id === rep.rep_id && (
                          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-emerald-300">
                            Strongest
                          </span>
                        )}

                        {health.weakest_rep_id === rep.rep_id && (
                          <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-red-300">
                            Weakest
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-neutral-300">
                      {rep.calls}
                    </td>

                    <td className="px-4 py-3">
                      <ScorePill score={rep.avg_score} />
                    </td>

                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.12em] border ${rep.objection_risk === 'low'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        : rep.objection_risk === 'medium'
                          ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                          : 'border-red-500/30 bg-red-500/10 text-red-300'
                        }`}>
                        {rep.objection_risk}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-xs text-neutral-400">
                      {rep.avg_score >= 80
                        ? 'Strong account handling performance'
                        : rep.avg_score >= 60
                          ? 'Moderate objection handling risk'
                          : 'High coaching intervention risk'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        {/* Recent Calls */}
        <div className="rounded-lg border border-neutral-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800 font-medium">Recent Calls</div>
          <div className="divide-y divide-neutral-800">
            {recent.length ? recent.map((c) => (
              <div key={c.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/calls/${c.id}`} className="text-sm hover:underline truncate block">{c.filename || c.id}</Link>
                  <div className="text-xs text-neutral-500">{new Date(c.created_at).toLocaleString()}</div>
                </div>
                <ScorePill score={c.overall_score} />
              </div>
            )) : (
              <div className="px-4 py-4 text-sm text-neutral-400">No recent calls.</div>
            )}
          </div>
        </div>

        {/* Linked Contacts */}
        <div className="rounded-lg border border-neutral-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800 font-medium">
            Linked contacts
          </div>

          <div className="divide-y divide-neutral-800">
            {contacts.length > 0 ? (
              contacts.map((contact) => (
                <Link
                  key={contact.id}
                  href={`/crm/contacts/${contact.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-neutral-900/60"
                >
                  <div>
                    <div className="text-sm text-white">
                      {contact.name || contact.email || 'Contact'}
                    </div>

                    <div className="mt-1 text-xs text-neutral-500">
                      {contact.role || 'No role'}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        unlinkContact(contact.id);
                      }}
                      className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] text-red-200 hover:bg-red-500/20"
                    >
                      Unlink
                    </button>

                    <div className="text-xs text-cyan-300">
                      Open →
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="px-4 py-4 text-sm text-neutral-400">
                No linked contacts.
              </div>
            )}
          </div>
        </div>

        {/* Intelligence Timeline */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 overflow-hidden md:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3">
            <div>
              <div className="font-medium text-white">
                AI Intelligence Timeline
              </div>

              <div className="mt-1 text-xs text-neutral-500">
                Unified account memory, coaching, escalation,
                and operational history.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.12em]">
              <div className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-300">
                {timelineSummary?.total_events || 0} events
              </div>

              <div className="rounded-full border border-red-500/20 bg-red-500/5 px-2 py-1 text-red-300">
                {timelineSummary?.critical_events || 0} critical
              </div>

              <div className="rounded-full border border-amber-500/20 bg-amber-500/5 px-2 py-1 text-amber-300">
                {timelineSummary?.warning_events || 0} warnings
              </div>
            </div>
          </div>

          <div className="divide-y divide-neutral-800">
            {timelineLoading ? (
              <div className="px-4 py-5 text-sm text-neutral-400">
                Loading intelligence timeline…
              </div>
            ) : timeline.length > 0 ? (
              timeline.map((item) => {
                const severityClass =
                  item.severity === 'critical'
                    ? 'border-red-500/20 bg-red-500/5 text-red-300'
                    : item.severity === 'warning'
                      ? 'border-amber-500/20 bg-amber-500/5 text-amber-300'
                      : 'border-cyan-500/20 bg-cyan-500/5 text-cyan-300';

                return (
                  <div
                    key={`${item.type}-${item.id}`}
                    className="flex flex-wrap items-start justify-between gap-4 px-4 py-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-medium text-white">
                          {item.title || 'Timeline event'}
                        </div>

                        <div
                          className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${severityClass}`}
                        >
                          {item.severity || 'info'}
                        </div>

                        <div className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-neutral-300">
                          {item.type}
                        </div>
                      </div>

                      {item.description ? (
                        <div className="mt-2 text-sm text-neutral-300 max-w-3xl leading-relaxed">
                          {item.description}
                        </div>
                      ) : null}

                      <div className="mt-3 text-xs text-neutral-500">
                        {(item.occurred_at || item.created_at)
                          ? new Date(
                              item.occurred_at || item.created_at || ''
                            ).toLocaleString()
                          : 'Unknown timestamp'}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="px-4 py-5 text-sm text-neutral-400">
                No intelligence timeline activity yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}