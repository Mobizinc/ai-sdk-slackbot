import { fetchProjectById } from "../../../../../lib/db/repositories/projects-repository";
import { getGitHubClient } from "../../../../../lib/integrations/github/client";
import { authorizeAdminRequest, getCorsHeaders } from "../../../utils";

export async function OPTIONS(request: Request): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

function parseRepo(repo?: string | null): { owner: string; repo: string } | null {
  if (!repo) return null;
  const parts = repo.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { owner: parts[0], repo: parts[1] };
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const unauthorized = authorizeAdminRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const { id } = params;
    const project = await fetchProjectById(id);

    if (!project) {
      return new Response(
        JSON.stringify({ error: "Project not found", id }),
        { status: 404, headers: getCorsHeaders(request) },
      );
    }

    const parsed = parseRepo(project.githubRepo);
    if (!parsed) {
      return new Response(
        JSON.stringify({ error: "Project is not linked to a GitHub repo" }),
        { status: 400, headers: getCorsHeaders(request) },
      );
    }

    const client = await getGitHubClient();

    const url = new URL(request.url);
    const perPage = Math.min(Math.max(parseInt(url.searchParams.get("perPage") ?? "10", 10) || 10, 1), 50);
    const issuesPage = Math.max(parseInt(url.searchParams.get("issuesPage") ?? "1", 10) || 1, 1);
    const prsPage = Math.max(parseInt(url.searchParams.get("prsPage") ?? "1", 10) || 1, 1);

    const repoResp = await client.repos.get({
      owner: parsed.owner,
      repo: parsed.repo,
    });

    const [openIssuesResp, openPrsResp, branchResp] = await Promise.all([
      client.issues.listForRepo({
        owner: parsed.owner,
        repo: parsed.repo,
        state: "open",
        per_page: perPage,
        page: issuesPage,
        sort: "updated",
      }),
      client.pulls.list({
        owner: parsed.owner,
        repo: parsed.repo,
        state: "open",
        per_page: perPage,
        page: prsPage,
        sort: "updated",
      }),
      client.repos.getBranch({
        owner: parsed.owner,
        repo: parsed.repo,
        branch: project.githubDefaultBranch || repoResp.data.default_branch,
      }).catch(() => null),
    ]);

    const latestCommitSha = branchResp?.data?.commit?.sha ?? null;
    const latestCommitUrl = branchResp?.data?.commit?.html_url ?? null;

    return new Response(
      JSON.stringify({
        repo: {
          fullName: repoResp.data.full_name,
          defaultBranch: repoResp.data.default_branch,
          description: repoResp.data.description,
          htmlUrl: repoResp.data.html_url,
          pushedAt: repoResp.data.pushed_at,
          openIssuesCount: repoResp.data.open_issues_count,
          forksCount: repoResp.data.forks_count,
        stargazersCount: repoResp.data.stargazers_count,
      },
      openIssues: {
        items: openIssuesResp.data.map((issue: typeof openIssuesResp.data[number]) => ({
          id: issue.id,
          number: issue.number,
          title: issue.title,
          state: issue.state,
          labels: issue.labels,
          assignees: issue.assignees,
          updated_at: issue.updated_at,
          html_url: issue.html_url,
        })),
        page: issuesPage,
        perPage,
        hasMore: openIssuesResp.data.length === perPage,
      },
      openPulls: {
        items: openPrsResp.data.map((pr: typeof openPrsResp.data[number]) => ({
          id: pr.id,
          number: pr.number,
          title: pr.title,
          state: pr.state,
          draft: pr.draft,
          merged_at: pr.merged_at,
          updated_at: pr.updated_at,
          html_url: pr.html_url,
        })),
        page: prsPage,
        perPage,
        hasMore: openPrsResp.data.length === perPage,
      },
      latestCommit: latestCommitSha
        ? {
          sha: latestCommitSha,
          url: latestCommitUrl,
        }
          : null,
      }),
      { status: 200, headers: getCorsHeaders(request) },
    );
  } catch (error) {
    console.error("[AdminAPI] Failed to fetch GitHub summary", error);
    return new Response(
      JSON.stringify({
        error: "Failed to fetch GitHub summary",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: getCorsHeaders(request) },
    );
  }
}
