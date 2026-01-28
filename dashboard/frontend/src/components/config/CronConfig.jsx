import React from 'react';
import { List, Info, Plus, Trash2, Clock } from 'lucide-react';

export default function CronConfig({
    config,
    setConfig,
    jobConfigs,
    setJobConfigs,
    newJobCommand,
    setNewJobCommand,
    isAddingJob,
    setIsAddingJob,
    lastGlobalTimeout,
    setLastGlobalTimeout,
    error,
    setError
}) {
    const handleJobChange = (index, field, value) => {
        const newJobs = [...jobConfigs];
        newJobs[index][field] = value;
        setJobConfigs(newJobs);
    };

    const handleAddJob = () => {
        if (!newJobCommand.trim()) return;

        if (jobConfigs.some(j => j.command === newJobCommand.trim())) {
            setError('Job already exists in the list');
            return;
        }

        setJobConfigs([...jobConfigs, {
            command: newJobCommand.trim(),
            timeoutMinutes: '',
            ignoreCodes: '',
            isDiscovered: false
        }]);
        setNewJobCommand('');
        setIsAddingJob(false);
        setError('');
    };

    const handleDeleteJob = (index) => {
        const newJobs = [...jobConfigs];
        if (newJobs[index].isDiscovered) {
            newJobs[index].timeoutMinutes = '';
            newJobs[index].ignoreCodes = '';
        } else {
            newJobs.splice(index, 1);
        }
        setJobConfigs(newJobs);
    };

    const formatDuration = (seconds) => {
        if (seconds === undefined || seconds === null) return '-';
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        const remSeconds = seconds % 60;
        return `${minutes}m ${remSeconds}s`;
    };

    return (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <List className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-semibold text-foreground">Cron Monitor Configuration</h2>
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground mr-1">{config.cron_enabled ? 'Enabled' : 'Disabled'}</label>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={config.cron_enabled}
                        onClick={() => setConfig({ ...config, cron_enabled: !config.cron_enabled })}
                        className={`
                            relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
                            ${config.cron_enabled ? 'bg-primary' : 'bg-input'}
                        `}
                    >
                        <span className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${config.cron_enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                </div>
            </div>

            {config.cron_enabled && (
                <div className="p-6 space-y-6 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
                        <Info className="w-5 h-5 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-semibold">Zero Touch Monitoring (eBPF)</p>
                            <p className="mt-1 text-blue-700/90">
                                For full automatic failure detection, <b>Linux Kernel 5.8+</b> is recommended.
                                <br />
                                Older kernels will automatically fall back to log-based monitoring (journalctl/syslog).
                            </p>
                        </div>
                    </div>

                    <div className="grid gap-6">
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-foreground">Global Max Runtime (minutes)</label>
                                <div className="flex items-center gap-2">
                                    <label className="text-xs text-muted-foreground mr-1">{config.cron_global_timeout > 0 ? 'Enabled' : 'Disabled'}</label>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={config.cron_global_timeout > 0}
                                        onClick={() => {
                                            const currentValue = config.cron_global_timeout;
                                            if (currentValue > 0) {
                                                setLastGlobalTimeout(currentValue);
                                                setConfig({ ...config, cron_global_timeout: 0 });
                                            } else {
                                                setConfig({ ...config, cron_global_timeout: lastGlobalTimeout || 300 });
                                            }
                                        }}
                                        className={`
                                            relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
                                            ${config.cron_global_timeout > 0 ? 'bg-primary' : 'bg-input'}
                                        `}
                                    >
                                        <span className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${config.cron_global_timeout > 0 ? 'translate-x-4' : 'translate-x-0'}`} />
                                    </button>
                                </div>
                            </div>
                            <div className="text-xs text-muted-foreground mb-3">
                                Trigger a <b>warning alert</b> if any cron job exceeds this duration.
                            </div>

                            {config.cron_global_timeout > 0 && (
                                <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                                    <input
                                        type="number"
                                        min="1"
                                        value={Math.round(config.cron_global_timeout / 60) || 1}
                                        onChange={(e) => setConfig({ ...config, cron_global_timeout: (parseInt(e.target.value) || 0) * 60 })}
                                        className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm"
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-sm font-medium text-foreground block">Auto Discovered Jobs</label>
                                <div className="flex items-center gap-2">
                                    <div className="text-xs text-muted-foreground text-right min-w-[60px]">
                                        {config.cron_auto_discover !== false ? "Enabled" : "Disabled"}
                                    </div>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={config.cron_auto_discover !== false}
                                        onClick={() => setConfig({ ...config, cron_auto_discover: config.cron_auto_discover === false ? true : false })}
                                        className={`
                                             relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
                                             ${config.cron_auto_discover !== false ? 'bg-primary' : 'bg-input'}
                                         `}
                                    >
                                        <span className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${config.cron_auto_discover !== false ? 'translate-x-4' : 'translate-x-0'}`} />
                                    </button>
                                </div>
                            </div>
                            <div className={config.cron_auto_discover === false ? "opacity-50 pointer-events-none grayscale" : ""}>
                                <div className="text-xs text-muted-foreground mb-3">Note: The "Alert after" setting below overrides the Global Max Runtime for that specific job.</div>
                                <div className="grid gap-3">
                                    {jobConfigs.filter(job => job.isDiscovered).length === 0 ? (
                                        <div className="text-sm text-muted-foreground border border-dashed border-border rounded-lg p-4 text-center">
                                            No auto-discovered jobs found.
                                        </div>
                                    ) : (
                                        jobConfigs.map((job, index) => job.isDiscovered && (
                                            <div key={job.command} className="flex flex-col md:flex-row gap-4 p-4 bg-muted/10 border border-border rounded-lg items-start md:items-center">
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-mono text-sm truncate bg-muted/50 px-2 py-1 rounded w-full mb-2" title={job.command}>
                                                        {job.command}
                                                    </div>
                                                    {(job.lastDuration !== undefined || job.lastExitCode !== undefined) && (
                                                        <div className="flex gap-4 text-xs">
                                                            <div className="flex items-center gap-1.5" title="Execution Duration">
                                                                <span className="text-muted-foreground font-medium uppercase">Last Run:</span>
                                                                <span className="font-mono">{formatDuration(job.lastDuration)}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5" title="Last Exit Code">
                                                                <span className="text-muted-foreground font-medium uppercase">Last Exit Code:</span>
                                                                <span className={`font-mono font-bold ${job.lastExitCode === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                                    {job.lastExitCode !== undefined ? job.lastExitCode : '-'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex gap-4 w-full md:w-auto items-center">
                                                    <div className="flex-1 md:w-32">
                                                        <label className="text-[10px] uppercase text-muted-foreground font-semibold mb-0.5 block" title="Trigger warning if job exceeds this time">Alert after (mins)</label>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            value={job.timeoutMinutes}
                                                            onChange={(e) => handleJobChange(index, 'timeoutMinutes', e.target.value)}
                                                            placeholder={config.cron_global_timeout > 0 ? `Default: ${Math.round(config.cron_global_timeout / 60)}m` : "Disabled (Default)"}
                                                            className="w-full px-2 py-1 text-sm bg-background border border-input rounded focus:ring-1 focus:ring-primary"
                                                        />
                                                    </div>

                                                    <div className="flex-1 md:w-40">
                                                        <label className="text-[10px] uppercase text-muted-foreground font-semibold mb-0.5 block" title="Comma separated exit codes to NOT alert on (e.g. 1, 42)">Ignore Exit Code(s)</label>
                                                        <input
                                                            type="text"
                                                            value={job.ignoreCodes}
                                                            onChange={(e) => handleJobChange(index, 'ignoreCodes', e.target.value)}
                                                            placeholder="e.g. 1, 42"
                                                            className="w-full px-2 py-1 text-sm bg-background border border-input rounded focus:ring-1 focus:ring-primary"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-border">
                            <div className="flex items-center justify-between mb-4">
                                <label className="text-sm font-medium text-foreground">Manual Configured Jobs</label>
                                <button
                                    type="button"
                                    onClick={() => setIsAddingJob(true)}
                                    className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    Add Custom Job
                                </button>
                            </div>

                            <div className="grid gap-3">
                                {isAddingJob && (
                                    <div className="flex gap-3 p-4 bg-primary/5 border border-primary/20 rounded-lg animate-in fade-in slide-in-from-top-2">
                                        <input
                                            autoFocus
                                            type="text"
                                            value={newJobCommand}
                                            onChange={(e) => setNewJobCommand(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddJob()}
                                            placeholder="Enter command (e.g. /usr/bin/backup.sh)"
                                            className="flex-1 px-3 py-1.5 text-sm bg-background border border-input rounded focus:ring-2 focus:ring-primary"
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleAddJob}
                                                className="px-3 py-1.5 bg-primary text-white text-xs font-medium rounded hover:bg-primary/90"
                                            >
                                                Add
                                            </button>
                                            <button
                                                onClick={() => { setIsAddingJob(false); setError(''); }}
                                                className="px-3 py-1.5 bg-muted text-foreground text-xs font-medium rounded hover:bg-muted/80"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {jobConfigs.filter(job => !job.isDiscovered).length === 0 && !isAddingJob ? (
                                    <div className="text-xs text-muted-foreground border border-dashed border-border rounded-lg p-6 text-center italic">
                                        No custom configured jobs.
                                    </div>
                                ) : (
                                    jobConfigs.map((job, index) => !job.isDiscovered && (
                                        <div key={index} className="flex flex-col md:flex-row gap-4 p-4 bg-card border border-border rounded-lg items-start md:items-center shadow-sm">
                                            <div className="flex-1 min-w-0">
                                                <div className="font-mono text-sm truncate bg-muted/30 px-2 py-1 rounded w-full border border-border/50 text-foreground" title={job.command}>
                                                    {job.command}
                                                </div>
                                            </div>

                                            <div className="flex gap-4 w-full md:w-auto items-center">
                                                <div className="flex-1 md:w-32">
                                                    <label className="text-[10px] uppercase text-muted-foreground font-semibold mb-0.5 block">Alert after (mins)</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={job.timeoutMinutes}
                                                        onChange={(e) => handleJobChange(index, 'timeoutMinutes', e.target.value)}
                                                        placeholder={config.cron_global_timeout > 0 ? `Default: ${Math.round(config.cron_global_timeout / 60)}m` : "Disabled"}
                                                        className="w-full px-2 py-1 text-sm bg-background border border-input rounded"
                                                    />
                                                </div>

                                                <div className="flex-1 md:w-40">
                                                    <label className="text-[10px] uppercase text-muted-foreground font-semibold mb-0.5 block">Ignore Exit Code(s)</label>
                                                    <input
                                                        type="text"
                                                        value={job.ignoreCodes}
                                                        onChange={(e) => handleJobChange(index, 'ignoreCodes', e.target.value)}
                                                        placeholder="e.g. 1, 42"
                                                        className="w-full px-2 py-1 text-sm bg-background border border-input rounded"
                                                    />
                                                </div>

                                                <button
                                                    onClick={() => handleDeleteJob(index)}
                                                    className="p-2 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                                                    title="Remove job configuration"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
