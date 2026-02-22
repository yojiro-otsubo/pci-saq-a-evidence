"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { logoutAction } from "../actions/logoutAction";

export default function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      className="rounded-xl border px-3 py-1.5 text-sm disabled:opacity-60"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await logoutAction();
        setPending(false);
        router.replace("/login");
        router.refresh();
      }}
    >
      {pending ? "Signing out..." : "Sign out"}
    </button>
  );
}