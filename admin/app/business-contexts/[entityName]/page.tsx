"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { apiClient, type BusinessContext } from "@/lib/api-client"
import Link from "next/link"
import { ArrowLeft, Edit, Building2, Package, Cloud, Users, MessageSquare, Database, Link as LinkIcon } from "lucide-react"

export default function EntityDetailPage() {
  const params = useParams()
  const entityName = decodeURIComponent(params.entityName as string)

  const [context, setContext] = useState<BusinessContext | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadEntity()
  }, [entityName])

  async function loadEntity() {
    try {
      setLoading(true)
      const all = await apiClient.getBusinessContexts()
      const found = all.find(c => c.entityName === entityName)
      setContext(found || null)
    } catch (err) {
      console.error('Failed to load entity:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>
  }

  if (!context) {
    return <div className="bg-red-50 border border-red-200 rounded-lg p-6">Entity not found</div>
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'CLIENT': return Building2
      case 'VENDOR': return Package
      case 'PLATFORM': return Cloud
      default: return Building2
    }
  }

  const Icon = getIcon(context.entityType)

  return (
    <div>
      <Link href="/business-contexts" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-6">
        <ArrowLeft className="w-4 h-4" />
        Back to Knowledge Base
      </Link>

      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-8 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="bg-blue-100 w-16 h-16 rounded-lg flex items-center justify-center">
              <Icon className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{context.entityName}</h1>
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                  {context.entityType}
                </span>
                {context.industry && (
                  <span className="text-gray-600">{context.industry}</span>
                )}
              </div>
            </div>
          </div>
          <Link href={`/business-contexts/${encodeURIComponent(entityName)}/edit`}>
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <Edit className="w-4 h-4" />
              Edit
            </button>
          </Link>
        </div>

        {context.description && (
          <p className="text-gray-700 mt-4 text-lg">{context.description}</p>
        )}
      </div>

      {/* Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Aliases & Related */}
        {((context.aliases?.length ?? 0) > 0 || (context.relatedEntities?.length ?? 0) > 0 || (context.relatedCompanies?.length ?? 0) > 0) && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <LinkIcon className="w-5 h-5" />
              Aliases & Relationships
            </h2>
            <div className="space-y-4">
              {context.aliases && context.aliases.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Also known as:</p>
                  <div className="flex flex-wrap gap-2">
                    {context.aliases.map((alias, i) => (
                      <span key={i} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                        {alias}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {context.relatedEntities && context.relatedEntities.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Related Entities:</p>
                  <div className="flex flex-wrap gap-2">
                    {context.relatedEntities.map((entity, i) => (
                      <span key={i} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm">
                        {entity}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {context.relatedCompanies && context.relatedCompanies.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Related Companies:</p>
                  <div className="space-y-2">
                    {context.relatedCompanies.map((company, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <span className="text-sm text-gray-900">{company.companyName}</span>
                        <span className="text-xs text-gray-500">{company.relationship}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Technology & Services */}
        {(context.technologyPortfolio || context.serviceDetails) && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Technology & Services</h2>
            <div className="space-y-4">
              {context.technologyPortfolio && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Technology Portfolio:</p>
                  <p className="text-gray-900">{context.technologyPortfolio}</p>
                </div>
              )}
              {context.serviceDetails && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Service Details:</p>
                  <p className="text-gray-900">{context.serviceDetails}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Key Contacts */}
        {context.keyContacts && context.keyContacts.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Users className="w-5 h-5" />
              Key Contacts
            </h2>
            <div className="space-y-3">
              {context.keyContacts.map((contact, i) => (
                <div key={i} className="pb-3 border-b border-gray-100 last:border-0">
                  <p className="font-medium text-gray-900">{contact.name}</p>
                  <p className="text-sm text-gray-600">{contact.role}</p>
                  {contact.email && (
                    <a href={`mailto:${contact.email}`} className="text-sm text-blue-600 hover:underline">
                      {contact.email}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Slack Channels */}
        {context.slackChannels && context.slackChannels.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Slack Channels
            </h2>
            <div className="space-y-2">
              {context.slackChannels.map((channel, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <div>
                    <p className="font-medium text-gray-900">#{channel.name}</p>
                    {channel.notes && <p className="text-xs text-gray-500">{channel.notes}</p>}
                  </div>
                  {channel.channelId && (
                    <code className="text-xs text-gray-500">{channel.channelId}</code>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CMDB Identifiers */}
        {context.cmdbIdentifiers && context.cmdbIdentifiers.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Database className="w-5 h-5" />
              CMDB Configuration Items
            </h2>
            <div className="space-y-4">
              {context.cmdbIdentifiers.map((ci, i) => (
                <div key={i} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium text-gray-900">{ci.ciName || 'Unnamed CI'}</p>
                      {ci.sysId && <code className="text-xs text-gray-500">{ci.sysId}</code>}
                    </div>
                    {ci.ownerGroup && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                        {ci.ownerGroup}
                      </span>
                    )}
                  </div>

                  {ci.description && (
                    <p className="text-sm text-gray-700 mb-2">{ci.description}</p>
                  )}

                  {ci.ipAddresses && ci.ipAddresses.length > 0 && (
                    <div className="mb-2">
                      <p className="text-xs text-gray-500 mb-1">IP Addresses:</p>
                      <div className="flex flex-wrap gap-1">
                        {ci.ipAddresses.map((ip, j) => (
                          <code key={j} className="px-2 py-0.5 bg-white border border-gray-200 rounded text-xs">
                            {ip}
                          </code>
                        ))}
                      </div>
                    </div>
                  )}

                  {ci.documentation && ci.documentation.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Documentation:</p>
                      <div className="space-y-1">
                        {ci.documentation.map((doc, j) => (
                          <a key={j} href={doc} target="_blank" rel="noopener noreferrer" className="block text-xs text-blue-600 hover:underline truncate">
                            {doc}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Context Stewards */}
        {context.contextStewards && context.contextStewards.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Context Stewards</h2>
            <div className="space-y-2">
              {context.contextStewards.map((steward, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <div>
                    <p className="font-medium text-gray-900">{steward.name || steward.id}</p>
                    <p className="text-xs text-gray-500 capitalize">{steward.type}</p>
                  </div>
                  {steward.notes && (
                    <span className="text-xs text-gray-500">{steward.notes}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
