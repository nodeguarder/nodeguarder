import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Mail, Upload, Key, Shield, Info, CreditCard, FileWarning, Download } from 'lucide-react';
import { cn } from '../utils/cn';

export default function Settings() {
    // Auth & License State
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // License Feedback
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Password Feedback
    const [passwordError, setPasswordError] = useState('');
    const [passwordSuccess, setPasswordSuccess] = useState('');

    const [loading, setLoading] = useState(false);
    const [license, setLicense] = useState(null);
    const [licenseLoading, setLicenseLoading] = useState(false);
    const [licenseFile, setLicenseFile] = useState(null);
    const [uploadingLicense, setUploadingLicense] = useState(false);

    useEffect(() => {
        fetchLicense();
    }, []);


    const fetchLicense = async () => {
        try {
            setLicenseLoading(true);
            const response = await api.get('/api/v1/license/status');
            setLicense(response.data);
        } catch (err) {
            console.error('Failed to fetch license:', err);
        } finally {
            setLicenseLoading(false);
        }
    };

    const validatePasswords = () => {
        if (!currentPassword) {
            setPasswordError('Current password is required');
            return false;
        }
        if (!newPassword) {
            setPasswordError('New password is required');
            return false;
        }
        if (newPassword.length < 6) {
            setPasswordError('Password must be at least 6 characters');
            return false;
        }
        if (newPassword !== confirmPassword) {
            setPasswordError('Passwords do not match');
            return false;
        }
        if (newPassword === currentPassword) {
            setPasswordError('New password must be different from current password');
            return false;
        }
        return true;
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        setPasswordError('');
        setPasswordSuccess('');

        if (!validatePasswords()) {
            return;
        }

        setLoading(true);

        try {
            await api.post('/api/v1/auth/password', {
                current_password: currentPassword,
                new_password: newPassword,
            });

            setPasswordSuccess('Password changed successfully!');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');

            setTimeout(() => setPasswordSuccess(''), 3000);
        } catch (err) {
            setPasswordError(err.response?.data?.error || 'Failed to change password');
        } finally {
            setLoading(false);
        }
    };

    const handleUploadLicense = async (e) => {
        e.preventDefault();
        if (!licenseFile) {
            setError('Please select a license file');
            return;
        }

        setUploadingLicense(true);
        setError('');

        try {
            const formData = new FormData();
            formData.append('license', licenseFile);

            const response = await api.post('/api/v1/license/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            setSuccess('License updated successfully!');
            setLicenseFile(null);
            setTimeout(() => setSuccess(''), 3000);

            // Refresh license data
            fetchLicense();
        } catch (err) {
            setError('Failed to upload license: ' + (err.response?.data?.error || err.message));
        } finally {
            setUploadingLicense(false);
        }
    };

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-8">
            <div className="flex items-baseline justify-between border-b border-border pb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
                    <p className="text-sm text-muted-foreground mt-1">Manage billing, licensing, and security</p>
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

            <div className="grid gap-8">

                {/* License Section */}
                <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-border">
                        <div className="flex items-center gap-2">
                            <CreditCard className="w-5 h-5 text-primary" />
                            <h2 className="text-lg font-semibold text-foreground">License & Usage</h2>
                        </div>
                    </div>

                    <div className="p-6 space-y-8">
                        {licenseLoading ? (
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                                Loading license info...
                            </div>
                        ) : license ? (
                            <>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="bg-muted/30 p-4 rounded-lg border border-border">
                                        <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">License ID</div>
                                        <div className="font-mono text-sm font-medium truncate" title={license.license_id}>{license.license_id.substring(0, 12)}...</div>
                                    </div>
                                    <div className="bg-muted/30 p-4 rounded-lg border border-border">
                                        <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Servers Used</div>
                                        <div className={cn("text-xl font-bold", license.slots_remaining === 0 ? 'text-destructive' : 'text-foreground')}>
                                            {license.current_servers} / {license.max_servers}
                                        </div>
                                    </div>
                                    <div className="bg-muted/30 p-4 rounded-lg border border-border">
                                        <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Available Slots</div>
                                        <div className={cn("text-xl font-bold", license.slots_remaining > 0 ? 'text-emerald-600' : 'text-muted-foreground')}>
                                            {license.slots_remaining}
                                        </div>
                                    </div>
                                    <div className="bg-muted/30 p-4 rounded-lg border border-border">
                                        <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Expires</div>
                                        <div className="text-sm font-medium">{license.expires_formatted}</div>
                                    </div>
                                </div>

                                {license.slots_remaining === 0 && (
                                    <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-lg text-sm flex items-start gap-2">
                                        <Info className="w-4 h-4 mt-0.5 shrink-0" />
                                        <div>
                                            <span className="font-semibold">License limit reached.</span> You cannot add more servers until you upgrade your license or remove existing servers.
                                        </div>
                                    </div>
                                )}

                                <div className="border-t border-border pt-6">
                                    <h3 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
                                        <Upload className="w-4 h-4" />
                                        Update License
                                    </h3>
                                    <form onSubmit={handleUploadLicense} className="flex gap-4 items-end max-w-xl">
                                        <div className="flex-1 space-y-2">
                                            <label className="text-xs font-medium text-muted-foreground">Select License File (.yaml)</label>
                                            <input
                                                type="file"
                                                accept=".yaml,.yml"
                                                onChange={(e) => setLicenseFile(e.target.files[0])}
                                                className="block w-full text-sm text-muted-foreground
                                                    file:mr-4 file:py-2 file:px-4
                                                    file:rounded-md file:border-0
                                                    file:text-sm file:font-medium
                                                    file:bg-primary/10 file:text-primary
                                                    hover:file:bg-primary/20
                                                    cursor-pointer"
                                            />
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={uploadingLicense || !licenseFile}
                                            className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                        >
                                            {uploadingLicense ? 'Uploading...' : 'Upload License'}
                                        </button>
                                    </form>
                                    <p className="text-xs text-muted-foreground mt-2">
                                        Upload the <code>license.yaml</code> provided by your administrator.
                                    </p>
                                </div>
                            </>
                        ) : null}
                    </div>

                    <div className="bg-muted/30 p-6 border-t border-border flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                                <Mail className="w-4 h-4" />
                            </div>
                            <div>
                                <div className="text-sm font-medium text-foreground">Need more capacity?</div>
                                <div className="text-xs text-muted-foreground">Contact us for licensing</div>
                            </div>
                        </div>
                        <a
                            href="https://nodeguarder.com/contact"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-primary hover:underline hover:text-primary/80 transition-colors"
                        >
                            Contact Us
                        </a>
                    </div>
                </div>

                {/* Security Section */}
                <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-border">
                        <div className="flex items-center gap-2">
                            <Shield className="w-5 h-5 text-primary" />
                            <h2 className="text-lg font-semibold text-foreground">Security</h2>
                        </div>
                    </div>

                    <div className="p-6">
                        <h3 className="text-sm font-medium text-foreground mb-4">Change Password</h3>

                        {passwordError && (
                            <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm font-medium mb-4">
                                {passwordError}
                            </div>
                        )}

                        {passwordSuccess && (
                            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm font-medium mb-4">
                                {passwordSuccess}
                            </div>
                        )}

                        <form onSubmit={handleChangePassword} className="max-w-md space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-muted-foreground">Current Password</label>
                                <div className="relative">
                                    <input
                                        type="password"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-input transition-all pl-9"
                                        placeholder="••••••••"
                                        required
                                    />
                                    <Key className="w-4 h-4 text-muted-foreground absolute left-3 top-3 opacity-50" />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-muted-foreground">New Password</label>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-input transition-all"
                                    placeholder="••••••••"
                                    required
                                />
                                <p className="text-xs text-muted-foreground">Minimum 6 characters</p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-muted-foreground">Confirm New Password</label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-input transition-all"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                            >
                                {loading ? 'Updating...' : 'Update Password'}
                            </button>
                        </form>
                    </div>
                </div>

                {/* Troubleshooting Section */}
                <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-border">
                        <div className="flex items-center gap-2">
                            <FileWarning className="w-5 h-5 text-primary" />
                            <h2 className="text-lg font-semibold text-foreground">Troubleshooting</h2>
                        </div>
                    </div>

                    <div className="p-6">
                        <h3 className="text-sm font-medium text-foreground mb-4">Backend Logs</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                            Download the dashboard backend logs for troubleshooting purposes. These logs contain information about API requests, errors, and system events.
                        </p>
                        <button
                            onClick={() => window.location.href = `${api.defaults.baseURL || ''}/api/v1/admin/logs?token=${localStorage.getItem('auth_token')}`}
                            className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md text-sm font-medium transition-colors border border-border"
                        >
                            <Download className="w-4 h-4" />
                            Download Backend Logs
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
