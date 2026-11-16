"use client";

import dynamic from "next/dynamic";

const SimplayzApp = dynamic(() => import("@/App"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-screen items-center justify-center bg-ink-950">
      <div className="panel-flat px-4 py-3">
        <div className="eyebrow">Simplayz</div>
        <div className="num mt-1 text-[11px] text-mist">Booting operations console…</div>
      </div>
    </div>
  ),
});

export default function ClientApp() {
  return (
    <div className="h-full w-full">
      <SimplayzApp />
    </div>
  );
}
