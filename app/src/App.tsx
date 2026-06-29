import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { ExecutiveDashboardPage } from './pages/ExecutiveDashboardPage'
import { DashboardDetailsPage } from './pages/DashboardDetailsPage'
import { PartnersPage } from './pages/PartnersPage'
import { BillingPage } from './pages/BillingPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { TimePage } from './pages/TimePage'
import { InvoicesPage } from './pages/InvoicesPage'
import { EmployeeExpensesPage } from './pages/EmployeeExpensesPage'
import { CompensationPage } from './pages/CompensationPage'
import { EmployeesPage } from './pages/EmployeesPage'
import { PayrollPage } from './pages/PayrollPage'
import { DividendsPage } from './pages/DividendsPage'
import { ShareholdersPage } from './pages/ShareholdersPage'
import { SalesTaxPage } from './pages/SalesTaxPage'
import { CorporateTaxPage } from './pages/CorporateTaxPage'
import { OtherHubPage } from './pages/OtherHubPage'
import { FinancialReportsPage } from './pages/FinancialReportsPage'
import { GeneralLedgerPage } from './pages/GeneralLedgerPage'
import { SettingsPage } from './pages/SettingsPage'
import { BankPage } from './pages/BankPage'
import { AdjustmentsPage } from './pages/AdjustmentsPage'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted">Chargement…</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<ExecutiveDashboardPage />} />
          <Route path="dashboard/details" element={<DashboardDetailsPage />} />
          <Route path="partners" element={<PartnersPage />} />
          <Route path="clients" element={<Navigate to="/partners" replace />} />
          <Route path="billing" element={<BillingPage />}>
            <Route index element={<Navigate to="projects" replace />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="time" element={<TimePage />} />
            <Route path="invoices" element={<InvoicesPage />} />
          </Route>
          <Route path="projects" element={<Navigate to="/billing/projects" replace />} />
          <Route path="time" element={<Navigate to="/billing/time" replace />} />
          <Route path="invoices" element={<Navigate to="/billing/invoices" replace />} />
          <Route path="payments" element={<Navigate to="/bank" replace />} />
          <Route path="expenses" element={<Navigate to="/bank" replace />} />
          <Route path="employee-expenses" element={<EmployeeExpensesPage />} />
          <Route path="compensation" element={<CompensationPage />}>
            <Route index element={<Navigate to="payroll" replace />} />
            <Route path="payroll" element={<PayrollPage />} />
            <Route path="dividends" element={<DividendsPage />} />
            <Route path="shareholders" element={<ShareholdersPage />} />
            <Route path="employees" element={<EmployeesPage />} />
          </Route>
          <Route path="payroll" element={<Navigate to="/compensation/payroll" replace />} />
          <Route path="dividends" element={<Navigate to="/compensation/dividends" replace />} />
          <Route path="other" element={<OtherHubPage />} />
          <Route path="taxes" element={<Navigate to="/other" replace />} />
          <Route path="sales-tax" element={<SalesTaxPage />} />
          <Route path="corporate-tax" element={<CorporateTaxPage />} />
          <Route path="financial-reports" element={<FinancialReportsPage />} />
          <Route path="ledger" element={<GeneralLedgerPage />} />
          <Route path="bank" element={<BankPage />} />
          <Route path="adjustments" element={<AdjustmentsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
