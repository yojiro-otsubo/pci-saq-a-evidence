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

  // auth check（/app配下だが直接叩かれる可能性があるので）
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // site existence (RLS)
  const { data: site, error: siteErr } = await supabase
    .from("sites")
    .select("id, domain")
    .eq("id", id)
    .maybeSingle();

  if (siteErr || !site) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const status = (url.searchParams.get("status") ?? "all").toLowerCase();
  const q = (url.searchParams.get("q") ?? "").trim();

  let scriptsQuery = supabase
    .from("scripts")
    .select("id, src, inline_snippet_hash, integrity, first_seen_at, last_seen_at, status")
    .eq("site_id", site.id)
    .order("last_seen_at", { ascending: false });

  if (status === "active" || status === "removed") {
    scriptsQuery = scriptsQuery.eq("status", status);
  }
  if (q.length > 0) {
    scriptsQuery = scriptsQuery.ilike("src", `%${q}%`);
  }

  const { data: scripts, error: scriptsErr } = await scriptsQuery;
  if (scriptsErr) {
    return NextResponse.json({ error: scriptsErr.message }, { status: 500 });
  }

  const scriptIds = (scripts ?? []).map((s) => s.id);

  const { data: versions } =
    scriptIds.length > 0
      ? await supabase
          .from("script_versions")
          .select("script_id, content_hash, size_bytes, fetched_at, run_id")
          .in("script_id", scriptIds)
          .order("fetched_at", { ascending: false })
      : { data: [] as any[] };

  const latestByScript = new Map<string, any>();
  for (const v of versions ?? []) {
    if (!latestByScript.has(v.script_id)) latestByScript.set(v.script_id, v);
  }

  const header = [
    "script_id",
    "key",
    "src",
    "inline_snippet_hash",
    "integrity",
    "status",
    "first_seen_at",
    "last_seen_at",
    "latest_content_hash",
    "latest_size_bytes",
    "latest_fetched_at",
    "latest_run_id",
  ];

  const rows = (scripts ?? []).map((s) => {
    const latest = latestByScript.get(s.id) ?? null;
    const key = s.src ?? `inline:${s.inline_snippet_hash ?? ""}`;

    return [
      s.id,
      key,
      s.src ?? "",
      s.inline_snippet_hash ?? "",
      s.integrity ?? "",
      s.status ?? "",
      s.first_seen_at ?? "",
      s.last_seen_at ?? "",
      latest?.content_hash ?? "",
      latest?.size_bytes ?? "",
      latest?.fetched_at ?? "",
      latest?.run_id ?? "",
    ];
  });

  const csv =
    header.join(",") +
    "\n" +
    rows.map((r) => r.map(csvEscape).join(",")).join("\n");

  const filename = `scripts_${site.domain}_${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}