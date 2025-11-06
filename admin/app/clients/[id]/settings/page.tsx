"use client"


import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import { apiClient, type ClientSettings, type CustomCatalogMapping } from "@/lib/api-client"
import { toast } from "sonner"
import { ArrowLeft, Save } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function ClientSettingsPage() {
  const params = useParams()
  const clientId = params.id as string

  const [settings, setSettings] = useState<ClientSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true)
      const result = await apiClient.getClientSettings(clientId)
      setSettings(result.data)
    } catch (error) {
      toast.error('Failed to load settings')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  async function saveSettings() {
    if (!settings) return

    try {
      setSaving(true)
      const payload = {
        clientName: settings.clientName,
        catalogRedirectEnabled: settings.catalogRedirectEnabled,
        catalogRedirectConfidenceThreshold: settings.catalogRedirectConfidenceThreshold,
        catalogRedirectAutoClose: settings.catalogRedirectAutoClose,
        supportContactInfo: settings.supportContactInfo,
        customCatalogMappings: settings.customCatalogMappings,
        features: settings.features,
        notes: settings.notes,
        createdBy: settings.createdBy,
        updatedBy: settings.updatedBy,
      }

      await apiClient.updateClientSettings(clientId, payload)
      toast.success('Settings saved successfully!')
      await loadSettings()
    } catch (error) {
      toast.error('Failed to save settings')
      console.error(error)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>
  }

  if (!settings) {
    return <div className="bg-red-50 border border-red-200 rounded-lg p-6">Client not found</div>
  }

  return (
    <div>
      <div className="mb-8">
        <Link href="/clients" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4">
          <ArrowLeft className="w-4 h-4" />
          Back to Clients
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-1">{settings.clientName}</h1>
            <p className="text-gray-600">Catalog redirect configuration</p>
          </div>
          <Button onClick={saveSettings} disabled={saving}>
            {saving ? 'Saving...' : <><Save className="w-4 h-4" /> Save Changes</>}
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Basic Settings */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Settings</h3>
          <div className="space-y-4">
            <div>
              <Label htmlFor="enabled">Enable Catalog Redirect</Label>
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  id="enabled"
                  checked={settings.catalogRedirectEnabled}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev ? { ...prev, catalogRedirectEnabled: e.target.checked } : prev
                    )
                  }
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                />
                <span className="text-sm text-gray-600">
                  {settings.catalogRedirectEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>

            <div>
              <Label htmlFor="threshold">Confidence Threshold</Label>
              <div className="flex items-center gap-4 mt-2">
                <Input
                  type="range"
                  id="threshold"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.catalogRedirectConfidenceThreshold}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev
                        ? {
                            ...prev,
                            catalogRedirectConfidenceThreshold: parseFloat(e.target.value),
                          }
                        : prev
                    )
                  }
                  className="flex-1"
                />
                <span className="text-sm font-medium text-gray-900 w-16">
                  {Math.round(settings.catalogRedirectConfidenceThreshold * 100)}%
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Minimum confidence to trigger redirect</p>
            </div>

            <div>
              <Label htmlFor="autoClose">Auto-Close Cases</Label>
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  id="autoClose"
                  checked={settings.catalogRedirectAutoClose}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev ? { ...prev, catalogRedirectAutoClose: e.target.checked } : prev
                    )
                  }
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                />
                <span className="text-sm text-gray-600">
                  {settings.catalogRedirectAutoClose ? 'Auto-close redirected cases' : 'Add work note only'}
                </span>
              </div>
            </div>

            <div>
              <Label htmlFor="contact">Support Contact Info</Label>
              <Input
                id="contact"
                value={settings.supportContactInfo || ''}
                onChange={(e) =>
                  setSettings((prev) =>
                    prev ? { ...prev, supportContactInfo: e.target.value } : prev
                  )
                }
                placeholder="e.g., Altus IT Support"
                className="mt-2"
              />
            </div>
          </div>
        </div>

        {/* Custom Mappings */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Custom Catalog Mappings</h3>
          <div className="space-y-4">
            {settings.customCatalogMappings && settings.customCatalogMappings.length > 0 ? (
              settings.customCatalogMappings.map((mapping: CustomCatalogMapping, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-900">{mapping.requestType}</h4>
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                      Priority: {mapping.priority}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div>
                      <p className="text-gray-600 font-medium">Keywords ({mapping.keywords.length}):</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {mapping.keywords.map((kw: string, i: number) => (
                          <span key={i} className="px-2 py-0.5 bg-white border border-gray-200 rounded text-xs">
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-gray-600 font-medium">Catalog Items ({mapping.catalogItemNames.length}):</p>
                      <ul className="list-disc list-inside mt-1 text-gray-700">
                        {mapping.catalogItemNames.map((name: string, i: number) => (
                          <li key={i}>{name}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-sm">No custom mappings configured. Using default mappings.</p>
            )}
          </div>
        </div>

        {/* Feature Flags */}
        {settings.features && Object.keys(settings.features).length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Feature Flags</h3>
            <div className="space-y-2">
              {Object.entries(settings.features).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <code className="text-sm text-gray-700">{key}</code>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      value ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {value ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
