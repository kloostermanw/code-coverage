/**
 * HTML module for generating HTML coverage reports
 * This module provides functions to create HTML tables and summaries from coverage data
 */

import { getInput } from "@actions/core";
import { context } from "@actions/github/lib/utils";

import { Coverage, File, Icons, FileMetrics, Stats } from "../types";

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
/**
 * Creates a detailed view of file coverage information
 * 
 * @param file - File object with coverage metrics
 * @param lang - Language for formatting
 * @returns HTML details element with detailed coverage information
 */
const fileDetails = (file: File, lang: string): string => {
  const lineCoverage = file.metrics.lineCoverage || [];
  const methodCoverage = file.metrics.methodCoverage || [];
  
  return fragment(
    table(
      thead(
        tr(
          th("Line"),
          th("Coverage")
        )
      ),
      tbody(
        ...lineCoverage.map(lc => 
          tr(
            td(lc.line),
            td(p2s(lc.coverage === 0 ? 0 : lc.coverage/100, lang, "0%"), { align: "right" })
          )
        ),
        lineCoverage.length === 0 ? tr(td("No line coverage data available", { colspan: 2 })) : ""
      )
    ),
    methodCoverage.length > 0 ? 
      fragment(
        "<br />",
        table(
          thead(
            tr(
              th("Method"),
              th("Coverage")
            )
          ),
          tbody(
            ...methodCoverage.map(mc => 
              tr(
                td(mc.method),
                td(p2s(mc.coverage === 0 ? 0 : mc.coverage/100, lang, "0%"), { align: "right" })
              )
            )
          )
        )
      ) : ""
  );
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
 * @param file - Optional file object for detailed view
 * @returns HTML table row(s)
 */
const line = (
  name: string,
  m: FileMetrics,
  lang: string,
  icons: Icons,
  o: FileMetrics = null,
  showDelta = false,
  showBranchesColumn = true,
  file?: File
): string => {
  /**
   * Creates a table cell for a coverage metric
   * @param metricKey - Key of the metric in FileMetrics
   * @returns HTML table cell
   */
  const createMetricCell = (metricKey: string): string => {
    // Get coverage data
    const coverage = m[metricKey];
    
    // Format coverage as string
    let content = c2s(coverage, lang);
    
    // Add comparison indicator if needed
    if (showDelta && o) {
      const oldCoverage = o[metricKey];
      content += compareFile(coverage, oldCoverage, lang, icons);
    }
    
    // Create the table cell
    return td(content, { align: "right" });
  };
  
  // Determine which metrics to display
  const metricKeys = ["lines", "methods"];
  if (showBranchesColumn) {
    metricKeys.push("branches");
  }
  
  // Create an icon for expanding/collapsing details
  const detailsIcon = file ? span("📊", { style: "cursor: pointer;" }) : "";
  
  // Create the main row with file name and metrics
  const mainRow = tr(
    td(fragment(detailsIcon, " ", name)),
    ...metricKeys.map(createMetricCell)
  );
  
  // Create details row if file is provided
  const detailsRow = file 
    ? tr(
        td(
          details(
            summary("File Details"),
            fileDetails(file, lang)
          ),
          { colspan: showBranchesColumn ? 4 : 3 }
        )
      ) 
    : "";
  
  // Combine rows into a fragment
  return fragment(mainRow, detailsRow);
};

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
): string => {
  /**
   * Creates the summary text with coverage metrics
   * @returns Formatted summary text
   */
  const createSummaryText = (): string => {
    // Create array of coverage metrics
    const metrics = [
      total("Lines", configs.icons, c.total.lines, o?.total.lines),
      total("Methods", configs.icons, c.total.methods, o?.total.methods)
    ];
    
    // Add branches metric if enabled
    if (configs.showBranchesColumn) {
      metrics.push(total("Branches", configs.icons, c.total.branches, o?.total.branches));
    }
    
    // Filter out empty values and join with separator
    const metricsText = metrics
      .filter((v) => v)
      .join(" | ");
    
    return "Summary - " + metricsText;
  };
  
  // Get the appropriate renderer function based on config
  const renderer = configs.withTable
    ? tableWrap(
        c,
        configs.icons,
        o,
        configs.deltaPerFile,
        configs.showBranchesColumn
      )
    : span;
  
  // Generate the HTML using the renderer and summary text
  return renderer(createSummaryText());
};

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
const tableWrap = (
  c: Stats,
  icons: Icons,
  o: Stats = null,
  showDelta = false,
  showBranchesColumn = true
) => {
  /**
   * Creates the table header row
   * @returns HTML table header row
   */
  const createTableHeader = () => {
    const headerCells = [
      th("Files"),
      th("Lines"),
      th("Methods")
    ];
    
    if (showBranchesColumn) {
      headerCells.push(th("Branches"));
    }
    
    return tr(...headerCells);
  };

  /**
   * Creates rows for a folder and its files
   * @param folderKey - Folder key
   * @param folder - Folder object
   * @returns Array of HTML table rows
   */
  const createFolderRows = (folderKey: string, folder: any) => {
    // Folder header row
    const folderRow = tr(td(b(folder.name), { colspan: 4 }));
    
    // File rows
    const fileRows = folder.files.map((f: File) =>
      line(
        `&nbsp; &nbsp;${link(folder.name, f.name)}`,
        f.metrics,
        lang,
        icons,
        o?.get(folderKey, f.name)?.metrics,
        showDelta,
        showBranchesColumn,
        f
      )
    );
    
    return [folderRow, ...fileRows];
  };

  /**
   * Creates the table body content
   * @returns HTML table body content
   */
  const createTableBody = () => {
    if (c.folders.size === 0) {
      return tr(td("No files reported or matching filters", { colspan: 4 }));
    }
    
    // Generate rows for each folder and file
    const folderRows = Array.from(c.folders.entries())
      .map(([k, folder]) => createFolderRows(k, folder))
      .reduce((accum, item) => [...accum, ...item], []);
    
    // Limit table size to fit in GitHub comment
    return limitedFragment(
      65536 - 4000,
      tr(td(b("Table truncated to fit comment"), { colspan: 4 })),
      ...folderRows
    );
  };

  /**
   * Creates the complete coverage table
   * @returns HTML table element
   */
  const createCoverageTable = () => {
    return table(
      thead(createTableHeader()),
      tbody(createTableBody())
    );
  };

  /**
   * @param summaryText - Text to display in the summary element
   * @returns HTML details element with coverage table
   */
  return (summaryText: string): string => {
    return details(
      summary(summaryText),
      "<br />",
      createCoverageTable()
    );
  };
};
