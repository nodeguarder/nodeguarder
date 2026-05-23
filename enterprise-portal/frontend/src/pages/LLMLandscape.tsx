import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Radio, Monitor, Server, Globe, Key, AlertTriangle, CheckCircle,
  ChevronDown, ChevronRight, Brain, Lightbulb, Search, Plus,
} from 'lucide-react'
import { getEnvironmentLandscape, getEnvironmentSuggestions, createPolicy } from '@/api/client'
import { showToast } from '@/components/Toast'
import type { EnvironmentReport, LLMLandscape, LandscapeReport, ConfigSuggestion } from '@/types'

const AUTO_REFRESH_MS = 30000
const PER_PAGE = 10

export default function LLMLandscape() {
  const navigate = useNavigate()
  const [landscape, setLandscape] = useState<LLMLandscape | null>(null)
  const [reports, setReports] = useState<LandscapeReport[]>([])
  const [suggestions, setSuggestions] = useState<ConfigSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)
  const [showAllSuggestions, setShowAllSuggestions] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [creatingPolicy, setCreatingPolicy] = useState<string | null>(null)
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set())
  const [filteredAgent, setFilteredAgent] = useState<string | null>(null)
  const [expandedProxySettings, setExpandedProxySettings] = useState<Set<string>>(new Set())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const [landscapeRes, suggestionsRes] = await Promise.all([
        getEnvironmentLandscape({ page, per_page: PER_PAGE, search: search || undefined }),
        getEnvironmentSuggestions(search || undefined),
      ])
      setLandscape(landscapeRes.landscape)
      setReports(landscapeRes.reports || [])
      setSuggestions(suggestionsRes.suggestions || [])
      setTotal(landscapeRes.total)
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

  const isIdeConfigCategory = (cat: string) =>
    cat === 'ide_config' || cat === 'proxy_setting'

  const handleCreatePolicyFromSuggestion = async (s: ConfigSuggestion) => {
    setCreatingPolicy(s.suggested_value)
    try {
      let name = 'Auto: '
      let body: Record<string, unknown> = { name: '', target_mode: 'all' }

      if (s.category === 'upstream_url') {
        name += s.description.substring(0, 40)
        body.name = name
        body.upstream_url = s.suggested_value
      } else if (s.category === 'api_key') {
        name += 'API Key from ' + s.suggested_value.replace('Use value from ', '')
        body.name = name
        body.upstream_api_key = ''
      } else {
        name += s.category
        body.name = name
      }

      const policy = await createPolicy(body)
      showToast('Draft policy created from suggestion', 'success')
      navigate('/policies')
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setCreatingPolicy(null)
    }
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
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => (
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
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
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
                  <div className="stat-card-label">Unmanaged</div>
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
            </div>
          )}

          {landscape && landscape.llm_types.length > 0 && (
            <div className="bg-portal-card border border-portal-border rounded-xl p-5 mb-6">
              <h3 className="text-sm font-semibold text-portal-text mb-4">LLM Distribution</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {landscape.llm_types.map((llm, _lIdx) => (
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

          {activeSuggestions.length > 0 && (
            <div className="bg-portal-card border border-portal-border rounded-xl p-5 mb-6">
              <h3 className="text-sm font-semibold text-portal-text flex items-center gap-2 mb-4">
                <Lightbulb className="w-4 h-4 text-amber-400" />
                Configuration Suggestions
                {filteredAgent ? (
                  <span className="text-xs font-normal text-portal-text-muted ml-1">
                    (filtered to <button onClick={() => setFilteredAgent(null)} className="text-portal-accent hover:underline">selected agent</button>)
                  </span>
                ) : (
                  <span className="text-xs font-normal text-portal-text-muted ml-1">({activeSuggestions.length})</span>
                )}
              </h3>
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
                        <span className="text-[10px] text-portal-text-muted italic" title="Policy enforcement for IDE config is not yet available">
                          Read-only
                        </span>
                      ) : (
                        <button
                          onClick={() => handleCreatePolicyFromSuggestion(s)}
                          disabled={creatingPolicy === s.suggested_value}
                          className="btn-ghost text-xs flex items-center gap-1.5"
                          title="Create policy from this suggestion"
                        >
                          {creatingPolicy === s.suggested_value ? (
                            <div className="w-3.5 h-3.5 border-2 border-portal-accent/30 border-t-portal-accent rounded-full animate-spin" />
                          ) : (
                            <Plus className="w-3.5 h-3.5" />
                          )}
                          Create Policy
                        </button>
                      )}
                      <button
                        onClick={() => {
                          const key = `${s.category}::${s.suggested_value}`
                          const next = new Set(dismissedSuggestions)
                          next.add(key)
                          setDismissedSuggestions(next)
                        }}
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
            </div>
          )}

          <div className="bg-portal-card border border-portal-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-portal-border flex items-center justify-between">
              <div className="relative max-w-md flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-portal-text-muted" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1) }}
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
              <div className="divide-y divide-portal-border/50">
                {reports.map((item) => {
                  const r = item.report
                  const endpoints = r.detected_endpoints || []
                  const ides = r.detected_ides || []
                  const envVars = r.detected_env_vars || []
                  const isExpanded = expandedAgent === item.agent_uuid
                  const setEnvKeys = envVars.filter((v) => v.is_set)

                  return (
                    <div key={item.agent_uuid}>
                      <div
                        className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] cursor-pointer transition-colors"
                        onClick={() => setExpandedAgent(isExpanded ? null : item.agent_uuid)}
                      >
                        <div className="flex items-center gap-3">
                          <button className="text-portal-text-muted hover:text-portal-text">
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                          <Monitor className="w-4 h-4 text-portal-text-muted" />
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate('/agents/' + item.agent_uuid) }}
                            className="text-sm font-medium text-portal-accent hover:text-portal-accent-hover"
                          >
                            {item.hostname}
                          </button>
                        </div>
                        <div className="flex items-center gap-3">
                          {endpoints.length > 0 && (
                            <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full">
                              {endpoints.length} LLM{endpoints.length > 1 ? 's' : ''}
                            </span>
                          )}
                          {setEnvKeys.length > 0 && (
                            <Key className="w-3.5 h-3.5 text-amber-400" />
                          )}
                          {ides.some((i) => i.copilot_enabled) && (
                            <span className="text-[10px] bg-portal-accent/10 text-portal-accent px-1.5 py-0.5 rounded">Copilot</span>
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="px-4 pb-4 bg-portal-bg/50">
                          <div className="flex items-center gap-2 px-1 pt-2 pb-1">
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
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                            <div className="bg-portal-card rounded-lg p-3 border border-portal-border/50">
                              <h4 className="text-xs font-semibold text-portal-text-muted uppercase tracking-wider mb-2">
                                LLM Endpoints ({endpoints.length})
                              </h4>
                              {endpoints.length === 0 ? (
                                <p className="text-xs text-portal-text-muted">None detected</p>
                              ) : (
                                endpoints.map((ep, i) => (
                                  <div key={i} className="mb-2 last:mb-0">
                                    <div className="flex items-center gap-1.5">
                                      {getEndpointIcon(ep.service_type)}
                                      <span className="text-xs font-medium text-portal-text">{ep.name}</span>
                                      {ep.reachable && <CheckCircle className="w-3 h-3 text-emerald-400" />}
                                    </div>
                                    <div className="text-[10px] font-mono text-portal-text-muted ml-5">{ep.url}</div>
                                    {ep.models && ep.models.length > 0 && (
                                      <div className="flex flex-wrap gap-1 ml-5 mt-1">
                                        {ep.models.map((m: string) => (
                                          <span key={m} className="text-[10px] bg-white/5 text-portal-text-muted px-1 rounded">{m}</span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>

                            <div className="bg-portal-card rounded-lg p-3 border border-portal-border/50">
                              <h4 className="text-xs font-semibold text-portal-text-muted uppercase tracking-wider mb-2">
                                Env Variables ({setEnvKeys.length})
                              </h4>
                              {setEnvKeys.length === 0 ? (
                                <p className="text-xs text-portal-text-muted">None set</p>
                              ) : (
                                setEnvKeys.map((v, i) => (
                                  <div key={i} className="flex items-center gap-2 mb-1">
                                    <Key className="w-3 h-3 text-amber-400 flex-shrink-0" />
                                    <span className="text-xs font-mono text-portal-text">{v.name}</span>
                                    <span className="text-[10px] text-portal-text-muted truncate">{v.value_prefix}</span>
                                  </div>
                                ))
                              )}
                            </div>

                            <div className="bg-portal-card rounded-lg p-3 border border-portal-border/50">
                              <h4 className="text-xs font-semibold text-portal-text-muted uppercase tracking-wider mb-2">
                                IDEs ({ides.length})
                              </h4>
                              {ides.length === 0 ? (
                                <p className="text-xs text-portal-text-muted">None detected</p>
                              ) : (
                              ides.map((ide, i) => {
                                const ps = ide.proxy_settings
                                return (
                                  <div key={i} className="mb-2 last:mb-0">
                                    <div className="flex items-center gap-1.5">
                                      <Monitor className="w-3 h-3 text-portal-text-muted" />
                                      <span className="text-xs font-medium text-portal-text capitalize">{ide.ide_type}</span>
                                      {ide.copilot_enabled && <Brain className="w-3 h-3 text-portal-accent" />}
                                    </div>
                                    {ps && (
                                      <div>
                                        <div className={'text-[10px] font-mono text-portal-text-muted ml-5 ' + (
                                          expandedProxySettings.has(`${item.agent_uuid}-${i}`) ? '' : 'truncate'
                                        )}>
                                          {ps}
                                        </div>
                                        {ps.length > 40 && (
                                          <button
                                            onClick={() => {
                                              const key = `${item.agent_uuid}-${i}`
                                              const next = new Set(expandedProxySettings)
                                              if (next.has(key)) next.delete(key)
                                              else next.add(key)
                                              setExpandedProxySettings(next)
                                            }}
                                            className="text-[10px] text-portal-accent hover:underline ml-5 mt-0.5"
                                          >
                                            {expandedProxySettings.has(`${item.agent_uuid}-${i}`) ? 'Show less' : 'Show full'}
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )
                              })
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-portal-border">
                <div className="text-xs text-portal-text-muted">
                  Page {page} of {totalPages}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
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
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="btn-ghost text-xs py-1.5 px-3"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
