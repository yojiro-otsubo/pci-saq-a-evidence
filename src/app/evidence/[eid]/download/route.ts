import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ eid: string }> }
) {
  const supabase = await createClient();
  const { eid } = await ctx.params;


  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: pack, error } = await supabase
    .from("evidence_packs")
    .select("id, status, file_url, site_id")
    .eq("id", eid)
    .maybeSingle();

  if (error || !pack) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (pack.status !== "success" || !pack.file_url) {
    return NextResponse.json({ error: "Not ready" }, { status: 409 });
  }

  // file_url は storage path を保存している想定
  const path = pack.file_url;

  const { data: signed, error: signErr } = await supabase.storage
    .from("evidence-packs")
    .createSignedUrl(path, 60 * 10); // 10分

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: signErr?.message ?? "Sign failed" }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl, { status: 302 });
}