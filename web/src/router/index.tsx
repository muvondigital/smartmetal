import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedLayout from '../components/ProtectedLayout'
import LoginPage from '../pages/LoginPage'
import Dashboard from '../pages/Dashboard'
import RfqList from '../pages/RfqList'
import RfqCreate from '../pages/RfqCreate'
import RfqDetail from '../pages/RfqDetail'
import CommercialRequestWorkbench from '../pages/CommercialRequestWorkbench'
import RfqImportPage from '../pages/RfqImportPage'
import PricingRunDetail from '../pages/PricingRunDetail'
import ApprovalQueue from '../pages/ApprovalQueue'
// Removed: Analytics, AssistantPage, LmePrices (de-engineered)
import MaterialsCatalog from '../pages/MaterialsCatalog'
import MaterialDetail from '../pages/MaterialDetail'
import PriceImport from '../pages/PriceImport'
import AdminPage from '../pages/AdminPage'
import ComplianceCenter from '../pages/ComplianceCenter'
import OnboardingLayout from '../pages/onboarding/OnboardingLayout'
import OnboardingWelcome from '../pages/onboarding/OnboardingWelcome'
import TenantProfileStep from '../pages/onboarding/TenantProfileStep'
import ApprovalRulesStep from '../pages/onboarding/ApprovalRulesStep'
import OperatorRulesStep from '../pages/onboarding/OperatorRulesStep'
import PricingStep from '../pages/onboarding/PricingStep'
import CatalogStep from '../pages/onboarding/CatalogStep'
import NotificationsStep from '../pages/onboarding/NotificationsStep'
// Removed: RegulatoryStep (de-engineered)
import ReviewStep from '../pages/onboarding/ReviewStep'

export default function Router() {
  // Check if admin is enabled via environment variable
  const adminEnabled = import.meta.env.VITE_ADMIN_ENABLED === 'true';

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/onboarding" element={<OnboardingLayout />}>
        <Route index element={<OnboardingWelcome />} />
        <Route path="profile" element={<TenantProfileStep />} />
        <Route path="approval-rules" element={<ApprovalRulesStep />} />
        <Route path="operator-rules" element={<OperatorRulesStep />} />
        <Route path="pricing" element={<PricingStep />} />
        <Route path="catalog" element={<CatalogStep />} />
        <Route path="notifications" element={<NotificationsStep />} />
        {/* Removed: regulatory route (de-engineered) */}
        <Route path="review" element={<ReviewStep />} />
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedLayout>
            <Dashboard />
          </ProtectedLayout>
        }
      />
      <Route
        path="/rfqs"
        element={
          <ProtectedLayout>
            <RfqList />
          </ProtectedLayout>
        }
      />
      <Route
        path="/rfqs/new"
        element={
          <ProtectedLayout>
            <RfqCreate />
          </ProtectedLayout>
        }
      />
      <Route
        path="/rfqs/import"
        element={
          <ProtectedLayout>
            <RfqImportPage />
          </ProtectedLayout>
        }
      />
      <Route
        path="/rfqs/:id"
        element={
          <ProtectedLayout>
            <RfqDetail />
          </ProtectedLayout>
        }
      />
      <Route
        path="/commercial-requests/:id/workbench"
        element={
          <ProtectedLayout>
            <CommercialRequestWorkbench />
          </ProtectedLayout>
        }
      />
      <Route
        path="/pricing-runs/:id"
        element={
          <ProtectedLayout>
            <PricingRunDetail />
          </ProtectedLayout>
        }
      />
      {/* Materials Catalog */}
      <Route
        path="/materials"
        element={
          <ProtectedLayout>
            <MaterialsCatalog />
          </ProtectedLayout>
        }
      />
      <Route
        path="/materials/:id"
        element={
          <ProtectedLayout>
            <MaterialDetail />
          </ProtectedLayout>
        }
      />
      {/* Price Import */}
      <Route
        path="/price-import"
        element={
          <ProtectedLayout>
            <PriceImport />
          </ProtectedLayout>
        }
      />
      {/* Approval Workflow Routes */}
      <Route
        path="/approvals"
        element={
          <ProtectedLayout>
            <ApprovalQueue />
          </ProtectedLayout>
        }
      />
      {/* Removed: Analytics, AI Assistant, LME Prices, Price Agreements routes (de-engineered) */}
      {/* Phase 5: Admin Tooling (internal only) */}
      {adminEnabled && (
        <Route
          path="/admin"
          element={
            <ProtectedLayout>
              <AdminPage />
            </ProtectedLayout>
          }
        />
      )}
      {/* Phase 8: Compliance Center */}
      <Route
        path="/compliance"
        element={
          <ProtectedLayout>
            <ComplianceCenter />
          </ProtectedLayout>
        }
      />
    </Routes>
  )
}


