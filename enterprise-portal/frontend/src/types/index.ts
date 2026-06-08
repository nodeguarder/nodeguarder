export interface User {
  id: string
  email: string
  display_name: string
  role: 'ADMIN' | 'SECURITYOPS' | 'AUDITOR'
  org_id: string
  created_at?: string
  last_active_at?: string
}

export interface Agent {
  uuid: string
  org_id: string
  hostname: string
  ip_address: string | null
  status: 'online' | 'offline' | 'revoked'
  last_seen: string | null
  policy_version: string | null
  agent_version: string | null
  created_at: string
}

export interface UpstreamRoute {
  match_pattern: string
  url: string
  api_key?: string | null
  api_key_source?: string | null
  priority: number
}

export interface Policy {
  id: string
  org_id: string
  name: string
  description: string | null
  version: number
  priority: number
  redaction_enforced: boolean
  on_detection: string | null
  upstream_url: string | null
  upstream_api_key: string | null
  bind_port: number | null
  enable_ocr: boolean | null
  disable_atr_auto_update: boolean | null
  allow_custom_allowlists: boolean
  bearer_token: string | null
  enabled_detection_categories: string[] | null
  custom_regex: string[] | null
  allowlists: string[] | null
  target_mode: 'all' | 'group'
  target_regex: string | null
  group_ids: string[]
  upstream_routes: UpstreamRoute[]
  updated_at: string
  updated_by: string | null
}

export interface AuditLog {
  id: string
  org_id: string
  agent_uuid: string
  user_name: string | null
  content_type: string
  severity: string
  action_taken: string
  detection_method: string | null
  preview: string | null
  flagged_at: string
  session_id: string | null
  timeout_triggered: boolean
  policy_enforced: boolean
}

export interface EnrollmentCode {
  id: string
  org_id: string
  code: string
  created_at: string
  expires_at: string
  used_by: string | null
  used_at: string | null
}

export interface DashboardSummary {
  total_agents: number
  online_agents: number
  offline_agents: number
  total_policies: number
  total_flags_24h: number
  redacted_count_24h: number
  allowed_count_24h: number
  blocked_count_24h: number
}

export interface ActivityEvent {
  type: 'agent' | 'flag' | 'policy'
  text: string
  time: string
  action?: string
}

export interface LoginResponse {
  token: string
  user: User
}

export interface DetectedEndpoint {
  service_type: string
  name: string
  url: string
  reachable: boolean
  models: string[]
  metadata: Record<string, string>
}

export interface DetectedIde {
  ide_type: string
  config_path: string
  copilot_enabled: boolean | null
  proxy_settings: string | null
  is_running: boolean
}

export interface DetectedEnvVar {
  name: string
  is_set: boolean
  value_prefix: string
}

export interface ConfigSuggestion {
  category: string
  description: string
  suggested_value: string
  priority: string
  affected_agent_count: number
  agents?: { agent_uuid: string; hostname: string }[]
}

export interface ContinueConfigSuggestion {
  current_api_base: string | null
  suggested_api_base: string
  already_configured: boolean
}

export interface EnvironmentReport {
  agent_uuid: string
  hostname: string
  reported_at: string
  detected_endpoints: DetectedEndpoint[]
  detected_ides: DetectedIde[]
  detected_env_vars: DetectedEnvVar[]
  os: string
  suggested_upstream_url: string | null
  suggested_upstream_key_source: string | null
  continue_config_suggestion: ContinueConfigSuggestion | null
  config_suggestions: ConfigSuggestion[]
}

export interface ComplianceReport {
  id: string
  org_id: string
  framework: string
  status: 'compliant' | 'in-progress' | 'not-started'
  score: number
  report_data: {
    controls: { name: string; status: string; score: number; evidence: string }[]
    metrics: { total_detections: number; blocked: number; redacted: number; allowed: number }
    coverage: { total_agents: number; online_agents: number; offline_agents: number; active_policies: number }
    date_range: { from: string; to: string }
  }
  generated_at: string
  generated_by: string | null
}

export interface ComplianceSummary {
  total_reports: number
  compliant: number
  in_progress: number
  not_started: number
}

export interface AgentGroup {
  id: string
  org_id: string
  name: string
  description: string | null
  member_count: number
  created_at: string
}

export interface OnboardingStatus {
  completed: boolean
  steps: { id: string; label: string; done: boolean }[]
}

export interface LLMLandscape {
  llm_types: {
    service_type: string
    name: string
    agent_count: number
    models: string[]
    agents: { agent_uuid: string; hostname: string }[]
  }[]
  unmanaged_agents: number
  total_reported: number
}

export interface LandscapeReport {
  agent_uuid: string
  hostname: string
  report: EnvironmentReport
}

export interface RequestMetric {
  id: number
  agent_uuid: string
  timestamp_ms: number
  model_requested: string
  model_used: string
  prompt_tokens: number | null
  completion_tokens: number | null
  total_tokens: number | null
  total_latency_ms: number
  detection_latency_ms: number
  upstream_latency_ms: number
  was_cached: boolean
  was_blocked: boolean
  was_redacted: boolean
  upstream_status: number
}

export interface MetricsSummary {
  total_requests: number
  cached_requests: number
  blocked_requests: number
  redacted_requests: number
  avg_total_latency_ms: number
  avg_detection_latency_ms: number
  avg_upstream_latency_ms: number
  total_prompt_tokens: number
  total_completion_tokens: number
  unique_agents: number
  unique_models: number
}

export interface PerModelMetric {
  model: string
  request_count: number
  total_prompt_tokens: number
  total_completion_tokens: number
  avg_latency_ms: number
  cached_count: number
}

export interface DailyMetric {
  date: string
  request_count: number
  cached_count: number
  total_prompt_tokens: number
  total_completion_tokens: number
}

export interface PerAgentMetric {
  agent_uuid: string
  request_count: number
  total_tokens: number
  avg_latency_ms: number
  cached_count: number
}
