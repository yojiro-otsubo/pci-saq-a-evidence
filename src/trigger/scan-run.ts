// trigger/scan-run.ts
import { task } from "@trigger.dev/sdk";
import { chromium } from "playwright";
import * as cheerio from "cheerio";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

type Payload = {
  runId: string;
};

type SeenScript = {
  src: string | null;
  inlineHash: string | null;
  integrity: string | null;
  contentHash: string | null; // fetched or inline hash
  sizeBytes: number | null;
};

function sha256Hex(input: string | Buffer) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function normalizeUrl(u: string) {
  return u.trim();
}

export const scanRunProcessor = task({
  id: "scan-run-processor",
  maxDuration: 300, // 5 min（MVP）
  retry: { maxAttempts: 3 },
  run: async (payload: Payload, { ctx }) => {
    const supabase = createAdminClient();

    // 1) run を取得（queued前提）
    const { data: run, error: runErr } = await supabase
      .from("scan_runs")
      .select("id, site_id, mode, status")
      .eq("id", payload.runId)
      .maybeSingle();

    if (runErr || !run) {
      throw new Error(`scan_run not found: ${payload.runId}`);
    }

    // 重複実行抑止（queued/running以外なら何もしない）
    if (!["queued", "running"].includes(run.status)) {
      return { ok: true, skipped: true, reason: `status=${run.status}` };
    }

    // 2) running に更新
    await supabase
      .from("scan_runs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", run.id);

    // 3) site + urls 取得
    const { data: site } = await supabase
      .from("sites")
      .select("id, domain")
      .eq("id", run.site_id)
      .maybeSingle();

    const { data: urls } = await supabase
      .from("site_urls")
      .select("url, kind")
      .eq("site_id", run.site_id)
      .order("created_at", { ascending: true });

    const targets = (urls ?? []).map((u) => normalizeUrl(u.url)).filter(Boolean);

    if (!site || targets.length === 0) {
      await supabase
        .from("scan_runs")
        .update({
          status: "failed",
          ended_at: new Date().toISOString(),
          error_code: "NO_TARGETS",
          error_message: "No monitored URLs.",
        })
        .eq("id", run.id);
      return { ok: false, error: "No monitored URLs" };
    }

    // 4) Playwright で収集
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    const seen: SeenScript[] = [];

    try {
      for (const targetUrl of targets) {
        await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 60_000 });
        const html = await page.content();
        const $ = cheerio.load(html);

        const scriptEls = $("script").toArray();

        for (const el of scriptEls) {
          const src = $(el).attr("src") ?? null;
          const integrity = $(el).attr("integrity") ?? null;
          const inlineText = src ? "" : ($(el).text() ?? "");

          if (src) {
            const absSrc = new URL(src, targetUrl).toString();

            // 外部スクリプト取得（失敗しても台帳には残す）
            let bodyBuf: Buffer | null = null;
            try {
              const res = await page.request.get(absSrc, { timeout: 60_000 });
              if (res.ok()) {
                bodyBuf = Buffer.from(await res.body());
              }
            } catch {
              // ignore
            }

            const contentHash = bodyBuf ? sha256Hex(bodyBuf) : null;
            const sizeBytes = bodyBuf ? bodyBuf.length : null;

            seen.push({
              src: absSrc,
              inlineHash: null,
              integrity,
              contentHash,
              sizeBytes,
            });
          } else if (inlineText.trim().length > 0) {
            const inlineHash = sha256Hex(inlineText.trim());
            seen.push({
              src: null,
              inlineHash,
              integrity,
              contentHash: inlineHash,
              sizeBytes: inlineText.length,
            });
          }
        }

        // quick mode: 1URLだけで終了（MVP）
        if (run.mode === "quick") break;
      }
    } catch (e: any) {
      await browser.close();
      await supabase
        .from("scan_runs")
        .update({
          status: "failed",
          ended_at: new Date().toISOString(),
          error_code: "FETCH_ERROR",
          error_message: e?.message ?? "Fetch failed",
        })
        .eq("id", run.id);
      throw e;
    } finally {
      await browser.close();
    }

    // 5) scripts 台帳の upsert 相当（既存照合→insert/update）
    // 既存 scripts を site_id 単位で取得（MVP：件数少ない前提）
    const { data: existingScripts } = await supabase
      .from("scripts")
      .select("id, src, inline_snippet_hash, status")
      .eq("site_id", run.site_id);

    const byKey = new Map<string, { id: string; status: string }>();
    for (const s of existingScripts ?? []) {
      const key = s.src ? `src:${s.src}` : `inl:${s.inline_snippet_hash}`;
      byKey.set(key, { id: s.id, status: s.status });
    }

    const now = new Date().toISOString();
    const seenKeys = new Set<string>();

    // insert/update scripts + insert script_versions
    for (const s of seen) {
      const key = s.src ? `src:${s.src}` : `inl:${s.inlineHash}`;
      seenKeys.add(key);

      const existing = byKey.get(key);

      if (!existing) {
        // insert scripts
        const { data: ins, error: insErr } = await supabase
          .from("scripts")
          .insert({
            site_id: run.site_id,
            src: s.src,
            inline_snippet_hash: s.inlineHash,
            integrity: s.integrity,
            first_seen_at: now,
            last_seen_at: now,
            status: "active",
          })
          .select("id")
          .single();

        if (insErr) throw insErr;

        // diff add
        await supabase.from("diff_events").insert({
          site_id: run.site_id,
          run_id: run.id,
          type: "add",
          severity: "med",
          script_id: ins.id,
          summary: s.src ? `Added script: ${s.src}` : `Added inline script: ${s.inlineHash}`,
        });

        // version（contentHash取れた場合のみ）
        if (s.contentHash) {
          await supabase.from("script_versions").insert({
            script_id: ins.id,
            run_id: run.id,
            content_hash: s.contentHash,
            size_bytes: s.sizeBytes,
          });
        }
      } else {
        // update last_seen + active
        await supabase
          .from("scripts")
          .update({ last_seen_at: now, status: "active", integrity: s.integrity })
          .eq("id", existing.id);

        // change判定：直近のhashと違うか
        if (s.contentHash) {
          const { data: prev } = await supabase
            .from("script_versions")
            .select("content_hash")
            .eq("script_id", existing.id)
            .order("fetched_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!prev || prev.content_hash !== s.contentHash) {
            await supabase.from("script_versions").insert({
              script_id: existing.id,
              run_id: run.id,
              content_hash: s.contentHash,
              size_bytes: s.sizeBytes,
            });

            // diff change（前が存在してhash差分がある場合だけ）
            if (prev) {
              await supabase.from("diff_events").insert({
                site_id: run.site_id,
                run_id: run.id,
                type: "change",
                severity: "high",
                script_id: existing.id,
                summary: s.src
                  ? `Changed script content: ${s.src}`
                  : `Changed inline script: ${s.inlineHash}`,
              });
            }
          }
        }
      }
    }

    // removed判定：既存 active で今回見えてないもの
    for (const s of existingScripts ?? []) {
      const key = s.src ? `src:${s.src}` : `inl:${s.inline_snippet_hash}`;
      if (s.status === "active" && !seenKeys.has(key)) {
        await supabase
          .from("scripts")
          .update({ status: "removed", last_seen_at: now })
          .eq("id", s.id);

        await supabase.from("diff_events").insert({
          site_id: run.site_id,
          run_id: run.id,
          type: "remove",
          severity: "med",
          script_id: s.id,
          summary: s.src ? `Removed script: ${s.src}` : `Removed inline script`,
        });
      }
    }

    // 6) run を success に更新
    await supabase
      .from("scan_runs")
      .update({ status: "success", ended_at: new Date().toISOString() })
      .eq("id", run.id);

    return {
      ok: true,
      runId: run.id,
      siteId: run.site_id,
      seenScripts: seen.length,
    };
  },
});