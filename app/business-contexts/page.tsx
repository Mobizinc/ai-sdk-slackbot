"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BusinessContext } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { ContextCard } from "@/components/business-context/ContextCard";
import { ContextFilters, FilterState } from "@/components/business-context/ContextFilters";
import { ContextStats } from "@/components/business-context/ContextStats";
import { Plus, Loader2 } from "lucide-react";

export default function BusinessContextsPage() {
  const router = useRouter();
  const [contexts, setContexts] = useState<BusinessContext[]>([]);
  const [filteredContexts, setFilteredContexts] = useState<BusinessContext[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchContexts();
  }, []);

  const fetchContexts = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch("/api/business-contexts");

      if (!response.ok) {
        throw new Error(`Failed to fetch contexts: ${response.statusText}`);
      }

      const data = await response.json();
      setContexts(data);
      setFilteredContexts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load contexts");
      console.error("Error fetching contexts:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFilterChange = (filters: FilterState) => {
    let filtered = [...contexts];

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(
        (ctx) =>
          ctx.entityName.toLowerCase().includes(searchLower) ||
          ctx.description?.toLowerCase().includes(searchLower) ||
          ctx.aliases?.some((alias) => alias.toLowerCase().includes(searchLower))
      );
    }

    // Entity type filter
    if (filters.entityType) {
      filtered = filtered.filter((ctx) => ctx.entityType === filters.entityType);
    }

    // Active status filter
    if (filters.isActive !== null) {
      filtered = filtered.filter((ctx) => ctx.isActive === filters.isActive);
    }

    setFilteredContexts(filtered);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <h2 className="text-lg font-semibold text-destructive mb-2">Error Loading Contexts</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
        <Button onClick={fetchContexts}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Business Contexts</h1>
          <p className="text-muted-foreground mt-1">
            Manage business entity information for AI agent context enrichment
          </p>
        </div>
        <Button onClick={() => router.push("/business-contexts/new")}>
          <Plus className="mr-2 h-4 w-4" />
          Add Context
        </Button>
      </div>

      {/* Stats Dashboard */}
      <ContextStats contexts={contexts} />

      {/* Filters */}
      <ContextFilters onFilterChange={handleFilterChange} />

      {/* Context Grid */}
      {filteredContexts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            {contexts.length === 0
              ? "No business contexts found. Create your first one!"
              : "No contexts match your filters."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredContexts.map((context) => (
            <ContextCard
              key={context.id}
              context={context}
              onEdit={() => router.push(`/business-contexts/${context.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
