import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "./ui/LogoutButton";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data?.user) redirect("/login");

  return (
    <div className="min-h-dvh">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <Link href="/app" className="font-semibold">
              PCI SAQ-A Evidence
            </Link>
            <nav className="text-sm opacity-80">
              <Link href="/app" className="hover:underline">
                Dashboard
              </Link>
              <span className="mx-2 opacity-50">/</span>
              <span className="opacity-60">Sites (coming soon)</span>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs opacity-70">{data.user.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}