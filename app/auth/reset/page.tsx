"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/StatusStates";
import { getBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { AUTH_NOT_CONFIGURED_MESSAGE, updatePassword } from "@/lib/services/player-store";

type ResetState = "checking" | "ready" | "missing" | "done";

const inputClass =
  "w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500";

export default function PasswordResetPage() {
  const [state, setState] = useState<ResetState>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setState("missing");
      return;
    }
    const supabase = getBrowserClient();
    if (!supabase) {
      setState("missing");
      return;
    }

    let settled = false;
    const markReady = () => {
      settled = true;
      setState("ready");
    };

    // Il link email arriva con una sessione di recovery: Supabase la
    // rileva dall'URL (detectSessionInUrl) ed emette PASSWORD_RECOVERY.
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) markReady();
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) markReady();
    });

    const timer = setTimeout(() => {
      if (!settled) setState("missing");
    }, 3000);

    return () => {
      clearTimeout(timer);
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    if (password !== confirm) {
      setErrorMessage("Le due password non coincidono.");
      return;
    }
    setBusy(true);
    const res = await updatePassword(password);
    setBusy(false);
    if (!res.ok) {
      setErrorMessage(res.error ?? "Aggiornamento non riuscito.");
      return;
    }
    setState("done");
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold text-white">Nuova password</h1>
        <p className="text-slate-300">Scegli una password che non usi su altri siti.</p>
      </div>

      <Card className="space-y-5">
        <CardHeader
          title="Reimposta password"
          description="Operazione protetta da Supabase Auth"
          icon={<span className="text-2xl">🔑</span>}
        />

        {state === "checking" && <LoadingSpinner text="Verifica del link di recupero…" />}

        {state === "missing" && (
          <div className="space-y-4">
            <p role="alert" className="text-sm text-amber-200">
              {isSupabaseConfigured
                ? "Link di recupero non valido, scaduto o già usato. Richiedine uno nuovo dalla pagina di accesso: i link possono essere usati una sola volta."
                : AUTH_NOT_CONFIGURED_MESSAGE}
            </p>
            <Link href="/auth">
              <Button size="sm">Vai alla pagina di accesso</Button>
            </Link>
          </div>
        )}

        {state === "ready" && (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div>
              <label
                htmlFor="reset-password"
                className="block text-sm font-medium text-slate-200 mb-2"
              >
                Nuova password
              </label>
              <input
                id="reset-password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Almeno 6 caratteri"
                className={inputClass}
              />
            </div>
            <div>
              <label
                htmlFor="reset-confirm"
                className="block text-sm font-medium text-slate-200 mb-2"
              >
                Conferma nuova password
              </label>
              <input
                id="reset-confirm"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Ripeti la password"
                className={inputClass}
              />
            </div>
            {errorMessage && (
              <p role="alert" className="text-sm text-red-300">
                {errorMessage}
              </p>
            )}
            <Button type="submit" className="w-full" isLoading={busy}>
              Salva nuova password
            </Button>
          </form>
        )}

        {state === "done" && (
          <div className="space-y-4">
            <p role="status" className="text-sm text-emerald-300">
              ✅ Password aggiornata. Ora sei connesso con la nuova password.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/profile">
                <Button size="sm">Vai al profilo</Button>
              </Link>
              <Link href="/play">
                <Button size="sm" variant="secondary">
                  Gioca ora
                </Button>
              </Link>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
