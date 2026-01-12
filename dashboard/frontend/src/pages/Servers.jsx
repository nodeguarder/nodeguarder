import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import StatusBadge from '../components/StatusBadge';
import EventLog from '../components/EventLog';
import ConfirmationModal from '../components/ConfirmationModal';
import { formatRelativeTime } from '../utils/formatters';
import { Server as ServerIcon, AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';
import { cn } from '../utils/cn';

export default function Servers() {
    const [servers, setServers] = useState([]);
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [serverToDelete, setServerToDelete] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 10000); // Refresh every 10s
        return () => clearInterval(interval);
    }, []);

    const fetchData = async () => {
        try {
            const [serversRes, eventsRes] = await Promise.all([
                api.get('/api/v1/servers'),
                api.get('/api/v1/events').catch(() => ({ data: [] })),
            ]);
            setServers(serversRes.data || []);
            setEvents(eventsRes.data || []);
        } catch (error) {
            console.error('Failed to fetch data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteServer = (e, id) => {
        e.stopPropagation();
        setServerToDelete(id);
        setDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!serverToDelete) return;

        try {
            await api.delete(`/api/v1/servers/${serverToDelete}`);
            setServers(prev => prev.filter(s => s.id !== serverToDelete));
            setDeleteModalOpen(false);
            setServerToDelete(null);
        } catch (error) {
            console.error('Failed to delete server:', error);
            alert('Failed to delete server');
        }
    };

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
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Nodes</h1>
                    <p className="text-sm text-muted-foreground mt-1">Manage and monitor your infrastructure</p>
                </div>
                <div className="flex gap-4">
                    <div className="bg-blue-50 border border-blue-200 px-4 py-2 rounded-lg flex items-center gap-3">
                        <ServerIcon className="w-5 h-5 text-blue-600" />
                        <div className="flex flex-col">
                            <span className="text-xs font-semibold text-blue-600 uppercase">Total Nodes</span>
                            <span className="text-xl font-bold text-blue-700 leading-none">{servers.length}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Servers List */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-muted/50 border-b border-border">
                                    <tr>
                                        <th className="px-6 py-3 font-semibold text-muted-foreground">Server</th>
                                        <th className="px-6 py-3 font-semibold text-muted-foreground">Status</th>
                                        <th className="px-6 py-3 font-semibold text-muted-foreground">OS</th>
                                        <th className="px-6 py-3 font-semibold text-muted-foreground">Last Seen</th>
                                        <th className="px-6 py-3 font-semibold text-muted-foreground w-[50px]"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {servers.length === 0 ? (
                                        <tr>
                                            <td colSpan="5" className="p-4">
                                                <div className="text-center py-12 text-muted-foreground bg-muted/20 rounded-lg border border-dashed border-border">
                                                    No nodes registered yet. Install the agent to get started.
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        servers.map((server) => (
                                            <tr
                                                key={server.id}
                                                onClick={() => navigate(`/servers/${server.id}`)}
                                                className="group cursor-pointer hover:bg-muted/50 transition-colors"
                                            >
                                                <td className="px-6 py-4">
                                                    <div className="font-medium text-foreground group-hover:text-primary transition-colors">
                                                        {server.hostname}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground font-mono mt-0.5">
                                                        {server.id.slice(0, 8)}...
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <StatusBadge status={server.health_status} />
                                                </td>
                                                <td className="px-6 py-4 text-muted-foreground">
                                                    {server.os_name} {server.os_version}
                                                </td>
                                                <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                                                    {formatRelativeTime(server.last_seen)}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <button
                                                        onClick={(e) => handleDeleteServer(e, server.id)}
                                                        className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                                                        title="Forget Node"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
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
                            <EventLog events={events} servers={servers} limit={8} />
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
        </div >
    );
}
