import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAgentTools } from "../../../lib/agent/tools/factory";
import type { ChatMessage } from "../../../lib/agent/types";

vi.mock("../../../lib/tools/servicenow");

describe("searchCMDB Tool", () => {
  let mockServiceNowClient: any;
  let tools: any;
  const mockUpdateStatus = vi.fn();

  const createMessages = (): ChatMessage[] => [
    { role: "user", content: "Need CMDB context" },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();

    const serviceNow = await import("../../../lib/tools/servicenow");
    mockServiceNowClient = serviceNow.serviceNowClient as any;

    mockServiceNowClient.isConfigured = vi.fn().mockReturnValue(true);
    mockServiceNowClient.searchConfigurationItems = vi.fn().mockResolvedValue([]);
    mockServiceNowClient.getCIRelationships = vi.fn().mockResolvedValue([]);
    mockServiceNowClient.createConfigurationItem = vi.fn().mockResolvedValue({
      sys_id: "ci123",
      name: "ALTUSHOUHOSP",
      sys_class_name: "cmdb_ci_server",
      ip_addresses: ["172.99.109.10"],
      environment: "production",
      location: "Houston",
      status: "1",
      description: "Altus Houston hospital system",
      url: "https://example.service-now.com/cmdb_ci.do?sys_id=ci123",
    });
    mockServiceNowClient.createCIRelationship = vi.fn().mockResolvedValue({
      sys_id: "rel123",
    });

    tools = createAgentTools({
      messages: createMessages(),
      caseNumbers: [],
      updateStatus: mockUpdateStatus,
      options: { channelId: "C123" },
    });
  });

  it("returns error when ServiceNow is not configured", async () => {
    mockServiceNowClient.isConfigured.mockReturnValue(false);

    const result = await tools.searchCMDB.execute({
      ciName: "ALTUSHOUHOSP",
    });

    expect(result).toMatchObject({
      error: expect.stringContaining("ServiceNow CMDB is not configured"),
    });
    expect(mockServiceNowClient.searchConfigurationItems).not.toHaveBeenCalled();
  });

  it("throws when no filters are provided", async () => {
    await expect(tools.searchCMDB.execute({})).rejects.toThrow(
      /At least one filter is required/i,
    );
    expect(mockServiceNowClient.searchConfigurationItems).not.toHaveBeenCalled();
  });

  it("queries ServiceNow with the provided filters and formats results", async () => {
    const mockItems = [
      {
        sys_id: "ci123",
        name: "ALTUSHOUHOSP",
        sys_class_name: "cmdb_ci_server",
        ip_addresses: ["172.99.109.10"],
        environment: "production",
        status: "Operational",
        owner_group: "Hospitals",
        support_group: "Hospitals",
        location: "Houston",
        fqdn: "altus-hou.cr.internal",
        host_name: "ALTUSHOUHOSP",
        description: "Altus Houston hospital system",
        url: "https://example.service-now.com/cmdb_ci.do?sys_id=ci123",
      },
    ];

    mockServiceNowClient.searchConfigurationItems.mockResolvedValue(mockItems);

    const result = await tools.searchCMDB.execute({
      ciName: "ALTUS",
      companyName: "Altus",
      limit: 5,
    });

    expect(mockServiceNowClient.searchConfigurationItems).toHaveBeenCalledWith(
      {
        name: "ALTUS",
        ipAddress: undefined,
        sysId: undefined,
        className: undefined,
        company: "Altus",
        location: undefined,
        ownerGroup: undefined,
        environment: undefined,
        operationalStatus: undefined,
        limit: 5,
      },
      expect.any(Object),
    );

    expect(result).toMatchObject({
      formattedItems: expect.stringContaining("ALTUSHOUHOSP"),
      items: mockItems,
      total: 1,
    });
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      "is querying ServiceNow CMDB for infrastructure...",
    );
  });

  it("defaults limit to 10 when not provided", async () => {
    await tools.searchCMDB.execute({ ipAddress: "172.99.109.10" });

    expect(mockServiceNowClient.searchConfigurationItems).toHaveBeenCalledWith(
      expect.objectContaining({
        ipAddress: "172.99.109.10",
        limit: 10,
      }),
      expect.any(Object),
    );
  });

  it("fetches relationships when includeRelationships is true", async () => {
    const mockItems = [
      {
        sys_id: "ci123",
        name: "ALTUSHOUHOSP",
        sys_class_name: "cmdb_ci_server",
        ip_addresses: ["172.99.109.10"],
        environment: "production",
        status: "Operational",
        location: "Houston",
        description: "Altus Houston hospital system",
        url: "https://example.service-now.com/cmdb_ci.do?sys_id=ci123",
      },
    ];

    mockServiceNowClient.searchConfigurationItems.mockResolvedValue(mockItems);
    mockServiceNowClient.getCIRelationships.mockResolvedValue([
      {
        sys_id: "ci999",
        name: "ALTUS-DB",
        sys_class_name: "cmdb_ci_server",
        ip_addresses: [],
        environment: "production",
        status: "Operational",
        location: "Houston",
        description: "Database tier",
        url: "https://example.service-now.com/cmdb_ci.do?sys_id=ci999",
      },
    ]);

    const result = await tools.searchCMDB.execute({
      ciName: "ALTUS",
      includeRelationships: true,
      relationshipSampleSize: 1,
    });

    expect(mockServiceNowClient.getCIRelationships).toHaveBeenCalledWith(
      expect.objectContaining({ ciSysId: "ci123" }),
      expect.any(Object),
    );
    expect(result.formattedItems).toContain("Relationships");
  });

  describe("createConfigurationItem tool", () => {
    it("returns error when ServiceNow is not configured", async () => {
      mockServiceNowClient.isConfigured.mockReturnValue(false);

      const result = await tools.createConfigurationItem.execute({
        className: "cmdb_ci_server",
        name: "ALTUS-NEW-SERVER",
      });

      expect(result).toMatchObject({
        error: expect.stringContaining("ServiceNow CMDB is not configured"),
      });
      expect(mockServiceNowClient.createConfigurationItem).not.toHaveBeenCalled();
    });

    it("creates CI and optional relationship", async () => {
      const result = await tools.createConfigurationItem.execute({
        className: "cmdb_ci_server",
        name: "ALTUS-NEW-SERVER",
        shortDescription: "New Altus workload",
        ipAddress: "172.16.2.80",
        environment: "production",
        parentSysId: "parent123",
        relationshipType: "Runs on::Runs",
      });

      expect(mockServiceNowClient.createConfigurationItem).toHaveBeenCalledWith(
        expect.objectContaining({
          className: "cmdb_ci_server",
          name: "ALTUS-NEW-SERVER",
          shortDescription: "New Altus workload",
          ipAddress: "172.16.2.80",
          environment: "production",
        }),
        expect.any(Object),
      );

      expect(mockServiceNowClient.createCIRelationship).toHaveBeenCalledWith(
        {
          parentSysId: "parent123",
          childSysId: "ci123",
          relationshipType: "Runs on::Runs",
        },
        expect.any(Object),
      );

      expect(result).toMatchObject({
        ci: expect.objectContaining({ name: "ALTUSHOUHOSP" }),
        relationshipLinked: true,
      });
    });
  });
});
