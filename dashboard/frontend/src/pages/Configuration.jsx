import React, { useState, useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import api from '../services/api';
import { Save, AlertTriangle, List, Clock, Activity, FileWarning, Sliders, Plus, Trash2, RotateCcw, Info } from 'lucide-react';
import { cn } from '../utils/cn';
import ConfirmationModal from '../components/ConfirmationModal';

// Simple deep equality check
const deepEqual = (obj1, obj2) => {
    return JSON.stringify(obj1) === JSON.stringify(obj2);
};

export default function Configuration() {
    const [config, setConfig] = useState({
        drift_ignore: [],
        cron_enabled: true,
        cron_ignore: {},
        thresholds: {
            cpu_warning: 80,
            cpu_critical: 95,
            memory_warning: 80,
            memory_critical: 95,
            disk_warning: 80,
            disk_warning: 80,
            disk_critical: 95
        },
        health_enabled: true,
        health_sustain_duration: 30, // seconds
        stability_window: 120, // seconds
        offline_timeout: 120,
        cron_global_timeout: 0,
        cron_timeouts: {},
        discovered_cron_jobs: []
    });
    const [driftText, setDriftText] = useState('');
    const [driftPathsText, setDriftPathsText] = useState('');
    const [isDriftEnabled, setIsDriftEnabled] = useState(true);

    // Local state for job configuration (merges discovered and configured)
    const [jobConfigs, setJobConfigs] = useState([]);
    const [newJobCommand, setNewJobCommand] = useState('');
    const [isAddingJob, setIsAddingJob] = useState(false);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [lastOfflineTimeout, setLastOfflineTimeout] = useState(null);
    const [lastGlobalTimeout, setLastGlobalTimeout] = useState(null);

    // Dirty state tracking
    const [initialPayload, setInitialPayload] = useState(null);
    const [isDirty, setIsDirty] = useState(false);

    // Block navigation if dirty
    const blocker = useBlocker(
        ({ currentLocation, nextLocation }) =>
            isDirty && currentLocation.pathname !== nextLocation.pathname
    );

    // Navigation Guard with custom modal
    useEffect(() => {
        // No-op: we handle the UI via the blocker state directly in render
    }, [blocker.state]);

    // Browser navigation (refresh/close)
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);

    const getCurrentPayload = () => {
        // Parse Drift
        const driftIgnore = driftText.split('\n').map(s => s.trim()).filter(s => s);
        const driftPaths = isDriftEnabled ? driftPathsText.split('\n').map(s => s.trim()).filter(s => s) : [];

        // Reconstruct Cron Maps from JobConfigs
        const cronTimeouts = {};
        const cronIgnore = {};

        jobConfigs.forEach(job => {
            // Timeout: Convert minutes to seconds
            if (job.timeoutMinutes && !isNaN(job.timeoutMinutes) && parseFloat(job.timeoutMinutes) > 0) {
                cronTimeouts[job.command] = Math.round(parseFloat(job.timeoutMinutes) * 60);
            } else if (!job.isDiscovered) {
                // Ensure manual jobs are persisted even with default settings
                cronTimeouts[job.command] = 0;
            }

            // Ignore Codes: Parse comma separated string
            if (job.ignoreCodes && job.ignoreCodes.trim()) {
                const codes = job.ignoreCodes.split(',')
                    .map(c => parseInt(c.trim()))
                    .filter(c => !isNaN(c));

                if (codes.length > 0) {
                    cronIgnore[job.command] = codes;
                }
            }
        });

        const payload = {
            ...config,
            drift_ignore: driftIgnore,
            drift_paths: driftPaths,
            drift_interval: parseInt(config.drift_interval || 300),
            cron_ignore: cronIgnore,
            cron_timeouts: cronTimeouts,
            cron_global_timeout: parseInt(config.cron_global_timeout || 0),
            cron_auto_discover: config.cron_auto_discover !== undefined ? config.cron_auto_discover : true,
            health_enabled: config.health_enabled !== undefined ? config.health_enabled : true,
            health_sustain_duration: parseInt(config.health_sustain_duration || 30),
            stability_window: parseInt(config.stability_window || 120),
            offline_timeout: parseInt(config.offline_timeout)
        };
        return payload;
    };

    // Check dirty state
    useEffect(() => {
        if (!initialPayload || loading) return;
        const current = getCurrentPayload();
        setIsDirty(!deepEqual(initialPayload, current));
    }, [config, driftText, driftPathsText, isDriftEnabled, jobConfigs, initialPayload, loading]);

    useEffect(() => {
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        try {
            setLoading(true);
            const response = await api.get('/api/v1/config');
            const data = response.data;

            if (!data.offline_timeout || data.offline_timeout <= 0) {
                data.offline_timeout = 60; // Default to 1 minute
                setLastOfflineTimeout(60);
            } else {
                setLastOfflineTimeout(data.offline_timeout);
            }

            if (data.cron_global_timeout > 0) {
                setLastGlobalTimeout(data.cron_global_timeout);
            } else {
                setLastGlobalTimeout(300);
            }

            setConfig(data);
            setDriftText(data.drift_ignore ? data.drift_ignore.join('\n') : '');
            setDriftPathsText(data.drift_paths ? data.drift_paths.join('\n') : '');
            setIsDriftEnabled(data.drift_paths && data.drift_paths.length > 0);

            // Process discovered jobs (support both strings and objects)
            const discoveredMap = new Map();
            const discoveredCommands = [];

            if (data.discovered_cron_jobs) {
                data.discovered_cron_jobs.forEach(job => {
                    if (typeof job === 'string') {
                        discoveredCommands.push(job);
                        discoveredMap.set(job, { isDiscovered: true });
                    } else {
                        discoveredCommands.push(job.Command);
                        discoveredMap.set(job.Command, {
                            isDiscovered: true,
                            lastExitCode: job.LastExitCode,
                            lastDuration: job.LastDuration,
                            lastExecTime: job.LastExecTime
                        });
                    }
                });
            }

            // Merge discovered jobs and configured jobs into a unified list
            const uniqueJobs = new Set([
                ...discoveredCommands,
                ...Object.keys(data.cron_timeouts || {}),
                ...Object.keys(data.cron_ignore || {})
            ]);

            const jobs = Array.from(uniqueJobs).map(cmd => {
                const discoveredInfo = discoveredMap.get(cmd) || {};
                return {
                    command: cmd,
                    timeoutMinutes: (data.cron_timeouts && data.cron_timeouts[cmd]) ? Math.round(data.cron_timeouts[cmd] / 60) : '',
                    ignoreCodes: (data.cron_ignore && data.cron_ignore[cmd]) ? data.cron_ignore[cmd].join(', ') : '',
                    isDiscovered: !!discoveredInfo.isDiscovered,
                    lastExitCode: discoveredInfo.lastExitCode,
                    lastDuration: discoveredInfo.lastDuration,
                    lastExecTime: discoveredInfo.lastExecTime
                };
            });

            setJobConfigs(jobs);

            // Calculate initial payload for dirty state tracking
            // We must reconstruct it exactly as getCurrentPayload does to ensure clean state
            const initialDriftIgnore = data.drift_ignore ? data.drift_ignore.join('\n').split('\n').map(s => s.trim()).filter(s => s) : [];
            const initialDriftPaths = (data.drift_paths && data.drift_paths.length > 0) ? data.drift_paths.join('\n').split('\n').map(s => s.trim()).filter(s => s) : [];

            const initialCronTimeouts = {};
            const initialCronIgnore = {};
            jobs.forEach(job => {
                if (job.timeoutMinutes && !isNaN(job.timeoutMinutes) && parseFloat(job.timeoutMinutes) > 0) {
                    initialCronTimeouts[job.command] = Math.round(parseFloat(job.timeoutMinutes) * 60);
                } else if (!job.isDiscovered) {
                    // Preserve manual jobs
                    initialCronTimeouts[job.command] = 0;
                }

                if (job.ignoreCodes && job.ignoreCodes.trim()) {
                    const codes = job.ignoreCodes.split(',').map(c => parseInt(c.trim())).filter(c => !isNaN(c));
                    if (codes.length > 0) initialCronIgnore[job.command] = codes;
                }
            });

            const initialPayloadCalc = {
                ...data,
                drift_ignore: initialDriftIgnore,
                drift_paths: initialDriftPaths,
                drift_interval: parseInt(data.drift_interval || 300),
                cron_ignore: initialCronIgnore,
                cron_timeouts: initialCronTimeouts,
                cron_global_timeout: parseInt(data.cron_global_timeout || 0),
                cron_auto_discover: data.cron_auto_discover !== undefined ? data.cron_auto_discover : true,
                health_enabled: data.health_enabled !== undefined ? data.health_enabled : true,
                health_sustain_duration: parseInt(data.health_sustain_duration || 30),
                stability_window: parseInt(data.stability_window || 120),
                offline_timeout: parseInt(data.offline_timeout || 60)
            };
            setInitialPayload(initialPayloadCalc);

        } catch (err) {
            setError('Failed to fetch configuration');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const formatDuration = (seconds) => {
        if (seconds === undefined || seconds === null) return '-';
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        const remSeconds = seconds % 60;
        return `${minutes}m ${remSeconds}s`;
    };

    // Render modal if blocked
    const renderNavigationGuard = () => (
        <ConfirmationModal
            isOpen={blocker.state === "blocked"}
            onClose={() => blocker.reset()}
            onConfirm={() => blocker.proceed()}
            title="Unsaved Changes"
            message="You have unsaved changes that will be lost if you leave. Are you sure you want to navigate away?"
            confirmText="Leave without Saving"
            cancelText="Stay"
            isDangerous={true}
        />
    );

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError('');
        setSuccess('');

        try {
            const payload = getCurrentPayload();

            await api.post('/api/v1/config', payload);
            setSuccess('Configuration saved successfully! Agents will update within 5 minutes.');

            // Update initial payload to the new saved state
            setInitialPayload(payload);

            setTimeout(() => setSuccess(''), 5000);
        } catch (err) {
            setError(err.message || 'Failed to save configuration');
        } finally {
            setSaving(false);
        }
    };

    const handleJobChange = (index, field, value) => {
        const newJobs = [...jobConfigs];
        newJobs[index][field] = value;
        setJobConfigs(newJobs);
    };

    const handleAddJob = () => {
        if (!newJobCommand.trim()) return;

        // Check duplicate
        if (jobConfigs.some(j => j.command === newJobCommand.trim())) {
            setError('Job already exists in the list');
            return;
        }

        setJobConfigs([...jobConfigs, {
            command: newJobCommand.trim(),
            timeoutMinutes: '',
            ignoreCodes: '',
            isDiscovered: false
        }]);
        setNewJobCommand('');
        setIsAddingJob(false);
        setError('');
    };

    const handleDeleteJob = (index) => {
        const newJobs = [...jobConfigs];
        if (newJobs[index].isDiscovered) {
            // For discovered jobs, just reset the configuration
            newJobs[index].timeoutMinutes = '';
            newJobs[index].ignoreCodes = '';
        } else {
            // For manual jobs, remove them from the list
            newJobs.splice(index, 1);
        }
        setJobConfigs(newJobs);
    };

    const handleThresholdChange = (key, value) => {
        setConfig(prev => ({
            ...prev,
            thresholds: {
                ...prev.thresholds,
                [key]: parseFloat(value)
            }
        }));
    };

    if (loading) {
        return <div className="p-8 flex items-center justify-center">Loading configuration...</div>;
    }

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-8">
            {renderNavigationGuard()}
            <div className="flex items-baseline justify-between border-b border-border pb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Agent Configuration</h1>
                    <p className="text-sm text-muted-foreground mt-1">Global settings for all agents</p>
                </div>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !isDirty}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving...' : 'Save & Install Changes'}
                </button>
            </div>

            {error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    {error}
                </div>
            )}

            {success && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm font-medium">
                    {success}
                </div>
            )}

            <div className="grid gap-8">

                {/* Health Thresholds */}
                <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-border flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Activity className="w-5 h-5 text-primary" />
                            <h2 className="text-lg font-semibold text-foreground">Health Thresholds Configuration</h2>
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="text-xs text-muted-foreground mr-1">{config.health_enabled !== false ? 'Enabled' : 'Disabled'}</label>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={config.health_enabled !== false}
                                onClick={() => setConfig({ ...config, health_enabled: config.health_enabled === false ? true : false })}
                                className={`
                                    relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
                                    ${config.health_enabled !== false ? 'bg-primary' : 'bg-input'}
                                `}
                            >
                                <span className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${config.health_enabled !== false ? 'translate-x-4' : 'translate-x-0'}`} />
                            </button>
                        </div>
                    </div>
                    {config.health_enabled !== false && (
                        <div className="p-6 space-y-6 animate-in fade-in slide-in-from-top-1 duration-200">

                            <div className="max-w-xs">
                                <label className="text-sm font-medium text-foreground">Alert Sustain Duration (seconds)</label>
                                <div className="text-xs text-muted-foreground mb-2">Metrics must stay above threshold for this long to trigger an alert. Reduces false positives. Default: 30s.</div>
                                <input
                                    type="number"
                                    min="0"
                                    value={config.health_sustain_duration}
                                    onChange={(e) => setConfig({ ...config, health_sustain_duration: parseInt(e.target.value) || 0 })}
                                    className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm"
                                />
                            </div>

                            <div className="max-w-xs">
                                <label className="text-sm font-medium text-foreground">Stability Window (seconds)</label>
                                <div className="text-xs text-muted-foreground mb-2">Duration a server must remain healthy before sending a 'Resolved' notification. Prevents flapping. Default: 120s.</div>
                                <input
                                    type="number"
                                    min="0"
                                    value={config.stability_window}
                                    onChange={(e) => setConfig({ ...config, stability_window: parseInt(e.target.value) || 0 })}
                                    className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm"
                                />
                            </div>

                            <div className="grid gap-6 md:grid-cols-3">
                                {/* CPU */}
                                <div className="space-y-4">
                                    <h3 className="font-medium text-sm flex items-center gap-2 text-muted-foreground">
                                        <span className="w-2 h-2 rounded-full bg-blue-500" /> CPU
                                    </h3>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-xs font-medium text-muted-foreground">Warning (%)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={config.thresholds.cpu_warning}
                                                onChange={(e) => handleThresholdChange('cpu_warning', e.target.value)}
                                                className="w-full mt-1 px-3 py-2 bg-background border border-input rounded-md text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-muted-foreground">Critical (%)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={config.thresholds.cpu_critical}
                                                onChange={(e) => handleThresholdChange('cpu_critical', e.target.value)}
                                                className="w-full mt-1 px-3 py-2 bg-background border border-input rounded-md text-sm"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Memory */}
                                <div className="space-y-4">
                                    <h3 className="font-medium text-sm flex items-center gap-2 text-muted-foreground">
                                        <span className="w-2 h-2 rounded-full bg-purple-500" /> Memory
                                    </h3>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-xs font-medium text-muted-foreground">Warning (%)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={config.thresholds.memory_warning}
                                                onChange={(e) => handleThresholdChange('memory_warning', e.target.value)}
                                                className="w-full mt-1 px-3 py-2 bg-background border border-input rounded-md text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-muted-foreground">Critical (%)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={config.thresholds.memory_critical}
                                                onChange={(e) => handleThresholdChange('memory_critical', e.target.value)}
                                                className="w-full mt-1 px-3 py-2 bg-background border border-input rounded-md text-sm"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Disk */}
                                <div className="space-y-4">
                                    <h3 className="font-medium text-sm flex items-center gap-2 text-muted-foreground">
                                        <span className="w-2 h-2 rounded-full bg-yellow-500" /> Disk
                                    </h3>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-xs font-medium text-muted-foreground">Warning (%)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={config.thresholds.disk_warning}
                                                onChange={(e) => handleThresholdChange('disk_warning', e.target.value)}
                                                className="w-full mt-1 px-3 py-2 bg-background border border-input rounded-md text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-muted-foreground">Critical (%)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={config.thresholds.disk_critical}
                                                onChange={(e) => handleThresholdChange('disk_critical', e.target.value)}
                                                className="w-full mt-1 px-3 py-2 bg-background border border-input rounded-md text-sm"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Offline Settings */}
                <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-border flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Clock className="w-5 h-5 text-primary" />
                            <h2 className="text-lg font-semibold text-foreground">Offline Detection</h2>
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="text-xs text-muted-foreground mr-1">{config.offline_timeout > 0 ? 'Enabled' : 'Disabled'}</label>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={config.offline_timeout > 0}
                                onClick={() => {
                                    const currentValue = config.offline_timeout;
                                    if (currentValue > 0) {
                                        setLastOfflineTimeout(currentValue);
                                        setConfig({ ...config, offline_timeout: 0 });
                                    } else {
                                        setConfig({ ...config, offline_timeout: lastOfflineTimeout || 60 });
                                    }
                                }}
                                className={`
                                    relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
                                    ${config.offline_timeout > 0 ? 'bg-primary' : 'bg-input'}
                                `}
                            >
                                <span className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${config.offline_timeout > 0 ? 'translate-x-4' : 'translate-x-0'}`} />
                            </button>
                        </div>
                    </div>
                    {config.offline_timeout > 0 && (
                        <div className="p-6 animate-in fade-in slide-in-from-top-1 duration-200">
                            <div className="max-w-xs">
                                <label className="text-sm font-medium text-foreground">Offline Timeout (minutes)</label>
                                <div className="text-xs text-muted-foreground mb-2">Node considered offline after (default 1 min)</div>
                                <input
                                    type="number"
                                    min="1"
                                    value={Math.round(config.offline_timeout / 60) || 1}
                                    onChange={(e) => setConfig({ ...config, offline_timeout: (parseFloat(e.target.value) || 0) * 60 })}
                                    className="w-full px-3 py-2 bg-background border border-input rounded-md"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Drift Ignore */}
                <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-border flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <FileWarning className="w-5 h-5 text-primary" />
                            <h2 className="text-lg font-semibold text-foreground">Drift Detection Configuration</h2>
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="text-xs text-muted-foreground mr-1">{isDriftEnabled ? 'Enabled' : 'Disabled'}</label>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={isDriftEnabled}
                                onClick={() => {
                                    if (!isDriftEnabled && !driftPathsText.trim()) {
                                        setDriftPathsText('/etc'); // Default if empty
                                    }
                                    setIsDriftEnabled(!isDriftEnabled);
                                }}
                                className={`
                                    relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
                                    ${isDriftEnabled ? 'bg-primary' : 'bg-input'}
                                `}
                            >
                                <span className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${isDriftEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                            </button>
                        </div>
                    </div>
                    <div className="p-6 space-y-4">
                        {isDriftEnabled && (
                            <div className="animate-in fade-in slide-in-from-top-1 duration-200 space-y-4">
                                <div>
                                    <label className="text-sm font-medium text-foreground">Drift Monitored Paths</label>
                                    <div className="text-xs text-muted-foreground mb-2">Absolute paths to directories to monitor for changes (one per line). Default: /etc</div>
                                    <textarea
                                        value={driftPathsText}
                                        onChange={(e) => setDriftPathsText(e.target.value)}
                                        rows={4}
                                        className="w-full px-3 py-2 bg-background border border-input rounded-md font-mono text-sm"
                                        placeholder="/etc&#10;/var/www/html"
                                    />
                                </div>

                                <div>
                                    <label className="text-sm font-medium text-foreground">Check for drift every (minutes)</label>
                                    <div className="text-xs text-muted-foreground mb-2">How often the agent scans for changes. Default: 5 minutes.</div>
                                    <input
                                        type="number"
                                        min="1"
                                        value={Math.round((config.drift_interval || 300) / 60)}
                                        onChange={(e) => setConfig({ ...config, drift_interval: (parseInt(e.target.value) || 0) * 60 })}
                                        className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm max-w-xs"
                                    />
                                </div>

                                <div>
                                    <label className="text-sm font-medium text-foreground">Wildcard Patterns to ignore</label>
                                    <div className="text-xs text-muted-foreground mb-2">
                                        Shell glob patterns (e.g. <code>*.log</code>, <code>temp/*</code>). Matched against the <b>filename</b> or the <b>path relative</b> to the monitored directory. Use <code>*.bak</code> to ignore all files with that extension.
                                    </div>
                                    <textarea
                                        value={driftText}
                                        onChange={(e) => setDriftText(e.target.value)}
                                        rows={6}
                                        className="w-full px-3 py-2 bg-background border border-input rounded-md font-mono text-sm"
                                        placeholder="temp/*&#10;*.tmp&#10;*.bak"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Cron Monitor Configuration */}
                <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-border flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <List className="w-5 h-5 text-primary" />
                            <h2 className="text-lg font-semibold text-foreground">Cron Monitor Configuration</h2>
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="text-xs text-muted-foreground mr-1">{config.cron_enabled ? 'Enabled' : 'Disabled'}</label>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={config.cron_enabled}
                                onClick={() => setConfig({ ...config, cron_enabled: !config.cron_enabled })}
                                className={`
                                    relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
                                    ${config.cron_enabled ? 'bg-primary' : 'bg-input'}
                                `}
                            >
                                <span className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${config.cron_enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                            </button>
                        </div>
                    </div>

                    {config.cron_enabled && (
                        <div className="p-6 space-y-6 animate-in fade-in slide-in-from-top-1 duration-200">

                            <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
                                <Info className="w-5 h-5 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-semibold">Zero Touch Monitoring (eBPF)</p>
                                    <p className="mt-1 text-blue-700/90">
                                        For full automatic failure detection, <b>Linux Kernel 5.8+</b> is recommended.
                                        <br />
                                        Older kernels will automatically fall back to log-based monitoring (journalctl/syslog).
                                    </p>
                                </div>
                            </div>


                            <div className="grid gap-6">
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <label className="text-sm font-medium text-foreground">Global Max Runtime (minutes)</label>
                                        <div className="flex items-center gap-2">
                                            <label className="text-xs text-muted-foreground mr-1">{config.cron_global_timeout > 0 ? 'Enabled' : 'Disabled'}</label>
                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={config.cron_global_timeout > 0}
                                                onClick={() => {
                                                    const currentValue = config.cron_global_timeout;
                                                    if (currentValue > 0) {
                                                        setLastGlobalTimeout(currentValue);
                                                        setConfig({ ...config, cron_global_timeout: 0 });
                                                    } else {
                                                        setConfig({ ...config, cron_global_timeout: lastGlobalTimeout || 300 });
                                                    }
                                                }}
                                                className={`
                                                    relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
                                                    ${config.cron_global_timeout > 0 ? 'bg-primary' : 'bg-input'}
                                                `}
                                            >
                                                <span className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${config.cron_global_timeout > 0 ? 'translate-x-4' : 'translate-x-0'}`} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="text-xs text-muted-foreground mb-3">
                                        Trigger a <b>warning alert</b> if any cron job exceeds this duration. <br />
                                    </div>

                                    {config.cron_global_timeout > 0 && (
                                        <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                                            <input
                                                type="number"
                                                min="1"
                                                value={Math.round(config.cron_global_timeout / 60) || 1}
                                                onChange={(e) => setConfig({ ...config, cron_global_timeout: (parseInt(e.target.value) || 0) * 60 })}
                                                className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-6">
                                {/* Auto Discovered Jobs Section */}
                                {/* Auto Discovered Jobs Section */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm font-medium text-foreground block">Auto Discovered Jobs</label>
                                        <div className="flex items-center gap-2">
                                            <div className="text-xs text-muted-foreground text-right min-w-[60px]">
                                                {config.cron_auto_discover !== false ? "Enabled" : "Disabled"}
                                            </div>
                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={config.cron_auto_discover !== false}
                                                onClick={() => setConfig({ ...config, cron_auto_discover: config.cron_auto_discover === false ? true : false })}
                                                className={`
                                                     relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
                                                     ${config.cron_auto_discover !== false ? 'bg-primary' : 'bg-input'}
                                                 `}
                                            >
                                                <span className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${config.cron_auto_discover !== false ? 'translate-x-4' : 'translate-x-0'}`} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className={config.cron_auto_discover === false ? "opacity-50 pointer-events-none grayscale" : ""}>
                                        <div className="text-xs text-muted-foreground mb-3">Note: The "Alert after" setting below overrides the Global Max Runtime for that specific job.</div>
                                        <div className="grid gap-3">
                                            {jobConfigs.map((job, index) => ({ ...job, originalIndex: index }))
                                                .filter(job => job.isDiscovered)
                                                .length === 0 ? (
                                                <div className="text-sm text-muted-foreground border border-dashed border-border rounded-lg p-4 text-center">
                                                    No auto-discovered jobs found.
                                                </div>
                                            ) : (
                                                jobConfigs.map((job, index) => ({ ...job, originalIndex: index }))
                                                    .filter(job => job.isDiscovered)
                                                    .map((job) => (
                                                        <div key={job.command} className="flex flex-col md:flex-row gap-4 p-4 bg-muted/10 border border-border rounded-lg items-start md:items-center">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="font-mono text-sm truncate bg-muted/50 px-2 py-1 rounded w-full mb-2" title={job.command}>
                                                                    {job.command}
                                                                </div>
                                                                {(job.lastDuration !== undefined || job.lastExitCode !== undefined) && (
                                                                    <div className="flex gap-4 text-xs">
                                                                        <div className="flex items-center gap-1.5" title="Execution Duration">
                                                                            <span className="text-muted-foreground font-medium uppercase">Last Run:</span>
                                                                            <span className="font-mono">{formatDuration(job.lastDuration)}</span>
                                                                        </div>
                                                                        <div className="flex items-center gap-1.5" title="Last Exit Code">
                                                                            <span className="text-muted-foreground font-medium uppercase">Last Exit Code:</span>
                                                                            <span className={`font-mono font-bold ${job.lastExitCode === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                                                {job.lastExitCode !== undefined ? job.lastExitCode : '-'}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <div className="flex gap-4 w-full md:w-auto items-center">
                                                                <div className="flex-1 md:w-32">
                                                                    <label className="text-[10px] uppercase text-muted-foreground font-semibold mb-0.5 block" title="Trigger warning if job exceeds this time">Alert after (mins)</label>
                                                                    <input
                                                                        type="number"
                                                                        min="0"
                                                                        value={job.timeoutMinutes}
                                                                        onChange={(e) => handleJobChange(job.originalIndex, 'timeoutMinutes', e.target.value)}
                                                                        placeholder={config.cron_global_timeout > 0 ? `Default: ${Math.round(config.cron_global_timeout / 60)}m` : "Disabled (Default)"}
                                                                        className="w-full px-2 py-1 text-sm bg-background border border-input rounded focus:ring-1 focus:ring-primary"
                                                                    />
                                                                </div>

                                                                <div className="flex-1 md:w-40">
                                                                    <label className="text-[10px] uppercase text-muted-foreground font-semibold mb-0.5 block" title="Do not send error events for these exit codes">Ignore Exit Code(s)</label>
                                                                    <input
                                                                        type="text"
                                                                        value={job.ignoreCodes}
                                                                        onChange={(e) => handleJobChange(job.originalIndex, 'ignoreCodes', e.target.value)}
                                                                        placeholder="None (Default)"
                                                                        className="w-full px-2 py-1 text-sm bg-background border border-input rounded focus:ring-1 focus:ring-primary"
                                                                    />
                                                                </div>

                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDeleteJob(job.originalIndex)}
                                                                    className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors mt-4 md:mt-0"
                                                                    title="Reset configuration to defaults"
                                                                >
                                                                    <RotateCcw className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))
                                            )}
                                        </div>
                                    </div>

                                    <hr className="border-border my-6" />

                                    {/* Configured Jobs Section */}
                                    <div>
                                        <label className="text-sm font-medium text-foreground block mb-1">Configured Jobs</label>
                                        <div className="text-xs text-muted-foreground mb-3">Manually configured jobs that were not yet auto-discovered.</div>
                                        <div className="text-xs text-muted-foreground mb-3">Note: The "Alert after" setting below overrides the Global Max Runtime for that specific job.</div>

                                        {isAddingJob && (
                                            <div className="flex gap-2 items-center bg-muted/30 p-3 rounded-lg border border-border animate-in fade-in slide-in-from-top-2 mb-3">
                                                <input
                                                    type="text"
                                                    value={newJobCommand}
                                                    onChange={(e) => setNewJobCommand(e.target.value)}
                                                    placeholder="Enter cron command (e.g. /usr/bin/backup.sh)"
                                                    className="flex-1 px-3 py-2 bg-background border border-input rounded-md text-sm font-mono"
                                                    autoFocus
                                                />
                                                <button
                                                    type="button"
                                                    onClick={handleAddJob}
                                                    className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
                                                >
                                                    Add
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsAddingJob(false)}
                                                    className="px-3 py-2 text-muted-foreground hover:bg-muted rounded-md text-sm"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        )}

                                        <div className="grid gap-3">
                                            {jobConfigs.map((job, index) => ({ ...job, originalIndex: index }))
                                                .filter(job => !job.isDiscovered)
                                                .map((job) => (
                                                    <div key={job.command} className="flex flex-col md:flex-row gap-4 p-4 bg-muted/10 border border-border rounded-lg items-start md:items-center">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-mono text-sm truncate bg-muted/50 px-2 py-1 rounded w-full" title={job.command}>
                                                                {job.command}
                                                            </div>
                                                        </div>

                                                        <div className="flex gap-4 w-full md:w-auto items-center">
                                                            <div className="flex-1 md:w-32">
                                                                <label className="text-[10px] uppercase text-muted-foreground font-semibold mb-0.5 block" title="Trigger warning if job exceeds this time">Alert after (mins)</label>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    value={job.timeoutMinutes}
                                                                    onChange={(e) => handleJobChange(job.originalIndex, 'timeoutMinutes', e.target.value)}
                                                                    placeholder={config.cron_global_timeout > 0 ? `Default: ${Math.round(config.cron_global_timeout / 60)}m` : "Disabled (Default)"}
                                                                    className="w-full px-2 py-1 text-sm bg-background border border-input rounded focus:ring-1 focus:ring-primary"
                                                                />
                                                            </div>

                                                            <div className="flex-1 md:w-40">
                                                                <label className="text-[10px] uppercase text-muted-foreground font-semibold mb-0.5 block" title="Do not send error events for these exit codes">Ignore Exit Code(s)</label>
                                                                <input
                                                                    type="text"
                                                                    value={job.ignoreCodes}
                                                                    onChange={(e) => handleJobChange(job.originalIndex, 'ignoreCodes', e.target.value)}
                                                                    placeholder="None (Default)"
                                                                    className="w-full px-2 py-1 text-sm bg-background border border-input rounded focus:ring-1 focus:ring-primary"
                                                                />
                                                            </div>

                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteJob(job.originalIndex)}
                                                                className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors mt-4 md:mt-0"
                                                                title="Remove configuration"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}

                                            {!isAddingJob && (
                                                <button
                                                    type="button"
                                                    onClick={() => setIsAddingJob(true)}
                                                    className="w-full py-3 border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary hover:border-primary/50 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 mt-4"
                                                >
                                                    <Plus className="w-4 h-4" /> Add Configuration for Undiscovered Job
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
