"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { apiClient, type ProjectWithRelations } from "@/lib/api-client";
import { ProjectStatusBadge } from "@/components/projects/ProjectStatusBadge";
import { TabNavigation, type Tab } from "@/components/projects/TabNavigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ProjectLayoutClientProps {
  projectId: string;
  children: React.ReactNode;
}

export function ProjectLayoutClient({ projectId, children }: ProjectLayoutClientProps) {
  const router = useRouter();
  const [project, setProject] = useState<ProjectWithRelations | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;

    let isMounted = true;

    const loadProject = async () => {
      try {
        setLoading(true);
        const data = await apiClient.getProject(projectId);
        if (isMounted) {
          setProject(data);
        }
      } catch (error) {
        console.error("Failed to load project:", error);
        toast.error("Failed to load project");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadProject();

    return () => {
      isMounted = false;
    };
  }, [projectId]);

  const tabs: Tab[] = [
    { id: "overview", name: "Overview", href: `/projects/${projectId}` },
    { id: "standups", name: "Stand-ups", href: `/projects/${projectId}/standups` },
    { id: "github", name: "GitHub", href: `/projects/${projectId}/github` },
    { id: "initiation", name: "Initiation & Evaluation", href: `/projects/${projectId}/initiation` },
    { id: "analytics", name: "Analytics", href: `/projects/${projectId}/analytics` },
  ];

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">Project not found</p>
          <Button onClick={() => router.push("/projects")} variant="outline">
            Back to Projects
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Button variant="ghost" onClick={() => router.push("/projects")} className="mb-4 gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to Projects
        </Button>

        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-gray-900">{project.name}</h1>
              <ProjectStatusBadge status={project.status} />
            </div>
            <p className="text-gray-600">{project.summary}</p>
          </div>
        </div>

        <TabNavigation tabs={tabs} />
      </div>

      {children}
    </div>
  );
}
