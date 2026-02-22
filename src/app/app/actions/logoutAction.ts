"use server";

import { createClient } from "@/lib/supabase/server";

export async function logoutAction(): Promise<{ ok: true }> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return { ok: true };
}