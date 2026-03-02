"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const Schema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "viewer"]),
});

export async function inviteUserAction(input: unknown): Promise<
  | { ok: true }
  | { ok: false; error?: string }
> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const supabase = await createClient();

  // owner check (RLS前提で自分の行を取得)
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { ok: false, error: "Unauthorized" };

  const { data: me } = await supabase
    .from("users")
    .select("org_id, role, status")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();

  if (!me || me.status !== "active" || me.role !== "owner") {
    return { ok: false, error: "Forbidden" };
  }

  const admin = createAdminClient();

  // Auth invite email
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
    parsed.data.email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    }
  );

  if (inviteErr) return { ok: false, error: inviteErr.message };
  if (!invited?.user?.id) return { ok: false, error: "Invite failed" };

  // public.users create
  const { error: insErr } = await admin
    .from("users")
    .insert({
      auth_user_id: invited.user.id,
      org_id: me.org_id,
      email: parsed.data.email,
      role: parsed.data.role,
      status: "active",
    });

  if (insErr) return { ok: false, error: insErr.message };

  return { ok: true };
}