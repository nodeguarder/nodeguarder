import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Shield,
  Plus,
  Edit3,
  Trash2,
  AlertTriangle,
  Users,
} from 'lucide-react'
import { getPolicies, deletePolicy, getGroups } from '@/api/client'
import { formatDate } from '@/lib/utils'
import { showToast } from '@/components/Toast'
import type { Policy, AgentGroup } from '@/types'

export default function Policies() {
  const navigate = useNavigate()
  const [policies, setPolicies] = useState<Policy[]>([])
  const [groups, setGroups] = useState<AgentGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const groupMap = new Map(groups.map((g) => [g.id, g.name]))

  const fetchPolicies = () => {
    setLoading(true)
    setError('')
    getPolicies()
      .then((res) => setPolicies(res.policies))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    getGroups()
      .then((res) => setGroups(res.groups))
      .catch(() => {})
  }, [])

  useEffect(() => { fetchPolicies() }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && deleteConfirm) setDeleteConfirm(null)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [deleteConfirm])

  const handleDelete = async () => {
    if (!deleteConfirm) return
    try {
      await deletePolicy(deleteConfirm)
      setDeleteConfirm(null)
      showToast('Policy deleted', 'success')
      fetchPolicies()
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  const onDetectionLabel = (p: Policy): string => {
    const mode = p.on_detection || 'enforced_redact'
    switch (mode) {
      case 'enforced_redact': return 'User Choice (Redact/Block)'
      case 'enforced_block': return 'User Choice (Block only)'
      case 'auto_redact': return 'Auto-Redact'
      case 'auto_block': return 'Auto-Block'
      case 'auto_allow': return 'Auto-Allow'
      default: return mode
    }
  }

  const isEnforced = (p: Policy): boolean => {
    const mode = p.on_detection || 'permissive'
    if (mode !== 'permissive') return true
    if (p.upstream_url) return true
    if (p.upstream_api_key) return true
    if (p.enable_ocr) return true
    if (p.disable_atr_auto_update) return true
    if (p.bearer_token) return true
    if (p.enabled_detection_categories && p.enabled_detection_categories.length > 0) return true
    if (p.custom_regex && p.custom_regex.length > 0) return true
    if (p.allowlists && p.allowlists.length > 0) return true
    if (!p.allow_custom_allowlists) return true
    return false
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Policies</h1>
          <p className="text-sm text-portal-text-muted">{policies.length} {policies.length === 1 ? 'policy' : 'policies'} configured</p>
        </div>
        <button onClick={() => navigate('/policies/new')} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          New Policy
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm mb-6">{error}</div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-portal-card border border-portal-border rounded-xl p-6 animate-pulse">
              <div className="h-5 w-32 bg-white/5 rounded mb-3" />
              <div className="h-3 w-48 bg-white/5 rounded mb-2" />
              <div className="h-3 w-36 bg-white/5 rounded mb-4" />
              <div className="h-8 w-full bg-white/5 rounded" />
            </div>
          ))}
        </div>
      ) : policies.length === 0 ? (
        <div className="bg-portal-card border border-portal-border rounded-xl p-12 text-center">
          <Shield className="w-10 h-10 mx-auto text-portal-text-muted mb-3 opacity-50" />
          <h3 className="text-lg font-semibold text-portal-text mb-1">No policies yet</h3>
          <p className="text-sm text-portal-text-muted mb-4">Create your first security policy to start protecting your agents</p>
          <button onClick={() => navigate('/policies/new')} className="btn-primary">Create Policy</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {policies.map((policy) => (
            <div
              key={policy.id}
              className="bg-portal-card border border-portal-border rounded-xl p-5 hover:border-portal-accent/30 transition-colors group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-portal-accent/10 flex items-center justify-center">
                    <Shield className="w-4.5 h-4.5 text-portal-accent" size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-portal-text">{policy.name}</h3>
                    <div className="text-[10px] text-portal-text-muted uppercase tracking-wider">
                      {onDetectionLabel(policy)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => navigate(`/policies/${policy.id}/edit`)} className="p-1.5 text-portal-text-muted hover:text-portal-text hover:bg-white/5 rounded-lg" title="Edit">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setDeleteConfirm(policy.id)} className="p-1.5 text-portal-text-muted hover:text-portal-danger hover:bg-red-500/10 rounded-lg" title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-portal-text-muted mb-4 line-clamp-2 min-h-[2rem]">
                {policy.description || 'No description'}
              </p>
              <div className="flex flex-wrap gap-1.5 mb-4">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isEnforced(policy) ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'}`}>
                  {onDetectionLabel(policy)}
                </span>
                {policy.target_mode === 'all' ? (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
                    All Agents
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/30 flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {policy.group_ids?.map((gid) => groupMap.get(gid)).filter(Boolean).join(', ') || `${policy.group_ids?.length || 0} group(s)`}
                  </span>
                )}
                {(policy.custom_regex?.length ?? 0) > 0 && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30">
                    {policy.custom_regex?.length} regex rules
                  </span>
                )}
                {policy.upstream_routes && policy.upstream_routes.length > 0 && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                    {policy.upstream_routes.length} route{policy.upstream_routes.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-portal-border">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-black/30 text-portal-text-muted">v{policy.version}</span>
                  <span className="text-[10px] text-portal-text-muted">Priority {policy.priority}</span>
                </div>
                <span className="text-[10px] text-portal-text-muted">Updated {formatDate(policy.updated_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-portal-card border border-portal-border rounded-xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-portal-danger" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-portal-text">Delete Policy</h3>
                <p className="text-sm text-portal-text-muted">This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="btn-ghost">Cancel</button>
              <button onClick={handleDelete} className="btn-danger">Delete Policy</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
