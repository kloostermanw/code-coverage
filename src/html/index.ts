/**
 * HTML module for generating HTML coverage reports
 * This module provides functions to create HTML tables and summaries from coverage data
 */

import { getInput } from "@actions/core";
import { context } from "@actions/github/lib/utils";

import { Coverage, File, Icons, Metrics, Stats } from "../types";

import {
  a,
  b,
  details,
  fragment,
  span,
  summary,
  table,
  tbody,
  td,
  th,
  thead,
  tr,
} from "./helper";

/**
 * Language for formatting numbers and percentages
 */
const lang = getInput("lang") || "en-US";

/**
 * Base URL for file links in GitHub
 */
let baseUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/blob/${context.sha}`;

// Adjust base URL if dir-prefix-keep is specified
if (getInput("dir-prefix-keep")) {
  baseUrl = `${baseUrl}/${getInput("dir-prefix-keep")}`.replace(/\/$/, "");
}

/**
 * Formats a percentage value as a string
 * 
 * @param p - Percentage as a decimal
 * @param lang - Language for formatting
 * @param zero - String to display for zero values
 * @returns Formatted percentage string
 */
const p2s = (p: number | undefined, lang: string, zero = "-"): string =>
  p === undefined || p == 0
    ? zero
    : p.toLocaleString(lang, {
        style: "percent",
        minimumFractionDigits: 2,
      });

/**
 * Formats a Coverage object as a span with tooltip
 * 
 * @param c - Coverage object
 * @param lang - Language for formatting
 * @returns HTML span element with coverage percentage and tooltip
 */
const c2s = (c: Coverage, lang: string): string =>
  span(p2s(c.percentual, lang), {
    title:
      c.covered.toLocaleString(lang, { useGrouping: true }) +
      " out of " +
      c.total.toLocaleString(lang, { useGrouping: true }),
  });

/**
 * Formats an object as JSON in a pre tag
 * 
 * @param o - Object to format
 * @param ident - Whether to indent the JSON
 * @returns HTML pre element with JSON content
 */
const json = (o: any, ident = true) =>
  `<pre>${JSON.stringify(o, null, ident ? 2 : null)}</pre>`;

/**
 * Compares file coverage and returns an appropriate icon
 * 
 * @param n - New coverage
 * @param o - Old coverage (or null for new files)
 * @param lang - Language for formatting
 * @param icons - Icons for different coverage states
 * @returns HTML span with appropriate icon
 */
const compareFile = (
  n: Coverage,
  o: null | Coverage,
  lang: string,
  icons: Icons
) =>
  " " +
  (o === null
    ? span(icons.new, { title: "new file" })
    : compare(n, o, lang, true, icons));

/**
 * Interface for objects that can be converted to string
 */
interface Stringable {
  toString: () => string;
}

/**
 * Creates a fragment of HTML content with a size limit
 * If the content exceeds the limit, it will be truncated
 * 
 * @param limit - Maximum length of the fragment
 * @param noSpaceLeft - Content to append when truncated
 * @param children - Content to include in the fragment
 * @returns HTML fragment, possibly truncated
 */
const limitedFragment = (
  limit: number,
  noSpaceLeft: string,
  ...children: Stringable[]
) => {
  limit -= noSpaceLeft.length;
  let html = "";
  for (let c of children) {
    const s = c.toString();
    if (s.length > limit) return html + noSpaceLeft;
    limit -= s.length;
    html += s;
  }

  return html;
};

/**
 * Creates a table row for a file with coverage metrics
 * 
 * @param name - Name of the file
 * @param m - Coverage metrics for the file
 * @param lang - Language for formatting
 * @param icons - Icons for different coverage states
 * @param o - Previous coverage metrics for comparison
 * @param showDelta - Whether to show coverage change indicators
 * @param showBranchesColumn - Whether to include the branches column
 * @returns HTML table row
 */
const line = (
  name: string,
  m: Metrics,
  lang: string,
  icons: Icons,
  o: Metrics = null,
  showDelta = false,
  showBranchesColumn = true
) =>
  tr(
    td(name),
    ...["lines", "methods", ...(showBranchesColumn ? ["branches"] : [])].map(
      (p) =>
        td(
          c2s(m[p], lang) +
            (!showDelta ? "" : compareFile(m[p], o && o[p], lang, icons)),
          {
            align: "right",
          }
        )
    )
  );

/**
 * Compares two coverage values and returns an appropriate icon
 * 
 * @param n - New coverage
 * @param o - Old coverage
 * @param lang - Language for formatting
 * @param showDelta - Whether to show the percentage change in the tooltip
 * @param icons - Icons for different coverage states
 * @returns HTML span with appropriate icon and tooltip
 */
const compare = (
  n: Coverage,
  o: Coverage,
  lang: string,
  showDelta = false,
  icons: Icons
): string =>
  span(
    n.percentual == o.percentual
      ? icons.equals
      : n.percentual < o.percentual
      ? icons.decreased
      : icons.increased,
    {
      title:
        `Was ${p2s(o.percentual || 0, lang, "0%")} before` +
        (showDelta && (n.percentual || 0) !== (o.percentual || 0)
          ? ` (${n.percentual > o.percentual ? "+" : "-"}${p2s(
              Math.abs(n.percentual - o.percentual),
              lang
            )})`
          : ""),
    }
  );

/**
 * Creates a summary of a coverage metric with comparison
 * 
 * @param name - Name of the metric
 * @param icons - Icons for different coverage states
 * @param c - Current coverage
 * @param oldC - Previous coverage for comparison
 * @returns HTML fragment with coverage summary
 */
const total = (name: string, icons: Icons, c: Coverage, oldC?: Coverage) =>
  c.total > 0 &&
  fragment(
    b(name + ":"),
    " ",
    c2s(c, lang),
    " ",
    !oldC ? "" : compare(c, oldC, lang, false, icons)
  );

/**
 * Creates a link to a file in GitHub
 * 
 * @param folder - Folder path
 * @param file - File name
 * @returns HTML anchor element
 */
const link = (folder: string, file: string) =>
  a(`${baseUrl}/${folder}/${file}`, file);

/**
 * Generates HTML coverage report
 * 
 * @param c - Current coverage statistics
 * @param o - Previous coverage statistics for comparison
 * @param configs - Configuration options
 * @param configs.withTable - Whether to include a detailed table
 * @param configs.deltaPerFile - Whether to show coverage changes per file
 * @param configs.showBranchesColumn - Whether to include the branches column
 * @param configs.icons - Icons for different coverage states
 * @returns HTML coverage report
 */
export const html = (
  c: Stats,
  o: Stats = null,
  configs: {
    withTable: boolean;
    deltaPerFile: boolean;
    showBranchesColumn: boolean;
    icons: Icons;
  }
): string =>
  // Use tableWrap if withTable is true, otherwise just use span
  (configs.withTable
    ? tableWrap(
        c,
        configs.icons,
        o,
        configs.deltaPerFile,
        configs.showBranchesColumn
      )
    : span)(
    // Create summary text with coverage metrics
    "Summary - ".concat(
      [
        total("Lines", configs.icons, c.total.lines, o?.total.lines),
        total("Methods", configs.icons, c.total.methods, o?.total.methods),
        configs.showBranchesColumn &&
          total("Branches", configs.icons, c.total.branches, o?.total.branches),
      ]
        .filter((v) => v)
        .join(" | ")
    )
  );

/**
 * Creates a detailed table of coverage metrics wrapped in a collapsible details element
 * 
 * @param c - Current coverage statistics
 * @param icons - Icons for different coverage states
 * @param o - Previous coverage statistics for comparison
 * @param showDelta - Whether to show coverage change indicators
 * @param showBranchesColumn - Whether to include the branches column
 * @returns Function that takes a summary text and returns an HTML details element
 */
const tableWrap =
  (
    c: Stats,
    icons: Icons,
    o: Stats = null,
    showDelta = false,
    showBranchesColumn = true
  ) =>
  /**
   * @param summaryText - Text to display in the summary element
   * @returns HTML details element with coverage table
   */
  (summaryText: string): string =>
    details(
      // Collapsible summary
      summary(summaryText),
      "<br />",
      // Coverage table
      table(
        // Table header
        thead(
          tr(
            th("Files"),
            th("Lines"),
            th("Methods"),
            showBranchesColumn && th("Branches")
          )
        ),
        // Table body
        tbody(
          // Show message if no files
          c.folders.size === 0
            ? tr(td("No files reported or matching filters", { colspan: 4 }))
            : // Limit table size to fit in GitHub comment
              limitedFragment(
                65536 - 4000,
                tr(td(b("Table truncated to fit comment"), { colspan: 4 })),
                // Generate rows for each folder and file
                ...Array.from(c.folders.entries())
                  .map(([k, folder]) => [
                    // Folder row
                    tr(td(b(folder.name), { colspan: 4 })),
                    // File rows
                    ...folder.files.map((f: File) =>
                      line(
                        `&nbsp; &nbsp;${link(folder.name, f.name)}`,
                        f.metrics,
                        lang,
                        icons,
                        o?.get(k, f.name)?.metrics,
                        showDelta,
                        showBranchesColumn
                      )
                    ),
                  ])
                  .reduce((accum, item) => [...accum, ...item], [])
              )
        )
      )
    );
