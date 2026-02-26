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

function truncate(msg: string, max = 900) {
  return msg.length > max ? msg.slice(0, max) + "…" : msg;
}

function detectErrorCode(e: unknown): string {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();

  if (m.includes("executable doesn't exist") || m.includes("playwright install")) {
    return "PLAYWRIGHT_NOT_INSTALLED";
  }
  if (m.includes("timeout")) return "TIMEOUT";
  if (m.includes("net::") || m.includes("navigation")) return "NAV_ERROR";
  return "TASK_ERROR";
}

export const scanRunProcessor = task({
  id: "scan-run-processor",
  maxDuration: 300, // 5 min（MVP）
  retry: { maxAttempts: 3 },
  run: async (payload: Payload) => {
    const supabase = createAdminClient();

    // run取得
    const { data: run, error: runErr } = await supabase
      .from("scan_runs")
      .select("id, site_id, mode, status, started_at")
      .eq("id", payload.runId)
      .maybeSingle();

    if (runErr || !run) {
      throw new Error(`scan_run not found: ${payload.runId}`);
    }

    // queued/running 以外はスキップ
    if (!["queued", "running"].includes(run.status)) {
      return { ok: true, skipped: true, reason: `status=${run.status}` };
    }

    // 失敗時に確実に落とすためのヘルパー
    const failRun = async (e: unknown) => {
      const code = detectErrorCode(e);
      const message = truncate(e instanceof Error ? e.message : String(e));

      await supabase
        .from("scan_runs")
        .update({
          status: "failed",
          ended_at: new Date().toISOString(),
          error_code: code,
          error_message: message,
        })
        .eq("id", run.id);
    };

    // runningへ更新（started_atが空のときだけ入れる）
    await supabase
      .from("scan_runs")
      .update({
        status: "running",
        started_at: run.started_at ?? new Date().toISOString(),
      })
      .eq("id", run.id);

    let browser: any | null = null;

    try {
      // site + urls
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

      // Playwright開始（launch失敗もcatchで拾う）
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();

      const seen: SeenScript[] = [];

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

        // quick mode: 1URLだけ
        if (run.mode === "quick") break;
      }

      // scripts upsert
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

      for (const s of seen) {
        const key = s.src ? `src:${s.src}` : `inl:${s.inlineHash}`;
        seenKeys.add(key);

        const existing = byKey.get(key);

        if (!existing) {
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

          await supabase.from("diff_events").insert({
            site_id: run.site_id,
            run_id: run.id,
            type: "add",
            severity: "med",
            script_id: ins.id,
            summary: s.src
              ? `Added script: ${s.src}`
              : `Added inline script: ${s.inlineHash}`,
          });

          if (s.contentHash) {
            await supabase.from("script_versions").insert({
              script_id: ins.id,
              run_id: run.id,
              content_hash: s.contentHash,
              size_bytes: s.sizeBytes,
            });
          }
        } else {
          await supabase
            .from("scripts")
            .update({ last_seen_at: now, status: "active", integrity: s.integrity })
            .eq("id", existing.id);

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

      // removed
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

      // success
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
    } catch (e) {
      // ここが今回の重要修正：どんな例外でも必ず failed に落とす
      await failRun(e);
      throw e;
    } finally {
      // 二重close防止
      try {
        if (browser) await browser.close();
      } catch {
        // ignore
      }
    }
  },
});