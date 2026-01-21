import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Plus, Upload } from 'lucide-react'

export default function SuppliersManagement() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Suppliers Management</h1>
          <p className="text-gray-500 mt-1">Manage supplier accounts and price lists</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Upload className="w-4 h-4 mr-2" />
            Upload Price List
          </Button>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Supplier
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Suppliers List</CardTitle>
          <CardDescription>View and manage all supplier accounts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <p className="text-gray-500">Suppliers management interface coming soon</p>
            <p className="text-sm text-gray-400 mt-2">
              This will include: Add, Edit, Delete suppliers, Manage price lists, Track supplier performance
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

