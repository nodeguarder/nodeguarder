import React, { useState } from 'react';
import smallLogo from '../assets/small_logo.png';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Activity, Lock, User, ArrowRight } from 'lucide-react';
import { cn } from '../utils/cn';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await api.post('/api/v1/auth/login', {
                username,
                password,
            });

            localStorage.setItem('auth_token', response.data.token);
            // Save password_changed status (ensure it's a string 'true'/'false')
            localStorage.setItem('password_changed', response.data.user.password_changed.toString());

            if (!response.data.user.password_changed) {
                navigate('/change-password', { replace: true });
            } else {
                navigate('/', { replace: true });
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Invalid credentials');
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
                        <div className="w-16 h-16 rounded-xl flex items-center justify-center mb-4 overflow-hidden">
                            <img src={smallLogo} alt="Logo" className="w-full h-full object-contain" />
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">NodeGuarder Dashboard</h1>
                        <p className="text-sm text-muted-foreground mt-2">Sign in to access your infrastructure</p>
                    </div>

                    {error && (
                        <div className="mb-6 p-3 rounded-lg bg-destructive/10 text-destructive text-sm font-medium border border-destructive/20 text-center animate-in fade-in slide-in-from-top-1">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Username</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="w-full px-3 py-2 pl-9 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-input transition-all"
                                    placeholder="Enter your username"
                                    required
                                />
                                <User className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5 opacity-50" />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Password</label>
                            <div className="relative">
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-3 py-2 pl-9 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-input transition-all"
                                    placeholder="••••••••"
                                    required
                                />
                                <Lock className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5 opacity-50" />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 py-2.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-6"
                        >
                            {loading ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    Sign In <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <p className="text-xs text-muted-foreground">
                            Default credentials on first logon: <span className="font-mono bg-muted px-1 py-0.5 rounded text-foreground">admin</span> / <span className="font-mono bg-muted px-1 py-0.5 rounded text-foreground">admin</span>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
