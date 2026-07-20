import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AfterVault",
  description: "Manage a deceased person's digital life, securely.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
