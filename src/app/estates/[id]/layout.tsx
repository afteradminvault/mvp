import type { ReactNode } from "react";
import { VaultSessionProvider } from "./vault-session-context";

export default function EstateLayout({ children }: { children: ReactNode }) {
  return <VaultSessionProvider>{children}</VaultSessionProvider>;
}
