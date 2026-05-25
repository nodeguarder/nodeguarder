import React, { useState, useEffect } from 'react'
import {
  ClipboardCheck,
  FileText,
  Download,
  Calendar,
  Shield,
  CheckCircle,
  AlertTriangle,
  Clock,
  FileBarChart,
  X,
} from 'lucide-react'
import { showToast } from '@/components/Toast'
import { getComplianceReports, getComplianceSummary, generateComplianceReport, getComplianceReport } from '@/api/client'
import { formatDate } from '@/lib/utils'
type Control = { name: string; status: string; score: number; evidence: string }
import type { ComplianceReport as ComplianceReportType } from '@/types'

const FRAMEWORK_META: Record<string, { title: string; description: string; icon: React.ElementType; iconBg: string; iconColor: string }> = {
  'eu-ai-act': {
    title: 'EU AI Act',
    description: 'Compliance report for the European Union AI Act requirements including transparency, accountability, and risk management for AI-powered security systems.',
    icon: Shield,
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-400',
  },
  'soc-2': {
    title: 'SOC 2',
    description: 'System and Organization Controls report covering security, availability, processing integrity, confidentiality, and privacy criteria.',
    icon: ClipboardCheck,
    iconBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-400',
  },
  'custom': {
    title: 'Custom Report',
    description: 'Generate a custom compliance report with user-defined date ranges and specific control frameworks.',
    icon: FileBarChart,
    iconBg: 'bg-purple-500/10',
    iconColor: 'text-purple-400',
  },
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'compliant':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
          <CheckCircle className="w-3 h-3" />
          Compliant
        </span>
      )
    case 'in-progress':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2.5 py-0.5 rounded-full">
          <Clock className="w-3 h-3" />
          In Progress
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/30 px-2.5 py-0.5 rounded-full">
          <AlertTriangle className="w-3 h-3" />
          Not Started
        </span>
      )
  }
}

function ReportCardSkeleton() {
  return (
    <div className="bg-portal-card border border-portal-border rounded-xl p-6 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 rounded-xl bg-white/5" />
        <div className="w-20 h-5 rounded-full bg-white/5" />
      </div>
      <div className="h-5 w-24 bg-white/5 rounded mb-2" />
      <div className="h-8 w-full bg-white/5 rounded mb-4" />
      <div className="h-4 w-32 bg-white/5 rounded mb-4" />
      <div className="flex gap-1.5 mb-5">
        <div className="h-4 w-16 bg-white/5 rounded-full" />
        <div className="h-4 w-20 bg-white/5 rounded-full" />
        <div className="h-4 w-14 bg-white/5 rounded-full" />
      </div>
      <div className="h-8 w-full bg-white/5 rounded" />
    </div>
  )
}

function DetailModal({ report, onClose }: { report: ComplianceReportType; onClose: () => void }) {
  const controls = report.report_data?.controls ?? []
  const metrics = report.report_data?.metrics ?? { total_detections: 0, blocked: 0, redacted: 0, allowed: 0 }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-portal-card border border-portal-border rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-portal-border">
          <div>
            <h2 className="text-lg font-semibold text-portal-text">{FRAMEWORK_META[report.framework]?.title ?? report.framework}</h2>
            <p className="text-xs text-portal-text-muted mt-1">Generated {formatDate(report.generated_at)}</p>
          </div>
          <button onClick={onClose} className="text-portal-text-muted hover:text-portal-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white/5 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-portal-text">{metrics.total_detections}</div>
              <div className="text-[10px] text-portal-text-muted">Detections</div>
            </div>
            <div className="bg-red-500/5 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-red-400">{metrics.blocked}</div>
              <div className="text-[10px] text-portal-text-muted">Blocked</div>
            </div>
            <div className="bg-amber-500/5 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-amber-400">{metrics.redacted}</div>
              <div className="text-[10px] text-portal-text-muted">Redacted</div>
            </div>
            <div className="bg-emerald-500/5 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-emerald-400">{metrics.allowed}</div>
              <div className="text-[10px] text-portal-text-muted">Allowed</div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-portal-text mb-3">Controls</h3>
            <div className="space-y-2">
              {controls.map((c: Control, i: number) => (
                <div key={i} className="flex items-center justify-between bg-white/5 rounded-lg p-3">
                  <div>
                    <div className="text-sm text-portal-text">{c.name}</div>
                    <div className="text-[10px] text-portal-text-muted mt-0.5">{c.evidence}</div>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `${(FRAMEWORK_META[report.framework]?.title ?? report.framework).replace(/\s+/g, '_')}_report.json`
                a.click()
                URL.revokeObjectURL(url)
                showToast(`Downloading ${FRAMEWORK_META[report.framework]?.title ?? report.framework} report...`, 'info')
              }}
              className="btn-primary text-xs flex items-center gap-2 py-2 px-4"
            >
              <Download className="w-3.5 h-3.5" />
              Download Report
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Compliance() {
  const [reports, setReports] = useState<ComplianceReportType[]>([])
  const [summary, setSummary] = useState<{ compliant: number; in_progress: number; not_started: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<string | null>(null)
  const [detailReport, setDetailReport] = useState<ComplianceReportType | null>(null)
  const today = new Date()
  const thirtyDaysAgo = new Date(today)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const [dateRange, setDateRange] = useState({
    from: thirtyDaysAgo.toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10),
  })

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [repRes, sumRes] = await Promise.all([
          getComplianceReports(),
          getComplianceSummary(),
        ])
        if (cancelled) return
        setReports(repRes.reports)
        setSummary(sumRes)
      } catch {
        if (!cancelled) {
          setSummary({ compliant: 0, in_progress: 0, not_started: 0 })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  async function handleGenerate(framework: string) {
    setGenerating(framework)
    try {
      const data: { framework: string; date_from?: string; date_to?: string } = { framework }
      if (framework === 'custom') {
        data.date_from = dateRange.from
        data.date_to = dateRange.to
      }
      const res = await generateComplianceReport(data)
      const existing = reports.filter((r) => r.framework !== framework)
      setReports([res.report, ...existing])
      const statusKey = (res.report.status === 'compliant' ? 'compliant' : res.report.status === 'in-progress' ? 'in_progress' : 'not_started') as 'compliant' | 'in_progress' | 'not_started'
      setSummary((prev) => prev ? { ...prev, [statusKey]: prev[statusKey] + 1 } : null)
      showToast(`${FRAMEWORK_META[framework]?.title ?? framework} report generated successfully`, 'success')
    } catch (err: any) {
      showToast(err.message || 'Failed to generate report', 'error')
    } finally {
      setGenerating(null)
    }
  }

  async function handleViewDetails(report: ComplianceReportType) {
    try {
      const res = await getComplianceReport(report.id)
      setDetailReport(res.report)
    } catch {
      showToast('Failed to load report details', 'error')
    }
  }

  const frameworks = ['eu-ai-act', 'soc-2', 'custom']

  return (
    <div>
      <h1 className="page-title">Compliance</h1>
      <p className="page-desc">Compliance reports and audit documentation</p>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <ReportCardSkeleton />
          <ReportCardSkeleton />
          <ReportCardSkeleton />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {frameworks.map((fw) => {
            const meta = FRAMEWORK_META[fw]
            const report = reports.find((r) => r.framework === fw)
            const status = report?.status ?? 'not-started'
            const lastGen = report?.generated_at ?? null
            const controls = report?.report_data?.controls?.map((c: Control) => c.name) ?? []

            return (
              <div
                key={fw}
                className="bg-portal-card border border-portal-border rounded-xl p-6 hover:border-portal-accent/30 transition-colors"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-xl ${meta.iconBg} flex items-center justify-center`}>
                    <meta.icon className={`w-6 h-6 ${meta.iconColor}`} />
                  </div>
                  <StatusBadge status={status} />
                </div>

                <h3 className="text-base font-semibold text-portal-text mb-2">{meta.title}</h3>
                <p className="text-xs text-portal-text-muted mb-4 line-clamp-2">{meta.description}</p>

                {lastGen && (
                  <div className="flex items-center gap-2 text-xs text-portal-text-muted mb-4">
                    <Calendar className="w-3.5 h-3.5" />
                    Last generated: {formatDate(lastGen)}
                  </div>
                )}

                {controls.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-5">
                    {controls.map((ctrl: string) => (
                      <span
                        key={ctrl}
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/5 text-portal-text-muted border border-portal-border"
                      >
                        {ctrl}
                      </span>
                    ))}
                  </div>
                )}

                <div className="space-y-2 pt-4 border-t border-portal-border">
                  {status !== 'not-started' && report ? (
                    <>
                      <button
                        onClick={() => {
                          const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `${meta.title.replace(/\s+/g, '_')}_report.json`
                          a.click()
                          URL.revokeObjectURL(url)
                          showToast(`Downloading ${meta.title} report...`, 'info')
                        }}
                        className="btn-primary w-full text-xs flex items-center justify-center gap-2 py-2"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download Report
                      </button>
                      <button
                        onClick={() => handleViewDetails(report)}
                        className="btn-ghost w-full text-xs flex items-center justify-center gap-2 py-2"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        View Details
                      </button>
                    </>
                  ) : (
                    <>
                      {fw === 'custom' && (
                        <div className="flex items-center gap-2 mb-2">
                          <label className="text-xs text-portal-text-muted">From:</label>
                          <input
                            type="date"
                            value={dateRange.from}
                            onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                            className="input-field text-xs py-1.5"
                          />
                          <label className="text-xs text-portal-text-muted">To:</label>
                          <input
                            type="date"
                            value={dateRange.to}
                            onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                            className="input-field text-xs py-1.5"
                          />
                        </div>
                      )}
                      <button
                        onClick={() => handleGenerate(fw)}
                        disabled={generating === fw}
                        className="btn-primary w-full text-xs flex items-center justify-center gap-2 py-2 disabled:opacity-50"
                      >
                        <FileBarChart className="w-3.5 h-3.5" />
                        {generating === fw ? 'Generating...' : 'Generate Report'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-8 bg-portal-card border border-portal-border rounded-xl p-6">
        <h3 className="text-sm font-semibold text-portal-text flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-portal-accent" />
          Compliance Summary
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4">
            <div className="text-2xl font-bold text-emerald-400">{summary?.compliant ?? 0}</div>
            <div className="text-xs text-portal-text-muted mt-1">Compliant Frameworks</div>
          </div>
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4">
            <div className="text-2xl font-bold text-amber-400">{summary?.in_progress ?? 0}</div>
            <div className="text-xs text-portal-text-muted mt-1">Pending Actions</div>
          </div>
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
            <div className="text-2xl font-bold text-blue-400">
              {reports.reduce((sum, r) => sum + (r.report_data?.controls?.length ?? 0), 0) || 0}
            </div>
            <div className="text-xs text-portal-text-muted mt-1">Controls Monitored</div>
          </div>
        </div>
      </div>

      {detailReport && (
        <DetailModal report={detailReport} onClose={() => setDetailReport(null)} />
      )}
    </div>
  )
}
