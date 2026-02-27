import { task } from "@trigger.dev/sdk";
import crypto from "crypto";
import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";

type Payload = { evidenceId: string };

function sha256Hex(buf: Buffer) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(header: string[], rows: any[][]) {
  return (
    header.join(",") +
    "\n" +
    rows.map((r) => r.map(csvEscape).join(",")).join("\n")
  );
}

export const evidencePackProcessor = task({
  id: "evidence-pack-processor",
  maxDuration: 300,
  retry: { maxAttempts: 3 },
  run: async (payload: Payload) => {
    const supabase = createAdminClient();

    // 1) evidence pack取得
    const { data: pack, error: packErr } = await supabase
      .from("evidence_packs")
      .select("id, site_id, from_date, to_date, status")
      .eq("id", payload.evidenceId)
      .maybeSingle();

    if (packErr || !pack) throw new Error(`evidence_packs not found: ${payload.evidenceId}`);

    // 2) runningへ
    await supabase
      .from("evidence_packs")
      .update({ status: "running" })
      .eq("id", pack.id);

    try {
      // 3) site取得（org_idが必要）
      const { data: site } = await supabase
        .from("sites")
        .select("id, org_id, domain, classification, ruleset_version, status")
        .eq("id", pack.site_id)
        .maybeSingle();

      if (!site) throw new Error("site not found");

      // 4) 期間抽出（date → timestamptz境界は簡易にUTC日で）
      const fromTs = new Date(`${pack.from_date}T00:00:00.000Z`).toISOString();
      const toTs = new Date(`${pack.to_date}T23:59:59.999Z`).toISOString();

      // scripts inventory（サイト全体）
      const { data: scripts } = await supabase
        .from("scripts")
        .select("id, src, inline_snippet_hash, integrity, first_seen_at, last_seen_at, status")
        .eq("site_id", site.id)
        .order("last_seen_at", { ascending: false });

      // diffs（期間内）
      const { data: diffs } = await supabase
        .from("diff_events")
        .select("id, type, severity, summary, created_at, run_id, script_id")
        .eq("site_id", site.id)
        .gte("created_at", fromTs)
        .lte("created_at", toTs)
        .order("created_at", { ascending: false });

      // scan_runs（期間内）
      const { data: runs } = await supabase
        .from("scan_runs")
        .select("id, mode, status, started_at, ended_at, error_code, error_message, created_at")
        .eq("site_id", site.id)
        .gte("created_at", fromTs)
        .lte("created_at", toTs)
        .order("created_at", { ascending: false });

      // 5) CSV生成
      const scriptsCsv = toCsv(
        ["id","src","inline_snippet_hash","integrity","first_seen_at","last_seen_at","status"],
        (scripts ?? []).map((s) => [
          s.id, s.src ?? "", s.inline_snippet_hash ?? "", s.integrity ?? "",
          s.first_seen_at ?? "", s.last_seen_at ?? "", s.status ?? ""
        ])
      );

      const diffsCsv = toCsv(
        ["id","type","severity","summary","created_at","run_id","script_id"],
        (diffs ?? []).map((d) => [
          d.id, d.type, d.severity, d.summary, d.created_at, d.run_id, d.script_id ?? ""
        ])
      );

      const runsCsv = toCsv(
        ["id","mode","status","started_at","ended_at","error_code","error_message","created_at"],
        (runs ?? []).map((r) => [
          r.id, r.mode, r.status, r.started_at ?? "", r.ended_at ?? "",
          r.error_code ?? "", r.error_message ?? "", r.created_at
        ])
      );

      // 6) summary.pdf（最小構成）
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const page = pdf.addPage();
      const { width, height } = page.getSize();

      const lines = [
        "PCI SAQ-A Evidence Pack (MVP)",
        `Site: ${site.domain}`,
        `Period: ${pack.from_date} to ${pack.to_date}`,
        `Ruleset: ${site.ruleset_version}`,
        `Classification: ${site.classification ?? "-"}`,
        `Runs: ${(runs ?? []).length}, Diffs: ${(diffs ?? []).length}, Scripts: ${(scripts ?? []).length}`,
        "",
        "Note: This pack provides evidence materials only (not a compliance guarantee).",
      ];

      let y = height - 50;
      for (const line of lines) {
        page.drawText(line, { x: 50, y, size: 12, font });
        y -= 18;
      }

      const pdfBytes = await pdf.save();
      const pdfBuf = Buffer.from(pdfBytes);

      // 7) manifest.json（hash含む）
      const files: Array<{ path: string; sha256: string; bytes: number }> = [];

      const addFile = (path: string, buf: Buffer) => {
        files.push({ path, sha256: sha256Hex(buf), bytes: buf.length });
      };

      addFile("summary.pdf", pdfBuf);
      addFile("scripts_inventory.csv", Buffer.from(scriptsCsv, "utf-8"));
      addFile("diff_events.csv", Buffer.from(diffsCsv, "utf-8"));
      addFile("scan_runs.csv", Buffer.from(runsCsv, "utf-8"));

      const manifest = {
        generated_at: new Date().toISOString(),
        site_id: site.id,
        org_id: site.org_id,
        period: { from: pack.from_date, to: pack.to_date },
        files,
      };
      const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 2), "utf-8");
      addFile("manifest.json", manifestBuf);

      // 8) ZIP化
      const zip = new JSZip();
      zip.file("summary.pdf", pdfBuf);
      zip.file("scripts_inventory.csv", scriptsCsv);
      zip.file("diff_events.csv", diffsCsv);
      zip.file("scan_runs.csv", runsCsv);
      zip.file("manifest.json", manifestBuf);

      const zipBuf = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));

      // 9) Storageへ
      const path = `org/${site.org_id}/site/${site.id}/packs/${pack.id}.zip`;

      const { error: upErr } = await supabase.storage
        .from("evidence-packs")
        .upload(path, zipBuf, {
          contentType: "application/zip",
          upsert: true,
        });

      if (upErr) throw upErr;

      // 10) success更新（file_urlにstorage pathを保存）
      await supabase
        .from("evidence_packs")
        .update({ status: "success", file_url: path })
        .eq("id", pack.id);

      return { ok: true, evidenceId: pack.id, path };
    } catch (e: any) {
      await supabase
        .from("evidence_packs")
        .update({
          status: "failed",
          file_url: null,
        })
        .eq("id", payload.evidenceId);

      throw e;
    }
  },
});