import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Bell } from 'lucide-react';

export default function Notifications() {
    const [alertSettings, setAlertSettings] = useState({
        slack_webhook_url: '',
        teams_webhook_url: '',
        discord_webhook_url: '',
        email_recipients: '',
        smtp_server: '',
        smtp_port: 587,
        smtp_user: '',
        smtp_password: '',
        alerts_enabled: false,
        notify_on_warning: false
    });
    const [alertsLoading, setAlertsLoading] = useState(false);
    const [testingAlert, setTestingAlert] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        fetchAlertSettings();
    }, []);

    const fetchAlertSettings = async () => {
        try {
            const response = await api.get('/api/v1/settings/alerts');
            if (response.data) {
                setAlertSettings(response.data);
            }
        } catch (err) {
            console.error('Failed to fetch alert settings:', err);
        }
    };

    const handleAlertChange = (e) => {
        const { name, value, type, checked } = e.target;
        setAlertSettings(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSaveAlerts = async (e) => {
        e.preventDefault();
        setAlertsLoading(true);
        setError('');
        setSuccess('');

        try {
            await api.post('/api/v1/settings/alerts', {
                ...alertSettings,
                smtp_port: parseInt(alertSettings.smtp_port) || 0
            });
            setSuccess('Alert settings saved successfully!');
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to save alert settings');
        } finally {
            setAlertsLoading(false);
        }
    };

    const handleTestAlert = async () => {
        setTestingAlert(true);
        try {
            await api.post('/api/v1/settings/alerts/test');
            setSuccess('Test alert sent! Check your configured channels.');
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError('Test failed: ' + (err.response?.data?.error || err.message));
        } finally {
            setTestingAlert(false);
        }
    };

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-8">
            <div className="flex items-baseline justify-between border-b border-border pb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Notifications</h1>
                    <p className="text-sm text-muted-foreground mt-1">Configure alerting channels and rules</p>
                </div>
            </div>

            {error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm font-medium">
                    {error}
                </div>
            )}

            {success && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm font-medium">
                    {success}
                </div>
            )}

            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                <div className="p-6 border-b border-border">
                    <div className="flex items-center gap-2">
                        <Bell className="w-5 h-5 text-primary" />
                        <h2 className="text-lg font-semibold text-foreground">Notifications & Alerts</h2>
                    </div>
                </div>
                <div className="p-6">
                    <form onSubmit={handleSaveAlerts} className="space-y-6">
                        <div className="flex items-center justify-between bg-muted/30 p-4 rounded-lg border border-border">
                            <div>
                                <div className="font-medium text-foreground">Notify on Critical Events</div>
                                <div className="text-sm text-muted-foreground">Receive notifications for critical events, offline servers, and cron failures.</div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    name="alerts_enabled"
                                    checked={alertSettings.alerts_enabled}
                                    onChange={handleAlertChange}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                            </label>
                        </div>

                        <div className="flex items-center justify-between bg-muted/30 p-4 rounded-lg border border-border">
                            <div>
                                <div className="font-medium text-foreground">Notify on Warning Events</div>
                                <div className="text-sm text-muted-foreground">Receive notifications for Warning events (Drift, High Load), not just Critical.</div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    name="notify_on_warning"
                                    checked={alertSettings.notify_on_warning}
                                    onChange={handleAlertChange}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                            </label>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <h3 className="text-sm font-medium text-muted-foreground uppercase border-b pb-2">Integrations</h3>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">Slack Webhook URL</label>
                                    <input
                                        type="text"
                                        name="slack_webhook_url"
                                        value={alertSettings.slack_webhook_url}
                                        onChange={handleAlertChange}
                                        className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm"
                                        placeholder="https://hooks.slack.com/services/..."
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">MS Teams Webhook URL</label>
                                    <input
                                        type="text"
                                        name="teams_webhook_url"
                                        value={alertSettings.teams_webhook_url}
                                        onChange={handleAlertChange}
                                        className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm"
                                        placeholder="https://outlook.office.com/webhook/..."
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">Discord Webhook URL</label>
                                    <input
                                        type="text"
                                        name="discord_webhook_url"
                                        value={alertSettings.discord_webhook_url}
                                        onChange={handleAlertChange}
                                        className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm"
                                        placeholder="https://discord.com/api/webhooks/..."
                                    />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-sm font-medium text-muted-foreground uppercase border-b pb-2">Email Configuration (SMTP)</h3>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">Recipients (comma separated)</label>
                                    <input
                                        type="text"
                                        name="email_recipients"
                                        value={alertSettings.email_recipients}
                                        onChange={handleAlertChange}
                                        className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm"
                                        placeholder="admin@example.com, ops@example.com"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-foreground">SMTP Server</label>
                                        <input
                                            type="text"
                                            name="smtp_server"
                                            value={alertSettings.smtp_server}
                                            onChange={handleAlertChange}
                                            className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm"
                                            placeholder="smtp.example.com"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-foreground">Port</label>
                                        <input
                                            type="number"
                                            name="smtp_port"
                                            value={alertSettings.smtp_port || ''}
                                            onChange={handleAlertChange}
                                            className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm"
                                            placeholder="587 or 25"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-foreground">Username</label>
                                        <input
                                            type="text"
                                            name="smtp_user"
                                            value={alertSettings.smtp_user}
                                            onChange={handleAlertChange}
                                            className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm"
                                            placeholder="user@example.com"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-foreground">Password</label>
                                        <input
                                            type="password"
                                            name="smtp_password"
                                            value={alertSettings.smtp_password}
                                            onChange={handleAlertChange}
                                            className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm"
                                            placeholder="••••••••"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-border">
                            <button
                                type="submit"
                                disabled={alertsLoading}
                                className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                            >
                                {alertsLoading ? 'Saving...' : 'Save Settings'}
                            </button>
                            <button
                                type="button"
                                onClick={handleTestAlert}
                                disabled={testingAlert || !alertSettings.alerts_enabled || !(alertSettings.slack_webhook_url || alertSettings.teams_webhook_url || alertSettings.discord_webhook_url || alertSettings.email_recipients)}
                                className="px-4 py-2 border border-input bg-transparent hover:bg-muted text-foreground rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                            >
                                {testingAlert ? 'Sending...' : 'Send Test Alert'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
