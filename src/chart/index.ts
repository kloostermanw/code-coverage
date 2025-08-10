/**
 * Chart module for generating ASCII charts of coverage distribution
 * This module creates visual representations of how many files fall into each coverage percentage range
 */

import { getInput } from "@actions/core";
import { Stats } from "../types";

/**
 * Creates an object with coverage percentage buckets initialized to zero
 * @returns Object with keys for each 10% coverage bucket (0-100%)
 */
const percs = () => ({
  0: 0,
  10: 0,
  20: 0,
  30: 0,
  40: 0,
  50: 0,
  60: 0,
  70: 0,
  80: 0,
  90: 0,
  100: 0,
});

/**
 * Reduces coverage statistics to a distribution of files by coverage percentage
 * 
 * @param s - Coverage statistics
 * @returns Object mapping coverage percentages to file counts
 */
const reduce = (s: Stats) =>
  Array.from(s.folders.values())
    // Flatten folders to get all files
    .reduce((files, f) => [...files, ...f.files], [])
    // Round coverage percentages to nearest 10%
    .map((f) => Math.round((f.metrics.lines.percentual || 0) * 10) * 10)
    // Count files in each percentage bucket
    .reduce((m, perc) => Object.assign(m, { [perc]: m[perc] + 1 }), percs());

// Chart configuration
const size = Number(getInput("chart-size") || 23);
const emptyChar = "░";  // Character for empty part of bar
const fullChar = "█";   // Character for current coverage part of bar
const oldChar = "▒";    // Character for previous coverage part of bar

/**
 * Generates a bar for the chart
 * 
 * @param c - Current count
 * @param o - Old count
 * @param max - Maximum count (for scaling)
 * @returns String representing the bar
 */
const bar = (c: number, o: number, max: number) =>
  fullChar
    .repeat(Math.ceil((c / max) * size))
    .padEnd((o / max) * size, oldChar)
    .padEnd(size, emptyChar);

/**
 * Formats a percentage for display
 * 
 * @param p - Percentage as a decimal
 * @returns Formatted percentage string
 */
const p2s = (p: number) =>
  p
    .toLocaleString("en", { style: "percent", minimumFractionDigits: 1 })
    .padStart(5);

/**
 * Converts coverage distribution to a string chart
 * 
 * @param e - Current coverage distribution
 * @param o - Previous coverage distribution (optional)
 * @returns ASCII chart as a string
 */
const tostr = (e: Record<string, number>, o?: Record<string, number>) => {
  // Find the maximum count for scaling
  const max = Math.max(...Object.values(e), ...Object.values(o || {}));
  // Calculate total files for frequency
  const sum = Object.values(e).reduce((a, v) => a + v, 0);

  return (
    // Chart header
    `Cover ┌─${"─".repeat(size)}─┐ Freq.\n` +
    // Chart rows
    Object.keys(e)
      .map(
        (k) =>
          `${k.padStart(4)}% │ ${bar(e[k], (o && o[k]) || 0, max)} │ ${p2s(
            e[k] / sum
          )}`
      )
      .join("\n") +
    // Chart footer
    `\n      └─${"─".repeat(size)}─┘` +
    // Legend
    `\n *Legend:* ${fullChar} = Current Distribution ` +
    ((o && `/ ${oldChar} = Previous Distribution`) || "")
  );
};

/**
 * Generates a Markdown code block containing a coverage distribution chart
 * 
 * @param c - Current coverage statistics
 * @param o - Previous coverage statistics for comparison
 * @returns Markdown code block with the chart
 */
export const chart = (c: Stats, o: Stats) =>
  "\n```\n" + tostr(reduce(c), o && reduce(o)) + "\n```\n";
