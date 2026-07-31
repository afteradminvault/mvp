import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";
import { getBrandConfig } from "@/config/get-brand-config";
import { AfterVaultLandingPage } from "./aftervault-landing";
import { AfterAdminLandingPage } from "./afteradmin-landing";

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect("/estates");
  }

  const brand = await getBrandConfig();
  return brand.brandId === "afteradmin" ? <AfterAdminLandingPage /> : <AfterVaultLandingPage />;
}
