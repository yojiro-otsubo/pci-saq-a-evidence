import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { tasks } from "@trigger.dev/sdk";
import type { scanRunProcessor } from "@/trigger/scan-run";

const BodySchema = z.object({
  mode: z.enum(["full", "quick"]).default("quick"),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: siteId } = await ctx.params;
  const supabase = await createClient();

  // auth required
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // validate body
  const bodyJson = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(bodyJson ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 422 });
  }

  //const siteId = params.id;

  // duplicate run check (queued/running)
  const { data: dup, error: dupErr } = await supabase
    .from("scan_runs")
    .select("id, status")
    .eq("site_id", siteId)
    .in("status", ["queued", "running"])
    .limit(1);

  // RLSでscan_runsが読めないケースでも、後段insertで弾かれるので続行は可能。
  if (!dupErr && dup && dup.length > 0) {
    return NextResponse.json(
      { error: "Scan already in progress", run: dup[0] },
      { status: 409 }
    );
  }

  // create scan_run (queued)
  const { data: run, error: insErr } = await supabase
    .from("scan_runs")
    .insert({
      site_id: siteId,
      mode: parsed.data.mode,
      status: "queued",
      started_at: null,
      ended_at: null,
      error_code: null,
      error_message: null,
    })
    .select("id, site_id, mode, status, created_at")
    .single();

  if (insErr) {
    const msg = insErr.message ?? "Insert failed";

    // typical RLS denial → treat as 403
    if (
      /new row violates row-level security/i.test(msg) ||
      /permission denied/i.test(msg)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // site not found or FK issues
    if (/violates foreign key constraint/i.test(msg)) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Trigger task
  try {
    await tasks.trigger<typeof scanRunProcessor>("scan-run-processor", {
      runId: run.id,
    });
  } catch (e: any) {
    // タスク起動に失敗しても、runはqueuedで残る（後で手動リトライ可能）
    return NextResponse.json(
      { ok: true, run, warning: "Task trigger failed", detail: e?.message ?? String(e) },
      { status: 200 }
    );
  }

  return NextResponse.json({ ok: true, run }, { status: 200 });
}