export default function EscalationsPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Escalation Dashboard</h1>
        <p className="text-gray-600">Non-BAU case escalation tracking</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center">
        <h2 className="text-xl font-semibold text-blue-900 mb-2">Coming Soon</h2>
        <p className="text-blue-700">
          Escalation dashboard will be available once escalation data starts collecting.
        </p>
        <p className="text-sm text-blue-600 mt-2">
          Escalation service is integrated (Step 16 in case-triage.ts).
          Dashboard will show active escalations, response times, and acknowledgment rates.
        </p>
      </div>
    </div>
  )
}
