import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import EventLog from '../components/EventLog';
import { MetricLineChart } from '../components/Charts';
import { Server, CheckCircle2, AlertTriangle, XCircle, ArrowRight, Clock, FileWarning } from 'lucide-react';
import { cn } from '../utils/cn';

export default function Dashboard() {
    const [servers, setServers] = useState([]);
    const [events, setEvents] = useState([]);
    const [metricsHistory, setMetricsHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState('1h'); // '1h' or '24h'

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000); // Refresh every 30s
        return () => clearInterval(interval);
    }, [timeRange]);

    const fetchData = async () => {
        try {
            const [serversRes, eventsRes] = await Promise.all([
                api.get('/api/v1/servers'),
                api.get('/api/v1/events').catch(() => ({ data: [] })),
            ]);
            setServers(serversRes.data || []);
            setEvents(eventsRes.data || []);

            if (serversRes.data && serversRes.data.length > 0) {
                const metricsPromises = serversRes.data.map(server =>
                    api.get(`/api/v1/servers/${server.id}/metrics`)
                        .catch(() => ({ data: [] }))
                );
                const metricsResults = await Promise.all(metricsPromises);
                setMetricsHistory(processMetrics(metricsResults, timeRange));
            }
        } catch (error) {
            console.error('Failed to fetch data:', error);
        } finally {
            setLoading(false);
        }
    };

    const processMetrics = (metricsResults, range) => {
        const allMetrics = metricsResults.flatMap(result => result.data || []);
        const groupedByTime = {};
        const now = Math.floor(Date.now() / 1000);

        // Define timeframe constants
        const is24h = range === '24h';
        const windowSeconds = is24h ? 86400 : 3600; // 24h or 1h
        const bucketSize = is24h ? 3600 : 60; // 1 hour or 1 minute buckets
        const cutoff = now - windowSeconds;

        allMetrics.forEach(metric => {
            // Filter old data
            if (metric.timestamp < cutoff) return;

            // Bucket timestamp
            // Floor to nearest bucket size
            const bucketTimestamp = Math.floor(metric.timestamp / bucketSize) * bucketSize;

            if (!groupedByTime[bucketTimestamp]) {
                groupedByTime[bucketTimestamp] = {
                    timestamp: bucketTimestamp,
                    cpus: [],
                    mems: [],
                    disks: [],
                };
            }

            groupedByTime[bucketTimestamp].cpus.push(metric.cpu_percent);

            const memPercent = metric.mem_total_mb > 0
                ? (metric.mem_used_mb / metric.mem_total_mb) * 100
                : 0;
            groupedByTime[bucketTimestamp].mems.push(memPercent);

            const diskPercent = metric.disk_total_gb > 0
                ? (metric.disk_used_gb / metric.disk_total_gb) * 100
                : 0;
            groupedByTime[bucketTimestamp].disks.push(diskPercent);
        });

        return Object.values(groupedByTime)
            .sort((a, b) => a.timestamp - b.timestamp)
            .map(item => ({
                timestamp: item.timestamp,
                cpu_avg: item.cpus.length ? parseFloat((item.cpus.reduce((a, b) => a + b, 0) / item.cpus.length).toFixed(2)) : 0,
                memory_avg: item.mems.length ? parseFloat((item.mems.reduce((a, b) => a + b, 0) / item.mems.length).toFixed(2)) : 0,
                disk_avg: item.disks.length ? parseFloat((item.disks.reduce((a, b) => a + b, 0) / item.disks.length).toFixed(2)) : 0,
            }));
    };

    const stats = {
        total: servers.length,
        // Critical count now reflects Health Events to match Health Page
        critical: events.filter(e => !['cron', 'drift', 'long_running', 'cron_error', 'custom'].includes(e.event_type)).length,
        // Count drift events to match Drift Detection page
        drift: events.filter(e => e.event_type === 'drift').length,
        // Count recent cron errors
        cron: events.filter(e => ['cron', 'long_running', 'cron_error'].includes(e.event_type) && (e.severity === 'error' || e.severity === 'critical')).length,
    };

    const StatCard = ({ title, value, icon: Icon, colorClass, link, subtext }) => (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200 group flex flex-col">
            <div className="flex items-start justify-between mb-1">
                <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
                <div className={cn("p-2 rounded-lg bg-opacity-10", colorClass.replace('text-', 'bg-').replace('text-', 'text-'))}>
                    <Icon className={cn("w-5 h-5 opacity-80", colorClass)} />
                </div>
            </div>
            <div className="flex items-end justify-between mt-auto">
                <div className="flex flex-col">
                    <div className={cn("text-3xl font-bold tracking-tight", colorClass)}>
                        {value}
                    </div>
                    {subtext && (
                        <span className="text-xs text-muted-foreground mt-1">{subtext}</span>
                    )}
                </div>
                {link && (
                    <Link to={link} className="inline-flex items-center text-xs font-medium text-muted-foreground hover:text-primary transition-colors mb-1">
                        View details <ArrowRight className="w-3 h-3 ml-1 group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                )}
            </div>
        </div>
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[500px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <div className="flex items-baseline justify-between border-b border-border pb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Total Nodes"
                    value={stats.total}
                    icon={Server}
                    colorClass="text-blue-600"
                    link="/nodes"
                />
                <StatCard
                    title="Health Issues"
                    value={stats.critical}
                    icon={XCircle}
                    colorClass={stats.critical > 0 ? "text-rose-600" : "text-emerald-600"}
                    link="/health"
                />
                <StatCard
                    title="Drift Detected"
                    value={stats.drift}
                    icon={AlertTriangle} // Using AlertTriangle for drift as FileWarning isn't imported yet
                    colorClass={stats.drift > 0 ? "text-amber-500" : "text-emerald-600"}
                    link="/drift-detection"
                />
                <StatCard
                    title="Cron Failures"
                    value={stats.cron}
                    icon={CheckCircle2} // Placeholder, will fix import below
                    colorClass={stats.cron > 0 ? "text-orange-600" : "text-emerald-600"}
                    link="/cron-jobs"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Charts Area */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-end">
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

                    <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                        <MetricLineChart
                            data={metricsHistory}
                            title="CPU Load (Average across nodes)"
                            metrics={[{ key: 'cpu_avg', name: 'Avg CPU', color: '#3b82f6' }]}
                            height={300}
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                            <MetricLineChart
                                data={metricsHistory}
                                title="Memory Usage (Average across nodes)"
                                metrics={[{ key: 'memory_avg', name: 'Avg Mem', color: '#10b981' }]}
                                height={200}
                            />
                        </div>
                        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                            <MetricLineChart
                                data={metricsHistory}
                                title="Disk Usage (Average across nodes)"
                                metrics={[{ key: 'disk_avg', name: 'Avg Disk', color: '#f59e0b' }]}
                                height={200}
                            />
                        </div>
                    </div>
                </div>

                {/* Sidebar area (Events) */}
                <div className="space-y-6">
                    <div className="bg-card border border-border rounded-xl shadow-sm h-full flex flex-col">
                        <div className="p-6 border-b border-border">
                            <h2 className="text-lg font-semibold text-foreground">Recent Events</h2>
                        </div>
                        <div className="p-2 flex-1 overflow-hidden">
                            <EventLog events={events} servers={servers} limit={5} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
