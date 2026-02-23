import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ScanButton from "./ui/ScanButton";

export default async function SiteDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();

  // site
  const { data: site, error: siteErr } = await supabase
    .from("sites")
    .select("id, domain, classification, ruleset_version, status, created_at, updated_at")
    .eq("id", params.id)
    .maybeSingle();

  if (siteErr) {
    // RLSで見えない/その他 → 404相当
    notFound();
  }
  if (!site) notFound();

  // urls
  const { data: urls } = await supabase
    .from("site_urls")
    .select("id, url, kind, created_at")
    .eq("site_id", site.id)
    .order("created_at", { ascending: true });

  // last scan
  const { data: lastRun } = await supabase
    .from("scan_runs")
    .select("id, mode, status, started_at, ended_at, error_code, error_message, created_at")
    .eq("site_id", site.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // recent diffs (latest 10)
  const { data: diffs } = await supabase
    .from("diff_events")
    .select("id, type, severity, summary, created_at, run_id")
    .eq("site_id", site.id)
    .order("created_at", { ascending: false })
    .limit(10);

  // role（取れればUI制御に使う。取れなくてもAPI側でRLSが守る）
  const { data: auth } = await supabase.auth.getUser();
  const authUserId = auth?.user?.id ?? null;

  const { data: profile } = authUserId
    ? await supabase
        .from("users")
        .select("role, status")
        .eq("auth_user_id", authUserId)
        .maybeSingle()
    : { data: null as any };

  const canScan =
    profile?.status === "active" &&
    (profile?.role === "owner" || profile?.role === "admin");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs opacity-70">
            <Link href="/app/sites" className="hover:underline">
              Sites
            </Link>{" "}
            / {site.domain}
          </div>
          <h1 className="mt-1 text-xl font-semibold">{site.domain}</h1>
        </div>

        <ScanButton siteId={site.id} disabled={!canScan} />
      </div>

      <section className="rounded-2xl border p-6 shadow-sm">
        <h2 className="text-base font-semibold">Overview</h2>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <div className="rounded-xl border p-3">
            <div className="text-xs opacity-60">Status</div>
            <div className="mt-1">{site.status}</div>
          </div>

          <div className="rounded-xl border p-3">
            <div className="text-xs opacity-60">Ruleset</div>
            <div className="mt-1 break-all">{site.ruleset_version}</div>
          </div>

          <div className="rounded-xl border p-3">
            <div className="text-xs opacity-60">Classification</div>
            <div className="mt-1">{site.classification ?? "-"}</div>
          </div>

          <div className="rounded-xl border p-3">
            <div className="text-xs opacity-60">Last scan</div>
            <div className="mt-1">
              {lastRun ? (
                <div className="space-y-1">
                  <div>
                    {lastRun.status} ({lastRun.mode})
                  </div>
                  <div className="text-xs opacity-70 break-all">
                    run_id: {lastRun.id}
                  </div>
                  <div className="text-xs opacity-70">
                    ended_at: {lastRun.ended_at ?? "-"}
                  </div>
                  {(lastRun.error_code || lastRun.error_message) && (
                    <div className="text-xs opacity-70 break-all">
                      error: {lastRun.error_code ?? "-"} {lastRun.error_message ?? ""}
                    </div>
                  )}
                </div>
              ) : (
                <span className="opacity-70">No scans yet.</span>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border p-6 shadow-sm">
        <h2 className="text-base font-semibold">Monitored URLs</h2>
        {(!urls || urls.length === 0) ? (
          <div className="mt-3 text-sm opacity-70">-</div>
        ) : (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            {urls.map((u) => (
              <li key={u.id} className="break-all">
                <span className="opacity-70">{u.kind ?? "other"}:</span> {u.url}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border p-6 shadow-sm">
        <h2 className="text-base font-semibold">Recent alerts</h2>
        {(!diffs || diffs.length === 0) ? (
          <div className="mt-3 text-sm opacity-70">No diffs yet.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {diffs.map((d) => (
              <div key={d.id} className="rounded-xl border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">
                    {d.type} / {d.severity}
                  </div>
                  <div className="text-xs opacity-70">{d.created_at}</div>
                </div>
                <div className="mt-1 break-all opacity-90">{d.summary}</div>
                <div className="mt-2 text-xs opacity-70 break-all">
                  run_id: {d.run_id}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}