"use client"

import { useEffect, useState } from "react"
import { apiClient, type Prompt, type PromptType, type PromptStats } from "@/lib/api-client"
import Link from "next/link"
import { Plus, Search, RefreshCw, FileText, Code, Workflow, Database, Sparkles } from "lucide-react"

const typeIcons: Record<PromptType, React.ReactNode> = {
  system: <FileText className="w-4 h-4" />,
  requirement: <Code className="w-4 h-4" />,
  workflow: <Workflow className="w-4 h-4" />,
  context_template: <Database className="w-4 h-4" />,
  custom: <Sparkles className="w-4 h-4" />,
}

const typeColors: Record<PromptType, string> = {
  system: "bg-blue-100 text-blue-700",
  requirement: "bg-purple-100 text-purple-700",
  workflow: "bg-green-100 text-green-700",
  context_template: "bg-orange-100 text-orange-700",
  custom: "bg-pink-100 text-pink-700",
}

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [stats, setStats] = useState<PromptStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<PromptType | "ALL">("ALL")
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [showCreateModal, setShowCreateModal] = useState(false)

  useEffect(() => {
    loadPrompts()
    loadStats()
  }, [])

  async function loadPrompts() {
    try {
      setLoading(true)
      setError(null)
      const result = await apiClient.getPrompts()
      setPrompts(result.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load prompts")
    } finally {
      setLoading(false)
    }
  }

  async function loadStats() {
    try {
      const result = await apiClient.getPromptStats()
      setStats(result.data)
    } catch (err) {
      console.error("Failed to load stats:", err)
    }
  }

  const filteredPrompts = prompts.filter((prompt) => {
    const matchesType = filter === "ALL" || prompt.type === filter
    const matchesActive =
      activeFilter === "all" ||
      (activeFilter === "active" && prompt.isActive) ||
      (activeFilter === "inactive" && !prompt.isActive)
    const matchesSearch =
      searchQuery === "" ||
      prompt.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      prompt.description?.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesType && matchesActive && matchesSearch
  })

  const groupedPrompts: Record<PromptType, Prompt[]> = {
    system: filteredPrompts.filter((p) => p.type === "system"),
    requirement: filteredPrompts.filter((p) => p.type === "requirement"),
    workflow: filteredPrompts.filter((p) => p.type === "workflow"),
    context_template: filteredPrompts.filter((p) => p.type === "context_template"),
    custom: filteredPrompts.filter((p) => p.type === "custom"),
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading prompts...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-red-800 font-semibold mb-2">Error Loading Prompts</h3>
        <p className="text-red-600">{error}</p>
        <button
          onClick={loadPrompts}
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
            <h1 className="text-3xl font-bold text-gray-900">Prompts</h1>
            <p className="text-gray-600 mt-1">Manage LLM prompts used by the system</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                loadPrompts()
                loadStats()
              }}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Prompt
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search prompts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex gap-2">
            {(["ALL", "system", "requirement", "workflow", "context_template", "custom"] as const).map(
              (type) => (
                <button
                  key={type}
                  onClick={() => setFilter(type)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filter === type
                      ? "bg-blue-600 text-white"
                      : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {type === "ALL" ? "All" : type.replace("_", " ")}
                </button>
              )
            )}
          </div>

          <div className="flex gap-2">
            {(["all", "active", "inactive"] as const).map((status) => (
              <button
                key={status}
                onClick={() => setActiveFilter(status)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeFilter === status
                    ? "bg-gray-800 text-white"
                    : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <p className="text-sm text-gray-500 mb-1">Total</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <p className="text-sm text-gray-500 mb-1">Active</p>
            <p className="text-2xl font-bold text-green-600">{stats.active}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <p className="text-sm text-gray-500 mb-1">System</p>
            <p className="text-2xl font-bold text-blue-600">{stats.byType.system || 0}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <p className="text-sm text-gray-500 mb-1">Requirement</p>
            <p className="text-2xl font-bold text-purple-600">{stats.byType.requirement || 0}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <p className="text-sm text-gray-500 mb-1">Workflow</p>
            <p className="text-2xl font-bold text-green-600">{stats.byType.workflow || 0}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <p className="text-sm text-gray-500 mb-1">Cache Size</p>
            <p className="text-2xl font-bold text-orange-600">{stats.cacheStats.size}</p>
          </div>
        </div>
      )}

      {/* Prompt List */}
      {filteredPrompts.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">No prompts found matching your filters.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Create your first prompt
          </button>
        </div>
      ) : (
        Object.entries(groupedPrompts).map(([type, items]) => {
          if (items.length === 0) return null

          return (
            <div key={type} className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <span className={`p-1.5 rounded ${typeColors[type as PromptType]}`}>
                  {typeIcons[type as PromptType]}
                </span>
                <h2 className="text-xl font-semibold text-gray-900 capitalize">
                  {type.replace("_", " ")} Prompts
                </h2>
                <span className="text-sm text-gray-500">({items.length})</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((prompt) => (
                  <Link key={prompt.id} href={`/prompts/${prompt.id}`} className="block">
                    <div
                      className={`bg-white rounded-lg border p-6 hover:shadow-md transition-shadow cursor-pointer ${
                        !prompt.isActive ? "border-gray-300 bg-gray-50" : "border-gray-200"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="text-lg font-semibold text-gray-900 truncate">
                          {prompt.name}
                        </h3>
                        <div className="flex items-center gap-2">
                          {!prompt.isActive && (
                            <span className="px-2 py-0.5 text-xs font-medium rounded bg-gray-200 text-gray-600">
                              Inactive
                            </span>
                          )}
                          <span className="text-xs text-gray-500">v{prompt.version}</span>
                        </div>
                      </div>

                      {prompt.description && (
                        <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                          {prompt.description}
                        </p>
                      )}

                      <div className="flex items-center justify-between mt-4 text-xs text-gray-500">
                        <span>{prompt.content.length.toLocaleString()} chars</span>
                        <span>
                          {prompt.variables.length > 0 && (
                            <span className="text-purple-600">
                              {prompt.variables.length} variable{prompt.variables.length !== 1 ? "s" : ""}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )
        })
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreatePromptModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false)
            loadPrompts()
            loadStats()
          }}
        />
      )}
    </div>
  )
}

function CreatePromptModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState("")
  const [type, setType] = useState<PromptType>("custom")
  const [content, setContent] = useState("")
  const [description, setDescription] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      await apiClient.createPrompt({
        name,
        type,
        content,
        description: description || undefined,
      })
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create prompt")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Create New Prompt</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-130px)]">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., system_prompt, requirement_case_number"
              required
            />
            <p className="mt-1 text-xs text-gray-500">Unique identifier for this prompt</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as PromptType)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="system">System</option>
              <option value="requirement">Requirement</option>
              <option value="workflow">Workflow</option>
              <option value="context_template">Context Template</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Brief description of what this prompt does"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
              placeholder="Enter prompt content. Use {{variableName}} for variables."
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              Use {"{{variableName}}"} syntax for variables that will be substituted at runtime
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create Prompt"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
