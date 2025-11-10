"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { apiClient, type StandupConfig } from "@/lib/api-client";
import { Hash, Clock, Users, AlertCircle } from "lucide-react";

interface StandupConfigDialogProps {
  projectId: string;
  currentConfig: StandupConfig | null;
  projectChannelId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function StandupConfigDialog({
  projectId,
  currentConfig,
  projectChannelId,
  open,
  onOpenChange,
  onSuccess,
}: StandupConfigDialogProps) {
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [channelId, setChannelId] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekdays" | "weekly">("weekdays");
  const [time, setTime] = useState("09:00");
  const [dayOfWeek, setDayOfWeek] = useState<number>(1);
  const [participants, setParticipants] = useState("");
  const [includeMentor, setIncludeMentor] = useState(true);
  const [includeAcceptedCandidates, setIncludeAcceptedCandidates] = useState(true);
  const [collectionWindowMinutes, setCollectionWindowMinutes] = useState(120);
  const [reminderMinutesBeforeDue, setReminderMinutesBeforeDue] = useState(60);
  const [maxReminders, setMaxReminders] = useState(2);

  // Load current config when dialog opens
  useEffect(() => {
    if (open && currentConfig) {
      setEnabled(currentConfig.enabled ?? false);
      setChannelId(currentConfig.channelId ?? "");

      // Parse schedule if it exists
      if (currentConfig.schedule) {
        setFrequency(currentConfig.schedule.frequency ?? "weekdays");
        setTime(currentConfig.schedule.timeUtc ?? "09:00");
        setDayOfWeek(currentConfig.schedule.dayOfWeek ?? 1);
      } else if (currentConfig.cadence && currentConfig.time) {
        // Fallback to old format
        setFrequency(currentConfig.cadence as "daily" | "weekdays" | "weekly");
        setTime(currentConfig.time);
      }

      setParticipants(currentConfig.participants?.join(", ") ?? "");
      setIncludeMentor(currentConfig.includeMentor ?? true);
      setIncludeAcceptedCandidates(currentConfig.includeAcceptedCandidates ?? true);
      setCollectionWindowMinutes(currentConfig.collectionWindowMinutes ?? 120);
      setReminderMinutesBeforeDue(currentConfig.reminderMinutesBeforeDue ?? 60);
      setMaxReminders(currentConfig.maxReminders ?? 2);
    }
  }, [open, currentConfig]);

  const handleSave = async () => {
    try {
      setSaving(true);

      // Validate channel ID format (should start with C)
      if (channelId && !channelId.match(/^C[A-Z0-9]+$/)) {
        toast.error("Invalid channel ID format. Channel IDs should start with 'C' followed by alphanumeric characters.");
        return;
      }

      // Parse participants
      const participantList = participants
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);

      // Build config object
      const config: StandupConfig = {
        enabled,
        channelId: channelId || undefined,
        schedule: {
          frequency,
          timeUtc: time,
          dayOfWeek: frequency === "weekly" ? dayOfWeek : undefined,
        },
        participants: participantList,
        includeMentor,
        includeAcceptedCandidates,
        questions: currentConfig?.questions ?? [],
        collectionWindowMinutes,
        reminderMinutesBeforeDue,
        maxReminders,
      };

      await apiClient.updateStandupConfig(projectId, config);
      toast.success("Standup configuration updated successfully!");
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save standup config:", error);
      toast.error("Failed to save standup configuration");
    } finally {
      setSaving(false);
    }
  };

  const effectiveChannelId = channelId || projectChannelId || "Not configured";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configure Stand-up Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Enable/Disable */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Enable Stand-ups</Label>
              <p className="text-sm text-gray-500">Automatically schedule and collect stand-ups</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {/* Channel Configuration */}
          <div className="space-y-2">
            <Label htmlFor="channelId" className="flex items-center gap-2">
              <Hash className="w-4 h-4" />
              Slack Channel ID
            </Label>
            <Input
              id="channelId"
              placeholder={`e.g., C01234ABCDE (default: ${projectChannelId || "none"})`}
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              className="font-mono"
            />
            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-900">
                <p className="font-medium">How to find a Channel ID:</p>
                <ol className="list-decimal ml-4 mt-1 space-y-1">
                  <li>Right-click on the channel in Slack</li>
                  <li>Select &ldquo;View channel details&rdquo;</li>
                  <li>Scroll to the bottom and copy the Channel ID</li>
                </ol>
                <p className="mt-2">
                  <strong>Current effective channel:</strong>{" "}
                  <code className="bg-blue-100 px-1 rounded">{effectiveChannelId}</code>
                </p>
              </div>
            </div>
          </div>

          {/* Schedule */}
          <div className="space-y-4">
            <Label className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Schedule
            </Label>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="frequency">Frequency</Label>
                <Select
                  id="frequency"
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as typeof frequency)}
                >
                  <option value="daily">Daily</option>
                  <option value="weekdays">Weekdays (Mon-Fri)</option>
                  <option value="weekly">Weekly</option>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="time">Time (UTC)</Label>
                <Input
                  id="time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
            </div>

            {frequency === "weekly" && (
              <div className="space-y-2">
                <Label htmlFor="dayOfWeek">Day of Week</Label>
                <Select
                  id="dayOfWeek"
                  value={dayOfWeek.toString()}
                  onChange={(e) => setDayOfWeek(parseInt(e.target.value))}
                >
                  <option value="0">Sunday</option>
                  <option value="1">Monday</option>
                  <option value="2">Tuesday</option>
                  <option value="3">Wednesday</option>
                  <option value="4">Thursday</option>
                  <option value="5">Friday</option>
                  <option value="6">Saturday</option>
                </Select>
              </div>
            )}
          </div>

          {/* Participants */}
          <div className="space-y-2">
            <Label htmlFor="participants" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Additional Participants (Slack User IDs)
            </Label>
            <Input
              id="participants"
              placeholder="U01234ABCDE, U56789FGHIJ (comma-separated)"
              value={participants}
              onChange={(e) => setParticipants(e.target.value)}
              className="font-mono"
            />
          </div>

          {/* Auto-include options */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="includeMentor" className="text-sm">Include project mentor</Label>
              <Switch id="includeMentor" checked={includeMentor} onCheckedChange={setIncludeMentor} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="includeAcceptedCandidates" className="text-sm">Include accepted candidates</Label>
              <Switch
                id="includeAcceptedCandidates"
                checked={includeAcceptedCandidates}
                onCheckedChange={setIncludeAcceptedCandidates}
              />
            </div>
          </div>

          {/* Timing Configuration */}
          <div className="space-y-4">
            <Label className="text-base">Timing Configuration</Label>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="collectionWindow" className="text-sm">Collection Window (min)</Label>
                <Input
                  id="collectionWindow"
                  type="number"
                  min="15"
                  max="720"
                  value={collectionWindowMinutes}
                  onChange={(e) => setCollectionWindowMinutes(parseInt(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reminderTime" className="text-sm">Reminder Before Due (min)</Label>
                <Input
                  id="reminderTime"
                  type="number"
                  min="5"
                  max="720"
                  value={reminderMinutesBeforeDue}
                  onChange={(e) => setReminderMinutesBeforeDue(parseInt(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxReminders" className="text-sm">Max Reminders</Label>
                <Input
                  id="maxReminders"
                  type="number"
                  min="0"
                  max="5"
                  value={maxReminders}
                  onChange={(e) => setMaxReminders(parseInt(e.target.value))}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Configuration"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
