// src/app/app/sites/[id]/diffs/export/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await ctx.params;

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: site, error: siteErr } = await supabase
    .from("sites")
    .select("id, domain")
    .eq("id", id)
    .maybeSingle();

  if (siteErr || !site) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const sev = (url.searchParams.get("sev") ?? "all").toLowerCase();
  const t = (url.searchParams.get("type") ?? "all").toLowerCase();

  let q = supabase
    .from("diff_events")
    .select("id, type, severity, summary, created_at, run_id, script_id")
    .eq("site_id", site.id)
    .order("created_at", { ascending: false })
    .limit(500); // CSVは少し多め（MVP）

  if (sev === "low" || sev === "med" || sev === "high") q = q.eq("severity", sev);
  if (t === "add" || t === "remove" || t === "change") q = q.eq("type", t);

  const { data: diffs, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const header = [
    "diff_id",
    "type",
    "severity",
    "summary",
    "created_at",
    "run_id",
    "script_id",
  ];

  const rows = (diffs ?? []).map((d) => [
    d.id,
    d.type,
    d.severity,
    d.summary,
    d.created_at,
    d.run_id,
    d.script_id ?? "",
  ]);

  const csv =
    header.join(",") +
    "\n" +
    rows.map((r) => r.map(csvEscape).join(",")).join("\n");

  const filename = `diffs_${site.domain}_${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}