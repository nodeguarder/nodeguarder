import React, { useState, useEffect } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
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
  AlertTriangle,
} from 'lucide-react'
import { getPolicy, createPolicy, updatePolicy, getGroups } from '@/api/client'
import { showToast } from '@/components/Toast'
import type { Policy, AgentGroup, ConfigSuggestion, UpstreamRoute } from '@/types'

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
  version: 0,
  redaction_enforced: true,
  on_detection: 'enforced_redact' as string,
  upstream_url: '',
  upstream_api_key: '',
  bind_port: 51820,
  enable_ocr: false,
  disable_atr_auto_update: false,
  allow_custom_allowlists: true,
  bearer_token: '',
  enabled_detection_categories: [...ALL_DETECTION_KEYS] as string[],
  custom_regex: [] as string[],
  allowlists: [] as string[],
  target_mode: 'all' as 'all' | 'group',
  group_ids: [] as string[],
  priority: 100,
  upstream_routes: [] as UpstreamRoute[],
}

export default function PolicyEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const isEditing = !!id
  const suggestion = location.state?.suggestion as ConfigSuggestion | undefined

  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [hasUpstreamApiKey, setHasUpstreamApiKey] = useState(false)
  const [apiKeyTouched, setApiKeyTouched] = useState(false)
  const [allGroups, setAllGroups] = useState<AgentGroup[]>([])
  const [sections, setSections] = useState({
    general: true,
    upstream: true,
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
    if (id) return
    if (!suggestion) return
    const initial = { ...emptyForm }
    initial.name = 'Auto: ' + (suggestion.description || suggestion.category).substring(0, 40)
    if (suggestion.category === 'upstream_url') {
      initial.upstream_url = suggestion.suggested_value
      setSections((prev) => ({ ...prev, upstream: true }))
    }
    setForm(initial)
  }, [id, suggestion])

  useEffect(() => {
    if (!id) return
    getPolicy(id)
      .then((res) => {
        const p = res.policy
        const existing = p.enabled_detection_categories || []
        setHasUpstreamApiKey(!!p.upstream_api_key)
        setApiKeyTouched(false)
        setForm({
          name: p.name,
          description: p.description || '',
          version: p.version,
          redaction_enforced: p.redaction_enforced,
          on_detection: p.on_detection || 'permissive',
          upstream_url: p.upstream_url || '',
          upstream_api_key: '',
          bind_port: p.bind_port || 51820,
          enable_ocr: p.enable_ocr || false,
          disable_atr_auto_update: p.disable_atr_auto_update || false,
          allow_custom_allowlists: p.allow_custom_allowlists,
          bearer_token: p.bearer_token || '',
          enabled_detection_categories: existing,
          custom_regex: p.custom_regex || [],
          allowlists: p.allowlists || [],
          target_mode: p.target_mode as 'all' | 'group',
          group_ids: p.group_ids || [],
          priority: p.priority || 100,
          upstream_routes: (p.upstream_routes || []).map(r => ({ ...r })),
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
      const payload = {
        ...form,
        redaction_enforced: form.on_detection === 'enforced_redact' || form.on_detection === 'enforced_block',
      }
      if (isEditing) {
        const { upstream_api_key, ...rest } = payload
        const finalPayload = apiKeyTouched ? payload : rest
        await updatePolicy(id!, finalPayload)
        showToast('Policy updated', 'success')
      } else {
        await createPolicy(payload)
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
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Version</label>
                  <div className="text-sm font-semibold text-portal-text py-2.5 px-3 bg-black/20 rounded-lg border border-portal-border">
                    {isEditing ? `v${form.version || 1}` : 'v1 (new)'}
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Priority</label>
                  <input
                    type="number"
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 100 })}
                    className={inputClass}
                    min={1}
                    max={10000}
                    placeholder="100"
                  />
                </div>
              </div>
              {isEditing && (
                <p className="text-[10px] text-portal-text-muted -mt-2">Version increments automatically on each update. Lower priority = higher precedence.</p>
              )}
              <div className="flex items-center gap-6 flex-wrap">
                <div>
                  <label className={labelClass}>On Detection Action</label>
                  <select
                    value={form.on_detection}
                    onChange={(e) => setForm({ ...form, on_detection: e.target.value })}
                    className={inputClass}
                  >
                     <option value="enforced_redact">User Choice (Redact/Block)</option>
                     <option value="enforced_block">User Choice (Block only)</option>
                     <option value="auto_redact">Auto-Redact (no modal, always redact)</option>
                     <option value="auto_block">Auto-Block (no modal, always block)</option>
                     <option value="auto_allow">Auto-Allow (no modal, allows flagged content)</option>
                   </select>
                   <p className="text-[10px] text-portal-text-muted mt-0.5">Applies to enrolled agents only. Non-enrolled agents default to allowing all options.</p>
                 </div>
                <div className="flex flex-col gap-1">
                  <label className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={form.allow_custom_allowlists}
                      onChange={(e) => setForm({ ...form, allow_custom_allowlists: e.target.checked })}
                      className="accent-portal-accent w-4 h-4"
                    />
                    <span className="text-sm text-portal-text">Allow Local Trusted Patterns</span>
                  </label>
                  <span className="text-[10px] text-portal-text-muted ml-6">When unchecked, agents cannot add/remove local allowlist rules. Independent of the on-detection action above.</span>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={form.disable_atr_auto_update}
                      onChange={(e) => setForm({ ...form, disable_atr_auto_update: e.target.checked })}
                      className="accent-portal-accent w-4 h-4"
                    />
                    <span className="text-sm text-portal-text">Disable ATR Auto-Update</span>
                  </label>
                  <span className="text-[10px] text-portal-text-muted ml-6">When checked, agents will not automatically update threat detection rules from the ATR community registry.</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Upstream Routes */}
        <div className="bg-portal-card border border-portal-border rounded-xl overflow-hidden">
          <button
            onClick={() => toggleSection('upstream')}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-portal-accent" />
              <span className="text-sm font-semibold text-portal-text">Upstream Routes</span>
            </div>
            {sections.upstream ? <ChevronDown className="w-4 h-4 text-portal-text-muted" /> : <ChevronRight className="w-4 h-4 text-portal-text-muted" />}
          </button>
          {sections.upstream && (
            <div className="px-6 pb-6 space-y-4">
              <p className="text-[11px] text-portal-text-muted leading-relaxed">
                Requests are matched against these routes in order (first match wins).
                The <code className="text-portal-accent">model</code> field in each request determines the destination.
              </p>
              <p className="text-[11px] text-portal-text-muted">
                Pattern examples: <code className="text-portal-accent">gpt-*</code> matches gpt-4, gpt-4o.{' '}
                <code className="text-portal-accent">*</code> catches everything.
              </p>

              {/* Route table header */}
              <div className="grid grid-cols-[1fr_2fr_1.5fr_auto] gap-3 text-[10px] text-portal-text-muted uppercase tracking-wider px-1">
                <span>Match Pattern</span>
                <span>Upstream URL</span>
                <span>Auth</span>
                <span></span>
              </div>

              {/* Route rows */}
              {form.upstream_routes.map((route, i) => (
                <div key={i} className="grid grid-cols-[1fr_2fr_1.5fr_auto] gap-3 items-center">
                  <input
                    type="text"
                    value={route.match_pattern}
                    onChange={(e) => {
                      const r = [...form.upstream_routes]
                      r[i] = { ...r[i], match_pattern: e.target.value }
                      setForm({ ...form, upstream_routes: r })
                    }}
                    className={inputClass}
                    placeholder="gpt-*"
                  />
                  <input
                    type="text"
                    value={route.url}
                    onChange={(e) => {
                      const r = [...form.upstream_routes]
                      r[i] = { ...r[i], url: e.target.value }
                      setForm({ ...form, upstream_routes: r })
                    }}
                    className={inputClass}
                    placeholder="https://api.openai.com/v1"
                  />
                  <div className="flex items-center gap-2">
                    {route.api_key_source ? (
                      <span className="text-xs text-amber-400 bg-amber-400/10 px-2 py-1.5 rounded-lg border border-amber-400/20 w-full">
                        env:{route.api_key_source}
                      </span>
                    ) : (
                      <input
                        type="password"
                        value={route.api_key || ''}
                        onChange={(e) => {
                          const r = [...form.upstream_routes]
                          r[i] = { ...r[i], api_key: e.target.value || null }
                          setForm({ ...form, upstream_routes: r })
                        }}
                        className={inputClass}
                        placeholder="sk-... or empty"
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        const r = [...form.upstream_routes]
                        r[i] = { ...r[i], api_key_source: route.api_key_source ? null : 'OPENAI_API_KEY' }
                        if (route.api_key_source) r[i].api_key = route.api_key || null
                        setForm({ ...form, upstream_routes: r })
                      }}
                      className="text-[10px] text-portal-text-muted hover:text-portal-accent px-1.5 py-1"
                      title="Use an environment variable (e.g. OPENAI_API_KEY) instead of storing the key directly"
                    >
                      ENV
                    </button>
                    <button
                      onClick={() => {
                        const r = form.upstream_routes.filter((_, idx) => idx !== i)
                        setForm({ ...form, upstream_routes: r })
                      }}
                      className="text-portal-danger hover:text-red-300 px-1.5 py-1"
                      title="Remove route"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}

              {/* Add route button */}
              <button
                onClick={() => {
                  setForm({
                    ...form,
                    upstream_routes: [
                      ...form.upstream_routes,
                      { match_pattern: '*', url: 'https://api.openai.com/v1', api_key: null, api_key_source: null, priority: form.upstream_routes.length },
                    ],
                  })
                }}
                className="btn-ghost text-xs flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Route
              </button>

              {/* Bearer token */}
              <div className="border-t border-portal-border pt-4 mt-2">
                <div>
                  <label className={labelClass}>NodeGuarder bearer token (shared across agents)</label>
                  <input
                    type="text"
                    value={form.bearer_token}
                    onChange={(e) => setForm({ ...form, bearer_token: e.target.value })}
                    className={inputClass}
                    placeholder="ng-... leave empty to keep per-agent tokens"
                  />
                </div>
              </div>

              {/* Env var warning */}
              {form.upstream_routes.some(r => r.api_key_source) && (
                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg px-4 py-3 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>
                    Some routes use environment variables for API keys. Ensure all targeted agents have the corresponding variables set (e.g. <code className="text-amber-300">OPENAI_API_KEY</code>).
                  </span>
                </div>
              )}
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

                {/* OCR toggle */}
                <div className="border-t border-portal-border pt-4 mt-4">
                  <label className="flex items-start gap-3 cursor-pointer hover:bg-white/[0.02] rounded-lg px-3 py-2 -mx-3 transition-colors">
                    <input
                      type="checkbox"
                      checked={form.enable_ocr}
                      onChange={(e) => setForm({ ...form, enable_ocr: e.target.checked })}
                      className="accent-portal-accent w-4 h-4 mt-0.5 flex-shrink-0"
                    />
                    <div>
                      <div className="text-sm font-medium text-portal-text">Scan Images & Screenshots (OCR)</div>
                      <div className="text-xs text-portal-text-muted mt-0.5">Detect sensitive text within uploaded images using native hardware acceleration.</div>
                    </div>
                  </label>
                </div>
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
