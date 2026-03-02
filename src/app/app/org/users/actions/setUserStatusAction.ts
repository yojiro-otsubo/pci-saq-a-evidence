"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Schema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["active", "disabled"]),
});

export async function setUserStatusAction(input: unknown): Promise<
  | { ok: true }
  | { ok: false; error?: string }
> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { ok: false, error: "Unauthorized" };

  // owner check (RLS前提)
  const { data: me } = await supabase
    .from("users")
    .select("role, status")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();

  if (!me || me.status !== "active" || me.role !== "owner") {
    return { ok: false, error: "Forbidden" };
  }

  const { data: target } = await supabase
    .from("users")
    .select("role")
    .eq("id", parsed.data.userId)
    .maybeSingle();

  if (target?.role === "owner") {
    return { ok: false, error: "Owner status cannot be changed." };
  }

  const { error } = await supabase
    .from("users")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.userId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}