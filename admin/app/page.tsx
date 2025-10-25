import Link from "next/link"
import { BarChart3, Database, FileText, Settings, AlertCircle, GitBranch } from "lucide-react"

export default function HomePage() {
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
    </div>
  )
}
