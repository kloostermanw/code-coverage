/**
 * Main entry point for the comment-coverage-clover GitHub Action.
 * This module processes Clover XML coverage reports and posts them as comments on GitHub pull requests.
 * It supports comparing current coverage with a base coverage file and can enforce coverage thresholds.
 */

import { install } from "source-map-support";
install();

import {
  debug,
  error,
  getBooleanInput,
  getInput,
  info,
  setFailed,
  summary,
} from "@actions/core";
import { getOctokit } from "@actions/github";
import { context } from "@actions/github/lib/utils";
import { existsSync, readFile } from "fs";
import { promisify } from "util";
import { RequestError } from "@octokit/request-error";

import { chart } from "./chart";
import { fromString } from "./clover";
import { html } from "./html";
import { Stats, File, StatsMetrics } from "./types";

/**
 * Configuration variables from GitHub Action inputs or environment variables
 */

// Path configuration
const workspace = getInput("dir-prefix") || process.env.GITHUB_WORKSPACE;
const token = getInput("github-token") || process.env.GITHUB_TOKEN;
const file = getInput("file") || process.env.FILE;
let baseFile = getInput("base-file") || process.env.BASE_FILE;

// Filter options
const onlyWithCover = getBooleanInput("only-with-cover");
const onlyWithCoverableLines = getBooleanInput("only-with-coverable-lines");

// Display options
const withChart = getBooleanInput("with-chart");
const skipCommentOnForks = getBooleanInput("skip-comments-on-forks");
const withTable = getBooleanInput("with-table");
const showBranchesColumn = getBooleanInput("with-branches");

// Table filtering options
const tableWithOnlyBellow = Number(getInput("table-below-coverage") || 100);
const tableWithOnlyAbove = Number(getInput("table-above-coverage") || 0);
const tableWithChangeAbove = Number(getInput("table-coverage-change") || 0);
const tableWithTypeLimit = getInput("table-type-coverage") || "lines";

// Comment signature
const signature = `<sub data-file=${JSON.stringify(file)}>${
  getInput("signature") ||
  ':robot: comment via <a href="https://github.com/kloostermanw/comment-coverage-clover">kloostermanw/comment-coverage-clover</a>'
}</sub>`;

// GitHub API client
const github = token && getOctokit(token);

// Coverage thresholds
const maxLineCoverageDecrease = getInput("max-line-coverage-decrease");
const maxMethodCoverageDecrease = getInput("max-method-coverage-decrease");
const minLineCoverage = Number(getInput("min-line-coverage"));
const minMethodCoverage = Number(getInput("min-method-coverage"));

// Additional display options
const showPercentageChangePerFile = getBooleanInput(
  "show-percentage-change-on-table"
);

// Icons for coverage change indicators
const iconEquals = getInput("icon-equals") || ":stop_button:";
const iconIncreased = getInput("icon-increased") || ":arrow_up_small:";
const iconDecreased = getInput("icon-decreased") || ":arrow_down_small:";
const iconNew = getInput("icon-new") || ":new:";

/**
 * Generates the comment content with coverage information
 * 
 * @param cStats - Current coverage statistics
 * @param oldStats - Previous coverage statistics for comparison (if available)
 * @param coverageType - Type of coverage to display (lines, methods, branches)
 * @param withChart - Whether to include a coverage distribution chart
 * @param withTable - Whether to include a detailed coverage table
 * @returns A string with the formatted comment content
 */
const comment = async (
  cStats: Stats,
  oldStats: null | Stats,
  coverageType: keyof StatsMetrics,
  withChart: boolean,
  withTable: boolean
) => {
  // Normalize workspace paths in folder names
  const w = workspace.endsWith("/") ? workspace : workspace.concat("/");
  cStats.folders.forEach((v, k) =>
    cStats.folders.set(
      k,
      Object.assign(v, {
        name: v.name.startsWith(w) ? v.name.slice(w.length) : v.name,
      })
    )
  );

  return (
    (withChart ? chart(cStats, oldStats) : "") +
    html(
      filter(
        cStats,
        {
          cover: onlyWithCover,
          coverableLines: onlyWithCoverableLines,
        },
        {
          type: coverageType,
          min: tableWithOnlyAbove,
          max: tableWithOnlyBellow,
          delta: tableWithChangeAbove,
        },
        oldStats,
      ),
      oldStats,
      {
        withTable,
        deltaPerFile: showPercentageChangePerFile,
        showBranchesColumn,
        icons: {
          equals: iconEquals,
          increased: iconIncreased,
          decreased: iconDecreased,
          new: iconNew,
        },
      }
    )
  );
};


/**
 * Gets the changed lines in a pull request
 *
 * @returns An array of objects containing file names and their changed line ranges
 */
const getPullRequestChanges = async () => {
    try {
        // Check if github client is available
        if (!github) {
            debug('GitHub client not available, cannot fetch PR changes');
            return [];
        }

        const baseUrl = `${context.apiUrl}/repos/${context.repo.owner}/${context.repo.repo}/pulls/${context.issue.number}/files`;
        debug(`Fetching ${baseUrl}`);

        // Make request to GitHub API to get pull request files
        const response = await github.request(`GET ${baseUrl}`);

        // Process the response to extract file names and patches
        const result = [];

        if (!response.data || !Array.isArray(response.data)) {
            debug(`Unexpected response format from GitHub API: ${JSON.stringify(response)}`);
            return [];
        }

        for (const file of response.data) {
            if (!file.patch) continue;

            const lines = [];
            const patchLines = file.patch.split('\n');

            // Extract line ranges from patch hunks
            for (const line of patchLines) {
                if (line.startsWith('@@')) {
                    // Parse the hunk header (e.g., "@@ -1,7 +1,9 @@")
                    const match = line.match(/@@ -(?<old_start>[0-9]+)(,(?<old_count>[0-9]+))? \+(?<new_start>[0-9]+)(,(?<new_count>[0-9]+))? @@/);

                    if (match && match.groups) {
                        const newStart = parseInt(match.groups.new_start);
                        const newCount = parseInt(match.groups.new_count || '1');

                        // Calculate the end line
                        const newEnd = newStart + newCount - 1;

                        // Add the range to lines array
                        if (newStart === newEnd) {
                            lines.push(newStart);
                        } else {
                            lines.push(`${newStart}-${newEnd}`);
                        }
                    }
                }
            }

          // Add file and its changed lines to the result
          if (lines.length > 0) {
              result.push({
                file: file.filename,
                lines: lines
              });
          }
        }

        return result;
    } catch (error) {
        debug(`Error fetching pull request changes: ${errorToString(error)}`);
        return [];
    }
}

/**
 * Filters coverage statistics based on specified criteria
 *
 * @param s - The coverage statistics to filter
 * @param onlyWith - Options to filter files based on coverage presence
 * @param onlyWith.cover - Only include files with some coverage
 * @param onlyWith.coverableLines - Only include files with coverable lines
 * @param onlyBetween - Options to filter files based on coverage percentages
 * @param onlyBetween.type - The type of coverage metric to filter by
 * @param onlyBetween.min - Minimum coverage percentage to include
 * @param onlyBetween.max - Maximum coverage percentage to include
 * @param onlyBetween.delta - Minimum coverage change to include
 * @param o - Previous coverage statistics for comparison
 * @returns Filtered coverage statistics
 */
const filter = (
  s: Stats,
  onlyWith: {
    cover: boolean;
    coverableLines: boolean;
  },
  onlyBetween: {
    type: keyof StatsMetrics;
    min: number;
    max: number;
    delta: number;
  },
  o: Stats = null
): Stats => {
  const filters: ((f: File, folder: string) => boolean)[] = [];
  const w = workspace.endsWith("/") ? workspace : workspace.concat("/");

  // Filter files with no coverage
  if (onlyWith.cover) filters.push((f) => f.metrics.lines.covered !== 0);

  // Filter files with no coverable lines
  if (onlyWith.coverableLines) filters.push((f) => f.metrics.lines.total !== 0);

  if (onlyBetween.type) {
    // Filter files outside the specified coverage percentage range
    if (onlyBetween.min > 0 || onlyBetween.max < 100)
      filters.push((f) =>
        between(
          f.metrics[onlyBetween.type].percentual * 100,
          onlyBetween.min,
          onlyBetween.max
        )
      );

    // Filter files with coverage change less than the specified delta
    if (onlyBetween.delta > 0 && o !== null)
      filters.push((f, folder) => {
        const of = o.get(folder, f.name);

        return (
          !of ||
          Math.abs(
            f.metrics[onlyBetween.type].percentual -
              of.metrics[onlyBetween.type].percentual
          ) *
            100 >
            onlyBetween.delta
        );
      });
  }

  // If no filters are applied, return the original stats
  if (filters.length === 0) {
    return s;
  }

  // Apply all filters to each folder and file
  s.folders.forEach((folder, key) => {
    folder.files = folder.files.filter((f) =>
      filters.reduce((r, fn) => r && fn(f, key), true)
    );
    // Remove empty folders
    if (folder.files.length === 0) {
      s.folders.delete(key);
    }
  });

  return s;
};

/**
 * Checks if a value is between the specified minimum and maximum values
 * 
 * @param v - The value to check
 * @param min - The minimum value (inclusive)
 * @param max - The maximum value (inclusive)
 * @returns True if the value is between min and max, false otherwise
 */
const between = (v: number, min: number, max: number) =>
  min <= (v || 0) && (v || 0) <= max;

/**
 * Checks if coverage meets the specified thresholds
 * Yields error messages for any thresholds that are not met
 * 
 * @param c - Current coverage statistics
 * @param o - Previous coverage statistics for comparison (optional)
 * @yields Error messages for any thresholds that are not met
 */
function* checkThreshold(c: Stats, o?: Stats) {
  const f = (n: number) => n.toFixed(2) + "%";
  
  // Check minimum line coverage threshold
  if (minLineCoverage > c.total.lines.percentual * 100) {
    yield `Minimum line coverage is ${f(minLineCoverage)}, currently it is ${f(
      c.total.lines.percentual * 100
    )}`;
  }

  // Check minimum method coverage threshold
  if (minMethodCoverage > c.total.methods.percentual * 100) {
    yield `Minimum method coverage is ${f(
      minMethodCoverage
    )}, currently it is ${f(c.total.methods.percentual * 100)}`;
  }

  // Skip comparison checks if no previous coverage data
  if (o === undefined) return;

  // Check maximum line coverage decrease threshold
  const lcdiff = (o.total.lines.percentual - c.total.lines.percentual) * 100;
  if (maxLineCoverageDecrease && lcdiff >= Number(maxLineCoverageDecrease)) {
    yield `Line coverage was down by ${f(lcdiff)} (max is ${f(
      Number(maxLineCoverageDecrease)
    )})`;
  }

  // Check maximum method coverage decrease threshold
  const mcdiff =
    (o.total.methods.percentual - c.total.methods.percentual) * 100;
  if (
    maxMethodCoverageDecrease &&
    mcdiff >= Number(maxMethodCoverageDecrease)
  ) {
    yield `Methods coverage was down by ${f(mcdiff)} (max is ${f(
      Number(maxMethodCoverageDecrease)
    )})`;
  }
}

/**
 * Formats OAuth scopes for display
 * 
 * @param scopes - OAuth scopes string
 * @returns Formatted scopes string
 */
const scopesToString = (scopes: null | string) =>
  scopes?.split(/,\s+/)?.join(", ") || "(empty)";

/**
 * Converts an error to a detailed string representation
 * 
 * @param e - The error to convert
 * @returns String representation of the error with additional details
 */
const errorToString = (e: any) =>
  e +
  (e instanceof Error
    ? (e instanceof RequestError
        ? `\nRequest: ${e.request.method} ${e.request.url}` +
          `\nResponse Scopes: ${scopesToString(
            e.response?.headers?.["x-oauth-scopes"]
          )}` +
          `\nResponse Headers: ${JSON.stringify(e.response?.headers || [])}`
        : "") + `\nStack: ${e.stack}`
    : "");

/**
 * Error message for files that cannot be found
 */
const notFoundMessage =
  "was not found, please check if the path is valid, or if it exists.";

/**
 * Main function that runs the GitHub Action
 * 
 * This function:
 * 1. Validates inputs and context
 * 2. Reads and parses coverage files
 * 3. Checks coverage thresholds
 * 4. Generates coverage reports
 * 5. Posts or updates comments on pull requests
 */
const run = async () => {
  // Validate coverage type
  if (!["lines", "methods", "branches"].includes(tableWithTypeLimit)) {
    error(`there is no coverage type ${tableWithTypeLimit}`);
    return;
  }

  // Validate GitHub context
  if (!context.payload.pull_request)
    throw (
      "this action requires a pull request context to be able to comment\n" +
      "https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#pull_request"
    );
  if (!github)
    throw token
      ? "no Github token was informed !"
      : "the Github token informed is not valid";

  const commit = context.payload.pull_request?.head.sha.substring(0, 7);

  // Check if coverage file exists
  if (!existsSync(file)) {
    throw `file "${file}" ${notFoundMessage}`;
  }

  // Parse current coverage file
  const cStats = fromString((await promisify(readFile)(file)).toString());

  const changes = await getPullRequestChanges();

  const prStats = (changes.length > 0) && fromString((await promisify(readFile)(file)).toString(), changes);

  // Check if base coverage file exists
  if (baseFile && !existsSync(baseFile)) {
    error(`base file "${baseFile}" ${notFoundMessage}`);
    baseFile = undefined;
  }

  // Parse base coverage file if it exists
  const oldStats =
    baseFile && fromString((await promisify(readFile)(baseFile)).toString());

  // Check coverage thresholds
  const msgs = Array.from(checkThreshold(prStats, oldStats));

  // Mark action as failed if any thresholds are not met
  msgs.map(setFailed);


  const message = (msgs.length) ? msgs.map((m) => `:warning: ${m}`).join("\n") : "";

  // Generate comment body
  const body = `
Coverage report for commit: ${commit}
File: \`${file}\`

${message}

This PR

${await comment(
    prStats,
    null,
    tableWithTypeLimit as keyof StatsMetrics,
    withChart,
    withTable
)}

${signature}`;

  // Generate GitHub Actions summary
  await summary
    .addHeading(`Coverage Report`)
    .addRaw(`File: <code>${file}</code>`, true)
    .addBreak()
    .write();

  if (msgs.length)
    await summary
      .addBreak()
      .addQuote(msgs.map((m) => `:warning: ${m}`).join("\n"))
      .write();

  await summary
    .addBreak()
    .addRaw(
      await comment(
        cStats,
        oldStats,
        tableWithTypeLimit as keyof StatsMetrics,
        true,
        false
      ),
      true
    )
    .write();

    await summary
        .addBreak()
        .addRaw(
            await comment(
                prStats,
                null,
                tableWithTypeLimit as keyof StatsMetrics,
                true,
                false
            ),
            true
        )
        .write();

  // Exit if not in a pull request context
  if (context.eventName !== "pull_request") {
    return;
  }

  // Check if PR is from a fork
  const isFork =
    `${context.repo.owner}/${context.repo.repo}` !==
    context.payload.pull_request?.head?.repo?.full_name;

  // Skip commenting on forks if configured
      if (skipCommentOnForks && isFork) {
        return;
      }

  // Default filter for bot comments
  let filter = (c: any) => c?.user?.type === "Bot";

  // Get authenticated user for comment filtering
  try {
    const u = await github.rest.users.getAuthenticated();
    filter = (c: any) => c?.user?.login === u.data.login;

    info(
      "Using a PAT from " +
        u.data.login +
        " with scopes: " +
        scopesToString(u.headers?.["x-oauth-scopes"])
    );
  } catch (e) {
    debug(errorToString(e));
  }

  // Find existing comment to update
  let commentId = null;
  try {
    const comments = (
      await github.rest.issues.listComments({
        ...context.repo,
        issue_number: context.issue.number,
      })
    ).data.filter(filter);

    for (let i = comments.length - 1; i >= 0; i--) {
      const c = comments[i];
      if (!c.body?.includes(signature)) continue;
      commentId = c.id;
    }
  } catch (e) {
    error(errorToString(e));
  }

  // Update existing comment if found
  if (commentId) {
    try {
      await github.rest.issues.updateComment({
        ...context.repo,
        comment_id: commentId,
        body,
      });
      return;
    } catch (e) {
      debug(errorToString(e));
    }
  }

  // Create new comment if no existing comment was found or update failed
  await github.rest.issues
    .createComment({
      ...context.repo,
      issue_number: context.issue.number,
      body,
    })
    .catch((e: Error) => {
      if (isFork) {
        debug(errorToString(e));
        return;
      }

      throw new Error(
        "Failed to create a new comment with: " +
          e.message +
          (e.stack ? ". Stack: " + e.stack : "")
      );
    });
};

run().catch((err: Error) => setFailed(errorToString(err)));
