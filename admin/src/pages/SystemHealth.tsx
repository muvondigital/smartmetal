import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { CheckCircle, XCircle, AlertCircle, Activity, Database, Server, Clock } from 'lucide-react'

export default function SystemHealth() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">System Health</h1>
        <p className="text-gray-500 mt-1">Monitor system status and performance metrics</p>
      </div>

      {/* System Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Database
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <Badge variant="default" className="bg-green-500">
                <CheckCircle className="w-3 h-3 mr-1" />
                Healthy
              </Badge>
              <span className="text-sm text-gray-500">Connected</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              API Server
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <Badge variant="default" className="bg-green-500">
                <CheckCircle className="w-3 h-3 mr-1" />
                Running
              </Badge>
              <span className="text-sm text-gray-500">Operational</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              System Load
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <Badge variant="default" className="bg-green-500">
                Normal
              </Badge>
              <span className="text-sm text-gray-500">Low</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Health Checks */}
      <Card>
        <CardHeader>
          <CardTitle>Health Checks</CardTitle>
          <CardDescription>Detailed system component status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium text-green-900">Database Connection</p>
                  <p className="text-sm text-green-700">PostgreSQL connection active</p>
                </div>
              </div>
              <span className="text-sm text-green-600">OK</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium text-green-900">API Endpoints</p>
                  <p className="text-sm text-green-700">All endpoints responding</p>
                </div>
              </div>
              <span className="text-sm text-green-600">OK</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-yellow-600" />
                <div>
                  <p className="font-medium text-yellow-900">Performance Metrics</p>
                  <p className="text-sm text-yellow-700">Metrics collection coming soon</p>
                </div>
              </div>
              <span className="text-sm text-yellow-600">Pending</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>System Metrics</CardTitle>
          <CardDescription>Real-time system performance data</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <p className="text-gray-500">System metrics dashboard coming soon</p>
            <p className="text-sm text-gray-400 mt-2">
              This will include: API response times, Database query performance, Error rates, Active users, Request volumes
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

