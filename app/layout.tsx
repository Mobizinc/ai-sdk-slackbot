import type { Metadata } from "next";
import Image from "next/image";
import { Libre_Franklin } from "next/font/google";
import "./globals.css";

const libreFranklin = Libre_Franklin({
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600"],
  variable: "--font-libre-franklin",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Business Context Manager",
  description: "Manage business contexts for AI agent enrichment",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${libreFranklin.variable} font-sans min-h-screen bg-background antialiased`}>
        <header className="sticky top-0 z-50 border-b border-neutral-200 bg-white/80 backdrop-blur-lg shadow-executive">
          <div className="container mx-auto px-6 py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Image
                  src="/images/mobiz-logo-red.png"
                  alt="Mobiz Business Context Manager"
                  width={120}
                  height={45}
                  className="h-auto max-h-10 w-auto"
                  priority
                />
                <h1 className="text-xl font-semibold">Business Context Manager</h1>
              </div>
              <nav className="flex items-center gap-6">
                <a
                  href="/business-contexts"
                  className="text-sm font-medium hover:text-primary transition-colors"
                >
                  Contexts
                </a>
                <a
                  href="/system-prompt"
                  className="text-sm font-medium hover:text-primary transition-colors"
                >
                  System Prompt
                </a>
              </nav>
            </div>
          </div>
        </header>
        <main className="container mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
