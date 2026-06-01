import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Radio,
  Monitor,
  Globe,
  Server,
  Shield,
  Clock,
  Activity,
  Copy,
  Check,
  FileText,
  AlertTriangle,
  XCircle,
  Brain,
  Key,
  ChevronDown,
  ChevronRight,
  BarChart,
} from 'lucide-react'
import { getAgent, revokeAgent, getAgentEnvironment, getAgentMetrics } from '@/api/client'
import { formatDateFull, timeAgo, statusBadgeClass, actionBadgeClass } from '@/lib/utils'
import type { Agent, AuditLog, EnvironmentReport, DetectedEndpoint, RequestMetric } from '@/types'

function AgentUsageMetrics({ agentUuid }: { agentUuid: string }) {
  const [metrics, setMetrics] = useState<RequestMetric[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!agentUuid) return
    getAgentMetrics(agentUuid, { limit: 20 })
      .then((res) => setMetrics(res.metrics))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [agentUuid])

  if (loading) {
    return <div className="animate-pulse h-20 bg-white/5 rounded" />
  }

  if (metrics.length === 0) {
    return <p className="text-sm text-portal-text-muted">No usage data available yet.</p>
  }

  const totalTokens = metrics.reduce((sum, m) => sum + (m.total_tokens || 0), 0)
  const avgLatency = metrics.length > 0
    ? Math.round(metrics.reduce((sum, m) => sum + m.total_latency_ms, 0) / metrics.length)
    : 0
  const cachedCount = metrics.filter((m) => m.was_cached).length
  const totalCost = metrics.reduce((sum, m) => sum + (
    (m.prompt_tokens || 0) * 0.002 / 1000 + (m.completion_tokens || 0) * 0.002 / 1000
  ), 0)

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-portal-bg rounded-lg p-3 border border-portal-border/50">
          <div className="text-[10px] text-portal-text-muted uppercase tracking-wider">Requests (24h)</div>
          <div className="text-lg font-bold text-portal-text">{metrics.length}</div>
        </div>
        <div className="bg-portal-bg rounded-lg p-3 border border-portal-border/50">
          <div className="text-[10px] text-portal-text-muted uppercase tracking-wider">Avg Latency</div>
          <div className="text-lg font-bold text-portal-text">{avgLatency}ms</div>
        </div>
        <div className="bg-portal-bg rounded-lg p-3 border border-portal-border/50">
          <div className="text-[10px] text-portal-text-muted uppercase tracking-wider">Cached</div>
          <div className="text-lg font-bold text-portal-text">{cachedCount}</div>
        </div>
        <div className="bg-portal-bg rounded-lg p-3 border border-portal-border/50">
          <div className="text-[10px] text-portal-text-muted uppercase tracking-wider">Est. Cost</div>
          <div className="text-lg font-bold text-portal-text">${totalCost.toFixed(4)}</div>
        </div>
      </div>

      {metrics.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-portal-text-muted uppercase tracking-wider border-b border-portal-border">
                <th className="text-left py-1.5 pr-3">Model</th>
                <th className="text-right py-1.5 px-3">Tokens</th>
                <th className="text-right py-1.5 px-3">Latency</th>
                <th className="text-right py-1.5 pl-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {metrics.slice(0, 10).map((m) => (
                <tr key={m.id} className="border-b border-portal-border/20 hover:bg-white/5">
                  <td className="py-1.5 pr-3 text-portal-text font-medium truncate max-w-[120px]">{m.model_used}</td>
                  <td className="text-right py-1.5 px-3 text-portal-text-muted">{m.total_tokens || '-'}</td>
                  <td className="text-right py-1.5 px-3 text-portal-text-muted">{m.total_latency_ms}ms</td>
                  <td className="text-right py-1.5 pl-3">
                    {m.was_cached ? (
                      <span className="text-emerald-400 text-[10px] font-semibold">CACHED</span>
                    ) : m.was_blocked ? (
                      <span className="text-red-400 text-[10px] font-semibold">BLOCKED</span>
                    ) : (
                      <span className="text-portal-accent text-[10px] font-semibold">{m.upstream_status}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function AgentDetail() {
  const { uuid } = useParams<{ uuid: string }>()
  const navigate = useNavigate()
  const [agent, setAgent] = useState<Agent | null>(null)
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [revokeConfirm, setRevokeConfirm] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [envReport, setEnvReport] = useState<EnvironmentReport | null>(null)
  const [envLoading, setEnvLoading] = useState(false)
  const [envExpanded, setEnvExpanded] = useState(true)

  useEffect(() => {
    if (!uuid) return
    setLoading(true)
    Promise.all([
      getAgent(uuid),
      getAgentEnvironment(uuid),
    ])
      .then(([agentRes, envRes]) => {
        setAgent(agentRes.agent)
        setLogs(agentRes.recent_logs)
        if (envRes.report) setEnvReport(envRes.report)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [uuid])

  const copyUuid = () => {
    if (!uuid) return
    navigator.clipboard.writeText(uuid)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRevoke = async () => {
    if (!uuid) return
    setRevoking(true)
    try {
      await revokeAgent(uuid)
      setRevokeConfirm(false)
      window.location.reload()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setRevoking(false)
    }
  }

  if (error) {
    return (
      <div>
        <button onClick={() => navigate('/agents')} className="btn-ghost mb-4 flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to Agents
        </button>
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm">{error}</div>
      </div>
    )
  }

  if (loading || !agent) {
    return (
      <div>
        <div className="h-8 w-40 bg-white/5 rounded animate-pulse mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-portal-card border border-portal-border rounded-xl p-6">
              <div className="animate-pulse space-y-4">
                <div className="h-5 w-32 bg-white/5 rounded" />
                <div className="h-4 w-64 bg-white/5 rounded" />
                <div className="h-4 w-48 bg-white/5 rounded" />
                <div className="h-4 w-56 bg-white/5 rounded" />
              </div>
            </div>
          </div>
          <div className="bg-portal-card border border-portal-border rounded-xl p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-5 w-24 bg-white/5 rounded" />
              <div className="h-4 w-32 bg-white/5 rounded" />
              <div className="h-4 w-28 bg-white/5 rounded" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  const activityCount = logs.reduce<Record<string, number>>((acc, log) => {
    acc[log.content_type] = (acc[log.content_type] || 0) + 1
    return acc
  }, {})

  return (
    <div>
      <button onClick={() => navigate('/agents')} className="btn-ghost mb-4 flex items-center gap-2 text-xs">
        <ArrowLeft className="w-4 h-4" />
        Back to Agents
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-portal-card border border-portal-border rounded-xl p-6">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-portal-accent/10 flex items-center justify-center">
                  <Monitor className="w-6 h-6 text-portal-accent" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-portal-text">{agent.hostname}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${statusBadgeClass(agent.status)}`}>
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          agent.status === 'online'
                            ? 'bg-emerald-400'
                            : agent.status === 'offline'
                            ? 'bg-slate-400'
                            : 'bg-red-400'
                        }`}
                      />
                      {agent.status.charAt(0).toUpperCase() + agent.status.slice(1)}
                    </span>
                    <span className="text-xs text-portal-text-muted">Last seen {timeAgo(agent.last_seen)}</span>
                  </div>
                </div>
              </div>
              {agent.status !== 'revoked' && (
                <button onClick={() => setRevokeConfirm(true)} className="btn-danger text-xs flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5" />
                  Revoke
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                    <div className="text-xs text-portal-text-muted mb-1 uppercase tracking-wider">UUID</div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-mono text-portal-text break-all">{agent.uuid}</span>
                      <button onClick={copyUuid} className="text-portal-text-muted hover:text-portal-text flex-shrink-0">
                    {copied ? <Check className="w-3.5 h-3.5 text-portal-success" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <div>
                    <div className="text-xs text-portal-text-muted mb-1 uppercase tracking-wider">IP Address</div>
                <div className="text-sm font-mono text-portal-text">{agent.ip_address || '\u2014'}</div>
              </div>
              <div>
                    <div className="text-xs text-portal-text-muted mb-1 uppercase tracking-wider">Agent Version</div>
                <div className="text-sm text-portal-text">{agent.agent_version || '\u2014'}</div>
              </div>
              <div>
                    <div className="text-xs text-portal-text-muted mb-1 uppercase tracking-wider">Policy Version</div>
                <div className="text-sm text-portal-text">{agent.policy_version || '\u2014'}</div>
              </div>
              <div>
                    <div className="text-xs text-portal-text-muted mb-1 uppercase tracking-wider">Created</div>
                <div className="text-sm text-portal-text">{formatDateFull(agent.created_at)}</div>
              </div>
              <div>
                    <div className="text-xs text-portal-text-muted mb-1 uppercase tracking-wider">Last Seen</div>
                <div className="text-sm text-portal-text">{formatDateFull(agent.last_seen) || 'Never'}</div>
              </div>
            </div>
          </div>

          {envReport && (
            <div className="bg-portal-card border border-portal-border rounded-xl p-6">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setEnvExpanded(!envExpanded)}
              >
                <h3 className="text-sm font-semibold text-portal-text flex items-center gap-2">
                  <Brain className="w-4 h-4 text-portal-accent" />
                  LLM Environment
                </h3>
                <button className="text-portal-text-muted hover:text-portal-text">
                  {envExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              </div>

              {envExpanded && (
                <div className="mt-4 space-y-4">
                  {/* Detected Endpoints */}
                  <div>
                    <h4 className="text-xs font-semibold text-portal-text-muted uppercase tracking-wider mb-2">
                      Detected LLM Endpoints ({envReport.detected_endpoints.length})
                    </h4>
                    {envReport.detected_endpoints.length === 0 ? (
                      <p className="text-xs text-portal-text-muted">None detected</p>
                    ) : (
                      <div className="space-y-2">
                        {envReport.detected_endpoints.map((ep, i) => (
                          <div key={i} className="bg-portal-bg rounded-lg p-3 border border-portal-border/50">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-portal-text">{ep.name}</span>
                              {ep.reachable && <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded">Reachable</span>}
                            </div>
                            <div className="text-xs font-mono text-portal-text-muted mt-0.5">{ep.url}</div>
                            {ep.models.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {ep.models.map((m) => (
                                  <span key={m} className="text-[10px] bg-white/5 text-portal-text-muted px-1 rounded">{m}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Detected IDEs */}
                  <div>
                    <h4 className="text-xs font-semibold text-portal-text-muted uppercase tracking-wider mb-2">
                      Detected IDEs ({envReport.detected_ides.length})
                    </h4>
                    {envReport.detected_ides.length === 0 ? (
                      <p className="text-xs text-portal-text-muted">None detected</p>
                    ) : (
                      <div className="space-y-1">
                        {envReport.detected_ides.map((ide, i) => (
                          <div key={i} className="text-xs">
                            <div className="flex items-center gap-2">
                              <Monitor className="w-3 h-3 text-portal-text-muted" />
                              <span className="text-portal-text capitalize">{ide.ide_type}</span>
                              {ide.copilot_enabled && <span className="text-portal-accent">Copilot enabled</span>}
                              {ide.proxy_settings && <span className="font-mono text-portal-text-muted">{ide.proxy_settings}</span>}
                            </div>
                            {ide.config_path && (
                              <div className="ml-5 text-[10px] text-portal-text-muted font-mono truncate" title={ide.config_path}>
                                {ide.config_path}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Environment Variables */}
                  <div>
                    <h4 className="text-xs font-semibold text-portal-text-muted uppercase tracking-wider mb-2">
                      Environment Variables
                    </h4>
                    {envReport.detected_env_vars.filter(v => v.is_set).length === 0 ? (
                      <p className="text-xs text-portal-text-muted">None set</p>
                    ) : (
                      <div className="space-y-1">
                        {envReport.detected_env_vars.filter(v => v.is_set).map((v, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <Key className="w-3 h-3 text-amber-400" />
                            <span className="font-mono text-portal-text">{v.name}</span>
                            <span className="text-portal-text-muted">{v.value_prefix}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Config Suggestions */}
                  {envReport.config_suggestions.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-portal-text-muted uppercase tracking-wider mb-2">
                        Configuration Suggestions ({envReport.config_suggestions.length})
                      </h4>
                      <div className="space-y-1">
                        {envReport.config_suggestions.map((s, i) => (
                          <div key={i} className="bg-portal-bg rounded-lg p-2 border border-portal-border/50">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-portal-text">{s.description}</span>
                              <span className={'text-[10px] px-1.5 py-0.5 rounded ' + (
                                s.priority === 'high' ? 'bg-emerald-500/10 text-emerald-400' :
                                s.priority === 'medium' ? 'bg-amber-500/10 text-amber-400' :
                                'bg-slate-500/10 text-slate-400'
                              )}>{s.priority}</span>
                            </div>
                            <div className="text-xs font-mono text-portal-accent mt-0.5">{s.suggested_value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Usage Analytics */}
          <div className="bg-portal-card border border-portal-border rounded-xl p-6">
            <h3 className="text-sm font-semibold text-portal-text flex items-center gap-2 mb-4">
              <BarChart className="w-4 h-4 text-portal-accent" />
              Usage Analytics
            </h3>
            <AgentUsageMetrics agentUuid={uuid || ''} />
          </div>

          <div className="bg-portal-card border border-portal-border rounded-xl p-6">
            <h3 className="text-sm font-semibold text-portal-text flex items-center gap-2 mb-4">
              <FileText className="w-4 h-4 text-portal-accent" />
              Recent Audit Logs ({logs.length})
            </h3>
            {logs.length === 0 ? (
              <div className="text-center py-8 text-portal-text-muted text-sm">No recent activity for this agent</div>
            ) : (
              <div className="space-y-2">
                {logs.slice(0, 10).map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center gap-3 py-2.5 border-b border-portal-border/30 last:border-0"
                  >
                    <div
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        log.action_taken === 'BLOCKED'
                          ? 'bg-portal-danger'
                          : log.action_taken === 'REDACTED' || log.action_taken === 'AUTO_REDACTED'
                          ? 'bg-portal-success'
                          : 'bg-portal-warning'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-portal-text">{log.content_type}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${actionBadgeClass(log.action_taken)}`}>
                          {log.action_taken}
                        </span>
                      </div>
                      <div className="text-xs text-portal-text-muted mt-0.5 truncate">{log.preview || '\u2014'}</div>
                    </div>
                    <span className="text-xs text-portal-text-muted flex-shrink-0">{timeAgo(log.flagged_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-portal-card border border-portal-border rounded-xl p-6">
            <h3 className="text-sm font-semibold text-portal-text flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-portal-accent" />
              24h Activity
            </h3>
            {logs.length === 0 ? (
              <div className="text-sm text-portal-text-muted">No data</div>
            ) : (
              <div className="space-y-3">
                {Object.entries(activityCount).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-sm text-portal-text-muted">{type}</span>
                    <span className="text-sm font-semibold text-portal-text">{count}</span>
                  </div>
                ))}
                <div className="pt-2 border-t border-portal-border">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-portal-text">Total</span>
                    <span className="text-sm font-bold text-portal-text">{logs.length}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-portal-card border border-portal-border rounded-xl p-6">
            <h3 className="text-sm font-semibold text-portal-text flex items-center gap-2 mb-4">
              <Server className="w-4 h-4 text-portal-accent" />
              Details
            </h3>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-portal-text-muted">Status</div>
                <div className="text-sm font-semibold text-portal-text capitalize">{agent.status}</div>
              </div>
              <div>
                <div className="text-xs text-portal-text-muted">Hostname</div>
                <div className="text-sm text-portal-text">{agent.hostname}</div>
              </div>
              <div>
                <div className="text-xs text-portal-text-muted">Organization</div>
                <div className="text-sm text-portal-text font-mono">{agent.org_id.slice(0, 12)}...</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {revokeConfirm && (
        <div className="modal-overlay" onClick={() => setRevokeConfirm(false)}>
          <div
            className="bg-portal-card border border-portal-border rounded-xl shadow-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-portal-danger" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-portal-text">Revoke Agent</h3>
                <p className="text-sm text-portal-text-muted">
                  This will permanently revoke <span className="font-semibold text-portal-text">{agent.hostname}</span>.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setRevokeConfirm(false)} className="btn-ghost">Cancel</button>
              <button onClick={handleRevoke} disabled={revoking} className="btn-danger flex items-center gap-2">
                {revoking ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Revoking...
                  </>
                ) : 'Revoke'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
