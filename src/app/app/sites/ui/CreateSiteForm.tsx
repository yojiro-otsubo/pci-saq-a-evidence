"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSiteAction } from "../actions/createSiteAction";

type UrlRow = { url: string; kind: "checkout" | "cart" | "other" };

export default function CreateSiteForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [domain, setDomain] = useState("");
  const [rulesetVersion, setRulesetVersion] = useState("pci-saq-a-mvp/v1");
  const [urls, setUrls] = useState<UrlRow[]>([
    { url: "", kind: "checkout" },
  ]);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);

        const res = await createSiteAction({
          domain,
          ruleset_version: rulesetVersion,
          urls,
        });

        setPending(false);

        if (!res.ok) {
          setError(res.error ?? "Failed to create site.");
          return;
        }

        setDomain("");
        setUrls([{ url: "", kind: "checkout" }]);
        router.refresh();
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm">Domain</label>
          <input
            className="w-full rounded-xl border px-3 py-2 outline-none"
            placeholder="example.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            required
          />
          <div className="text-xs opacity-70">
            Do not include protocol (https://).
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm">Ruleset version</label>
          <input
            className="w-full rounded-xl border px-3 py-2 outline-none"
            value={rulesetVersion}
            onChange={(e) => setRulesetVersion(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm">Monitored URLs (max 3)</label>
          <button
            type="button"
            className="rounded-xl border px-3 py-1.5 text-sm disabled:opacity-60"
            disabled={pending || urls.length >= 3}
            onClick={() => setUrls((v) => [...v, { url: "", kind: "other" }])}
          >
            Add URL
          </button>
        </div>

        <div className="space-y-2">
          {urls.map((row, idx) => (
            <div key={idx} className="flex flex-col gap-2 md:flex-row">
              <select
                className="rounded-xl border px-3 py-2 text-sm outline-none md:w-40"
                value={row.kind}
                onChange={(e) => {
                  const kind = e.target.value as UrlRow["kind"];
                  setUrls((v) => v.map((r, i) => (i === idx ? { ...r, kind } : r)));
                }}
                disabled={pending}
              >
                <option value="checkout">checkout</option>
                <option value="cart">cart</option>
                <option value="other">other</option>
              </select>

              <input
                className="flex-1 rounded-xl border px-3 py-2 outline-none"
                placeholder="https://example.com/checkout"
                value={row.url}
                onChange={(e) => {
                  const url = e.target.value;
                  setUrls((v) => v.map((r, i) => (i === idx ? { ...r, url } : r)));
                }}
                disabled={pending}
              />

              <button
                type="button"
                className="rounded-xl border px-3 py-2 text-sm disabled:opacity-60 md:w-28"
                disabled={pending || urls.length <= 1}
                onClick={() => setUrls((v) => v.filter((_, i) => i !== idx))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="text-xs opacity-70">
          Empty URL rows will be ignored.
        </div>
      </div>

      {error && <div className="rounded-xl border px-3 py-2 text-sm break-all">{error}</div>}

      <button
        className="w-full rounded-xl border px-3 py-2 text-sm font-medium disabled:opacity-60"
        type="submit"
        disabled={pending}
      >
        {pending ? "Creating..." : "Create site"}
      </button>

      <div className="text-xs opacity-70">
        Note: Creation requires Admin/Owner (enforced by RLS).
      </div>
    </form>
  );
}