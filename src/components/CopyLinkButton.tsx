'use client';

import { useState } from "react";
import { copyText } from "@/lib/copy"; // <-- WAIT! Read note below

type Props = {
  href: string;              // e.g. `/calls/ID?panel=crm`
  label?: string;            // button label
  size?: "sm" | "md";
};

export default function CopyLinkButton({ href, label = "Copy link", size = "sm" }: Props) {
  const [ok, setOk] = useState<null | boolean>(null);

  async function onCopy() {
    const origin = window.location.origin || "";
    const url = origin + href;
    const success = await copyText(url);
    setOk(success);
    setTimeout(() => setOk(null), 1200);
  }

  const cls =
    size === "sm"
      ? "h-8 px-2 text-xs rounded-lg"
      : "h-9 px-3 text-sm rounded-xl";

  return (
    <button
      onClick={onCopy}
      className={`inline-flex items-center gap-1 border hover:shadow transition ${cls}`}
      title={ok === true ? "Copied!" : ok === false ? "Failed" : "Copy share link"}
      aria-live="polite"
    >
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
        <path d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/>
      </svg>
      {ok === true ? "Copied!" : label}
    </button>
  );
}
