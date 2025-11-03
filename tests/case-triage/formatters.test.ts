/**
 * Unit Tests for Case Triage Formatters
 */

import { describe, it, expect } from "vitest";
import { formatIncidentWorkNote, formatProblemWorkNote } from "../../lib/services/case-triage/formatters";
import type { CaseClassification } from "../../lib/services/case-classifier";

describe("Case Triage Formatters", () => {
  describe("formatIncidentWorkNote()", () => {
    const baseClassification: CaseClassification = {
      category: "Network",
      subcategory: "Wi-Fi",
      confidence_score: 0.92,
      reasoning: "Classification test",
      keywords: [],
    };

    it("should format standard incident work note", () => {
      const workNote = formatIncidentWorkNote(
        "INC0012345",
        "https://servicenow.com/incident/abc123",
        { is_major_incident: false, reasoning: "Network connectivity issue detected" },
        baseClassification
      );

      expect(workNote).toContain("🚨 INCIDENT CREATED");
      expect(workNote).toContain("Incident: INC0012345");
      expect(workNote).toContain("Reason: Network connectivity issue detected");
      expect(workNote).toContain("Category: Network > Wi-Fi");
      expect(workNote).toContain("Link: https://servicenow.com/incident/abc123");
      expect(workNote).not.toContain("MAJOR");
      expect(workNote).not.toContain("⚠️");
    });

    it("should format major incident work note with warning", () => {
      const workNote = formatIncidentWorkNote(
        "INC0012345",
        "https://servicenow.com/incident/abc123",
        { is_major_incident: true, reasoning: "Critical outage affecting 50+ users" },
        baseClassification
      );

      expect(workNote).toContain("🚨 MAJOR INCIDENT CREATED");
      expect(workNote).toContain("⚠️ MAJOR INCIDENT - Immediate escalation required");
      expect(workNote).toContain("Reason: Critical outage affecting 50+ users");
    });

    it("should handle classification without subcategory", () => {
      const classificationNoSub: CaseClassification = {
        category: "Hardware",
        confidence_score: 0.85,
        reasoning: "Test",
        keywords: [],
      };

      const workNote = formatIncidentWorkNote(
        "INC0012345",
        "https://servicenow.com/incident/abc123",
        { is_major_incident: false, reasoning: "Hardware failure" },
        classificationNoSub
      );

      expect(workNote).toContain("Category: Hardware");
      expect(workNote).not.toContain(">"); // No subcategory separator
    });

    it("should match expected format snapshot", () => {
      const workNote = formatIncidentWorkNote(
        "INC0012345",
        "https://servicenow.com/incident/abc123",
        { is_major_incident: false, reasoning: "User unable to access shared drive" },
        baseClassification
      );

      expect(workNote).toMatchInlineSnapshot(`
        "🚨 INCIDENT CREATED

        Incident: INC0012345
        Reason: User unable to access shared drive

        Category: Network > Wi-Fi

        Link: https://servicenow.com/incident/abc123"
      `);
    });

    it("should match major incident format snapshot", () => {
      const workNote = formatIncidentWorkNote(
        "INC0055555",
        "https://servicenow.com/incident/major-xyz",
        { is_major_incident: true, reasoning: "Email service down globally" },
        { category: "Email", subcategory: "Exchange Online", confidence_score: 0.95, reasoning: "Test", keywords: [] }
      );

      expect(workNote).toMatchInlineSnapshot(`
        "🚨 MAJOR INCIDENT CREATED

        Incident: INC0055555
        Reason: Email service down globally

        Category: Email > Exchange Online

        ⚠️ MAJOR INCIDENT - Immediate escalation required

        Link: https://servicenow.com/incident/major-xyz"
      `);
    });
  });

  describe("formatProblemWorkNote()", () => {
    const baseClassification: CaseClassification = {
      category: "Software",
      subcategory: "Active Directory",
      confidence_score: 0.88,
      reasoning: "Test",
      keywords: [],
    };

    it("should format problem work note", () => {
      const workNote = formatProblemWorkNote(
        "PRB0067890",
        "https://servicenow.com/problem/def456",
        { reasoning: "Recurring authentication failures across multiple users" },
        baseClassification
      );

      expect(workNote).toContain("🔍 PROBLEM CREATED");
      expect(workNote).toContain("Problem: PRB0067890");
      expect(workNote).toContain("Reason: Recurring authentication failures across multiple users");
      expect(workNote).toContain("Category: Software > Active Directory");
      expect(workNote).toContain("Link: https://servicenow.com/problem/def456");
    });

    it("should handle classification without subcategory", () => {
      const classificationNoSub: CaseClassification = {
        category: "Network",
        confidence_score: 0.80,
        reasoning: "Test",
        keywords: [],
      };

      const workNote = formatProblemWorkNote(
        "PRB0067890",
        "https://servicenow.com/problem/def456",
        { reasoning: "Pattern detected" },
        classificationNoSub
      );

      expect(workNote).toContain("Category: Network");
      expect(workNote).not.toContain(">"); // No subcategory separator
    });

    it("should match expected format snapshot", () => {
      const workNote = formatProblemWorkNote(
        "PRB0067890",
        "https://servicenow.com/problem/def456",
        { reasoning: "10+ similar cases in last 7 days suggest systemic issue" },
        baseClassification
      );

      expect(workNote).toMatchInlineSnapshot(`
        "🔍 PROBLEM CREATED

        Problem: PRB0067890
        Reason: 10+ similar cases in last 7 days suggest systemic issue

        Category: Software > Active Directory

        Link: https://servicenow.com/problem/def456"
      `);
    });
  });
});
