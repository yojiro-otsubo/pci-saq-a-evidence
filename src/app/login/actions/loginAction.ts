"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function loginAction(input: unknown): Promise<
  | { ok: true }
  | { ok: false; error?: string }
> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) return { ok: false, error: error.message };

  return { ok: true };
}