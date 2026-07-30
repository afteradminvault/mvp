import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EstateNotFoundError, EstateService } from "@/domain/estates/estate-service";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { VaultPreviewLetterService } from "@/domain/vault-preview-letters/vault-preview-letter-service";
import { SupabaseVaultPreviewLetterRepository } from "@/infrastructure/vault-preview-letters/supabase-vault-preview-letter-repository";
import { SupabaseDigitalAssetRepository } from "@/infrastructure/assets/supabase-asset-repository";
import { SupabaseVaultItemRepository } from "@/infrastructure/vault-items/supabase-vault-item-repository";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";
import { VaultPreviewLetterClient } from "./vault-preview-letter-client";

/**
 * US-3.6 🔒 — a printable letter for a Family member's lawyer, item-type
 * counts only. "Distinct from the consumer UI's warmth" per the design
 * requirement — serif heading, formal layout, no vault-accent styling.
 */
export default async function VaultPreviewLetterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const estateService = new EstateService(new SupabaseEstateRepository(supabase));
  const estate = await estateService.getEstate(id).catch((error: unknown) => {
    if (error instanceof EstateNotFoundError) {
      notFound();
    }
    throw error;
  });

  const letterService = new VaultPreviewLetterService(
    new SupabaseVaultPreviewLetterRepository(supabase),
    new SupabaseDigitalAssetRepository(supabase),
    new SupabaseVaultItemRepository(supabase),
  );
  const letters = await letterService.listLetters(id);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link href={`/estates/${id}`} className="text-sm underline print:hidden">
        &larr; {estate.displayName}
      </Link>
      <h1 className="mt-2 mb-2 text-2xl font-semibold">Vault Preview Letter</h1>
      <p className="mb-6 text-sm text-gray-600 print:hidden">
        Generates a letter listing what <em>types</em> of items are in {estate.displayName}&apos;s vault —
        counts only, never labels, usernames, or values. Safe to hand to a lawyer without exposing anything.
      </p>
      <VaultPreviewLetterClient caseId={id} caseDisplayName={estate.displayName} initialLetters={letters} />
    </main>
  );
}
