import Link from "next/link";
import { requirePlatformAdminForPage } from "./require-platform-admin-page";

export default async function AdminHomePage() {
  await requirePlatformAdminForPage();

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-2 text-2xl font-semibold">Admin</h1>
      <p className="mb-6 text-sm text-gray-600">
        Internal-only content management for the legal requirements engine (Development Roadmap Milestone 2
        step 1). Not linked from anywhere in the Planner/Executor-facing app.
      </p>
      <ul className="flex flex-col gap-3">
        <li>
          <Link href="/admin/jurisdictions" className="underline">
            Jurisdictions
          </Link>
        </li>
        <li>
          <Link href="/admin/providers" className="underline">
            Providers
          </Link>
        </li>
        <li>
          <Link href="/admin/legal-requirements" className="underline">
            Legal requirements
          </Link>
        </li>
      </ul>
    </main>
  );
}
