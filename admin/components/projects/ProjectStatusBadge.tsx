import { cn } from "@/lib/utils";

interface ProjectStatusBadgeProps {
  status: string;
  className?: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: {
    label: "Draft",
    className: "bg-gray-100 text-gray-800",
  },
  active: {
    label: "Active",
    className: "bg-green-100 text-green-800",
  },
  paused: {
    label: "Paused",
    className: "bg-yellow-100 text-yellow-800",
  },
  completed: {
    label: "Completed",
    className: "bg-blue-100 text-blue-800",
  },
  archived: {
    label: "Archived",
    className: "bg-gray-100 text-gray-500",
  },
};

export function ProjectStatusBadge({ status, className }: ProjectStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.draft;

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
