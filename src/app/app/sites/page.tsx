import { createClient } from "@/lib/supabase/server";
import CreateSiteForm from "./ui/CreateSiteForm";

export default async function SitesPage() {
  const supabase = await createClient();

  const { data: sites, error } = await supabase
    .from("sites")
    .select("id, domain, classification, ruleset_version, status, created_at, updated_at")
    .order("created_at", { ascending: false });

  // site_urls をまとめて取る（N+1回避）
  const siteIds = (sites ?? []).map((s) => s.id);
  const { data: urls } =
    siteIds.length > 0
      ? await supabase
          .from("site_urls")
          .select("id, site_id, url, kind, created_at")
          .in("site_id", siteIds)
          .order("created_at", { ascending: true })
      : { data: [] as any[] };

  const urlsBySite = new Map<string, { id: string; url: string; kind: string | null }[]>();
  for (const u of urls ?? []) {
    const arr = urlsBySite.get(u.site_id) ?? [];
    arr.push({ id: u.id, url: u.url, kind: u.kind });
    urlsBySite.set(u.site_id, arr);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Sites</h1>
        <p className="mt-1 text-sm opacity-80">
          Register domains and up to 3 monitored URLs (e.g. checkout/cart).
        </p>

        <div className="mt-6">
          <CreateSiteForm />
        </div>
      </section>

      <section className="rounded-2xl border p-6 shadow-sm">
        <h2 className="text-base font-semibold">Registered sites</h2>

        {error ? (
          <div className="mt-4 rounded-xl border p-3 text-sm">
            Failed to load sites: <span className="break-all">{error.message}</span>
          </div>
        ) : (sites?.length ?? 0) === 0 ? (
          <div className="mt-4 text-sm opacity-70">No sites yet.</div>
        ) : (
          <div className="mt-4 space-y-3">
            {sites!.map((s) => {
              const siteUrls = urlsBySite.get(s.id) ?? [];
              return (
                <div key={s.id} className="rounded-2xl border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{s.domain}</div>
                      <div className="mt-1 text-xs opacity-70 break-all">
                        id: {s.id}
                      </div>
                    </div>

                    <div className="text-xs opacity-70">
                      <div>status: {s.status}</div>
                      <div>ruleset: {s.ruleset_version}</div>
                      <div>class: {s.classification ?? "-"}</div>
                    </div>
                  </div>

                  <div className="mt-3 text-sm">
                    <div className="text-xs opacity-60">Monitored URLs</div>
                    {siteUrls.length === 0 ? (
                      <div className="mt-1 text-sm opacity-70">-</div>
                    ) : (
                      <ul className="mt-1 list-disc pl-5">
                        {siteUrls.map((u) => (
                          <li key={u.id} className="break-all">
                            <span className="opacity-70">{u.kind ?? "other"}:</span>{" "}
                            {u.url}
                          </li>
                        ))}
                      </ul>
                    )}
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