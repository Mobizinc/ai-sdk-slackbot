import Link from "next/link";
import { ProjectStatusBadge } from "./ProjectStatusBadge";
import { Calendar, User, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    status: string;
    summary: string;
    mentorName?: string | null;
    githubRepo?: string | null;
    postedDate?: Date | null;
    techStack?: string[];
  };
  view?: "grid" | "list";
}

export function ProjectCard({ project, view = "grid" }: ProjectCardProps) {
  const isGrid = view === "grid";

  return (
    <Link href={`/projects/${project.id}`}>
      <div
        className={cn(
          "bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all cursor-pointer",
          isGrid ? "p-6" : "p-4 flex items-center gap-4"
        )}
      >
        {isGrid ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900 truncate">
                {project.name}
              </h3>
              <ProjectStatusBadge status={project.status} />
            </div>
            <p className="text-sm text-gray-600 line-clamp-2 mb-4">
              {project.summary}
            </p>
            <div className="space-y-2 text-sm text-gray-500">
              {project.mentorName && (
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  <span>{project.mentorName}</span>
                </div>
              )}
              {project.githubRepo && (
                <div className="flex items-center gap-2">
                  <GitBranch className="w-4 h-4" />
                  <span className="truncate">{project.githubRepo}</span>
                </div>
              )}
              {project.postedDate && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>{new Date(project.postedDate).toLocaleDateString()}</span>
                </div>
              )}
            </div>
            {project.techStack && project.techStack.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1">
                {project.techStack.slice(0, 3).map((tech) => (
                  <span
                    key={tech}
                    className="inline-flex items-center px-2 py-1 rounded text-xs bg-gray-100 text-gray-700"
                  >
                    {tech}
                  </span>
                ))}
                {project.techStack.length > 3 && (
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-gray-100 text-gray-500">
                    +{project.techStack.length - 3} more
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="text-base font-semibold text-gray-900 truncate">
                  {project.name}
                </h3>
                <ProjectStatusBadge status={project.status} />
              </div>
              <p className="text-sm text-gray-600 line-clamp-1">
                {project.summary}
              </p>
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-500 shrink-0">
              {project.mentorName && (
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  <span>{project.mentorName}</span>
                </div>
              )}
              {project.postedDate && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>{new Date(project.postedDate).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Link>
  );
}
