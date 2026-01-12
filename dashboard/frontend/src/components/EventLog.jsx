import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatRelativeTime, formatDate } from '../utils/formatters';
import { AlertCircle, FileWarning, Clock, Info, CheckCircle2, XCircle, Activity as ActivityIconBase, Trash2, AlertTriangle } from 'lucide-react';
import { cn } from '../utils/cn';

export default function EventLog({ events = [], servers = [], limit, showFilters, showTypeFilters = true, showServerFilter = true, onDelete }) {
    const [filterType, setFilterType] = useState('all');
    const [selectedServer, setSelectedServer] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const navigate = useNavigate();

    // Default to showing filters only if not limited, unless explicitly controlled
    const shouldShowFilters = showFilters !== undefined ? showFilters : !limit;

    const displayEvents = limit
        ? events.slice(0, limit)
        : events.filter(e => {
            const matchesType = filterType === 'all' ||
                (filterType === 'cron' && ['cron', 'cron_error', 'long_running'].includes(e.event_type)) ||
                e.event_type === filterType;
            const matchesServer = selectedServer === 'all' || e.server_id === selectedServer;
            const matchesSearch = searchTerm === '' ||
                (e.message && e.message.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (e.event_type && e.event_type.toLowerCase().includes(searchTerm.toLowerCase()));
            return matchesType && matchesServer && matchesSearch;
        });

    const getEventIcon = (type) => {
        switch (type) {
            case 'drift': return FileWarning;
            case 'cron':
            case 'long_running': return Clock;
            case 'cron_error': return AlertTriangle;
            case 'health': return ActivityIconBase;
            case 'agent': return Info;
            default: return AlertCircle;
        }
    };

    const getEventStyles = (type) => {
        switch (type) {
            case 'drift':
                return "bg-amber-50 text-amber-700 border-amber-200";
            case 'cron':
                return "bg-blue-50 text-blue-700 border-blue-200";
            case 'long_running':
                return "bg-amber-50 text-amber-700 border-amber-200";
            case 'cron_error':
                return "bg-rose-50 text-rose-700 border-rose-200";
            case 'health':
                return "bg-emerald-50 text-emerald-700 border-emerald-200";
            default:
                return "bg-slate-50 text-slate-700 border-slate-200";
        }
    };

    const getEventLink = (type) => {
        switch (type) {
            case 'drift': return '/drift-detection';
            case 'cron':
            case 'long_running':
            case 'cron_error': return '/cron-jobs';
            case 'health': return '/health';
            default: return '/health';
        }
    };

    const FilterButton = ({ type, label }) => (
        <button
            onClick={() => setFilterType(type)}
            className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors border",
                filterType === type
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-white text-muted-foreground border-border hover:bg-muted hover:text-foreground"
            )}
        >
            {label}
        </button>
    );

    return (
        <div className="flex flex-col h-full">
            {shouldShowFilters && (
                <div className="flex flex-col gap-4 mb-6">
                    <div className="flex flex-wrap gap-4 items-center justify-between">
                        {showTypeFilters && (
                            <div className="flex gap-2">
                                <FilterButton type="all" label="All Types" />
                                <FilterButton type="drift" label="Drift" />
                                <FilterButton type="cron" label="Cron" />
                                <FilterButton type="health" label="Health" />
                            </div>
                        )}

                        <div className={cn(
                            "flex gap-3 flex-1 max-w-xl",
                            showTypeFilters ? "justify-end" : "justify-start"
                        )}>
                            {showServerFilter && (
                                <select
                                    value={selectedServer}
                                    onChange={(e) => setSelectedServer(e.target.value)}
                                    className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary w-40"
                                >
                                    <option value="all">All Nodes</option>
                                    {servers.map(s => (
                                        <option key={s.id} value={s.id}>{s.hostname}</option>
                                    ))}
                                </select>
                            )}

                            <input
                                type="text"
                                placeholder="Search events..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                        </div>
                    </div>
                </div>
            )}

            <div className="space-y-0 divide-y divide-border">
                {displayEvents.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground text-sm">
                        {filterType === 'all' && selectedServer === 'all' && searchTerm === ''
                            ? 'No recent events recorded'
                            : 'No events found matching filters'}
                    </div>
                ) : (
                    displayEvents.map((event) => {
                        const Icon = getEventIcon(event.event_type);
                        const styleClass = getEventStyles(event.event_type);
                        const server = servers.find(s => s.id === event.server_id);

                        return (
                            <div
                                key={event.id}
                                onClick={() => limit && navigate(getEventLink(event.event_type))}
                                className={cn(
                                    "group flex items-start gap-4 py-4 transition-colors px-1",
                                    limit ? "cursor-pointer hover:bg-muted/50" : "hover:bg-muted/30"
                                )}
                            >
                                <div className={cn(
                                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border shadow-sm mt-0.5",
                                    styleClass
                                )}>
                                    <Icon className="w-4 h-4" />
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-semibold text-foreground">
                                                {event.event_type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')} Event
                                            </span>
                                            {server && (
                                                <span className="text-xs text-muted-foreground">
                                                    on <Link
                                                        to={`/servers/${server.id}`}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="font-medium hover:underline text-foreground"
                                                    >
                                                        {server.hostname}
                                                    </Link>
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground whitespace-nowrap font-medium">
                                                {formatRelativeTime(event.timestamp)}
                                                <span className="mx-1.5 opacity-40">•</span>
                                                {formatDate(event.timestamp)}
                                            </span>
                                            {onDelete && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onDelete(event);
                                                    }}
                                                    className="p-1 text-muted-foreground hover:text-rose-600 hover:bg-rose-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                                    title="Delete Event"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                                        {event.message}
                                    </p>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
