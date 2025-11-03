/**
 * Unit Tests for Case Triage Constants
 */

import { describe, it, expect } from "vitest";
import { getClassificationConfig } from "../../lib/services/case-triage/constants";
import type { CaseTriageOptions } from "../../lib/services/case-triage/types";

describe("Case Triage Constants", () => {
  describe("getClassificationConfig()", () => {
    const mockGlobalConfig = {
      catalogRedirectEnabled: true,
      cmdbReconciliationEnabled: false,
      caseClassificationMaxRetries: 3,
    };

    it("should return all defaults when no options provided", () => {
      const config = getClassificationConfig({}, mockGlobalConfig);

      expect(config).toEqual({
        enableCaching: true,
        enableSimilarCases: true,
        enableKBArticles: true,
        enableBusinessContext: true,
        enableWorkflowRouting: true,
        writeToServiceNow: false, // Explicitly false by default
        enableCatalogRedirect: true, // From global config
        cmdbReconciliationEnabled: false, // From global config
        maxRetries: 3, // From global config
      });
    });

    it("should override defaults with provided options", () => {
      const options: CaseTriageOptions = {
        enableCaching: false,
        writeToServiceNow: true,
        maxRetries: 5,
      };

      const config = getClassificationConfig(options, mockGlobalConfig);

      expect(config.enableCaching).toBe(false); // Overridden
      expect(config.writeToServiceNow).toBe(true); // Overridden
      expect(config.maxRetries).toBe(5); // Overridden
      expect(config.enableSimilarCases).toBe(true); // Default
      expect(config.enableKBArticles).toBe(true); // Default
    });

    it("should handle all options being explicitly set", () => {
      const options: CaseTriageOptions = {
        enableCaching: false,
        enableSimilarCases: false,
        enableKBArticles: false,
        enableBusinessContext: false,
        enableWorkflowRouting: false,
        writeToServiceNow: true,
        enableCatalogRedirect: false,
        cmdbReconciliationEnabled: true,
        maxRetries: 1,
      };

      const config = getClassificationConfig(options, mockGlobalConfig);

      expect(config).toEqual({
        enableCaching: false,
        enableSimilarCases: false,
        enableKBArticles: false,
        enableBusinessContext: false,
        enableWorkflowRouting: false,
        writeToServiceNow: true,
        enableCatalogRedirect: false,
        cmdbReconciliationEnabled: true,
        maxRetries: 1,
      });
    });

    it("should use global config fallbacks for catalog and CMDB settings", () => {
      const customGlobalConfig = {
        catalogRedirectEnabled: false,
        cmdbReconciliationEnabled: true,
        caseClassificationMaxRetries: 7,
      };

      const config = getClassificationConfig({}, customGlobalConfig);

      expect(config.enableCatalogRedirect).toBe(false); // From global
      expect(config.cmdbReconciliationEnabled).toBe(true); // From global
      expect(config.maxRetries).toBe(7); // From global
    });

    it("should handle missing global config gracefully", () => {
      const emptyGlobalConfig = {};

      const config = getClassificationConfig({}, emptyGlobalConfig);

      expect(config.enableCatalogRedirect).toBe(true); // Final fallback
      expect(config.cmdbReconciliationEnabled).toBe(false); // Final fallback
      expect(config.maxRetries).toBe(3); // Final fallback
    });

    it("should prioritize options over global config", () => {
      const options: CaseTriageOptions = {
        enableCatalogRedirect: false,
        maxRetries: 10,
      };

      const globalConfig = {
        catalogRedirectEnabled: true, // Should be overridden
        caseClassificationMaxRetries: 3, // Should be overridden
      };

      const config = getClassificationConfig(options, globalConfig);

      expect(config.enableCatalogRedirect).toBe(false); // Option wins
      expect(config.maxRetries).toBe(10); // Option wins
    });

    it("should handle undefined options parameter", () => {
      const config = getClassificationConfig(undefined, mockGlobalConfig);

      expect(config.enableCaching).toBe(true);
      expect(config.writeToServiceNow).toBe(false);
    });
  });
});
