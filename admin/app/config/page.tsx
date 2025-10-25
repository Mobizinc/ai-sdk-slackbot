"use client"

import { useEffect, useState } from "react"
import { apiClient, type ConfigValue } from "@/lib/api-client"
import { Settings, Search } from "lucide-react"

export default function ConfigPage() {
  const [config, setConfig] = useState<ConfigValue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGroup, setSelectedGroup] = useState<string>('all')

  useEffect(() => {
    loadConfig()
  }, [])

  async function loadConfig() {
    try {
      setLoading(true)
      setError(null)
      const data = await apiClient.getConfig()
      setConfig(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load configuration')
    } finally {
      setLoading(false)
    }
  }

  const groups = Array.from(new Set(config.map(c => c.definition.group))).sort()

  const filteredConfig = config.filter((item) => {
    const matchesGroup = selectedGroup === 'all' || item.definition.group === selectedGroup
    const matchesSearch = searchQuery === '' ||
      item.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.definition.description.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesGroup && matchesSearch
  })

  const groupedConfig = groups.reduce((acc, group) => {
    acc[group] = filteredConfig.filter(c => c.definition.group === group)
    return acc
  }, {} as Record<string, ConfigValue[]>)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading configuration...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-red-800 font-semibold mb-2">Error Loading Configuration</h3>
        <p className="text-red-600">{error}</p>
        <button
          onClick={loadConfig}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Settings className="w-8 h-8 text-gray-700" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Configuration</h1>
            <p className="text-gray-600 mt-1">System settings and environment variables</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search configuration..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Groups</option>
            {groups.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Config Groups */}
      <div className="space-y-6">
        {Object.entries(groupedConfig).map(([group, items]) => {
          if (items.length === 0) return null

          return (
            <div key={group} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 capitalize">
                  {group.replace(/_/g, ' ')}
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Key
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Value
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Description
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {items.map((item) => (
                      <tr key={item.key} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <code className="text-sm font-mono text-gray-900">{item.key}</code>
                        </td>
                        <td className="px-6 py-4">
                          {item.definition.sensitive ? (
                            <span className="text-sm text-gray-400 italic">••••••••</span>
                          ) : (
                            <code className="text-sm font-mono text-gray-700">
                              {Array.isArray(item.value)
                                ? (item.value as string[]).join(', ')
                                : typeof item.value === 'object'
                                ? JSON.stringify(item.value)
                                : item.value === undefined || item.value === null || item.value === ''
                                ? '—'
                                : String(item.value)}
                            </code>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {item.definition.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
