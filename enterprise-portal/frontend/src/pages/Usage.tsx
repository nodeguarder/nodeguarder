import React, { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, LineChart, Line } from 'recharts'
import { Brain, FileText, Activity, Database } from 'lucide-react'
import MetricCard from '@/components/MetricCard'
import ErrorBoundary from '@/components/ErrorBoundary'
import { getMetricsSummary, getMetricsDaily, getMetricsPerModel, getMetricsPerAgent } from '@/api/client'
import type { MetricsSummary, DailyMetric, PerModelMetric, PerAgentMetric } from '@/types'

type DateRange = '24h' | '7d' | '30d'

const RANGE_LABELS: Record<DateRange, string> = {
  '24h': 'last 24 hours',
  '7d': 'last 7 days',
  '30d': 'last 30 days',
}

const RANGE_MS: Record<DateRange, number> = {
  '24h': 86_400_000,
  '7d': 604_800_000,
  '30d': 2_592_000_000,
}

export default function Usage() {
  const [summary, setSummary] = useState<MetricsSummary | null>(null)
  const [daily, setDaily] = useState<DailyMetric[]>([])
  const [perModel, setPerModel] = useState<PerModelMetric[]>([])
  const [perAgent, setPerAgent] = useState<PerAgentMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [range, setRange] = useState<DateRange>('24h')

  const fetchAll = useCallback(() => {
    setLoading(true)
    setError('')
    const now = Date.now()
    const from = now - RANGE_MS[range]
    Promise.all([
      getMetricsSummary({ from, to: now }),
      getMetricsDaily({ from, to: now }),
      getMetricsPerModel({ from, to: now }),
      getMetricsPerAgent({ from, to: now }),
    ])
      .then(([s, d, m, a]) => {
        setSummary(s)
        setDaily(d)
        setPerModel(m)
        setPerAgent(a)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [range])

  useEffect(() => { fetchAll() }, [fetchAll])

  const totalTokens = summary
    ? summary.total_prompt_tokens + summary.total_completion_tokens
    : 0

  if (error) {
    return (
      <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-lg px-4 py-3 text-sm">
        No usage data available yet. Data appears after agents process requests with the latest version.
      </div>
    )
  }

  const cachedPct = summary
    ? Math.round((summary.cached_requests / Math.max(summary.total_requests, 1)) * 100)
    : 0

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">API Usage</h1>
        <div className="flex items-center gap-3 mt-2">
          {(['24h', '7d', '30d'] as DateRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                range === r
                  ? 'bg-portal-accent/20 text-portal-accent border border-portal-accent/30'
                  : 'text-portal-text-muted hover:text-portal-text bg-white/5 hover:bg-white/10 border border-transparent'
              }`}
            >
              {r}
            </button>
          ))}
          <span className="text-xs text-portal-text-muted ml-1">
            {summary
              ? `${summary.total_requests.toLocaleString()} requests in ${RANGE_LABELS[range]} across ${summary.unique_agents} agents`
              : ''}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Total Requests"
          value={summary?.total_requests ?? 0}
          icon={<Activity className="w-5 h-5" />}
          loading={loading}
        />
        <MetricCard
          label="Cache Hit Rate"
          value={summary ? `${cachedPct}%` : '0%'}
          icon={<Database className="w-5 h-5" />}
          loading={loading}
        />
        <MetricCard
          label="Total Tokens"
          value={summary ? totalTokens.toLocaleString() : '0'}
          icon={<FileText className="w-5 h-5" />}
          loading={loading}
        />
        <MetricCard
          label="Unique Models"
          value={summary?.unique_models ?? 0}
          icon={<Brain className="w-5 h-5" />}
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ErrorBoundary>
          <div className="bg-portal-card border border-portal-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-portal-text mb-4">Daily Requests</h3>
            {daily.length === 0 ? (
              <div className="text-sm text-portal-text-muted text-center py-8">No data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0' }}
                  />
                  <Legend />
                  <Bar dataKey="request_count" name="Requests" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cached_count" name="Cached" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </ErrorBoundary>

        <ErrorBoundary>
          <div className="bg-portal-card border border-portal-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-portal-text mb-4">Daily Token Usage</h3>
            {daily.length === 0 ? (
              <div className="text-sm text-portal-text-muted text-center py-8">No data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={daily.map(d => ({ ...d, total_tokens: d.total_prompt_tokens + d.total_completion_tokens }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0' }}
                    formatter={(value: number) => [value.toLocaleString(), 'Tokens']}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="total_tokens" name="Tokens" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </ErrorBoundary>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ErrorBoundary>
          <div className="bg-portal-card border border-portal-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-portal-text mb-4">Per-Model Breakdown</h3>
            {perModel.length === 0 ? (
              <div className="text-sm text-portal-text-muted text-center py-8">No data yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-portal-text-muted uppercase tracking-wider border-b border-portal-border">
                      <th className="text-left py-2 pr-4">Model</th>
                      <th className="text-right py-2 px-4">Requests</th>
                      <th className="text-right py-2 px-4">Avg Latency</th>
                      <th className="text-right py-2 px-4">Cached</th>
                      <th className="text-right py-2 pl-4">Tokens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perModel.map((m) => (
                      <tr key={m.model} className="border-b border-portal-border/30 hover:bg-white/5">
                        <td className="py-2 pr-4 text-portal-text font-medium">{m.model}</td>
                        <td className="text-right py-2 px-4 text-portal-text">{m.request_count.toLocaleString()}</td>
                        <td className="text-right py-2 px-4 text-portal-text-muted">{m.avg_latency_ms.toFixed(0)}ms</td>
                        <td className="text-right py-2 px-4 text-portal-text-muted">{m.cached_count}</td>
                        <td className="text-right py-2 pl-4 text-portal-text font-mono">{(m.total_prompt_tokens + m.total_completion_tokens).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </ErrorBoundary>

        <ErrorBoundary>
          <div className="bg-portal-card border border-portal-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-portal-text mb-4">Per-Agent Breakdown</h3>
            {perAgent.length === 0 ? (
              <div className="text-sm text-portal-text-muted text-center py-8">No data yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-portal-text-muted uppercase tracking-wider border-b border-portal-border">
                      <th className="text-left py-2 pr-4">Agent</th>
                      <th className="text-right py-2 px-4">Requests</th>
                      <th className="text-right py-2 px-4">Total Tokens</th>
                      <th className="text-right py-2 px-4">Avg Latency</th>
                      <th className="text-right py-2 pl-4">Cached</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perAgent.map((a) => (
                      <tr key={a.agent_uuid} className="border-b border-portal-border/30 hover:bg-white/5">
                        <td className="py-2 pr-4 text-portal-text font-mono text-[10px]">{a.agent_uuid.slice(0, 12)}...</td>
                        <td className="text-right py-2 px-4 text-portal-text">{a.request_count.toLocaleString()}</td>
                        <td className="text-right py-2 px-4 text-portal-text-muted">{a.total_tokens.toLocaleString()}</td>
                        <td className="text-right py-2 px-4 text-portal-text-muted">{a.avg_latency_ms.toFixed(0)}ms</td>
                        <td className="text-right py-2 pl-4 text-portal-text-muted">{a.cached_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </ErrorBoundary>
      </div>
    </div>
  )
}
