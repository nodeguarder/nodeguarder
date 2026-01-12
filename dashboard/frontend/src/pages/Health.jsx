import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import EventLog from '../components/EventLog';
import { Activity, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '../utils/cn';

export default function Health() {
    const navigate = useNavigate();
    const [events, setEvents] = useState([]);
    const [servers, setServers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, []);

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
            setLoading(false);
        }
    };

    const offlineServers = servers.filter(s => s.health_status === 'offline').length;

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <div className="flex items-center justify-between border-b border-border pb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                        <Activity className="w-8 h-8 text-primary" />
                        Node Health
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Live system status and active health alerts.
                    </p>
                </div>
                <div className="flex gap-4">
                    <div className="bg-rose-50 border border-rose-200 px-4 py-2 rounded-lg flex items-center gap-3">
                        <Activity className="w-5 h-5 text-rose-600" />
                        <div className="flex flex-col">
                            <span className="text-xs font-semibold text-rose-600 uppercase">Health Events</span>
                            <span className="text-xl font-bold text-rose-700 leading-none">{events.length}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
                {/* System Status Card */}
                {servers.length > 0 && (
                    <div className="bg-card border border-border rounded-xl shadow-sm p-4">
                        <div className="flex items-center gap-4">
                            {offlineServers > 0 ? (
                                <div className="flex items-center gap-4 p-3 bg-rose-50 border border-rose-200 rounded-lg w-full max-w-md">
                                    <AlertTriangle className="w-6 h-6 text-rose-600" />
                                    <div className="flex-1">
                                        <div className="text-xs font-medium text-rose-800">Attention Required</div>
                                        <div className="text-lg font-bold text-rose-700">
                                            Nodes Offline: {offlineServers}/{servers.length}
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
                                        <div className="text-xs font-medium text-emerald-800">All Nodes Operational</div>
                                        <div className="text-sm text-emerald-700">All {servers.length} nodes are online and healthy.</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                    <div className="p-6">
                        <h2 className="text-lg font-semibold text-foreground mb-6">Health Events</h2>
                        <EventLog events={events} servers={servers} showTypeFilters={false} />
                    </div>
                </div>
            </div>
        </div >
    );
}
