import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

export function MetricLineChart({ data, title, metrics, height = 300 }) {
    const formatDateSafe = (ts, fmt) => {
        try {
            if (!ts) return '';
            return format(new Date(ts * 1000), fmt);
        } catch (e) {
            return '';
        }
    };

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-popover border border-border p-3 rounded-lg shadow-lg">
                    <p className="text-xs font-medium text-foreground mb-2 opacity-70">
                        {formatDateSafe(label, 'HH:mm:ss')}
                    </p>
                    {payload.map((entry, index) => (
                        <div key={index} className="flex items-center gap-2 text-sm">
                            <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: entry.color }}
                            />
                            <span className="text-muted-foreground">{entry.name}:</span>
                            <span className="font-semibold text-foreground tabular-nums">
                                {entry.value?.toFixed(1) || '0.0'}%
                            </span>
                        </div>
                    ))}
                </div>
            );
        }
        return null;
    };

    if (!data || data.length === 0) {
        return (
            <div className="w-full h-full flex flex-col">
                <h3 className="text-base font-semibold text-foreground mb-4">{title}</h3>
                <div
                    className="flex-1 flex items-center justify-center bg-muted/20 border border-dashed border-border rounded-lg"
                    style={{ height }}
                >
                    <p className="text-sm text-muted-foreground">No data available</p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-full flex flex-col">
            <h3 className="text-base font-semibold text-foreground mb-6">{title}</h3>
            <div style={{ height: height, width: '100%' }}>
                <ResponsiveContainer>
                    <LineChart data={data}>
                        <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                            stroke="hsl(var(--border))"
                            opacity={0.4}
                        />
                        <XAxis
                            dataKey="timestamp"
                            tickFormatter={(ts) => formatDateSafe(ts, 'HH:mm')}
                            stroke="hsl(var(--muted-foreground))"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            minTickGap={30}
                            dy={10}
                        />
                        <YAxis
                            stroke="hsl(var(--muted-foreground))"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            domain={[0, 100]}
                            tickFormatter={(val) => `${val}%`}
                            dx={-10}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1, strokeDasharray: '4 4' }} />
                        {metrics.map((metric, i) => (
                            <Line
                                key={metric.key}
                                type="monotone"
                                dataKey={metric.key}
                                name={metric.name}
                                stroke={metric.color}
                                strokeWidth={2}
                                dot={false}
                                activeDot={{ r: 4, strokeWidth: 0, fill: metric.color }}
                                isAnimationActive={false}
                            />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

export function HealthMetricCard({ label, value, unit, threshold80 = 80, threshold95 = 90 }) {
    const val = parseFloat(value);
    let color = "text-foreground";
    let bgColor = "bg-primary/5";
    let ringColor = "ring-primary/20";

    if (val >= threshold95) {
        color = "text-rose-600";
        bgColor = "bg-rose-50";
        ringColor = "ring-rose-200";
    } else if (val >= threshold80) {
        color = "text-amber-600";
        bgColor = "bg-amber-50";
        ringColor = "ring-amber-200";
    }

    return (
        <div className={`p-4 rounded-lg border border-border shadow-sm flex flex-col justify-between ${bgColor}`}>
            <span className="text-sm font-medium text-muted-foreground">{label}</span>
            <div className="flex items-baseline gap-1 mt-2">
                <span className={`text-2xl font-bold tracking-tight ${color}`}>{value}</span>
                <span className="text-sm text-muted-foreground font-medium">{unit}</span>
            </div>
        </div>
    );
}

export function AggregateMetricsChart({ data, title, height = 200 }) {
    if (!data || data.length === 0) return null;

    return (
        <div className="w-full h-full flex flex-col">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">{title}</h3>
            <div style={{ height, width: '100%' }}>
                <ResponsiveContainer>
                    <LineChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.4} />
                        <XAxis dataKey="time" hide />
                        <YAxis hide domain={[0, 100]} />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'hsl(var(--popover))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '0.5rem',
                                fontSize: '12px'
                            }}
                            itemStyle={{ color: 'hsl(var(--foreground))' }}
                        />
                        <Line
                            type="monotone"
                            dataKey="cpu"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            dot={false}
                            isAnimationActive={false}
                        />
                        <Line
                            type="monotone"
                            dataKey="memory"
                            stroke="#10b981"
                            strokeWidth={2}
                            dot={false}
                            isAnimationActive={false}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
