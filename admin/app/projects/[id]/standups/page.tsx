"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Calendar, Users, Play, CheckCircle, XCircle, AlertCircle, ChevronDown, ChevronUp, Settings } from "lucide-react";
import { apiClient, type Standup, type StandupConfig, type StandupResponse } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { StandupConfigDialog } from "@/components/standup-config-dialog";

export default function StandupsPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [standups, setStandups] = useState<Standup[]>([]);
  const [config, setConfig] = useState<StandupConfig | null>(null);
  const [projectChannelId, setProjectChannelId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [expandedStandup, setExpandedStandup] = useState<string | null>(null);
  const [standupResponses, setStandupResponses] = useState<Record<string, StandupResponse[]>>({});
  const [configDialogOpen, setConfigDialogOpen] = useState(false);

  const loadStandups = useCallback(async () => {
    try {
      setLoading(true);
      const [standupData, projectData] = await Promise.all([
        apiClient.getProjectStandups(projectId),
        apiClient.getProject(projectId),
      ]);
      setStandups(standupData.standups);
      setConfig(standupData.config);
      setProjectChannelId(projectData.channelId);
    } catch (error) {
      console.error("Failed to load standups:", error);
      toast.error("Failed to load standups");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    void loadStandups();
  }, [projectId, loadStandups]);

  const handleTriggerStandup = async () => {
    try {
      setTriggering(true);
      await apiClient.triggerStandup(projectId);
      toast.success("Standup triggered successfully!");
      await loadStandups();
    } catch (error) {
      console.error("Failed to trigger standup:", error);
      toast.error("Failed to trigger standup");
    } finally {
      setTriggering(false);
    }
  };

  const toggleStandupDetails = async (standupId: string) => {
    if (expandedStandup === standupId) {
      setExpandedStandup(null);
      return;
    }

    setExpandedStandup(standupId);

    if (!standupResponses[standupId]) {
      try {
        const data = await apiClient.getStandupDetails(projectId, standupId);
        setStandupResponses((prev) => ({ ...prev, [standupId]: data.responses }));
      } catch (error) {
        console.error("Failed to load standup responses:", error);
        toast.error("Failed to load responses");
      }
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case "collecting":
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      case "failed":
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "collecting":
        return "bg-yellow-100 text-yellow-800";
      case "failed":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading standups...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Configuration Panel */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Standup Configuration</h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setConfigDialogOpen(true)}
              className="gap-2"
            >
              <Settings className="w-4 h-4" />
              Configure
            </Button>
            <Button onClick={handleTriggerStandup} disabled={triggering || !config?.enabled} className="gap-2">
              <Play className="w-4 h-4" />
              {triggering ? "Triggering..." : "Trigger Standup Now"}
            </Button>
          </div>
        </div>

        {config ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <span className="text-sm font-medium text-gray-500">Status</span>
                <p className="text-gray-900 mt-1">
                  {config.enabled ? (
                    <span className="text-green-600">Enabled</span>
                  ) : (
                    <span className="text-gray-400">Disabled</span>
                  )}
                </p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">Frequency</span>
                <p className="text-gray-900 mt-1">
                  {config.schedule?.frequency || config.cadence || "Not configured"}
                </p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">Time (UTC)</span>
                <p className="text-gray-900 mt-1">
                  {config.schedule?.timeUtc || config.time || "Not configured"}
                </p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">Participants</span>
                <p className="text-gray-900 mt-1">{config.participants?.length || 0}</p>
              </div>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-500">Channel</span>
              <p className="text-gray-900 mt-1 font-mono text-sm">
                {config.channelId || projectChannelId || "Not configured"}
                {config.channelId && config.channelId !== projectChannelId && (
                  <span className="text-xs text-gray-500 ml-2">(override)</span>
                )}
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-gray-500 mb-3">No standup configuration found</p>
            <Button variant="outline" onClick={() => setConfigDialogOpen(true)}>
              <Settings className="w-4 h-4 mr-2" />
              Configure Standups
            </Button>
          </div>
        )}
      </div>

      {/* Config Dialog */}
      <StandupConfigDialog
        projectId={projectId}
        currentConfig={config}
        projectChannelId={projectChannelId}
        open={configDialogOpen}
        onOpenChange={setConfigDialogOpen}
        onSuccess={loadStandups}
      />

      {/* Upcoming Standups */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Upcoming Standups</h2>
        <div className="space-y-3">
          {standups
            .filter((s) => new Date(s.scheduledFor) > new Date() && s.status !== "completed")
            .slice(0, 5)
            .map((standup) => (
              <div
                key={standup.id}
                className="flex items-center justify-between p-3 bg-blue-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {new Date(standup.scheduledFor).toLocaleDateString()} at{" "}
                      {new Date(standup.scheduledFor).toLocaleTimeString()}
                    </p>
                    <p className="text-xs text-gray-500">
                      Collect until {new Date(standup.collectUntil).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(standup.status)}`}
                >
                  {standup.status}
                </span>
              </div>
            ))}
          {standups.filter((s) => new Date(s.scheduledFor) > new Date()).length === 0 && (
            <p className="text-gray-500 text-center py-4">No upcoming standups scheduled</p>
          )}
        </div>
      </div>

      {/* Recent Standups */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Standups</h2>
        <div className="space-y-3">
          {standups.slice(0, 10).map((standup) => {
            const isExpanded = expandedStandup === standup.id;
            const responses = standupResponses[standup.id] || [];
            const blockers = responses.filter((r) => r.blockerFlag).length;

            return (
              <div key={standup.id} className="border border-gray-200 rounded-lg">
                <button
                  onClick={() => toggleStandupDetails(standup.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1">
                    {getStatusIcon(standup.status)}
                    <div className="text-left flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {new Date(standup.scheduledFor).toLocaleDateString()} at{" "}
                        {new Date(standup.scheduledFor).toLocaleTimeString()}
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {responses.length} responses
                        </span>
                        {blockers > 0 && (
                          <span className="flex items-center gap-1 text-red-600">
                            <AlertCircle className="w-3 h-3" />
                            {blockers} blockers
                          </span>
                        )}
                        {standup.completedAt && (
                          <span>
                            Completed {new Date(standup.completedAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(standup.status)}`}
                    >
                      {standup.status}
                    </span>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-gray-400 ml-2" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400 ml-2" />
                  )}
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-200 p-4 bg-gray-50">
                    {/* Error Display for Failed Standups */}
                    {standup.status === "failed" && standup.metadata?.error && (
                      <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <h4 className="text-sm font-medium text-red-900 mb-1">Standup Failed</h4>
                            <p className="text-sm text-red-700">{String(standup.metadata.error)}</p>
                            {standup.metadata.channelId && (
                              <p className="text-xs text-red-600 mt-1 font-mono">
                                Channel: {String(standup.metadata.channelId)}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {responses.length > 0 ? (
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium text-gray-900 mb-2">Participant Responses</h4>
                        {responses.map((response) => (
                          <div
                            key={response.id}
                            className={`p-3 rounded ${
                              response.blockerFlag ? "bg-red-50 border border-red-200" : "bg-white"
                            }`}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <span className="text-sm font-medium text-gray-900 font-mono">
                                {response.participantSlackId}
                              </span>
                              <span className="text-xs text-gray-500">
                                {new Date(response.submittedAt).toLocaleString()}
                              </span>
                            </div>
                            {response.blockerFlag && (
                              <div className="flex items-center gap-1 text-xs text-red-700 font-medium mb-2">
                                <AlertCircle className="w-3 h-3" />
                                Has blockers
                              </div>
                            )}
                            <div className="space-y-1 text-sm">
                              {Object.entries(response.answers).map(([key, value]) => (
                                <div key={key}>
                                  <span className="font-medium text-gray-700">{key}:</span>{" "}
                                  <span className="text-gray-900">{String(value)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm text-center py-4">No responses yet</p>
                    )}

                    {standup.summary && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <h4 className="text-sm font-medium text-gray-900 mb-2">Summary</h4>
                        <div className="bg-white p-3 rounded text-sm text-gray-700">
                          {JSON.stringify(standup.summary, null, 2)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {standups.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-3">No standups have been conducted yet</p>
              <Button onClick={handleTriggerStandup} disabled={triggering}>
                Trigger First Standup
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
