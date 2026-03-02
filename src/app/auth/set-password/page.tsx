import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SetPasswordForm from "./ui/SetPasswordForm";

export default async function SetPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data?.user) redirect("/login");

  return (
    <main className="min-h-dvh flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Set your password</h1>
        <p className="mt-1 text-sm opacity-80">
          Please set a password to complete your invite.
        </p>

        <div className="mt-6">
          <SetPasswordForm />
        </div>
      </div>
    </main>
  );
}