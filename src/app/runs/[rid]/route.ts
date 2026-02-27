import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ rid: string }> }

) {
  const supabase = await createClient();
  const { rid } = await ctx.params;

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runId = rid;
  const url = new URL(req.url);
  const include = (url.searchParams.get("include") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const includeDiffs = include.includes("diffs");

  // run
  const { data: run, error: runErr } = await supabase
    .from("scan_runs")
    .select(
      "id, site_id, mode, status, started_at, ended_at, error_code, error_message, created_at"
    )
    .eq("id", runId)
    .maybeSingle();

  if (runErr) return NextResponse.json({ error: runErr.message }, { status: 500 });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // site（便利なので）
  const { data: site } = await supabase
    .from("sites")
    .select("id, domain, classification, ruleset_version, status")
    .eq("id", run.site_id)
    .maybeSingle();

  // steps（実体）
  const { data: steps, error: stepsErr } = await supabase
    .from("runs_steps")
    .select("id, step, status, started_at, ended_at, message, created_at")
    .eq("run_id", run.id)
    .order("created_at", { ascending: true });

  if (stepsErr) {
    return NextResponse.json({ error: stepsErr.message }, { status: 500 });
  }

  // stats
  const { count: diffCount } = await supabase
    .from("diff_events")
    .select("id", { count: "exact", head: true })
    .eq("run_id", run.id);

  const { count: versionCount } = await supabase
    .from("script_versions")
    .select("id", { count: "exact", head: true })
    .eq("run_id", run.id);

  const { count: scriptCount } = await supabase
    .from("scripts")
    .select("id", { count: "exact", head: true })
    .eq("site_id", run.site_id);

  // include=diffs のときだけ最新20件
  const { data: diffs, error: diffsErr } = includeDiffs
    ? await supabase
        .from("diff_events")
        .select("id, type, severity, summary, created_at, run_id, script_id")
        .eq("run_id", run.id)
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: null as any, error: null as any };

  if (diffsErr) {
    return NextResponse.json({ error: diffsErr.message }, { status: 500 });
  }

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
      steps: steps ?? [],
      diffs: includeDiffs ? diffs ?? [] : undefined,
    },
    { status: 200 }
  );
}