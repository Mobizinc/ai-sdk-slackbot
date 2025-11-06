"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Database, BarChart3, Settings, Activity, Home, FolderKanban } from "lucide-react"
import { cn } from "@/lib/utils"

const navigation = [
  { name: "Dashboard", href: "/", icon: Home },
  { name: "Projects", href: "/projects", icon: FolderKanban },
  { name: "Business Contexts", href: "/business-contexts", icon: Database },
  { name: "Reports", href: "/reports", icon: BarChart3 },
  { name: "Monitoring", href: "/monitoring", icon: Activity },
  { name: "Configuration", href: "/config", icon: Settings },
]

export function Navigation() {
  const pathname = usePathname()

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <div className="bg-blue-600 text-white w-8 h-8 rounded flex items-center justify-center font-bold">
                AI
              </div>
              <span className="font-semibold text-gray-900">Admin Panel</span>
            </Link>

            <div className="hidden md:flex gap-1">
              {navigation.map((item) => {
                const isActive = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href))
                const Icon = item.icon

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                      isActive
                        ? "bg-gray-100 text-gray-900"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {item.name}
                  </Link>
                )
              })}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">
              {process.env.NODE_ENV === 'production' ? 'Production' : 'Development'}
            </span>
          </div>
        </div>
      </div>
    </nav>
  )
}
