"use client"

import { useEffect, useMemo, useState } from "react"
import { apiClient, type ConfigValue } from "@/lib/api-client"
import { Settings, Search, RefreshCcw, Save, X, AlertCircle } from "lucide-react"
import { toast } from "sonner"

interface StatusMessage {
  type: "success" | "error"
  text: string
}

export default function ConfigPage() {
  const [config, setConfig] = useState<ConfigValue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedGroup, setSelectedGroup] = useState<string>("all")
  const [pendingValues, setPendingValues] = useState<Record<string, unknown>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [savingAll, setSavingAll] = useState(false)
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null)

  const hasUnsavedChanges = Object.keys(pendingValues).length > 0

  useEffect(() => {
    void loadConfig()
  }, [])

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = ''
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  async function loadConfig() {
    try {
      setLoading(true)
      setError(null)
      const data = await apiClient.getConfig()
      setConfig(data)
      setPendingValues({})
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load configuration")
    } finally {
      setLoading(false)
    }
  }

  const groups = useMemo(
    () => Array.from(new Set(config.map((c) => c.definition.group))).sort(),
    [config],
  )

  const filteredConfig = useMemo(
    () =>
      config.filter((item) => {
        const matchesGroup = selectedGroup === "all" || item.definition.group === selectedGroup
        const matchesSearch =
          searchQuery === "" ||
          item.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.definition.description.toLowerCase().includes(searchQuery.toLowerCase())
        return matchesGroup && matchesSearch
      }),
    [config, selectedGroup, searchQuery],
  )

  const groupedConfig = useMemo(
    () =>
      groups.reduce((acc, group) => {
        acc[group] = filteredConfig.filter((c) => c.definition.group === group)
        return acc
      }, {} as Record<string, ConfigValue[]>),
    [filteredConfig, groups],
  )

  function getCurrentValue(item: ConfigValue): unknown {
    if (Object.prototype.hasOwnProperty.call(pendingValues, item.key)) {
      return pendingValues[item.key]
    }
    return item.value
  }

  function handleValueChange(key: string, raw: unknown) {
    setPendingValues((prev) => ({ ...prev, [key]: raw }))
  }

  function parseInputValue(item: ConfigValue, raw: unknown): unknown {
    const type = item.definition.type

    if (type === "boolean") {
      return Boolean(raw)
    }

    if (type === "number") {
      const num = typeof raw === "string" ? Number(raw) : Number(raw)
      return Number.isNaN(num) ? item.value : num
    }

    if (type === "string[]") {
      if (typeof raw !== "string") return []
      return raw
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    }

    if (raw === "") {
      return ""
    }

    return raw
  }

  async function handleSave(item: ConfigValue) {
    if (item.definition.sensitive) {
      toast.error("Sensitive values must be managed via secret storage.")
      return
    }

    const rawValue = getCurrentValue(item)
    const parsedValue = parseInputValue(item, rawValue)

    setSavingKey(item.key)

    try {
      await apiClient.updateConfig({ [item.key]: parsedValue })
      toast.success(`Updated ${item.key}`)
      setPendingValues((prev) => {
        const clone = { ...prev }
        delete clone[item.key]
        return clone
      })
      await loadConfig()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update configuration"
      toast.error(message)
    } finally {
      setSavingKey(null)
    }
  }

  async function handleSaveAll() {
    if (Object.keys(pendingValues).length === 0) return

    // Filter out sensitive values
    const updates: Record<string, unknown> = {}
    const configMap = new Map(config.map(c => [c.key, c]))

    for (const [key, rawValue] of Object.entries(pendingValues)) {
      const item = configMap.get(key)
      if (!item || item.definition.sensitive) continue
      updates[key] = parseInputValue(item, rawValue)
    }

    if (Object.keys(updates).length === 0) {
      toast.error("No valid changes to save")
      return
    }

    setSavingAll(true)

    try {
      await apiClient.updateConfig(updates)
      toast.success(`Saved ${Object.keys(updates).length} setting(s)`)
      setPendingValues({})
      await loadConfig()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save changes"
      toast.error(message)
    } finally {
      setSavingAll(false)
    }
  }

  function handleDiscardAll() {
    if (!confirm(`Discard ${Object.keys(pendingValues).length} unsaved change(s)?`)) return
    setPendingValues({})
    toast.info("Changes discarded")
  }

  function renderInput(item: ConfigValue) {
    const type = item.definition.type
    const value = getCurrentValue(item)
    const disabled = item.definition.sensitive

    if (type === "boolean") {
      return (
        <input
          type="checkbox"
          className="h-4 w-4 text-blue-600"
          checked={Boolean(value)}
          onChange={(event) => handleValueChange(item.key, event.target.checked)}
          disabled={disabled}
        />
      )
    }

    if (type === "number") {
      return (
        <input
          type="number"
          className="w-full border border-gray-300 rounded-lg px-3 py-2"
          value={value === undefined || value === null ? "" : Number(value)}
          onChange={(event) => handleValueChange(item.key, event.target.value)}
          disabled={disabled}
        />
      )
    }

    if (type === "string[]") {
      const display = Array.isArray(value) ? value.join(", ") : typeof value === "string" ? value : ""
      return (
        <input
          type="text"
          className="w-full border border-gray-300 rounded-lg px-3 py-2"
          placeholder="comma separated"
          value={display}
          onChange={(event) => handleValueChange(item.key, event.target.value)}
          disabled={disabled}
        />
      )
    }

    const display = value === undefined || value === null ? "" : String(value)

    return (
      <input
        type="text"
        className="w-full border border-gray-300 rounded-lg px-3 py-2"
        value={display}
        onChange={(event) => handleValueChange(item.key, event.target.value)}
        disabled={disabled}
      />
    )
  }

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
          onClick={() => void loadConfig()}
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
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Settings className="w-8 h-8 text-gray-700" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Configuration</h1>
              <p className="text-gray-600 mt-1">System settings and environment variables</p>
            </div>
          </div>

          {hasUnsavedChanges && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-yellow-600" />
                <span className="text-sm font-medium text-yellow-800">
                  {Object.keys(pendingValues).length} unsaved change{Object.keys(pendingValues).length !== 1 ? 's' : ''}
                </span>
              </div>
              <button
                onClick={handleDiscardAll}
                disabled={savingAll}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
                Discard
              </button>
              <button
                onClick={handleSaveAll}
                disabled={savingAll}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {savingAll ? (
                  <><RefreshCcw className="w-4 h-4 animate-spin" /> Saving...</>
                ) : (
                  <><Save className="w-4 h-4" /> Save All</>
                )}
              </button>
            </div>
          )}
        </div>

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

      <div className="space-y-6">
        {Object.entries(groupedConfig).map(([group, items]) => {
          if (items.length === 0) return null

          return (
            <div key={group} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 capitalize">
                  {group.replace(/_/g, " ")}
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
                    {items.map((item) => {
                      const isSaving = savingKey === item.key
                      const disabled = item.definition.sensitive
                      const hasChanges = Object.prototype.hasOwnProperty.call(pendingValues, item.key)

                      return (
                        <tr key={item.key} className={`hover:bg-gray-50 ${hasChanges ? 'bg-yellow-50' : ''}`}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <code className="text-sm font-mono text-gray-900">{item.key}</code>
                              {hasChanges && (
                                <span className="text-yellow-600 font-bold text-sm">*</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {disabled ? (
                              <span className="text-sm text-gray-400 italic">hidden</span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="flex-1">{renderInput(item)}</div>
                                {hasChanges && (
                                  <button
                                    onClick={() => {
                                      setPendingValues((prev) => {
                                        const clone = { ...prev }
                                        delete clone[item.key]
                                        return clone
                                      })
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-1.5 text-sm text-gray-600 hover:text-gray-900"
                                    title="Discard changes"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  onClick={() => void handleSave(item)}
                                  disabled={isSaving || !hasChanges}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed"
                                >
                                  {isSaving ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                  Save
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {item.definition.description}
                          </td>
                        </tr>
                      )
                    })}
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
