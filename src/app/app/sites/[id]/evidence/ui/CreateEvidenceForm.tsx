"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createEvidenceAction } from "../actions/createEvidenceAction";

export default function CreateEvidenceForm({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);

        const res = await createEvidenceAction({ siteId, from, to });

        setPending(false);

        if (!res.ok) {
          setError(res.error ?? "Failed to create evidence pack.");
          return;
        }

        setFrom("");
        setTo("");
        router.refresh();
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm">From (date)</label>
          <input
            className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm">To (date)</label>
          <input
            className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            required
          />
        </div>
      </div>

      {error && <div className="rounded-xl border p-3 text-sm break-all">{error}</div>}

      <button
        className="w-full rounded-xl border px-3 py-2 text-sm font-medium disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Queuing..." : "Generate Evidence Pack"}
      </button>

      <div className="text-xs opacity-70">
        Note: Requires Owner/Admin (enforced by RLS).
      </div>
    </form>
  );
}