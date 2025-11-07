"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface Tab {
  id: string;
  name: string;
  href: string;
}

interface TabNavigationProps {
  tabs: Tab[];
  className?: string;
}

export function TabNavigation({ tabs, className }: TabNavigationProps) {
  const pathname = usePathname();

  return (
    <div className={cn("border-b border-gray-200", className)}>
      <nav className="-mb-px flex space-x-8" aria-label="Tabs">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || pathname?.endsWith(tab.id);

          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={cn(
                "whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors",
                isActive
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              )}
            >
              {tab.name}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
