"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Grid, List, Plus, Loader2 } from "lucide-react";
import { apiClient, type Project, type ProjectStats, type ProjectFilters } from "@/lib/api-client";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type ViewMode = "grid" | "list";

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [filters, setFilters] = useState<ProjectFilters>({});
  const [searchInput, setSearchInput] = useState("");

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiClient.getProjects(filters);
      setProjects(data.projects);
      setStats(data.stats);
    } catch (error) {
      console.error("Failed to load projects:", error);
      toast.error("Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const handleSearch = () => {
    setFilters({ ...filters, search: searchInput || undefined });
  };

  const handleStatusFilter = (status: string) => {
    const currentStatuses = Array.isArray(filters.status)
      ? filters.status
      : filters.status
      ? [filters.status]
      : [];

    const newStatuses = currentStatuses.includes(status)
      ? currentStatuses.filter((s) => s !== status)
      : [...currentStatuses, status];

    setFilters({
      ...filters,
      status: newStatuses.length > 0 ? newStatuses : undefined,
    });
  };

  const isStatusActive = (status: string) => {
    if (!filters.status) return false;
    if (Array.isArray(filters.status)) {
      return filters.status.includes(status);
    }
    return filters.status === status;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Projects</h1>
          <p className="text-gray-500 mt-1">Manage project catalog and configurations</p>
        </div>
        <Button onClick={() => router.push("/projects/create")} className="gap-2">
          <Plus className="w-4 h-4" />
          Create Project
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-500">Total</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <button
            onClick={() => handleStatusFilter("draft")}
            className={`bg-white border rounded-lg p-4 text-left transition-all ${
              isStatusActive("draft")
                ? "border-blue-500 ring-2 ring-blue-100"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <p className="text-sm text-gray-500">Draft</p>
            <p className="text-2xl font-bold text-gray-900">{stats.draft}</p>
          </button>
          <button
            onClick={() => handleStatusFilter("active")}
            className={`bg-white border rounded-lg p-4 text-left transition-all ${
              isStatusActive("active")
                ? "border-blue-500 ring-2 ring-blue-100"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <p className="text-sm text-gray-500">Active</p>
            <p className="text-2xl font-bold text-green-600">{stats.active}</p>
          </button>
          <button
            onClick={() => handleStatusFilter("paused")}
            className={`bg-white border rounded-lg p-4 text-left transition-all ${
              isStatusActive("paused")
                ? "border-blue-500 ring-2 ring-blue-100"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <p className="text-sm text-gray-500">Paused</p>
            <p className="text-2xl font-bold text-yellow-600">{stats.paused}</p>
          </button>
          <button
            onClick={() => handleStatusFilter("completed")}
            className={`bg-white border rounded-lg p-4 text-left transition-all ${
              isStatusActive("completed")
                ? "border-blue-500 ring-2 ring-blue-100"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <p className="text-sm text-gray-500">Completed</p>
            <p className="text-2xl font-bold text-blue-600">{stats.completed}</p>
          </button>
          <button
            onClick={() => handleStatusFilter("archived")}
            className={`bg-white border rounded-lg p-4 text-left transition-all ${
              isStatusActive("archived")
                ? "border-blue-500 ring-2 ring-blue-100"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <p className="text-sm text-gray-500">Archived</p>
            <p className="text-2xl font-bold text-gray-500">{stats.archived}</p>
          </button>
        </div>
      )}

      {/* Filters and View Toggle */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              type="text"
              placeholder="Search projects..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSearch()}
              className="pl-10"
            />
          </div>
          <Button onClick={handleSearch} variant="outline">
            Search
          </Button>
          {filters.search && (
            <Button
              onClick={() => {
                setSearchInput("");
                setFilters({ ...filters, search: undefined });
              }}
              variant="ghost"
              size="sm"
            >
              Clear
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1 border border-gray-200 rounded-md p-1">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-2 rounded ${
              viewMode === "grid"
                ? "bg-gray-100 text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-2 rounded ${
              viewMode === "list"
                ? "bg-gray-100 text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Projects List/Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No projects found</p>
          <Button onClick={() => router.push("/projects/create")} variant="outline">
            Create your first project
          </Button>
        </div>
      ) : (
        <div
          className={
            viewMode === "grid"
              ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              : "space-y-4"
          }
        >
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} view={viewMode} />
          ))}
        </div>
      )}
    </div>
  );
}
