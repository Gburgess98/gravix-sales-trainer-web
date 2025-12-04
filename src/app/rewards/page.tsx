'use client';
import { useEffect, useState } from 'react';
import { getRewards, listActiveBounties } from '@/lib/api';

export default function RewardsPage() {
  const [me, setMe] = useState<string>('11111111-1111-1111-8111-111111111111'); // replace with real user id if you have it
  const [rewards, setRewards] = useState<any>(null);
  const [bounties, setBounties] = useState<any[]>([]);

  useEffect(() => { (async () => setRewards(await getRewards(me)))(); }, [me]);
  useEffect(() => { (async () => { const r = await listActiveBounties(); setBounties(r.items||[]); })(); }, []);

  return (
    <div className="max-w-5xl mx-auto py-10 px-6">
      <h1 className="text-2xl font-semibold">Rewards</h1>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-neutral-800 p-4">
          <div className="font-medium mb-3">Titles (Unlocked)</div>
          <div className="flex flex-wrap gap-2">
            {(rewards?.titles ?? []).map((t: any) => (
              <div key={t.id} className="text-xs rounded-full border px-2 py-1 border-white/10 bg-white/5">
                <span className="mr-1">{t.icon}</span>{t.label}
              </div>
            ))}
            {(!rewards?.titles || rewards.titles.length === 0) && (
              <div className="text-sm text-neutral-400">No titles yet.</div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-neutral-800 p-4">
          <div className="font-medium mb-3">Badges (Earned)</div>
          <div className="flex flex-wrap gap-2">
            {(rewards?.badges ?? []).map((b: any) => (
              <div key={b.id} className="text-xs rounded-full border px-2 py-1 border-white/10 bg-white/5">
                <span className="mr-1">{b.icon}</span>{b.label}
              </div>
            ))}
            {(!rewards?.badges || rewards.badges.length === 0) && (
              <div className="text-sm text-neutral-400">No badges yet.</div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-neutral-800">
        <div className="px-4 py-3 border-b border-neutral-800 font-medium">Active Bounties</div>
        <div className="divide-y divide-neutral-800">
          {bounties.length === 0 ? (
            <div className="px-4 py-4 text-sm text-neutral-400">No active bounties.</div>
          ) : bounties.map((b: any) => (
            <div key={b.id} className="px-4 py-3 flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-sm">
                  <span className="mr-2">{b.title?.icon ?? '🏆'}</span>
                  {b.name}
                </div>
                <div className="text-xs text-neutral-500 truncate">{b.description}</div>
              </div>
              <div className="text-xs text-emerald-300">
                {b.currency ?? 'GBP'} {Number(b.prize ?? 0).toFixed(0)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}