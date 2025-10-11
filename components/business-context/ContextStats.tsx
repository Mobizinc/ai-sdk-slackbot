"use client";

import { BusinessContext } from "@/lib/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, Server, Database } from "lucide-react";

interface ContextStatsProps {
  contexts: BusinessContext[];
}

export function ContextStats({ contexts }: ContextStatsProps) {
  const stats = {
    total: contexts.length,
    clients: contexts.filter((c) => c.entityType === "CLIENT").length,
    vendors: contexts.filter((c) => c.entityType === "VENDOR").length,
    platforms: contexts.filter((c) => c.entityType === "PLATFORM").length,
    active: contexts.filter((c) => c.isActive).length,
    inactive: contexts.filter((c) => !c.isActive).length,
  };

  const statCards = [
    {
      title: "Total Contexts",
      value: stats.total,
      icon: Database,
      color: "text-primary",
    },
    {
      title: "Clients",
      value: stats.clients,
      icon: Building2,
      color: "text-primary",
    },
    {
      title: "Vendors",
      value: stats.vendors,
      icon: Users,
      color: "text-secondary",
    },
    {
      title: "Platforms",
      value: stats.platforms,
      icon: Server,
      color: "text-muted-foreground",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {statCards.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            {stat.title === "Total Contexts" && (
              <p className="text-xs text-muted-foreground mt-1">
                {stats.active} active, {stats.inactive} inactive
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
