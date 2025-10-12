import { useEffect, useMemo, useRef, useState } from "react";

export function useDebouncedSearch<T>(
  query: string,
  searchFn: (q: string, signal?: AbortSignal) => Promise<T>,
  delay = 250
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const acRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!query?.trim()) {
      setData(null);
      setLoading(false);
      setErr(null);
      acRef.current?.abort();
      return;
    }
    setLoading(true);
    setErr(null);
    const ac = new AbortController();
    acRef.current = ac;
    const id = setTimeout(async () => {
      try {
        const result = await searchFn(query.trim(), ac.signal);
        setData(result);
      } catch (e: any) {
        if (e?.name !== "AbortError") setErr(e?.message || "search failed");
      } finally {
        setLoading(false);
      }
    }, delay);
    return () => {
      clearTimeout(id);
      ac.abort();
    };
  }, [query, delay, searchFn]);

  return { data, loading, err };
}