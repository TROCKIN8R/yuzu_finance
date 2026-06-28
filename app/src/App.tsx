import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { ClientsPage } from './pages/ClientsPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { TimePage } from './pages/TimePage'
import { InvoicesPage } from './pages/InvoicesPage'
import { PaymentsPage } from './pages/PaymentsPage'
import { ExpensesPage } from './pages/ExpensesPage'
import { EmployeeExpensesPage } from './pages/EmployeeExpensesPage'
import { PayrollPage } from './pages/PayrollPage'
import { DividendsPage } from './pages/DividendsPage'
import { SalesTaxPage } from './pages/SalesTaxPage'
import { CorporateTaxPage } from './pages/CorporateTaxPage'
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
          <Route index element={<DashboardPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="time" element={<TimePage />} />
          <Route path="invoices" element={<InvoicesPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="employee-expenses" element={<EmployeeExpensesPage />} />
          <Route path="payroll" element={<PayrollPage />} />
          <Route path="dividends" element={<DividendsPage />} />
          <Route path="sales-tax" element={<SalesTaxPage />} />
          <Route path="corporate-tax" element={<CorporateTaxPage />} />
          <Route path="ledger" element={<GeneralLedgerPage />} />
          <Route path="bank" element={<BankPage />} />
          <Route path="adjustments" element={<AdjustmentsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
