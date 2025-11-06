"use client"


import { useEffect, useState } from "react"
import { apiClient, type QueueStats } from "@/lib/api-client"
import { Activity, Clock, CheckCircle, XCircle } from "lucide-react"

export default function MonitoringPage() {
  const [stats, setStats] = useState<QueueStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadStats()
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadStats, 30000)
    return () => clearInterval(interval)
  }, [])

  async function loadStats() {
    try {
      setError(null)
      const data = await apiClient.getQueueStats()
      setStats(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading queue statistics...</p>
        </div>
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-red-800 font-semibold mb-2">Error Loading Stats</h3>
        <p className="text-red-600">{error || 'No data available'}</p>
        <button
          onClick={loadStats}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Queue Monitoring</h1>
          <p className="text-gray-600">Real-time async triage performance</p>
        </div>
        <button
          onClick={loadStats}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Queue Config Status */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Queue Configuration</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-500 mb-1">Async Triage</p>
            <p className={`font-semibold ${stats.queue_config.async_triage_enabled ? 'text-green-600' : 'text-red-600'}`}>
              {stats.queue_config.async_triage_enabled ? '✓ Enabled' : '✗ Disabled'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">QStash</p>
            <p className={`font-semibold ${stats.queue_config.qstash_enabled ? 'text-green-600' : 'text-red-600'}`}>
              {stats.queue_config.qstash_enabled ? '✓ Enabled' : '✗ Disabled'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">QStash Configured</p>
            <p className={`font-semibold ${stats.queue_config.qstash_configured ? 'text-green-600' : 'text-yellow-600'}`}>
              {stats.queue_config.qstash_configured ? '✓ Yes' : '⚠ No'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Worker URL</p>
            <p className="font-semibold text-gray-900 text-sm truncate">{stats.queue_config.worker_url}</p>
          </div>
        </div>
      </div>

      {/* 7-Day Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Total Classifications (7d)</p>
          <p className="text-3xl font-bold text-gray-900">{stats.stats_7d.total_classifications}</p>
          <p className="text-sm text-gray-500 mt-2">
            Avg Confidence: {stats.stats_7d.average_confidence}%
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Avg Processing Time (7d)</p>
          <p className="text-3xl font-bold text-gray-900">{stats.stats_7d.average_processing_time_ms}ms</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Today's Classifications</p>
          <p className="text-3xl font-bold text-gray-900">{stats.stats_24h.total_classifications}</p>
          <p className="text-sm text-gray-500 mt-2">
            Avg Time: {stats.stats_24h.average_processing_time_ms}ms
          </p>
        </div>
      </div>

      {/* Recent Performance */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Performance</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <p className="text-sm text-gray-500 mb-1">Sample Size</p>
            <p className="text-xl font-bold text-gray-900">{stats.recent_performance.sample_size}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Avg Time</p>
            <p className="text-xl font-bold text-gray-900">{stats.recent_performance.avg_processing_time_ms}ms</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Min Time</p>
            <p className="text-xl font-bold text-green-600">{stats.recent_performance.min_processing_time_ms}ms</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Max Time</p>
            <p className="text-xl font-bold text-orange-600">{stats.recent_performance.max_processing_time_ms}ms</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Failure Rate</p>
            <p className={`text-xl font-bold ${stats.recent_performance.failure_rate > 5 ? 'text-red-600' : 'text-green-600'}`}>
              {stats.recent_performance.failure_rate}%
            </p>
          </div>
        </div>
      </div>

      {/* Recent Classifications */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Recent Classifications</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Case
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Workflow
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Processing Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Confidence
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Age
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {stats.recent_classifications.map((classification) => (
                <tr key={classification.case_number} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <code className="text-sm font-mono text-gray-900">{classification.case_number}</code>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {classification.workflow_id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {classification.processing_time_ms}ms
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded ${
                      classification.confidence_score >= 80 ? 'bg-green-100 text-green-700' :
                      classification.confidence_score >= 60 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {classification.confidence_score}%
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {classification.age_minutes}m ago
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-sm text-gray-500 mt-4 text-center">
        Last updated: {new Date(stats.timestamp).toLocaleString()} • Auto-refreshes every 30s
      </p>
    </div>
  )
}
