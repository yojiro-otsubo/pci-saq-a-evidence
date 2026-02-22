import { createClient } from "@/lib/supabase/server";

export default async function AppDashboardPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  // /app/layout.tsx で弾いている前提なので auth.user は基本いる
  const authUserId = auth?.user?.id ?? null;

  // public.users から role/org を取得（RLS前提）
  const { data: profile, error } = authUserId
    ? await supabase
        .from("users")
        .select("id, org_id, role, status, email, created_at")
        .eq("auth_user_id", authUserId)
        .maybeSingle()
    : { data: null, error: null };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm opacity-80">
          MVP status overview (placeholder).
        </p>

        <div className="mt-6 grid gap-3 text-sm">
          <div className="rounded-xl border p-3">
            <div className="text-xs opacity-60">Auth</div>
            <div className="mt-1 break-all">
              user_id: {authUserId ?? "-"}
            </div>
            <div className="break-all">email: {auth?.user?.email ?? "-"}</div>
          </div>

          <div className="rounded-xl border p-3">
            <div className="text-xs opacity-60">App Profile (public.users)</div>

            {error ? (
              <div className="mt-2 text-sm">
                <div className="opacity-70">
                  Failed to load profile from public.users.
                </div>
                <div className="mt-1 break-all text-xs opacity-70">
                  {error.message}
                </div>
                <div className="mt-3 text-xs opacity-70">
                  If this is your first login test, ensure you created:
                  <ul className="mt-1 list-disc pl-5">
                    <li>Auth user in Dashboard</li>
                    <li>public.users row linked by auth_user_id</li>
                  </ul>
                </div>
              </div>
            ) : profile ? (
              <div className="mt-2 space-y-1 break-all">
                <div>user_row_id: {profile.id}</div>
                <div>org_id: {profile.org_id}</div>
                <div>role: {profile.role}</div>
                <div>status: {profile.status}</div>
                <div className="text-xs opacity-70">
                  created_at: {profile.created_at}
                </div>
              </div>
            ) : (
              <div className="mt-2 text-sm opacity-70">
                No profile row found in public.users for this auth user.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border p-6 shadow-sm">
        <h2 className="text-base font-semibold">Next steps</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm opacity-80">
          <li>SCR-03: Sites list + create site</li>
          <li>API: POST /api/sites/:id/scan (on-demand scan)</li>
          <li>JOB: Trigger.dev scheduled scan</li>
          <li>Evidence pack generation flow</li>
        </ul>
      </section>
    </div>
  );
}