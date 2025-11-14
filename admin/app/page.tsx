import { ReactNode } from "react"
import Link from "next/link"
import { BarChart3, Database, Settings, AlertCircle, ShieldCheck, Clock3, AlertTriangle } from "lucide-react"
import { apiClient, type SupervisorReviewStats, type StaleCaseFollowupSummary } from "@/lib/api-client"
import { StaleFollowupPanel } from "@/components/StaleFollowupPanel"

export default async function HomePage() {
  let supervisorStats: SupervisorReviewStats | null = null
  let followupSummary: StaleCaseFollowupSummary | null = null
  try {
    const reviewData = await apiClient.getSupervisorReviews({ limit: 0 })
    supervisorStats = reviewData.stats
  } catch (error) {
    console.error("Failed to load supervisor stats", error)
  }

  try {
    followupSummary = await apiClient.getStaleCaseFollowupSummary()
  } catch (error) {
    console.error("Failed to load follow-up summary", error)
  }

  const cards = [
    {
      title: "Business Contexts",
      description: "Manage clients, vendors, and platforms",
      icon: Database,
      href: "/business-contexts",
      color: "bg-blue-500",
    },
    {
      title: "Reports",
      description: "Analytics and insights",
      icon: BarChart3,
      href: "/reports",
      color: "bg-green-500",
    },
    {
      title: "Configuration",
      description: "System settings and environment",
      icon: Settings,
      href: "/config",
      color: "bg-purple-500",
    },
    {
      title: "Monitoring",
      description: "Queue stats and performance",
      icon: AlertCircle,
      href: "/monitoring",
      color: "bg-orange-500",
    },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">
          Admin Dashboard
        </h1>
        <p className="text-gray-600">
          Manage and monitor your AI Slack Bot system
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="block group"
          >
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
              <div className={`${card.color} w-12 h-12 rounded-lg flex items-center justify-center mb-4`}>
                <card.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-blue-600">
                {card.title}
              </h3>
              <p className="text-sm text-gray-600">
                {card.description}
              </p>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-1">System Status</h3>
          <p className="text-2xl font-bold text-green-600">Operational</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-1">Environment</h3>
          <p className="text-2xl font-bold text-gray-900">
            {process.env.NODE_ENV === 'production' ? 'Production' : 'Development'}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-1">Quick Actions</h3>
          <div className="flex gap-2 mt-2">
            <Link
              href="/business-contexts"
              className="text-sm px-3 py-1.5 bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
            >
              Add Context
            </Link>
            <Link
              href="/reports"
              className="text-sm px-3 py-1.5 bg-green-50 text-green-700 rounded hover:bg-green-100"
            >
              View Reports
            </Link>
          </div>
        </div>
      </div>

      <SupervisorQueueSection stats={supervisorStats} followupSummary={followupSummary} />
    </div>
  )
}

function SupervisorQueueSection({ stats, followupSummary }: { stats: SupervisorReviewStats | null; followupSummary: StaleCaseFollowupSummary | null }) {
  return (
    <div className="mt-12 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Supervisor QA Queue</h2>
          <p className="text-gray-600 text-sm">Pending reviews from `/review-latest` and the admin dashboard.</p>
        </div>
      </div>
      {stats ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <SupervisorStatCard
            icon={<ShieldCheck className="w-5 h-5 text-blue-600" />}
            label="Total Pending"
            value={stats.totalPending}
            helper={`Avg age ${stats.averageAgeMinutes}m`}
          />
          <SupervisorStatCard
            icon={<Clock3 className="w-5 h-5 text-amber-600" />}
            label="Slack Reviews"
            value={stats.byType.slack_message}
            helper="Awaiting approval"
          />
          <SupervisorStatCard
            icon={<AlertCircle className="w-5 h-5 text-purple-600" />}
            label="Needs Revision"
            value={stats.byVerdict.revise}
            helper="LLM verdict: revise"
          />
          <SupervisorStatCard
            icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
            label="Critical"
            value={stats.byVerdict.critical}
            helper="Highest risk items"
          />
        </div>
      ) : (
        <div className="bg-white border border-dashed border-gray-300 rounded-lg p-6 text-gray-500 text-sm">
          Unable to load supervisor stats. Confirm the admin API token is configured.
        </div>
      )}

      <StaleFollowupPanel initialSummary={followupSummary} />
    </div>
  )
}

function SupervisorStatCard({
  icon,
  label,
  value,
  helper,
}: {
  icon: ReactNode
  label: string
  value: number
  helper?: string
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-gray-100 rounded-full">{icon}</div>
        <span className="text-sm font-medium text-gray-600">{label}</span>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      {helper ? <p className="text-sm text-gray-500 mt-1">{helper}</p> : null}
    </div>
  )
}
