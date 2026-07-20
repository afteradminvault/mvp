import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  redirect(user ? "/estates" : "/login");
}
