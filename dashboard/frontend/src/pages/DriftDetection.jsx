import React, { useEffect, useState } from 'react';
import api from '../services/api';
import EventLog from '../components/EventLog';
import { FileWarning } from 'lucide-react';

export default function DriftDetection() {
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

            // Filter for only drift events
            const relevantEvents = (eventsRes.data || []).filter(e =>
                e.event_type === 'drift'
            );
            setEvents(relevantEvents);
            setServers(serversRes.data || []);
        } catch (error) {
            console.error('Failed to fetch data:', error);
        } finally {
            setLoading(false);
        }
    };

    const driftCount = events.length;

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <div className="flex items-center justify-between border-b border-border pb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                        <FileWarning className="w-8 h-8 text-primary" />
                        Drift Detection
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Identify and track unauthorized configuration file changes.
                    </p>
                </div>
                <div className="flex gap-4">
                    <div className="bg-amber-50 border border-amber-200 px-4 py-2 rounded-lg flex items-center gap-3">
                        <FileWarning className="w-5 h-5 text-amber-600" />
                        <div className="flex flex-col">
                            <span className="text-xs font-semibold text-amber-600 uppercase">Drift Events</span>
                            <span className="text-xl font-bold text-amber-700 leading-none">{driftCount}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                <div className="p-6">
                    <h2 className="text-lg font-semibold text-foreground mb-6">Drift Events</h2>
                    <EventLog events={events} servers={servers} showTypeFilters={false} />
                </div>
            </div>
        </div>
    );
}
