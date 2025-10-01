'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import AuthGate from '@/components/AuthGate';
import { getCall, listPins, createPin, deletePin, setScore } from '@/lib/api';

type Pin = { id: string; call_id: string; user_id: string; t: number; note: string | null; created_at: string };
const fmt = (s:number)=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;

export default function CallPage() {
  const { id } = useParams<{ id: string }>();
  const callId = (id ?? '').toString();

  const audioRef = useRef<HTMLAudioElement|null>(null);
  const [audioUrl, setAudioUrl] = useState<string|null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [t, setT] = useState(0);
  const [duration, setDuration] = useState(0);
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [loadingCall, setLoadingCall] = useState(true);
  const [loadingPins, setLoadingPins] = useState(true);
  const [err, setErr] = useState<string|null>(null);

  // NEW: store call meta (status, score_overall, ai_model, etc.)
  const [callMeta, setCallMeta] = useState<any>(null);

  // NEW: score UI state
  const [scoreVal, setScoreVal] = useState<number>(80);
  const [savingScore, setSavingScore] = useState(false);
  const [scoreMsg, setScoreMsg] = useState<string|null>(null);

  // Load call once
  useEffect(() => {
    if (!callId) return;
    let ok = true;
    (async () => {
      try {
        setLoadingCall(true);
        const res = await getCall(callId);
        if (!ok) return;
        setCallMeta(res.call);
        setAudioUrl(res?.call?.signedAudioUrl ?? null);
        if (typeof res?.call?.score_overall === 'number') setScoreVal(Number(res.call.score_overall));
        setErr(null);
      } catch (e:any) {
        if (!ok) return;
        setErr(e.message ?? 'Failed to load call');
      } finally {
        if (ok) setLoadingCall(false);
      }
    })();
    return () => { ok = false; };
  }, [callId]);

  // NEW: poll until scored (refreshes status + score automatically)
  useEffect(() => {
    if (!callId) return;
    let cancelled = false;
    let timer: any = null;
    async function tick() {
      try {
        const res = await getCall(callId);
        if (cancelled) return;
        setCallMeta(res.call);
        if (typeof res?.call?.score_overall === 'number') setScoreVal(Number(res.call.score_overall));
        // keep polling until status === 'scored'
        if (res.call?.status !== 'scored') timer = setTimeout(tick, 1500);
      } catch {
        // best-effort polling; silently ignore
        timer = setTimeout(tick, 2000);
      }
    }
    // start polling only if not already scored
    if (!callMeta || callMeta.status !== 'scored') tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, callMeta?.status]);

  // Load pins
  async function refreshPins() {
    const res = await listPins(callId);
    setPins((res?.pins ?? []).sort((a:Pin,b:Pin)=>a.t-b.t));
  }
  useEffect(() => { if (callId) { setLoadingPins(true); refreshPins().finally(()=>setLoadingPins(false)); } }, [callId]);

  // Track time + duration
  useEffect(() => {
    const el = audioRef.current; if (!el) return;
    const onTime = () => setT(el.currentTime || 0);
    const onMeta = () => setDuration(Number.isFinite(el.duration) ? el.duration : 0);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('seeked', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    onMeta();
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('seeked', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
    };
  }, [audioRef.current]);

  // Resign URL if it ever expires while the page is open
  useEffect(() => {
    const el = audioRef.current; if (!el) return;
    const onError = async () => {
      try {
        const res = await getCall(callId);
        setAudioUrl(res?.call?.signedAudioUrl ?? null);
      } catch {}
    };
    el.addEventListener('error', onError);
    return () => el.removeEventListener('error', onError);
  }, [callId, audioRef.current]);

  const seek = (sec:number) => { const el = audioRef.current; if (el) el.currentTime = sec; };

  async function onCreatePin() {
    try {
      setCreating(true);
      await createPin({ callId, t: Math.floor(t), note: note || null });
      setNote('');
      await refreshPins();
    } catch (e:any) {
      setErr(e.message ?? 'Failed to create pin');
    } finally {
      setCreating(false);
    }
  }

  async function onDelete(id: string) {
    try {
      await deletePin(id);
      setPins(p => p.filter(x => x.id !== id));
    } catch (e:any) {
      setErr(e.message ?? 'Failed to delete pin');
    }
  }

  // Save manual score
  async function onSaveScore() {
    try {
      setSavingScore(true);
      setScoreMsg(null);
      await setScore(callId, Math.max(0, Math.min(100, Number(scoreVal))));
      setScoreMsg('Saved ✓');
      setTimeout(()=>setScoreMsg(null), 1500);
    } catch (e:any) {
      setScoreMsg(e?.message || 'Failed');
    } finally {
      setSavingScore(false);
    }
  }

  return (
    <AuthGate>
      <main className="py-6 space-y-6">
        <h1 className="text-2xl font-semibold break-all">Call {callId}</h1>

        {/* NEW: live status + AI badge */}
        <div className="text-sm flex items-center gap-3">
          <span className="inline-block rounded-full border px-2 py-0.5">
            {callMeta?.status ?? 'queued'}
          </span>
          {typeof callMeta?.score_overall === 'number' && (
            <span
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5"
              title={callMeta?.ai_model ? `Scored by ${callMeta.ai_model}` : 'AI scored'}
            >
              AI {Math.round(Number(callMeta.score_overall))}
            </span>
          )}
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-medium">Player</h2>
          {loadingCall ? (
            <p className="text-sm opacity-70">Loading call…</p>
          ) : audioUrl ? (
            <>
              <audio ref={audioRef} src={audioUrl} controls className="w-full" />
              {duration > 0 && (
                <div className="relative h-2 bg-neutral-700 rounded w-full">
                  {pins.map(p => {
                    const pct = Math.max(0, Math.min(100, (p.t / duration) * 100));
                    return (
                      <button
                        key={p.id}
                        title={`${fmt(p.t)}${p.note ? ' • ' + p.note : ''}`}
                        className="absolute top-0 h-2 w-[2px] bg-white/90 hover:h-3 hover:-top-0.5 transition"
                        style={{ left: `${pct}%` }}
                        onClick={() => seek(p.t)}
                        aria-label={`Jump to ${fmt(p.t)}`}
                      />
                    );
                  })}
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="text-sm opacity-70">Current: {fmt(t)}</div>
                <div className="ml-auto flex items-center gap-2">
                  <input
                    value={note}
                    onChange={e=>setNote(e.target.value)}
                    placeholder="Optional note…"
                    className="border rounded px-2 py-1 text-sm bg-transparent"
                    style={{minWidth: 220}}
                  />
                  <button onClick={onCreatePin} disabled={creating} className="border rounded px-3 py-1 text-sm">
                    {creating ? 'Pinning…' : `Pin at ${fmt(t)}`}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-red-600">No audio available for this call.</p>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-medium">Pins</h2>
          {loadingPins ? (
            <p className="text-sm opacity-70">Loading pins…</p>
          ) : pins.length === 0 ? (
            <p className="text-sm opacity-70">No pins yet.</p>
          ) : (
            <ul className="divide-y border rounded">
              {pins.map(p => (
                <li key={p.id} className="flex items-center justify-between px-3 py-2">
                  <div className="text-sm">
                    <button onClick={()=>seek(p.t)} className="underline underline-offset-2" title="Jump">
                      {fmt(p.t)}
                    </button>
                    {p.note && <span className="ml-2 opacity-70">— {p.note}</span>}
                  </div>
                  <button onClick={()=>onDelete(p.id)} className="border rounded px-2 py-1 text-xs">Delete</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Manual override (kept) */}
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Score</h2>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              value={Number.isFinite(scoreVal) ? scoreVal : 0}
              onChange={(e)=>setScoreVal(Number(e.target.value))}
              className="border rounded px-2 py-1 text-sm bg-transparent w-24"
            />
            <button onClick={onSaveScore} disabled={savingScore} className="border rounded px-3 py-1 text-sm">
              {savingScore ? 'Saving…' : 'Save Score'}
            </button>
            {scoreMsg && <span className="text-sm opacity-70">{scoreMsg}</span>}
          </div>
          <p className="text-xs opacity-60">Tip: 0–100. Saving updates the card on /recent-calls.</p>
        </section>

        {err && <p className="text-sm text-red-600">{err}</p>}
      </main>
    </AuthGate>
  );
}