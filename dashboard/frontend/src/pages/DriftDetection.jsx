import React, { useEffect, useState } from 'react';
import api from '../services/api';
import EventLog from '../components/EventLog';
import DriftConfig from '../components/config/DriftConfig';
import { FileWarning, Save, Monitor, Settings as SettingsIcon, AlertTriangle } from 'lucide-react';
import { cn } from '../utils/cn';

// Simple deep equality check
const deepEqual = (obj1, obj2) => {
    return JSON.stringify(obj1) === JSON.stringify(obj2);
};

export default function DriftDetection() {
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

    // Local drift config state extracted from Configuration.jsx
    const [driftText, setDriftText] = useState('');
    const [driftPathsText, setDriftPathsText] = useState('');
    const [isDriftEnabled, setIsDriftEnabled] = useState(true);

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

            // Filter for only drift events
            const relevantEvents = (eventsRes.data || []).filter(e =>
                e.event_type === 'drift'
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

            setDriftText(data.drift_ignore ? data.drift_ignore.join('\n') : '');
            setDriftPathsText(data.drift_paths ? data.drift_paths.join('\n') : '');
            setIsDriftEnabled(data.drift_paths && data.drift_paths.length > 0);

            // Initial payload for dirty tracking
            const initial = calculatePayload(data, data.drift_ignore || [], (data.drift_paths && data.drift_paths.length > 0) ? data.drift_paths : []);
            setInitialPayload(initial);
        } catch (err) {
            console.error('Failed to fetch config:', err);
            setError('Failed to load configuration');
        } finally {
            setLoading(false);
        }
    };

    const calculatePayload = (baseConfig, driftIgnore, driftPaths) => {
        return {
            ...baseConfig,
            drift_ignore: driftIgnore,
            drift_paths: driftPaths,
            drift_interval: baseConfig.drift_interval !== undefined ? parseInt(baseConfig.drift_interval) : 300
        };
    };

    // Check dirty state
    useEffect(() => {
        if (!initialPayload || !config) return;

        const currentIgnore = driftText.split('\n').map(s => s.trim()).filter(s => s);
        const currentPaths = isDriftEnabled ? driftPathsText.split('\n').map(s => s.trim()).filter(s => s) : [];

        const current = calculatePayload(config, currentIgnore, currentPaths);
        setIsDirty(!deepEqual(initialPayload, current));
    }, [config, driftText, driftPathsText, isDriftEnabled, initialPayload]);

    const handleSave = async () => {
        setSaving(true);
        setError('');
        setSuccess('');

        try {
            const currentIgnore = driftText.split('\n').map(s => s.trim()).filter(s => s);
            const currentPaths = isDriftEnabled ? driftPathsText.split('\n').map(s => s.trim()).filter(s => s) : [];

            const payload = calculatePayload(config, currentIgnore, currentPaths);
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
        return <div className="p-8 flex items-center justify-center">Loading Drift Detection...</div>;
    }

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                        <FileWarning className="w-8 h-8 text-primary" />
                        Drift Detection
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Identify and track unauthorized configuration file changes.
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
                            <FileWarning className="w-5 h-5 text-primary" />
                            Drift Events
                        </h2>
                        <EventLog events={events} servers={servers} showTypeFilters={false} />
                    </div>
                </div>
            ) : (
                <div className="max-w-4xl animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <DriftConfig
                        config={config}
                        setConfig={setConfig}
                        isDriftEnabled={isDriftEnabled}
                        setIsDriftEnabled={setIsDriftEnabled}
                        driftPathsText={driftPathsText}
                        setDriftPathsText={setDriftPathsText}
                        driftText={driftText}
                        setDriftText={setDriftText}
                    />
                </div>
            )}
        </div>
    );
}
