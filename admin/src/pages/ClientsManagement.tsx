import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Plus } from 'lucide-react'

export default function ClientsManagement() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Clients Management</h1>
          <p className="text-gray-500 mt-1">Manage client accounts and information</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Add Client
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Clients List</CardTitle>
          <CardDescription>View and manage all client accounts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <p className="text-gray-500">Client management interface coming soon</p>
            <p className="text-sm text-gray-400 mt-2">
              This will include: Add, Edit, Delete clients, View client details, Search and filter
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

