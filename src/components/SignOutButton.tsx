"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/entrar");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="flex min-h-11 items-center px-1 text-[15px] text-[var(--color-text-faint)] transition-colors hover:text-[var(--color-text)]"
    >
      Sair
    </button>
  );
}
