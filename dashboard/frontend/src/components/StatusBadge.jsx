import React from 'react';
import { cn } from '../utils/cn';

export default function StatusBadge({ status }) {
    const getStatusStyles = (status) => {
        switch (status) {
            case 'healthy':
                return "bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-500/20";
            case 'warning':
                return "bg-amber-50 text-amber-700 border-amber-200 ring-amber-500/20";
            case 'critical':
            case 'offline':
                return "bg-rose-50 text-rose-700 border-rose-200 ring-rose-500/20";
            case 'recovering':
                return "bg-indigo-50 text-indigo-700 border-indigo-200 ring-indigo-500/20";
            default:
                return "bg-slate-50 text-slate-700 border-slate-200 ring-slate-500/20";
        }
    };

    return (
        <span className={cn(
            "inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ring-1 ring-inset border capitalize",
            getStatusStyles(status)
        )}>
            {status || 'Unknown'}
        </span>
    );
}
