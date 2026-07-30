import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";
import { MarketingLandingPage } from "./marketing-landing";

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect("/estates");
  }
  return <MarketingLandingPage />;
}
