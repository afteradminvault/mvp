import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { getBrandConfig } from "@/config/get-brand-config";
import { BrandProvider } from "@/config/brand-provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });

// Two-Brand Foundation: title/description must be per-brand, which requires
// the async request-aware form rather than a static `export const metadata`.
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandConfig();
  return { title: brand.displayName, description: brand.tagline };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const brand = await getBrandConfig();
  return (
    <html lang="en" data-brand={brand.brandId} className={`${inter.variable} ${fraunces.variable}`}>
      <body>
        <BrandProvider brand={brand}>{children}</BrandProvider>
      </body>
    </html>
  );
}
