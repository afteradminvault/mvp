import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EstateNotFoundError, EstateService } from "@/domain/estates/estate-service";
import { SupabaseEstateRepository } from "@/infrastructure/estates/supabase-estate-repository";
import { DocumentService } from "@/domain/documents/document-service";
import { SupabaseDocumentRepository } from "@/infrastructure/documents/supabase-document-repository";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";
import { DocumentsClient } from "./documents-client";

export default async function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
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

  const documentService = new DocumentService(new SupabaseDocumentRepository(supabase));
  const documents = await documentService.listDocuments(id);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link href={`/estates/${id}`} className="text-sm underline">
        &larr; {estate.displayName}
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">Documents</h1>

      <DocumentsClient estateId={id} estateStatus={estate.status} initialDocuments={documents} />
    </main>
  );
}
