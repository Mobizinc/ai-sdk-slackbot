import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Navigation } from "@/components/Navigation"
import { ClientToaster } from "@/components/ClientToaster"

const inter = Inter({ subsets: ["latin"] })

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: "Admin | AI Slack Bot",
  description: "Administration interface for AI Slack Bot",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-gray-50">
          <Navigation />
          <main className="container mx-auto py-8 px-4">
            {children}
          </main>
          <ClientToaster />
        </div>
      </body>
    </html>
  )
}
