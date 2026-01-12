import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import StatusBadge from '../components/StatusBadge';
import EventLog from '../components/EventLog';
import { MetricLineChart, HealthMetricCard } from '../components/Charts';
import { formatRelativeTime, formatDate } from '../utils/formatters';
import { ArrowLeft, Trash2, Cpu, HardDrive, Zap, Info, Clock, AlertTriangle, CheckCircle2, AlertCircle, XCircle, FileText, Download } from 'lucide-react';
import ConfirmationModal from '../components/ConfirmationModal';
import { cn } from '../utils/cn';

export default function ServerDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [server, setServer] = useState(null);
    const [events, setEvents] = useState([]);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [uninstallModalOpen, setUninstallModalOpen] = useState(false);
    const [clearEventsModalOpen, setClearEventsModalOpen] = useState(false);
    const [allMetrics, setAllMetrics] = useState([]); // Store full 24h raw data
    const [metrics, setMetrics] = useState([]); // Store processed/filtered data for charts
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [timeRange, setTimeRange] = useState('1h'); // '1h' or '24h'

    useEffect(() => {
        fetchServerData();
        const interval = setInterval(fetchServerData, 10000);
        return () => clearInterval(interval);
    }, [id]);

    useEffect(() => {
        if (allMetrics.length > 0) {
            setMetrics(processMetrics(allMetrics, timeRange));
        }
    }, [timeRange, allMetrics]);

    const processMetrics = (rawMetrics, range) => {
        const groupedByTime = {};
        const now = Math.floor(Date.now() / 1000);

        // Define timeframe constants
        const is24h = range === '24h';
        const windowSeconds = is24h ? 86400 : 3600; // 24h or 1h
        const bucketSize = is24h ? 3600 : 60; // 1 hour or 1 minute buckets
        const cutoff = now - windowSeconds;

        rawMetrics.forEach(metric => {
            // Filter old data
            if (metric.timestamp < cutoff) return;

            // Bucket timestamp
            const bucketTimestamp = Math.floor(metric.timestamp / bucketSize) * bucketSize;

            if (!groupedByTime[bucketTimestamp]) {
                groupedByTime[bucketTimestamp] = {
                    timestamp: bucketTimestamp,
                    cpus: [],
                    mems: [],
                    disks: [],
                };
            }

            groupedByTime[bucketTimestamp].cpus.push(metric.cpu_percent || 0);
            groupedByTime[bucketTimestamp].mems.push(metric.memory_percent || 0);
            groupedByTime[bucketTimestamp].disks.push(metric.disk_percent || 0);
        });

        return Object.values(groupedByTime)
            .sort((a, b) => a.timestamp - b.timestamp)
            .map(item => ({
                timestamp: item.timestamp,
                cpu_percent: item.cpus.length ? (item.cpus.reduce((a, b) => a + b, 0) / item.cpus.length) : 0,
                memory_percent: item.mems.length ? (item.mems.reduce((a, b) => a + b, 0) / item.mems.length) : 0,
                disk_percent: item.disks.length ? (item.disks.reduce((a, b) => a + b, 0) / item.disks.length) : 0,
            }));
    };

    const fetchServerData = async () => {
        try {
            const [serverRes, eventsRes, metricsRes] = await Promise.all([
                api.get(`/api/v1/servers/${id}`),
                api.get(`/api/v1/servers/${id}/events`),
                api.get(`/api/v1/servers/${id}/metrics`),
            ]);

            setServer(serverRes.data);
            setEvents(eventsRes.data || []);

            const processedRaw = (metricsRes.data || []).map(m => ({
                ...m,
                cpu_percent: m.cpu_percent || 0,
                memory_percent: m.mem_total_mb > 0
                    ? (m.mem_used_mb / m.mem_total_mb) * 100
                    : 0,
                disk_percent: m.disk_total_gb > 0
                    ? (m.disk_used_gb / m.disk_total_gb) * 100
                    : 0,
            }));

            setAllMetrics(processedRaw);
            setError('');
        } catch (err) {
            setError('Failed to load server details');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = () => {
        setDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        try {
            await api.delete(`/api/v1/servers/${id}`);
            navigate('/');
        } catch (err) {
            setError('Failed to delete server');
            setDeleteModalOpen(false);
        }
    };

    const handleClearEvents = async () => {
        try {
            await api.delete(`/api/v1/servers/${id}/events`);
            setEvents([]); // Optimistic update
            setClearEventsModalOpen(false);
        } catch (err) {
            setError('Failed to clear event history');
            setClearEventsModalOpen(false);
        }
    };

    const handleRequestLogs = async () => {
        try {
            await api.post(`/api/v1/servers/${id}/logs/request`);
            // Optimistic update
            setServer(prev => ({
                ...prev,
                log_request_pending: true,
                log_request_time: Math.floor(Date.now() / 1000)
            }));
        } catch (err) {
            setError('Failed to request logs');
        }
    };

    const handleUninstall = async () => {
        try {
            await api.post(`/api/v1/servers/${id}/uninstall`);
            setUninstallModalOpen(false);
            // Optionally setting a flag or notifying user
            alert("Uninstall command sent to agent. The agent will self-destruct shortly.");
        } catch (err) {
            setError('Failed to schedule uninstall');
            setUninstallModalOpen(false);
        }
    };

    const handleDeleteEvent = async (event) => {
        if (!window.confirm("Delete this event?")) return;

        try {
            await api.delete(`/api/v1/events/${event.id}`);
            // Optimistic update
            setEvents(prev => prev.filter(e => e.id !== event.id));
        } catch (err) {
            console.error("Failed to delete event:", err);
            // Optionally set error toast
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (!server) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <div className="text-destructive font-semibold">Server not found</div>
                <button onClick={() => navigate('/')} className="text-primary hover:underline">
                    Return to Dashboard
                </button>
            </div>
        );
    }

    // Use allMetrics (descending raw data) for current snapshot. Index 0 is latest.
    const latestMetrics = allMetrics.length > 0 ? allMetrics[0] : null;

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            {error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm">
                    {error}
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col gap-6 border-b border-border pb-6">
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => navigate('/')}
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
                    >
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                        Back to Dashboard
                    </button>
                    <button
                        onClick={handleDelete}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                        Forget Node
                    </button>
                </div>

                <div className="flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-4 mb-2">
                            <h1 className="text-3xl font-bold tracking-tight text-foreground">{server.hostname}</h1>
                        </div>
                        <p className="text-muted-foreground font-mono text-sm">{server.id}</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Content */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Current Metrics Cards */}
                    {latestMetrics && (
                        <div>
                            <h2 className="text-lg font-semibold text-foreground mb-4">Current Load</h2>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <HealthMetricCard
                                    label="CPU Usage"
                                    value={latestMetrics.cpu_percent?.toFixed(1) || '0'}
                                    unit="%"
                                    threshold80={80}
                                    threshold95={95}
                                />
                                <HealthMetricCard
                                    label="Memory Usage"
                                    value={latestMetrics.memory_percent?.toFixed(1) || '0'}
                                    unit="%"
                                    threshold80={80}
                                    threshold95={95}
                                />
                                <HealthMetricCard
                                    label="Disk Usage"
                                    value={latestMetrics.disk_percent?.toFixed(1) || '0'}
                                    unit="%"
                                    threshold80={80}
                                    threshold95={95}
                                />
                            </div>
                        </div>
                    )}

                    {/* Charts */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-foreground">Performance Trends</h2>
                            <div className="bg-muted p-1 rounded-lg inline-flex">
                                <button
                                    onClick={() => setTimeRange('1h')}
                                    className={cn(
                                        "px-3 py-1 text-xs font-medium rounded-md transition-all",
                                        timeRange === '1h'
                                            ? "bg-background text-foreground shadow-sm"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    Last 1 Hour
                                </button>
                                <button
                                    onClick={() => setTimeRange('24h')}
                                    className={cn(
                                        "px-3 py-1 text-xs font-medium rounded-md transition-all",
                                        timeRange === '24h'
                                            ? "bg-background text-foreground shadow-sm"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    Last 24 Hours
                                </button>
                            </div>
                        </div>
                        <div className="space-y-6">
                            <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                                <MetricLineChart
                                    data={metrics}
                                    title="CPU Usage"
                                    metrics={[{ key: 'cpu_percent', name: 'CPU (%)', color: '#3b82f6' }]}
                                    height={250}
                                />
                            </div>
                            <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                                <MetricLineChart
                                    data={metrics}
                                    title="Memory Usage"
                                    metrics={[{ key: 'memory_percent', name: 'Memory (%)', color: '#10b981' }]}
                                    height={250}
                                />
                            </div>
                            <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                                <MetricLineChart
                                    data={metrics}
                                    title="Disk Usage"
                                    metrics={[{ key: 'disk_percent', name: 'Disk (%)', color: '#f59e0b' }]}
                                    height={250}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Events Card */}
                    <div className="bg-card border border-border rounded-xl shadow-sm flex flex-col">
                        <div className="p-6 border-b border-border flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-foreground">Event History on node</h2>
                            {events.length > 0 && (
                                <button
                                    onClick={() => setClearEventsModalOpen(true)}
                                    className="p-1.5 text-muted-foreground hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                                    title="Clear Event History"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        <div className="p-2 flex-1 overflow-y-auto">
                            <EventLog
                                events={events}
                                showServerFilter={false}
                                onDelete={handleDeleteEvent}
                            />
                        </div>
                    </div>
                </div>

                {/* Sidebar Content */}
                <div className="space-y-8">
                    {/* Info Card */}
                    <div className="bg-card border border-border rounded-xl shadow-sm p-6 space-y-6">
                        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                            <Info className="w-5 h-5 text-muted-foreground" />
                            System Details
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <div className="text-xs font-medium text-muted-foreground uppercase mb-1">Operating System</div>
                                <div className="text-sm font-medium">{server.os_name} {server.os_version}</div>
                            </div>
                            <div>
                                <div className="text-xs font-medium text-muted-foreground uppercase mb-1">Agent Version</div>
                                <div className="text-sm font-medium">{server.agent_version || 'Unknown'}</div>
                            </div>
                            <div>
                                <div className="text-xs font-medium text-muted-foreground uppercase mb-1">Last Seen</div>
                                <div className="text-sm font-medium flex items-center gap-2">
                                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                                    {formatRelativeTime(server.last_seen)}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs font-medium text-muted-foreground uppercase mb-1">First Detected</div>
                                <div className="text-sm font-medium">{formatDate(server.first_seen)}</div>
                            </div>
                            <div className="pt-4 border-t border-border">
                                <div className="text-xs font-medium text-muted-foreground uppercase mb-1">Drift Status</div>
                                <div className="text-sm font-medium">
                                    {server.drift_changed ? (
                                        <span className="text-amber-600 flex items-center gap-2">
                                            <AlertTriangle className="w-4 h-4" />
                                            Changes Detected
                                        </span>
                                    ) : (
                                        <span className="text-emerald-600 flex items-center gap-2">
                                            <CheckCircle2 className="w-4 h-4" />
                                            Configuration Synced
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="pt-4 border-t border-border">
                                <div className="text-xs font-medium text-muted-foreground uppercase mb-1">Health Status</div>
                                <div className="text-sm font-medium">
                                    {server.health_status === 'healthy' && (
                                        <span className="text-emerald-600 flex items-center gap-2">
                                            <CheckCircle2 className="w-4 h-4" />
                                            System Healthy
                                        </span>
                                    )}
                                    {server.health_status === 'warning' && (
                                        <span className="text-amber-600 flex items-center gap-2">
                                            <AlertTriangle className="w-4 h-4" />
                                            Warning State
                                        </span>
                                    )}
                                    {server.health_status === 'critical' && (
                                        <span className="text-rose-600 flex items-center gap-2">
                                            <AlertCircle className="w-4 h-4" />
                                            Critical State
                                        </span>
                                    )}
                                    {(server.health_status === 'offline' || server.health_status === 'unknown') && (
                                        <span className="text-rose-600 flex items-center gap-2">
                                            <XCircle className="w-4 h-4" />
                                            System Offline
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="pt-4 border-t border-border">
                                <div className="text-xs font-medium text-muted-foreground uppercase mb-1">Cron Status</div>
                                <div className="text-sm font-medium">
                                    {events.some(e => ['cron', 'long_running', 'cron_error'].includes(e.event_type) && (e.severity === 'error' || e.severity === 'critical')) ? (
                                        <span className="text-rose-600 flex items-center gap-2">
                                            <AlertCircle className="w-4 h-4" />
                                            Errors Detected
                                        </span>
                                    ) : (
                                        <span className="text-emerald-600 flex items-center gap-2">
                                            <CheckCircle2 className="w-4 h-4" />
                                            Jobs Operational
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="pt-4 border-t border-border">
                                <div className="text-xs font-medium text-muted-foreground uppercase mb-2">Agent Logs</div>
                                <div className="flex flex-col gap-2">
                                    {server.log_request_pending ? (
                                        (Math.floor(Date.now() / 1000) - server.log_request_time) > 300 ? (
                                            <div className="flex flex-col gap-2">
                                                <div className="flex items-center gap-2 text-sm text-rose-600 bg-rose-50 px-3 py-2 rounded-md border border-rose-200">
                                                    <AlertCircle className="w-4 h-4" />
                                                    Request Timed Out
                                                </div>
                                                <button
                                                    onClick={handleRequestLogs}
                                                    className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-md transition-colors w-full"
                                                >
                                                    <FileText className="w-4 h-4" />
                                                    Retry Collection
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-md border border-amber-200">
                                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-amber-600"></div>
                                                Collection Pending...
                                            </div>
                                        )
                                    ) : (
                                        <button
                                            onClick={handleRequestLogs}
                                            className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-md transition-colors w-full"
                                        >
                                            <FileText className="w-4 h-4" />
                                            Collect Agent Logs
                                        </button>
                                    )}

                                    {server.log_file_path && (
                                        <button
                                            onClick={async () => {
                                                try {
                                                    const response = await api.get(`/api/v1/servers/${id}/logs/download`, {
                                                        responseType: 'blob'
                                                    });
                                                    const url = window.URL.createObjectURL(new Blob([response.data]));
                                                    const link = document.createElement('a');
                                                    link.href = url;
                                                    link.setAttribute('download', `agent-logs-${id}-${server.log_file_time}.zip`);
                                                    document.body.appendChild(link);
                                                    link.click();
                                                    link.remove();
                                                } catch (err) {
                                                    console.error('Failed to download logs:', err);
                                                }
                                            }}
                                            className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors w-full"
                                        >
                                            <Download className="w-4 h-4" />
                                            Download Logs ({formatRelativeTime(server.log_file_time)})
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="pt-4 border-t border-border">
                                <div className="text-xs font-medium text-muted-foreground uppercase mb-2">Danger Zone</div>
                                {server.pending_uninstall ? (
                                    <div className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-md w-full">
                                        <Clock className="w-4 h-4 animate-pulse" />
                                        Uninstall Pending...
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setUninstallModalOpen(true)}
                                        className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition-colors w-full"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        Uninstall Agent
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <ConfirmationModal
                isOpen={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Forget Node?"
                message="Are you sure? Forget and delete all associated data to this node. The node will re-register automatically if online."
                confirmText="Forget Node"
                isDangerous={true}
            />

            <ConfirmationModal
                isOpen={clearEventsModalOpen}
                onClose={() => setClearEventsModalOpen(false)}
                onConfirm={handleClearEvents}
                title="Clear Event History?"
                message="Are you sure you want to delete all historical events for this node? This action cannot be undone."
                confirmText="Clear History"
                isDangerous={true}
            />

            <ConfirmationModal
                isOpen={uninstallModalOpen}
                onClose={() => setUninstallModalOpen(false)}
                onConfirm={handleUninstall}
                title="Uninstall Agent?"
                message="Are you sure you want to uninstall the agent from this server? This action will stop the service, remove all agent files (including logs), and cannot be undone."
                confirmText="Uninstall Agent"
                isDangerous={true}
            />
        </div>
    );
}
