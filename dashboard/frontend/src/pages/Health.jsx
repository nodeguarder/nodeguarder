import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import EventLog from '../components/EventLog';
import HealthConfig from '../components/config/HealthConfig';
import { Activity, AlertTriangle, CheckCircle2, Save, Monitor, Settings as SettingsIcon } from 'lucide-react';
import { cn } from '../utils/cn';

// Simple deep equality check
const deepEqual = (obj1, obj2) => {
    return JSON.stringify(obj1) === JSON.stringify(obj2);
};

export default function Health() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('monitoring'); // 'monitoring' | 'config'

    // Data state
    const [events, setEvents] = useState([]);
    const [servers, setServers] = useState([]);
    const [loading, setLoading] = useState(true);

    // Config state
    const [config, setConfig] = useState(null);
    const [initialConfig, setInitialConfig] = useState(null);
    const [isDirty, setIsDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [lastOfflineTimeout, setLastOfflineTimeout] = useState(60);

    useEffect(() => {
        fetchData();
        fetchConfig();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, []);

    // Check dirty state
    useEffect(() => {
        if (!initialConfig || !config) return;
        setIsDirty(!deepEqual(initialConfig, config));
    }, [config, initialConfig]);

    const fetchData = async () => {
        try {
            const [eventsRes, serversRes] = await Promise.all([
                api.get('/api/v1/events'),
                api.get('/api/v1/servers')
            ]);

            // Filter out cron and drift events
            const healthEvents = (eventsRes.data || []).filter(e =>
                !['cron', 'drift', 'long_running', 'cron_error', 'custom'].includes(e.event_type)
            );
            setEvents(healthEvents);
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

            // Normalize data for Health
            const normalized = {
                ...data,
                health_enabled: data.health_enabled !== false,
                health_sustain_duration: data.health_sustain_duration !== undefined ? data.health_sustain_duration : 30,
                stability_window: data.stability_window !== undefined ? data.stability_window : 120,
                offline_timeout: data.offline_timeout !== undefined ? data.offline_timeout : 60,
                thresholds: {
                    cpu_warning: data.thresholds?.cpu_warning || 80,
                    cpu_critical: data.thresholds?.cpu_critical || 95,
                    memory_warning: data.thresholds?.memory_warning || 80,
                    memory_critical: data.thresholds?.memory_critical || 95,
                    disk_warning: data.thresholds?.disk_warning || 80,
                    disk_critical: data.thresholds?.disk_critical || 95,
                }
            };

            setConfig(normalized);
            setInitialConfig(normalized);
            if (data.offline_timeout > 0) setLastOfflineTimeout(data.offline_timeout);
        } catch (err) {
            console.error('Failed to fetch config:', err);
            setError('Failed to load configuration');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setError('');
        setSuccess('');

        try {
            // Ensure we send numbers
            const payload = {
                ...config,
                health_sustain_duration: parseInt(config.health_sustain_duration),
                stability_window: parseInt(config.stability_window),
                offline_timeout: parseInt(config.offline_timeout)
            };

            await api.post('/api/v1/config', payload);
            setSuccess('Configuration saved successfully! Agents will update shortly.');
            setInitialConfig(payload);
            setTimeout(() => setSuccess(''), 5000);
        } catch (err) {
            setError(err.message || 'Failed to save configuration');
        } finally {
            setSaving(false);
        }
    };

    const offlineServersCount = servers.filter(s => s.health_status === 'offline').length;

    if (loading && !config) {
        return <div className="p-8 flex items-center justify-center">Loading Node Health...</div>;
    }

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                        <Activity className="w-8 h-8 text-primary" />
                        Node Health
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Live system status and active health alerts.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {/* Tab Switcher */}
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

            {/* Notifications */}
            {error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                    <AlertTriangle className="w-4 h-4" />
                    {error}
                </div>
            )}
            {success && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm font-medium animate-in fade-in slide-in-from-top-2">
                    {success}
                </div>
            )}

            {/* Main Content */}
            {activeTab === 'monitoring' ? (
                <div className="grid grid-cols-1 gap-6">
                    {/* Quick Stats Card */}
                    {servers.length > 0 && (
                        <div className="bg-card border border-border rounded-xl shadow-sm p-4">
                            <div className="flex items-center gap-4">
                                {offlineServersCount > 0 ? (
                                    <div className="flex items-center gap-4 p-3 bg-rose-50 border border-rose-200 rounded-lg w-full max-w-md">
                                        <AlertTriangle className="w-6 h-6 text-rose-600" />
                                        <div className="flex-1">
                                            <div className="text-xs font-medium text-rose-800 uppercase tracking-wider">Attention Required</div>
                                            <div className="text-lg font-bold text-rose-700">
                                                Nodes Offline: {offlineServersCount}/{servers.length}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => navigate('/nodes')}
                                            className="px-3 py-1.5 bg-white text-rose-700 font-medium text-xs rounded-md border border-rose-200 hover:bg-rose-50 transition-colors"
                                        >
                                            View Nodes
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg w-full max-w-md">
                                        <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                                        <div>
                                            <div className="text-xs font-medium text-emerald-800 uppercase tracking-wider">All Nodes Operational</div>
                                            <div className="text-sm text-emerald-700 font-medium">All {servers.length} nodes are online and healthy.</div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Events Card */}
                    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden min-h-[500px]">
                        <div className="p-6">
                            <h2 className="text-lg font-semibold text-foreground mb-6 flex items-center gap-2">
                                <Activity className="w-5 h-5 text-primary" />
                                Health Events
                            </h2>
                            <EventLog events={events} servers={servers} showTypeFilters={false} />
                        </div>
                    </div>
                </div>
            ) : (
                <div className="max-w-4xl animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <HealthConfig
                        config={config}
                        setConfig={setConfig}
                        lastOfflineTimeout={lastOfflineTimeout}
                        setLastOfflineTimeout={setLastOfflineTimeout}
                    />
                </div>
            )}
        </div>
    );
}
