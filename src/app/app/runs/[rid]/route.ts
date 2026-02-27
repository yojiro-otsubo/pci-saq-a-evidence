import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ rid: string }> }


) {
  const supabase = await createClient();
  const { rid } = await ctx.params;

  // auth required
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runId = rid;

  // run（RLSで自org以外は見えない）
  const { data: run, error: runErr } = await supabase
    .from("scan_runs")
    .select(
      "id, site_id, mode, status, started_at, ended_at, error_code, error_message, created_at"
    )
    .eq("id", runId)
    .maybeSingle();

  if (runErr) {
    return NextResponse.json({ error: runErr.message }, { status: 500 });
  }
  if (!run) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // site情報（任意だがあると便利）
  const { data: site } = await supabase
    .from("sites")
    .select("id, domain, classification, ruleset_version, status")
    .eq("id", run.site_id)
    .maybeSingle();

  // runに紐づく diff_events の件数
  const { count: diffCount } = await supabase
    .from("diff_events")
    .select("id", { count: "exact", head: true })
    .eq("run_id", run.id);

  // runに紐づく script_versions の件数
  const { count: versionCount } = await supabase
    .from("script_versions")
    .select("id", { count: "exact", head: true })
    .eq("run_id", run.id);

  // site全体の scripts 件数（参考）
  const { count: scriptCount } = await supabase
    .from("scripts")
    .select("id", { count: "exact", head: true })
    .eq("site_id", run.site_id);

  // steps は将来用（MVPでは空）
  const steps: Array<{
    name: string;
    status: "ok" | "failed";
    started_at?: string;
    ended_at?: string;
    message?: string;
  }> = [];

  return NextResponse.json(
    {
      ok: true,
      run,
      site: site ?? null,
      stats: {
        scripts_total: scriptCount ?? 0,
        script_versions_in_run: versionCount ?? 0,
        diffs_in_run: diffCount ?? 0,
      },
      steps,
    },
    { status: 200 }
  );
}