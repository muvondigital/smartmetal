import { Routes, Route, Navigate } from 'react-router-dom'
import AdminLayout from '../components/layout/AdminLayout'
import AdminDashboard from '../pages/AdminDashboard'
import ClientsManagement from '../pages/ClientsManagement'
import MaterialsManagement from '../pages/MaterialsManagement'
import SuppliersManagement from '../pages/SuppliersManagement'
import UsersManagement from '../pages/UsersManagement'
import SystemHealth from '../pages/SystemHealth'
import TenantSettings from '../pages/TenantSettings'
import PricingRulesManagement from '../pages/PricingRulesManagement'
import ApprovalRulesManagement from '../pages/ApprovalRulesManagement'

export default function Router() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route
        path="/dashboard"
        element={
          <AdminLayout>
            <AdminDashboard />
          </AdminLayout>
        }
      />
      <Route
        path="/clients"
        element={
          <AdminLayout>
            <ClientsManagement />
          </AdminLayout>
        }
      />
      <Route
        path="/materials"
        element={
          <AdminLayout>
            <MaterialsManagement />
          </AdminLayout>
        }
      />
      <Route
        path="/suppliers"
        element={
          <AdminLayout>
            <SuppliersManagement />
          </AdminLayout>
        }
      />
      <Route
        path="/users"
        element={
          <AdminLayout>
            <UsersManagement />
          </AdminLayout>
        }
      />
      <Route
        path="/system-health"
        element={
          <AdminLayout>
            <SystemHealth />
          </AdminLayout>
        }
      />
      <Route
        path="/settings/tenant"
        element={
          <AdminLayout>
            <TenantSettings />
          </AdminLayout>
        }
      />
      <Route
        path="/settings/pricing-rules"
        element={
          <AdminLayout>
            <PricingRulesManagement />
          </AdminLayout>
        }
      />
      <Route
        path="/settings/approval-rules"
        element={
          <AdminLayout>
            <ApprovalRulesManagement />
          </AdminLayout>
        }
      />
    </Routes>
  )
}

