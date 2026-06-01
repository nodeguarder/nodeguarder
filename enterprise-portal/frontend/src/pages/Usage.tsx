import React, { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, LineChart, Line } from 'recharts'
import { Brain, DollarSign, Activity, Database } from 'lucide-react'
import MetricCard from '@/components/MetricCard'
import ErrorBoundary from '@/components/ErrorBoundary'
import { getMetricsSummary, getMetricsDaily, getMetricsPerModel, getMetricsPerAgent } from '@/api/client'
import type { MetricsSummary, DailyMetric, PerModelMetric, PerAgentMetric } from '@/types'

export default function Usage() {
  const [summary, setSummary] = useState<MetricsSummary | null>(null)
  const [daily, setDaily] = useState<DailyMetric[]>([])
  const [perModel, setPerModel] = useState<PerModelMetric[]>([])
  const [perAgent, setPerAgent] = useState<PerAgentMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      getMetricsSummary(),
      getMetricsDaily(),
      getMetricsPerModel(),
      getMetricsPerAgent(),
    ])
      .then(([s, d, m, a]) => {
        setSummary(s)
        setDaily(d)
        setPerModel(m)
        setPerAgent(a)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

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
        <p className="text-sm text-portal-text-muted">
          {summary
            ? `${summary.total_requests.toLocaleString()} requests in the last 24h across ${summary.unique_agents} agents`
            : 'Loading...'}
        </p>
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
          label="Est. Cost (USD)"
          value={summary ? `$${summary.estimated_cost_usd.toFixed(4)}` : '$0.00'}
          icon={<DollarSign className="w-5 h-5" />}
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
            <h3 className="text-sm font-semibold text-portal-text mb-4">Daily Requests (30 days)</h3>
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
            <h3 className="text-sm font-semibold text-portal-text mb-4">Daily Cost (USD)</h3>
            {daily.length === 0 ? (
              <div className="text-sm text-portal-text-muted text-center py-8">No data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0' }}
                    formatter={(value: number) => [`$${value.toFixed(4)}`, 'Cost']}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="estimated_cost_usd" name="Cost" stroke="#f59e0b" strokeWidth={2} dot={false} />
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
                      <th className="text-right py-2 pl-4">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perModel.map((m) => (
                      <tr key={m.model} className="border-b border-portal-border/30 hover:bg-white/5">
                        <td className="py-2 pr-4 text-portal-text font-medium">{m.model}</td>
                        <td className="text-right py-2 px-4 text-portal-text">{m.request_count.toLocaleString()}</td>
                        <td className="text-right py-2 px-4 text-portal-text-muted">{m.avg_latency_ms.toFixed(0)}ms</td>
                        <td className="text-right py-2 px-4 text-portal-text-muted">{m.cached_count}</td>
                        <td className="text-right py-2 pl-4 text-portal-text font-mono">${m.estimated_cost_usd.toFixed(4)}</td>
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
