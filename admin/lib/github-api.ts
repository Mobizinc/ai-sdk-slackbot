import { apiClient } from "./api-client"

export interface GithubSummary {
  repo: {
    fullName: string
    defaultBranch: string
    description: string | null
    htmlUrl: string
    pushedAt: string | null
    openIssuesCount: number
    forksCount: number
    stargazersCount: number
  }
  openIssues: {
    items: Array<{
      id: number
      number: number
      title: string
      state: string
      updated_at: string
      html_url: string
    }>
    page: number
    perPage: number
    hasMore: boolean
  }
  openPulls: {
    items: Array<{
      id: number
      number: number
      title: string
      state: string
      draft: boolean
      merged_at: string | null
      updated_at: string
      html_url: string
    }>
    page: number
    perPage: number
    hasMore: boolean
  }
  latestCommit: { sha: string; url: string | null } | null
}

/**
 * Frontend helper that calls the project GitHub summary endpoint.
 * Keeping this in its own module avoids bloating the main api-client.
 */
export async function getProjectGithubSummary(
  projectId: string,
  options?: { issuesPage?: number; prsPage?: number; perPage?: number },
): Promise<GithubSummary> {
  const search = new URLSearchParams();
  if (options?.issuesPage) search.set("issuesPage", options.issuesPage.toString());
  if (options?.prsPage) search.set("prsPage", options.prsPage.toString());
  if (options?.perPage) search.set("perPage", options.perPage.toString());
  const qs = search.toString() ? `?${search.toString()}` : "";
  return apiClient.request(`/api/admin/projects/${projectId}/github${qs}`)
}
