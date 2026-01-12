import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { ShieldCheck, Lock, ArrowRight, CheckCircle } from 'lucide-react';
import { cn } from '../utils/cn';

export default function ChangePassword() {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const validatePasswords = () => {
        if (!newPassword) {
            setError('New password is required');
            return false;
        }
        if (newPassword.length < 6) {
            setError('Password must be at least 6 characters');
            return false;
        }
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match');
            return false;
        }
        if (newPassword === currentPassword) {
            setError('New password must be different from current password');
            return false;
        }
        return true;
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (!validatePasswords()) {
            return;
        }

        setLoading(true);

        try {
            await api.post('/api/v1/auth/password', {
                current_password: currentPassword,
                new_password: newPassword,
            });

            setSuccess('Password changed successfully! Redirecting...');
            localStorage.setItem('password_changed', 'true');

            setTimeout(() => {
                navigate('/', { replace: true });
            }, 1500);
        } catch (err) {
            const errorMsg = err.response?.data?.error || 'Failed to change password';
            setError(errorMsg);
            setSuccess('');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] -z-10" />
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-indigo-50/50 via-white to-blue-50/30 -z-20" />

            <div className="w-full max-w-md p-6">
                <div className="bg-card border border-border rounded-xl shadow-xl overflow-hidden p-8">
                    <div className="flex flex-col items-center text-center mb-8">
                        <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center mb-4 ring-1 ring-primary/20">
                            <ShieldCheck className="w-6 h-6" />
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">Change Password</h1>
                        <p className="text-sm text-muted-foreground mt-2">
                            Please update your password to continue
                        </p>
                    </div>

                    {error && (
                        <div className="mb-6 p-3 rounded-lg bg-destructive/10 text-destructive text-sm font-medium border border-destructive/20 text-center animate-in fade-in slide-in-from-top-1">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="mb-6 p-3 rounded-lg bg-emerald-50 text-emerald-600 text-sm font-medium border border-emerald-100 text-center animate-in fade-in slide-in-from-top-1 flex items-center justify-center gap-2">
                            <CheckCircle className="w-4 h-4" /> {success}
                        </div>
                    )}

                    <form onSubmit={handleChangePassword} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Current Password</label>
                            <div className="relative">
                                <input
                                    type="password"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    className="w-full px-3 py-2 pl-9 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-input transition-all"
                                    placeholder="••••••••"
                                    required
                                />
                                <Lock className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5 opacity-50" />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">New Password</label>
                            <div className="relative">
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full px-3 py-2 pl-9 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-input transition-all"
                                    placeholder="••••••••"
                                    required
                                />
                                <Lock className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5 opacity-50" />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Confirm Password</label>
                            <div className="relative">
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full px-3 py-2 pl-9 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-input transition-all"
                                    placeholder="••••••••"
                                    required
                                />
                                <Lock className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5 opacity-50" />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading || success}
                            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 py-2.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-6"
                        >
                            {loading ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    Update Password <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </form>


                </div>
            </div>
        </div>
    );
}
