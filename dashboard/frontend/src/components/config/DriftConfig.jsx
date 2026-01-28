import React from 'react';
import { FileWarning } from 'lucide-react';

export default function DriftConfig({
    config,
    setConfig,
    isDriftEnabled,
    setIsDriftEnabled,
    driftPathsText,
    setDriftPathsText,
    driftText,
    setDriftText
}) {
    return (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <FileWarning className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-semibold text-foreground">Drift Detection Configuration</h2>
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground mr-1">{isDriftEnabled ? 'Enabled' : 'Disabled'}</label>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={isDriftEnabled}
                        onClick={() => {
                            if (!isDriftEnabled && !driftPathsText.trim()) {
                                setDriftPathsText('/etc'); // Default if empty
                            }
                            setIsDriftEnabled(!isDriftEnabled);
                        }}
                        className={`
                            relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
                            ${isDriftEnabled ? 'bg-primary' : 'bg-input'}
                        `}
                    >
                        <span className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${isDriftEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                </div>
            </div>
            <div className="p-6 space-y-4">
                {isDriftEnabled && (
                    <div className="animate-in fade-in slide-in-from-top-1 duration-200 space-y-4">
                        <div>
                            <label className="text-sm font-medium text-foreground">Drift Monitored Paths</label>
                            <div className="text-xs text-muted-foreground mb-2">Absolute paths to directories to monitor for changes (one per line). Default: /etc</div>
                            <textarea
                                value={driftPathsText}
                                onChange={(e) => setDriftPathsText(e.target.value)}
                                rows={4}
                                className="w-full px-3 py-2 bg-background border border-input rounded-md font-mono text-sm"
                                placeholder="/etc&#10;/var/www/html"
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium text-foreground">Check for drift every (minutes)</label>
                            <div className="text-xs text-muted-foreground mb-2">How often the agent scans for changes. Default: 5 minutes.</div>
                            <input
                                type="number"
                                min="1"
                                value={Math.round((config.drift_interval || 300) / 60)}
                                onChange={(e) => setConfig({ ...config, drift_interval: (parseInt(e.target.value) || 0) * 60 })}
                                className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm max-w-xs"
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium text-foreground">Wildcard Patterns to ignore</label>
                            <div className="text-xs text-muted-foreground mb-2">
                                Shell glob patterns (e.g. <code>*.log</code>, <code>temp/*</code>). Matched against the <b>filename</b> or the <b>path relative</b> to the monitored directory. Use <code>*.bak</code> to ignore all files with that extension.
                            </div>
                            <textarea
                                value={driftText}
                                onChange={(e) => setDriftText(e.target.value)}
                                rows={6}
                                className="w-full px-3 py-2 bg-background border border-input rounded-md font-mono text-sm"
                                placeholder="temp/*&#10;*.tmp&#10;*.bak"
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
