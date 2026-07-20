"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { signOutAction } from "@/app/actions/auth";

export function SignOutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await signOutAction();
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="text-sm underline disabled:opacity-50"
    >
      {isPending ? "Signing out..." : "Sign out"}
    </button>
  );
}
