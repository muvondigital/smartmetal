import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'

export default function ApprovalRulesManagement() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Approval Rules Management</h1>
        <p className="text-gray-500 mt-1">Configure approval workflows and thresholds</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Approval Configuration</CardTitle>
          <CardDescription>Manage approval rules and workflow settings</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <p className="text-gray-500">Approval rules management interface coming soon</p>
            <p className="text-sm text-gray-400 mt-2">
              This will include: Approver assignments, Approval thresholds (value, margin, discount), SLA requirements, Email notifications
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

