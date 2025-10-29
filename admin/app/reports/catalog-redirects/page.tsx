"use client"

import { useEffect, useState } from "react"
import { apiClient } from "@/lib/api-client"
import { LineChart, Line, PieChart, Pie, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'
import { TrendingUp } from "lucide-react"

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444']

export default function CatalogRedirectsPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedClient, setSelectedClient] = useState<string>('')
  const [days, setDays] = useState(30)

  useEffect(() => {
    loadData()
  }, [selectedClient, days])

  async function loadData() {
    try {
      setLoading(true)
      const result = await apiClient.getCatalogRedirectStats(selectedClient || undefined, days)
      setData(result)
    } catch (error) {
      console.error('Failed to load catalog redirect stats:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>
  }

  // Handle both single client and all clients response
  const metrics = data?.metrics ? (Array.isArray(data.metrics) ? data.metrics[0] : data) : data
  const clients = data?.clients || []

  if (!metrics || metrics.totalRedirects === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center">
        <h2 className="text-xl font-semibold text-yellow-800 mb-2">No Redirects Yet</h2>
        <p className="text-yellow-600">Feature recently enabled or no HR requests have triggered catalog redirect.</p>
      </div>
    )
  }

  // Prepare chart data
  const typeData = Object.entries(metrics.redirectsByType || {}).map(([type, count]) => ({
    name: type,
    value: count as number
  }))

  const keywordData = (metrics.topKeywords || []).slice(0, 10).map((kw: any) => ({
    keyword: kw.keyword,
    count: kw.count
  }))

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Catalog Redirect Analytics</h1>
          <p className="text-gray-600">HR request redirect trends and insights</p>
        </div>
        <div className="flex gap-2">
          {clients.length > 0 && (
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">All Clients</option>
              {clients.map((c: any) => (
                <option key={c.clientId} value={c.clientId}>{c.clientName}</option>
              ))}
            </select>
          )}
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="px-4 py-2 border border-gray-300 rounded-lg"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Total Redirects</p>
          <p className="text-3xl font-bold text-gray-900">{metrics.totalRedirects}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Auto-Closed</p>
          <p className="text-3xl font-bold text-blue-600">{metrics.autoClosedCount}</p>
          <p className="text-xs text-gray-500 mt-1">{Math.round(metrics.autoClosedRate * 100)}% rate</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Avg Confidence</p>
          <p className="text-3xl font-bold text-green-600">{Math.round(metrics.averageConfidence * 100)}%</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Client</p>
          <p className="text-lg font-bold text-gray-900">{metrics.clientName}</p>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Request Type Distribution */}
        {typeData.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Request Type Distribution</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={typeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }: any) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {typeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Daily Trend */}
        {metrics.redirectsByDay && metrics.redirectsByDay.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Trend</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={metrics.redirectsByDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Top Keywords */}
      {keywordData.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Matched Keywords</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={keywordData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="keyword" type="category" width={150} />
              <Tooltip />
              <Bar dataKey="count" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top Submitters */}
      {metrics.topSubmitters && metrics.topSubmitters.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Top Submitters</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Submitter</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cases Redirected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {metrics.topSubmitters.map((sub: any, i: number) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">{sub.submitter}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{sub.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
