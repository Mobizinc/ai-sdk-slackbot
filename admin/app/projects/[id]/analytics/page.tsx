"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { TrendingUp, Users, AlertTriangle, CheckCircle, Clock, Activity, GitBranch, Shield } from "lucide-react";
import { apiClient, type ProjectAnalytics } from "@/lib/api-client";
import { toast } from "sonner";

export default function AnalyticsPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [analytics, setAnalytics] = useState<ProjectAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiClient.getProjectAnalytics(projectId);
      setAnalytics(data);
    } catch (error) {
      console.error("Failed to load analytics:", error);
      toast.error("Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    void loadAnalytics();
  }, [projectId, loadAnalytics]);

  if (loading) {
    return <div className="text-center py-8">Loading analytics...</div>;
  }

  if (!analytics) {
    return <div className="text-center py-8">No analytics available</div>;
  }

  const getTimelineIcon = (type: string) => {
    switch (type) {
      case "project_created":
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "standup":
        return <Users className="w-4 h-4 text-blue-600" />;
      case "interview":
        return <TrendingUp className="w-4 h-4 text-purple-600" />;
      default:
        return <Activity className="w-4 h-4 text-gray-600" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* SPM & GitHub Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {analytics.spmSummary && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-purple-600" />
              <h3 className="text-sm font-semibold text-gray-900">SPM</h3>
            </div>
            <p className="text-sm text-gray-900">Project: {analytics.spmSummary.number}</p>
            <p className="text-sm text-gray-500">State: {analytics.spmSummary.state} | {analytics.spmSummary.percentComplete ?? 0}%</p>
            <p className="text-sm text-gray-500">Priority: {analytics.spmSummary.priority || "n/a"}</p>
            {analytics.spmSummary.stories && analytics.spmSummary.stories.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-gray-500 uppercase">Stories</p>
                <ul className="text-sm text-gray-800 list-disc list-inside space-y-1">
                  {analytics.spmSummary.stories.slice(0, 5).map((s) => (
                    <li key={s.number}>{s.number}: {s.shortDescription}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {analytics.githubSummary && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <GitBranch className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-gray-900">GitHub</h3>
            </div>
            <p className="text-sm text-gray-900">{analytics.githubSummary.fullName}</p>
            <p className="text-sm text-gray-500">
              Default branch: {analytics.githubSummary.defaultBranch} | Open issues: {analytics.githubSummary.openIssuesCount} | Open PRs: {analytics.githubSummary.openPrCount}
            </p>
          </div>
        )}
      </div>

      {/* Standup Analytics */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Users className="w-5 h-5" />
          Standup Analytics
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-sm text-blue-600 font-medium mb-1">Completion Rate</p>
            <p className="text-2xl font-bold text-blue-900">
              {analytics.standupAnalytics.completionRate.toFixed(1)}%
            </p>
          </div>
          <div className="bg-yellow-50 rounded-lg p-4">
            <p className="text-sm text-yellow-600 font-medium mb-1">Blockers</p>
            <p className="text-2xl font-bold text-yellow-900">
              {analytics.standupAnalytics.blockerFrequency}
            </p>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <p className="text-sm text-green-600 font-medium mb-1">Total Standups</p>
            <p className="text-2xl font-bold text-green-900">
              {analytics.standupAnalytics.totalStandups}
            </p>
          </div>
          <div className="bg-purple-50 rounded-lg p-4">
            <p className="text-sm text-purple-600 font-medium mb-1">Recent Activity</p>
            <p className="text-2xl font-bold text-purple-900">
              {analytics.standupAnalytics.recentActivity.length}
            </p>
          </div>
        </div>

        {analytics.standupAnalytics.recentActivity.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Standups</h3>
            <div className="space-y-2">
              {analytics.standupAnalytics.recentActivity.slice(0, 5).map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded"
                >
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-900">
                      {new Date(activity.scheduledFor).toLocaleDateString()} at{" "}
                      {new Date(activity.scheduledFor).toLocaleTimeString()}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      activity.status === "completed"
                        ? "bg-green-100 text-green-800"
                        : activity.status === "collecting"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {activity.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Interview Analytics */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Interview Analytics
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-purple-50 rounded-lg p-4">
            <p className="text-sm text-purple-600 font-medium mb-1">Total Interviews</p>
            <p className="text-2xl font-bold text-purple-900">
              {analytics.interviewAnalytics.total}
            </p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-sm text-blue-600 font-medium mb-1">Avg Match Score</p>
            <p className="text-2xl font-bold text-blue-900">
              {analytics.interviewAnalytics.avgMatchScore}
            </p>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <p className="text-sm text-green-600 font-medium mb-1">Conversion Rate</p>
            <p className="text-2xl font-bold text-green-900">
              {analytics.interviewAnalytics.conversionRate.toFixed(1)}%
            </p>
          </div>
        </div>

        {analytics.interviewAnalytics.topConcerns.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Top Concerns
            </h3>
            <div className="flex flex-wrap gap-2">
              {analytics.interviewAnalytics.topConcerns.map((concern, i) => (
                <span
                  key={i}
                  className="px-3 py-1 bg-red-50 text-red-700 rounded-full text-sm"
                >
                  {concern}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Task Metrics */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <CheckCircle className="w-5 h-5" />
          Task Metrics
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-orange-50 rounded-lg p-4">
            <p className="text-sm text-orange-600 font-medium mb-1">Total Tasks</p>
            <p className="text-2xl font-bold text-orange-900">
              {analytics.taskMetrics.totalTasks}
            </p>
          </div>
          <div className="bg-yellow-50 rounded-lg p-4">
            <p className="text-sm text-yellow-600 font-medium mb-1">Open Tasks</p>
            <p className="text-2xl font-bold text-yellow-900">
              {analytics.taskMetrics.openTasks}
            </p>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <p className="text-sm text-green-600 font-medium mb-1">Completed</p>
            <p className="text-2xl font-bold text-green-900">
              {analytics.taskMetrics.completedTasks}
            </p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-sm text-blue-600 font-medium mb-1">Task Velocity</p>
            <p className="text-2xl font-bold text-blue-900">
              {analytics.taskMetrics.taskVelocity}/week
            </p>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Activity Timeline
        </h2>

        <div className="space-y-3">
          {analytics.timeline.map((event, i) => {
            const rawMatchScore = (event as { matchScore?: unknown }).matchScore
            const matchScore = typeof rawMatchScore === "number" ? rawMatchScore : null

            return (
              <div key={i} className="flex items-start gap-4 p-3 bg-gray-50 rounded-lg">
                <div className="mt-1">{getTimelineIcon(event.type)}</div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{event.description}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(event.timestamp).toLocaleString()}
                  </p>
                  {matchScore !== null && (
                    <span className="inline-block mt-1 px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-xs">
                      Match Score: {matchScore}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {analytics.timeline.length === 0 && (
          <p className="text-gray-500 text-center py-8">No activity recorded yet</p>
        )}
      </div>

      {/* Summary Card */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Project Summary</h3>
        <p className="text-sm text-gray-700 mb-4">
          <strong>{analytics.projectName}</strong> has been actively monitored with{" "}
          <strong>{analytics.standupAnalytics.totalStandups} standups</strong> and{" "}
          <strong>{analytics.interviewAnalytics.total} interviews</strong> conducted.
        </p>
        {analytics.standupAnalytics.completionRate > 80 && (
          <div className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle className="w-4 h-4" />
            High standup engagement ({analytics.standupAnalytics.completionRate.toFixed(1)}%)
          </div>
        )}
        {analytics.standupAnalytics.blockerFrequency > 5 && (
          <div className="flex items-center gap-2 text-sm text-yellow-700 mt-2">
            <AlertTriangle className="w-4 h-4" />
            Multiple blockers reported - consider intervention
          </div>
        )}
      </div>
    </div>
  );
}
