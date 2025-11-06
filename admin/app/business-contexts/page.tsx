"use client"


import { useEffect, useState } from "react"
import { apiClient, type BusinessContext } from "@/lib/api-client"
import Link from "next/link"
import { Plus, Search, Filter } from "lucide-react"

export default function BusinessContextsPage() {
  const [contexts, setContexts] = useState<BusinessContext[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'ALL' | 'CLIENT' | 'VENDOR' | 'PLATFORM'>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadContexts()
  }, [])

  async function loadContexts() {
    try {
      setLoading(true)
      setError(null)
      const data = await apiClient.getBusinessContexts()
      setContexts(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load contexts')
    } finally {
      setLoading(false)
    }
  }

  const filteredContexts = contexts.filter((context) => {
    const matchesType = filter === 'ALL' || context.entityType === filter
    const matchesSearch = searchQuery === '' ||
      context.entityName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      context.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      context.industry?.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesType && matchesSearch
  })

  const groupedContexts = {
    CLIENT: filteredContexts.filter(c => c.entityType === 'CLIENT'),
    VENDOR: filteredContexts.filter(c => c.entityType === 'VENDOR'),
    PLATFORM: filteredContexts.filter(c => c.entityType === 'PLATFORM'),
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading contexts...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-red-800 font-semibold mb-2">Error Loading Contexts</h3>
        <p className="text-red-600">{error}</p>
        <button
          onClick={loadContexts}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Business Contexts</h1>
            <p className="text-gray-600 mt-1">Manage clients, vendors, and platforms</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4" />
            Add New
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search contexts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex gap-2">
            {(['ALL', 'CLIENT', 'VENDOR', 'PLATFORM'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filter === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <p className="text-sm text-gray-500 mb-1">Total Contexts</p>
          <p className="text-2xl font-bold text-gray-900">{contexts.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <p className="text-sm text-gray-500 mb-1">Clients</p>
          <p className="text-2xl font-bold text-blue-600">{groupedContexts.CLIENT.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <p className="text-sm text-gray-500 mb-1">Vendors</p>
          <p className="text-2xl font-bold text-purple-600">{groupedContexts.VENDOR.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <p className="text-sm text-gray-500 mb-1">Platforms</p>
          <p className="text-2xl font-bold text-cyan-600">{groupedContexts.PLATFORM.length}</p>
        </div>
      </div>

      {/* Context List */}
      {filteredContexts.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <p className="text-gray-500">No contexts found matching your filters.</p>
        </div>
      ) : (
        Object.entries(groupedContexts).map(([type, items]) => {
          if (items.length === 0) return null

          return (
            <div key={type} className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">{type}S</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((context) => (
                  <Link
                    key={context.id}
                    href={`/business-contexts/${encodeURIComponent(context.entityName)}`}
                    className="block"
                  >
                    <div className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer">

                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {context.entityName}
                      </h3>
                      <span className={`px-2 py-1 text-xs font-medium rounded ${
                        context.entityType === 'CLIENT' ? 'bg-blue-100 text-blue-700' :
                        context.entityType === 'VENDOR' ? 'bg-purple-100 text-purple-700' :
                        'bg-cyan-100 text-cyan-700'
                      }`}>
                        {context.entityType}
                      </span>
                    </div>

                    {context.industry && (
                      <p className="text-sm text-gray-500 mb-2">{context.industry}</p>
                    )}

                    {context.description && (
                      <p className="text-sm text-gray-700 mb-3">
                        {context.description.substring(0, 120)}
                        {context.description.length > 120 && '...'}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2 mt-4">
                      {context.aliases && context.aliases.length > 0 && (
                        <span className="text-xs text-gray-500">
                          {context.aliases.length} alias{context.aliases.length !== 1 ? 'es' : ''}
                        </span>
                      )}
                      {context.cmdbIdentifiers && context.cmdbIdentifiers.length > 0 && (
                        <span className="text-xs text-gray-500">
                          {context.cmdbIdentifiers.length} CI{context.cmdbIdentifiers.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      {context.slackChannels && context.slackChannels.length > 0 && (
                        <span className="text-xs text-gray-500">
                          {context.slackChannels.length} channel{context.slackChannels.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
