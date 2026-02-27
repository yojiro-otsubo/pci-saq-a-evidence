import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CreateEvidenceForm from "./ui/CreateEvidenceForm";

export default async function EvidencePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  const { id } = await params;

  const { data: site, error: siteErr } = await supabase
    .from("sites")
    .select("id, domain")
    .eq("id", id)
    .maybeSingle();

  if (siteErr || !site) notFound();

  const { data: packs, error: packsErr } = await supabase
    .from("evidence_packs")
    .select("id, from_date, to_date, status, file_url, created_at")
    .eq("site_id", site.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs opacity-70">
          <Link href={`/app/sites/${site.id}`} className="hover:underline">
            {site.domain}
          </Link>{" "}
          / Evidence
        </div>
        <h1 className="mt-1 text-xl font-semibold">Evidence Pack</h1>
        <p className="mt-1 text-sm opacity-80">Generate PDF+ZIP evidence for audits.</p>
      </div>

      <section className="rounded-2xl border p-6 shadow-sm">
        <h2 className="text-base font-semibold">Generate</h2>
        <div className="mt-4">
          <CreateEvidenceForm siteId={site.id} />
        </div>
      </section>

      <section className="rounded-2xl border p-6 shadow-sm">
        <h2 className="text-base font-semibold">History</h2>

        {packsErr ? (
          <div className="mt-4 rounded-xl border p-3 text-sm break-all">
            Failed to load history: {packsErr.message}
          </div>
        ) : (packs?.length ?? 0) === 0 ? (
          <div className="mt-4 text-sm opacity-70">No evidence packs yet.</div>
        ) : (
          <div className="mt-4 space-y-2">
            {packs!.map((p) => (
              <div key={p.id} className="rounded-2xl border p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">
                    {p.from_date} → {p.to_date}
                  </div>
                  <div className="text-xs opacity-70">{p.created_at}</div>
                </div>

                <div className="mt-2 text-xs opacity-70 break-all">pack_id: {p.id}</div>
                <div className="mt-1">status: {p.status}</div>

                <div className="mt-3">
                  {p.status === "success" ? (
                    <a
                      className="inline-flex rounded-xl border px-3 py-2 text-sm font-medium hover:bg-black/5"
                      href={`/evidence/${p.id}/download`}
                    >
                      Download
                    </a>
                  ) : p.status === "failed" ? (
                    <span className="text-sm opacity-70">Failed. Retry by generating again.</span>
                  ) : (
                    <span className="text-sm opacity-70">Generating…</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}