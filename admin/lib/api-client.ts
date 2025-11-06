/**
 * Typed API Client for Admin Interface
 * Wraps existing API endpoints with type safety
 */

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
type JsonObject = { [key: string]: JsonValue }
type TimelineEntry = {
  type: string
  timestamp: string
  description: string
} & Record<string, JsonValue>

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

export interface CustomCatalogMapping {
  requestType: string
  keywords: string[]
  catalogItemNames: string[]
  priority: number
}

export interface ClientSettings {
  id: number
  clientId: string
  clientName: string
  catalogRedirectEnabled: boolean
  catalogRedirectConfidenceThreshold: number
  catalogRedirectAutoClose: boolean
  supportContactInfo: string | null
  customCatalogMappings: CustomCatalogMapping[]
  features: Record<string, boolean>
  notes: string | null
  createdBy: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

export type ClientSettingsUpdate = Partial<Omit<ClientSettings, "id" | "clientId" | "createdAt" | "updatedAt">> & {
  clientName?: string
}

export interface ClientListItem {
  id: number
  clientId: string
  clientName: string
  catalogRedirectEnabled: boolean
  catalogRedirectConfidenceThreshold: number
  catalogRedirectAutoClose: boolean
  supportContactInfo: string | null
  customMappingsCount: number
  createdAt: string
  updatedAt: string
}

export interface StrategicEvaluationSummary {
  id: string
  projectName: string
  createdAt: string
  requestedBy: string
  requestedByName: string | null
  channelId: string | null
  totalScore: number | null
  recommendation: string | null
  confidence: string | null
  needsClarification: boolean
  completenessScore: number | null
  executiveSummary: string | null
  nextSteps: string[]
  keyMetrics: string[]
  clarificationQuestions: string[]
  demandRequest: Record<string, unknown> | null
}

// Projects
export interface Project {
  id: string
  name: string
  status: string
  githubUrl: string | null
  summary: string
  background: string | null
  techStack: string[]
  skillsRequired: string[]
  skillsNiceToHave: string[]
  difficultyLevel: string | null
  estimatedHours: string | null
  learningOpportunities: string[]
  openTasks: string[]
  mentorSlackUserId: string | null
  mentorName: string | null
  interviewConfig: JsonObject | null
  standupConfig: JsonObject | null
  maxCandidates: number | null
  postedDate: string | null
  expiresDate: string | null
  channelId: string | null
  githubRepo: string | null
  githubDefaultBranch: string | null
  createdAt: string
  updatedAt: string
}

export interface ProjectStats {
  total: number
  draft: number
  active: number
  paused: number
  completed: number
  archived: number
}

export interface ProjectFilters {
  status?: string | string[]
  mentor?: string
  search?: string
  limit?: number
  offset?: number
}

export interface Standup {
  id: string
  projectId: string
  scheduledFor: string
  collectUntil: string
  channelId: string | null
  status: string
  summary: JsonObject | null
  triggeredAt: string
  completedAt: string | null
  createdAt: string
  metadata: JsonObject
}

export interface StandupResponse {
  id: string
  standupId: string
  participantSlackId: string
  answers: JsonObject
  blockerFlag: boolean
  contextSnapshot: JsonObject
  insights: JsonObject
  submittedAt: string
  createdAt: string
}

export interface Interview {
  id: string
  projectId: string
  candidateSlackId: string
  mentorSlackId: string | null
  answers: Array<JsonObject>
  questions: Array<JsonObject>
  scoringPrompt: string | null
  matchScore: number
  matchSummary: string
  recommendedTasks: string[]
  concerns: string | null
  startedAt: string
  completedAt: string
  createdAt: string
  questionSource: string
  generatorModel: string | null
  status: string
}

export interface ProjectInitiation {
  id: string
  projectId: string
  requestedBy: string
  requestedByName: string | null
  ideaSummary: string | null
  contextSummary: string | null
  llmModel: string | null
  status: string
  output: JsonObject
  sources: Array<JsonObject>
  rawResponse: string | null
  metadata: JsonObject
  createdAt: string
  updatedAt: string
}

export interface ProjectWithRelations extends Project {
  standups: Standup[]
  interviews: Interview[]
  initiations: ProjectInitiation[]
  evaluations: StrategicEvaluationSummary[]
}

export interface ProjectAnalytics {
  projectId: string
  projectName: string
  standupAnalytics: {
    completionRate: number
    blockerFrequency: number
    totalStandups: number
    recentActivity: Array<{
      id: string
      scheduledFor: string
      status: string
    }>
  }
  interviewAnalytics: {
    total: number
    avgMatchScore: number
    conversionRate: number
    topConcerns: string[]
  }
  taskMetrics: {
    totalTasks: number
    openTasks: number
    completedTasks: number
    taskVelocity: number
  }
  timeline: TimelineEntry[]
}

export interface MissingCategoriesStatistics {
  totalMismatches: number
  uniqueCategories: number
  reviewedCount: number
  avgConfidence: number
}

export interface MissingCategoryCase {
  caseNumber: string
  confidence: number
  correctedTo: string
  description: string
}

export interface MissingCategoryDetail {
  category: string
  subcategories: string[]
  caseCount: number
  cases: MissingCategoryCase[]
}

export interface MissingCategoriesResponse {
  statistics: MissingCategoriesStatistics
  topCategories: Array<{ category: string; count: number; avgConfidence: number }>
  categoriesWithDetails: MissingCategoryDetail[]
  timeRange: string
}

export interface CatalogRedirectClientSummary {
  clientId: string
  clientName: string
}

export interface CatalogRedirectKeyword {
  keyword: string
  count: number
}

export interface CatalogRedirectSubmitter {
  submitter: string
  count: number
}

export interface CatalogRedirectByDay {
  date: string
  count: number
}

export interface CatalogRedirectMetrics {
  totalRedirects: number
  autoClosedCount: number
  autoClosedRate: number
  averageConfidence: number
  clientName: string
  redirectsByType?: Record<string, number>
  redirectsByDay?: CatalogRedirectByDay[]
  topKeywords?: CatalogRedirectKeyword[]
  topSubmitters?: CatalogRedirectSubmitter[]
}

export interface CatalogRedirectStatsResponse {
  metrics: CatalogRedirectMetrics | CatalogRedirectMetrics[]
  clients?: CatalogRedirectClientSummary[]
}

export interface StandupConfig extends JsonObject {
  cadence?: string
  time?: string
  channelId?: string
  participants?: string[]
  includeMentor?: boolean
  includeAcceptedCandidates?: boolean
  reminderMinutesBeforeDue?: number
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

  async updateConfig(updates: Record<string, unknown>): Promise<void> {
    await this.request('/api/admin/config', {
      method: 'PATCH',
      body: JSON.stringify({ updates }),
    })
  }

  // Queue Stats
  async getQueueStats(): Promise<QueueStats> {
    return this.request<QueueStats>('/api/admin/queue-stats')
  }

  // Reports
  async getMissingCategories(days: number = 30): Promise<MissingCategoriesResponse> {
    return this.request<MissingCategoriesResponse>(`/api/admin/reports/missing-categories?days=${days}`)
  }

  async getStrategicEvaluations(limit: number = 20): Promise<{
    evaluations: StrategicEvaluationSummary[]
    count: number
  }> {
    return this.request(`/api/admin/reports/strategic-evaluations?limit=${limit}`)
  }

  async getCatalogRedirectStats(clientId?: string, days: number = 30): Promise<CatalogRedirectStatsResponse> {
    const query = clientId ? `clientId=${clientId}&days=${days}` : `days=${days}`
    return this.request<CatalogRedirectStatsResponse>(`/api/admin/reports/catalog-redirects?${query}`)
  }

  // Clients
  async getClients(): Promise<{ success: boolean; data: ClientListItem[] }> {
    return this.request<{ success: boolean; data: ClientListItem[] }>('/api/admin/clients/route')
  }

  async getClientSettings(clientId: string): Promise<{ success: boolean; data: ClientSettings }> {
    return this.request<{ success: boolean; data: ClientSettings }>(`/api/admin/clients/${clientId}/route`)
  }

  async updateClientSettings(clientId: string, settings: ClientSettingsUpdate) {
    return this.request<{ success: boolean; data: ClientSettings | null; message: string }>(
      `/api/admin/clients/${clientId}/route`,
      {
        method: 'PATCH',
        body: JSON.stringify(settings),
      }
    )
  }

  // Projects
  async getProjects(filters?: ProjectFilters): Promise<{
    projects: Project[]
    stats: ProjectStats
    total: number
  }> {
    const params = new URLSearchParams()
    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        params.append('status', filters.status.join(','))
      } else {
        params.append('status', filters.status)
      }
    }
    if (filters?.mentor) params.append('mentor', filters.mentor)
    if (filters?.search) params.append('search', filters.search)
    if (filters?.limit) params.append('limit', filters.limit.toString())
    if (filters?.offset) params.append('offset', filters.offset.toString())

    const query = params.toString() ? `?${params.toString()}` : ''
    return this.request(`/api/admin/projects${query}`)
  }

  async getProject(id: string): Promise<ProjectWithRelations> {
    return this.request(`/api/admin/projects/${id}`)
  }

  async createProject(data: Partial<Project>): Promise<{ project: Project }> {
    return this.request(`/api/admin/projects`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateProject(id: string, data: Partial<Project>): Promise<{ project: Project }> {
    return this.request(`/api/admin/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deleteProject(id: string): Promise<{ success: boolean; message: string; id: string }> {
    return this.request(`/api/admin/projects/${id}`, {
      method: 'DELETE',
    })
  }

  // Project Standups
  async getProjectStandups(projectId: string): Promise<{
    standups: Standup[]
    config: StandupConfig | null
  }> {
    return this.request(`/api/admin/projects/${projectId}/standups`)
  }

  async createStandup(projectId: string, data: Partial<Standup>): Promise<{ standup: Standup }> {
    return this.request(`/api/admin/projects/${projectId}/standups`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateStandupConfig(
    projectId: string,
    config: StandupConfig
  ): Promise<{ project: Project; config: StandupConfig | null }> {
    return this.request(`/api/admin/projects/${projectId}/standups`, {
      method: 'PATCH',
      body: JSON.stringify({ config }),
    })
  }

  async getStandupDetails(
    projectId: string,
    standupId: string
  ): Promise<{ standup: Standup; responses: StandupResponse[] }> {
    return this.request(`/api/admin/projects/${projectId}/standups/${standupId}`)
  }

  async triggerStandup(projectId: string): Promise<{ standup: Standup; message: string }> {
    return this.request(`/api/admin/projects/${projectId}/standups/trigger`, {
      method: 'POST',
    })
  }

  // Project Analytics
  async getProjectAnalytics(projectId: string): Promise<ProjectAnalytics> {
    return this.request(`/api/admin/projects/${projectId}/analytics`)
  }
}

export const apiClient = new ApiClient()
