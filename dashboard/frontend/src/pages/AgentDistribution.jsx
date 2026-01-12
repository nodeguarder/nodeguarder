import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Download, Terminal, CheckCircle2, AlertTriangle, FileCode, Copy, Check, Server } from 'lucide-react';
import { cn } from '../utils/cn';

const CodeBlock = ({ code }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="bg-muted p-4 rounded-lg border border-border flex items-center justify-between group relative font-mono text-sm">
            <code className="text-foreground select-all block mr-12 overflow-x-auto whitespace-pre-wrap">
                {code}
            </code>
            <button
                onClick={handleCopy}
                className="absolute right-2 top-2 p-2 rounded-md text-muted-foreground hover:bg-background hover:text-foreground transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                title="Copy command"
            >
                {copied ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                ) : (
                    <Copy className="w-4 h-4" />
                )}
            </button>
        </div>
    );
};

export default function AgentDistribution() {
    const [license, setLicense] = useState(null);
    const [agentVersion, setAgentVersion] = useState({ version: 'Loading...' });
    const [registrationToken, setRegistrationToken] = useState(null);
    const [generatedConfig, setGeneratedConfig] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [licRes, verRes, tokenRes] = await Promise.all([
                    api.get('/api/v1/license/status'),
                    api.get('/api/v1/agent/version'),
                    api.get('/api/v1/auth/registration-token')
                ]);
                setLicense(licRes.data);
                setAgentVersion(verRes.data);
                setRegistrationToken(tokenRes.data.token);
            } catch (err) {
                console.error('Failed to load data:', err);
            }
        };
        fetchData();
    }, []);

    const dashboardUrl = window.location.origin;
    const hostname = window.location.hostname;
    const isDev = hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        (hostname.startsWith('172.') && parseInt(hostname.split('.')[1], 10) >= 16 && parseInt(hostname.split('.')[1], 10) <= 31);

    const insecureFlag = isDev ? '-k ' : '';
    const installCommand = `curl ${insecureFlag}-sfL ${dashboardUrl}/api/v1/agent/package/bash?token=${registrationToken || 'YOUR_TOKEN'} | sudo bash -s -- --dashboard-url ${dashboardUrl}`;

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <div className="flex items-center justify-between border-b border-border pb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Agent Distribution</h1>
                    <p className="text-sm text-muted-foreground mt-1">Deploy monitoring agents to your infrastructure</p>
                </div>
                <div className="inline-flex items-center gap-4 text-sm font-medium">
                    <div className="px-3 py-1 bg-muted rounded-full">
                        <span className="text-muted-foreground mr-2">Portal version:</span>
                        <span>v{__APP_VERSION__}</span>
                    </div>
                    <div className="px-3 py-1 bg-muted rounded-full">
                        <span className="text-muted-foreground mr-2">Agent version:</span>
                        <span>v{agentVersion.version}</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Method 1: Automatic */}
                <div className="space-y-6">
                    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-border">
                            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                                <Terminal className="w-5 h-5 text-primary" />
                                Quick Install
                            </h2>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-muted-foreground">
                                Run this command on your Linux node. It handles everything: downloading the agent, detecting architecture, and setting up the systemd service.
                            </p>
                            <CodeBlock code={installCommand} />

                            <div className="rounded-lg bg-blue-50/50 dark:bg-blue-900/20 p-4 border border-blue-100 dark:border-blue-900/50">
                                <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100 flex items-center gap-2 mb-2">
                                    <CheckCircle2 className="w-4 h-4" />
                                    Prerequisites
                                </h3>
                                <ul className="text-sm text-blue-800 dark:text-blue-200 list-disc list-inside space-y-1">
                                    <li>Root access (sudo)</li>
                                    <li>systemd (most modern distros)</li>
                                    <li>curl installed</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Method 2: Manual */}
                <div className="space-y-6">
                    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-border">
                            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                                <Download className="w-5 h-5 text-primary" />
                                Manual Installation
                            </h2>
                        </div>
                        <div className="p-6 space-y-8">
                            {/* Step 1: Download */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs">1</span>
                                    Download Binary
                                </h3>
                                <div className="space-y-2 pl-7">
                                    {['linux/amd64', 'linux/arm64'].map((target) => (
                                        <a
                                            key={target}
                                            href={`${dashboardUrl}/api/v1/agent/download/${target}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted transition-colors group"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded bg-background border border-border">
                                                    <Server className="w-4 h-4 text-muted-foreground" />
                                                </div>
                                                <div>
                                                    <div className="font-medium text-sm">nodeguarder-agent</div>
                                                    <div className="text-xs text-muted-foreground uppercase">{target}</div>
                                                </div>
                                            </div>
                                            <Download className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                        </a>
                                    ))}
                                </div>
                            </div>

                            {/* Step 2: Configure */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs">2</span>
                                        Create Configuration
                                    </h3>
                                    <button
                                        onClick={() => {
                                            const id = `server-${Math.random().toString(36).substr(2, 9)}`;
                                            const secret = Array.from(crypto.getRandomValues(new Uint8Array(24)))
                                                .map(b => b.toString(16).padStart(2, '0')).join('');

                                            setGeneratedConfig(
                                                `server_id: "${id}"\n` +
                                                `api_secret: "${secret}"\n` +
                                                `dashboard_url: "${window.location.origin}"\n` +
                                                `registration_token: "${registrationToken || 'YOUR_TOKEN'}"\n` +
                                                `interval: 10` +
                                                (isDev ? `\ndisable_ssl_verify: true` : '')
                                            );
                                        }}
                                        className="text-xs text-primary hover:underline font-medium"
                                    >
                                        Generate New ID & Secret
                                    </button>
                                </div>

                                <div className="pl-7 space-y-2">
                                    <p className="text-sm text-muted-foreground">
                                        Create a file named <code className="text-foreground bg-muted px-1 py-0.5 rounded">config.yaml</code> next to the binary with this content:
                                    </p>
                                    <CodeBlock code={generatedConfig || '# Click "Generate New ID & Secret" above\n# to get a valid configuration'} />
                                </div>
                            </div>

                            {/* Step 3: Run */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs">3</span>
                                    Run Agent
                                </h3>
                                <div className="pl-7">
                                    <CodeBlock code="./nodeguarder-agent --config config.yaml" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
