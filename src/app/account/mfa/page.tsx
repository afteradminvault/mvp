import { redirect } from "next/navigation";
import { AuthService } from "@/domain/auth/auth-service";
import { SupabaseAuthRepository } from "@/infrastructure/auth/supabase-auth-repository";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";
import { MfaManager } from "./mfa-manager";

export default async function MfaSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const service = new AuthService(new SupabaseAuthRepository(supabase));

  const session = await service.getSession();
  if (!session) {
    redirect("/login");
  }

  const factors = await service.listMfaFactors();

  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <h1 className="mb-2 text-2xl font-semibold">Two-factor authentication</h1>
      <p className="mb-6 text-sm text-gray-600">
        Required for the Owner and Executor roles on an estate — see docs/SECURITY_ARCHITECTURE.md
        §3.1. This protects the session in which your browser holds decrypted vault contents in
        memory, not just your login.
      </p>
      <MfaManager initialFactors={factors} />
    </main>
  );
}
