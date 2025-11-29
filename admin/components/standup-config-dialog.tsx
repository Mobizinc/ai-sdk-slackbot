"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toast } from "sonner";
import { apiClient, type StandupConfig } from "@/lib/api-client";

interface StandupConfigDialogProps {
  projectId: string;
  currentConfig: StandupConfig | null;
  projectChannelId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function StandupConfigDialog({
  projectId,
  currentConfig,
  projectChannelId,
  open,
  onOpenChange,
  onSuccess,
}: StandupConfigDialogProps) {
  const [enabled, setEnabled] = useState<boolean>(currentConfig?.enabled ?? false);
  const [channelId, setChannelId] = useState<string>(currentConfig?.channelId || projectChannelId || "");
  const [frequency, setFrequency] = useState<string>(currentConfig?.schedule?.frequency || currentConfig?.cadence || "daily");
  const [dayOfWeek, setDayOfWeek] = useState<number>(currentConfig?.schedule?.dayOfWeek ?? 1);
  const [timeUtc, setTimeUtc] = useState<string>(currentConfig?.schedule?.timeUtc || currentConfig?.timeUtc || "13:00");
  const [useSpmTasks, setUseSpmTasks] = useState<boolean>(currentConfig?.dataSources?.useSpmTasks ?? false);
  const [useGithubIssues, setUseGithubIssues] = useState<boolean>(currentConfig?.dataSources?.useGithubIssues ?? false);
  const [useLocalOpenTasks, setUseLocalOpenTasks] = useState<boolean>(
    currentConfig?.dataSources?.useLocalOpenTasks ?? true
  );
  const [channelOptions, setChannelOptions] = useState<Array<{ id: string; name: string; isPrivate?: boolean }>>([]);
  const [channelSearch, setChannelSearch] = useState("");
  const [validatingChannel, setValidatingChannel] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEnabled(currentConfig?.enabled ?? false);
    setChannelId(currentConfig?.channelId || projectChannelId || "");
    setFrequency(currentConfig?.schedule?.frequency || currentConfig?.cadence || "daily");
    setDayOfWeek(currentConfig?.schedule?.dayOfWeek ?? 1);
    setTimeUtc(currentConfig?.schedule?.timeUtc || currentConfig?.timeUtc || "13:00");
    setUseSpmTasks(currentConfig?.dataSources?.useSpmTasks ?? false);
    setUseGithubIssues(currentConfig?.dataSources?.useGithubIssues ?? false);
    setUseLocalOpenTasks(currentConfig?.dataSources?.useLocalOpenTasks ?? true);
  }, [currentConfig, projectChannelId]);

  useEffect(() => {
    const loadChannels = async () => {
      try {
        const data = await apiClient.listSlackChannels();
        setChannelOptions(data.channels || []);
      } catch (error) {
        console.error("Failed to load Slack channels:", error);
      }
    };
    loadChannels().catch(() => null);
  }, []);

  const filteredChannels = useMemo(() => {
    if (!channelSearch.trim()) return channelOptions;
    const needle = channelSearch.toLowerCase();
    return channelOptions.filter((ch) => ch.name.toLowerCase().includes(needle) || ch.id.toLowerCase().includes(needle));
  }, [channelOptions, channelSearch]);

  const handleSave = async () => {
    if (enabled && !channelId) {
      toast.error("Channel ID is required when standups are enabled");
      return;
    }

    try {
      setSaving(true);
      await apiClient.updateStandupConfig(projectId, {
        enabled,
        channelId: channelId || null,
        schedule: {
          frequency: frequency as any,
          timeUtc,
          dayOfWeek: frequency === "weekly" ? dayOfWeek : undefined,
        },
        cadence: frequency, // legacy fallback
        timeUtc,
        dataSources: {
          useSpmTasks,
          useGithubIssues,
          useLocalOpenTasks,
        },
      });
      toast.success("Standup configuration saved");
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save standup config:", error);
      toast.error("Failed to save standup config");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Standup Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Enable Standups</p>
              <p className="text-xs text-gray-500">Toggle daily/weekly standups for this project</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="channel">Slack Channel</Label>
            <div className="space-y-2">
              <Input
                placeholder="Search channels"
                value={channelSearch}
                onChange={(e) => setChannelSearch(e.target.value)}
                disabled={!enabled}
              />
              <Select
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                disabled={!enabled}
              >
                <option value="">Default (project channel)</option>
                {filteredChannels.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.name} {ch.isPrivate ? "(private)" : ""}
                  </option>
                ))}
              </Select>
            </div>
            <Input
              id="channel"
              placeholder="Or paste channel ID (e.g., C0123456789)"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              disabled={!enabled}
              className="mt-2"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">Defaults to project channel if empty.</p>
              <Button
                variant="outline"
                size="sm"
                disabled={!enabled || !channelId || validatingChannel}
                onClick={async () => {
                  if (!channelId) return;
                  try {
                    setValidatingChannel(true);
                    await apiClient.validateSlackChannel(channelId);
                    toast.success("Channel is valid and bot is present");
                  } catch (error) {
                    console.error("Channel validation failed:", error);
                    toast.error("Channel validation failed");
                  } finally {
                    setValidatingChannel(false);
                  }
                }}
              >
                {validatingChannel ? "Validating..." : "Validate"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Cadence</Label>
              <Select value={frequency} onChange={(e) => setFrequency(e.target.value)} disabled={!enabled}>
                <option value="daily">Daily</option>
                <option value="weekdays">Weekdays</option>
                <option value="weekly">Weekly</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Time (UTC)</Label>
              <Input
                type="time"
                value={timeUtc}
                onChange={(e) => setTimeUtc(e.target.value)}
                disabled={!enabled}
              />
            </div>
          </div>
          {frequency === "weekly" && (
            <div className="space-y-2">
              <Label>Day of Week</Label>
              <Select
                value={dayOfWeek.toString()}
                onChange={(e) => setDayOfWeek(Number(e.target.value))}
                disabled={!enabled}
              >
                <option value="1">Monday</option>
                <option value="2">Tuesday</option>
                <option value="3">Wednesday</option>
                <option value="4">Thursday</option>
                <option value="5">Friday</option>
                <option value="6">Saturday</option>
                <option value="0">Sunday</option>
              </Select>
            </div>
          )}

          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-900">Data Sources</p>
            <div className="flex items-center justify-between border rounded p-3">
              <div>
                <p className="text-sm text-gray-900">ServiceNow SPM tasks</p>
                <p className="text-xs text-gray-500">Include SPM stories/epics in standups</p>
              </div>
              <Switch checked={useSpmTasks} onCheckedChange={setUseSpmTasks} disabled={!enabled} />
            </div>
            <div className="flex items-center justify-between border rounded p-3">
              <div>
                <p className="text-sm text-gray-900">GitHub issues/PRs</p>
                <p className="text-xs text-gray-500">Include repo issues and PRs</p>
              </div>
              <Switch checked={useGithubIssues} onCheckedChange={setUseGithubIssues} disabled={!enabled} />
            </div>
            <div className="flex items-center justify-between border rounded p-3">
              <div>
                <p className="text-sm text-gray-900">Local open tasks</p>
                <p className="text-xs text-gray-500">Use tasks entered on the project record</p>
              </div>
              <Switch checked={useLocalOpenTasks} onCheckedChange={setUseLocalOpenTasks} disabled={!enabled} />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
