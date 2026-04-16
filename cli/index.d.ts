#!/usr/bin/env node
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
declare const BASE = "https://www.asfacil.com";
declare const KEY: string;
declare const CROSSING_NAMES: Record<string, string>;
declare const CROSSING_HOURS: Record<string, string>;
declare const c: {
    reset: string;
    bold: string;
    dim: string;
    green: string;
    yellow: string;
    red: string;
    cyan: string;
    gray: string;
    white: string;
};
declare function waitColor(mins: number): string;
declare function bar(mins: number, max?: number): string;
declare function pad(s: string, n: number): string;
declare function fetchWaitTimes(crossing?: string): Promise<any>;
declare function formatTime(iso: string): string;
declare function main(): Promise<void>;
