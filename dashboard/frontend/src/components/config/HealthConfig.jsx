import React from 'react';
import { Activity, Clock } from 'lucide-react';

export default function HealthConfig({ config, setConfig, lastOfflineTimeout, setLastOfflineTimeout }) {
    const handleThresholdChange = (key, value) => {
        setConfig(prev => ({
            ...prev,
            thresholds: {
                ...prev.thresholds,
                [key]: parseFloat(value) || 0
            }
        }));
    };

    return (
        <div className="grid gap-8">
            {/* Health Thresholds */}
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                <div className="p-6 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Activity className="w-5 h-5 text-primary" />
                        <h2 className="text-lg font-semibold text-foreground">Health Thresholds Configuration</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-muted-foreground mr-1">
                            {config.health_enabled !== false ? 'Enabled' : 'Disabled'}
                        </label>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={config.health_enabled !== false}
                            onClick={() => setConfig({ ...config, health_enabled: config.health_enabled === false ? true : false })}
                            className={`
                                relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
                                ${config.health_enabled !== false ? 'bg-primary' : 'bg-input'}
                            `}
                        >
                            <span className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${config.health_enabled !== false ? 'translate-x-4' : 'translate-x-0'}`} />
                        </button>
                    </div>
                </div>
                {config.health_enabled !== false && (
                    <div className="p-6 space-y-6 animate-in fade-in slide-in-from-top-1 duration-200">
                        <div className="max-w-xs">
                            <label className="text-sm font-medium text-foreground">Alert Sustain Duration (seconds)</label>
                            <div className="text-xs text-muted-foreground mb-2">Metrics must stay above threshold for this long to trigger an alert. Reduces false positives. Default: 30s.</div>
                            <input
                                type="number"
                                min="0"
                                value={config.health_sustain_duration || 0}
                                onChange={(e) => setConfig({ ...config, health_sustain_duration: parseInt(e.target.value) || 0 })}
                                className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm"
                            />
                        </div>

                        <div className="max-w-xs">
                            <label className="text-sm font-medium text-foreground">Stability Window (seconds)</label>
                            <div className="text-xs text-muted-foreground mb-2">Duration a server must remain healthy before sending a 'Resolved' notification. Prevents flapping. Default: 120s.</div>
                            <input
                                type="number"
                                min="0"
                                value={config.stability_window || 0}
                                onChange={(e) => setConfig({ ...config, stability_window: parseInt(e.target.value) || 0 })}
                                className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm"
                            />
                        </div>

                        <div className="grid gap-6 md:grid-cols-3">
                            {/* CPU */}
                            <div className="space-y-4">
                                <h3 className="font-medium text-sm flex items-center gap-2 text-muted-foreground">
                                    <span className="w-2 h-2 rounded-full bg-blue-500" /> CPU
                                </h3>
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground">Warning (%)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={config.thresholds?.cpu_warning || 0}
                                            onChange={(e) => handleThresholdChange('cpu_warning', e.target.value)}
                                            className="w-full mt-1 px-3 py-2 bg-background border border-input rounded-md text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground">Critical (%)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={config.thresholds?.cpu_critical || 0}
                                            onChange={(e) => handleThresholdChange('cpu_critical', e.target.value)}
                                            className="w-full mt-1 px-3 py-2 bg-background border border-input rounded-md text-sm"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Memory */}
                            <div className="space-y-4">
                                <h3 className="font-medium text-sm flex items-center gap-2 text-muted-foreground">
                                    <span className="w-2 h-2 rounded-full bg-purple-500" /> Memory
                                </h3>
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground">Warning (%)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={config.thresholds?.memory_warning || 0}
                                            onChange={(e) => handleThresholdChange('memory_warning', e.target.value)}
                                            className="w-full mt-1 px-3 py-2 bg-background border border-input rounded-md text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground">Critical (%)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={config.thresholds?.memory_critical || 0}
                                            onChange={(e) => handleThresholdChange('memory_critical', e.target.value)}
                                            className="w-full mt-1 px-3 py-2 bg-background border border-input rounded-md text-sm"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Disk */}
                            <div className="space-y-4">
                                <h3 className="font-medium text-sm flex items-center gap-2 text-muted-foreground">
                                    <span className="w-2 h-2 rounded-full bg-yellow-500" /> Disk
                                </h3>
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground">Warning (%)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={config.thresholds?.disk_warning || 0}
                                            onChange={(e) => handleThresholdChange('disk_warning', e.target.value)}
                                            className="w-full mt-1 px-3 py-2 bg-background border border-input rounded-md text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground">Critical (%)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={config.thresholds?.disk_critical || 0}
                                            onChange={(e) => handleThresholdChange('disk_critical', e.target.value)}
                                            className="w-full mt-1 px-3 py-2 bg-background border border-input rounded-md text-sm"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Offline Settings */}
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                <div className="p-6 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-primary" />
                        <h2 className="text-lg font-semibold text-foreground">Offline Detection</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-muted-foreground mr-1">
                            {config.offline_timeout > 0 ? 'Enabled' : 'Disabled'}
                        </label>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={config.offline_timeout > 0}
                            onClick={() => {
                                const currentValue = config.offline_timeout;
                                if (currentValue > 0) {
                                    setLastOfflineTimeout(currentValue);
                                    setConfig({ ...config, offline_timeout: 0 });
                                } else {
                                    setConfig({ ...config, offline_timeout: lastOfflineTimeout || 60 });
                                }
                            }}
                            className={`
                                relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
                                ${config.offline_timeout > 0 ? 'bg-primary' : 'bg-input'}
                            `}
                        >
                            <span className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${config.offline_timeout > 0 ? 'translate-x-4' : 'translate-x-0'}`} />
                        </button>
                    </div>
                </div>
                {config.offline_timeout > 0 && (
                    <div className="p-6 animate-in fade-in slide-in-from-top-1 duration-200">
                        <div className="max-w-xs">
                            <label className="text-sm font-medium text-foreground">Offline Timeout (minutes)</label>
                            <div className="text-xs text-muted-foreground mb-2">Node considered offline after (default 1 min)</div>
                            <input
                                type="number"
                                min="1"
                                value={Math.round(config.offline_timeout / 60) || 1}
                                onChange={(e) => setConfig({ ...config, offline_timeout: (parseFloat(e.target.value) || 0) * 60 })}
                                className="w-full px-3 py-2 bg-background border border-input rounded-md"
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
