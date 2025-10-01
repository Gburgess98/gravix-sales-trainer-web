"use client";

export default function Health() {
  async function ping() {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/health`).then(r => r.json());
    alert(`API status: ${res.status}`);
  }
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">Web Health</h1>
      <p className="mt-2">This page will ping the API.</p>
      <button onClick={ping} className="mt-4 rounded-lg border px-4 py-2">
        Ping API
      </button>
    </main>
  );
}
