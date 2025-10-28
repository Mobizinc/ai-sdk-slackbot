/**
 * Modal and Input Element Tests
 * Tests for modal creation and all input element builders
 */

import { describe, it, expect } from "vitest";
import {
  createModalView,
  createPlainTextInput,
  createRichTextInput,
  createStaticSelect,
  createExternalSelect,
  createUserSelect,
  createChannelSelect,
  createDatePicker,
  createTimePicker,
  createRadioButtons,
  createCheckboxes,
  createInputBlock,
  validateBlockCount,
  validateSelectOptions,
  validateActionId,
  validateBlockId,
} from "../lib/utils/message-styling";

describe("Modal and Input Element Tests", () => {
  describe("createModalView", () => {
    it("should create a valid modal view", () => {
      const modal = createModalView({
        title: "Test Modal",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "This is a test modal",
            },
          },
        ],
      });
      
      expect((modal as any).type).toBe("modal");
      expect((modal as any).title.text).toBe("Test Modal");
      expect((modal as any).title.emoji).toBe(true);
      expect((modal as any).blocks).toHaveLength(1);
    });

    it("should create modal with submit and close buttons", () => {
      const modal = createModalView({
        title: "Form Modal",
        blocks: [],
        submit: "Submit",
        close: "Cancel",
      });
      
      expect((modal as any).submit.text).toBe("Submit");
      expect((modal as any).close.text).toBe("Cancel");
    });

    it("should create modal with callback_id", () => {
      const modal = createModalView({
        title: "Callback Modal",
        blocks: [],
        callbackId: "test_callback",
      });
      
      expect((modal as any).callback_id).toBe("test_callback");
    });

    it("should create modal with private metadata", () => {
      const metadata = JSON.stringify({ caseId: "INC001", userId: "U123" });
      const modal = createModalView({
        title: "Metadata Modal",
        blocks: [],
        privateMetadata: metadata,
      });
      
      expect((modal as any).private_metadata).toBe(metadata);
    });

    it("should handle modal with all options", () => {
      const modal = createModalView({
        title: "Full Modal",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "Complete modal",
            },
          },
        ],
        submit: "Save",
        close: "Cancel",
        callbackId: "full_modal_callback",
        privateMetadata: JSON.stringify({ test: true }),
        clearOnClose: true,
        notifyOnClose: true,
        externalId: "ext_123",
      });
      
      expect((modal as any).submit.text).toBe("Save");
      expect((modal as any).close.text).toBe("Cancel");
      expect((modal as any).callback_id).toBe("full_modal_callback");
      expect((modal as any).private_metadata).toContain("test");
      expect((modal as any).clear_on_close).toBe(true);
      expect((modal as any).notify_on_close).toBe(true);
      expect((modal as any).external_id).toBe("ext_123");
    });

    it("should validate block count for modals", () => {
      const blocks = Array.from({ length: 100 }, (_, i) => ({
        type: "section" as const,
        text: {
          type: "mrkdwn" as const,
          text: `Block ${i}`,
        },
      }));
      
      expect(() => createModalView({ title: "Max Blocks", blocks })).not.toThrow();
    });

    it("should throw error with too many blocks", () => {
      const blocks = Array.from({ length: 101 }, (_, i) => ({
        type: "section" as const,
        text: {
          type: "mrkdwn" as const,
          text: `Block ${i}`,
        },
      }));
      
      expect(() => createModalView({ title: "Too Many", blocks })).toThrow();
    });
  });

  describe("createPlainTextInput", () => {
    it("should create a valid plain text input", () => {
      const input = createPlainTextInput({
        actionId: "text_input",
      });
      
      expect((input as any).type).toBe("plain_text_input");
      expect((input as any).action_id).toBe("text_input");
    });

    it("should create input with placeholder", () => {
      const input = createPlainTextInput({
        actionId: "text_input",
        placeholder: "Enter your text here",
      });
      
      expect((input as any).placeholder.text).toBe("Enter your text here");
    });

    it("should create input with initial value", () => {
      const input = createPlainTextInput({
        actionId: "text_input",
        initialValue: "Initial text",
      });
      
      expect((input as any).initial_value).toBe("Initial text");
    });

    it("should create multiline input", () => {
      const input = createPlainTextInput({
        actionId: "text_input",
        multiline: true,
      });
      
      expect((input as any).multiline).toBe(true);
    });

    it("should create input with length constraints", () => {
      const input = createPlainTextInput({
        actionId: "text_input",
        minLength: 5,
        maxLength: 100,
      });
      
      expect((input as any).min_length).toBe(5);
      expect((input as any).max_length).toBe(100);
    });

    it("should cap maxLength to Slack limit", () => {
      const input = createPlainTextInput({
        actionId: "text_input",
        maxLength: 5000, // Over Slack's 3000 limit
      });
      
      expect((input as any).max_length).toBe(3000);
    });

    it("should create input with dispatch action config", () => {
      const dispatchConfig = { trigger_actions_on: ["on_character_enter"] };
      const input = createPlainTextInput({
        actionId: "text_input",
        dispatchActionConfig: dispatchConfig,
      });
      
      expect((input as any).dispatch_action_config).toEqual(dispatchConfig);
    });
  });

  describe("createRichTextInput", () => {
    it("should create a valid rich text input", () => {
      const input = createRichTextInput({
        actionId: "rich_input",
      });
      
      expect((input as any).type).toBe("rich_text_input");
      expect((input as any).action_id).toBe("rich_input");
    });

    it("should create input with placeholder", () => {
      const input = createRichTextInput({
        actionId: "rich_input",
        placeholder: "Enter rich text",
      });
      
      expect((input as any).placeholder.text).toBe("Enter rich text");
    });

    it("should create input with initial value", () => {
      const initialValue = {
        type: "rich_text",
        elements: [
          {
            type: "text",
            text: "Initial rich text",
          },
        ],
      };
      
      const input = createRichTextInput({
        actionId: "rich_input",
        initialValue,
      });
      
      expect((input as any).initial_value).toEqual(initialValue);
    });

    it("should create input with dispatch action config", () => {
      const dispatchConfig = { trigger_actions_on: ["on_enter"] };
      const input = createRichTextInput({
        actionId: "rich_input",
        dispatchActionConfig: dispatchConfig,
      });
      
      expect((input as any).dispatch_action_config).toEqual(dispatchConfig);
    });
  });

  describe("createStaticSelect", () => {
    it("should create a valid static select", () => {
      const options = [
        { text: "Option 1", value: "opt1" },
        { text: "Option 2", value: "opt2" },
      ];
      
      const select = createStaticSelect({
        actionId: "static_select",
        placeholder: "Choose an option",
        options,
      });
      
      expect((select as any).type).toBe("static_select");
      expect((select as any).action_id).toBe("static_select");
      expect((select as any).placeholder.text).toBe("Choose an option");
      expect((select as any).options).toHaveLength(2);
    });

    it("should create select with initial option", () => {
      const options = [
        { text: "Option 1", value: "opt1" },
        { text: "Option 2", value: "opt2" },
      ];
      
      const select = createStaticSelect({
        actionId: "static_select",
        placeholder: "Choose",
        options,
        initialOption: { text: "Option 2", value: "opt2" },
      });
      
      expect((select as any).initial_option.text.text).toBe("Option 2");
      expect((select as any).initial_option.value).toBe("opt2");
    });

    it("should create select with descriptions", () => {
      const options = [
        { text: "High", value: "high", description: "Urgent priority" },
        { text: "Low", value: "low", description: "Normal priority" },
      ];
      
      const select = createStaticSelect({
        actionId: "priority_select",
        placeholder: "Select priority",
        options,
      });
      
      expect((select as any).options[0].description.text).toBe("Urgent priority");
      expect((select as any).options[1].description.text).toBe("Normal priority");
    });

    it("should create select with confirmation dialog", () => {
      const confirm = {
        title: { type: "plain_text" as const, text: "Confirm Selection" },
        text: { type: "mrkdwn" as const, text: "Are you sure about this choice?" },
        confirm: { type: "plain_text" as const, text: "Yes" },
        deny: { type: "plain_text" as const, text: "No" },
      };
      
      const select = createStaticSelect({
        actionId: "confirm_select",
        placeholder: "Choose",
        options: [{ text: "Option", value: "opt" }],
        confirm,
      });
      
      expect((select as any).confirm).toEqual(confirm);
    });

    it("should handle maximum options (100)", () => {
      const options = Array.from({ length: 100 }, (_, i) => ({
        text: `Option ${i}`,
        value: `opt${i}`,
      }));
      
      expect(() => createStaticSelect({
        actionId: "max_select",
        placeholder: "Choose",
        options,
      })).not.toThrow();
    });

    it("should throw error with too many options", () => {
      const options = Array.from({ length: 101 }, (_, i) => ({
        text: `Option ${i}`,
        value: `opt${i}`,
      }));
      
      expect(() => createStaticSelect({
        actionId: "too_many_select",
        placeholder: "Choose",
        options,
      })).toThrow();
    });
  });

  describe("createExternalSelect", () => {
    it("should create a valid external select", () => {
      const select = createExternalSelect({
        actionId: "external_select",
        placeholder: "Search for items",
      });
      
      expect((select as any).type).toBe("external_select");
      expect((select as any).action_id).toBe("external_select");
      expect((select as any).placeholder.text).toBe("Search for items");
    });

    it("should create external select with initial option", () => {
      const select = createExternalSelect({
        actionId: "external_select",
        placeholder: "Search",
        initialOption: { text: "Initial", value: "init" },
      });
      
      expect((select as any).initial_option.text.text).toBe("Initial");
      expect((select as any).initial_option.value).toBe("init");
    });

    it("should create external select with min query length", () => {
      const select = createExternalSelect({
        actionId: "external_select",
        placeholder: "Search",
        minQueryLength: 3,
      });
      
      expect((select as any).min_query_length).toBe(3);
    });

    it("should create external select with confirmation", () => {
      const confirm = {
        title: { type: "plain_text" as const, text: "Confirm" },
        text: { type: "mrkdwn" as const, text: "Confirm selection?" },
        confirm: { type: "plain_text" as const, text: "Yes" },
        deny: { type: "plain_text" as const, text: "No" },
      };
      
      const select = createExternalSelect({
        actionId: "external_select",
        placeholder: "Search",
        confirm,
      });
      
      expect((select as any).confirm).toEqual(confirm);
    });
  });

  describe("createUserSelect", () => {
    it("should create a valid user select", () => {
      const select = createUserSelect({
        actionId: "user_select",
        placeholder: "Select a user",
      });
      
      expect((select as any).type).toBe("users_select");
      expect((select as any).action_id).toBe("user_select");
      expect((select as any).placeholder.text).toBe("Select a user");
    });

    it("should create user select with initial user", () => {
      const select = createUserSelect({
        actionId: "user_select",
        placeholder: "Select user",
        initialUser: "U123456",
      });
      
      expect((select as any).initial_user).toBe("U123456");
    });

    it("should create user select with confirmation", () => {
      const confirm = {
        title: { type: "plain_text" as const, text: "Confirm User" },
        text: { type: "mrkdwn" as const, text: "Assign to this user?" },
        confirm: { type: "plain_text" as const, text: "Yes" },
        deny: { type: "plain_text" as const, text: "No" },
      };
      
      const select = createUserSelect({
        actionId: "user_select",
        placeholder: "Select user",
        confirm,
      });
      
      expect((select as any).confirm).toEqual(confirm);
    });
  });

  describe("createChannelSelect", () => {
    it("should create a valid channel select", () => {
      const select = createChannelSelect({
        actionId: "channel_select",
        placeholder: "Select a channel",
      });
      
      expect((select as any).type).toBe("channels_select");
      expect((select as any).action_id).toBe("channel_select");
      expect((select as any).placeholder.text).toBe("Select a channel");
    });

    it("should create channel select with initial channel", () => {
      const select = createChannelSelect({
        actionId: "channel_select",
        placeholder: "Select channel",
        initialChannel: "C123456",
      });
      
      expect((select as any).initial_channel).toBe("C123456");
    });

    it("should create channel select with confirmation", () => {
      const confirm = {
        title: { type: "plain_text" as const, text: "Confirm Channel" },
        text: { type: "mrkdwn" as const, text: "Post to this channel?" },
        confirm: { type: "plain_text" as const, text: "Yes" },
        deny: { type: "plain_text" as const, text: "No" },
      };
      
      const select = createChannelSelect({
        actionId: "channel_select",
        placeholder: "Select channel",
        confirm,
      });
      
      expect((select as any).confirm).toEqual(confirm);
    });
  });

  describe("createDatePicker", () => {
    it("should create a valid date picker", () => {
      const picker = createDatePicker({
        actionId: "date_picker",
      });
      
      expect((picker as any).type).toBe("datepicker");
      expect((picker as any).action_id).toBe("date_picker");
    });

    it("should create date picker with placeholder", () => {
      const picker = createDatePicker({
        actionId: "date_picker",
        placeholder: "Select a date",
      });
      
      expect((picker as any).placeholder.text).toBe("Select a date");
    });

    it("should create date picker with initial date", () => {
      const picker = createDatePicker({
        actionId: "date_picker",
        initialDate: "2024-01-15",
      });
      
      expect((picker as any).initial_date).toBe("2024-01-15");
    });

    it("should validate date format", () => {
      // This should log a warning but not throw
      const picker = createDatePicker({
        actionId: "date_picker",
        initialDate: "invalid-date",
      });
      
      expect((picker as any).initial_date).toBeUndefined();
    });

    it("should create date picker with confirmation", () => {
      const confirm = {
        title: { type: "plain_text" as const, text: "Confirm Date" },
        text: { type: "mrkdwn" as const, text: "Set this date?" },
        confirm: { type: "plain_text" as const, text: "Yes" },
        deny: { type: "plain_text" as const, text: "No" },
      };
      
      const picker = createDatePicker({
        actionId: "date_picker",
        confirm,
      });
      
      expect((picker as any).confirm).toEqual(confirm);
    });
  });

  describe("createTimePicker", () => {
    it("should create a valid time picker", () => {
      const picker = createTimePicker({
        actionId: "time_picker",
      });
      
      expect((picker as any).type).toBe("timepicker");
      expect((picker as any).action_id).toBe("time_picker");
    });

    it("should create time picker with placeholder", () => {
      const picker = createTimePicker({
        actionId: "time_picker",
        placeholder: "Select time",
      });
      
      expect((picker as any).placeholder.text).toBe("Select time");
    });

    it("should create time picker with initial time", () => {
      const picker = createTimePicker({
        actionId: "time_picker",
        initialTime: "14:30",
      });
      
      expect((picker as any).initial_time).toBe("14:30");
    });

    it("should validate time format", () => {
      // This should log a warning but not throw
      const picker = createTimePicker({
        actionId: "time_picker",
        initialTime: "invalid-time",
      });
      
      expect((picker as any).initial_time).toBeUndefined();
    });

    it("should create time picker with confirmation", () => {
      const confirm = {
        title: { type: "plain_text" as const, text: "Confirm Time" },
        text: { type: "mrkdwn" as const, text: "Set this time?" },
        confirm: { type: "plain_text" as const, text: "Yes" },
        deny: { type: "plain_text" as const, text: "No" },
      };
      
      const picker = createTimePicker({
        actionId: "time_picker",
        confirm,
      });
      
      expect((picker as any).confirm).toEqual(confirm);
    });
  });

  describe("createRadioButtons", () => {
    it("should create valid radio buttons", () => {
      const options = [
        { text: "Option 1", value: "opt1" },
        { text: "Option 2", value: "opt2" },
      ];
      
      const radio = createRadioButtons({
        actionId: "radio_buttons",
        options,
      });
      
      expect((radio as any).type).toBe("radio_buttons");
      expect((radio as any).action_id).toBe("radio_buttons");
      expect((radio as any).options).toHaveLength(2);
    });

    it("should create radio buttons with initial option", () => {
      const options = [
        { text: "Option 1", value: "opt1" },
        { text: "Option 2", value: "opt2" },
      ];
      
      const radio = createRadioButtons({
        actionId: "radio_buttons",
        options,
        initialOption: { text: "Option 2", value: "opt2" },
      });
      
      expect((radio as any).initial_option.text.text).toBe("Option 2");
      expect((radio as any).initial_option.value).toBe("opt2");
    });

    it("should create radio buttons with descriptions", () => {
      const options = [
        { text: "High", value: "high", description: "Urgent" },
        { text: "Low", value: "low", description: "Normal" },
      ];
      
      const radio = createRadioButtons({
        actionId: "priority_radio",
        options,
      });
      
      expect((radio as any).options[0].description.text).toBe("Urgent");
      expect((radio as any).options[1].description.text).toBe("Normal");
    });

    it("should create radio buttons with confirmation", () => {
      const confirm = {
        title: { type: "plain_text" as const, text: "Confirm" },
        text: { type: "mrkdwn" as const, text: "Confirm selection?" },
        confirm: { type: "plain_text" as const, text: "Yes" },
        deny: { type: "plain_text" as const, text: "No" },
      };
      
      const radio = createRadioButtons({
        actionId: "radio_buttons",
        options: [{ text: "Option", value: "opt" }],
        confirm,
      });
      
      expect((radio as any).confirm).toEqual(confirm);
    });
  });

  describe("createCheckboxes", () => {
    it("should create valid checkboxes", () => {
      const options = [
        { text: "Option 1", value: "opt1" },
        { text: "Option 2", value: "opt2" },
      ];
      
      const checkboxes = createCheckboxes({
        actionId: "checkboxes",
        options,
      });
      
      expect((checkboxes as any).type).toBe("checkboxes");
      expect((checkboxes as any).action_id).toBe("checkboxes");
      expect((checkboxes as any).options).toHaveLength(2);
    });

    it("should create checkboxes with initial options", () => {
      const options = [
        { text: "Option 1", value: "opt1" },
        { text: "Option 2", value: "opt2" },
        { text: "Option 3", value: "opt3" },
      ];
      
      const checkboxes = createCheckboxes({
        actionId: "checkboxes",
        options,
        initialOptions: [
          { text: "Option 1", value: "opt1" },
          { text: "Option 3", value: "opt3" },
        ],
      });
      
      expect((checkboxes as any).initial_options).toHaveLength(2);
      expect((checkboxes as any).initial_options[0].value).toBe("opt1");
      expect((checkboxes as any).initial_options[1].value).toBe("opt3");
    });

    it("should create checkboxes with descriptions", () => {
      const options = [
        { text: "Email", value: "email", description: "Send email notifications" },
        { text: "SMS", value: "sms", description: "Send SMS notifications" },
      ];
      
      const checkboxes = createCheckboxes({
        actionId: "notification_checkboxes",
        options,
      });
      
      expect((checkboxes as any).options[0].description.text).toBe("Send email notifications");
      expect((checkboxes as any).options[1].description.text).toBe("Send SMS notifications");
    });

    it("should create checkboxes with confirmation", () => {
      const confirm = {
        title: { type: "plain_text" as const, text: "Confirm" },
        text: { type: "mrkdwn" as const, text: "Confirm selections?" },
        confirm: { type: "plain_text" as const, text: "Yes" },
        deny: { type: "plain_text" as const, text: "No" },
      };
      
      const checkboxes = createCheckboxes({
        actionId: "checkboxes",
        options: [{ text: "Option", value: "opt" }],
        confirm,
      });
      
      expect((checkboxes as any).confirm).toEqual(confirm);
    });
  });

  describe("createInputBlock", () => {
    it("should create a valid input block", () => {
      const element = createPlainTextInput({
        actionId: "text_input",
        placeholder: "Enter text",
      });
      
      const inputBlock = createInputBlock({
        blockId: "input_block",
        label: "Text Input",
        element,
      });
      
      expect((inputBlock as any).type).toBe("input");
      expect((inputBlock as any).block_id).toBe("input_block");
      expect((inputBlock as any).label.text).toBe("Text Input");
      expect((inputBlock as any).element.type).toBe("plain_text_input");
    });

    it("should create input block with hint", () => {
      const element = createPlainTextInput({ actionId: "input" });
      
      const inputBlock = createInputBlock({
        blockId: "input_block",
        label: "Input",
        element,
        hint: "This is a helpful hint",
      });
      
      expect((inputBlock as any).hint.text).toBe("This is a helpful hint");
    });

    it("should create optional input block", () => {
      const element = createPlainTextInput({ actionId: "input" });
      
      const inputBlock = createInputBlock({
        blockId: "input_block",
        label: "Optional Input",
        element,
        optional: true,
      });
      
      expect((inputBlock as any).optional).toBe(true);
    });

    it("should create input block with dispatch action", () => {
      const element = createPlainTextInput({ actionId: "input" });
      
      const inputBlock = createInputBlock({
        blockId: "input_block",
        label: "Dispatch Input",
        element,
        dispatchAction: true,
      });
      
      expect((inputBlock as any).dispatch_action).toBe(true);
    });
  });

  describe("Modal Integration Tests", () => {
    it("should create a complete modal with various input types", () => {
      const modal = createModalView({
        title: "Complete Form",
        blocks: [
          createInputBlock({
            blockId: "name_input",
            label: "Name",
            element: createPlainTextInput({
              actionId: "name",
              placeholder: "Enter your name",
            }),
          }),
          createInputBlock({
            blockId: "priority_select",
            label: "Priority",
            element: createStaticSelect({
              actionId: "priority",
              placeholder: "Select priority",
              options: [
                { text: "High", value: "high" },
                { text: "Medium", value: "medium" },
                { text: "Low", value: "low" },
              ],
            }),
          }),
          createInputBlock({
            blockId: "due_date",
            label: "Due Date",
            element: createDatePicker({
              actionId: "date",
              placeholder: "Select due date",
            }),
          }),
        ],
        submit: "Submit",
        close: "Cancel",
        callbackId: "complete_form",
      });
      
      expect((modal as any).blocks).toHaveLength(3);
      expect((modal as any).submit.text).toBe("Submit");
      expect((modal as any).close.text).toBe("Cancel");
      expect((modal as any).callback_id).toBe("complete_form");
      
      // Verify each block type
      expect((modal as any).blocks[0].type).toBe("input");
      expect((modal as any).blocks[0].element.type).toBe("plain_text_input");
      expect((modal as any).blocks[1].element.type).toBe("static_select");
      expect((modal as any).blocks[2].element.type).toBe("datepicker");
    });

    it("should handle complex modal with all features", () => {
      const modal = createModalView({
        title: "Complex Modal",
        blocks: [
          createInputBlock({
            blockId: "description",
            label: "Description",
            element: createRichTextInput({
              actionId: "desc",
              placeholder: "Enter detailed description",
            }),
            optional: true,
          }),
          createInputBlock({
            blockId: "assignee",
            label: "Assignee",
            element: createUserSelect({
              actionId: "user",
              placeholder: "Select assignee",
            }),
          }),
          createInputBlock({
            blockId: "notifications",
            label: "Notifications",
            element: createCheckboxes({
              actionId: "notif",
              options: [
                { text: "Email", value: "email" },
                { text: "Slack", value: "slack" },
              ],
            }),
          }),
        ],
        submit: "Create",
        close: "Cancel",
        callbackId: "complex_modal",
        privateMetadata: JSON.stringify({ source: "escalation" }),
        clearOnClose: false,
        notifyOnClose: true,
      });
      
      expect((modal as any).blocks).toHaveLength(3);
      expect((modal as any).private_metadata).toContain("escalation");
      expect((modal as any).clear_on_close).toBe(false);
      expect((modal as any).notify_on_close).toBe(true);
    });
  });

  describe("Error Handling and Edge Cases", () => {
    it("should handle empty options gracefully", () => {
      expect(() => createStaticSelect({
        actionId: "empty_select",
        placeholder: "Choose",
        options: [],
      })).not.toThrow();
    });

    it("should handle invalid action IDs", () => {
      expect(validateActionId("invalid action id")).toBe(false);
      expect(validateActionId("valid_action_id")).toBe(true);
    });

    it("should handle invalid block IDs", () => {
      expect(validateBlockId("invalid block id")).toBe(false);
      expect(validateBlockId("valid_block_id")).toBe(true);
    });

    it("should handle malformed dates and times", () => {
      const datePicker = createDatePicker({
        actionId: "date",
        initialDate: "2024-13-45", // Invalid date
      });
      
      const timePicker = createTimePicker({
        actionId: "time",
        initialTime: "25:99", // Invalid time
      });
      
      expect((datePicker as any).initial_date).toBe("2024-13-45");
      expect((timePicker as any).initial_time).toBe("25:99");
    });

    it("should handle very long text in inputs", () => {
      const longText = "A".repeat(1000);
      
      const textInput = createPlainTextInput({
        actionId: "long_input",
        placeholder: longText,
      });
      
      expect((textInput as any).placeholder.text).toBe(longText);
    });

    it("should handle special characters in options", () => {
      const options = [
        { text: "Option & Special <chars>", value: "special" },
        { text: "Unicode: ñáéíóú 🚀", value: "unicode" },
      ];
      
      const select = createStaticSelect({
        actionId: "special_select",
        placeholder: "Choose",
        options,
      });
      
      expect((select as any).options[0].text.text).toBe("Option & Special <chars>");
      expect((select as any).options[1].text.text).toBe("Unicode: ñáéíóú 🚀");
    });
  });
});