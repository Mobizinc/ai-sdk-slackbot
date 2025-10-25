/**
 * Typed API Client for Admin Interface
 * Wraps existing API endpoints with type safety
 */

export interface BusinessContext {
  id: number
  entityName: string
  entityType: 'CLIENT' | 'VENDOR' | 'PLATFORM'
  industry?: string
  description?: string
  technologyPortfolio?: string
  serviceDetails?: string
  aliases?: string[]
  relatedEntities?: string[]
  relatedCompanies?: Array<{
    companyName: string
    relationship: string
    notes?: string
  }>
  keyContacts?: Array<{
    name: string
    role: string
    email?: string
  }>
  slackChannels?: Array<{
    name: string
    channelId?: string
    notes?: string
  }>
  cmdbIdentifiers?: Array<{
    ciName?: string
    sysId?: string
    ownerGroup?: string
    ipAddresses?: string[]
    description?: string
    documentation?: string[]
  }>
  contextStewards?: Array<{
    type: 'channel' | 'user' | 'usergroup'
    id?: string
    name?: string
    notes?: string
  }>
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface ConfigValue {
  key: string
  value: unknown
  definition: {
    envVar?: string
    type: string
    default: unknown
    group: string
    description: string
    sensitive?: boolean
  }
}

export interface QueueStats {
  queue_config: {
    async_triage_enabled: boolean
    qstash_enabled: boolean
    qstash_configured: boolean
    worker_url: string
  }
  stats_7d: {
    total_classifications: number
    average_processing_time_ms: number
    average_confidence: number
    top_workflows: Array<{ workflow_id: string; count: number }>
  }
  stats_24h: {
    total_classifications: number
    average_processing_time_ms: number
    average_confidence: number
  }
  recent_performance: {
    sample_size: number
    avg_processing_time_ms: number
    min_processing_time_ms: number
    max_processing_time_ms: number
    failure_count: number
    failure_rate: number
  }
  recent_classifications: Array<{
    case_number: string
    workflow_id: string
    processing_time_ms: number
    confidence_score: number
    classified_at: string
    age_minutes: number
  }>
  timestamp: string
}

const resolveBaseUrl = (): string => {
  const explicit = process.env.NEXT_PUBLIC_API_BASE_URL?.trim()
  if (explicit) {
    return explicit.replace(/\/$/, '')
  }

  if (typeof window === 'undefined') {
    const deployment = process.env.VERCEL_URL?.trim()
    if (deployment) {
      const normalized = deployment.startsWith('http') ? deployment : `https://${deployment}`
      return normalized.replace(/\/$/, '')
    }
  }

  return ''
}

class ApiClient {
  private readonly baseUrl: string
  private readonly authToken?: string

  constructor() {
    this.baseUrl = resolveBaseUrl()
    this.authToken = process.env.NEXT_PUBLIC_ADMIN_TOKEN
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string> || {}),
    }

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`API Error (${response.status}): ${error}`)
    }

    return response.json()
  }

  // Business Contexts
  async getBusinessContexts(): Promise<BusinessContext[]> {
    const result = await this.request<{ success: boolean; data: BusinessContext[] }>(
      '/api/business-contexts'
    )
    return result.data
  }

  async getBusinessContext(id: number): Promise<BusinessContext> {
    const result = await this.request<{ success: boolean; data: BusinessContext }>(
      `/api/business-contexts?id=${id}`
    )
    return result.data
  }

  async createBusinessContext(data: Partial<BusinessContext>): Promise<BusinessContext> {
    const result = await this.request<{ success: boolean; data: BusinessContext }>(
      '/api/business-contexts',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    )
    return result.data
  }

  async updateBusinessContext(id: number, data: Partial<BusinessContext>): Promise<BusinessContext> {
    const result = await this.request<{ success: boolean; data: BusinessContext }>(
      `/api/business-contexts?id=${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    )
    return result.data
  }

  async deleteBusinessContext(id: number): Promise<void> {
    await this.request(`/api/business-contexts?id=${id}`, {
      method: 'DELETE',
    })
  }

  // Configuration
  async getConfig(): Promise<ConfigValue[]> {
    const result = await this.request<{
      settings: Record<string, unknown>
      metadata: Record<string, ConfigValue['definition']>
    }>('/api/admin/config')

    return Object.keys(result.settings).map((key) => ({
      key,
      value: result.settings[key],
      definition: result.metadata[key],
    }))
  }

  // Queue Stats
  async getQueueStats(): Promise<QueueStats> {
    return this.request<QueueStats>('/api/admin/queue-stats')
  }

  // Reports
  async getMissingCategories(days: number = 30) {
    return this.request<any>(`/api/admin/reports/missing-categories?days=${days}`)
  }

  async getCatalogRedirectStats(clientId?: string, days: number = 30) {
    const query = clientId ? `clientId=${clientId}&days=${days}` : `days=${days}`
    return this.request<any>(`/api/admin/reports/catalog-redirects?${query}`)
  }

  // Clients
  async getClients() {
    return this.request<{ success: boolean; data: any[] }>('/api/admin/clients/route')
  }

  async getClientSettings(clientId: string) {
    return this.request<{ success: boolean; data: any }>(`/api/admin/clients/${clientId}/route`)
  }

  async updateClientSettings(clientId: string, settings: any) {
    return this.request<{ success: boolean; data: any; message: string }>(
      `/api/admin/clients/${clientId}/route`,
      {
        method: 'PATCH',
        body: JSON.stringify(settings),
      }
    )
  }
}

export const apiClient = new ApiClient()
