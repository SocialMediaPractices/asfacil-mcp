#!/usr/bin/env node
"use strict";
/**
 * asfacil CLI — live US-Mexico border wait times in your terminal
 * Usage: npx asfacil [crossing] [--mode vehicle|pedestrian] [--lang es]
 *
 * Examples:
 *   npx asfacil
 *   npx asfacil san_ysidro
 *   npx asfacil otay_mesa --mode pedestrian
 *   npx asfacil --lang es
 */
const BASE = 'https://www.asfacil.com';
const KEY = process.env.ASFACIL_API_KEY ?? '';
const CROSSING_NAMES = {
    san_ysidro: 'San Ysidro',
    pedwest: 'PedWest (El Chaparral)',
    otay_mesa: 'Otay Mesa',
};
const CROSSING_HOURS = {
    san_ysidro: '24h',
    pedwest: '6am–2pm',
    otay_mesa: '6am–10pm',
};
// ANSI color helpers
const c = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
    white: '\x1b[97m',
};
function waitColor(mins) {
    if (mins <= 20)
        return c.green;
    if (mins <= 45)
        return c.yellow;
    return c.red;
}
function bar(mins, max = 120) {
    const filled = Math.round((Math.min(mins, max) / max) * 12);
    const color = waitColor(mins);
    return color + '█'.repeat(filled) + c.gray + '░'.repeat(12 - filled) + c.reset;
}
function pad(s, n) {
    return s.length >= n ? s : s + ' '.repeat(n - s.length);
}
async function fetchWaitTimes(crossing) {
    const url = new URL(`${BASE}/api/v1/waittimes`);
    if (crossing)
        url.searchParams.set('crossing', crossing);
    if (KEY) {
        const headers = { Authorization: `Bearer ${KEY}` };
        const res = await fetch(url.toString(), { headers });
        if (!res.ok)
            throw new Error(`API error ${res.status}`);
        return res.json();
    }
    else {
        // No key — try without (will fail on auth but let the error surface naturally)
        const res = await fetch(url.toString());
        if (res.status === 401) {
            console.error(`\n${c.yellow}⚠  No API key found.${c.reset}`);
            console.error(`   Set ${c.cyan}ASFACIL_API_KEY${c.reset} or get a free key at ${c.cyan}https://www.asfacil.com/api-keys${c.reset}\n`);
            process.exit(1);
        }
        if (!res.ok)
            throw new Error(`API error ${res.status}`);
        return res.json();
    }
}
function formatTime(iso) {
    return new Date(iso).toLocaleTimeString('en-US', {
        timeZone: 'America/Los_Angeles',
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    });
}
async function main() {
    const args = process.argv.slice(2);
    const langArg = args.indexOf('--lang');
    const isEs = langArg !== -1 && args[langArg + 1] === 'es';
    const modeArg = args.indexOf('--mode');
    const filterMode = modeArg !== -1 ? args[modeArg + 1] : null;
    const crossingArg = args.find((a) => !a.startsWith('--') && a !== (args[langArg + 1]) && a !== (args[modeArg + 1]));
    console.log(`\n${c.bold}${c.white}Asfacil${c.reset}${c.gray} · US-Mexico Border Wait Times · ${new Date().toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}${c.reset}\n`);
    let data;
    try {
        data = await fetchWaitTimes(crossingArg);
    }
    catch (err) {
        console.error(`${c.red}Error: ${err}${c.reset}`);
        process.exit(1);
    }
    for (const crossing of data.crossings) {
        const id = crossing.id;
        const name = CROSSING_NAMES[id] ?? id;
        const hrs = CROSSING_HOURS[id] ?? '';
        const status = crossing.is_open
            ? `${c.green}● Open${c.reset}`
            : `${c.red}● Closed${c.reset}`;
        console.log(`${c.bold}${c.white}${name}${c.reset}  ${status}  ${c.gray}${hrs}${c.reset}`);
        console.log(c.gray + '─'.repeat(50) + c.reset);
        for (const [mode, lanes] of Object.entries(crossing.modes)) {
            if (filterMode && mode !== filterMode)
                continue;
            const modeIcon = mode === 'vehicle' ? '🚗' : '🚶';
            console.log(`  ${modeIcon} ${c.bold}${mode.charAt(0).toUpperCase() + mode.slice(1)}${c.reset}`);
            for (const [lane, info] of Object.entries(lanes)) {
                const laneLabel = lane === 'general' ? 'General   ' : lane === 'ready' ? 'Ready Lane' : 'SENTRI    ';
                if (info.wait_minutes === null) {
                    console.log(`    ${c.gray}${laneLabel}  N/A${c.reset}`);
                    continue;
                }
                const mins = info.wait_minutes;
                const color = waitColor(mins);
                const waitStr = mins >= 60 ? `${(mins / 60).toFixed(1)}h` : `${mins}m`;
                const lanesStr = info.lanes_open !== null ? `${c.gray}${info.lanes_open} lanes${c.reset}` : '';
                console.log(`    ${pad(laneLabel, 10)}  ${bar(mins)}  ${color}${c.bold}${pad(waitStr, 5)}${c.reset}  ${lanesStr}`);
            }
            console.log();
        }
    }
    const source = data.data_source === 'cbp' ? 'CBP' : 'Asfacil fallback';
    console.log(`${c.gray}Source: ${source} · ${formatTime(data.fetched_at)}${c.reset}`);
    console.log(`${c.gray}Full data: https://www.asfacil.com${c.reset}\n`);
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
