import React, { useEffect, useState } from 'react';
import api from '../services/api';
import EventLog from '../components/EventLog';
import CronConfig from '../components/config/CronConfig';
import { Clock, Save, Monitor, Settings as SettingsIcon, AlertTriangle } from 'lucide-react';
import { cn } from '../utils/cn';

// Simple deep equality check
const deepEqual = (obj1, obj2) => {
    return JSON.stringify(obj1) === JSON.stringify(obj2);
};

export default function CronJobs() {
    const [activeTab, setActiveTab] = useState('monitoring'); // 'monitoring' | 'config'

    // Data state
    const [events, setEvents] = useState([]);
    const [servers, setServers] = useState([]);
    const [loading, setLoading] = useState(true);

    // Config state
    const [config, setConfig] = useState(null);
    const [initialPayload, setInitialPayload] = useState(null);
    const [isDirty, setIsDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Local job config state extracted from Configuration.jsx logic
    const [jobConfigs, setJobConfigs] = useState([]);
    const [newJobCommand, setNewJobCommand] = useState('');
    const [isAddingJob, setIsAddingJob] = useState(false);
    const [lastGlobalTimeout, setLastGlobalTimeout] = useState(300);

    useEffect(() => {
        fetchData();
        fetchConfig();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, []);

    const fetchData = async () => {
        try {
            const [eventsRes, serversRes] = await Promise.all([
                api.get('/api/v1/events'),
                api.get('/api/v1/servers')
            ]);

            // Filter for only cron events
            const relevantEvents = (eventsRes.data || []).filter(e =>
                e.event_type === 'cron' || e.event_type === 'long_running' || e.event_type === 'cron_error'
            );
            setEvents(relevantEvents);
            setServers(serversRes.data || []);
        } catch (error) {
            console.error('Failed to fetch data:', error);
        } finally {
            if (activeTab === 'monitoring') setLoading(false);
        }
    };

    const fetchConfig = async () => {
        try {
            const response = await api.get('/api/v1/config');
            const data = response.data;
            setConfig(data);

            if (data.cron_global_timeout > 0) {
                setLastGlobalTimeout(data.cron_global_timeout);
            }

            // Process discovered and configured jobs exactly like Configuration.jsx
            const discoveredMap = new Map();
            const discoveredCommands = [];

            if (data.discovered_cron_jobs) {
                data.discovered_cron_jobs.forEach(job => {
                    const cmd = typeof job === 'string' ? job : job.Command;
                    discoveredCommands.push(cmd);
                    discoveredMap.set(cmd, typeof job === 'string' ? { isDiscovered: true } : {
                        isDiscovered: true,
                        lastExitCode: job.LastExitCode,
                        lastDuration: job.LastDuration,
                        lastExecTime: job.LastExecTime
                    });
                });
            }

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

            // Calculate initial payload for dirty tracking
            const initial = calculatePayload(data, jobs);
            setInitialPayload(initial);
        } catch (err) {
            console.error('Failed to fetch config:', err);
            setError('Failed to load configuration');
        } finally {
            setLoading(false);
        }
    };

    const calculatePayload = (baseConfig, currentJobs) => {
        const cronTimeouts = {};
        const cronIgnore = {};

        currentJobs.forEach(job => {
            if (job.timeoutMinutes && !isNaN(job.timeoutMinutes) && parseFloat(job.timeoutMinutes) > 0) {
                cronTimeouts[job.command] = Math.round(parseFloat(job.timeoutMinutes) * 60);
            } else if (!job.isDiscovered) {
                cronTimeouts[job.command] = 0;
            }

            if (job.ignoreCodes && job.ignoreCodes.trim()) {
                const codes = job.ignoreCodes.split(',')
                    .map(c => parseInt(c.trim()))
                    .filter(c => !isNaN(c));
                if (codes.length > 0) {
                    cronIgnore[job.command] = codes;
                }
            }
        });

        return {
            ...baseConfig,
            cron_ignore: cronIgnore,
            cron_timeouts: cronTimeouts,
            cron_enabled: baseConfig.cron_enabled !== false,
            cron_global_timeout: baseConfig.cron_global_timeout !== undefined ? parseInt(baseConfig.cron_global_timeout) : 300,
            cron_auto_discover: baseConfig.cron_auto_discover !== false
        };
    };

    // Check dirty state
    useEffect(() => {
        if (!initialPayload || !config) return;
        const current = calculatePayload(config, jobConfigs);
        setIsDirty(!deepEqual(initialPayload, current));
    }, [config, jobConfigs, initialPayload]);

    const handleSave = async () => {
        setSaving(true);
        setError('');
        setSuccess('');

        try {
            const payload = calculatePayload(config, jobConfigs);
            await api.post('/api/v1/config', payload);
            setSuccess('Configuration saved successfully! Agents will update shortly.');
            setInitialPayload(payload);
            setTimeout(() => setSuccess(''), 5000);
        } catch (err) {
            setError(err.message || 'Failed to save configuration');
        } finally {
            setSaving(false);
        }
    };

    if (loading && !config) {
        return <div className="p-8 flex items-center justify-center">Loading Cron Monitor...</div>;
    }

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                        <Clock className="w-8 h-8 text-primary" />
                        Cron Monitor
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Monitor automated cron job executions and detect silent failures.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="bg-muted p-1 rounded-lg flex items-center">
                        <button
                            onClick={() => setActiveTab('monitoring')}
                            className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                                activeTab === 'monitoring' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Monitor className="w-4 h-4" />
                            Monitoring
                        </button>
                        <button
                            onClick={() => setActiveTab('config')}
                            className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                                activeTab === 'config' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <SettingsIcon className="w-4 h-4" />
                            Configuration
                        </button>
                    </div>

                    {activeTab === 'config' && (
                        <button
                            onClick={handleSave}
                            disabled={saving || !isDirty}
                            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Save className="w-4 h-4" />
                            {saving ? 'Saving...' : 'Save & Install Changes'}
                        </button>
                    )}
                </div>
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

            {activeTab === 'monitoring' ? (
                <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden min-h-[500px]">
                    <div className="p-6">
                        <h2 className="text-lg font-semibold text-foreground mb-6 flex items-center gap-2">
                            <Clock className="w-5 h-5 text-primary" />
                            Cron Events
                        </h2>
                        <EventLog events={events} servers={servers} showTypeFilters={false} />
                    </div>
                </div>
            ) : (
                <div className="max-w-4xl animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <CronConfig
                        config={config}
                        setConfig={setConfig}
                        jobConfigs={jobConfigs}
                        setJobConfigs={setJobConfigs}
                        newJobCommand={newJobCommand}
                        setNewJobCommand={setNewJobCommand}
                        isAddingJob={isAddingJob}
                        setIsAddingJob={setIsAddingJob}
                        lastGlobalTimeout={lastGlobalTimeout}
                        setLastGlobalTimeout={setLastGlobalTimeout}
                        error={error}
                        setError={setError}
                    />
                </div>
            )}
        </div>
    );
}
