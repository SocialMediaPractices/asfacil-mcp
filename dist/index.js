#!/usr/bin/env node
"use strict";
/**
 * Asfacil MCP Server
 * Live US-Mexico border crossing wait times for Claude, Cursor, and any MCP-compatible AI tool.
 *
 * Tools:
 *   get_wait_times   — Live northbound wait times (all crossings or one)
 *   predict_wait     — AI-predicted wait for a future hour
 *   get_history      — Historical wait data + stats (up to 7 days)
 *   get_best_times   — Day-of-week × hour heatmap to find the best crossing window
 *   get_southbound   — Southbound (to Tijuana) estimated wait times
 */
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const BASE_URL = 'https://www.asfacil.com';
const API_KEY = process.env.ASFACIL_API_KEY ?? '';
const VALID_CROSSINGS = ['san_ysidro', 'pedwest', 'otay_mesa'];
const CROSSING_NAMES = {
    san_ysidro: 'San Ysidro Port of Entry',
    pedwest: 'PedWest (El Chaparral)',
    otay_mesa: 'Otay Mesa Port of Entry',
};
const CROSSING_HOURS = {
    san_ysidro: 'Open 24 hours',
    pedwest: 'Open 6:00 AM – 2:00 PM PT (pedestrian only)',
    otay_mesa: 'Open 6:00 AM – 10:00 PM PT',
};
// ─── HTTP helper ─────────────────────────────────────────────────────────────
async function apiFetch(path, params = {}) {
    const url = new URL(`${BASE_URL}${path}`);
    for (const [k, v] of Object.entries(params))
        url.searchParams.set(k, v);
    const headers = { 'Content-Type': 'application/json' };
    if (API_KEY)
        headers['Authorization'] = `Bearer ${API_KEY}`;
    const res = await fetch(url.toString(), { headers });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Asfacil API error ${res.status}: ${body}`);
    }
    return res.json();
}
// ─── Tool definitions ─────────────────────────────────────────────────────────
const TOOLS = [
    {
        name: 'get_wait_times',
        description: 'Get live northbound (Mexico → USA) wait times at US-Mexico border crossings near San Diego / Tijuana. ' +
            'Returns current wait minutes broken down by mode (vehicle/pedestrian) and lane type (general, Ready Lane, SENTRI). ' +
            'Data is sourced directly from US Customs and Border Protection (CBP) and updated every 5 minutes. ' +
            'Crossings: san_ysidro (24h), pedwest (6am-2pm, pedestrian only), otay_mesa (6am-10pm).',
        inputSchema: {
            type: 'object',
            properties: {
                crossing: {
                    type: 'string',
                    enum: ['san_ysidro', 'pedwest', 'otay_mesa', 'all'],
                    description: 'Which crossing to query. Use "all" for all three crossings at once.',
                    default: 'all',
                },
            },
        },
    },
    {
        name: 'predict_wait',
        description: 'Predict what the wait time will be at a specific crossing in 1–6 hours from now. ' +
            'Uses a weighted historical model built from Asfacil\'s proprietary dataset. ' +
            'Also returns the best crossing window for today and trend (improving/worsening/stable). ' +
            'Optionally pass your origin coordinates to get total trip time including drive time.',
        inputSchema: {
            type: 'object',
            properties: {
                crossing: {
                    type: 'string',
                    enum: ['san_ysidro', 'pedwest', 'otay_mesa'],
                    description: 'The crossing to predict for.',
                },
                mode: {
                    type: 'string',
                    enum: ['vehicle', 'pedestrian'],
                    description: 'Travel mode. Default: vehicle.',
                    default: 'vehicle',
                },
                lane: {
                    type: 'string',
                    enum: ['general', 'ready', 'sentri'],
                    description: 'Lane type. Default: general.',
                    default: 'general',
                },
                hours_ahead: {
                    type: 'number',
                    minimum: 1,
                    maximum: 6,
                    description: 'How many hours ahead to predict. Default: 1.',
                    default: 1,
                },
                origin: {
                    type: 'string',
                    description: 'Optional: origin coordinates as "lat,lng" (e.g. "32.7157,-117.1611" for downtown San Diego). Enables drive time + total trip estimate.',
                },
            },
            required: ['crossing'],
        },
    },
    {
        name: 'get_history',
        description: 'Get historical wait time data for a crossing — raw data points and pre-computed stats ' +
            '(average, min, max, best hour of day). Up to 7 days of data. ' +
            'Useful for understanding typical patterns or answering "was it bad yesterday morning?"',
        inputSchema: {
            type: 'object',
            properties: {
                crossing: {
                    type: 'string',
                    enum: ['san_ysidro', 'pedwest', 'otay_mesa'],
                    description: 'The crossing to query.',
                },
                mode: {
                    type: 'string',
                    enum: ['vehicle', 'pedestrian'],
                    default: 'vehicle',
                },
                lane: {
                    type: 'string',
                    enum: ['general', 'ready', 'sentri'],
                    default: 'general',
                },
                hours: {
                    type: 'number',
                    minimum: 1,
                    maximum: 168,
                    description: 'Lookback window in hours. Default 24. Max 168 (7 days).',
                    default: 24,
                },
            },
            required: ['crossing'],
        },
    },
    {
        name: 'get_best_times',
        description: 'Get a day-of-week × hour-of-day wait time heatmap for a crossing. ' +
            'Returns the best and worst crossing slots based on historical patterns. ' +
            'Great for answering "when is the best time to cross on a Friday?" or planning a trip. ' +
            'Powered by Asfacil\'s proprietary dataset — not available from CBP.',
        inputSchema: {
            type: 'object',
            properties: {
                crossing: {
                    type: 'string',
                    enum: ['san_ysidro', 'pedwest', 'otay_mesa'],
                    description: 'The crossing to analyze.',
                },
                mode: {
                    type: 'string',
                    enum: ['vehicle', 'pedestrian'],
                    default: 'vehicle',
                },
                lane: {
                    type: 'string',
                    enum: ['general', 'ready', 'sentri'],
                    default: 'general',
                },
                days: {
                    type: 'number',
                    minimum: 7,
                    maximum: 180,
                    description: 'How many days of history to analyze. Default 90.',
                    default: 90,
                },
            },
            required: ['crossing'],
        },
    },
    {
        name: 'get_southbound',
        description: 'Get estimated southbound (USA → Mexico / Tijuana) wait times. ' +
            'CBP does not publish official southbound data. Asfacil estimates using a blend of ' +
            'live Google Maps traffic, community reports, and historical patterns. ' +
            'Returns estimated wait minutes, data source, and confidence.',
        inputSchema: {
            type: 'object',
            properties: {
                crossing: {
                    type: 'string',
                    enum: ['san_ysidro', 'pedwest', 'otay_mesa', 'all'],
                    description: 'Which crossing. Default: all.',
                    default: 'all',
                },
            },
        },
    },
];
// ─── Tool handlers ────────────────────────────────────────────────────────────
async function handleGetWaitTimes(args) {
    const crossing = args.crossing ?? 'all';
    const params = {};
    if (crossing !== 'all')
        params.crossing = crossing;
    const data = await apiFetch('/api/v1/waittimes', params);
    const lines = [
        `## Live Border Wait Times (Northbound → USA)`,
        `*Source: ${data.data_source === 'cbp' ? 'US Customs & Border Protection' : 'Asfacil fallback'} · Updated ${new Date(data.fetched_at).toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}*`,
        '',
    ];
    for (const c of data.crossings) {
        const id = c.id;
        lines.push(`### ${c.name}`);
        lines.push(`**Status:** ${c.is_open ? '🟢 Open' : '🔴 Closed'} · ${CROSSING_HOURS[id] ?? ''}`);
        lines.push('');
        for (const [mode, lanes] of Object.entries(c.modes)) {
            lines.push(`**${mode.charAt(0).toUpperCase() + mode.slice(1)}:**`);
            for (const [lane, info] of Object.entries(lanes)) {
                const wait = info.wait_minutes !== null ? `${info.wait_minutes} min` : 'N/A';
                const open = info.lanes_open !== null ? ` (${info.lanes_open} lanes open)` : '';
                const laneLabel = lane === 'general' ? 'General' : lane === 'ready' ? 'Ready Lane' : 'SENTRI';
                lines.push(`  - ${laneLabel}: ${wait}${open}`);
            }
            lines.push('');
        }
    }
    return lines.join('\n');
}
async function handlePredictWait(args) {
    const crossing = args.crossing;
    if (!crossing || !VALID_CROSSINGS.includes(crossing)) {
        throw new Error(`crossing must be one of: ${VALID_CROSSINGS.join(', ')}`);
    }
    const params = {
        crossing,
        mode: args.mode ?? 'vehicle',
        lane: args.lane ?? 'general',
        hours_ahead: String(args.hours_ahead ?? 1),
    };
    if (args.origin)
        params.origin = args.origin;
    const data = await apiFetch('/api/v1/predict', params);
    const crossingName = CROSSING_NAMES[crossing] ?? crossing;
    const lines = [
        `## Wait Time Prediction — ${crossingName}`,
        '',
        `**At:** ${data.target_hour_label} (${data.target_dow})`,
        `**Mode:** ${data.mode} · **Lane:** ${data.lane}`,
        '',
        `**Predicted wait:** ${data.predicted_minutes !== null ? `${data.predicted_minutes} min` : 'Insufficient data'}`,
        `**Current wait:** ${data.current_minutes !== null ? `${data.current_minutes} min` : 'N/A'}`,
        `**Trend:** ${data.trend} · **Confidence:** ${data.confidence}`,
        `**Based on:** ${data.based_on_samples} historical samples`,
    ];
    if (data.best_window) {
        lines.push('');
        lines.push(`**Best window today:** ${data.best_window.label} (~${data.best_window.avg_minutes} min)`);
    }
    if (data.trip) {
        lines.push('');
        lines.push(`**Drive time:** ${data.trip.drive_minutes} min · **Total trip:** ${data.trip.total_minutes} min`);
    }
    if (data.recommendation) {
        lines.push('');
        lines.push(`### Recommendation`);
        lines.push(`**${data.recommendation.action === 'leave_now' ? '✅ Leave now' : '⏳ Wait'}** — ${data.recommendation.reason}`);
        if (data.recommendation.savings_minutes) {
            lines.push(`Potential savings: ${data.recommendation.savings_minutes} min`);
        }
    }
    return lines.join('\n');
}
async function handleGetHistory(args) {
    const crossing = args.crossing;
    if (!crossing || !VALID_CROSSINGS.includes(crossing)) {
        throw new Error(`crossing must be one of: ${VALID_CROSSINGS.join(', ')}`);
    }
    const params = {
        crossing,
        mode: args.mode ?? 'vehicle',
        lane: args.lane ?? 'general',
        hours: String(args.hours ?? 24),
    };
    const data = await apiFetch('/api/v1/history', params);
    const crossingName = CROSSING_NAMES[crossing] ?? crossing;
    const s = data.stats;
    const lines = [
        `## Historical Wait Times — ${crossingName}`,
        `**Mode:** ${data.mode} · **Lane:** ${data.lane} · **Last ${data.hours_requested}h**`,
        '',
        `**Average:** ${s.avg_minutes !== null ? `${s.avg_minutes} min` : 'N/A'}`,
        `**Min:** ${s.min_minutes !== null ? `${s.min_minutes} min` : 'N/A'} · **Max:** ${s.max_minutes !== null ? `${s.max_minutes} min` : 'N/A'}`,
        `**Current:** ${s.current_minutes !== null ? `${s.current_minutes} min` : 'N/A'}`,
        `**Best hour of day:** ${s.best_hour !== null ? formatHour12(s.best_hour) : 'N/A'}`,
        '',
        `**Data points:** ${data.data_points.length} recorded readings`,
    ];
    // Show last 10 data points as a mini table
    if (data.data_points.length > 0) {
        lines.push('');
        lines.push('**Recent readings:**');
        const recent = data.data_points.slice(-10);
        for (const pt of recent) {
            const time = new Date(pt.recorded_at).toLocaleTimeString('en-US', {
                timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit',
            });
            lines.push(`  - ${time}: ${pt.wait_minutes} min`);
        }
    }
    return lines.join('\n');
}
async function handleGetBestTimes(args) {
    const crossing = args.crossing;
    if (!crossing || !VALID_CROSSINGS.includes(crossing)) {
        throw new Error(`crossing must be one of: ${VALID_CROSSINGS.join(', ')}`);
    }
    const params = {
        crossing,
        mode: args.mode ?? 'vehicle',
        lane: args.lane ?? 'general',
        days: String(args.days ?? 90),
    };
    const data = await apiFetch('/api/v1/heatmap', params);
    const crossingName = CROSSING_NAMES[crossing] ?? crossing;
    const lines = [
        `## Best Times to Cross — ${crossingName}`,
        `**Mode:** ${data.mode} · **Lane:** ${data.lane} · **Based on ${data.days_analyzed} days / ${data.total_samples} samples**`,
        '',
        `**Overall range:** ${data.overall_min_minutes ?? 'N/A'} – ${data.overall_max_minutes ?? 'N/A'} min`,
        '',
    ];
    if (data.best_slots.length > 0) {
        lines.push('### 🟢 Best slots (shortest waits)');
        for (const s of data.best_slots.slice(0, 5)) {
            lines.push(`  - **${s.dow_label} ${s.hour_label}:** ~${s.avg_minutes} min`);
        }
        lines.push('');
    }
    if (data.worst_slots.length > 0) {
        lines.push('### 🔴 Worst slots (longest waits)');
        for (const s of data.worst_slots.slice(0, 5)) {
            lines.push(`  - **${s.dow_label} ${s.hour_label}:** ~${s.avg_minutes} min`);
        }
        lines.push('');
    }
    // Build a compact text heatmap by day
    const DOW_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    lines.push('### Heatmap by day');
    for (const dow of DOW_ORDER) {
        const dayCells = data.cells
            .filter(c => c.dow_label === dow && c.avg_minutes !== null)
            .sort((a, b) => a.hour - b.hour);
        if (dayCells.length === 0)
            continue;
        const best = dayCells.reduce((a, b) => (a.avg_minutes < b.avg_minutes ? a : b));
        const worst = dayCells.reduce((a, b) => (a.avg_minutes > b.avg_minutes ? a : b));
        lines.push(`  **${dow}** — best: ${best.hour_label} (~${best.avg_minutes}m) · worst: ${worst.hour_label} (~${worst.avg_minutes}m)`);
    }
    return lines.join('\n');
}
async function handleGetSouthbound(args) {
    const crossing = args.crossing ?? 'all';
    const res = await apiFetch('/api/southbound');
    const crossings = crossing === 'all'
        ? res.crossings
        : res.crossings.filter(c => c.crossingId === crossing);
    const lines = [
        '## Southbound Wait Times (USA → Mexico / Tijuana)',
        '*Note: CBP does not publish official southbound data. Estimates use Google Maps traffic, community reports, and historical patterns.*',
        '',
    ];
    for (const c of crossings) {
        const id = c.crossingId;
        const mins = c.estimatedMinutes ?? c.avgWaitMinutes;
        const sourceLabel = c.dataSource === 'google_maps' ? 'Live Google Maps' :
            c.dataSource === 'community' ? `Community (${c.reportCount ?? 0} reports)` :
                'Historical pattern';
        lines.push(`### ${CROSSING_NAMES[id] ?? id}`);
        lines.push(`**Estimated wait:** ${mins !== null ? `${mins} min` : 'No data'}`);
        lines.push(`**Source:** ${sourceLabel}`);
        if (c.patternReason?.en)
            lines.push(`*${c.patternReason.en}*`);
        lines.push('');
    }
    return lines.join('\n');
}
// ─── Utility ──────────────────────────────────────────────────────────────────
function formatHour12(hour) {
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h = hour % 12 || 12;
    return `${h}:00 ${ampm}`;
}
// ─── Server setup ─────────────────────────────────────────────────────────────
const server = new index_js_1.Server({ name: 'asfacil', version: '1.0.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const safeArgs = (args ?? {});
    try {
        let text;
        switch (name) {
            case 'get_wait_times':
                text = await handleGetWaitTimes(safeArgs);
                break;
            case 'predict_wait':
                text = await handlePredictWait(safeArgs);
                break;
            case 'get_history':
                text = await handleGetHistory(safeArgs);
                break;
            case 'get_best_times':
                text = await handleGetBestTimes(safeArgs);
                break;
            case 'get_southbound':
                text = await handleGetSouthbound(safeArgs);
                break;
            default:
                return {
                    content: [{ type: 'text', text: `Unknown tool: ${name}` }],
                    isError: true,
                };
        }
        return { content: [{ type: 'text', text }] };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
            content: [{ type: 'text', text: `Error: ${msg}\n\nMake sure ASFACIL_API_KEY is set. Get a key at https://asfacil.com/api` }],
            isError: true,
        };
    }
});
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    process.stderr.write('Asfacil MCP server running — live border wait times ready\n');
}
main().catch((err) => {
    process.stderr.write(`Fatal: ${err}\n`);
    process.exit(1);
});
