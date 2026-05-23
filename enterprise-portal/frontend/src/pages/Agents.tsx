import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Radio,
  Search,
  Filter,
  XCircle,
  Copy,
  Check,
  MoreHorizontal,
  Users,
  Plus,
  Settings2,
  Trash2,
  Edit3,
  Shield,
  Copy as CopyIcon,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle,
  AlertTriangle,
  UserPlus,
  Download,
} from 'lucide-react'
import { showToast } from '@/components/Toast'
import {
  getAgents,
  revokeAgent,
  getGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  getGroupMembers,
  addGroupMembers,
  removeGroupMember,
  getEnrollmentCodes,
  generateCode,
  revokeCode,
} from '@/api/client'
import { timeAgo, statusBadgeClass, formatDate } from '@/lib/utils'
import type { Agent, AgentGroup, EnrollmentCode } from '@/types'

const PER_PAGE = 10

// ---------- All Agents tab ----------
function AllAgentsTab() {
  const navigate = useNavigate()
  const [agents, setAgents] = useState<Agent[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [copiedUuid, setCopiedUuid] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [groups, setGroups] = useState<AgentGroup[]>([])
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [showAddGroupModal, setShowAddGroupModal] = useState(false)
  const [assignGroupId, setAssignGroupId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: { page: number; per_page: number; status?: string; search?: string; group_id?: string } = { page, per_page: PER_PAGE }
      if (statusFilter) params.status = statusFilter
      if (search) params.search = search
      if (groupFilter) params.group_id = groupFilter
      const res = await getAgents(params)
      setAgents(res.agents)
      setTotal(res.total)
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter, groupFilter])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    getGroups().then(res => setGroups(res.groups)).catch(() => {})
  }, [])

  const totalPages = Math.ceil(total / PER_PAGE)

  function toggleSelect(uuid: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(uuid)) next.delete(uuid)
      else next.add(uuid)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === agents.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(agents.map(a => a.uuid)))
    }
  }

  async function handleRevoke(uuid: string) {
    setRevoking(uuid)
    try {
      await revokeAgent(uuid)
      showToast('Agent revoked', 'success')
      load()
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setRevoking(null)
    }
  }

  function copyUuid(uuid: string) {
    navigator.clipboard.writeText(uuid)
    setCopiedUuid(uuid)
    setTimeout(() => setCopiedUuid(null), 2000)
  }

  async function handleBulkAssignGroup() {
    if (!assignGroupId || selected.size === 0) return
    try {
      await addGroupMembers(assignGroupId, Array.from(selected))
      showToast(`Assigned ${selected.size} agent(s) to group`, 'success')
      setSelected(new Set())
      setShowGroupModal(false)
      load()
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-portal-text-muted" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search by hostname or UUID..."
            className="input-field text-xs pl-9 py-2 w-full"
          />
        </div>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} className="input-field text-xs py-2 w-28">
          <option value="">All</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="revoked">Revoked</option>
        </select>
        <select value={groupFilter} onChange={(e) => { setGroupFilter(e.target.value); setPage(1) }} className="input-field text-xs py-2 w-40">
          <option value="">All Groups</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        {selected.size > 0 && (
          <button onClick={() => setShowGroupModal(true)} className="btn-primary text-xs flex items-center gap-1.5 py-2">
            <Users className="w-3.5 h-3.5" />
            Assign to Group ({selected.size})
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-portal-card border border-portal-border rounded-xl p-4 animate-pulse">
              <div className="h-4 w-48 bg-white/5 rounded" />
            </div>
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center py-16">
          <Radio className="w-12 h-12 mx-auto text-portal-text-muted mb-3" />
          <p className="text-sm text-portal-text-muted">No agents found</p>
        </div>
      ) : (
        <div className="bg-portal-card border border-portal-border rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-portal-border text-portal-text-muted">
                <th className="p-3 text-left w-8">
                  <input type="checkbox" checked={selected.size === agents.length && agents.length > 0} onChange={toggleAll} className="rounded" />
                </th>
                <th className="p-3 text-left">Hostname</th>
                <th className="p-3 text-left hidden md:table-cell">UUID</th>
                <th className="p-3 text-left hidden lg:table-cell">IP</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left hidden md:table-cell">Groups</th>
                <th className="p-3 text-left hidden lg:table-cell">Last Seen</th>
                <th className="p-3 text-left hidden lg:table-cell">Version</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent: any) => (
                <tr key={agent.uuid} className="border-b border-portal-border/50 hover:bg-white/[0.02]">
                  <td className="p-3">
                    <input type="checkbox" checked={selected.has(agent.uuid)} onChange={() => toggleSelect(agent.uuid)} className="rounded" />
                  </td>
                  <td className="p-3 font-medium text-portal-text">
                    <button onClick={() => navigate(`/agents/${agent.uuid}`)} className="hover:text-portal-accent">{agent.hostname}</button>
                  </td>
                  <td className="p-3 text-portal-text-muted hidden md:table-cell font-mono">
                    <span className="truncate max-w-[100px] inline-block align-middle">{agent.uuid}</span>
                    <button onClick={() => copyUuid(agent.uuid)} className="ml-1 align-middle text-portal-text-muted hover:text-portal-text">
                      {copiedUuid === agent.uuid ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </td>
                  <td className="p-3 text-portal-text-muted hidden lg:table-cell">{agent.ip_address || '—'}</td>
                  <td className="p-3">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${statusBadgeClass(agent.status)}`}>
                      {agent.status === 'online' ? <CheckCircle className="w-2.5 h-2.5" /> : agent.status === 'revoked' ? <XCircle className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
                      {agent.status}
                    </span>
                  </td>
                  <td className="p-3 hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {(agent.group_ids || []).slice(0, 2).map((gid: string) => {
                        const g = groups.find(gr => gr.id === gid)
                        return g ? (
                          <span key={gid} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-portal-text-muted border border-portal-border">{g.name}</span>
                        ) : null
                      })}
                      {(agent.group_ids || []).length > 2 && (
                        <span className="text-[10px] text-portal-text-muted">+{agent.group_ids.length - 2}</span>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-portal-text-muted hidden lg:table-cell">{timeAgo(agent.last_seen)}</td>
                  <td className="p-3 text-portal-text-muted hidden lg:table-cell">{agent.agent_version || '—'}</td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => navigate(`/agents/${agent.uuid}`)} className="p-1.5 rounded-lg hover:bg-white/5 text-portal-text-muted hover:text-portal-text">
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </button>
                      {agent.status !== 'revoked' && (
                        <button onClick={() => handleRevoke(agent.uuid)} disabled={revoking === agent.uuid} className="p-1.5 rounded-lg hover:bg-red-500/10 text-portal-text-muted hover:text-red-400">
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 border-t border-portal-border">
              <span className="text-xs text-portal-text-muted">{total} total</span>
              <div className="flex items-center gap-1">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded hover:bg-white/5 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => setPage(p)} className={`w-7 h-7 rounded text-xs ${p === page ? 'bg-portal-accent text-white' : 'hover:bg-white/5 text-portal-text-muted'}`}>{p}</button>
                ))}
                <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded hover:bg-white/5 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {showGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowGroupModal(false)}>
          <div className="bg-portal-card border border-portal-border rounded-xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-portal-text mb-3">Assign to Group</h3>
            <select value={assignGroupId} onChange={(e) => setAssignGroupId(e.target.value)} className="input-field text-xs py-2 w-full mb-4">
              <option value="">Select a group...</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.member_count} members)</option>)}
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowGroupModal(false)} className="btn-ghost text-xs py-2 px-4">Cancel</button>
              <button onClick={handleBulkAssignGroup} disabled={!assignGroupId} className="btn-primary text-xs py-2 px-4">Assign</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Groups tab ----------
function GroupsTab() {
  const [groups, setGroups] = useState<AgentGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showDetail, setShowDetail] = useState<string | null>(null)
  const [detailMembers, setDetailMembers] = useState<Agent[]>([])
  const [allAgents, setAllAgents] = useState<Agent[]>([])
  const [selectedAdd, setSelectedAdd] = useState<string[]>([])
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await getGroups()
      setGroups(res.groups)
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreate() {
    if (!newName.trim()) return
    try {
      await createGroup({ name: newName, description: newDesc })
      showToast('Group created', 'success')
      setShowCreate(false)
      setNewName('')
      setNewDesc('')
      load()
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this group? Agents will not be affected.')) return
    try {
      await deleteGroup(id)
      showToast('Group deleted', 'success')
      if (showDetail === id) setShowDetail(null)
      load()
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  async function openDetail(id: string) {
    setShowDetail(id)
    try {
      const [memRes, agentRes] = await Promise.all([
        getGroupMembers(id),
        getAgents({ per_page: 200 }),
      ])
      setDetailMembers(memRes.members)
      setAllAgents(agentRes.agents)
      setSelectedAdd([])
      const group = groups.find(g => g.id === id)
      if (group) {
        setEditName(group.name)
        setEditDesc(group.description || '')
      }
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  async function handleUpdateGroup() {
    if (!showDetail) return
    try {
      await updateGroup(showDetail, { name: editName, description: editDesc })
      showToast('Group updated', 'success')
      load()
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  async function handleAddMembers() {
    if (!showDetail || selectedAdd.length === 0) return
    try {
      await addGroupMembers(showDetail, selectedAdd)
      showToast(`Added ${selectedAdd.length} agent(s)`, 'success')
      setSelectedAdd([])
      openDetail(showDetail)
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  async function handleRemoveMember(uuid: string) {
    if (!showDetail) return
    try {
      await removeGroupMember(showDetail, uuid)
      showToast('Agent removed from group', 'success')
      openDetail(showDetail)
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  const memberUuids = new Set(detailMembers.map(m => m.uuid))
  const availableAgents = allAgents.filter(a => !memberUuids.has(a.uuid as string) && a.status !== 'revoked')

  if (loading) {
    return <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-portal-card border border-portal-border rounded-xl p-5 animate-pulse h-28" />
      ))}
    </div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-portal-text-muted">{groups.length} group(s)</p>
        <button onClick={() => setShowCreate(true)} className="btn-primary text-xs flex items-center gap-1.5 py-2">
          <Plus className="w-3.5 h-3.5" />
          Create Group
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="text-center py-16">
          <Users className="w-12 h-12 mx-auto text-portal-text-muted mb-3" />
          <p className="text-sm text-portal-text-muted">No groups yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map(g => (
            <div
              key={g.id}
              onClick={() => openDetail(g.id)}
              className="bg-portal-card border border-portal-border rounded-xl p-5 hover:border-portal-accent/30 transition-colors cursor-pointer"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-indigo-400" />
                </div>
                <span className="text-xs text-portal-text-muted bg-white/5 px-2 py-0.5 rounded-full">{g.member_count}</span>
              </div>
              <h3 className="text-sm font-semibold text-portal-text">{g.name}</h3>
              {g.description && <p className="text-xs text-portal-text-muted mt-1 line-clamp-2">{g.description}</p>}
              <p className="text-[10px] text-portal-text-muted mt-2">Created {formatDate(g.created_at)}</p>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowCreate(false)}>
          <div className="bg-portal-card border border-portal-border rounded-xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-portal-text mb-4">Create Group</h3>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Group name" className="input-field text-xs py-2 w-full mb-3" />
            <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description (optional)" className="input-field text-xs py-2 w-full mb-4 resize-none h-20" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="btn-ghost text-xs py-2 px-4">Cancel</button>
              <button onClick={handleCreate} disabled={!newName.trim()} className="btn-primary text-xs py-2 px-4">Create</button>
            </div>
          </div>
        </div>
      )}

      {showDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowDetail(null)}>
          <div className="bg-portal-card border border-portal-border rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-portal-border">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} className="text-base font-semibold text-portal-text bg-transparent border-b border-transparent focus:border-portal-accent outline-none" />
                  <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="text-xs text-portal-text-muted mt-1 bg-transparent border-b border-transparent focus:border-portal-accent outline-none w-full resize-none h-6" />
                </div>
                <div className="flex gap-1">
                  <button onClick={handleUpdateGroup} className="btn-ghost text-xs py-1.5 px-3"><Edit3 className="w-3 h-3" /></button>
                  <button onClick={() => handleDelete(showDetail)} className="btn-ghost text-xs py-1.5 px-3 text-red-400"><Trash2 className="w-3 h-3" /></button>
                </div>
              </div>
              <p className="text-xs text-portal-text-muted">{detailMembers.length} agent(s)</p>
            </div>

            <div className="p-5">
              {availableAgents.length > 0 && (
                <div className="mb-4 p-3 bg-white/5 rounded-lg">
                  <p className="text-xs font-medium text-portal-text mb-2">Add Agents</p>
                  <select multiple value={selectedAdd} onChange={(e) => setSelectedAdd(Array.from(e.target.selectedOptions, o => o.value))} className="input-field text-xs py-1.5 w-full mb-2 h-24">
                    {availableAgents.map(a => <option key={a.uuid} value={a.uuid}>{a.hostname} ({a.uuid?.substring(0, 8)})</option>)}
                  </select>
                  <button onClick={handleAddMembers} disabled={selectedAdd.length === 0} className="btn-primary text-xs py-1.5 px-3">Add Selected</button>
                </div>
              )}

              <div className="space-y-1">
                {detailMembers.map(m => (
                  <div key={m.uuid} className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5">
                    <div>
                      <span className="text-xs text-portal-text">{m.hostname}</span>
                      <span className="text-[10px] text-portal-text-muted ml-2 font-mono">{m.uuid?.substring(0, 12)}...</span>
                    </div>
                    <button onClick={() => handleRemoveMember(m.uuid as string)} className="text-portal-text-muted hover:text-red-400">
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {detailMembers.length === 0 && <p className="text-xs text-portal-text-muted text-center py-4">No agents in this group</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Enrollment tab ----------
function EnrollmentTab() {
  const [codes, setCodes] = useState<EnrollmentCode[]>([])
  const [loading, setLoading] = useState(true)
  const [showGenerate, setShowGenerate] = useState(false)
  const [ttl, setTtl] = useState(24)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)
  const [showDownloadDialog, setShowDownloadDialog] = useState(false)
  const [downloadCode, setDownloadCode] = useState('')
  const [downloadAdminUrl, setDownloadAdminUrl] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await getEnrollmentCodes()
      setCodes(res.codes)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleGenerate() {
    if (ttl < 1 || ttl > 720) return
    setGenerating(true)
    try {
      const code = await generateCode(ttl)
      setGeneratedCode(code.code)
      showToast('Enrollment code generated', 'success')
      load()
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setGenerating(false)
    }
  }

  async function handleRevoke(id: string) {
    try {
      await revokeCode(id)
      showToast('Code revoked', 'success')
      load()
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code)
    setCopied(code)
    setTimeout(() => setCopied(null), 2000)
  }

  function openDownload(code: string) {
    setDownloadCode(code)
    const hostname = window.location.hostname || 'localhost'
    setDownloadAdminUrl(`https://${hostname}:50051`)
    setShowDownloadDialog(true)
  }

  function downloadProvisioningConfig() {
    const toml = `admin_url = "${downloadAdminUrl}"\nenrollment_code = "${downloadCode}"\n`
    const blob = new Blob([toml], { type: 'application/toml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'provisioning.toml'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setShowDownloadDialog(false)
    showToast('Provisioning config downloaded', 'success')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <p className="text-xs text-portal-text-muted">{codes.length} code(s)</p>
          {generatedCode && (
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-1.5">
              <span className="text-xs font-mono text-emerald-400">{generatedCode}</span>
              <button onClick={() => copyCode(generatedCode)} className="text-emerald-400 hover:text-emerald-300">
                {copied === generatedCode ? <Check className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}
        </div>
        <button onClick={() => setShowGenerate(true)} className="btn-primary text-xs flex items-center gap-1.5 py-2">
          <Plus className="w-3.5 h-3.5" />
          Generate Code
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-portal-card border border-portal-border rounded-xl p-4 animate-pulse h-12" />
          ))}
        </div>
      ) : codes.length === 0 ? (
        <div className="text-center py-16">
          <Shield className="w-12 h-12 mx-auto text-portal-text-muted mb-3" />
          <p className="text-sm text-portal-text-muted">No enrollment codes yet</p>
        </div>
      ) : (
        <div className="bg-portal-card border border-portal-border rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-portal-border text-portal-text-muted">
                <th className="p-3 text-left">Code</th>
                <th className="p-3 text-left hidden md:table-cell">Created</th>
                <th className="p-3 text-left hidden md:table-cell">Expires</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left hidden lg:table-cell">Used By</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => {
                const expired = new Date(c.expires_at) < new Date()
                const status = c.used_by ? 'Used' : expired ? 'Expired' : 'Active'
                return (
                  <tr key={c.id} className="border-b border-portal-border/50 hover:bg-white/[0.02]">
                    <td className="p-3 font-mono text-portal-text">
                      <span className="truncate max-w-[100px] inline-block align-middle">{c.code}</span>
                      <button onClick={() => copyCode(c.code)} className="ml-1 align-middle text-portal-text-muted hover:text-portal-text">
                        {copied === c.code ? <Check className="w-3 h-3 text-emerald-400" /> : <CopyIcon className="w-3 h-3" />}
                      </button>
                    </td>
                    <td className="p-3 text-portal-text-muted hidden md:table-cell">{formatDate(c.created_at)}</td>
                    <td className="p-3 text-portal-text-muted hidden md:table-cell">{formatDate(c.expires_at)}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${
                        status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
                        status === 'Used' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30' :
                        'bg-slate-500/10 text-slate-400 border border-slate-500/30'
                      }`}>{status}</span>
                    </td>
                    <td className="p-3 text-portal-text-muted hidden lg:table-cell">{c.used_by || '—'}</td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {status === 'Active' && (
                          <>
                            <button
                              onClick={() => openDownload(c.code)}
                              className="p-1.5 rounded-lg hover:bg-portal-accent/10 text-portal-text-muted hover:text-portal-accent"
                              title="Download provisioning config"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleRevoke(c.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-portal-text-muted hover:text-red-400">
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showGenerate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { setShowGenerate(false); setGeneratedCode(null) }}>
          <div className="bg-portal-card border border-portal-border rounded-xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Shield className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-portal-text">Generate Enrollment Code</h3>
                <p className="text-[10px] text-portal-text-muted">Share this code with new agent installations</p>
              </div>
            </div>
            <label className="text-xs text-portal-text-muted block mb-1">TTL (hours):</label>
            <input type="number" value={ttl} onChange={(e) => setTtl(Number(e.target.value))} min={1} max={720} className="input-field text-xs py-2 w-full mb-4" />
            <button onClick={handleGenerate} disabled={generating || ttl < 1 || ttl > 720} className="btn-primary w-full text-xs py-2 flex items-center justify-center gap-2">
              {generating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
              {generating ? 'Generating...' : 'Generate Code'}
            </button>
          </div>
        </div>
      )}

      {showDownloadDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowDownloadDialog(false)}>
          <div className="bg-portal-card border border-portal-border rounded-xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-portal-accent/10 flex items-center justify-center">
                <Download className="w-5 h-5 text-portal-accent" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-portal-text">Download Provisioning Config</h3>
                <p className="text-[10px] text-portal-text-muted">Config file for auto-enrollment on target machines</p>
              </div>
            </div>
            <label className="text-xs text-portal-text-muted block mb-1">Portal gRPC Address</label>
            <input
              type="text"
              value={downloadAdminUrl}
              onChange={(e) => setDownloadAdminUrl(e.target.value)}
              className="input-field text-xs py-2 w-full mb-1"
              placeholder="https://portal.example.com:50051"
            />
            <p className="text-[10px] text-portal-text-muted mb-4">
              Deploy <code className="text-portal-accent">provisioning.toml</code> to <code className="text-portal-accent">%PROGRAMDATA%\NodeGuarder\</code> on target machines.
            </p>
            <button onClick={downloadProvisioningConfig} className="btn-primary w-full text-xs py-2 flex items-center justify-center gap-2">
              <Download className="w-3.5 h-3.5" />
              Download provisioning.toml
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Main Agents page with tabs ----------
export default function Agents() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'agents'

  function setTab(t: string) {
    setSearchParams({ tab: t })
  }

  const tabs = [
    { id: 'agents', label: 'All Agents', icon: Radio },
    { id: 'groups', label: 'Groups', icon: Users },
    { id: 'enrollment', label: 'Enrollment', icon: UserPlus },
  ]

  return (
    <div>
      <h1 className="page-title">Agents</h1>
      <p className="page-desc">Manage agent deployments, groups, and enrollment</p>

      <div className="flex gap-1 mb-6 border-b border-portal-border">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 text-xs font-medium px-4 py-2.5 border-b-2 transition-colors ${
              tab === t.id
                ? 'border-portal-accent text-portal-accent'
                : 'border-transparent text-portal-text-muted hover:text-portal-text'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'agents' && <AllAgentsTab />}
      {tab === 'groups' && <GroupsTab />}
      {tab === 'enrollment' && <EnrollmentTab />}
    </div>
  )
}
