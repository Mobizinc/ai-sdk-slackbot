"use client"


import { useEffect, useState } from "react"
import { apiClient } from "@/lib/api-client"
import Link from "next/link"
import { Building2, Settings, CheckCircle, XCircle } from "lucide-react"

export default function ClientsPage() {
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadClients()
  }, [])

  async function loadClients() {
    try {
      setLoading(true)
      const result = await apiClient.getClients()
      setClients(result.data || [])
    } catch (error) {
      console.error('Failed to load clients:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Client Settings</h1>
        <p className="text-gray-600">Manage catalog redirect configuration per client</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Total Clients</p>
          <p className="text-3xl font-bold text-gray-900">{clients.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Redirect Enabled</p>
          <p className="text-3xl font-bold text-green-600">
            {clients.filter(c => c.catalogRedirectEnabled).length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Auto-Close Enabled</p>
          <p className="text-3xl font-bold text-blue-600">
            {clients.filter(c => c.catalogRedirectAutoClose).length}
          </p>
        </div>
      </div>

      {/* Client List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {clients.map((client) => (
          <Link
            key={client.id}
            href={`/clients/${client.clientId}/settings`}
            className="block group"
          >
            <div className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 mb-1">
                    {client.clientName}
                  </h3>
                  <p className="text-xs text-gray-500 font-mono">{client.clientId}</p>
                </div>
                <Building2 className="w-5 h-5 text-gray-400" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Catalog Redirect</span>
                  {client.catalogRedirectEnabled ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : (
                    <XCircle className="w-4 h-4 text-gray-400" />
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Auto-Close</span>
                  {client.catalogRedirectAutoClose ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : (
                    <XCircle className="w-4 h-4 text-gray-400" />
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Confidence Threshold</span>
                  <span className="text-sm font-medium text-gray-900">
                    {Math.round(client.catalogRedirectConfidenceThreshold * 100)}%
                  </span>
                </div>

                {client.customMappingsCount > 0 && (
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <span className="text-sm text-gray-600">Custom Mappings</span>
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                      {client.customMappingsCount}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
                <Settings className="w-4 h-4" />
                <span>Click to configure</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {clients.length === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-gray-500">No clients configured yet.</p>
        </div>
      )}
    </div>
  )
}
