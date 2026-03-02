"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function parseHash(hash: string) {
  const h = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(h);
  return {
    access_token: params.get("access_token"),
    refresh_token: params.get("refresh_token"),
    type: params.get("type"),
    error: params.get("error"),
    error_description: params.get("error_description"),
  };
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const supabase = createClient();
  const [msg, setMsg] = useState("Completing authentication...");

  useEffect(() => {
    (async () => {
      const { access_token, refresh_token, error, error_description } =
        parseHash(window.location.hash);

      if (error) {
        setMsg(`${error}: ${error_description ?? ""}`.trim());
        router.replace("/login");
        return;
      }

      if (!access_token || !refresh_token) {
        setMsg("Missing tokens in callback URL.");
        router.replace("/login");
        return;
      }

      const { error: setErr } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });

      if (setErr) {
        setMsg(setErr.message);
        router.replace("/login");
        return;
      }

      router.replace("/auth/set-password");
      router.refresh();
    })();
  }, [router, supabase]);

  return (
    <main className="min-h-dvh flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Signing you in…</h1>
        <p className="mt-2 text-sm opacity-80 break-all">{msg}</p>
      </div>
    </main>
  );
}