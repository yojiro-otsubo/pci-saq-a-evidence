import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LoginForm from "./ui/LoginForm";

export default async function LoginPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  // ログイン済みならアプリへ
  if (data?.user) redirect("/app");

  return (
    <main className="min-h-dvh flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border p-6 shadow-sm">
        <h1 className="text-xl font-semibold">PCI SAQ-A Evidence</h1>
        <p className="mt-1 text-sm opacity-80">
          Sign in to continue.
        </p>

        <div className="mt-6">
          <LoginForm />
        </div>

        <p className="mt-6 text-xs opacity-70">
          This is an MVP. Access is limited to invited users.
        </p>
      </div>
    </main>
  );
}