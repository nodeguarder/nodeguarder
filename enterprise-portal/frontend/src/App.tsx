import React, { useState, useEffect, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { version } from '../package.json'
import {
  LayoutDashboard,
  Radio,
  Shield,
  FileText,
  ClipboardCheck,
  Settings,
  ChevronDown,
  LogOut,
  Activity,
  Server,
  Users,
  Menu,
  X,
  Eye,
  EyeOff,
  Brain,
  BarChart,
} from 'lucide-react'
import { setAuthToken, clearAuth, setOnLogout } from '@/api/client'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Agents from '@/pages/Agents'
import AgentDetail from '@/pages/AgentDetail'
import Policies from '@/pages/Policies'
import AuditLogs from '@/pages/AuditLogs'
import Compliance from '@/pages/Compliance'
import SettingsPage from '@/pages/Settings'
import LLMLandscape from '@/pages/LLMLandscape'
import Usage from '@/pages/Usage'
import GetStarted from '@/pages/GetStarted'
import PolicyEditor from '@/pages/PolicyEditor'
import ToastContainer from '@/components/Toast'

const sidebarNav = [
  { to: '/get-started', label: 'Get Started', icon: Activity },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/agents', label: 'Agents', icon: Radio },
  { to: '/llm-landscape', label: 'LLM Landscape', icon: Brain },
  { to: '/usage', label: 'Usage', icon: BarChart },
  { to: '/policies', label: 'Policies', icon: Shield },
  { to: '/audit-logs', label: 'Audit Logs', icon: FileText },
  { to: '/compliance', label: 'Compliance', icon: ClipboardCheck },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      className={`${
        collapsed ? 'w-16' : 'w-64'
      } bg-portal-sidebar border-r border-portal-border flex flex-col transition-all duration-300 fixed left-0 top-0 h-full z-30`}
    >
      <div className="h-16 flex items-center px-4 border-b border-portal-border">
        {collapsed ? (
          <div className="w-full flex justify-center">
            <Shield className="w-7 h-7 text-portal-accent" />
          </div>
        ) : (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2.5">
              <Shield className="w-7 h-7 text-portal-accent" />
              <div>
                <div className="text-sm font-bold text-portal-text tracking-tight">NODEGUARDER</div>
                <div className="text-[10px] text-portal-text-muted tracking-wider uppercase">Enterprise</div>
              </div>
            </div>
            <button onClick={onToggle} className="text-portal-text-muted hover:text-portal-text p-1">
              <Menu className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {collapsed && (
        <button onClick={onToggle} className="mx-auto mt-3 text-portal-text-muted hover:text-portal-text p-1">
          <Menu className="w-4 h-4" />
        </button>
      )}

      <nav className="flex-1 py-4 space-y-1">
        {sidebarNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `sidebar-link group ${isActive ? 'active' : ''} ${collapsed ? 'justify-center px-0 mx-2 rounded-lg border-l-0' : ''}`
            }
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="w-4.5 h-4.5 flex-shrink-0" size={18} />
            {!collapsed && <span className="text-xs tracking-wide">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className={`p-4 border-t border-portal-border ${collapsed ? 'flex justify-center' : ''}`}>
        <div className="flex items-center gap-2 text-portal-text-muted text-xs">
          <Activity className="w-3.5 h-3.5" />
          {!collapsed && <span>v{version}</span>}
        </div>
      </div>
    </aside>
  )
}

function TopBar({ user, onLogout }: { user: { email: string; display_name: string; role: string } | null; onLogout: () => void }) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const location = useLocation()

  const pageName = sidebarNav.find((n) => location.pathname.startsWith(n.to))?.label || 'Dashboard'

  return (
    <header className="h-16 bg-portal-bg border-b border-portal-border flex items-center justify-between px-6 sticky top-0 z-20">
      <div>
        <h2 className="text-lg font-semibold text-portal-text">{pageName}</h2>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2.5 bg-portal-card border border-portal-border rounded-lg px-3 py-2 hover:bg-portal-sidebar transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-portal-accent/20 flex items-center justify-center">
              <Users className="w-3.5 h-3.5 text-portal-accent" />
            </div>
            <div className="text-left">
              <div className="text-sm font-medium text-portal-text leading-tight">{user?.display_name || 'User'}</div>
              <div className="text-[10px] text-portal-text-muted uppercase tracking-wider">{user?.role || '—'}</div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-portal-text-muted" />
          </button>
          {dropdownOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
              <div className="absolute right-0 mt-2 w-56 bg-portal-card border border-portal-border rounded-lg shadow-xl z-20 py-2">
                <div className="px-4 py-2 border-b border-portal-border">
                  <div className="text-sm text-portal-text">{user?.email || ''}</div>
                  <div className="text-xs text-portal-text-muted">{user?.role || ''}</div>
                </div>
                <button
                  onClick={onLogout}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-portal-danger hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-portal-bg flex items-center justify-center">
      <div className="flex items-center gap-3">
        <Shield className="w-8 h-8 text-portal-accent animate-pulse" />
        <div className="text-portal-text-muted text-sm">Loading</div>
      </div>
    </div>
  )
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token')
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AuthenticatedLayout() {
  const [user, setUser] = useState<{ email: string; display_name: string; role: string } | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    setOnLogout(() => {
      navigate('/login')
    })
    const u = localStorage.getItem('user')
    if (u) {
      try {
        setUser(JSON.parse(u))
      } catch {
        //
      }
    }
    setLoading(false)
  }, [navigate])

  const handleLogout = useCallback(() => {
    clearAuth()
    localStorage.removeItem('user')
    navigate('/login')
  }, [navigate])

  if (loading) return <LoadingScreen />

  return (
    <div className="min-h-screen bg-portal-bg flex">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <div className={`flex-1 flex flex-col transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
        <TopBar user={user} onLogout={handleLogout} />
        <main className="flex-1 p-6">
          <ToastContainer />
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/agents/:uuid" element={<AgentDetail />} />
            <Route path="/llm-landscape" element={<LLMLandscape />} />
            <Route path="/usage" element={<Usage />} />
            <Route path="/policies" element={<Policies />} />
            <Route path="/audit-logs" element={<AuditLogs />} />
            <Route path="/compliance" element={<Compliance />} />
            <Route path="/get-started" element={<GetStarted />} />
            <Route path="/policies/new" element={<PolicyEditor />} />
            <Route path="/policies/:id/edit" element={<PolicyEditor />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <PrivateRoute>
              <AuthenticatedLayout />
            </PrivateRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
