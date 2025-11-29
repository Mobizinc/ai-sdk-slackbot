"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { GitBranch, ExternalLink, RefreshCw, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { apiClient, type ProjectWithRelations } from "@/lib/api-client";
import { getProjectGithubSummary, type GithubSummary } from "@/lib/github-api";
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
  const [summary, setSummary] = useState<GithubSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [issuesPage, setIssuesPage] = useState(1);
  const [prsPage, setPrsPage] = useState(1);
  const perPage = 10;
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

  const loadGithubSummary = useCallback(async () => {
    if (!project?.githubRepo) {
      setSummary(null);
      return;
    }
    try {
      setLoadingSummary(true);
      const data = await getProjectGithubSummary(projectId, {
        issuesPage,
        prsPage,
        perPage,
      });
      setSummary(data);
    } catch (error) {
      console.error("Failed to load GitHub summary:", error);
      toast.error("Failed to load GitHub data");
    } finally {
      setLoadingSummary(false);
    }
  }, [projectId, project?.githubRepo, issuesPage, prsPage, perPage]);

  useEffect(() => {
    if (projectId) {
      void loadProject();
    }
  }, [projectId, loadProject]);

  useEffect(() => {
    if (project?.githubRepo) {
      void loadGithubSummary();
    }
  }, [project?.githubRepo, loadGithubSummary, issuesPage, prsPage]);

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
      await loadGithubSummary();
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
            <div className="pt-4 border-t border-gray-200 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Live Repo Status</p>
                  <p className="text-base font-semibold text-gray-900">
                    {summary?.repo.fullName || "Not linked"}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={loadGithubSummary} disabled={loadingSummary}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </Button>
              </div>

              {!project.githubRepo && (
                <div className="flex items-center gap-2 text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-md p-3">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">Link a repository to see live GitHub data.</span>
                </div>
              )}

              {project.githubRepo && !summary && !loadingSummary && (
                <div className="text-sm text-gray-500">No GitHub data loaded yet.</div>
              )}

              {summary && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white border border-gray-200 rounded-md p-3">
                    <p className="text-xs text-gray-500 uppercase">Open Issues</p>
                    <p className="text-2xl font-semibold text-gray-900">{summary.repo.openIssuesCount}</p>
                    {summary.openIssues.slice(0, 3).map((issue) => (
                      <a
                        key={issue.id}
                        href={issue.html_url}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-sm text-blue-600 truncate"
                      >
                        #{issue.number} {issue.title}
                      </a>
                    ))}
                  </div>
                  <div className="bg-white border border-gray-200 rounded-md p-3">
                    <p className="text-xs text-gray-500 uppercase">Open PRs</p>
                    <p className="text-2xl font-semibold text-gray-900">{summary.openPulls.length}</p>
                    {summary.openPulls.slice(0, 3).map((pr) => (
                      <a
                        key={pr.id}
                        href={pr.html_url}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-sm text-blue-600 truncate"
                      >
                        #{pr.number} {pr.title} {pr.draft ? "(draft)" : ""}
                      </a>
                    ))}
                  </div>
                  <div className="bg-white border border-gray-200 rounded-md p-3">
                    <p className="text-xs text-gray-500 uppercase">Latest Commit</p>
                    {summary.latestCommit ? (
                      <a
                        href={summary.latestCommit.url ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-blue-600 break-all"
                      >
                        {summary.latestCommit.sha.substring(0, 12)}
                      </a>
                    ) : (
                      <p className="text-sm text-gray-500">No commit info</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      Branch: {summary.repo.defaultBranch}
                    </p>
                    <p className="text-xs text-gray-500">
                      Updated: {summary.repo.pushedAt ? new Date(summary.repo.pushedAt).toLocaleString() : "n/a"}
                    </p>
                  </div>
                </div>
              )}
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
              {summary && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white border border-gray-200 rounded-md p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-500 uppercase">Open Issues</p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <button
                          className="underline disabled:text-gray-300"
                          onClick={() => setIssuesPage((p) => Math.max(1, p - 1))}
                          disabled={issuesPage <= 1 || loadingSummary}
                        >
                          Prev
                        </button>
                        <span>{issuesPage}</span>
                        <button
                          className="underline disabled:text-gray-300"
                          onClick={() => setIssuesPage((p) => (summary.openIssues.hasMore ? p + 1 : p))}
                          disabled={loadingSummary || !summary.openIssues.hasMore}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                    <p className="text-2xl font-semibold text-gray-900 mt-1">{summary.repo.openIssuesCount}</p>
                    {summary.openIssues.items.slice(0, 3).map((issue) => (
                      <a
                        key={issue.id}
                        href={issue.html_url}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-sm text-blue-600 truncate"
                      >
                        #{issue.number} {issue.title}
                      </a>
                    ))}
                  </div>
                  <div className="bg-white border border-gray-200 rounded-md p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-500 uppercase">Open PRs</p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <button
                          className="underline disabled:text-gray-300"
                          onClick={() => setPrsPage((p) => Math.max(1, p - 1))}
                          disabled={prsPage <= 1 || loadingSummary}
                        >
                          Prev
                        </button>
                        <span>{prsPage}</span>
                        <button
                          className="underline disabled:text-gray-300"
                          onClick={() => setPrsPage((p) => (summary.openPulls.hasMore ? p + 1 : p))}
                          disabled={loadingSummary || !summary.openPulls.hasMore}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                    <p className="text-2xl font-semibold text-gray-900 mt-1">{summary.openPulls.items.length}</p>
                    {summary.openPulls.items.slice(0, 3).map((pr) => (
                      <a
                        key={pr.id}
                        href={pr.html_url}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-sm text-blue-600 truncate"
                      >
                        #{pr.number} {pr.title} {pr.draft ? "(draft)" : ""}
                      </a>
                    ))}
                  </div>
                  <div className="bg-white border border-gray-200 rounded-md p-3">
                    <p className="text-xs text-gray-500 uppercase">Latest Commit</p>
                    {summary.latestCommit ? (
                      <a
                        href={summary.latestCommit.url ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-blue-600 break-all"
                      >
                        {summary.latestCommit.sha.substring(0, 12)}
                      </a>
                    ) : (
                      <p className="text-sm text-gray-500">No commit info</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      Branch: {summary.repo.defaultBranch}
                    </p>
                    <p className="text-xs text-gray-500">
                      Updated: {summary.repo.pushedAt ? new Date(summary.repo.pushedAt).toLocaleString() : "n/a"}
                    </p>
                  </div>
                </div>
              )}
