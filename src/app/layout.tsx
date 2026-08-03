// src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";
import { ShellGate } from "@/components/shell/shell-gate";
import { StagingBanner } from "@/components/StagingBanner";
import { headers } from 'next/headers';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Gravix Sales Trainer",
  description: "Gravix AI-powered sales review & training platform.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Read middleware signal: when x-open-route=1, pages should render without any auth redirects.
  const h = await headers();
  const isOpenRoute = h.get("x-open-route") === "1";

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        data-open-route={isOpenRoute ? '1' : undefined}
      >
        {/* Client-side safety: if this page is marked open and we somehow arrived with ?redirect=, strip it to avoid loops */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var b=document.body;if(!b)return;var isOpen=b.dataset.openRoute==='1';if(!isOpen)return;var qs=new URLSearchParams(location.search);var r=qs.get('redirect');if(r && r[0]==='/'){if(location.pathname!==r){location.replace(r);}else{history.replaceState(null,'',r);}}}catch(e){}})();`,
          }}
        />
        {/* Day 271 — staging-only marker (invisible unless NEXT_PUBLIC_APP_ENV=staging). */}
        <StagingBanner />
        <ToastProvider>
          <ShellGate>{children}</ShellGate>
        </ToastProvider>
      </body>
    </html>
  );
}