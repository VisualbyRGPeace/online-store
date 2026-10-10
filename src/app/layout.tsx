import type { Metadata } from "next";
import { Footer, Header } from "@/components/header";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site-config";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: SITE_TAGLINE,
  openGraph: { title: SITE_NAME, description: SITE_TAGLINE, type: "website", locale: "vi_VN" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="flex min-h-screen flex-col bg-white text-neutral-900 antialiased">
        <Header />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
