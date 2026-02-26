// src/app/app/sites/[id]/diffs/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type DiffRow = {
  id: string;
  type: "add" | "remove" | "change";
  severity: "low" | "med" | "high";
  summary: string;
  created_at: string;
  run_id: string;
  script_id: string | null;
};

export default async function DiffsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ sev?: string; type?: string }>;
}) {
  const supabase = await createClient();
  const { id } = await params;
  const sp = (await searchParams) ?? {};

  // site existence (RLS)
  const { data: site, error: siteErr } = await supabase
    .from("sites")
    .select("id, domain")
    .eq("id", id)
    .maybeSingle();

  if (siteErr || !site) notFound();

  const sev = (sp.sev ?? "all").toLowerCase();
  const t = (sp.type ?? "all").toLowerCase();

  let q = supabase
    .from("diff_events")
    .select("id, type, severity, summary, created_at, run_id, script_id")
    .eq("site_id", site.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (sev === "low" || sev === "med" || sev === "high") q = q.eq("severity", sev);
  if (t === "add" || t === "remove" || t === "change") q = q.eq("type", t);

  const { data: diffs, error } = await q;

  const exportUrl = `/app/sites/${site.id}/diffs/export?sev=${encodeURIComponent(
    sev
  )}&type=${encodeURIComponent(t)}`;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs opacity-70">
          <Link href={`/app/sites/${site.id}`} className="hover:underline">
            {site.domain}
          </Link>{" "}
          / Diffs
        </div>

        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">Diffs / Alerts</h1>

          <a
            className="rounded-xl border px-3 py-2 text-sm font-medium hover:bg-black/5"
            href={exportUrl}
          >
            Download CSV
          </a>
        </div>

        <p className="mt-1 text-sm opacity-80">
          Latest changes detected for this site (max 100).
        </p>
      </div>

      <section className="rounded-2xl border p-6 shadow-sm">
        <form className="flex flex-col gap-2 md:flex-row md:items-end">
          <div className="flex flex-col gap-1">
            <label className="text-sm">Severity</label>
            <select
              name="sev"
              defaultValue={sev}
              className="rounded-xl border px-3 py-2 text-sm outline-none"
            >
              <option value="all">all</option>
              <option value="high">high</option>
              <option value="med">med</option>
              <option value="low">low</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm">Type</label>
            <select
              name="type"
              defaultValue={t}
              className="rounded-xl border px-3 py-2 text-sm outline-none"
            >
              <option value="all">all</option>
              <option value="add">add</option>
              <option value="remove">remove</option>
              <option value="change">change</option>
            </select>
          </div>

          <button
            type="submit"
            className="rounded-xl border px-3 py-2 text-sm font-medium hover:bg-black/5"
          >
            Apply
          </button>
        </form>
      </section>

      <section className="rounded-2xl border p-6 shadow-sm">
        <h2 className="text-base font-semibold">List</h2>

        {error ? (
          <div className="mt-4 rounded-xl border p-3 text-sm">
            Failed to load diffs: <span className="break-all">{error.message}</span>
          </div>
        ) : (diffs?.length ?? 0) === 0 ? (
          <div className="mt-4 text-sm opacity-70">No diffs found.</div>
        ) : (
          <div className="mt-4 space-y-2">
            {(diffs as DiffRow[]).map((d) => (
              <div key={d.id} className="rounded-2xl border p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">
                    {d.type} / {d.severity}
                  </div>
                  <div className="text-xs opacity-70">{d.created_at}</div>
                </div>

                <div className="mt-2 break-all">{d.summary}</div>

                <div className="mt-3 grid gap-1 text-xs opacity-70">
                  <div className="break-all">run_id: {d.run_id}</div>
                  {d.script_id && <div className="break-all">script_id: {d.script_id}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}