"use client"

import { useEffect, useMemo, useState } from "react"
import { apiClient, type StrategicEvaluationSummary } from "@/lib/api-client"
import { Activity, AlertTriangle, Loader2, Target, Users } from "lucide-react"

interface GroupedEvaluations {
  [projectName: string]: StrategicEvaluationSummary[]
}

function groupByProject(evaluations: StrategicEvaluationSummary[]): GroupedEvaluations {
  return evaluations.reduce((acc, evaluation) => {
    const key = evaluation.projectName ?? "Unknown Project"
    if (!acc[key]) {
      acc[key] = []
    }
    acc[key].push(evaluation)
    return acc
  }, {} as GroupedEvaluations)
}

export default function StrategicEvaluationsReport() {
  const [evaluations, setEvaluations] = useState<StrategicEvaluationSummary[]>([])
  const [limit, setLimit] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadEvaluations()
  }, [limit])

  async function loadEvaluations() {
    try {
      setLoading(true)
      setError(null)
      const result = await apiClient.getStrategicEvaluations(limit)
      setEvaluations(result.evaluations ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load evaluations")
    } finally {
      setLoading(false)
    }
  }

  const grouped = useMemo(() => groupByProject(evaluations), [evaluations])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
        <AlertTriangle className="w-10 h-10 text-red-600 mx-auto mb-3" />
        <h2 className="text-xl font-semibold text-red-800 mb-2">Failed to load evaluations</h2>
        <p className="text-red-600">{error}</p>
      </div>
    )
  }

  if (evaluations.length === 0) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center">
        <Target className="w-10 h-10 text-blue-600 mx-auto mb-3" />
        <h2 className="text-xl font-semibold text-blue-800 mb-2">No evaluations recorded yet</h2>
        <p className="text-blue-600">Run `/project-evaluate` in Slack to generate the first strategic review.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Strategic Evaluations</h1>
          <p className="text-gray-600">Latest demand-intelligence reviews, readiness scores, and follow-up actions.</p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value={10}>Last 10</option>
            <option value={20}>Last 20</option>
            <option value={50}>Last 50</option>
            <option value={75}>Last 75</option>
            <option value={100}>Last 100</option>
          </select>
          <button
            onClick={() => void loadEvaluations()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <p className="text-sm text-gray-500 mb-1">Evaluations Loaded</p>
          <p className="text-3xl font-bold text-gray-900">{evaluations.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <p className="text-sm text-gray-500 mb-1">Distinct Projects</p>
          <p className="text-3xl font-bold text-blue-600">{Object.keys(grouped).length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <p className="text-sm text-gray-500 mb-1">Clarifications Needed</p>
          <p className="text-3xl font-bold text-amber-600">
            {evaluations.filter((ev) => ev.needsClarification).length}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <p className="text-sm text-gray-500 mb-1">Average Score</p>
          <p className="text-3xl font-bold text-green-600">
            {Math.round(
              evaluations.reduce((sum, ev) => {
                const score = ev.totalScore ?? ev.completenessScore ?? 0
                return sum + (typeof score === "number" ? score : 0)
              }, 0) / evaluations.length,
            ) || "—"}
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {Object.entries(grouped).map(([projectName, projectEvaluations]) => (
          <div key={projectName} className="bg-white border border-gray-200 rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{projectName}</h2>
                <p className="text-sm text-gray-500">
                  {projectEvaluations.length} evaluation{projectEvaluations.length === 1 ? "" : "s"} recorded
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Users className="w-4 h-4 text-gray-400" />
                  <span>
                    Latest reviewer:{" "}
                    {projectEvaluations[0].requestedByName
                      ? projectEvaluations[0].requestedByName
                      : projectEvaluations[0].requestedBy}
                  </span>
                </div>
              </div>
            </div>

            <div className="divide-y divide-gray-200">
              {projectEvaluations.map((evaluation) => {
                const score = evaluation.totalScore ?? evaluation.completenessScore;
                const createdLabel = formatRelativeTime(evaluation.createdAt)
                const riskBadge = evaluation.needsClarification ? (
                  <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                    Clarification Needed
                  </span>
                ) : (
                  <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                    Ready to Execute
                  </span>
                )

                return (
                  <div key={evaluation.id} className="p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-50 text-blue-600 text-lg font-semibold">
                          {typeof score === "number" ? score : "—"}
                        </span>
                        <div>
                          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                            <Activity className="w-4 h-4 text-blue-500" />
                            <span>{createdLabel}</span>
                            {riskBadge}
                          </div>
                          <p className="text-sm text-gray-600">
                            Recommendation:{" "}
                            <span className="font-medium text-gray-900">
                              {evaluation.recommendation ?? "Pending"}
                            </span>
                            {evaluation.confidence && ` • Confidence ${evaluation.confidence}`}
                          </p>
                        </div>
                      </div>
                    </div>

                    {evaluation.executiveSummary && (
                      <div className="mb-4">
                        <p className="text-sm font-semibold text-gray-800 mb-1">Executive Summary</p>
                        <p className="text-sm text-gray-700 leading-6">
                          {evaluation.executiveSummary}
                        </p>
                      </div>
                    )}

                    {evaluation.nextSteps.length > 0 && (
                      <div className="mb-4">
                        <p className="text-sm font-semibold text-gray-800 mb-1">Next Steps</p>
                        <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                          {evaluation.nextSteps.map((step, index) => (
                            <li key={index}>{step}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {evaluation.clarificationQuestions.length > 0 && (
                      <div className="mb-4">
                        <p className="text-sm font-semibold text-gray-800 mb-1">Clarification Prompts</p>
                        <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                          {evaluation.clarificationQuestions.map((question, index) => (
                            <li key={index}>{question}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                      <span>ID: {evaluation.id}</span>
                      {evaluation.channelId && <span>Channel: #{evaluation.channelId}</span>}
                      <span>
                        Requester:{" "}
                        {evaluation.requestedByName ? evaluation.requestedByName : evaluation.requestedBy}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
function formatRelativeTime(value: string): string {
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) {
    return value
  }

  const diffMs = Date.now() - timestamp
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  if (diffMinutes < 1) return "just now"
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`
  const diffWeeks = Math.floor(diffDays / 7)
  if (diffWeeks < 4) return `${diffWeeks} week${diffWeeks === 1 ? "" : "s"} ago`
  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) return `${diffMonths} month${diffMonths === 1 ? "" : "s"} ago`
  const diffYears = Math.floor(diffDays / 365)
  return `${diffYears} year${diffYears === 1 ? "" : "s"} ago`
}
