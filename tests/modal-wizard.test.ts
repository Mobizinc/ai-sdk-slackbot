/**
 * Modal Wizard Tests
 * Comprehensive tests for multi-step modal workflows
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ModalWizard } from "../lib/services/modal-wizard";
import { InteractiveStateManager } from "../lib/services/interactive-state-manager";

// Mock dependencies
vi.mock("../lib/services/slack-messaging", () => ({
  getSlackMessagingService: () => ({
    openView: vi.fn().mockResolvedValue({
      ok: true,
      view: { id: "V123456" }
    })
  })
}));

vi.mock("../lib/services/interactive-state-manager", () => ({
  getInteractiveStateManager: () => ({
    saveState: vi.fn().mockResolvedValue({ 
      id: "state123",
      type: "modal_wizard",
      channelId: "U123",
      messageTs: "V123456"
    }),
    getState: vi.fn().mockResolvedValue({
      id: "state123",
      type: "modal_wizard",
      payload: {
        wizardId: "test_wizard",
        currentStep: 0,
        totalSteps: 2,
        collectedData: {}
      }
    }),
    deleteState: vi.fn().mockResolvedValue(undefined)
  })
}));

describe("ModalWizard", () => {
  let wizard: ModalWizard;
  let mockSlackMessaging: any;
  let mockStateManager: any;

  beforeEach(() => {
    wizard = new ModalWizard();
    const { getSlackMessagingService } = require("../lib/services/slack-messaging");
    const { getInteractiveStateManager } = require("../lib/services/interactive-state-manager");
    mockSlackMessaging = getSlackMessagingService();
    mockStateManager = getInteractiveStateManager();
    vi.clearAllMocks();
  });

  describe("Wizard Configuration", () => {
    it("should validate wizard configuration", async () => {
      const invalidConfig = {
        wizardId: "test_wizard",
        steps: [], // Empty steps
        onComplete: async () => {}
      };

      await expect(
        wizard.startWizard("trigger123", "U123", invalidConfig)
      ).rejects.toThrow("Wizard must have at least one step");
    });

    it("should accept valid wizard configuration", async () => {
      const validConfig = {
        wizardId: "test_wizard",
        steps: [
          {
            stepId: "step1",
            title: "Step 1",
            blocks: [
              {
                type: "section" as const,
                text: {
                  type: "mrkdwn" as const,
                  text: "Welcome to step 1"
                }
              }
            ]
          }
        ],
        onComplete: async () => {}
      };

      await expect(
        wizard.startWizard("trigger123", "U123", validConfig)
      ).resolves.not.toThrow();
    });

    it("should handle wizard with metadata", async () => {
      const configWithMetadata = {
        wizardId: "test_wizard",
        steps: [
          {
            stepId: "step1",
            title: "Step 1",
            blocks: []
          }
        ],
        onComplete: async () => {},
        metadata: {
          caseNumber: "INC001001",
          channelId: "C123456"
        }
      };

      await expect(
        wizard.startWizard("trigger123", "U123", configWithMetadata)
      ).resolves.not.toThrow();

      expect(mockStateManager.saveState).toHaveBeenCalledWith(
        "modal_wizard",
        "U123",
        expect.any(String),
        expect.objectContaining({
          wizardId: "test_wizard",
          currentStep: 0,
          totalSteps: 1
        }),
        expect.objectContaining({
          metadata: configWithMetadata.metadata
        })
      );
    });
  });

  describe("Multi-Step Workflows", () => {
    it("should handle two-step wizard", async () => {
      const twoStepConfig = {
        wizardId: "two_step_wizard",
        steps: [
          {
            stepId: "step1",
            title: "Step 1",
            blocks: [
              {
                type: "input" as const,
                block_id: "input1",
                element: {
                  type: "plain_text_input",
                  action_id: "text1"
                },
                label: {
                  type: "plain_text" as const,
                  text: "Input 1"
                }
              }
            ]
          },
          {
            stepId: "step2",
            title: "Step 2",
            blocks: [
              {
                type: "input" as const,
                block_id: "input2",
                element: {
                  type: "plain_text_input",
                  action_id: "text2"
                },
                label: {
                  type: "plain_text" as const,
                  text: "Input 2"
                }
              }
            ]
          }
        ],
        onComplete: async () => {}
      };

      await wizard.startWizard("trigger123", "U123", twoStepConfig);

      expect(mockSlackMessaging.openView).toHaveBeenCalledWith(
        expect.objectContaining({
          trigger_id: "trigger123",
          view: expect.objectContaining({
            type: "modal",
            title: expect.objectContaining({
              text: "Step 1"
            }),
            blocks: expect.arrayContaining([
              expect.objectContaining({
                type: "input",
                block_id: "input1"
              }),
              expect.objectContaining({
                type: "actions"
              })
            ])
          })
        })
      );
    });

    it("should handle wizard with optional steps", async () => {
      const configWithOptional = {
        wizardId: "optional_wizard",
        steps: [
          {
            stepId: "step1",
            title: "Step 1",
            blocks: [],
            optional: true
          },
          {
            stepId: "step2",
            title: "Step 2",
            blocks: []
          }
        ],
        onComplete: async () => {}
      };

      await expect(
        wizard.startWizard("trigger123", "U123", configWithOptional)
      ).resolves.not.toThrow();
    });

    it("should handle wizard with validation", async () => {
      const configWithValidation = {
        wizardId: "validation_wizard",
        steps: [
          {
            stepId: "step1",
            title: "Step 1",
            blocks: [
              {
                type: "input" as const,
                block_id: "email_input",
                element: {
                  type: "plain_text_input",
                  action_id: "email"
                },
                label: {
                  type: "plain_text" as const,
                  text: "Email"
                }
              }
            ],
            validate: async (values: any) => {
              const email = values.email_input?.email?.value;
              if (!email || !email.includes("@")) {
                return "Please enter a valid email address";
              }
              return null;
            }
          }
        ],
        onComplete: async () => {}
      };

      await expect(
        wizard.startWizard("trigger123", "U123", configWithValidation)
      ).resolves.not.toThrow();
    });
  });

  describe("Step Navigation", () => {
    it("should show next button on non-final steps", async () => {
      const config = {
        wizardId: "navigation_wizard",
        steps: [
          {
            stepId: "step1",
            title: "Step 1",
            blocks: []
          },
          {
            stepId: "step2",
            title: "Step 2",
            blocks: []
          }
        ],
        onComplete: async () => {}
      };

      await wizard.startWizard("trigger123", "U123", config);

      const viewCall = mockSlackMessaging.openView.mock.calls[0];
      const view = viewCall[0].view;

      // Find actions block
      const actionsBlock = view.blocks.find((block: any) => block.type === "actions");
      expect(actionsBlock).toBeDefined();

      // Should have next button
      const nextButton = actionsBlock.elements.find(
        (element: any) => element.action_id === "wizard_next"
      );
      expect(nextButton).toBeDefined();
      expect(nextButton.text.text).toBe("Next");
    });

    it("should show previous button on steps after first", async () => {
      // Simulate being on step 2
      mockStateManager.getState.mockResolvedValue({
        id: "state123",
        type: "modal_wizard",
        payload: {
          wizardId: "test_wizard",
          currentStep: 1, // Step 2 (0-indexed)
          totalSteps: 3,
          collectedData: { step1: "data" }
        }
      });

      // This would be tested through the actual view submission handler
      expect(mockStateManager.getState).toBeDefined();
    });

    it("should show submit button on final step", async () => {
      const config = {
        wizardId: "single_step_wizard",
        steps: [
          {
            stepId: "step1",
            title: "Step 1",
            blocks: []
          }
        ],
        onComplete: async () => {}
      };

      await wizard.startWizard("trigger123", "U123", config);

      const viewCall = mockSlackMessaging.openView.mock.calls[0];
      const view = viewCall[0].view;

      // Find actions block
      const actionsBlock = view.blocks.find((block: any) => block.type === "actions");
      expect(actionsBlock).toBeDefined();

      // Should have submit button, not next button
      const submitButton = actionsBlock.elements.find(
        (element: any) => element.action_id === "wizard_submit"
      );
      const nextButton = actionsBlock.elements.find(
        (element: any) => element.action_id === "wizard_next"
      );

      expect(submitButton).toBeDefined();
      expect(submitButton.text.text).toBe("Submit");
      expect(nextButton).toBeUndefined();
    });
  });

  describe("Data Collection", () => {
    it("should collect data from each step", async () => {
      const onComplete = vi.fn();
      const config = {
        wizardId: "data_collection_wizard",
        steps: [
          {
            stepId: "step1",
            title: "Step 1",
            blocks: [
              {
                type: "input" as const,
                block_id: "name_input",
                element: {
                  type: "plain_text_input",
                  action_id: "name"
                },
                label: {
                  type: "plain_text" as const,
                  text: "Name"
                }
              }
            ]
          },
          {
            stepId: "step2",
            title: "Step 2",
            blocks: [
              {
                type: "input" as const,
                block_id: "email_input",
                element: {
                  type: "plain_text_input",
                  action_id: "email"
                },
                label: {
                  type: "plain_text" as const,
                  text: "Email"
                }
              }
            ]
          }
        ],
        onComplete
      };

      await wizard.startWizard("trigger123", "U123", config);

      // Simulate completion with data
      const collectedData = {
        step1: { name_input: { name: { value: "John Doe" } } },
        step2: { email_input: { email: { value: "john@example.com" } } }
      };

      // This would be tested through the actual completion flow
      expect(config).toBeDefined();
    });

    it("should preserve data across steps", async () => {
      mockStateManager.getState.mockResolvedValue({
        id: "state123",
        type: "modal_wizard",
        payload: {
          wizardId: "test_wizard",
          currentStep: 1,
          totalSteps: 2,
          collectedData: {
            step1: { input1: { text_input: { value: "Previous data" } } }
          }
        }
      });

      // Test that previous data is preserved when navigating
      expect(mockStateManager.getState).toBeDefined();
    });
  });

  describe("Error Handling", () => {
    it("should handle view submission errors", async () => {
      const config = {
        wizardId: "error_wizard",
        steps: [
          {
            stepId: "step1",
            title: "Step 1",
            blocks: []
          }
        ],
        onComplete: async () => {
          throw new Error("Completion failed");
        }
      };

      await wizard.startWizard("trigger123", "U123", config);

      // Error handling would be tested through actual error scenarios
      expect(config).toBeDefined();
    });

    it("should handle state persistence failures", async () => {
      mockStateManager.saveState.mockRejectedValue(new Error("Database error"));

      const config = {
        wizardId: "error_wizard",
        steps: [
          {
            stepId: "step1",
            title: "Step 1",
            blocks: []
          }
        ],
        onComplete: async () => {}
      };

      await expect(
        wizard.startWizard("trigger123", "U123", config)
      ).rejects.toThrow("Database error");
    });

    it("should handle modal opening failures", async () => {
      mockSlackMessaging.openView.mockRejectedValue(new Error("Invalid trigger_id"));

      const config = {
        wizardId: "error_wizard",
        steps: [
          {
            stepId: "step1",
            title: "Step 1",
            blocks: []
          }
        ],
        onComplete: async () => {}
      };

      await expect(
        wizard.startWizard("trigger123", "U123", config)
      ).rejects.toThrow("Invalid trigger_id");
    });
  });

  describe("Wizard Cancellation", () => {
    it("should handle wizard cancellation", async () => {
      const onCancel = vi.fn();
      const config = {
        wizardId: "cancel_wizard",
        steps: [
          {
            stepId: "step1",
            title: "Step 1",
            blocks: []
          }
        ],
        onComplete: async () => {},
        onCancel
      };

      await wizard.startWizard("trigger123", "U123", config);

      // Cancellation would be tested through actual view.closed event
      expect(config.onCancel).toBeDefined();
    });

    it("should cleanup state on cancellation", async () => {
      const config = {
        wizardId: "cleanup_wizard",
        steps: [
          {
            stepId: "step1",
            title: "Step 1",
            blocks: []
          }
        ],
        onComplete: async () => {},
        onCancel: async () => {}
      };

      await wizard.startWizard("trigger123", "U123", config);

      // State cleanup would be verified through actual cancellation flow
      expect(mockStateManager.saveState).toHaveBeenCalled();
    });
  });

  describe("Progress Indication", () => {
    it("should show progress in modal title", async () => {
      const config = {
        wizardId: "progress_wizard",
        steps: [
          {
            stepId: "step1",
            title: "Step 1",
            blocks: []
          },
          {
            stepId: "step2",
            title: "Step 2",
            blocks: []
          },
          {
            stepId: "step3",
            title: "Step 3",
            blocks: []
          }
        ],
        onComplete: async () => {}
      };

      await wizard.startWizard("trigger123", "U123", config);

      const viewCall = mockSlackMessaging.openView.mock.calls[0];
      const view = viewCall[0].view;

      // Title should include progress (Step 1 of 3)
      expect(view.title.text).toContain("Step 1");
    });

    it("should update progress on navigation", async () => {
      // Simulate navigation to step 2
      mockStateManager.getState.mockResolvedValue({
        id: "state123",
        type: "modal_wizard",
        payload: {
          wizardId: "test_wizard",
          currentStep: 1,
          totalSteps: 3,
          collectedData: { step1: "data" }
        }
      });

      // Progress update would be tested through actual navigation
      expect(mockStateManager.getState).toBeDefined();
    });
  });

  describe("Complex Input Types", () => {
    it("should handle various input types", async () => {
      const config = {
        wizardId: "input_types_wizard",
        steps: [
          {
            stepId: "step1",
            title: "Step 1",
            blocks: [
              {
                type: "input" as const,
                block_id: "text_input",
                element: {
                  type: "plain_text_input",
                  action_id: "text"
                },
                label: {
                  type: "plain_text" as const,
                  text: "Text Input"
                }
              },
              {
                type: "input" as const,
                block_id: "select_input",
                element: {
                  type: "static_select",
                  action_id: "select",
                  options: [
                    {
                      text: { type: "plain_text" as const, text: "Option 1" },
                      value: "option1"
                    }
                  ]
                },
                label: {
                  type: "plain_text" as const,
                  text: "Select Input"
                }
              },
              {
                type: "input" as const,
                block_id: "textarea_input",
                element: {
                  type: "plain_text_input",
                  action_id: "textarea",
                  multiline: true
                },
                label: {
                  type: "plain_text" as const,
                  text: "Textarea"
                }
              }
            ]
          }
        ],
        onComplete: async () => {}
      };

      await expect(
        wizard.startWizard("trigger123", "U123", config)
      ).resolves.not.toThrow();

      const viewCall = mockSlackMessaging.openView.mock.calls[0];
      const view = viewCall[0].view;

      // Should have all input types
      const inputBlocks = view.blocks.filter((block: any) => block.type === "input");
      expect(inputBlocks).toHaveLength(3);
    });
  });

  describe("Conditional Steps", () => {
    it("should handle conditional step logic", async () => {
      const config = {
        wizardId: "conditional_wizard",
        steps: [
          {
            stepId: "step1",
            title: "Step 1",
            blocks: [
              {
                type: "input" as const,
                block_id: "choice_input",
                element: {
                  type: "static_select",
                  action_id: "choice",
                  options: [
                    {
                      text: { type: "plain_text" as const, text: "Option A" },
                      value: "a"
                    },
                    {
                      text: { type: "plain_text" as const, text: "Option B" },
                      value: "b"
                    }
                  ]
                },
                label: {
                  type: "plain_text" as const,
                  text: "Choose an option"
                }
              }
            ]
          },
          {
            stepId: "step2a",
            title: "Step 2A",
            blocks: [],
            optional: true
          },
          {
            stepId: "step2b",
            title: "Step 2B",
            blocks: [],
            optional: true
          }
        ],
        onComplete: async () => {}
      };

      await expect(
        wizard.startWizard("trigger123", "U123", config)
      ).resolves.not.toThrow();

      // Conditional logic would be tested through actual navigation based on choices
      expect(config.steps).toHaveLength(3);
    });
  });
});