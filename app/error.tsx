"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep a privacy-safe diagnostic in the browser console. Deliberately omit
    // message and stack: they can contain user data or request details. Forward
    // this event to a telemetry provider only after one is explicitly configured.
    console.error("[mondogioco] route_render_error", {
      digest: error.digest ?? null,
    });
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center gap-5 px-4 text-center">
      <p className="text-5xl" aria-hidden="true">
        🌍
      </p>
      <h1 className="text-3xl font-bold text-white">Qualcosa è andato storto</h1>
      <p className="text-slate-300">
        Si è verificato un errore imprevisto. Puoi riprovare senza perdere la pagina.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-slate-950 hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
      >
        Riprova
      </button>
    </main>
  );
}
