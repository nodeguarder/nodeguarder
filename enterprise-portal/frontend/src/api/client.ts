import { API_BASE } from '@/lib/utils'
import type { LoginResponse, DashboardSummary, Agent, Policy, AuditLog, EnrollmentCode, User, EnvironmentReport, LLMLandscape, LandscapeReport, ConfigSuggestion, ComplianceReport, ComplianceSummary, AgentGroup, OnboardingStatus, MetricsSummary, PerModelMetric, DailyMetric, PerAgentMetric, RequestMetric } from '@/types'

let token: string | null = localStorage.getItem('token')
let onLogout: (() => void) | null = null

export function setAuthToken(t: string) {
  token = t
  localStorage.setItem('token', t)
}

export function clearAuth() {
  token = null
  localStorage.removeItem('token')
  onLogout?.()
}

export function setOnLogout(fn: () => void) {
  onLogout = fn
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })

  if (res.status === 401) {
    clearAuth()
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'Request failed')
  }

  return res.json()
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export function getDashboard(): Promise<DashboardSummary> {
  return request('/dashboard/summary')
}

export function getAgents(params?: { status?: string; search?: string; page?: number; per_page?: number; group_id?: string }): Promise<{ agents: Agent[]; total: number; page: number; per_page: number }> {
  const qs = new URLSearchParams()
  if (params?.status) qs.set('status', params.status)
  if (params?.search) qs.set('search', params.search)
  if (params?.page) qs.set('page', String(params.page))
  if (params?.per_page) qs.set('per_page', String(params.per_page))
  if (params?.group_id) qs.set('group_id', params.group_id)
  const q = qs.toString()
  return request(`/agents${q ? `?${q}` : ''}`)
}

export function getAgent(uuid: string): Promise<{ agent: Agent; recent_logs: AuditLog[] }> {
  return request(`/agents/${uuid}`)
}

export function revokeAgent(uuid: string): Promise<{ status: string }> {
  return request(`/agents/${uuid}/revoke`, { method: 'POST' })
}

export function getPolicies(): Promise<{ policies: Policy[] }> {
  return request('/policies')
}

export function getPolicy(id: string): Promise<{ policy: Policy }> {
  return request(`/policies/${id}`)
}

export async function createPolicy(data: Partial<Policy>): Promise<Policy> {
  const res = await request<{ policy: Policy }>('/policies', { method: 'POST', body: JSON.stringify(data) })
  return res.policy
}

export async function updatePolicy(id: string, data: Partial<Policy>): Promise<Policy> {
  const res = await request<{ policy: Policy }>(`/policies/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  return res.policy
}

export function deletePolicy(id: string): Promise<void> {
  return request(`/policies/${id}`, { method: 'DELETE' })
}

export function deployPolicy(id: string): Promise<{ status: string; policy_id: string; target_mode: string; target_regex: string | null }> {
  return request(`/policies/${id}/deploy`, { method: 'POST' })
}

export function getAuditLogs(params?: {
  page?: number
  per_page?: number
  agent_uuid?: string
  content_type?: string
  action?: string
  severity?: string
  date_from?: string
  date_to?: string
  search?: string
}): Promise<{ logs: AuditLog[]; total: number; page: number; per_page: number }> {
  const qs = new URLSearchParams()
  if (params?.page) qs.set('page', String(params.page))
  if (params?.per_page) qs.set('per_page', String(params.per_page))
  if (params?.agent_uuid) qs.set('agent_uuid', params.agent_uuid)
  if (params?.content_type) qs.set('content_type', params.content_type)
  if (params?.action) qs.set('action', params.action)
  if (params?.severity) qs.set('severity', params.severity)
  if (params?.date_from) qs.set('date_from', params.date_from)
  if (params?.date_to) qs.set('date_to', params.date_to)
  if (params?.search) qs.set('search', params.search)
  const q = qs.toString()
  return request(`/audit-logs${q ? `?${q}` : ''}`)
}

export function getUsers(): Promise<{ users: User[] }> {
  return request('/users')
}

export function createUser(data: { email: string; password: string; display_name?: string; role?: string }): Promise<User> {
  return request('/users', { method: 'POST', body: JSON.stringify(data) })
}

export function deleteUser(id: string): Promise<void> {
  return request(`/users/${id}`, { method: 'DELETE' })
}

export function getEnrollmentCodes(): Promise<{ codes: EnrollmentCode[] }> {
  return request('/enrollment-codes')
}

export async function generateCode(ttl_hours?: number): Promise<EnrollmentCode & { admin_grpc_url: string }> {
  const resp = await request<{ code: EnrollmentCode; admin_grpc_url: string }>('/enrollment-codes', { method: 'POST', body: JSON.stringify({ ttl_hours }) })
  return { ...resp.code, admin_grpc_url: resp.admin_grpc_url }
}

export async function downloadProvisioningFile(code: string): Promise<void> {
  const res = await fetch(`${API_BASE}/enrollment-codes/${encodeURIComponent(code)}/provisioning-file`, {
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
  })
  if (res.status === 401) {
    clearAuth()
    throw new Error('Unauthorized')
  }
  if (!res.ok) throw new Error('Download failed')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'provisioning.toml'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function revokeCode(code: string): Promise<void> {
  return request(`/enrollment-codes/${code}`, { method: 'DELETE' })
}

export function getAgentEnvironment(uuid: string): Promise<{ report: EnvironmentReport | null; message?: string }> {
  return request(`/agents/${uuid}/environment`)
}

export function getEnvironmentLandscape(params?: { page?: number; per_page?: number; search?: string }): Promise<{
  landscape: LLMLandscape
  reports: LandscapeReport[]
  total: number
  page: number
  per_page: number
}> {
  const qs = new URLSearchParams()
  if (params?.page) qs.set('page', String(params.page))
  if (params?.per_page) qs.set('per_page', String(params.per_page))
  if (params?.search) qs.set('search', params.search)
  const q = qs.toString()
  return request('/environment/landscape' + (q ? '?' + q : ''))
}

export function getEnvironmentSuggestions(search?: string): Promise<{
  suggestions: ConfigSuggestion[]
  total: number
}> {
  const qs = search ? `?search=${encodeURIComponent(search)}` : ''
  return request('/environment/suggestions' + qs)
}

export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return request('/auth/password', {
    method: 'PATCH',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  })
}

export function resetUserPassword(userId: string, newPassword: string): Promise<void> {
  return request(`/users/${userId}/password`, {
    method: 'PUT',
    body: JSON.stringify({ new_password: newPassword }),
  })
}

export function updateUserRole(userId: string, role: string): Promise<void> {
  return request(`/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  })
}

export function getGroups(): Promise<{ groups: AgentGroup[] }> {
  return request('/groups')
}

export function createGroup(data: { name: string; description?: string }): Promise<{ group: AgentGroup }> {
  return request('/groups', { method: 'POST', body: JSON.stringify(data) })
}

export function updateGroup(id: string, data: { name?: string; description?: string }): Promise<void> {
  return request(`/groups/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function deleteGroup(id: string): Promise<void> {
  return request(`/groups/${id}`, { method: 'DELETE' })
}

export function getGroupMembers(id: string): Promise<{ members: Agent[] }> {
  return request(`/groups/${id}/members`)
}

export function addGroupMembers(id: string, agent_uuids: string[]): Promise<{ status: string; count: number }> {
  return request(`/groups/${id}/members`, { method: 'POST', body: JSON.stringify({ agent_uuids }) })
}

export function removeGroupMember(id: string, uuid: string): Promise<void> {
  return request(`/groups/${id}/members/${uuid}`, { method: 'DELETE' })
}

export function getOnboardingStatus(): Promise<OnboardingStatus> {
  return request('/onboarding/status')
}

export function completeOnboarding(): Promise<void> {
  return request('/onboarding/complete', { method: 'POST' })
}

export function getComplianceReports(): Promise<{ reports: ComplianceReport[] }> {
  return request('/compliance/reports')
}

export function getComplianceSummary(): Promise<ComplianceSummary> {
  return request('/compliance/summary')
}

export function generateComplianceReport(data: { framework: string; date_from?: string; date_to?: string }): Promise<{ report: ComplianceReport }> {
  return request('/compliance/reports/generate', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function getComplianceReport(id: string): Promise<{ report: ComplianceReport }> {
  return request(`/compliance/reports/${id}`)
}

export function getOrganizationSettings(): Promise<{ disconnect_password_set: boolean }> {
  return request('/organization')
}

export function setDisconnectPassword(password: string): Promise<void> {
  return request('/organization/disconnect-password', {
    method: 'PUT',
    body: JSON.stringify({ password }),
  })
}

export function clearDisconnectPassword(): Promise<void> {
  return request('/organization/disconnect-password', { method: 'DELETE' })
}

export function getAgentMetrics(uuid: string, params?: { limit?: number; offset?: number }): Promise<{ metrics: RequestMetric[]; total: number }> {
  const qs = new URLSearchParams()
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.offset) qs.set('offset', String(params.offset))
  const q = qs.toString()
  return request(`/agents/${uuid}/metrics${q ? '?' + q : ''}`)
}

export function getMetricsSummary(range?: { from?: number; to?: number }): Promise<MetricsSummary> {
  const qs = new URLSearchParams()
  if (range?.from) qs.set('from', String(range.from))
  if (range?.to) qs.set('to', String(range.to))
  const q = qs.toString()
  return request(`/organization/metrics/summary${q ? '?' + q : ''}`)
}

export function getMetricsPerModel(range?: { from?: number; to?: number }): Promise<PerModelMetric[]> {
  const qs = new URLSearchParams()
  if (range?.from) qs.set('from', String(range.from))
  if (range?.to) qs.set('to', String(range.to))
  const q = qs.toString()
  return request(`/organization/metrics/per-model${q ? '?' + q : ''}`)
}

export function getMetricsDaily(range?: { from?: number; to?: number }): Promise<DailyMetric[]> {
  const qs = new URLSearchParams()
  if (range?.from) qs.set('from', String(range.from))
  if (range?.to) qs.set('to', String(range.to))
  const q = qs.toString()
  return request(`/organization/metrics/daily${q ? '?' + q : ''}`)
}

export function getMetricsPerAgent(range?: { from?: number; to?: number }): Promise<PerAgentMetric[]> {
  const qs = new URLSearchParams()
  if (range?.from) qs.set('from', String(range.from))
  if (range?.to) qs.set('to', String(range.to))
  const q = qs.toString()
  return request(`/organization/metrics/per-agent${q ? '?' + q : ''}`)
}
