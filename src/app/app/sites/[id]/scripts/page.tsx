import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type ScriptRow = {
  id: string;
  src: string | null;
  inline_snippet_hash: string | null;
  integrity: string | null;
  first_seen_at: string;
  last_seen_at: string;
  status: "active" | "removed";
};

type ScriptVersionRow = {
  script_id: string;
  content_hash: string;
  size_bytes: number | null;
  fetched_at: string;
  run_id: string;
};

export default async function ScriptsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ status?: string; q?: string }>;
}) {
  const supabase = await createClient();
  const { id } = await params;
  const sp = (await searchParams) ?? {};


  // サイト存在確認（RLSで見えなければ404）
  const { data: site, error: siteErr } = await supabase
    .from("sites")
    .select("id, domain")
    .eq("id", id)
    .maybeSingle();

  if (siteErr || !site) notFound();

  const statusFilter = (sp.status ?? "all").toLowerCase();
  const q = (sp.q ?? "").trim();

  let scriptsQuery = supabase
    .from("scripts")
    .select("id, src, inline_snippet_hash, integrity, first_seen_at, last_seen_at, status")
    .eq("site_id", site.id)
    .order("last_seen_at", { ascending: false });

  if (statusFilter === "active" || statusFilter === "removed") {
    scriptsQuery = scriptsQuery.eq("status", statusFilter);
  }

  if (q.length > 0) {
    // src 部分一致（inlineは対象外）
    scriptsQuery = scriptsQuery.ilike("src", `%${q}%`);
  }

  const { data: scripts, error: scriptsErr } = await scriptsQuery;

  if (scriptsErr) {
    return (
      <div className="rounded-2xl border p-6 shadow-sm">
        <div className="text-sm">Failed to load scripts.</div>
        <div className="mt-2 text-xs opacity-70 break-all">{scriptsErr.message}</div>
      </div>
    );
  }

  const scriptIds = (scripts ?? []).map((s) => s.id);

  // 最新 version を引く（全件取ってJSでlatest化：MVP向け）
  const { data: versions } =
    scriptIds.length > 0
      ? await supabase
          .from("script_versions")
          .select("script_id, content_hash, size_bytes, fetched_at, run_id")
          .in("script_id", scriptIds)
          .order("fetched_at", { ascending: false })
      : { data: [] as ScriptVersionRow[] };

  const latestByScript = new Map<string, ScriptVersionRow>();
  for (const v of versions ?? []) {
    if (!latestByScript.has(v.script_id)) latestByScript.set(v.script_id, v);
  }

  const exportUrl = `/app/sites/${site.id}/scripts/export?status=${encodeURIComponent(
    statusFilter
  )}&q=${encodeURIComponent(q)}`;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs opacity-70">
          <Link href={`/app/sites/${site.id}`} className="hover:underline">
            {site.domain}
          </Link>{" "}
          / Scripts
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">Scripts inventory</h1>

          <a
            className="rounded-xl border px-3 py-2 text-sm font-medium hover:bg-black/5"
            href={exportUrl}
          >
            Download CSV
          </a>
        </div>
        <p className="mt-1 text-sm opacity-80">
          Latest seen scripts for this site. CSV export is MVP-only.
        </p>
      </div>

      <section className="rounded-2xl border p-6 shadow-sm">
        <form className="flex flex-col gap-2 md:flex-row md:items-end">
          <div className="flex flex-col gap-1">
            <label className="text-sm">Status</label>
            <select
              name="status"
              defaultValue={statusFilter}
              className="rounded-xl border px-3 py-2 text-sm outline-none"
            >
              <option value="all">all</option>
              <option value="active">active</option>
              <option value="removed">removed</option>
            </select>
          </div>

          <div className="flex flex-1 flex-col gap-1">
            <label className="text-sm">Search (src contains)</label>
            <input
              name="q"
              defaultValue={q}
              className="rounded-xl border px-3 py-2 text-sm outline-none"
              placeholder="https://example.com/script.js"
            />
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

        {(scripts?.length ?? 0) === 0 ? (
          <div className="mt-4 text-sm opacity-70">No scripts found.</div>
        ) : (
          <div className="mt-4 space-y-3">
            {((scripts ?? []) as ScriptRow[]).map((s) => {
              const latest = latestByScript.get(s.id) ?? null;
              const key = s.src ?? `inline:${s.inline_snippet_hash ?? "-"}`;

              return (
                <div key={s.id} className="rounded-2xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium break-all">{key}</div>
                      {s.integrity && (
                        <div className="mt-1 text-xs opacity-70 break-all">
                          integrity: {s.integrity}
                        </div>
                      )}
                      <div className="mt-2 text-xs opacity-70">
                        first: {s.first_seen_at} / last: {s.last_seen_at}
                      </div>
                    </div>

                    <div className="text-xs opacity-70">
                      <div>status: {s.status}</div>
                      {latest ? (
                        <>
                          <div className="mt-1 break-all">hash: {latest.content_hash}</div>
                          <div>size: {latest.size_bytes ?? "-"} bytes</div>
                          <div>fetched: {latest.fetched_at}</div>
                        </>
                      ) : (
                        <div className="mt-1 opacity-70">hash: -</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}