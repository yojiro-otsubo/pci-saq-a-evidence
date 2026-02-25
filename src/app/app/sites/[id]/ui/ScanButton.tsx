"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ScanButton({
  siteId,
  disabled,
}: {
  siteId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <select
          className="rounded-xl border px-3 py-2 text-sm outline-none"
          id="scan-mode"
          disabled={pending || disabled}
          defaultValue="quick"
        >
          <option value="quick">quick</option>
          <option value="full">full</option>
        </select>

        <button
          className="rounded-xl border px-3 py-2 text-sm font-medium disabled:opacity-60"
          disabled={pending || disabled}
          onClick={async () => {
            setPending(true);
            setMsg(null);

            const modeEl = document.getElementById("scan-mode") as HTMLSelectElement | null;
            const mode = (modeEl?.value ?? "quick") as "quick" | "full";

            const res = await fetch(`/app/sites/${siteId}/scan`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ mode }),
            });

            const json = await res.json().catch(() => ({}));

            setPending(false);

            if (!res.ok) {
              setMsg(json?.error ?? `Failed (${res.status}).`);
              return;
            }

            setMsg(`Queued: run_id=${json.run?.id ?? "-"}`);
            router.refresh();
          }}
        >
          {pending ? "Queuing..." : "Rescan"}
        </button>
      </div>

      {disabled && (
        <div className="text-xs opacity-70">
          Rescan requires Owner/Admin.
        </div>
      )}

      {msg && <div className="text-xs opacity-70 break-all">{msg}</div>}
    </div>
  );
}