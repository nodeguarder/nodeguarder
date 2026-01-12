import React, { useState } from 'react';
import api from '../services/api';
import { Key, Download, Copy, Check, Rocket, Star, Shield } from 'lucide-react';
import { cn } from '../utils/cn';

export default function LicenseGenerator() {
    const [tier, setTier] = useState('free');
    const [company, setCompany] = useState('');
    const [maxServers, setMaxServers] = useState(1);
    const [expiryDays, setExpiryDays] = useState(365);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [generatedLicense, setGeneratedLicense] = useState('');
    const [generatedCompany, setGeneratedCompany] = useState('');
    const [copied, setCopied] = useState(false);

    const tierLimits = {
        free: { maxServers: 5, defaultDays: 36500 },
        pro: { maxServers: 30, defaultDays: 365 },
        pro_plus: { maxServers: 100, defaultDays: 365 },
        enterprise: { maxServers: null, defaultDays: 365 }
    };

    const handleTierChange = (newTier) => {
        setTier(newTier);
        const limit = tierLimits[newTier];
        setMaxServers(limit.maxServers || 100);
        setExpiryDays(limit.defaultDays);
        setError('');
        setSuccess('');
        setGeneratedLicense('');
    };

    const handleGenerateLicense = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setGeneratedLicense('');

        if (!company.trim()) return setError('Company name is required');
        if (maxServers < 1) return setError('Max servers must be at least 1');
        if (expiryDays < 1) return setError('Expiry days must be at least 1');

        try {
            setLoading(true);
            const response = await api.post('/api/v1/auth/generate-license', {
                tier,
                company: company.trim(),
                max_servers: maxServers,
                expiry_days: expiryDays,
            });

            if (response.data.license) {
                setGeneratedLicense(response.data.license);
                setGeneratedCompany(company.trim());
                setSuccess('License generated successfully!');
                setCompany('');
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to generate license');
        } finally {
            setLoading(false);
        }
    };

    const downloadLicense = () => {
        const element = document.createElement('a');
        element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(generatedLicense));
        const filename = `license-${(generatedCompany || company).toLowerCase().replace(/\s+/g, '-')}.yaml`;
        element.setAttribute('download', filename);
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(generatedLicense);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const TierCard = ({ id, label, icon: Icon, description }) => (
        <button
            type="button"
            onClick={() => handleTierChange(id)}
            className={cn(
                "relative p-4 rounded-xl border-2 text-left transition-all hover:shadow-md",
                tier === id
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border bg-card hover:border-primary/50"
            )}
        >
            <div className="flex items-center gap-3 mb-2">
                <div className={cn("p-2 rounded-lg", tier === id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                    <Icon className="w-5 h-5" />
                </div>
                <span className="font-semibold text-foreground">{label}</span>
            </div>
            <p className="text-xs text-muted-foreground pl-1">{description}</p>
        </button>
    );

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-8">
            <div className="border-b border-border pb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
                        <Key className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">License Generator</h1>
                        <p className="text-sm text-muted-foreground mt-1">Create configuration files for new environments</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <TierCard
                    id="free"
                    label="Community"
                    icon={Star}
                    description="5 servers. Free forever."
                />
                <TierCard
                    id="pro"
                    label="Pro"
                    icon={Check}
                    description="30 servers. Email support."
                />
                <TierCard
                    id="pro_plus"
                    label="Pro+"
                    icon={Rocket}
                    description="100 servers. Priority support."
                />
                <TierCard
                    id="enterprise"
                    label="Enterprise"
                    icon={Shield}
                    description="Unlimited servers. Dedicated."
                />
            </div>

            <div className="bg-card border border-border rounded-xl shadow-sm p-6 md:p-8">
                <form onSubmit={handleGenerateLicense} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1">Company / Organization</label>
                        <input
                            type="text"
                            value={company}
                            onChange={(e) => setCompany(e.target.value)}
                            placeholder="Acme Corp"
                            className="w-full px-3 py-2 bg-background border border-input rounded-md focus:ring-2 focus:ring-primary focus:border-input transition-all"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1">Max Servers</label>
                            <input
                                type="number"
                                value={maxServers}
                                onChange={(e) => setMaxServers(parseInt(e.target.value))}
                                className="w-full px-3 py-2 bg-background border border-input rounded-md focus:ring-2 focus:ring-primary focus:border-input transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1">Expiry (Days)</label>
                            <input
                                type="number"
                                value={expiryDays}
                                onChange={(e) => setExpiryDays(parseInt(e.target.value))}
                                className="w-full px-3 py-2 bg-background border border-input rounded-md focus:ring-2 focus:ring-primary focus:border-input transition-all"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md border border-destructive/20 font-medium">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-primary text-primary-foreground hover:bg-primary/90 py-2.5 rounded-md font-medium transition-all shadow-sm active:scale-[0.99]"
                    >
                        {loading ? 'Generating...' : 'Generate License Key'}
                    </button>
                </form>
            </div>

            {generatedLicense && (
                <div className="bg-card border border-border rounded-xl shadow-lg border-t-4 border-t-emerald-500 overflow-hidden animate-in fade-in slide-in-from-bottom-4">
                    <div className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2 text-emerald-600 font-semibold">
                                <Check className="w-5 h-5" />
                                <span>License Generated</span>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={copyToClipboard}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground text-xs font-medium rounded-md transition-colors"
                                >
                                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                    {copied ? 'Copied' : 'Copy'}
                                </button>
                                <button
                                    onClick={downloadLicense}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium rounded-md transition-colors"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    Download .yaml
                                </button>
                            </div>
                        </div>
                        <pre className="bg-muted/50 p-4 rounded-lg text-xs font-mono text-muted-foreground overflow-x-auto border border-border">
                            {generatedLicense}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    );
}
