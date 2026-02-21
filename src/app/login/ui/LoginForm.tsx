"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginAction } from "../actions/loginAction";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);

        const res = await loginAction({ email, password });

        setPending(false);

        if (!res.ok) {
          setError(res.error ?? "Login failed.");
          return;
        }

        router.replace("/app");
        router.refresh();
      }}
    >
      <div className="space-y-1">
        <label className="text-sm">Email</label>
        <input
          className="w-full rounded-xl border px-3 py-2 outline-none"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm">Password</label>
        <input
          className="w-full rounded-xl border px-3 py-2 outline-none"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      {error && (
        <div className="rounded-xl border px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <button
        className="w-full rounded-xl border px-3 py-2 text-sm font-medium disabled:opacity-60"
        type="submit"
        disabled={pending}
      >
        {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}