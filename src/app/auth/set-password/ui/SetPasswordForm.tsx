"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SetPasswordForm() {
  const router = useRouter();
  const supabase = createClient();

  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setMsg(null);

        const { error } = await supabase.auth.updateUser({ password });

        setPending(false);

        if (error) {
          setMsg(error.message);
          return;
        }

        router.replace("/app");
        router.refresh();
      }}
    >
      <div className="space-y-1">
        <label className="text-sm">New password</label>
        <input
          className="w-full rounded-xl border px-3 py-2 outline-none"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      {msg && <div className="rounded-xl border p-3 text-sm break-all">{msg}</div>}

      <button
        className="w-full rounded-xl border px-3 py-2 text-sm font-medium disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Saving..." : "Save password"}
      </button>
    </form>
  );
}