"use client"

import { useEffect, useState } from "react"
import { apiClient } from "@/lib/api-client"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { AlertCircle } from "lucide-react"

export default function MissingCategoriesPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  useEffect(() => {
    loadData()
  }, [days])

  async function loadData() {
    try {
      setLoading(true)
      const result = await apiClient.getMissingCategories(days)
      setData(result)
    } catch (error) {
      console.error('Failed to load missing categories:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>
  }

  if (!data || data.statistics.totalMismatches === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
        <h2 className="text-xl font-semibold text-green-800 mb-2">No Missing Categories!</h2>
        <p className="text-green-600">All AI suggestions matched existing ServiceNow categories.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Missing Categories</h1>
          <p className="text-gray-600">AI-suggested categories that don't exist in ServiceNow</p>
        </div>
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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Total Mismatches</p>
          <p className="text-3xl font-bold text-gray-900">{data.statistics.totalMismatches}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Unique Categories</p>
          <p className="text-3xl font-bold text-blue-600">{data.statistics.uniqueCategories}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Avg Confidence</p>
          <p className="text-3xl font-bold text-green-600">{Math.round(data.statistics.avgConfidence * 100)}%</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Reviewed</p>
          <p className="text-3xl font-bold text-purple-600">
            {data.statistics.reviewedCount}/{data.statistics.totalMismatches}
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Missing Categories</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data.topCategories}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="category" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="count" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Category Details */}
      <div className="space-y-6">
        {data.categoriesWithDetails.map((cat: any, i: number) => (
          <div key={cat.category} className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">{i + 1}. {cat.category}</h3>
                <p className="text-sm text-gray-500">{cat.caseCount} cases</p>
              </div>
              <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                High Priority
              </span>
            </div>

            {cat.subcategories.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Suggested Subcategories:</p>
                <div className="flex flex-wrap gap-2">
                  {cat.subcategories.map((sub: string) => (
                    <span key={sub} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm">
                      {sub}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Recent Cases:</p>
              <div className="space-y-2">
                {cat.cases.map((c: any) => (
                  <div key={c.caseNumber} className="border-l-4 border-blue-500 pl-3 py-1">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono">{c.caseNumber}</code>
                      <span className="text-xs text-gray-500">→ Corrected to: {c.correctedTo}</span>
                      <span className="text-xs text-green-600">{Math.round(c.confidence * 100)}% confidence</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{c.description.substring(0, 120)}...</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
