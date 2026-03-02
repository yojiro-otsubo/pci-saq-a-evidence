import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import InviteUserForm from "./ui/InviteUserForm";
import UserStatusButton from "./ui/UserStatusButton";

export default async function OrgUsersPage() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  // 自分の role を public.users から取得（RLS前提）
  const { data: me } = await supabase
    .from("users")
    .select("role, status, org_id")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();

  if (!me || me.status !== "active") {
    return (
      <div className="rounded-2xl border p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Users</h1>
        <p className="mt-2 text-sm opacity-80">Access denied.</p>
      </div>
    );
  }

  if (me.role !== "owner") {
    return (
      <div className="rounded-2xl border p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Users</h1>
        <p className="mt-2 text-sm opacity-80">
          Owner permission required.
        </p>
      </div>
    );
  }

  const { data: users, error } = await supabase
    .from("users")
    .select("id, email, role, status, created_at")
    .eq("org_id", me.org_id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Users</h1>
        <p className="mt-1 text-sm opacity-80">
          Invite users to your organization and manage roles/status.
        </p>

        <div className="mt-6">
          <InviteUserForm />
        </div>
      </section>

      <section className="rounded-2xl border p-6 shadow-sm">
        <h2 className="text-base font-semibold">Organization members</h2>

        {error ? (
          <div className="mt-4 rounded-xl border p-3 text-sm break-all">
            Failed to load users: {error.message}
          </div>
        ) : (users?.length ?? 0) === 0 ? (
          <div className="mt-4 text-sm opacity-70">No users.</div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Created</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {users!.map((u) => (
                  <tr key={u.id} className="border-b align-top">
                    <td className="py-2 pr-4 break-all">{u.email}</td>
                    <td className="py-2 pr-4">{u.role}</td>
                    <td className="py-2 pr-4">{u.status}</td>
                    <td className="py-2 pr-4 text-xs opacity-70">
                      {u.created_at}
                    </td>
                    <td className="py-2 pr-4">
                      <UserStatusButton userId={u.id} status={u.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}