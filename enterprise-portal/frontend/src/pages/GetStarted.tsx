import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Shield,
  Radio,
  CheckCircle2,
  Circle,
  ArrowRight,
  Copy,
  Check,
  Plus,
  Server,
  Monitor,
  Download,
  Globe,
} from 'lucide-react'
import { getOnboardingStatus, completeOnboarding, generateCode, downloadProvisioningFile } from '@/api/client'
import { showToast } from '@/components/Toast'

const STEPS = [
  { id: 'enroll', label: 'Enroll an Agent', icon: Radio },
  { id: 'policy', label: 'Create a Policy', icon: Shield },
  { id: 'groups', label: 'Assign to Groups', icon: Server },
]

export default function GetStarted() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<{ completed: boolean; steps: { id: string; label: string; done: boolean }[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeStep, setActiveStep] = useState(0)
  const [enrollmentCode, setEnrollmentCode] = useState('')
  const [adminGrpcUrl, setAdminGrpcUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [enrollMethod, setEnrollMethod] = useState<'ui' | 'mdm'>('ui')

  useEffect(() => {
    getOnboardingStatus()
      .then((s) => {
        setStatus(s)
        const firstIncomplete = s.steps.findIndex((st) => !st.done)
        setActiveStep(firstIncomplete >= 0 ? firstIncomplete : s.steps.length - 1)
      })
      .catch(() => showToast('Failed to load onboarding status', 'error'))
      .finally(() => setLoading(false))
  }, [])

  const handleGenerateCode = async () => {
    setGenerating(true)
    try {
      const code = await generateCode(24)
      setEnrollmentCode(code.code)
      setAdminGrpcUrl(code.admin_grpc_url)
      showToast('Enrollment code generated', 'success')
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setGenerating(false)
    }
  }

  const copyCode = () => {
    if (!enrollmentCode) return
    navigator.clipboard.writeText(enrollmentCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const copyAdminUrl = () => {
    if (!adminGrpcUrl) return
    navigator.clipboard.writeText(adminGrpcUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleComplete = async () => {
    try {
      await completeOnboarding()
      showToast('Onboarding completed!', 'success')
      navigate('/dashboard')
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-portal-accent/30 border-t-portal-accent rounded-full animate-spin" />
      </div>
    )
  }

  if (status?.completed) {
    return (
      <div className="text-center py-20">
        <CheckCircle2 className="w-16 h-16 text-portal-success mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-portal-text mb-2">Onboarding Complete</h1>
        <p className="text-portal-text-muted mb-6">Your NodeGuarder Enterprise portal is fully set up.</p>
        <button onClick={() => navigate('/dashboard')} className="btn-primary mb-8">
          Go to Dashboard
        </button>

        <div className="max-w-xl mx-auto space-y-4">
          <div className="bg-portal-card border border-portal-border rounded-xl p-6 text-left">
            <h3 className="text-sm font-semibold text-portal-text mb-2">Step 1: Configure Your IDE</h3>
            <p className="text-xs text-portal-text-muted mb-4">
              Route your IDE's LLM traffic through the NodeGuarder proxy to scan all prompts.
              See the <strong>IDE Setup Guide</strong> (<code>docs/ide-setup-guide.md</code>) for Continue.dev, Cursor, VS Code,
              Windsurf configuration examples, including enterprise deployment via Intune/MDM.
            </p>
          </div>

          <div className="bg-portal-card border border-portal-border rounded-xl p-6 text-left">
            <h3 className="text-sm font-semibold text-portal-text mb-2">Step 2: Set Your Upstream LLM</h3>
            <p className="text-xs text-portal-text-muted mb-4">
              NodeGuarder needs to know where to forward cleaned requests.
              Pick a provider below to create your first routing policy.
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => navigate('/policies/new', { state: { suggestion: { category: 'upstream_url', description: 'Upstream: GitHub Models', suggested_value: 'https://models.inference.ai.azure.com', priority: 'high', affected_agent_count: 1 } } })} className="btn-primary text-xs flex items-center gap-1.5 py-2 px-3">
                <Globe className="w-3.5 h-3.5" />
                GitHub Models
              </button>
              <button onClick={() => navigate('/policies/new', { state: { suggestion: { category: 'upstream_url', description: 'Upstream: Azure OpenAI', suggested_value: 'https://<resource>.openai.azure.com/v1', priority: 'high', affected_agent_count: 1 } } })} className="btn-ghost text-xs flex items-center gap-1.5 py-2 px-3">
                <Globe className="w-3.5 h-3.5" />
                Azure OpenAI
              </button>
              <button onClick={() => navigate('/policies/new', { state: { suggestion: { category: 'upstream_url', description: 'Upstream: OpenAI', suggested_value: 'https://api.openai.com/v1', priority: 'high', affected_agent_count: 1 } } })} className="btn-ghost text-xs flex items-center gap-1.5 py-2 px-3">
                <Globe className="w-3.5 h-3.5" />
                OpenAI
              </button>
              <button onClick={() => navigate('/policies/new', { state: { suggestion: { category: 'upstream_url', description: 'Upstream: Custom', suggested_value: '', priority: 'medium', affected_agent_count: 1 } } })} className="btn-ghost text-xs flex items-center gap-1.5 py-2 px-3">
                <Server className="w-3.5 h-3.5" />
                Custom
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-10">
        <h1 className="text-2xl font-bold text-portal-text">Get Started</h1>
        <p className="text-portal-text-muted mt-1">Complete these steps to set up your NodeGuarder Enterprise portal</p>
      </div>

      <div className="flex items-center justify-center gap-0 mb-10">
        {STEPS.map((step, i) => (
          <React.Fragment key={step.id}>
            <button
              onClick={() => setActiveStep(i)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                activeStep === i ? 'bg-portal-accent/10 text-portal-accent' : 'text-portal-text-muted hover:text-portal-text'
              }`}
            >
              {status?.steps.find((s) => s.id === step.id)?.done ? (
                <CheckCircle2 className="w-5 h-5 text-portal-success" />
              ) : activeStep === i ? (
                <step.icon className="w-5 h-5" />
              ) : (
                <Circle className="w-5 h-5" />
              )}
              <span className="text-sm font-medium hidden sm:inline">{step.label}</span>
            </button>
            {i < STEPS.length - 1 && <ArrowRight className="w-4 h-4 text-portal-border mx-2" />}
          </React.Fragment>
        ))}
      </div>

      <div className="bg-portal-card border border-portal-border rounded-xl p-8">
        {activeStep === 0 && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-portal-accent/10 flex items-center justify-center">
                <Radio className="w-5 h-5 text-portal-accent" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-portal-text">Enroll an Agent</h2>
                <p className="text-sm text-portal-text-muted">Generate an enrollment code and use it to register an agent</p>
              </div>
            </div>

            <div className="bg-portal-bg border border-portal-border rounded-lg p-6 mb-6">
              <h3 className="text-sm font-semibold text-portal-text mb-3">Step 1: Generate an enrollment code</h3>
              <p className="text-xs text-portal-text-muted mb-4">Codes expire after 24 hours by default.</p>
              {enrollmentCode ? (
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-black/30 text-portal-accent font-mono text-sm px-4 py-2.5 rounded-lg border border-portal-border select-all">
                    {enrollmentCode}
                  </code>
                  <button onClick={copyCode} className="btn-ghost p-2.5" title="Copy code">
                    {copied ? <Check className="w-4 h-4 text-portal-success" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              ) : (
                <button onClick={handleGenerateCode} disabled={generating} className="btn-primary flex items-center gap-2">
                  {generating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Generate Code
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="bg-portal-bg border border-portal-border rounded-lg p-6">
              <h3 className="text-sm font-semibold text-portal-text mb-3">Step 2: Enroll the Agent</h3>
              <p className="text-xs text-portal-text-muted mb-4">Choose an enrollment method:</p>

              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setEnrollMethod('ui')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                    enrollMethod === 'ui'
                      ? 'bg-portal-accent/10 text-portal-accent border border-portal-accent/30'
                      : 'bg-portal-card border border-portal-border text-portal-text-muted hover:text-portal-text'
                  }`}
                >
                  <Monitor className="w-4 h-4" />
                  Self-Enroll (Agent UI)
                </button>
                <button
                  onClick={() => setEnrollMethod('mdm')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                    enrollMethod === 'mdm'
                      ? 'bg-portal-accent/10 text-portal-accent border border-portal-accent/30'
                      : 'bg-portal-card border border-portal-border text-portal-text-muted hover:text-portal-text'
                  }`}
                >
                  <Download className="w-4 h-4" />
                  MDM / Intune
                </button>
              </div>

              {enrollMethod === 'ui' ? (
                <div>
                  <p className="text-xs text-portal-text-muted mb-3">
                    On the target machine, open <strong>NodeGuarder Settings</strong> &rarr; <strong>Enterprise Management</strong> tab, then enter:
                  </p>
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs text-portal-text-muted mb-1">Admin Portal gRPC URL</div>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-black/30 text-portal-accent font-mono text-sm px-4 py-2.5 rounded-lg border border-portal-border select-all">
                          {adminGrpcUrl || 'Generate a code first'}
                        </code>
                        {adminGrpcUrl && (
                          <button onClick={copyAdminUrl} className="btn-ghost p-2.5" title="Copy URL">
                            {copied ? <Check className="w-4 h-4 text-portal-success" /> : <Copy className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-portal-text-muted mb-1">Enrollment Code</div>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-black/30 text-portal-accent font-mono text-sm px-4 py-2.5 rounded-lg border border-portal-border select-all">
                          {enrollmentCode || 'Generate a code first'}
                        </code>
                        {enrollmentCode && (
                          <button onClick={copyCode} className="btn-ghost p-2.5" title="Copy code">
                            {copied ? <Check className="w-4 h-4 text-portal-success" /> : <Copy className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-portal-text-muted mb-3">
                    Deploy <code>provisioning.toml</code> to <code>%PROGRAMDATA%\NodeGuarder\provisioning.toml</code> on target machines
                    via Intune, Group Policy, or your MDM. The agent will auto-enroll on next start.
                  </p>
                  {enrollmentCode ? (
                    <button
                      onClick={async () => {
                        setDownloading(true)
                        try {
                          await downloadProvisioningFile(enrollmentCode)
                          showToast('Provisioning config downloaded', 'success')
                        } catch (err: any) {
                          showToast(err.message, 'error')
                        } finally {
                          setDownloading(false)
                        }
                      }}
                      disabled={downloading}
                      className="btn-primary inline-flex items-center gap-2 text-xs"
                    >
                      {downloading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Downloading...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          Download provisioning.toml
                        </>
                      )}
                    </button>
                  ) : (
                    <p className="text-xs text-portal-text-muted italic">Generate a code above first</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeStep === 1 && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-portal-accent/10 flex items-center justify-center">
                <Shield className="w-5 h-5 text-portal-accent" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-portal-text">Create a Policy</h2>
                <p className="text-sm text-portal-text-muted">Define security policies that control how agents handle sensitive data</p>
              </div>
            </div>

            <div className="bg-portal-bg border border-portal-border rounded-lg p-6">
              <p className="text-sm text-portal-text-muted mb-4">
                Policies define what data to redact, which LLM endpoints to monitor, and how to handle detections.
                You can create multiple policies targeting different agents or groups.
              </p>
              <button
                onClick={() => navigate('/policies/new')}
                className="btn-primary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Create Policy
              </button>
            </div>
          </div>
        )}

        {activeStep === 2 && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-portal-accent/10 flex items-center justify-center">
                <Server className="w-5 h-5 text-portal-accent" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-portal-text">Assign to Groups</h2>
                <p className="text-sm text-portal-text-muted">Organize agents into groups and assign policies</p>
              </div>
            </div>

            <div className="bg-portal-bg border border-portal-border rounded-lg p-6 mb-4">
              <p className="text-sm text-portal-text-muted mb-4">
                Agent groups let you organize your agents and assign policies at scale.
                Head to the Agents page to create groups and manage memberships.
              </p>
              <button
                onClick={() => navigate('/agents')}
                className="btn-primary flex items-center gap-2"
              >
                <Radio className="w-4 h-4" />
                Manage Agents & Groups
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mt-8 pt-6 border-t border-portal-border">
          <div>
            {activeStep > 0 && (
              <button onClick={() => setActiveStep(activeStep - 1)} className="btn-ghost flex items-center gap-1">
                <ArrowRight className="w-4 h-4 rotate-180" />
                Previous
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {activeStep < STEPS.length - 1 ? (
              <button onClick={() => setActiveStep(activeStep + 1)} className="btn-primary flex items-center gap-1">
                Next
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={handleComplete} className="btn-primary flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Complete Setup
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
