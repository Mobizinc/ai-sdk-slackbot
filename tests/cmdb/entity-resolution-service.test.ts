import { describe, it, expect, vi, beforeEach } from "vitest";
import { EntityResolutionService } from "../../lib/services/cmdb/entity-resolution-service";
import { getBusinessContextService } from "../../lib/services/business-context";

// Mock the business context service
vi.mock("../../lib/services/business-context");

describe("EntityResolutionService", () => {
  let service: EntityResolutionService;
  let mockBusinessContextService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockBusinessContextService = {
      searchContextsByEntity: vi.fn(),
    };
    
    vi.mocked(getBusinessContextService).mockReturnValue(mockBusinessContextService);
    service = new EntityResolutionService();
  });

  describe("resolveEntity", () => {
    it("should skip non-CI-worthy entities", async () => {
      const result = await service.resolveEntity("user1", "USER");

      expect(result).toEqual({
        originalValue: "user1",
        resolvedValue: null,
        isAliasResolved: false,
        isCiWorthy: false,
      });
      
      expect(mockBusinessContextService.searchContextsByEntity).not.toHaveBeenCalled();
    });

    it("should return original value when no business context matches", async () => {
      mockBusinessContextService.searchContextsByEntity.mockResolvedValue([]);

      const result = await service.resolveEntity("server01", "SYSTEM");

      expect(result).toEqual({
        originalValue: "server01",
        resolvedValue: "server01",
        isAliasResolved: true,
        isCiWorthy: true,
      });
      
      expect(mockBusinessContextService.searchContextsByEntity).toHaveBeenCalledWith("server01");
    });

    it("should resolve entity using business context alias", async () => {
      const mockContext = {
        entityName: "Legal File Server",
        aliases: ["L drive", "L:", "\\fileserver01\\legal-docs"],
        cmdbIdentifiers: [{
          ciName: "\\fileserver01\\legal-docs",
          sysId: "ci_sys_id_123",
          ipAddresses: ["192.168.1.100"],
        }],
      };

      mockBusinessContextService.searchContextsByEntity.mockResolvedValue([mockContext]);

      const result = await service.resolveEntity("L drive", "SYSTEM");

      expect(result).toEqual({
        originalValue: "L drive",
        resolvedValue: "\\fileserver01\\legal-docs",
        businessContextMatch: "Legal File Server",
        isAliasResolved: true,
        isCiWorthy: true,
      });
    });

    it("should resolve entity using exact name match", async () => {
      const mockContext = {
        entityName: "server01",
        aliases: ["old-server", "legacy-server"],
        cmdbIdentifiers: [{
          ciName: "server01.company.com",
          sysId: "ci_sys_id_456",
          ipAddresses: ["192.168.1.200"],
        }],
      };

      mockBusinessContextService.searchContextsByEntity.mockResolvedValue([mockContext]);

      const result = await service.resolveEntity("server01", "SYSTEM");

      expect(result).toEqual({
        originalValue: "server01",
        resolvedValue: "server01.company.com",
        businessContextMatch: "server01",
        isAliasResolved: true,
        isCiWorthy: true,
      });
    });

    it("should handle IP address entities", async () => {
      mockBusinessContextService.searchContextsByEntity.mockResolvedValue([]);

      const result = await service.resolveEntity("192.168.1.1", "IP_ADDRESS");

      expect(result).toEqual({
        originalValue: "192.168.1.1",
        resolvedValue: "192.168.1.1",
        isAliasResolved: true,
        isCiWorthy: true,
      });
    });

    it("should handle software entities", async () => {
      mockBusinessContextService.searchContextsByEntity.mockResolvedValue([]);

      const result = await service.resolveEntity("Microsoft Office", "SOFTWARE");

      expect(result).toEqual({
        originalValue: "Microsoft Office",
        resolvedValue: "Microsoft Office",
        isAliasResolved: true,
        isCiWorthy: true,
      });
    });

    it("should handle network device entities", async () => {
      mockBusinessContextService.searchContextsByEntity.mockResolvedValue([]);

      const result = await service.resolveEntity("firewall-01", "NETWORK_DEVICE");

      expect(result).toEqual({
        originalValue: "firewall-01",
        resolvedValue: "firewall-01",
        isAliasResolved: true,
        isCiWorthy: true,
      });
    });

    it("should skip error code entities", async () => {
      const result = await service.resolveEntity("ERR_001", "ERROR_CODE");

      expect(result).toEqual({
        originalValue: "ERR_001",
        resolvedValue: null,
        isAliasResolved: false,
        isCiWorthy: false,
      });
      
      expect(mockBusinessContextService.searchContextsByEntity).not.toHaveBeenCalled();
    });
  });
});