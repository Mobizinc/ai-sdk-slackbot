"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { GitBranch, ExternalLink, RefreshCw, CheckCircle, XCircle } from "lucide-react";
import { apiClient, type ProjectWithRelations } from "@/lib/api-client";
import { EditableSection } from "@/components/projects/EditableSection";
import { FieldGroup } from "@/components/projects/FieldGroup";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface GithubFormState {
  githubUrl: string
  githubRepo: string
  githubDefaultBranch: string
}

export default function GitHubPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<ProjectWithRelations | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<GithubFormState>({
    githubUrl: "",
    githubRepo: "",
    githubDefaultBranch: "main",
  });

  const loadProject = useCallback(async () => {
    try {
      const data = await apiClient.getProject(projectId);
      setProject(data);
      setFormData({
        githubUrl: data.githubUrl || "",
        githubRepo: data.githubRepo || "",
        githubDefaultBranch: data.githubDefaultBranch || "main",
      });
    } catch (error) {
      console.error("Failed to load project:", error);
      toast.error("Failed to load project");
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId) {
      void loadProject();
    }
  }, [projectId, loadProject]);

  const parseGitHubUrl = useCallback((url: string) => {
    if (!url) return;
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (match) {
      const [, owner, repo] = match;
      setFormData((prev) => ({
        ...prev,
        githubRepo: `${owner}/${repo.replace(/\.git$/, "")}`,
      }));
    }
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      const result = await apiClient.updateProject(projectId, {
        githubUrl: formData.githubUrl || null,
        githubRepo: formData.githubRepo || null,
        githubDefaultBranch: formData.githubDefaultBranch || "main",
      });
      setProject((prev) => (prev ? { ...prev, ...result.project } : prev));
      setEditing(false);
      toast.success("GitHub configuration updated");
    } catch (error) {
      console.error("Failed to update GitHub config:", error);
      toast.error("Failed to update GitHub configuration");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (project) {
      setFormData({
        githubUrl: project.githubUrl || "",
        githubRepo: project.githubRepo || "",
        githubDefaultBranch: project.githubDefaultBranch || "main",
      });
    }
    setEditing(false);
  };

  if (!project) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Repository Info */}
      <EditableSection
        title="Repository Information"
        isEditing={editing}
        onEdit={() => setEditing(true)}
        onCancel={handleCancel}
        onSave={handleSave}
        isSaving={saving}
      >
        {editing ? (
          <div className="space-y-4">
            <FieldGroup label="GitHub URL" description="Full repository URL">
              <Input
                value={formData.githubUrl}
                onChange={(e) => {
                  const value = e.target.value;
                  setFormData((prev) => ({ ...prev, githubUrl: value }));
                  parseGitHubUrl(value);
                }}
                placeholder="https://github.com/owner/repo"
              />
            </FieldGroup>

            <FieldGroup label="Repository" description="Owner/repo format">
              <Input
                value={formData.githubRepo}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, githubRepo: e.target.value }))
                }
                placeholder="owner/repo"
              />
            </FieldGroup>

            <FieldGroup label="Default Branch">
              <Input
                value={formData.githubDefaultBranch}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    githubDefaultBranch: e.target.value,
                  }))
                }
                placeholder="main"
              />
            </FieldGroup>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <span className="text-sm font-medium text-gray-500">Repository URL</span>
              {project.githubUrl ? (
                <div className="flex items-center gap-2 mt-1">
                  <a
                    href={project.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline flex items-center gap-1"
                  >
                    {project.githubUrl}
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              ) : (
                <p className="text-gray-400 italic mt-1">Not configured</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm font-medium text-gray-500">Repository</span>
                <p className="text-gray-900 mt-1 font-mono text-sm">
                  {project.githubRepo || <span className="text-gray-400 italic">Not set</span>}
                </p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">Default Branch</span>
                <p className="text-gray-900 mt-1">
                  {project.githubDefaultBranch || <span className="text-gray-400 italic">Not set</span>}
                </p>
              </div>
            </div>
          </div>
        )}
      </EditableSection>

      {/* Enrichment Status */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Enrichment Configuration</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <GitBranch className="w-5 h-5 text-gray-600" />
              <div>
                <p className="text-sm font-medium text-gray-900">GitHub App Integration</p>
                <p className="text-xs text-gray-500">Automatic repository data enrichment</p>
              </div>
            </div>
            {project.githubUrl ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : (
              <XCircle className="w-5 h-5 text-gray-400" />
            )}
          </div>

          <div className="text-sm text-gray-600">
            <p className="mb-2">When configured, the system can automatically:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Fetch README and CONTRIBUTING files</li>
              <li>Retrieve recent issues and PRs</li>
              <li>Enrich standup context with repository data</li>
              <li>Generate project initiation documents</li>
            </ul>
          </div>

          {project.githubUrl && (
            <div className="pt-4 border-t border-gray-200">
              <Button variant="outline" className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Sync Repository Data
              </Button>
              <p className="text-xs text-gray-500 mt-2">
                Last synced: Never (manual sync not yet implemented)
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Documentation */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-900 mb-2">Need Help?</h4>
        <p className="text-sm text-blue-800 mb-3">
          Learn how to configure GitHub integration for your project.
        </p>
        <a
          href="#"
          className="text-sm text-blue-600 hover:underline flex items-center gap-1"
        >
          View GitHub Integration Docs
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}
