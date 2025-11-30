"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  apiClient,
  type Prompt,
  type PromptVersion,
  type PromptType,
} from "@/lib/api-client"
import Link from "next/link"
import {
  ArrowLeft,
  Save,
  Copy,
  History,
  Trash2,
  RefreshCw,
  Eye,
  Code,
  AlertCircle,
  Check,
} from "lucide-react"

export default function PromptEditorPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [prompt, setPrompt] = useState<(Prompt & { versionCount: number }) | null>(null)
  const [versions, setVersions] = useState<PromptVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Editor state
  const [content, setContent] = useState("")
  const [description, setDescription] = useState("")
  const [isActive, setIsActive] = useState(true)
  const [changeNotes, setChangeNotes] = useState("")
  const [hasChanges, setHasChanges] = useState(false)

  // UI state
  const [showVersions, setShowVersions] = useState(false)
  const [showPreview, setShowPreview] = useState(true)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)

  // Test variables
  const [testVariables, setTestVariables] = useState<Record<string, string>>({})
  const [previewContent, setPreviewContent] = useState("")

  useEffect(() => {
    loadPrompt()
    loadVersions()
  }, [id])

  useEffect(() => {
    if (prompt) {
      setContent(prompt.content)
      setDescription(prompt.description || "")
      setIsActive(prompt.isActive)
      // Initialize test variables
      const vars: Record<string, string> = {}
      for (const v of prompt.variables) {
        vars[v] = `[${v}]`
      }
      setTestVariables(vars)
    }
  }, [prompt])

  useEffect(() => {
    // Update preview when content or test variables change
    let preview = content
    for (const [key, value] of Object.entries(testVariables)) {
      preview = preview.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value)
    }
    setPreviewContent(preview)
  }, [content, testVariables])

  useEffect(() => {
    if (prompt) {
      const changed =
        content !== prompt.content ||
        description !== (prompt.description || "") ||
        isActive !== prompt.isActive
      setHasChanges(changed)
    }
  }, [content, description, isActive, prompt])

  async function loadPrompt() {
    try {
      setLoading(true)
      const result = await apiClient.getPrompt(id)
      setPrompt(result.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load prompt")
    } finally {
      setLoading(false)
    }
  }

  async function loadVersions() {
    try {
      const result = await apiClient.getPromptVersions(id)
      setVersions(result.data)
    } catch (err) {
      console.error("Failed to load versions:", err)
    }
  }

  async function handleSave() {
    if (!prompt) return

    setSaving(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const result = await apiClient.updatePrompt(id, {
        content,
        description: description || undefined,
        isActive,
        changeNotes: changeNotes || undefined,
      })
      setPrompt({ ...result.data, versionCount: prompt.versionCount + 1 })
      setChangeNotes("")
      setHasChanges(false)
      setSuccessMessage("Prompt saved successfully")
      loadVersions()
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save prompt")
    } finally {
      setSaving(false)
    }
  }

  async function handleRollback(version: number) {
    setSaving(true)
    setError(null)

    try {
      const result = await apiClient.rollbackPrompt(id, version)
      setPrompt({ ...result.data, versionCount: (prompt?.versionCount || 0) + 1 })
      setSuccessMessage(`Rolled back to version ${version}`)
      setShowVersions(false)
      loadVersions()
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rollback")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    try {
      await apiClient.deletePrompt(id)
      router.push("/prompts")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete prompt")
    }
  }

  // Extract variables from content
  const extractedVariables = content.match(/\{\{(\w+)\}\}/g)?.map((m) => m.replace(/[{}]/g, "")) || []
  const uniqueVariables = [...new Set(extractedVariables)]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!prompt) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-red-800 font-semibold mb-2">Prompt Not Found</h3>
        <p className="text-red-600">{error || "The requested prompt could not be found."}</p>
        <Link
          href="/prompts"
          className="mt-4 inline-block px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Back to Prompts
        </Link>
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <Link
            href="/prompts"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{prompt.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`px-2 py-0.5 text-xs font-medium rounded capitalize ${
                  prompt.type === "system"
                    ? "bg-blue-100 text-blue-700"
                    : prompt.type === "requirement"
                    ? "bg-purple-100 text-purple-700"
                    : prompt.type === "workflow"
                    ? "bg-green-100 text-green-700"
                    : prompt.type === "context_template"
                    ? "bg-orange-100 text-orange-700"
                    : "bg-pink-100 text-pink-700"
                }`}
              >
                {prompt.type.replace("_", " ")}
              </span>
              <span className="text-sm text-gray-500">v{prompt.version}</span>
              {!prompt.isActive && (
                <span className="px-2 py-0.5 text-xs font-medium rounded bg-gray-200 text-gray-600">
                  Inactive
                </span>
              )}
              {hasChanges && (
                <span className="px-2 py-0.5 text-xs font-medium rounded bg-yellow-100 text-yellow-700">
                  Unsaved changes
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowVersions(!showVersions)}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <History className="w-4 h-4" />
            History ({versions.length})
          </button>
          <button
            onClick={() => setShowDuplicateModal(true)}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <Copy className="w-4 h-4" />
            Duplicate
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-2 px-3 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}
      {successMessage && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
          <Check className="w-4 h-4" />
          {successMessage}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* Editor Panel */}
        <div className="flex-1 flex flex-col bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between bg-gray-50">
            <div className="flex items-center gap-2">
              <Code className="w-4 h-4 text-gray-500" />
              <span className="font-medium text-sm">Editor</span>
            </div>
            <span className="text-xs text-gray-500">{content.length.toLocaleString()} characters</span>
          </div>

          <div className="p-4 border-b border-gray-200 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                placeholder="Brief description of what this prompt does"
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Active</span>
              </label>
              <div className="flex-1">
                <input
                  type="text"
                  value={changeNotes}
                  onChange={(e) => setChangeNotes(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  placeholder="Change notes (optional)"
                />
              </div>
            </div>
          </div>

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="flex-1 w-full p-4 resize-none focus:outline-none font-mono text-sm"
            placeholder="Enter prompt content..."
          />
        </div>

        {/* Preview/Variables Panel */}
        <div className="w-[400px] flex flex-col gap-4">
          {/* Variables Panel */}
          {uniqueVariables.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-4 py-2 border-b border-gray-200 bg-gray-50">
                <span className="font-medium text-sm">Variables ({uniqueVariables.length})</span>
              </div>
              <div className="p-4 space-y-3 max-h-[200px] overflow-y-auto">
                {uniqueVariables.map((variable) => (
                  <div key={variable}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      {`{{${variable}}}`}
                    </label>
                    <input
                      type="text"
                      value={testVariables[variable] || ""}
                      onChange={(e) =>
                        setTestVariables((prev) => ({ ...prev, [variable]: e.target.value }))
                      }
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder={`Value for ${variable}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview Panel */}
          <div className="flex-1 bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col">
            <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-gray-500" />
                <span className="font-medium text-sm">Preview</span>
              </div>
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="text-xs text-blue-600 hover:underline"
              >
                {showPreview ? "Hide" : "Show"}
              </button>
            </div>
            {showPreview && (
              <div className="flex-1 p-4 overflow-y-auto">
                <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono">
                  {previewContent}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Version History Sidebar */}
      {showVersions && (
        <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-xl border-l border-gray-200 z-50 flex flex-col">
          <div className="px-4 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-semibold">Version History</h3>
            <button onClick={() => setShowVersions(false)} className="text-gray-400 hover:text-gray-600">
              &times;
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {versions.map((version) => (
              <div
                key={version.id}
                className={`p-4 border rounded-lg ${
                  version.version === prompt.version
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">Version {version.version}</span>
                  {version.version === prompt.version && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Current</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mb-2">
                  {new Date(version.createdAt).toLocaleString()}
                </p>
                {version.changeNotes && (
                  <p className="text-sm text-gray-600 mb-3">{version.changeNotes}</p>
                )}
                <div className="text-xs text-gray-500 mb-3">{version.content.length.toLocaleString()} chars</div>
                {version.version !== prompt.version && (
                  <button
                    onClick={() => handleRollback(version.version)}
                    disabled={saving}
                    className="text-sm text-blue-600 hover:underline disabled:opacity-50"
                  >
                    Rollback to this version
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-2">Delete Prompt?</h3>
            <p className="text-gray-600 mb-4">
              This will deactivate the prompt. You can permanently delete it later if needed.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Modal */}
      {showDuplicateModal && (
        <DuplicateModal
          promptId={id}
          originalName={prompt.name}
          onClose={() => setShowDuplicateModal(false)}
          onDuplicated={(newId) => {
            setShowDuplicateModal(false)
            router.push(`/prompts/${newId}`)
          }}
        />
      )}
    </div>
  )
}

function DuplicateModal({
  promptId,
  originalName,
  onClose,
  onDuplicated,
}: {
  promptId: string
  originalName: string
  onClose: () => void
  onDuplicated: (newId: string) => void
}) {
  const [newName, setNewName] = useState(`${originalName}_copy`)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const result = await apiClient.duplicatePrompt(promptId, newName)
      onDuplicated(result.data.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to duplicate prompt")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">Duplicate Prompt</h3>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">New Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div className="flex justify-end gap-3">
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
              {saving ? "Duplicating..." : "Duplicate"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
