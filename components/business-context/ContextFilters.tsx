"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, X } from "lucide-react";

interface ContextFiltersProps {
  onFilterChange: (filters: FilterState) => void;
}

export interface FilterState {
  search: string;
  entityType: string | null;
  isActive: boolean | null;
}

export function ContextFilters({ onFilterChange }: ContextFiltersProps) {
  const [search, setSearch] = useState("");
  const [entityType, setEntityType] = useState<string | null>(null);
  const [isActive, setIsActive] = useState<boolean | null>(true);

  const updateFilters = (updates: Partial<FilterState>) => {
    const newFilters = {
      search: updates.search ?? search,
      entityType: updates.entityType !== undefined ? updates.entityType : entityType,
      isActive: updates.isActive !== undefined ? updates.isActive : isActive,
    };
    onFilterChange(newFilters);
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    updateFilters({ search: value });
  };

  const handleEntityTypeChange = (type: string | null) => {
    setEntityType(type);
    updateFilters({ entityType: type });
  };

  const handleActiveChange = (active: boolean | null) => {
    setIsActive(active);
    updateFilters({ isActive: active });
  };

  const clearFilters = () => {
    setSearch("");
    setEntityType(null);
    setIsActive(true);
    onFilterChange({ search: "", entityType: null, isActive: true });
  };

  const hasActiveFilters = search || entityType !== null || isActive !== true;

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, alias, or description..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Filter Tags */}
      <div className="flex flex-wrap gap-2">
        {/* Entity Type Filters */}
        <Button
          variant={entityType === null ? "default" : "outline"}
          size="sm"
          onClick={() => handleEntityTypeChange(null)}
        >
          All Types
        </Button>
        <Button
          variant={entityType === "CLIENT" ? "default" : "outline"}
          size="sm"
          onClick={() => handleEntityTypeChange("CLIENT")}
        >
          Clients
        </Button>
        <Button
          variant={entityType === "VENDOR" ? "default" : "outline"}
          size="sm"
          onClick={() => handleEntityTypeChange("VENDOR")}
        >
          Vendors
        </Button>
        <Button
          variant={entityType === "PLATFORM" ? "default" : "outline"}
          size="sm"
          onClick={() => handleEntityTypeChange("PLATFORM")}
        >
          Platforms
        </Button>

        <div className="w-px h-6 bg-border mx-1" />

        {/* Active Status Filters */}
        <Button
          variant={isActive === true ? "default" : "outline"}
          size="sm"
          onClick={() => handleActiveChange(true)}
        >
          Active
        </Button>
        <Button
          variant={isActive === null ? "default" : "outline"}
          size="sm"
          onClick={() => handleActiveChange(null)}
        >
          All
        </Button>

        {hasActiveFilters && (
          <>
            <div className="w-px h-6 bg-border mx-1" />
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="text-muted-foreground"
            >
              <X className="h-4 w-4 mr-1" />
              Clear Filters
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
