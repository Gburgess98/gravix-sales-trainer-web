'use client';
import { useEffect, useState } from 'react';

export default function HealthPage() {
  const [text, setText] = useState<string>('');
  const [ok, setOk] = useState<boolean | null>(null);
  const [http, setHttp] = useState<number | null>(null);
  const [detail, setDetail] = useState<string>('');
  const [base, setBase] = useState<string>('');
  const [fallback, setFallback] = useState<string>('');
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const r = await fetch(`/api/proxy/v1/health?debug=1&t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
        },
      });
      setHttp(r.status);
      setBase(r.headers.get('x-proxy-api-base') || '');
      setFallback(r.headers.get('x-proxy-api-fallback') || '');

      // Always read as text first; sanitize before parsing
      const raw = await r.text();
      let bodyText = raw;

      // Strip UTF-8 BOM if present
      if (bodyText.charCodeAt(0) === 0xFEFF) bodyText = bodyText.slice(1);

      // If there are stray bytes before JSON, cut to the first JSON token
      const idx = bodyText.search(/[\{\[]/);
      if (idx > 0) bodyText = bodyText.slice(idx);

      setText(bodyText);

      let parsed: any = null;
      try { parsed = JSON.parse(bodyText); } catch {}

      if (!r.ok) {
        setOk(false);
        setDetail('HTTP error from upstream');
      } else if (parsed && (parsed.ok === true || parsed.ok === 'true')) {
        setOk(true);
        setDetail('OK');
      } else {
        setOk(false);
        setDetail('Unexpected response body');
      }
    } catch (e: any) {
      setOk(false);
      setDetail(e?.message || 'Network error');
      setText('');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { run(); }, []);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Proxy Health</h1>
        <button onClick={run} disabled={loading} className="px-3 py-1.5 rounded border">
          {loading ? 'Checking…' : 'Re-run checks'}
        </button>
      </div>

      <div className="rounded border p-3 text-sm">
        <div>
          <span className="opacity-70">API status:</span>{' '}
          {ok == null ? '…' : ok ? 'OK' : 'Unexpected response'}{http ? ` • HTTP ${http}` : ''}
        </div>
        {detail && <div className="opacity-70">{detail}</div>}
        {(base || fallback) && (
          <div className="mt-2 text-xs opacity-70">base={base} {fallback ? `| fallback=${fallback}` : ''}</div>
        )}
      </div>

      <div className="rounded border p-3">
        <div className="text-xs opacity-70 mb-2">Raw body</div>
        <pre className="text-xs overflow-x-auto whitespace-pre-wrap">{text || '—'}</pre>
      </div>
    </div>
  );
}