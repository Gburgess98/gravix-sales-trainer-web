'use client';
import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PERSONAS, getPersona } from '@/lib/personas';
import { logSparringSession, scoreSparring, getSparringSessionsByRep } from '@/lib/api';
import { useToast } from '@/components/Toast';

export default function SparringPage() {
  const search = useSearchParams();
  const personaId = useMemo(() => (search.get('persona') || 'price_sensitive'), [search]);
  const persona = useMemo(() => getPersona(personaId), [personaId]);
  const defaultXp = persona.xpAward ?? 25;
  const repId = useMemo(() => search.get('repId') || search.get('rep') || '', [search]);

  type Turn = { role: 'user' | 'buyer'; text: string; t: number };
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [ended, setEnded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [score, setScore] = useState<{ intro: number; discovery: number; objection: number; close: number; voice: number; overall: number }>({
    intro: 0, discovery: 0, objection: 0, close: 0, voice: 0, overall: 0
  });
  const [scoreSummary, setScoreSummary] = useState<null | {
    personaId?: string;
    scores?: { tone: number; objection: number; close: number };
    total?: number;
    xp_awarded?: number;
  }>(null);
  const [scoring, setScoring] = useState(false);
  const [lastScoredAt, setLastScoredAt] = useState<number | null>(null);
  // Confetti guard to avoid repeated bursts for the same scoring event
  const [confettiFiredAt, setConfettiFiredAt] = useState<number | null>(null);

  // Recent sessions state (for the panel under Score Summary)
  const [recent, setRecent] = useState<Array<{ id: string; persona_id: string | null; total_score: number | null; xp_awarded: number | null; created_at: string }>>([]);
  const [recentErr, setRecentErr] = useState<string | null>(null);
  const [recentLoading, setRecentLoading] = useState(false);
  // Load last 5 sessions whenever repId changes or a new score is recorded
  useEffect(() => {
    let mounted = true;
    async function loadRecent() {
      if (!repId) { setRecent([]); return; }
      try {
        setRecentLoading(true);
        setRecentErr(null);
        const rows = await getSparringSessionsByRep(repId, 5);
        if (mounted) setRecent(rows as any);
      } catch (e: any) {
        if (mounted) setRecentErr(e?.message || 'Failed to load sessions');
      } finally {
        if (mounted) setRecentLoading(false);
      }
    }
    loadRecent();
    return () => { mounted = false; };
  }, [repId, lastScoredAt]);

  // Toast helper (safe no-op if provider missing)
  const toast = useToast();
  const pushToast = toast?.push;

  // If no persona provided in URL, restore from localStorage (no reload loop — replaceState only)
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const hasPersona = !!url.searchParams.get('persona');
      if (!hasPersona) {
        const saved = localStorage.getItem('gravix.personaId');
        if (saved) {
          url.searchParams.set('persona', saved);
          window.history.replaceState(null, '', url.toString());
        }
      }
    } catch {}
  }, []);
  async function handleGetScore() {
    try {
      setScoring(true);

      // Build a lightweight transcript from the user's turns (fallback to current input)
      const transcript = (() => {
        const msgs = turns.filter(t => t.role === 'user').map(t => t.text);
        if (msgs.length === 0 && input.trim()) return input.trim();
        return msgs.slice(-8).join('\n'); // last up to 8 user messages
      })();

      if (!transcript?.trim()) {
        pushToast && pushToast('Add some transcript text first.');
        setScoreSummary({ personaId, scores: { tone: 0, objection: 0, close: 0 }, total: 0, xp_awarded: 0 });
        return;
      }

      const res = await scoreSparring(transcript, personaId);
      if (!res?.ok) {
        console.error('Score failed', res);
        pushToast && pushToast('Scoring failed.');
        setScoreSummary({ personaId, scores: { tone: 0, objection: 0, close: 0 }, total: 0, xp_awarded: 0 });
        return;
      }

      // Expect: { ok, personaId, scores:{tone,objection,close}, total, xp_awarded }
      setScoreSummary({
        personaId: res.personaId,
        scores: res.scores,
        total: res.total,
        xp_awarded: res.xp_awarded,
      });
      setLastScoredAt(Date.now());

      // Fire confetti if reward is high (xp_awarded > 20) — lazy import to keep bundle light
      try {
        const xpNow = Number(res?.xp_awarded ?? 0);
        if (xpNow > 20) {
          const now = Date.now();
          if (!confettiFiredAt || now - confettiFiredAt > 1000) {
            const mod = await import('canvas-confetti');
            const confetti = (mod as any).default || (mod as any);
            if (typeof confetti === 'function') {
              confetti({
                particleCount: 100,
                spread: 60,
                startVelocity: 45,
                ticks: 200,
                origin: { y: 0.3 },
              });
              setConfettiFiredAt(now);
            }
          }
        }
      } catch {
        // If the library isn't installed, ignore silently.
      }

      // Auto-log XP (non-blocking)
      try {
        await logSparringSession({
          repId: repId || undefined,
          personaId: res.personaId,
          xp: res.xp_awarded ?? 0,
          meta: { total: res.total, scores: res.scores }
        });
      } catch (e) {
        console.warn('logSparringSession failed (non-blocking)', e);
      }

      // Toast feedback
      pushToast && pushToast(`+${res.xp_awarded ?? 0} XP`);
    } catch (e) {
      console.error('Score failed', e);
      pushToast && pushToast('Scoring failed.');
      setScoreSummary({ personaId, scores: { tone: 0, objection: 0, close: 0 }, total: 0, xp_awarded: 0 });
    } finally {
      setScoring(false);
    }
  }

  function heuristicScore(latestUserMsg: string) {
    const txt = latestUserMsg.toLowerCase();

    const hasIntro = /(^|\s)(hey|hi|hello|good\s(morning|afternoon|evening)|thanks)/.test(txt);
    const hasDiscovery = /(budget|timeline|use case|workflow|current process|decision|stakeholder|priority)/.test(txt);
    const hasObjection = /(price|too expensive|concern|risk|roi|value|cost)/.test(txt);
    const hasClose = /(next step|calendar|book|schedule|trial|pilot|start|kickoff)/.test(txt);
    const hasVoice = /(confident|clarity|pause|tone|mirror)/.test(txt); // placeholder

    const w = persona.scoringWeights;
    const s = {
      intro: hasIntro ? w.intro : 0,
      discovery: hasDiscovery ? w.discovery : 0,
      objection: hasObjection ? w.objection : 0,
      close: hasClose ? w.close : 0,
      voice: hasVoice ? w.voice : 0,
    };
    const overall = s.intro + s.discovery + s.objection + s.close + s.voice;
    return { ...s, overall };
  }

  async function handleSend() {
    const text = input.trim();
    if (!text) return;
    const t = Date.now();
    setInput('');
    // push user msg
    setTurns(xs => [...xs, { role: 'user', text, t }]);
    // score incrementally (keep best per category this session)
    const s = heuristicScore(text);
    setScore(prev => {
      const merged = {
        intro: Math.max(prev.intro, s.intro),
        discovery: Math.max(prev.discovery, s.discovery),
        objection: Math.max(prev.objection, s.objection),
        close: Math.max(prev.close, s.close),
        voice: Math.max(prev.voice, s.voice),
      };
      return { ...merged, overall: merged.intro + merged.discovery + merged.objection + merged.close + merged.voice };
    });
    // rotate buyer template reply
    const idx = Math.floor(Math.random() * persona.replyTemplates.length);
    const buyer = persona.replyTemplates[idx];
    setTurns(xs => [...xs, { role: 'buyer', text: buyer, t: Date.now() }]);
  }

  useEffect(() => {
    setTurns(xs => (xs.length ? xs : [{ role: 'buyer', text: persona.opener, t: Date.now() }]));
    // reset score when persona changes
    setScore({ intro: 0, discovery: 0, objection: 0, close: 0, voice: 0, overall: 0 });
    setScoreSummary(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId]);

  async function logResult() {
    try {
      setSaving(true);
      setSyncMsg(null);
      const body = {
        repId: repId || undefined,
        xp: defaultXp,
        personaId,
        score,
        turns: turns.map(({ role, text, t }) => ({ role, text, t })),
      };
      const res = await fetch('/api/proxy/v1/sparring/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Log failed: ${res.status} ${res.statusText} ${txt}`);
      }
      setSyncMsg('Synced to dashboard ✅');
    } catch (e: any) {
      console.error('Failed to log sparring result', e);
      setSyncMsg('Saved locally (sync later) ⚠️');
    } finally {
      setSaving(false);
    }
  }

  function fmtTime(t: number | null) {
    if (!t) return '-';
    try {
      return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '-';
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <h1 className="text-2xl font-semibold mb-4">🥊 Sparring Session</h1>
      <div className="mb-3 flex items-center gap-2 text-sm">
        <label className="opacity-80">Persona</label>
        <select
          className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
          value={personaId}
          onChange={(e) => {
            const id = e.target.value;
            try { localStorage.setItem('gravix.personaId', id); } catch {}
            const url = new URL(window.location.href);
            url.searchParams.set('persona', id);
            window.location.href = url.toString();
          }}
        >
          {PERSONAS.map(p => (
            <option key={p.id} value={p.id}>{p.name} — {p.difficulty}</option>
          ))}
        </select>
      </div>
      <div className="border border-neutral-800 rounded-lg p-4 h-80 overflow-y-auto bg-neutral-950/50 text-sm space-y-2">
        {turns.map((m, i) => (
          <div key={i}>
            {m.role === 'user' ? '🧑 You: ' : '🤖 Buyer: '}
            {m.text}
          </div>
        ))}
      </div>
      {!ended ? (
        <div>
          <div className="mt-4 flex flex-wrap items-center gap-2" aria-busy={scoring || saving}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={ended || scoring}
              placeholder={ended ? 'Session ended' : 'Type your line and press Send'}
              className="flex-1 min-w-[240px] bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm disabled:opacity-60"
            />
            <button
              onClick={handleSend}
              disabled={ended || !input.trim() || scoring}
              className="bg-sky-600/20 border border-sky-600/40 text-sky-300 px-3 py-1 rounded disabled:opacity-50"
              title={ended ? 'Session ended' : 'Send your line'}
            >
              Send
            </button>
            <button
              onClick={handleGetScore}
              disabled={scoring}
              className="inline-flex items-center gap-2 bg-emerald-600/20 border border-emerald-600/40 text-emerald-300 px-3 py-1 rounded disabled:opacity-50"
              title="Run a quick score on your latest responses"
            >
              {scoring && (
                <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.25" />
                  <path d="M22 12a10 10 0 0 1-10 10" fill="none" stroke="currentColor" strokeWidth="3" />
                </svg>
              )}
              {scoring ? 'Scoring…' : 'Get Score'}
            </button>
            <button
              onClick={async () => { await logResult(); }}
              disabled={saving}
              className="bg-indigo-600/20 border border-indigo-600/40 text-indigo-300 px-3 py-1 rounded disabled:opacity-50"
              title="Log this session without ending it"
            >
              {saving ? 'Logging…' : 'Log session'}
            </button>
            <button
              onClick={async () => { setEnded(true); await logResult(); }}
              disabled={saving}
              className="bg-amber-600/20 border border-amber-600/40 text-amber-300 px-3 py-1 rounded disabled:opacity-50"
              title={repId ? '' : 'No repId in query; will still try to log.'}
            >
              {saving ? 'Ending…' : 'End'}
            </button>
          </div>
          <div className="mt-2 text-xs flex items-center gap-3 text-neutral-300">
            {scoreSummary && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600/15 border border-emerald-600/30 text-emerald-300">
                +{scoreSummary.xp_awarded ?? 0} XP
              </span>
            )}
            {scoring && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-200">
                Scoring…
              </span>
            )}
            {saving && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-200">
                Saving…
              </span>
            )}
            {scoreSummary && <span className="opacity-75">Last scored: {fmtTime(lastScoredAt)}</span>}
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 text-emerald-400 font-medium">
            ✅ Session complete — you earned +{defaultXp} XP!
            {syncMsg && <span className="ml-2 text-xs text-neutral-300 align-middle">({syncMsg})</span>}
            {!syncMsg && <span className="ml-2 text-xs text-neutral-300 align-middle">(syncing…)</span>}
          </div>
          {(!repId) && (
            <div className="mt-2 text-xs text-amber-300">
              Tip: Open Sparring from a Rep Profile to pass <code>?repId=&lt;repUuid&gt;</code> so XP pins to the right rep.
            </div>
          )}
        </>
      )}
      {scoreSummary && (
        <div className="mt-6 p-4 bg-neutral-900/40 rounded-xl border border-neutral-800">
          <h3 className="text-lg font-semibold mb-2">Score Summary</h3>
          <div className="mb-2 text-xs flex items-center gap-3 text-neutral-300">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600/15 border border-emerald-600/30 text-emerald-300">
              +{scoreSummary.xp_awarded ?? 0} XP
            </span>
            <span className="opacity-75">Last scored: {fmtTime(lastScoredAt)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Tone: <span className="font-medium">{scoreSummary.scores?.tone ?? '-'}</span></div>
            <div>Objection: <span className="font-medium">{scoreSummary.scores?.objection ?? '-'}</span></div>
            <div>Close: <span className="font-medium">{scoreSummary.scores?.close ?? '-'}</span></div>
            <div className="col-span-2 mt-1 text-emerald-400 font-semibold">
              Total: {scoreSummary.total ?? '-'} — XP +{scoreSummary.xp_awarded ?? 0}
            </div>
          </div>
          <div className="mt-2 text-xs opacity-70">
            Persona: <code>{scoreSummary.personaId || personaId}</code>
          </div>
        </div>
      )}

      {/* Recent Sessions (last 5) */}
      {repId && (
        <details className="mt-6 bg-neutral-900/40 rounded-xl border border-neutral-800 group">
          <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">Recent Sessions</h3>
              {recentLoading && (
                <span className="text-xs text-neutral-400">(loading…)</span>
              )}
              {!recentLoading && !recentErr && recent && recent.length > 0 && (
                <span className="text-xs text-neutral-500">
                  {recent.length} saved
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Link
                href={`/sparring?repId=${repId}`}
                className="text-sm underline text-neutral-400 hover:text-neutral-200"
                onClick={e => e.stopPropagation()}
              >
                Open Sparring
              </Link>
              <span className="text-neutral-500 group-open:rotate-180 transition-transform select-none">
                ▾
              </span>
            </div>
          </summary>
          <div className="px-4 pb-4">
            {recentErr && (
              <div className="text-sm text-amber-300">{recentErr}</div>
            )}
            {!recentLoading && !recentErr && recent && recent.length === 0 && (
              <div className="text-sm text-neutral-400">No sessions yet.</div>
            )}
            {!recentLoading && !recentErr && recent && recent.length > 0 && (
              <ul className="space-y-2 mt-2">
                {recent.map((s) => {
                  const scoreVal =
                    typeof s.total_score === 'number'
                      ? Math.round(Number(s.total_score))
                      : null;
                  const scoreText = scoreVal != null ? String(scoreVal) : '—';
                  const persona = s.persona_id || 'unknown';
                  return (
                    <li
                      key={s.id}
                      className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div
                          className="text-sm text-white/90 capitalize"
                          title={`Persona difficulty: ${persona}`}
                        >
                          Persona:{' '}
                          <span className="font-medium">
                            {persona.replace(/_/g, ' ')}
                          </span>
                          {typeof s.xp_awarded === 'number' && (
                            <span className="ml-2 inline-flex items-center rounded-full bg-emerald-600/15 text-emerald-300 text-xs px-2 py-0.5">
                              +{s.xp_awarded} XP
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-white/50">
                          {new Date(s.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div
                        className="text-sm px-2 py-1 rounded-lg border"
                        style={{
                          borderColor:
                            scoreVal == null
                              ? 'rgba(255,255,255,0.15)'
                              : scoreVal >= 80
                              ? 'rgba(34,197,94,0.4)'
                              : scoreVal >= 60
                              ? 'rgba(245,158,11,0.4)'
                              : 'rgba(239,68,68,0.4)',
                          backgroundColor:
                            scoreVal == null
                              ? 'rgba(255,255,255,0.05)'
                              : scoreVal >= 80
                              ? 'rgba(34,197,94,0.10)'
                              : scoreVal >= 60
                              ? 'rgba(245,158,11,0.10)'
                              : 'rgba(239,68,68,0.10)',
                          color:
                            scoreVal == null
                              ? 'rgba(255,255,255,0.7)'
                              : scoreVal >= 80
                              ? 'rgb(134 239 172)'
                              : scoreVal >= 60
                              ? 'rgb(252 211 77)'
                              : 'rgb(252 165 165)',
                        }}
                      >
                        {scoreText}
                      </div>
                      <Link
                        href={`/sparring?repId=${repId}&sessionId=${s.id}`}
                        className="text-sm text-white/70 hover:underline"
                        onClick={e => e.stopPropagation()}
                      >
                        Open
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </details>
      )}

      <Link href="/crm/overview" className="block mt-4 text-sm underline text-neutral-400">← Back to dashboard</Link>
    </div>
  );
}