import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Radio, Monitor, Server, Globe, Key, AlertTriangle, CheckCircle,
  ChevronDown, ChevronRight, Brain, Lightbulb, Search, Plus, ArrowRight,
  Code, Layers, Terminal, BarChart, Bot, MessageSquare,
} from 'lucide-react'
import { getDashboard, getEnvironmentLandscape, getEnvironmentSuggestions } from '@/api/client'
import { showToast } from '@/components/Toast'
import type { LLMLandscape, LandscapeReport, ConfigSuggestion, DetectedEndpoint, DetectedIde, DetectedEnvVar } from '@/types'

const AUTO_REFRESH_MS = 30000
const PER_PAGE = 10

const TABS = [
  { id: 'agents', label: 'Agents', icon: Monitor },
  { id: 'endpoints', label: 'Endpoints', icon: Layers },
  { id: 'environment', label: 'Environment', icon: Key },
  { id: 'ides', label: 'IDEs', icon: Code },
  { id: 'usage', label: 'Usage', icon: BarChart },
  { id: 'suggestions', label: 'Suggestions', icon: Lightbulb },
] as const

type TabId = typeof TABS[number]['id']

export default function LLMLandscape() {
  const navigate = useNavigate()
  const [landscape, setLandscape] = useState<LLMLandscape | null>(null)
  const [reports, setReports] = useState<LandscapeReport[]>([])
  const [suggestions, setSuggestions] = useState<ConfigSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<TabId>('agents')
  const [showAllSuggestions, setShowAllSuggestions] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('ng-dismissed-suggestions')
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch {
      return new Set()
    }
  })
  const [filteredAgent, setFilteredAgent] = useState<string | null>(null)
  const [totalPolicies, setTotalPolicies] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const [landscapeRes, suggestionsRes, dashboardRes] = await Promise.all([
        getEnvironmentLandscape({ page, per_page: PER_PAGE, search: search || undefined }),
        getEnvironmentSuggestions(search || undefined),
        getDashboard(),
      ])
      setLandscape(landscapeRes.landscape)
      setReports(landscapeRes.reports || [])
      setSuggestions(suggestionsRes.suggestions || [])
      setTotal(landscapeRes.total)
      setTotalPolicies(dashboardRes.total_policies)
      setError('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    intervalRef.current = setInterval(fetchData, AUTO_REFRESH_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchData])

  const totalPages = Math.ceil(total / PER_PAGE)

  const getEndpointIcon = (type: string) => {
    switch (type) {
      case 'ollama': return <Brain className="w-4 h-4" />
      case 'openai_env': return <Globe className="w-4 h-4" />
      default: return <Server className="w-4 h-4" />
    }
  }

  const getIdeIcon = (type: string) => {
    switch (type) {
      case 'cursor': return <Terminal className="w-4 h-4" />
      case 'continue': return <Code className="w-4 h-4" />
      case 'aider': return <Bot className="w-4 h-4" />
      case 'cline': return <MessageSquare className="w-4 h-4" />
      default: return <Monitor className="w-4 h-4" />
    }
  }

  const isIdeConfigCategory = (cat: string) =>
    cat === 'ide_config' || cat === 'proxy_setting'

  const handleCreatePolicyFromSuggestion = (s: ConfigSuggestion) => {
    navigate('/policies/new', { state: { suggestion: s } })
  }

  const handleDismissSuggestion = (key: string) => {
    const next = new Set(dismissedSuggestions)
    next.add(key)
    setDismissedSuggestions(next)
    localStorage.setItem('ng-dismissed-suggestions', JSON.stringify([...next]))
  }

  if (error && reports.length === 0) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm">{error}</div>
    )
  }

  const activeSuggestions = suggestions.filter(
    (s) => !dismissedSuggestions.has(`${s.category}::${s.suggested_value}`)
  )
  const scopedSuggestions = filteredAgent
    ? activeSuggestions.filter((s) =>
        s.agents?.some((a) => a.agent_uuid === filteredAgent)
      )
    : activeSuggestions
  const displaySuggestions = showAllSuggestions ? scopedSuggestions : scopedSuggestions.slice(0, 10)

  const allEndpoints = reports.flatMap(r =>
    (r.report.detected_endpoints || []).map(ep => ({
      ...ep,
      agent_uuid: r.agent_uuid,
      hostname: r.hostname,
    }))
  )

  const allEnvVars = reports.flatMap(r =>
    (r.report.detected_env_vars || []).filter(v => v.is_set).map(v => ({
      ...v,
      agent_uuid: r.agent_uuid,
      hostname: r.hostname,
    }))
  )

  const allIdes = reports.flatMap(r =>
    (r.report.detected_ides || []).map(ide => ({
      ...ide,
      agent_uuid: r.agent_uuid,
      hostname: r.hostname,
    }))
  )

  const envVarGroups = new Map<string, { name: string; agents: { agent_uuid: string; hostname: string; value_prefix: string }[] }>()
  for (const v of allEnvVars) {
    if (!envVarGroups.has(v.name)) {
      envVarGroups.set(v.name, { name: v.name, agents: [] })
    }
    envVarGroups.get(v.name)!.agents.push({
      agent_uuid: v.agent_uuid,
      hostname: v.hostname,
      value_prefix: v.value_prefix,
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">LLM Landscape</h1>
          <p className="text-sm text-portal-text-muted">
            {landscape ? landscape.llm_types.length + ' LLM types across ' + landscape.total_reported + ' agents' : 'Loading...'}
            <span className="ml-2 text-[10px] text-portal-text-muted/60">auto-refreshes every 30s</span>
          </p>
        </div>
      </div>

      {loading && reports.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-portal-card border border-portal-border rounded-xl p-5 animate-pulse">
              <div className="h-4 w-24 bg-white/5 rounded mb-3" />
              <div className="h-8 w-16 bg-white/5 rounded mb-2" />
              <div className="h-3 w-32 bg-white/5 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {landscape && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
              <div className="stat-card">
                <div className="stat-card-icon bg-emerald-500/10">
                  <Brain className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <div className="stat-card-value">{landscape.llm_types.length}</div>
                  <div className="stat-card-label">LLM Types</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-card-icon bg-portal-accent/10">
                  <Radio className="w-5 h-5 text-portal-accent" />
                </div>
                <div>
                  <div className="stat-card-value">{landscape.total_reported}</div>
                  <div className="stat-card-label">Agents Reporting</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-card-icon bg-amber-500/10">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <div className="stat-card-value">{landscape.unmanaged_agents}</div>
                  <div className="stat-card-label" title="Agents that haven't reported any LLM environment data">Unmanaged</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-card-icon bg-blue-500/10">
                  <Lightbulb className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <div className="stat-card-value">{suggestions.length}</div>
                  <div className="stat-card-label">Suggestions</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-card-icon bg-purple-500/10">
                  <Code className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <div className="stat-card-value">{reports.filter((r) => r.report.detected_ides.length > 0).length}</div>
                  <div className="stat-card-label">Agent{reports.filter((r) => r.report.detected_ides.length > 0).length !== 1 ? 's' : ''} with IDEs</div>
                </div>
              </div>
            </div>
          )}

          {landscape && landscape.llm_types.length > 0 && (
            <div className="bg-portal-card border border-portal-border rounded-xl p-5 mb-6">
              <h3 className="text-sm font-semibold text-portal-text mb-4">LLM Distribution</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {landscape.llm_types.map((llm) => (
                  <div key={llm.service_type} className="bg-portal-bg rounded-lg p-4 border border-portal-border/50">
                    <div className="flex items-center gap-2 mb-2">
                      {getEndpointIcon(llm.service_type)}
                      <span className="text-sm font-medium text-portal-text">{llm.name}</span>
                    </div>
                    <div className="text-2xl font-bold text-portal-text mb-1">{llm.agent_count}</div>
                    <div className="text-xs text-portal-text-muted">agents</div>
                    {llm.models && llm.models.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {llm.models.slice(0, 5).map((m: string) => (
                          <span key={m} className="text-[10px] bg-portal-accent/10 text-portal-accent px-1.5 py-0.5 rounded">{m}</span>
                        ))}
                        {llm.models.length > 5 && (
                          <span className="text-[10px] text-portal-text-muted">+{llm.models.length - 5} more</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-portal-card border border-portal-border rounded-xl overflow-hidden mb-6">
            <div className="flex items-center border-b border-portal-border">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`tab-btn flex items-center gap-2 ${activeTab === tab.id ? 'active' : ''}`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-4">
              {activeTab === 'agents' && (
                <AgentsTab
                  reports={reports}
                  total={total}
                  loading={loading}
                  search={search}
                  setSearch={(v) => { setSearch(v); setPage(1) }}
                  page={page}
                  totalPages={totalPages}
                  setPage={setPage}
                  navigate={navigate}
                  filteredAgent={filteredAgent}
                  setFilteredAgent={setFilteredAgent}
                />
              )}

              {activeTab === 'endpoints' && (
                <EndpointsTab endpoints={allEndpoints} />
              )}

              {activeTab === 'environment' && (
                <EnvironmentTab envVarGroups={envVarGroups} totalAgents={reports.length} />
              )}

              {activeTab === 'ides' && (
                <IdesTab ides={allIdes} />
              )}

              {activeTab === 'usage' && (
                <div>
                  <p className="text-sm text-portal-text-muted mb-4">Usage data for your LLM landscape</p>
                  <div className="bg-portal-bg rounded-lg p-4">
                    <p className="text-xs text-portal-text-muted">
                      Per-agent usage metrics are available on each agent's detail page. 
                      Organization-wide usage analytics are available on the Usage page.
                    </p>
                  </div>
                </div>
              )}

              {activeTab === 'suggestions' && (
                <SuggestionsTab
                  scopedSuggestions={scopedSuggestions}
                  displaySuggestions={displaySuggestions}
                  showAllSuggestions={showAllSuggestions}
                  setShowAllSuggestions={setShowAllSuggestions}
                  filteredAgent={filteredAgent}
                  setFilteredAgent={setFilteredAgent}
                  handleCreatePolicyFromSuggestion={handleCreatePolicyFromSuggestion}
                  handleDismissSuggestion={handleDismissSuggestion}
                  isIdeConfigCategory={isIdeConfigCategory}
                  reports={reports}
                  totalPolicies={totalPolicies}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function AgentsTab({
  reports, total, loading, search, setSearch, page, totalPages, setPage, navigate, filteredAgent, setFilteredAgent,
}: {
  reports: LandscapeReport[]
  total: number
  loading: boolean
  search: string
  setSearch: (v: string) => void
  page: number
  totalPages: number
  setPage: (v: number) => void
  navigate: ReturnType<typeof useNavigate>
  filteredAgent: string | null
  setFilteredAgent: (v: string | null) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-portal-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agents..."
            className="input-field pl-10"
          />
        </div>
        <span className="text-xs text-portal-text-muted ml-4">{total} agent{total !== 1 ? 's' : ''}</span>
      </div>

      {reports.length === 0 ? (
        <div className="text-center py-12 text-portal-text-muted">
          <Radio className="w-8 h-8 mx-auto mb-2 opacity-50" />
          {loading ? 'Loading...' : 'No environment reports yet. Agents will report after their next heartbeat.'}
        </div>
      ) : (
        <>
          <div className="divide-y divide-portal-border/50">
            {reports.map((item) => {
              const r = item.report
              const endpoints = r.detected_endpoints || []
              const ides = r.detected_ides || []
              const envVars = r.detected_env_vars || []
              const setEnvKeys = envVars.filter((v) => v.is_set)

              let totalModels = 0
              for (const ep of endpoints) {
                totalModels += ep.models?.length || 0
              }

              return (
                <div key={item.agent_uuid} className="flex items-center justify-between px-2 py-3 hover:bg-white/[0.02] transition-colors rounded-lg">
                  <div className="flex items-center gap-3">
                    <Monitor className="w-4 h-4 text-portal-text-muted flex-shrink-0" />
                    <button
                      onClick={() => navigate('/agents/' + item.agent_uuid)}
                      className="text-sm font-medium text-portal-accent hover:text-portal-accent-hover"
                    >
                      {item.hostname}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    {endpoints.length > 0 && (
                      <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full" title={endpoints.length + ' endpoint' + (endpoints.length > 1 ? 's' : '') + (totalModels > 0 ? ', ' + totalModels + ' model' + (totalModels > 1 ? 's' : '') : '')}>
                        {endpoints.length} LLM{endpoints.length > 1 ? 's' : ''}{totalModels > 0 && ' · ' + totalModels + ' model' + (totalModels > 1 ? 's' : '')}
                      </span>
                    )}
                    {setEnvKeys.length > 0 && (
                      <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full">
                        {setEnvKeys.length} env
                      </span>
                    )}
                    {ides.length > 0 && (
                      <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full">
                        {ides.length} IDE{ides.length > 1 ? 's' : ''}
                        {ides.some((i) => i.copilot_enabled) && ' · Copilot'}
                      </span>
                    )}
                    <button
                      onClick={() => setFilteredAgent(filteredAgent === item.agent_uuid ? null : item.agent_uuid)}
                      className={'text-[10px] px-2 py-0.5 rounded-full border transition-colors ' + (
                        filteredAgent === item.agent_uuid
                          ? 'bg-portal-accent/20 text-portal-accent border-portal-accent/30'
                          : 'text-portal-text-muted border-portal-border hover:border-portal-text-muted'
                      )}
                    >
                      {filteredAgent === item.agent_uuid ? 'Showing suggestions' : 'Suggestions'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-2 pt-4 border-t border-portal-border mt-4">
              <div className="text-xs text-portal-text-muted">
                Page {page} of {totalPages}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="btn-ghost text-xs py-1.5 px-3"
                >
                  Previous
                </button>
                {[...Array(Math.min(totalPages, 5))].map((_, i) => {
                  const startPage = Math.max(1, Math.min(page - 2, totalPages - 4))
                  const p = startPage + i
                  if (p > totalPages) return null
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={'text-xs w-8 h-8 rounded-lg ' + (
                        page === p
                          ? 'bg-portal-accent text-white'
                          : 'text-portal-text-muted hover:text-portal-text hover:bg-white/5'
                      )}
                    >
                      {p}
                    </button>
                  )
                })}
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="btn-ghost text-xs py-1.5 px-3"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function EndpointsTab({ endpoints }: { endpoints: (DetectedEndpoint & { agent_uuid: string; hostname: string })[] }) {
  const [filter, setFilter] = useState('')
  const [showUnreachable, setShowUnreachable] = useState(true)
  const [showReachable, setShowReachable] = useState(true)

  const filtered = endpoints.filter((ep) => {
    if (!showUnreachable && !ep.reachable) return false
    if (!showReachable && ep.reachable) return false
    if (filter) {
      const q = filter.toLowerCase()
      return ep.name.toLowerCase().includes(q) ||
        ep.url.toLowerCase().includes(q) ||
        ep.hostname.toLowerCase().includes(q) ||
        ep.service_type.toLowerCase().includes(q) ||
        ep.models?.some((m: string) => m.toLowerCase().includes(q))
    }
    return true
  })

  const getIcon = (type: string) => {
    switch (type) {
      case 'ollama': return <Brain className="w-4 h-4" />
      case 'openai_env': return <Globe className="w-4 h-4" />
      default: return <Server className="w-4 h-4" />
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-portal-text-muted" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search endpoints..."
            className="input-field pl-10 text-sm"
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-portal-text-muted cursor-pointer">
          <input type="checkbox" checked={showReachable} onChange={() => setShowReachable(!showReachable)} className="accent-portal-accent" />
          Reachable
        </label>
        <label className="flex items-center gap-1.5 text-xs text-portal-text-muted cursor-pointer">
          <input type="checkbox" checked={showUnreachable} onChange={() => setShowUnreachable(!showUnreachable)} className="accent-portal-accent" />
          Unreachable
        </label>
        <span className="text-xs text-portal-text-muted ml-auto">{filtered.length} of {endpoints.length}</span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-portal-text-muted py-8 text-center">No endpoints match the current filters.</p>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((ep, i) => (
            <div key={i} className="flex items-center gap-3 bg-portal-bg rounded-lg px-3 py-2.5 border border-portal-border/50">
              <div className="flex-shrink-0">
                {getIcon(ep.service_type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-portal-text">{ep.name}</span>
                  {ep.reachable
                    ? <CheckCircle className="w-3 h-3 text-emerald-400" />
                    : <span className="text-[10px] text-red-400 font-medium">unreachable</span>
                  }
                  <span className="text-[10px] text-portal-text-muted">{ep.service_type}</span>
                </div>
                <div className="text-[11px] font-mono text-portal-text-muted truncate">{ep.url}</div>
                {ep.models && ep.models.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {ep.models.map((m: string) => (
                      <span key={m} className="text-[10px] bg-portal-accent/10 text-portal-accent px-1 rounded">{m}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-shrink-0 text-right">
                <span className="text-[10px] text-portal-text-muted font-mono">
                  {ep.hostname}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EnvironmentTab({ envVarGroups, totalAgents }: { envVarGroups: Map<string, { name: string; agents: { agent_uuid: string; hostname: string; value_prefix: string }[] }>; totalAgents: number }) {
  const [search, setSearch] = useState('')
  const [expandedVar, setExpandedVar] = useState<string | null>(null)

  const filtered = Array.from(envVarGroups.values()).filter((g) =>
    !search || g.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-portal-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search variables..."
            className="input-field pl-10 text-sm"
          />
        </div>
        <span className="text-xs text-portal-text-muted">{filtered.length} of {envVarGroups.size} variables</span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-portal-text-muted py-8 text-center">No environment variables detected.</p>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((g) => {
            const coverage = Math.round((g.agents.length / Math.max(totalAgents, 1)) * 100)
            return (
              <div key={g.name} className="bg-portal-bg rounded-lg border border-portal-border/50 overflow-hidden">
                <button
                  onClick={() => setExpandedVar(expandedVar === g.name ? null : g.name)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.02] transition-colors"
                >
                  <Key className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-sm font-mono text-portal-text">{g.name}</div>
                    <div className="text-[10px] text-portal-text-muted">{g.agents[0].value_prefix}</div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="flex items-center gap-1.5" title={coverage + '% of agents have this variable'}>
                      <div className="w-16 h-1.5 bg-portal-border rounded-full overflow-hidden">
                        <div className={'h-full rounded-full ' + (coverage >= 80 ? 'bg-emerald-400' : coverage >= 50 ? 'bg-amber-400' : 'bg-slate-400')} style={{ width: coverage + '%' }} />
                      </div>
                      <span className="text-[10px] text-portal-text-muted">{g.agents.length}/{totalAgents}</span>
                    </div>
                    {expandedVar === g.name ? <ChevronDown className="w-3 h-3 text-portal-text-muted" /> : <ChevronRight className="w-3 h-3 text-portal-text-muted" />}
                  </div>
                </button>
                {expandedVar === g.name && (
                  <div className="px-3 pb-2.5 space-y-1">
                    {g.agents.map((a) => (
                      <div key={a.agent_uuid} className="flex items-center gap-2 pl-7">
                        <span className="text-xs text-portal-accent font-medium">{a.hostname}</span>
                        <span className="text-[10px] font-mono text-portal-text-muted truncate">{a.value_prefix}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function IdesTab({ ides }: { ides: (DetectedIde & { agent_uuid: string; hostname: string })[] }) {
  const [filter, setFilter] = useState('')

  const filtered = ides.filter((ide) =>
    !filter || ide.ide_type.toLowerCase().includes(filter.toLowerCase()) || ide.hostname.toLowerCase().includes(filter.toLowerCase())
  )

  const grouped = new Map<string, typeof ides>()
  for (const ide of filtered) {
    if (!grouped.has(ide.ide_type)) grouped.set(ide.ide_type, [])
    grouped.get(ide.ide_type)!.push(ide)
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'cursor': return <Terminal className="w-4 h-4" />
      default: return <Code className="w-4 h-4" />
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-portal-text-muted" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search IDEs..."
            className="input-field pl-10 text-sm"
          />
        </div>
        <span className="text-xs text-portal-text-muted">{ides.length} IDE{ides.length !== 1 ? 's' : ''} across {grouped.size} type{grouped.size !== 1 ? 's' : ''}</span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-portal-text-muted py-8 text-center">No IDEs detected.</p>
      ) : (
        <div className="space-y-3">
          {Array.from(grouped.entries()).map(([type, items]) => (
            <div key={type}>
              <div className="flex items-center gap-2 mb-1.5 px-1">
                {getIcon(type)}
                <span className="text-xs font-semibold uppercase tracking-wider text-portal-text-muted">{type}</span>
                <span className="text-[10px] text-portal-text-muted">({items.length} agent{items.length > 1 ? 's' : ''})</span>
              </div>
              <div className="space-y-1 ml-1">
                {items.map((ide, i) => (
                  <div key={i} className="flex items-center gap-3 bg-portal-bg rounded-lg px-3 py-2 border border-portal-border/50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-portal-accent">{ide.hostname}</span>
                        {ide.copilot_enabled && (
                          <span className="text-[10px] bg-portal-accent/10 text-portal-accent px-1.5 py-0.5 rounded">Copilot</span>
                        )}
                      </div>
                      {ide.proxy_settings && (
                        <div className="text-[10px] font-mono text-portal-text-muted truncate mt-0.5" title={ide.proxy_settings}>
                          {ide.proxy_settings}
                        </div>
                      )}
                    </div>
                    {ide.is_running && (
                      <span className="text-[10px] text-emerald-400">running</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function IdeConfigSection({ reports, totalPolicies }: { reports: LandscapeReport[]; totalPolicies: number }) {
  const [configModelName, setConfigModelName] = useState(() => {
    try { return localStorage.getItem('ng-config-model') || 'openai/gpt-4o-mini' } catch (e) { return 'openai/gpt-4o-mini' }
  })
  const allIdes = reports.flatMap((r) =>
    (r.report.detected_ides || []).map((ide) => ({
      ...ide,
      hostname: r.hostname,
      continueCfg: r.report.continue_config_suggestion ?? null,
    }))
  )

  if (allIdes.length === 0) return null

  const navigate = useNavigate()
  const anyConfigured = Array.from(
    new Map<string, boolean>(
      allIdes.map((ide) => [
        ide.ide_type,
        ide.ide_type === 'continue' ? (ide.continueCfg?.already_configured ?? false) : ((ide.proxy_settings?.includes('localhost') || ide.proxy_settings?.includes('127.0.0.1')) ?? false),
      ])
    ).values()
  ).some((v) => v)

  const grouped = new Map<string, { total: number; configured: number; agents: { hostname: string; proxy: string | null; alreadyConfigured: boolean }[] }>()
  for (const ide of allIdes) {
    if (!grouped.has(ide.ide_type)) grouped.set(ide.ide_type, { total: 0, configured: 0, agents: [] })
    const g = grouped.get(ide.ide_type)!
    g.total++
    const already = ide.ide_type === 'continue' ? (ide.continueCfg?.already_configured ?? false) : ((ide.proxy_settings?.includes('localhost') || ide.proxy_settings?.includes('127.0.0.1')) ?? false)
    if (already) g.configured++
    g.agents.push({ hostname: ide.hostname, proxy: ide.proxy_settings, alreadyConfigured: already })
  }

  const getIdeIcon = (type: string) => {
    switch (type) {
      case 'cursor': return <Terminal className="w-5 h-5" />
      case 'continue': return <Code className="w-5 h-5" />
      default: return <Monitor className="w-5 h-5" />
    }
  }

  const generateConfigSnippet = (type: string, apiBase: string) => {
    const token = 'ng-<your-token>'
    const model = configModelName
    switch (type) {
      case 'continue':
        return JSON.stringify({
          models: [{ title: 'NodeGuarder', provider: 'openai', model, apiBase, apiKey: token }],
          tabAutocompleteModel: { title: 'NodeGuarder Tab', provider: 'openai', model, apiBase, apiKey: token },
        }, null, 2)
      case 'cursor':
      case 'vscode':
        return JSON.stringify({
          'cursor.chat.model': model,
          'cursor.chat.openaiBaseUrl': apiBase,
          'cursor.chat.openaiApiKey': token,
        }, null, 2)
      default:
        return `OpenAI Base URL: ${apiBase}\nAPI Key: ${token}`
    }
  }

  const configFileName = (type: string) => {
    switch (type) {
      case 'continue': return '%USERPROFILE%\\.continue\\config.json'
      case 'cursor': return 'Cursor Settings > Models > OpenAI Base URL'
      case 'vscode': return 'VS Code Settings > Extensions > Continue'
      default: return 'IDE proxy settings'
    }
  }

  return (
    <div className="mb-4 bg-portal-card border border-portal-border rounded-xl p-4">
      <h3 className="text-sm font-semibold text-portal-text flex items-center gap-2 mb-3">
        <Code className="w-4 h-4 text-portal-accent" />
        IDE Configuration Status
        <span className="text-[10px] text-portal-text-muted font-normal">({allIdes.length} total)</span>
      </h3>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] text-portal-text-muted uppercase tracking-wider">Model name:</span>
        <input
          type="text"
          value={configModelName}
          onChange={(e) => { setConfigModelName(e.target.value); localStorage.setItem('ng-config-model', e.target.value) }}
          className="input-field text-xs flex-1 max-w-[260px]"
          placeholder="e.g. openai/gpt-4o-mini"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from(grouped.entries()).map(([type, g]) => {
          const apiBase = g.agents.find((a) => a.proxy)?.proxy?.replace('apiBase: ', '') || 'http://localhost:51820/v1'
          return (
            <div key={type} className="bg-portal-bg rounded-lg p-3 border border-portal-border/50">
              <div className="flex items-center gap-2 mb-2">
                {getIdeIcon(type)}
                <span className="text-xs font-semibold uppercase tracking-wider text-portal-text-muted">{type}</span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                {g.configured === g.total ? (
                  <span className="text-[10px] flex items-center gap-1 text-emerald-400"><CheckCircle className="w-3 h-3" /> Configured</span>
                ) : g.configured > 0 ? (
                  <span className="text-[10px] flex items-center gap-1 text-amber-400"><AlertTriangle className="w-3 h-3" /> {g.configured}/{g.total} configured</span>
                ) : (
                  <span className="text-[10px] flex items-center gap-1 text-slate-400"><AlertTriangle className="w-3 h-3" /> Needs config</span>
                )}
                <span className="text-[10px] text-portal-text-muted">{g.agents.length} agent{g.agents.length > 1 ? 's' : ''}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => {
                    const snippet = generateConfigSnippet(type, apiBase)
                    navigator.clipboard.writeText(snippet)
                    showToast(`Copied — paste into ${configFileName(type)}`, 'success')
                  }}
                  className="btn-ghost text-[10px] flex items-center gap-1 py-1 px-2"
                >
                  <Plus className="w-3 h-3" />
                  Copy Config
                </button>
              </div>
            </div>
          )
        })}
      </div>
      {anyConfigured && (
        <div className="mt-3 pt-3 border-t border-portal-border flex items-center justify-between gap-3">
          <div className="text-xs text-portal-text-muted flex items-center gap-2">
            <ArrowRight className="w-3.5 h-3.5 text-portal-accent" />
            {totalPolicies > 0 ? `${totalPolicies} polic${totalPolicies === 1 ? 'y' : 'ies'} set` : 'No policy set'}
          </div>
          <button
            onClick={() => navigate('/policies/new')}
            className="btn-ghost text-[10px] py-1.5 px-2 flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            Create Policy
          </button>
        </div>
      )}
    </div>
  )
}

function SuggestionsTab({
  scopedSuggestions, displaySuggestions, showAllSuggestions, setShowAllSuggestions,
  filteredAgent, setFilteredAgent,
  handleCreatePolicyFromSuggestion, handleDismissSuggestion, isIdeConfigCategory, reports, totalPolicies,
}: {
  scopedSuggestions: ConfigSuggestion[]
  displaySuggestions: ConfigSuggestion[]
  showAllSuggestions: boolean
  setShowAllSuggestions: (v: boolean) => void
  filteredAgent: string | null
  setFilteredAgent: (v: string | null) => void
  handleCreatePolicyFromSuggestion: (s: ConfigSuggestion) => void
  handleDismissSuggestion: (key: string) => void
  isIdeConfigCategory: (cat: string) => boolean
  reports: LandscapeReport[]
  totalPolicies: number
}) {
  const hasIdeConfig = reports.some((r) => (r.report.detected_ides?.length ?? 0) > 0)

  return (
    <div>
      <IdeConfigSection reports={reports} totalPolicies={totalPolicies} />

      {scopedSuggestions.length === 0 && !hasIdeConfig ? (
        <div className="text-center py-8 text-portal-text-muted">
          <Lightbulb className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No suggestions at this time.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-portal-text-muted">{scopedSuggestions.length} suggestion{scopedSuggestions.length !== 1 ? 's' : ''}</span>
            {filteredAgent && (
              <span className="text-xs text-portal-text-muted">
                (filtered to <button onClick={() => setFilteredAgent(null)} className="text-portal-accent hover:underline">selected agent</button>)
              </span>
            )}
          </div>
          <div className="space-y-2">
            {displaySuggestions.map((s, i) => (
              <div key={i} className="flex items-start gap-3 bg-portal-bg rounded-lg p-3 border border-portal-border/50">
                <div className={'w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ' + (
                  s.priority === 'high' ? 'bg-emerald-400' : s.priority === 'medium' ? 'bg-amber-400' : 'bg-slate-400'
                )} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold uppercase tracking-wider text-portal-text-muted">{s.category}</span>
                    <span className="text-[10px] text-portal-accent bg-portal-accent/10 px-1.5 py-0.5 rounded">
                      {s.affected_agent_count} agent{s.affected_agent_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="text-sm text-portal-text">{s.description}</div>
                  <div className="text-xs font-mono text-portal-accent mt-0.5">{s.suggested_value}</div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 self-center">
                  {isIdeConfigCategory(s.category) ? (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(s.suggested_value)
                        showToast('Copied proxy URL to clipboard', 'success')
                      }}
                      className="btn-ghost text-xs flex items-center gap-1.5"
                      title="Copy proxy URL to clipboard"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Copy Config
                    </button>
                  ) : (
                    <button
                      onClick={() => handleCreatePolicyFromSuggestion(s)}
                      className="btn-ghost text-xs flex items-center gap-1.5"
                      title="Create policy from this suggestion"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Create Policy
                    </button>
                  )}
                  <button
                    onClick={() => handleDismissSuggestion(`${s.category}::${s.suggested_value}`)}
                    className="btn-ghost text-xs text-portal-text-muted hover:text-red-400 px-1.5"
                    title="Dismiss suggestion"
                  >
                    &times;
                  </button>
                </div>
              </div>
            ))}
          </div>
          {scopedSuggestions.length > 10 && (
            <button onClick={() => setShowAllSuggestions(!showAllSuggestions)} className="btn-ghost text-xs mt-3">
              {showAllSuggestions ? 'Show less' : 'Show all ' + scopedSuggestions.length + ' suggestions'}
            </button>
          )}
        </>
      )}
    </div>
  )
}
