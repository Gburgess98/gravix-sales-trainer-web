'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase-browser';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: typeof window !== 'undefined'
          ? `${window.location.origin}/auth/callback`
          : undefined,
      },
    });
    if (error) setError(error.message);
    else setSent(true);
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl shadow p-6 space-y-4">
        <h1 className="text-xl font-semibold">Sign in</h1>
        {sent ? (
          <p>Check your email for the magic link.</p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <input
              type="email"
              className="w-full border rounded p-2"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button className="w-full rounded p-2 border">Send Magic Link</button>
          </form>
        )}
      </div>
    </main>
  );
}