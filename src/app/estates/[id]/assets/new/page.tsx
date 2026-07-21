import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";
import { CreateAssetForm } from "./create-asset-form";

export default async function NewAssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-6 text-2xl font-semibold">Add a digital asset</h1>
      <CreateAssetForm estateId={id} />
    </main>
  );
}
