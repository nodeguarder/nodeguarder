import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Radio,
  Shield,
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Brain,
  Globe,
  Server,
  ChevronDown,
  Monitor,
  Code,
} from 'lucide-react'
import { getDashboard, getAuditLogs, getAgents, getEnvironmentLandscape } from '@/api/client'
import { showToast } from '@/components/Toast'
import { timeAgo } from '@/lib/utils'
import type { DashboardSummary, ActivityEvent, AuditLog, LandscapeReport } from '@/types'

function StatCardSkeleton() {
  return (
    <div className="stat-card animate-pulse">
      <div className="h-4 w-24 bg-white/5 rounded mb-3" />
      <div className="h-8 w-16 bg-white/5 rounded mb-2" />
      <div className="h-3 w-32 bg-white/5 rounded" />
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
  subvalue,
  accent,
  onClick,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  sublabel?: string
  subvalue?: string
  accent: string
  onClick?: () => void
}) {
  const Component = onClick ? 'button' : 'div'
  return (
    <Component onClick={onClick} className={'stat-card text-left hover:border-portal-accent/30 transition-colors group' + (onClick ? ' cursor-pointer' : '')}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-semibold text-portal-text-muted uppercase tracking-wider">{label}</span>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${accent}`}>
          <Icon className="w-4.5 h-4.5" size={18} />
        </div>
      </div>
      <div className="text-2xl font-bold text-portal-text mb-1">{value}</div>
      {sublabel && subvalue !== undefined && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-portal-text-muted">{sublabel}</span>
          <span className="font-semibold text-portal-text">{subvalue}</span>
        </div>
      )}
    </Component>
  )
}

function LoadingRow() {
  return (
    <div className="flex items-center gap-3 py-3 animate-pulse">
      <div className="w-2 h-2 rounded-full bg-white/5" />
      <div className="flex-1">
        <div className="h-3 w-48 bg-white/5 rounded mb-1.5" />
        <div className="h-2.5 w-32 bg-white/5 rounded" />
      </div>
      <div className="h-3 w-16 bg-white/5 rounded" />
    </div>
  )
}

const UPSTREAM_PROVIDERS = [
  { label: 'GitHub Models', url: 'https://models.inference.ai.azure.com', icon: Globe },
  { label: 'Azure OpenAI', url: 'https://<resource>.openai.azure.com/v1', icon: Globe },
  { label: 'OpenAI', url: 'https://api.openai.com/v1', icon: Globe },
  { label: 'Ollama', url: 'http://localhost:11434/v1', icon: Server },
  { label: 'Custom', url: '', icon: Server },
] as const

function ProviderSelect({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = UPSTREAM_PROVIDERS.find((p) => p.url === value)
  const Icon = selected?.icon ?? Server

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="btn-ghost text-xs flex items-center gap-1.5 py-1.5 px-2 min-w-[140px]">
        <Icon className="w-3.5 h-3.5" />
        <span className="truncate">{selected?.label ?? 'Custom'}</span>
        <ChevronDown className="w-3 h-3 ml-auto opacity-50" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-portal-card border border-portal-border rounded-lg shadow-xl z-10 min-w-[200px] overflow-hidden">
          {UPSTREAM_PROVIDERS.map((p) => (
            <button
              key={p.label}
              onClick={() => { onChange(p.url); setOpen(false) }}
              className={'w-full text-left flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 transition-colors ' + (p.url === value ? 'text-portal-accent' : 'text-portal-text')}
            >
              <p.icon className="w-3.5 h-3.5 opacity-60" />
              <span className="flex-1 truncate">{p.label}</span>
              {p.url && <span className="text-[10px] text-portal-text-muted truncate max-w-[120px]">{p.url}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function buildActivityFromLogs(logs: AuditLog[], agentNames: Map<string, string>): ActivityEvent[] {
  return logs.slice(0, 15).map((log) => {
    const hostname = agentNames.get(log.agent_uuid) || log.agent_uuid.slice(0, 8)
    const time = timeAgo(log.flagged_at)
    let text: string
    let type: ActivityEvent['type'] = 'flag'

    if (log.action_taken === 'ALLOW' || log.action_taken === 'BLOCK' || log.action_taken === 'REDACT') {
      text = `${log.content_type} ${log.action_taken === 'REDACT' ? 'redacted' : log.action_taken.toLowerCase()} on ${hostname}`
    } else {
      text = `${log.content_type} detected on ${hostname}`
    }

    return {
      type,
      text,
      time,
      action: log.action_taken,
    }
  })
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardSummary | null>(null)
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activitySource, setActivitySource] = useState<'api' | 'none'>('none')
  const [landscapeReports, setLandscapeReports] = useState<LandscapeReport[]>([])
  const [upstreamUrl, setUpstreamUrl] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const summary = await getDashboard()
        if (cancelled) return
        setData(summary)
        setError('')
      } catch (err: any) {
        if (!cancelled) setError(err.message)
      }

      try {
        const agentRes = await getAgents({ page: 1 })
        const agentNames = new Map<string, string>()
        agentRes.agents.forEach((a: { uuid: string; hostname: string }) => agentNames.set(a.uuid, a.hostname))

        const logRes = await getAuditLogs({ per_page: 15 })
        if (cancelled) return
        setActivity(buildActivityFromLogs(logRes.logs, agentNames))
        setActivitySource(logRes.logs.length > 0 ? 'api' : 'none')
      } catch {
        if (!cancelled) setActivity([])
      } finally {
        if (!cancelled) setLoading(false)
      }

      try {
        const lr = await getEnvironmentLandscape({ page: 1, per_page: 100 })
        if (!cancelled) setLandscapeReports(lr.reports || [])
      } catch {
        if (!cancelled) setLandscapeReports([])
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  if (error && !data) {
    return (
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="page-desc">Overview of your NodeGuarder deployment</p>
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm">{error}</div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-desc">Overview of your NodeGuarder deployment</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {loading && !data ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              icon={Radio}
              label="Total Agents"
              value={data?.total_agents ?? 0}
              sublabel="Online / Offline"
              subvalue={`${data?.online_agents ?? 0} / ${data?.offline_agents ?? 0}`}
              accent="bg-portal-accent/10 text-portal-accent"
              onClick={() => navigate('/agents')}
            />
            <StatCard
              icon={AlertTriangle}
              label="Flags (24h)"
              value={data?.total_flags_24h ?? 0}
              sublabel="Redacted / Allowed / Blocked"
              subvalue={`${data?.redacted_count_24h ?? 0} / ${data?.allowed_count_24h ?? 0} / ${data?.blocked_count_24h ?? 0}`}
              accent="bg-amber-500/10 text-amber-400"
              onClick={() => navigate('/audit-logs')}
            />
            <StatCard
              icon={Shield}
              label="Policies Active"
              value={data?.total_policies ?? 0}
              accent="bg-emerald-500/10 text-emerald-400"
              onClick={() => navigate('/policies')}
            />
            <StatCard
              icon={Brain}
              label="LLM Landscape"
              value={landscapeReports.length}
              sublabel="Agents reporting"
              subvalue={landscapeReports.length > 0 ? `${new Set(landscapeReports.flatMap(r => r.report.detected_endpoints?.map(e => e.service_type) ?? [])).size} LLM types` : ''}
              accent="bg-blue-500/10 text-blue-400"
              onClick={() => navigate('/llm-landscape')}
            />
          </>
        )}
      </div>

      <PipelineCard
        data={data}
        reports={landscapeReports}
        upstreamUrl={upstreamUrl}
        setUpstreamUrl={setUpstreamUrl}
        navigate={navigate}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-portal-card border border-portal-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-portal-text flex items-center gap-2">
                <Activity className="w-4 h-4 text-portal-accent" />
                Recent Activity
              </h3>
              <button onClick={() => navigate('/audit-logs')} className="btn-ghost text-xs py-1 px-3">View all</button>
          </div>
          <div className="space-y-1">
            {loading ? (
              <>
                <LoadingRow />
                <LoadingRow />
                <LoadingRow />
                <LoadingRow />
                <LoadingRow />
              </>
            ) : activity.length === 0 ? (
              <div className="text-center py-8 text-portal-text-muted text-sm">No recent activity</div>
            ) : (
              activity.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 py-2.5 border-b border-portal-border/30 last:border-0"
                >
                  <div
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      item.type === 'agent'
                        ? 'bg-portal-accent'
                        : item.type === 'flag'
                        ? 'bg-portal-warning'
                        : 'bg-portal-success'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-portal-text">{item.text}</span>
                    {item.action && (
                      <span
                        className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          item.action === 'REDACT'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : item.action === 'BLOCK'
                            ? 'bg-red-500/10 text-red-400'
                            : 'bg-blue-500/10 text-blue-400'
                        }`}
                      >
                        {item.action}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-portal-text-muted flex-shrink-0">{item.time}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-portal-card border border-portal-border rounded-xl p-6">
          <h3 className="text-sm font-semibold text-portal-text flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-portal-accent" />
            Quick Stats
          </h3>
          {loading && !data ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-3 w-24 bg-white/5 rounded mb-1" />
                  <div className="h-5 w-12 bg-white/5 rounded" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-xs text-portal-text-muted mb-1">Agents Online</div>
                <div className="flex items-center gap-2">
                  <div className="w-full bg-white/5 rounded-full h-2">
                    <div
                      className="bg-portal-success h-2 rounded-full transition-all"
                      style={{
                        width: data?.total_agents
                          ? `${((data?.online_agents ?? 0) / data.total_agents) * 100}%`
                          : '0%',
                      }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-portal-text w-10 text-right">
                    {data?.total_agents ? Math.round(((data?.online_agents ?? 0) / data.total_agents) * 100) : 0}%
                  </span>
                </div>
              </div>
              <div>
                <div className="text-xs text-portal-text-muted mb-1">Redaction Rate (24h)</div>
                <div className="flex items-center gap-2">
                  <div className="w-full bg-white/5 rounded-full h-2">
                    <div
                      className="bg-portal-accent h-2 rounded-full transition-all"
                      style={{
                        width: data?.total_flags_24h
                          ? `${((data?.redacted_count_24h ?? 0) / data.total_flags_24h) * 100}%`
                          : '0%',
                      }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-portal-text w-10 text-right">
                    {data?.total_flags_24h ? Math.round(((data?.redacted_count_24h ?? 0) / data.total_flags_24h) * 100) : 0}%
                  </span>
                </div>
              </div>
              <div>
                <div className="text-xs text-portal-text-muted mb-1">Block Rate (24h)</div>
                <div className="flex items-center gap-2">
                  <div className="w-full bg-white/5 rounded-full h-2">
                    <div
                      className="bg-portal-danger h-2 rounded-full transition-all"
                      style={{
                        width: data?.total_flags_24h
                          ? `${((data?.blocked_count_24h ?? 0) / data.total_flags_24h) * 100}%`
                          : '0%',
                      }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-portal-text w-10 text-right">
                    {data?.total_flags_24h ? Math.round(((data?.blocked_count_24h ?? 0) / data.total_flags_24h) * 100) : 0}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PipelineCard({ data, reports, upstreamUrl, setUpstreamUrl, navigate }: {
  data: DashboardSummary | null
  reports: LandscapeReport[]
  upstreamUrl: string
  setUpstreamUrl: (v: string) => void
  navigate: ReturnType<typeof useNavigate>
}) {
  const allIdes = reports.flatMap((r) => r.report.detected_ides ?? [])
  const idesConfigured = allIdes.filter((ide) =>
    ide.proxy_settings?.includes('localhost') || ide.proxy_settings?.includes('127.0.0.1')
  ).length
  const hasIdes = allIdes.length > 0
  const idesAllConfigured = hasIdes && idesConfigured === allIdes.length

  const totalAgents = data?.total_agents ?? 0
  const onlineAgents = data?.online_agents ?? 0
  const agentPct = totalAgents ? Math.round((onlineAgents / totalAgents) * 100) : 0

  const defaultUrl = upstreamUrl || 'https://models.inference.ai.azure.com'

  const stage = (icon: React.ReactNode, label: string, status: 'ok' | 'warn' | 'empty', statusLabel: string, action: React.ReactNode) => (
    <div className="flex items-center gap-3 bg-portal-bg rounded-lg p-3 border border-portal-border/50 flex-1 min-w-0">
      <div className={'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ' + (
        status === 'ok' ? 'bg-emerald-500/10' : status === 'warn' ? 'bg-amber-500/10' : 'bg-slate-500/10'
      )}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-portal-text-muted">{label}</div>
        <div className={'text-[11px] font-medium mt-0.5 ' + (
          status === 'ok' ? 'text-emerald-400' : status === 'warn' ? 'text-amber-400' : 'text-slate-400'
        )}>{statusLabel}</div>
      </div>
      {action}
    </div>
  )

  return (
    <div className="bg-portal-card border border-portal-border rounded-xl p-5 mb-8">
      <div className="text-xs font-semibold text-portal-text-muted uppercase tracking-wider mb-3">Configuration Pipeline</div>
      <div className="flex flex-col sm:flex-row gap-3">
        {stage(
          <Code className="w-4 h-4 text-purple-400" />,
          'IDE',
          idesAllConfigured ? 'ok' : hasIdes ? 'warn' : 'empty',
          idesAllConfigured ? `${idesConfigured}/${allIdes.length} configured` : hasIdes ? `${idesConfigured}/${allIdes.length} configured` : 'No IDEs detected',
          hasIdes ? (
            <button onClick={() => navigate('/llm-landscape')} className="btn-ghost text-[10px] py-1 px-2 flex-shrink-0">
              View
            </button>
          ) : (
            <button onClick={() => {
              navigator.clipboard.writeText(JSON.stringify({
                models: [{ title: 'NodeGuarder', provider: 'openai', model: 'gpt-4', apiBase: 'http://localhost:51820/v1', apiKey: 'ng-<your-token>' }],
              }, null, 2))
              showToast('Config snippet copied', 'success')
            }} className="btn-ghost text-[10px] py-1 px-2 flex-shrink-0">
              Copy Config
            </button>
          )
        )}

        <div className="hidden sm:block w-px bg-portal-border/50 self-stretch" />

        {stage(
          <Monitor className="w-4 h-4 text-portal-accent" />,
          'Agent',
          totalAgents === 0 ? 'empty' : agentPct >= 80 ? 'ok' : 'warn',
          totalAgents === 0 ? 'No agents' : `${onlineAgents}/${totalAgents} online (${agentPct}%)`,
          <button onClick={() => navigate('/agents')} className="btn-ghost text-[10px] py-1 px-2 flex-shrink-0">Manage</button>
        )}

        <div className="hidden sm:block w-px bg-portal-border/50 self-stretch" />

        {stage(
          <Globe className="w-4 h-4 text-blue-400" />,
          'Upstream LLM',
          data && data.total_policies > 0 ? 'ok' : 'warn',
          data && data.total_policies > 0 ? `${data.total_policies} polic${data.total_policies === 1 ? 'y' : 'ies'}` : 'No policy set',
          <div className="flex items-center gap-1 flex-shrink-0">
            <ProviderSelect value={defaultUrl} onChange={setUpstreamUrl} />
            <button
              onClick={() => navigate('/policies/new', { state: { suggestion: { category: 'upstream_url', description: 'Dashboard upstream LLM', suggested_value: defaultUrl, priority: 'high', affected_agent_count: 1 } } })}
              className="btn-ghost text-[10px] py-1.5 px-2"
            >
              Create
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
