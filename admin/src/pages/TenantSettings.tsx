import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'

export default function TenantSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Tenant Settings</h1>
        <p className="text-gray-500 mt-1">Configure tenant-level settings and preferences</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>General Settings</CardTitle>
          <CardDescription>Basic tenant configuration</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <p className="text-gray-500">Tenant settings interface coming soon</p>
            <p className="text-sm text-gray-400 mt-2">
              This will include: Tenant name, Code, Home country, Allowed countries of import, Activation status
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configuration Settings</CardTitle>
          <CardDescription>Advanced tenant configuration options</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <p className="text-gray-500">Configuration management coming soon</p>
            <p className="text-sm text-gray-400 mt-2">
              This will include: Approval rules, Pricing rules, Email config, Dashboard config, LME config
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

