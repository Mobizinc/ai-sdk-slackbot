"use client"

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Clock4,
  Loader2,
  RefreshCcw,
  Shield,
  ShieldAlert,
} from "lucide-react"
import {
  apiClient,
  type SupervisorReviewItem,
  type SupervisorReviewListResponse,
  type SupervisorReviewQuery,
  type SupervisorReviewVerdict,
  type SupervisorReviewArtifactType,
} from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { cn, formatDate } from "@/lib/utils"
import { toast } from "sonner"

const artifactOptions: Array<{ label: string; value: "all" | SupervisorReviewArtifactType }> = [
  { label: "All Artifacts", value: "all" },
  { label: "Slack Messages", value: "slack_message" },
  { label: "ServiceNow Work Notes", value: "servicenow_work_note" },
]

const verdictOptions: Array<{ label: string; value: "all" | SupervisorReviewVerdict }> = [
  { label: "All Verdicts", value: "all" },
  { label: "Pass", value: "pass" },
  { label: "Needs Revision", value: "revise" },
  { label: "Critical", value: "critical" },
]

type ActionType = "approve" | "reject"

type FormFilters = {
  type: "all" | SupervisorReviewArtifactType
  verdict: "all" | SupervisorReviewVerdict
  minAgeMinutes: string
  limit: string
}

const defaultFormFilters: FormFilters = {
  type: "all",
  verdict: "all",
  minAgeMinutes: "0",
  limit: "25",
}

export default function SupervisorReviewsPage() {
  const [data, setData] = useState<SupervisorReviewListResponse | null>(null)
  const [filters, setFilters] = useState<SupervisorReviewQuery>({ limit: 25 })
  const [formFilters, setFormFilters] = useState<FormFilters>(defaultFormFilters)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionState, setActionState] = useState<Record<string, ActionType>>({})

  const loadReviews = useCallback(
    async (opts?: { background?: boolean }) => {
      if (opts?.background) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      try {
        setError(null)
        const response = await apiClient.getSupervisorReviews(filters)
        setData(response)
      } catch (err) {
        console.error("Failed to load supervisor reviews", err)
        const message = err instanceof Error ? err.message : "Failed to load supervisor reviews"
        setError(message)
        toast.error(message)
      } finally {
        if (opts?.background) {
          setRefreshing(false)
        } else {
          setLoading(false)
        }
      }
    },
    [filters]
  )

  useEffect(() => {
    void loadReviews()
  }, [loadReviews])

  const applyFilters = useCallback(
    (event?: FormEvent) => {
      event?.preventDefault()
      const nextFilters: SupervisorReviewQuery = {}

      if (formFilters.type !== "all") {
        nextFilters.type = formFilters.type
      }
      if (formFilters.verdict !== "all") {
        nextFilters.verdict = formFilters.verdict
      }
      const minAge = Number(formFilters.minAgeMinutes)
      const normalizedMinAge = !Number.isNaN(minAge) && minAge > 0 ? minAge : 0
      if (normalizedMinAge > 0) {
        nextFilters.minAgeMinutes = normalizedMinAge
      }
      const limit = Number(formFilters.limit)
      const normalizedLimit = Number.isNaN(limit) || limit <= 0 ? 25 : limit
      nextFilters.limit = normalizedLimit

      setFormFilters((prev) => ({
        ...prev,
        minAgeMinutes: normalizedMinAge > 0 ? normalizedMinAge.toString() : "0",
        limit: normalizedLimit.toString(),
      }))
      setFilters(nextFilters)
    },
    [formFilters]
  )

  const resetFilters = () => {
    setFormFilters(defaultFormFilters)
    setFilters({ limit: 25 })
  }

  const handleAction = async (item: SupervisorReviewItem, action: ActionType) => {
    setActionState((prev) => ({ ...prev, [item.id]: action }))
    try {
      if (action === "approve") {
        await apiClient.approveSupervisorReview(item.id)
        toast.success("Supervisor review approved")
      } else {
        await apiClient.rejectSupervisorReview(item.id)
        toast.success("Supervisor review rejected")
      }
      await loadReviews({ background: true })
    } catch (err) {
      console.error(`Failed to ${action} supervisor review`, err)
      const message = err instanceof Error ? err.message : `Failed to ${action} review`
      toast.error(message)
    } finally {
      setActionState((prev) => {
        const next = { ...prev }
        delete next[item.id]
        return next
      })
    }
  }

  const verdictBadgeClass = useCallback((verdict: SupervisorReviewItem["verdict"] | "unknown") => {
    switch (verdict) {
      case "pass":
        return "bg-green-100 text-green-700 border-green-200"
      case "revise":
        return "bg-yellow-100 text-yellow-800 border-yellow-200"
      case "critical":
        return "bg-red-100 text-red-700 border-red-200"
      default:
        return "bg-gray-100 text-gray-600 border-gray-200"
    }
  }, [])

  const items = data?.items ?? []
  const stats = useMemo(() => data?.stats, [data])
  const isInitialLoading = loading && !data && !error
  const isRefreshing = refreshing || (loading && !!data)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Supervisor Reviews</h1>
          <p className="text-gray-600 mt-1">
            Review LLM QA verdicts and unblock conversations by approving or rejecting pending artifacts.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => loadReviews({ background: true })}
          disabled={loading || refreshing}
        >
          {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
          Refresh
        </Button>
      </div>

      {error && !isInitialLoading ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h3 className="text-red-800 font-semibold mb-2">Failed to load supervisor reviews</h3>
          <p className="text-red-600 text-sm mb-4">{error}</p>
          <Button onClick={() => loadReviews()}>Try again</Button>
        </div>
      ) : null}

      <form onSubmit={applyFilters} className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Artifact Type</label>
            <Select
              value={formFilters.type}
              onChange={(event) => setFormFilters((prev) => ({ ...prev, type: event.target.value as FormFilters["type"] }))}
            >
              {artifactOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">LLM Verdict</label>
            <Select
              value={formFilters.verdict}
              onChange={(event) => setFormFilters((prev) => ({ ...prev, verdict: event.target.value as FormFilters["verdict"] }))}
            >
              {verdictOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Minimum Age (minutes)</label>
            <Input
              type="number"
              min={0}
              value={formFilters.minAgeMinutes}
              onChange={(event) => setFormFilters((prev) => ({ ...prev, minAgeMinutes: event.target.value }))}
              placeholder="0"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Limit</label>
            <Select
              value={formFilters.limit}
              onChange={(event) => setFormFilters((prev) => ({ ...prev, limit: event.target.value }))}
            >
              {[10, 25, 50, 100].map((value) => (
                <option key={value} value={value.toString()}>
                  {value} items
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 mt-6">
          <Button type="submit" disabled={loading && !data}>
            Apply Filters
          </Button>
          <Button type="button" variant="outline" onClick={resetFilters} disabled={loading && !data}>
            Reset
          </Button>
        </div>
      </form>

      {isInitialLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Loading supervisor reviews…</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {stats ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <StatCard
                icon={<Shield className="w-5 h-5 text-blue-600" />}
                title="Pending Reviews"
                value={stats.totalPending}
                subtitle={`Average age: ${stats.averageAgeMinutes}m`}
              />
              <StatCard
                icon={<Clock4 className="w-5 h-5 text-amber-600" />}
                title="Slack Messages"
                value={stats.byType.slack_message}
                subtitle="Awaiting QA"
              />
              <StatCard
                icon={<ShieldAlert className="w-5 h-5 text-purple-600" />}
                title="ServiceNow Notes"
                value={stats.byType.servicenow_work_note}
                subtitle="Needs review"
              />
              <StatCard
                icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
                title="Critical Verdicts"
                value={stats.byVerdict.critical}
                subtitle={`${stats.byVerdict.revise} flagged for revision`}
              />
            </div>
          ) : null}

          {items.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-gray-500">
              No supervisor reviews match the current filters.
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => {
                const acting = Boolean(actionState[item.id])
                const verdictLabel: SupervisorReviewVerdict | "unknown" = item.verdict ?? "unknown"
                return (
                  <div key={item.id} className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-4 mb-4">
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-semibold text-gray-900">
                            {item.caseNumber ?? "Unassigned case"}
                          </span>
                          <span
                            className={cn(
                              "text-xs font-medium px-2 py-1 rounded-full border",
                              item.artifactType === "slack_message"
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            )}
                          >
                            {item.artifactType === "slack_message" ? "Slack" : "ServiceNow"}
                          </span>
                          <span
                            className={cn(
                              "text-xs font-medium px-2 py-1 rounded-full border",
                              verdictBadgeClass(verdictLabel)
                            )}
                          >
                            {verdictLabel === "unknown"
                              ? "No verdict"
                              : verdictLabel === "revise"
                              ? "Needs revision"
                              : verdictLabel === "critical"
                              ? "Critical"
                              : "Pass"}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">Blocked {formatDate(item.blockedAt)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-gray-900">{item.ageMinutes}m</p>
                        <p className="text-sm text-gray-500">Age in queue</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-2">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Reason for hold</h4>
                        <p className="text-sm text-gray-900 whitespace-pre-line">{item.reason}</p>
                        {item.metadata && Object.keys(item.metadata).length > 0 ? (
                          <div className="mt-4">
                            <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Metadata</h5>
                            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {Object.entries(item.metadata).map(([key, value]) => (
                                <div key={key} className="bg-gray-50 rounded px-3 py-2">
                                  <dt className="text-xs font-medium text-gray-500">{key}</dt>
                                  <dd className="text-sm text-gray-900 break-all">{formatMetadataValue(value)}</dd>
                                </div>
                              ))}
                            </dl>
                          </div>
                        ) : null}
                      </div>
                      <div className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <CheckCircle2 className="w-4 h-4 text-gray-600" />
                          <p className="text-sm font-semibold text-gray-800">LLM Feedback</p>
                        </div>
                        {item.llmReview ? (
                          <div>
                            <p className="text-sm text-gray-900 mb-2">{item.llmReview.summary}</p>
                            {typeof item.llmReview.confidence === "number" ? (
                              <p className="text-xs text-gray-500 mb-3">
                                Confidence: {Math.round(item.llmReview.confidence * 100)}%
                              </p>
                            ) : null}
                            {item.llmReview.issues.length > 0 ? (
                              <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                                {item.llmReview.issues.map((issue, index) => (
                                  <li key={`${item.id}-issue-${index}`}>
                                    <span className="font-medium text-gray-900">[{issue.severity}]</span> {issue.description}
                                    {issue.recommendation ? (
                                      <span className="text-gray-500"> — {issue.recommendation}</span>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-sm text-gray-500">No issues listed.</p>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">LLM verdict unavailable.</p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 mt-6 border-t border-gray-100 pt-4">
                      <div className="text-sm text-gray-500">
                        {item.channelId ? (
                          <span className="mr-4">Channel: <code>{item.channelId}</code></span>
                        ) : null}
                        {item.threadTs ? (
                          <span>Thread: <code>{item.threadTs}</code></span>
                        ) : null}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={acting || isRefreshing}
                          onClick={() => handleAction(item, "reject")}
                        >
                          {actionState[item.id] === "reject" ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <AlertTriangle className="w-4 h-4" />
                          )}
                          Reject
                        </Button>
                        <Button
                          type="button"
                          disabled={acting || isRefreshing}
                          onClick={() => handleAction(item, "approve")}
                        >
                          {actionState[item.id] === "approve" ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                          Approve
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatCard({
  icon,
  title,
  value,
  subtitle,
}: {
  icon: ReactNode
  title: string
  value: number
  subtitle?: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-gray-100 rounded-full">{icon}</div>
        <span className="text-sm font-medium text-gray-600">{title}</span>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      {subtitle ? <p className="text-sm text-gray-500 mt-1">{subtitle}</p> : null}
    </div>
  )
}

function formatMetadataValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—"
  }
  if (typeof value === "string") {
    return value
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  if (Array.isArray(value)) {
    return value.join(", ")
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
