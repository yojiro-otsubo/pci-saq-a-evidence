"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setUserStatusAction } from "../actions/setUserStatusAction";

export default function UserStatusButton({
  userId,
  status,
}: {
  userId: string;
  status: "active" | "disabled";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const next = status === "active" ? "disabled" : "active";

  return (
    <button
      className="rounded-xl border px-3 py-2 text-sm disabled:opacity-60"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const res = await setUserStatusAction({ userId, status: next });
        setPending(false);
        if (res.ok) router.refresh();
      }}
    >
      {pending ? "..." : status === "active" ? "Disable" : "Enable"}
    </button>
  );
}