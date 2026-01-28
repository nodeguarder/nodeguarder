import React from 'react';
import smallLogo from '../assets/small_logo.png';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Server, Package, Settings, Key, LogOut, Activity, Clock, FileWarning, Bell, Sliders } from 'lucide-react';
import { cn } from '../utils/cn';

export default function Sidebar() {
    const location = useLocation();
    const navigate = useNavigate();

    const handleLogout = () => {
        localStorage.removeItem('auth_token');
        navigate('/login');
    };

    const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

    const navItems = [
        { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
        { path: '/health', icon: Activity, label: 'Health' },
        { path: '/cron-jobs', icon: Clock, label: 'Cron Monitor' },
        { path: '/drift-detection', icon: FileWarning, label: 'Drift Detection' },
        { path: '/nodes', icon: Server, label: 'Nodes' },
        { path: '/notifications', icon: Bell, label: 'Notifications' },
        { path: '/agent-distribution', icon: Package, label: 'Distribute Agent' },
    ];

    return (
        <div className="w-[260px] h-screen bg-card border-r border-border flex flex-col fixed left-0 top-0 z-50">
            {/* Logo Section */}
            <div className="p-6 border-b border-border/50">
                <div className="flex items-center gap-3 text-primary font-bold text-xl tracking-tight">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden">
                        <img src={smallLogo} alt="Logo" className="w-full h-full object-contain" />
                    </div>
                    <span>Node<span className="text-foreground">Guarder</span></span>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
                {navItems.map((item) => (
                    <Link
                        key={item.path}
                        to={item.path}
                        className={cn(
                            "flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-all duration-200 group",
                            isActive(item.path)
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                    >
                        <item.icon className={cn(
                            "w-4 h-4 transition-colors",
                            isActive(item.path) ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                        )} />
                        {item.label}
                    </Link>
                ))}

                <div className="my-4 px-3">
                    <div className="h-px bg-border/50" />
                </div>

                {/* Conditional License Generator */}
                {import.meta.env.VITE_INCLUDE_LICENSE_GENERATOR === 'true' && (
                    <Link
                        to="/license-generator"
                        className={cn(
                            "flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-all duration-200 group",
                            isActive('/license-generator')
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                    >
                        <Key className={cn(
                            "w-4 h-4 transition-colors",
                            isActive('/license-generator') ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                        )} />
                        License Generator
                    </Link>
                )}

                <Link
                    to="/settings"
                    className={cn(
                        "flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-all duration-200 group",
                        isActive('/settings')
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                >
                    <Settings className={cn(
                        "w-4 h-4 transition-colors",
                        isActive('/settings') ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                    )} />
                    Settings
                </Link>
            </nav>

            {/* Bottom Section */}
            <div className="p-4 border-t border-border/50 bg-card">
                <button
                    onClick={handleLogout}
                    className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 hover:text-destructive active:scale-95 transition-all rounded-md"
                >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                </button>
            </div>
        </div>
    );
}
