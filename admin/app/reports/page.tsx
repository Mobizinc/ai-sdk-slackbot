import Link from "next/link"
import { FileText, AlertCircle, TrendingUp, Users } from "lucide-react"

export default function ReportsPage() {
  const reports = [
    {
      title: "Missing Categories",
      description: "AI-suggested categories that don't exist in ServiceNow",
      icon: AlertCircle,
      href: "/reports/missing-categories",
      badge: "New",
      badgeColor: "bg-green-100 text-green-700",
    },
    {
      title: "Catalog Redirects",
      description: "HR request redirect analytics and trends",
      icon: TrendingUp,
      href: "/reports/catalog-redirects",
      badge: "New",
      badgeColor: "bg-green-100 text-green-700",
    },
    {
      title: "Escalations",
      description: "Non-BAU case escalation tracking",
      icon: FileText,
      href: "/reports/escalations",
      badge: "Coming Soon",
      badgeColor: "bg-gray-100 text-gray-600",
    },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Reports & Analytics</h1>
        <p className="text-gray-600">System insights and performance metrics</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reports.map((report) => {
          const Icon = report.icon

          return (
            <Link
              key={report.href}
              href={report.href}
              className="block group"
            >
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-all h-full">
                <div className="flex items-start justify-between mb-4">
                  <div className="bg-blue-100 w-12 h-12 rounded-lg flex items-center justify-center">
                    <Icon className="w-6 h-6 text-blue-600" />
                  </div>
                  {report.badge && (
                    <span className={`px-2 py-1 text-xs font-medium rounded ${report.badgeColor}`}>
                      {report.badge}
                    </span>
                  )}
                </div>

                <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-blue-600">
                  {report.title}
                </h3>
                <p className="text-sm text-gray-600">{report.description}</p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
