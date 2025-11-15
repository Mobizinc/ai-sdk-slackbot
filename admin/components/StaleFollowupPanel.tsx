"use client"

import { useState, useTransition } from "react"
import { Loader2, RefreshCcw } from "lucide-react"
import { toast } from "sonner"
import { apiClient, type StaleCaseFollowupSummary } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { formatDate } from "@/lib/utils"

interface Props {
  initialSummary: StaleCaseFollowupSummary | null
}

export function StaleFollowupPanel({ initialSummary }: Props) {
  const [summary, setSummary] = useState<StaleCaseFollowupSummary | null>(initialSummary)
  const [pending, startTransition] = useTransition()

  const triggerFollowup = () => {
    startTransition(async () => {
      try {
        const result = await apiClient.triggerStaleCaseFollowup()
        setSummary(result)
        toast.success("Follow-up job completed")
      } catch (error) {
        console.error("Failed to trigger follow-up", error)
        const message = error instanceof Error ? error.message : "Failed to trigger job"
        toast.error(message)
      }
    })
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Stale Case Follow-up</h3>
          <p className="text-sm text-gray-500">
            {summary ? `Last run ${formatDate(summary.runAt)}` : "No follow-up run recorded yet."}
          </p>
        </div>
        <Button onClick={triggerFollowup} disabled={pending} variant="outline" className="gap-2">
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
          Run follow-up
        </Button>
      </div>

      {summary ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2">Assignment Group</th>
                <th className="py-2">Channel</th>
                <th className="py-2">Cases ≥{summary.thresholdDays}d</th>
                <th className="py-2">Follow-ups sent (cap {summary.followupLimit})</th>
              </tr>
            </thead>
            <tbody>
              {summary.groups.map((group) => (
                <tr key={group.assignmentGroup} className="border-t border-gray-100">
                  <td className="py-2 text-gray-900 font-medium">{group.assignmentGroup}</td>
                  <td className="py-2 text-gray-600">{group.slackChannelLabel ?? group.slackChannel}</td>
                  <td className="py-2 text-gray-900">{group.totalCases}</td>
                  <td className="py-2 text-gray-900">{group.followupsPosted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-gray-500">No metrics captured yet. Run the follow-up job to populate data.</p>
      )}
    </div>
  )
}
