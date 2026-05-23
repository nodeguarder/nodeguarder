import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Shield,
  ArrowLeft,
  Save,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  Globe,
  Target,
  Sliders,
  List,
  Eye,
  EyeOff,
  Users,
} from 'lucide-react'
import { getPolicy, createPolicy, updatePolicy, getGroups } from '@/api/client'
import { showToast } from '@/components/Toast'
import type { Policy, AgentGroup } from '@/types'

const ALL_DETECTION_KEYS = [
  'api_keys', 'db_credentials', 'pii',
  'injection', 'code_execution', 'social_engineering',
  'skill_compromise', 'excessive_autonomy', 'model_abuse', 'data_poisoning',
] as const

const DETECTION_CATEGORIES = [
  { key: 'api_keys', label: 'API Keys & Secrets', desc: 'AWS keys, GitHub tokens, Stripe keys, Slack tokens, and other API credentials.' },
  { key: 'db_credentials', label: 'Database Credentials', desc: 'MongoDB, MySQL, PostgreSQL, Redis connection strings.' },
  { key: 'pii', label: 'PII (Personal Data)', desc: 'Email addresses, social security numbers, credit card numbers.' },
  { key: 'injection', label: 'Prompt Injection & Tool Poisoning', desc: 'Detect prompt injection, tool output poisoning, and instruction override attempts.' },
  { key: 'code_execution', label: 'Shell & Code Execution', desc: 'Detect shell metacharacter injection, eval() abuse, and remote code execution patterns.' },
  { key: 'social_engineering', label: 'Social Engineering', desc: 'Detect goal hijacking, authority escalation, and consent bypass attempts.' },
  { key: 'skill_compromise', label: 'Malicious Skills', desc: 'Detect supply chain attacks, skill impersonation, and hidden capabilities.' },
  { key: 'excessive_autonomy', label: 'Excessive Autonomy', desc: 'Detect runaway loops, resource exhaustion, and unauthorized agent actions.' },
  { key: 'model_abuse', label: 'Model Abuse', desc: 'Detect model extraction, malicious fine-tuning, and security boundary violations.' },
  { key: 'data_poisoning', label: 'Data Poisoning', desc: 'Detect training data corruption, memory manipulation, and data integrity attacks.' },
]

const emptyForm = {
  name: '',
  description: '',
  redaction_enforced: true,
  upstream_url: '',
  upstream_api_key: '',
  bind_port: 51820,
  enable_ocr: false,
  disable_atr_auto_update: false,
  allow_custom_allowlists: true,
  enabled_detection_categories: [...ALL_DETECTION_KEYS] as string[],
  custom_regex: [] as string[],
  allowlists: [] as string[],
  target_mode: 'all' as 'all' | 'group',
  group_ids: [] as string[],
}

export default function PolicyEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEditing = !!id

  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [allGroups, setAllGroups] = useState<AgentGroup[]>([])
  const [sections, setSections] = useState({
    general: true,
    upstream: false,
    rules: true,
    trusted: false,
    regex: false,
    targeting: false,
  })
  const [addingField, setAddingField] = useState<'custom_regex' | 'allowlists' | null>(null)
  const [newItemValue, setNewItemValue] = useState('')

  useEffect(() => {
    getGroups()
      .then((res) => setAllGroups(res.groups))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!id) return
    getPolicy(id)
      .then((res) => {
        const p = res.policy
        const existing = p.enabled_detection_categories || []
        setForm({
          name: p.name,
          description: p.description || '',
          redaction_enforced: p.redaction_enforced,
          upstream_url: p.upstream_url || '',
          upstream_api_key: '',
          bind_port: p.bind_port || 51820,
          enable_ocr: p.enable_ocr || false,
          disable_atr_auto_update: p.disable_atr_auto_update || false,
          allow_custom_allowlists: p.allow_custom_allowlists,
          enabled_detection_categories: existing.length > 0 ? existing : [...ALL_DETECTION_KEYS],
          custom_regex: p.custom_regex || [],
          allowlists: p.allowlists || [],
          target_mode: p.target_mode,
          group_ids: p.group_ids || [],
        })
      })
      .catch((err) => {
        showToast(err.message, 'error')
        navigate('/policies')
      })
      .finally(() => setLoading(false))
  }, [id, navigate])

  const toggleSection = (key: keyof typeof sections) => {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const startAddItem = (field: 'custom_regex' | 'allowlists') => {
    setAddingField(field)
    setNewItemValue('')
  }

  const confirmAddItem = () => {
    if (!newItemValue || !addingField) return
    setForm({ ...form, [addingField]: [...form[addingField], newItemValue] })
    setAddingField(null)
    setNewItemValue('')
  }

  const removeArrayItem = (field: 'custom_regex' | 'allowlists', index: number) => {
    const arr = [...form[field]]
    arr.splice(index, 1)
    setForm({ ...form, [field]: arr })
  }

  const toggleDetection = (key: string) => {
    const arr = form.enabled_detection_categories.includes(key)
      ? form.enabled_detection_categories.filter((k) => k !== key)
      : [...form.enabled_detection_categories, key]
    setForm({ ...form, enabled_detection_categories: arr })
  }

  const handleSave = async () => {
    if (!form.name) return
    setSaving(true)
    try {
      if (isEditing) {
        await updatePolicy(id!, form)
        showToast('Policy updated', 'success')
      } else {
        await createPolicy(form)
        showToast('Policy created', 'success')
      }
      navigate('/policies')
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'input-field text-sm'
  const labelClass = 'block text-xs font-medium text-portal-text-muted mb-1.5 uppercase tracking-wider'

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-portal-accent/30 border-t-portal-accent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/policies')} className="text-portal-text-muted hover:text-portal-text p-1">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="page-title">{isEditing ? 'Edit Policy' : 'Create Policy'}</h1>
            <p className="text-sm text-portal-text-muted">
              {isEditing ? `Editing "${form.name}"` : 'Define a new security policy'}
            </p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !form.name}
          className="btn-primary flex items-center gap-2"
        >
          {saving ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              {isEditing ? 'Update Policy' : 'Create Policy'}
            </>
          )}
        </button>
      </div>

      <div className="space-y-4">
        {/* General */}
        <div className="bg-portal-card border border-portal-border rounded-xl overflow-hidden">
          <button
            onClick={() => toggleSection('general')}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-portal-accent" />
              <span className="text-sm font-semibold text-portal-text">General</span>
            </div>
            {sections.general ? <ChevronDown className="w-4 h-4 text-portal-text-muted" /> : <ChevronRight className="w-4 h-4 text-portal-text-muted" />}
          </button>
          {sections.general && (
            <div className="px-6 pb-6 space-y-4">
              <div>
                <label className={labelClass}>Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={inputClass}
                  placeholder="e.g. Production Strict"
                />
              </div>
              <div>
                <label className={labelClass}>Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className={`${inputClass} min-h-[80px] resize-y`}
                  placeholder="Policy description"
                />
              </div>
              <div className="flex items-center gap-6 flex-wrap">
                <label className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={form.redaction_enforced}
                    onChange={(e) => setForm({ ...form, redaction_enforced: e.target.checked })}
                    className="accent-portal-accent w-4 h-4"
                  />
                  <span className="text-sm text-portal-text">Redaction Enforced</span>
                </label>
                <label className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={form.allow_custom_allowlists}
                    onChange={(e) => setForm({ ...form, allow_custom_allowlists: e.target.checked })}
                    className="accent-portal-accent w-4 h-4"
                  />
                  <span className="text-sm text-portal-text">Allow Custom Allowlists</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Upstream */}
        <div className="bg-portal-card border border-portal-border rounded-xl overflow-hidden">
          <button
            onClick={() => toggleSection('upstream')}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-portal-accent" />
              <span className="text-sm font-semibold text-portal-text">Upstream</span>
            </div>
            {sections.upstream ? <ChevronDown className="w-4 h-4 text-portal-text-muted" /> : <ChevronRight className="w-4 h-4 text-portal-text-muted" />}
          </button>
          {sections.upstream && (
            <div className="px-6 pb-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Upstream URL</label>
                  <input
                    type="text"
                    value={form.upstream_url}
                    onChange={(e) => setForm({ ...form, upstream_url: e.target.value })}
                    className={inputClass}
                    placeholder="http://localhost:3000"
                  />
                </div>
                <div>
                  <label className={labelClass}>Upstream API Key</label>
                  <input
                    type="password"
                    value={form.upstream_api_key}
                    onChange={(e) => setForm({ ...form, upstream_api_key: e.target.value })}
                    className={inputClass}
                    placeholder={isEditing && !form.upstream_api_key ? '•••••••• (unchanged if blank)' : 'sk-...'}
                  />
                </div>
                <div>
                  <label className={labelClass}>Bind Port</label>
                  <input
                    type="number"
                    value={form.bind_port}
                    onChange={(e) => setForm({ ...form, bind_port: parseInt(e.target.value) || 51820 })}
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="flex items-center gap-6 flex-wrap">
                <label className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={form.enable_ocr}
                    onChange={(e) => setForm({ ...form, enable_ocr: e.target.checked })}
                    className="accent-portal-accent w-4 h-4"
                  />
                  <span className="text-sm text-portal-text">Enable OCR</span>
                </label>
                <label className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={form.disable_atr_auto_update}
                    onChange={(e) => setForm({ ...form, disable_atr_auto_update: e.target.checked })}
                    className="accent-portal-accent w-4 h-4"
                  />
                  <span className="text-sm text-portal-text">Disable ATR Auto-Update</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Detection Categories */}
        <div className="bg-portal-card border border-portal-border rounded-xl overflow-hidden">
          <button
            onClick={() => toggleSection('rules')}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-portal-accent" />
              <span className="text-sm font-semibold text-portal-text">Detection Categories</span>
            </div>
            {sections.rules ? <ChevronDown className="w-4 h-4 text-portal-text-muted" /> : <ChevronRight className="w-4 h-4 text-portal-text-muted" />}
          </button>
          {sections.rules && (
            <div className="px-6 pb-6">
              <p className="text-xs text-portal-text-muted mb-4">
                Choose which detection categories are enabled on enrolled agents. Disabled categories will be ignored entirely.
              </p>
              <div className="space-y-3">
                {DETECTION_CATEGORIES.map((cat) => (
                  <label key={cat.key} className="flex items-start gap-3 cursor-pointer hover:bg-white/[0.02] rounded-lg px-3 py-2 -mx-3 transition-colors">
                    <input
                      type="checkbox"
                      checked={form.enabled_detection_categories.includes(cat.key)}
                      onChange={() => toggleDetection(cat.key)}
                      className="accent-portal-accent w-4 h-4 mt-0.5 flex-shrink-0"
                    />
                    <div>
                      <div className="text-sm font-medium text-portal-text">{cat.label}</div>
                      <div className="text-xs text-portal-text-muted mt-0.5">{cat.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Trusted Patterns */}
        <div className="bg-portal-card border border-portal-border rounded-xl overflow-hidden">
          <button
            onClick={() => toggleSection('trusted')}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-3">
              <List className="w-5 h-5 text-portal-accent" />
              <span className="text-sm font-semibold text-portal-text">Trusted Patterns</span>
            </div>
            {sections.trusted ? <ChevronDown className="w-4 h-4 text-portal-text-muted" /> : <ChevronRight className="w-4 h-4 text-portal-text-muted" />}
          </button>
          {sections.trusted && (
            <div className="px-6 pb-6">
              <p className="text-xs text-portal-text-muted mb-4">
                These URLs or text patterns will be allowed through without scanning on all enrolled agents.
                Use <code className="text-portal-accent">*</code> as a wildcard.
              </p>
              <div className="space-y-1.5 mb-2">
                {form.allowlists.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <span className="flex-1 text-xs font-mono text-portal-text bg-black/20 rounded px-2 py-1 truncate">{item}</span>
                    <button onClick={() => removeArrayItem('allowlists', idx)} className="text-portal-text-muted hover:text-portal-danger flex-shrink-0">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              {addingField === 'allowlists' ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={newItemValue}
                    onChange={(e) => setNewItemValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') confirmAddItem(); if (e.key === 'Escape') setAddingField(null) }}
                    className="input-field text-xs flex-1"
                    placeholder="e.g. api.mycompany.com or my-app-*"
                    autoFocus
                  />
                  <button onClick={confirmAddItem} className="text-xs text-portal-accent hover:text-portal-accent-hover font-semibold px-1">Add</button>
                  <button onClick={() => setAddingField(null)} className="text-xs text-portal-text-muted hover:text-portal-text px-1">Cancel</button>
                </div>
              ) : (
                <button onClick={() => startAddItem('allowlists')} className="btn-ghost text-xs py-1 px-2.5 w-full">
                  <Plus className="w-3 h-3 inline mr-1" />
                  Add Pattern
                </button>
              )}
            </div>
          )}
        </div>

        {/* Custom Regex Rules */}
        <div className="bg-portal-card border border-portal-border rounded-xl overflow-hidden">
          <button
            onClick={() => toggleSection('regex')}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-3">
              <Sliders className="w-5 h-5 text-portal-accent" />
              <span className="text-sm font-semibold text-portal-text">Custom Regex Rules</span>
            </div>
            {sections.regex ? <ChevronDown className="w-4 h-4 text-portal-text-muted" /> : <ChevronRight className="w-4 h-4 text-portal-text-muted" />}
          </button>
          {sections.regex && (
            <div className="px-6 pb-6">
              <p className="text-xs text-portal-text-muted mb-4">
                Additional regex patterns to detect in prompts. These are applied on top of built-in detection.
              </p>
              <div className="space-y-1.5 mb-2">
                {form.custom_regex.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <span className="flex-1 text-xs font-mono text-portal-text bg-black/20 rounded px-2 py-1 truncate">{item}</span>
                    <button onClick={() => removeArrayItem('custom_regex', idx)} className="text-portal-text-muted hover:text-portal-danger flex-shrink-0">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              {addingField === 'custom_regex' ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={newItemValue}
                    onChange={(e) => setNewItemValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') confirmAddItem(); if (e.key === 'Escape') setAddingField(null) }}
                    className="input-field text-xs flex-1"
                    placeholder="Enter regex pattern..."
                    autoFocus
                  />
                  <button onClick={confirmAddItem} className="text-xs text-portal-accent hover:text-portal-accent-hover font-semibold px-1">Add</button>
                  <button onClick={() => setAddingField(null)} className="text-xs text-portal-text-muted hover:text-portal-text px-1">Cancel</button>
                </div>
              ) : (
                <button onClick={() => startAddItem('custom_regex')} className="btn-ghost text-xs py-1 px-2.5 w-full">
                  <Plus className="w-3 h-3 inline mr-1" />
                  Add Pattern
                </button>
              )}
            </div>
          )}
        </div>

        {/* Targeting */}
        <div className="bg-portal-card border border-portal-border rounded-xl overflow-hidden">
          <button
            onClick={() => toggleSection('targeting')}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-3">
              <Target className="w-5 h-5 text-portal-accent" />
              <span className="text-sm font-semibold text-portal-text">Targeting</span>
            </div>
            {sections.targeting ? <ChevronDown className="w-4 h-4 text-portal-text-muted" /> : <ChevronRight className="w-4 h-4 text-portal-text-muted" />}
          </button>
          {sections.targeting && (
            <div className="px-6 pb-6 space-y-4">
              <div>
                <label className={labelClass}>Target Mode</label>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="target_mode"
                      checked={form.target_mode === 'all'}
                      onChange={() => setForm({ ...form, target_mode: 'all', group_ids: [] })}
                      className="accent-portal-accent"
                    />
                    <span className="text-sm text-portal-text">All Agents</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="target_mode"
                      checked={form.target_mode === 'group'}
                      onChange={() => setForm({ ...form, target_mode: 'group' })}
                      className="accent-portal-accent"
                    />
                    <span className="text-sm text-portal-text">Specific Groups</span>
                  </label>
                </div>
              </div>
              {form.target_mode === 'group' && (
                <div>
                  <label className={labelClass}>Assigned Groups</label>
                  {allGroups.length === 0 ? (
                    <p className="text-xs text-portal-text-muted">No groups created yet. Create groups in the Agents page first.</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto border border-portal-border rounded-lg p-3">
                      {allGroups.map((g) => (
                        <label key={g.id} className="flex items-center gap-2.5 cursor-pointer hover:bg-white/[0.02] rounded px-2 py-1.5">
                          <input
                            type="checkbox"
                            checked={form.group_ids.includes(g.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setForm({ ...form, group_ids: [...form.group_ids, g.id] })
                              } else {
                                setForm({ ...form, group_ids: form.group_ids.filter((id) => id !== g.id) })
                              }
                            }}
                            className="accent-portal-accent w-4 h-4"
                          />
                          <Users className="w-3.5 h-3.5 text-portal-text-muted" />
                          <span className="text-sm text-portal-text">{g.name}</span>
                          <span className="text-xs text-portal-text-muted ml-auto">{g.member_count} agents</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {form.group_ids.length > 0 && (
                    <p className="text-xs text-portal-text-muted mt-2">{form.group_ids.length} group(s) selected</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 mt-8 pt-6 border-t border-portal-border">
        <button onClick={() => navigate('/policies')} className="btn-ghost">Cancel</button>
        <button
          onClick={handleSave}
          disabled={saving || !form.name}
          className="btn-primary flex items-center gap-2"
        >
          {saving ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              {isEditing ? 'Update Policy' : 'Create Policy'}
            </>
          )}
        </button>
      </div>
    </div>
  )
}
