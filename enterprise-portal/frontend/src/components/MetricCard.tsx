import React from 'react'

interface MetricCardProps {
  label: string
  value: string | number
  icon?: React.ReactNode
  trend?: { value: number; positive: boolean }
  loading?: boolean
}

export default function MetricCard({ label, value, icon, trend, loading }: MetricCardProps) {
  if (loading) {
    return (
      <div className="bg-portal-card border border-portal-border rounded-xl p-5 animate-pulse">
        <div className="h-4 w-24 bg-white/5 rounded mb-3" />
        <div className="h-8 w-16 bg-white/5 rounded mb-2" />
        <div className="h-3 w-32 bg-white/5 rounded" />
      </div>
    )
  }

  return (
    <div className="bg-portal-card border border-portal-border rounded-xl p-5">
      <div className="flex items-center gap-3 mb-3">
        {icon && <div className="text-portal-accent">{icon}</div>}
        <span className="text-xs font-medium text-portal-text-muted uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-bold text-portal-text mb-1">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      {trend && (
        <div className={`text-xs flex items-center gap-1 ${trend.positive ? 'text-emerald-400' : 'text-red-400'}`}>
          <span>{trend.positive ? '↑' : '↓'}</span>
          <span>{trend.value}%</span>
        </div>
      )}
    </div>
  )
}
