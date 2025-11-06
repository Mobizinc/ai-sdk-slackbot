import { ProjectLayoutClient } from "@/components/projects/ProjectLayoutClient";

interface ProjectLayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

export default async function ProjectLayout({ children, params }: ProjectLayoutProps) {
  const resolvedParams = await params;
  const projectId = Array.isArray(resolvedParams?.id) ? resolvedParams.id[0] : resolvedParams.id;

  return (
    <ProjectLayoutClient projectId={projectId}>
      {children}
    </ProjectLayoutClient>
  );
}
