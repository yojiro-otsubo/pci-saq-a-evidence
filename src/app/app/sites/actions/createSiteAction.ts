"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const UrlRowSchema = z.object({
  url: z.string().trim().min(1).url(),
  kind: z.enum(["checkout", "cart", "other"]),
});

const InputSchema = z.object({
  domain: z
    .string()
    .trim()
    .min(1)
    .transform((v) => v.replace(/^https?:\/\//, "").replace(/\/.*$/, "")), // domain only
  ruleset_version: z.string().trim().min(1),
  urls: z.array(
    z.object({
      url: z.string().trim(),
      kind: z.enum(["checkout", "cart", "other"]),
    })
  ),
});

export async function createSiteAction(input: unknown): Promise<
  | { ok: true; site_id: string }
  | { ok: false; error?: string }
> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const supabase = await createClient();

  // URL rows: 空は捨てる / 最大3 / URLとして正しいものだけ通す
  const cleaned = parsed.data.urls
    .map((r) => ({ url: r.url.trim(), kind: r.kind }))
    .filter((r) => r.url.length > 0);

  if (cleaned.length > 3) return { ok: false, error: "Monitored URLs must be 3 or fewer." };

  const urlParse = z.array(UrlRowSchema).safeParse(cleaned);
  if (!urlParse.success) return { ok: false, error: "Invalid URL format in monitored URLs." };

  // 1) create site
  const { data: site, error: siteErr } = await supabase
    .from("sites")
    .insert({
      domain: parsed.data.domain,
      ruleset_version: parsed.data.ruleset_version,
      status: "active",
      classification: null,
    })
    .select("id")
    .single();

  if (siteErr || !site) return { ok: false, error: siteErr?.message ?? "Failed to create site." };

  // 2) create site_urls (best-effort cleanup on failure)
  if (urlParse.data.length > 0) {
    const { error: urlErr } = await supabase.from("site_urls").insert(
      urlParse.data.map((r) => ({
        site_id: site.id,
        url: r.url,
        kind: r.kind,
      }))
    );

    if (urlErr) {
      // cleanup site to avoid half-created state
      await supabase.from("sites").delete().eq("id", site.id);
      return { ok: false, error: urlErr.message };
    }
  }

  return { ok: true, site_id: site.id };
}