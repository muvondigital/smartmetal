import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Plus, Upload } from 'lucide-react'

export default function MaterialsManagement() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Materials Management</h1>
          <p className="text-gray-500 mt-1">Manage material catalog and pricing</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Upload className="w-4 h-4 mr-2" />
            Bulk Import
          </Button>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Material
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Materials Catalog</CardTitle>
          <CardDescription>View and manage all materials in the catalog</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <p className="text-gray-500">Materials management interface coming soon</p>
            <p className="text-sm text-gray-400 mt-2">
              This will include: Add, Edit, Delete materials, Bulk import, Export catalog, Material categorization
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

