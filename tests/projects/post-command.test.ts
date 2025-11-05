import { describe, expect, it, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  slackMessaging: {
    postMessage: vi.fn(),
    postToThread: vi.fn(),
  },
  postProjectOpportunityMock: vi.fn(),
}));

vi.mock("../../lib/services/slack-messaging", () => ({
  getSlackMessagingService: vi.fn(() => mocks.slackMessaging),
}));

vi.mock("../../lib/projects/posting", () => ({
  postProjectOpportunity: mocks.postProjectOpportunityMock,
  ProjectActions: {
    INTEREST: "project_button_interest",
    LEARN_MORE: "project_button_learn_more",
  },
}));

import { handleProjectPostCommand, __resetProjectPostDedupeCache } from "../../lib/projects/project-post-command";
import { refreshProjectCatalog, listActiveProjects } from "../../lib/projects/catalog";

describe("handleProjectPostCommand", () => {
  const { postProjectOpportunityMock } = mocks;

  beforeEach(() => {
    refreshProjectCatalog();
    postProjectOpportunityMock.mockReset();
    __resetProjectPostDedupeCache();
  });

  it("posts the default project when only one active project exists", async () => {
    const activeProjects = listActiveProjects();
    expect(activeProjects.length).toBeGreaterThan(0);

    postProjectOpportunityMock.mockResolvedValue({ ok: true, ts: "123" });

    const result = await handleProjectPostCommand({
      text: "",
      userId: "U123",
      userName: "tester",
      channelId: "C123",
      channelName: "innovation",
    });

    expect(result.status).toBe(200);
    expect(result.body.text).toContain(activeProjects[0]!.name);
    expect(postProjectOpportunityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        project: expect.objectContaining({ id: activeProjects[0]!.id }),
        channelId: expect.any(String),
        requestedBy: "U123",
      }),
    );
  });

  it("rejects unknown project ids", async () => {
    const result = await handleProjectPostCommand({
      text: "unknown-project",
      userId: "U123",
      userName: "tester",
      channelId: "C123",
      channelName: "innovation",
    });

    expect(result.status).toBe(200);
    expect(String(result.body.text)).toContain("could not be found");
    expect(postProjectOpportunityMock).not.toHaveBeenCalled();
  });
});
