// src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import HeaderClient from "@/components/HeaderClient";
import { ToastProvider } from "@/components/Toast";
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Read middleware signal: when x-open-route=1, pages should render without any auth redirects.
  const h = headers();
  const isOpenRoute = h.get('x-open-route') === '1';

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
        <HeaderClient />
        <ToastProvider>
          <div className="max-w-5xl mx-auto px-4">{children}</div>
        </ToastProvider>
      </body>
    </html>
  );
}