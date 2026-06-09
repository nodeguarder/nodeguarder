import React, { useState, useEffect, useCallback } from 'react'
import {
  FileText,
  Search,
  Filter,
  ChevronDown,
  Download,
  AlertTriangle,
  X,
  Clock,
  User,
  Activity,
  Eye,
} from 'lucide-react'
import { getAuditLogs, getAgents } from '@/api/client'
import { formatDateFull, timeAgo, actionBadgeClass } from '@/lib/utils'
import { showToast } from '@/components/Toast'
import type { AuditLog } from '@/types'

const contentTypes = ['API_KEY', 'JWT_TOKEN', 'PASSWORD', 'SSN', 'CREDIT_CARD', 'SECRET', 'CUSTOM_REGEX', 'OTHER']
const actionTypes = ['REDACT', 'ALLOW', 'BLOCK']
const severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)
  const [agentNames, setAgentNames] = useState<Map<string, string>>(new Map())
  const [filters, setFilters] = useState({
    content_type: '',
    action: '',
    severity: '',
    agent_uuid: '',
    date_from: '',
    date_to: '',
    search: '',
  })
  const [showFilters, setShowFilters] = useState(false)
  const perPage = 15

  const fetchLogs = useCallback(() => {
    setLoading(true)
    setError('')
    getAuditLogs({
      page,
      per_page: perPage,
      content_type: filters.content_type || undefined,
      action: filters.action || undefined,
      severity: filters.severity || undefined,
      agent_uuid: filters.agent_uuid || undefined,
      date_from: filters.date_from || undefined,
      date_to: filters.date_to || undefined,
      search: filters.search || undefined,
    })
      .then((res) => {
        setLogs(res.logs)
        setTotal(res.total)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [page, filters])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  useEffect(() => {
    getAgents({ page: 1, per_page: 500 })
      .then((res) => {
        const map = new Map<string, string>()
        res.agents.forEach((a) => map.set(a.uuid, a.hostname))
        setAgentNames(map)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedLog) setSelectedLog(null)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [selectedLog])

  const handleExport = () => {
    if (total > perPage) {
      showToast(`Exporting current page only (${logs.length} of ${total} entries). Use filters for full export.`, 'info')
    }
    const csv = [
      ['Timestamp', 'Agent UUID', 'User', 'Content Type', 'Severity', 'Action', 'Detection Method', 'Preview', 'Session ID', 'Timeout', 'Policy Enforced'].join(','),
      ...logs.map((l) =>
        [
          l.flagged_at,
          l.agent_uuid,
          l.user_name || '',
          l.content_type,
          l.severity,
          l.action_taken,
          l.detection_method || '',
          `"${(l.preview || '').replace(/"/g, '""')}"`,
          l.session_id || '',
          l.timeout_triggered,
          l.policy_enforced,
        ].join(',')
      ),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalPages = Math.ceil(total / perPage)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Audit Logs</h1>
          <p className="text-sm text-portal-text-muted">{total} total {total === 1 ? 'entry' : 'entries'}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`btn-ghost flex items-center gap-2 text-xs ${showFilters ? 'border-portal-accent text-portal-accent' : ''}`}
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>
          <button onClick={handleExport} className="btn-ghost flex items-center gap-2 text-xs">
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        {['', 'ALLOW', 'BLOCK', 'REDACT'].map((a) => (
          <button
            key={a}
            onClick={() => { setFilters({ ...filters, action: a }); setPage(1) }}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
              filters.action === a
                ? a === 'BLOCK' ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                : a === 'ALLOW' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : a === 'REDACT' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-portal-accent/20 text-portal-accent border border-portal-accent/30'
                : 'text-portal-text-muted hover:text-portal-text bg-white/5 hover:bg-white/10 border border-transparent'
            }`}
          >
            {a || 'All'}
          </button>
        ))}
      </div>

      {showFilters && (
        <div className="bg-portal-card border border-portal-border rounded-xl p-4 mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <div>
              <label className="text-[10px] text-portal-text-muted uppercase tracking-wider mb-1 block">Content Type</label>
              <select
                value={filters.content_type}
                onChange={(e) => { setFilters({ ...filters, content_type: e.target.value }); setPage(1) }}
                className="input-field text-xs"
              >
                <option value="">All</option>
                {contentTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-portal-text-muted uppercase tracking-wider mb-1 block">Action</label>
              <select
                value={filters.action}
                onChange={(e) => { setFilters({ ...filters, action: e.target.value }); setPage(1) }}
                className="input-field text-xs"
              >
                <option value="">All</option>
                {actionTypes.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-portal-text-muted uppercase tracking-wider mb-1 block">Severity</label>
              <select
                value={filters.severity}
                onChange={(e) => { setFilters({ ...filters, severity: e.target.value }); setPage(1) }}
                className="input-field text-xs"
              >
                <option value="">All</option>
                {severities.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-portal-text-muted uppercase tracking-wider mb-1 block">Agent UUID</label>
              <input
                type="text"
                value={filters.agent_uuid}
                onChange={(e) => { setFilters({ ...filters, agent_uuid: e.target.value }); setPage(1) }}
                className="input-field text-xs"
                placeholder="Filter by agent..."
              />
            </div>
            <div>
              <label className="text-[10px] text-portal-text-muted uppercase tracking-wider mb-1 block">From</label>
              <input
                type="date"
                value={filters.date_from}
                onChange={(e) => { setFilters({ ...filters, date_from: e.target.value }); setPage(1) }}
                className="input-field text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] text-portal-text-muted uppercase tracking-wider mb-1 block">To</label>
              <input
                type="date"
                value={filters.date_to}
                onChange={(e) => { setFilters({ ...filters, date_to: e.target.value }); setPage(1) }}
                className="input-field text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] text-portal-text-muted uppercase tracking-wider mb-1 block">Search</label>
              <input
                type="text"
                value={filters.search}
                onChange={(e) => { setFilters({ ...filters, search: e.target.value }); setPage(1) }}
                className="input-field text-xs"
                placeholder="Search preview text..."
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => { setFilters({ content_type: '', action: '', severity: '', agent_uuid: '', date_from: '', date_to: '', search: '' }); setPage(1) }}
                className="btn-ghost text-xs py-2 w-full"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm mb-6">{error}</div>
      )}

      <div className="bg-portal-card border border-portal-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="whitespace-nowrap">Timestamp</th>
                <th className="whitespace-nowrap">Agent</th>
                <th className="whitespace-nowrap">User</th>
                <th className="whitespace-nowrap">Content Type</th>
                <th className="whitespace-nowrap">Method</th>
                <th className="whitespace-nowrap">Severity</th>
                <th className="whitespace-nowrap">Action</th>
                <th className="whitespace-nowrap">Preview</th>
                <th className="whitespace-nowrap text-right">Details</th>
              </tr>
            </thead>
            <tbody>
                {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(9)].map((_, j) => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-4 bg-white/5 rounded animate-pulse" style={{ width: j === 7 ? '120px' : '80px' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-portal-text-muted">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    No audit logs found
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    className={'hover:bg-white/[0.02] transition-colors cursor-pointer border-l-2 ' + (
                      log.severity === 'CRITICAL' ? 'border-l-red-500/60' :
                      log.severity === 'HIGH' ? 'border-l-orange-500/40' :
                      log.severity === 'MEDIUM' ? 'border-l-amber-500/30' :
                      'border-l-transparent'
                    )}
                    onClick={() => setSelectedLog(log)}
                  >
                    <td className="text-xs text-portal-text-muted whitespace-nowrap">{formatDateFull(log.flagged_at)}</td>
                    <td className="text-xs text-portal-text-muted">
                      <span className="font-medium">{agentNames.get(log.agent_uuid) || log.agent_uuid.slice(0, 8) + '...'}</span>
                    </td>
                    <td className="text-sm text-portal-text-muted">{log.user_name || '\u2014'}</td>
                    <td>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
                        {log.content_type}
                      </span>
                    </td>
                    <td>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-portal-text-muted border border-white/10">
                        {log.detection_method || '\u2014'}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          log.severity === 'CRITICAL'
                            ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                            : log.severity === 'HIGH'
                            ? 'bg-orange-500/10 text-orange-400 border border-orange-500/30'
                            : log.severity === 'MEDIUM'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                            : 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                        }`}
                      >
                        {log.severity}
                      </span>
                    </td>
                    <td>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${actionBadgeClass(log.action_taken)}`}>
                        {log.action_taken}{log.timeout_triggered ? ' ⏱' : ''}
                      </span>
                    </td>
                    <td className="max-w-[200px]">
                      <div className="text-xs text-portal-text-muted truncate">{log.preview || '\u2014'}</div>
                    </td>
                    <td className="text-right">
                      <button className="p-1.5 text-portal-text-muted hover:text-portal-text hover:bg-white/5 rounded-lg">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-portal-text-muted">Page {page} of {totalPages} ({total} total entries)</div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-ghost text-xs py-1.5 px-3">Previous</button>
            {[...Array(Math.min(totalPages, 5))].map((_, i) => {
              const startPage = Math.max(1, Math.min(page - 2, totalPages - 4))
              const p = startPage + i
              if (p > totalPages) return null
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`text-xs w-8 h-8 rounded-lg ${page === p ? 'bg-portal-accent text-white' : 'text-portal-text-muted hover:text-portal-text hover:bg-white/5'}`}
                >
                  {p}
                </button>
              )
            })}
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn-ghost text-xs py-1.5 px-3">Next</button>
          </div>
        </div>
      )}

      {selectedLog && (
        <div className="modal-overlay" onClick={() => setSelectedLog(null)}>
          <div className="bg-portal-card border border-portal-border rounded-xl shadow-2xl max-w-2xl w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-portal-text flex items-center gap-2">
                <FileText className="w-5 h-5 text-portal-accent" />
                Audit Log Detail
              </h3>
              <button onClick={() => setSelectedLog(null)} className="text-portal-text-muted hover:text-portal-text">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs text-portal-text-muted uppercase tracking-wider mb-1">Timestamp</div>
                <div className="text-portal-text">{formatDateFull(selectedLog.flagged_at)}</div>
              </div>
              <div>
                <div className="text-xs text-portal-text-muted uppercase tracking-wider mb-1">Agent UUID</div>
                <div className="font-mono text-portal-text text-xs">{selectedLog.agent_uuid}</div>
              </div>
              <div>
                <div className="text-xs text-portal-text-muted uppercase tracking-wider mb-1">User</div>
                <div className="text-portal-text">{selectedLog.user_name || '\u2014'}</div>
              </div>
              <div>
                <div className="text-xs text-portal-text-muted uppercase tracking-wider mb-1">Content Type</div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
                  {selectedLog.content_type}
                </span>
              </div>
              <div>
                <div className="text-xs text-portal-text-muted uppercase tracking-wider mb-1">Detection Method</div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-portal-text-muted border border-white/10">
                  {selectedLog.detection_method || '\u2014'}
                </span>
              </div>
              <div>
                <div className="text-xs text-portal-text-muted uppercase tracking-wider mb-1">Severity</div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  selectedLog.severity === 'CRITICAL' ? 'bg-red-500/10 text-red-400 border border-red-500/30' :
                  selectedLog.severity === 'HIGH' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/30' :
                  selectedLog.severity === 'MEDIUM' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' :
                  'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                }`}>{selectedLog.severity}</span>
              </div>
              <div>
                <div className="text-xs text-portal-text-muted uppercase tracking-wider mb-1">Action</div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${actionBadgeClass(selectedLog.action_taken)}`}>
                  {selectedLog.action_taken}
                </span>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-portal-text-muted uppercase tracking-wider mb-1">Detection Method</div>
                <div className="text-portal-text">{selectedLog.detection_method || '\u2014'}</div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-portal-text-muted uppercase tracking-wider mb-1">Preview</div>
                <div className="text-portal-text bg-black/20 rounded-lg px-3 py-2 font-mono text-xs">{selectedLog.preview || '\u2014'}</div>
              </div>
              <div>
                <div className="text-xs text-portal-text-muted uppercase tracking-wider mb-1">Session ID</div>
                <div className="font-mono text-xs text-portal-text">{selectedLog.session_id || '\u2014'}</div>
              </div>
              <div>
                <div className="text-xs text-portal-text-muted uppercase tracking-wider mb-1">Timeout Triggered</div>
                <div className="text-portal-text">{selectedLog.timeout_triggered ? 'Yes' : 'No'}</div>
              </div>
              <div>
                <div className="text-xs text-portal-text-muted uppercase tracking-wider mb-1">Policy Enforced</div>
                <div className="text-portal-text">{selectedLog.policy_enforced ? 'Yes' : 'No'}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
