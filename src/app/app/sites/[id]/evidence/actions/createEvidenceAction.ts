"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { tasks } from "@trigger.dev/sdk";

const Schema = z.object({
  siteId: z.string().uuid(),
  from: z.string().min(1),
  to: z.string().min(1),
});

export async function createEvidenceAction(input: unknown): Promise<
  | { ok: true; evidenceId: string }
  | { ok: false; error?: string }
> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const supabase = await createClient();

  // insert evidence_packs（RLSでOwner/Adminのみ通る）
  const { data: pack, error } = await supabase
    .from("evidence_packs")
    .insert({
      site_id: parsed.data.siteId,
      from_date: parsed.data.from,
      to_date: parsed.data.to,
      status: "queued",
      file_url: null,
      created_by: null,
    })
    .select("id")
    .single();

  if (error || !pack) return { ok: false, error: error?.message ?? "Insert failed." };

  // Trigger.dev job kick
  await tasks.trigger("evidence-pack-processor", {
    evidenceId: pack.id,
  });

  return { ok: true, evidenceId: pack.id };
}