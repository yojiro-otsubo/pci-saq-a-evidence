"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inviteUserAction } from "../actions/inviteUserAction";

export default function InviteUserForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "viewer">("viewer");
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setMsg(null);

        const res = await inviteUserAction({ email, role });

        setPending(false);

        if (!res.ok) {
          setMsg(res.error ?? "Invite failed.");
          return;
        }

        setMsg("Invite sent.");
        setEmail("");
        setRole("viewer");
        router.refresh();
      }}
    >
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1 md:col-span-2">
          <label className="text-sm">Email</label>
          <input
            className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            required
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm">Role</label>
          <select
            className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
            value={role}
            onChange={(e) => setRole(e.target.value as any)}
          >
            <option value="viewer">viewer</option>
            <option value="admin">admin</option>
          </select>
        </div>
      </div>

      {msg && <div className="rounded-xl border p-3 text-sm break-all">{msg}</div>}

      <button
        className="w-full rounded-xl border px-3 py-2 text-sm font-medium disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Inviting..." : "Invite by email"}
      </button>

      <div className="text-xs opacity-70">
        This sends a Supabase Auth invite email (MVP).
      </div>
    </form>
  );
}