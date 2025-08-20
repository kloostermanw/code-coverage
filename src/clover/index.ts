/**
 * Clover module for parsing Clover XML coverage reports
 * This module converts Clover XML data into the project's internal data structures
 */

import { xml2json } from "xml-js";
import { Coverage, Folder, Stats } from "../types";
import {getInput} from "@actions/core";

/**
 * Interface representing metrics in Clover XML format
 */
interface CloverXMLMetrics {
  _attributes: {
    loc: number;                  // Lines of code
    ncloc: number;                // Non-comment lines of code
    classes: number;              // Number of classes
    methods: number;              // Number of methods
    conditionals: number;         // Number of conditionals (branches)
    statements: number;           // Number of statements
    elements: number;             // Total number of elements
    coveredclasses: number;       // Number of covered classes
    coveredmethods: number;       // Number of covered methods
    coveredconditionals: number;  // Number of covered conditionals
    coveredstatements: number;    // Number of covered statements
    coveredelements: number;      // Number of covered elements
  };
}

/**
 * Interface representing a file in Clover XML format
 */
interface CloverFileXML {
  _attributes: {
    name: string;   // File name
    path?: string;  // File path
  };
  class: {
    name: string;   // Class name
  };
  metrics: CloverXMLMetrics;  // File metrics
}

/**
 * Interface representing a package in Clover XML format
 */
interface CloverPackageXML {
  file: CloverFileXML | CloverFileXML[];  // Files in the package
}

/**
 * Interface representing the root Clover XML structure
 */
interface CloverXML {
  coverage: {
    generated: string;  // Generation timestamp
    project: {
      timespamp: number;  // Project timestamp
      file?: CloverFileXML[] | CloverFileXML;  // Files directly in project
      package?: CloverPackageXML[] | CloverPackageXML;  // Packages in project
      metrics: CloverXMLMetrics & { files: number };  // Project metrics
    };
  };
}

const workspace = getInput("dir-prefix") || process.env.GITHUB_WORKSPACE;

/**
 * Converts a value to an array, handling undefined, single items, and arrays
 * 
 * @param arg - Value to convert to an array
 * @returns Array containing the value(s)
 */
const asList = <T>(arg: undefined | T | T[]): T[] =>
  !!arg ? (Array.isArray(arg) ? arg : [arg]) : [];

/**
 * Parses a Clover XML string and converts it to Stats
 * 
 * @param str - Clover XML string
 * @param pullRequestFiles - Optional array of files with line information to include in the coverage data
 * @returns Stats object representing the coverage data
 */
export const fromString = (str: string, pullRequestFiles = []): Stats => {
    // Parse the XML to JSON and extract project data
    const cloverData = parseCloverXML(str);

    // Combine all files from packages and project root
    let allFiles = getAllFiles(cloverData);

    // Create total coverage metrics
    let totalMetrics = createTotalMetrics(cloverData.metrics._attributes);
  
    // Filter files by pull request files if specified
    if (pullRequestFiles.length > 0) {
        const w = workspace.endsWith("/") ? workspace : workspace.concat("/");
        const hasLineInfo = pullRequestFiles.length > 0 && pullRequestFiles[0].hasOwnProperty('lines');

        // Filter files based on the PR files
        allFiles = allFiles.filter(file => {
          const fileName = file._attributes.name.startsWith(w) ? file._attributes.name.slice(w.length) : file._attributes.name;
          return pullRequestFiles.some(f => {
            if (hasLineInfo) {
              return f.file && f.file.includes(fileName);
            } else {
              return f.includes(fileName);
            }
          });
        });

        // The CloverData.metrics need to be updated to reflect the filtered files
        let statements = 0;
        let coveredStatements = 0;
        let methods = 0;
        let coveredMethods = 0;
        let conditionals = 0;
        let coveredConditionals = 0;

        allFiles.forEach(file => {
            const fileName = file._attributes.name.startsWith(w) ? file._attributes.name.slice(w.length) : file._attributes.name;
            
            if (hasLineInfo) {
                // Find the corresponding PR file with line information
                const prFile = pullRequestFiles.find(f => f.file && f.file.includes(fileName));
                
                if (prFile && prFile.lines && prFile.lines.length > 0) {
                    // Process only the specified lines
                    const lineRanges = prFile.lines.map(lineInfo => {
                        if (typeof lineInfo === 'number') {
                            return { start: lineInfo, end: lineInfo };
                        } else if (typeof lineInfo === 'string' && lineInfo.includes('-')) {
                            const [start, end] = lineInfo.split('-').map(Number);
                            return { start, end };
                        }
                        return null;
                    }).filter(Boolean);
                    
                    // Count only statements in the specified line ranges
                    // Note: This is a simplified approach as we don't have line-by-line coverage data
                    // We're approximating by proportionally counting statements in the changed lines
                    const totalLines = file.metrics._attributes.statements;
                    const coveredLines = file.metrics._attributes.coveredstatements;
                    
                    // Calculate the total number of lines in all ranges
                    const totalRangeLines = lineRanges.reduce((sum, range) => 
                        sum + (range.end - range.start + 1), 0);
                    
                    // Calculate the proportion of statements in the changed lines
                    const proportion = totalLines > 0 ? totalRangeLines / totalLines : 1;
                    
                    // Apply the proportion to get an estimate of statements in the changed lines
                    const rangeStatements = Math.round(totalLines * proportion);
                    const rangeCoveredStatements = Math.round(coveredLines * proportion);
                    
                    statements += rangeStatements;
                    coveredStatements += rangeCoveredStatements;
                    
                    // Do the same for methods and conditionals
                    const methodTotal = file.metrics._attributes.methods || 0;
                    const methodProportion = methodTotal > 0 ? totalRangeLines / methodTotal : 1;
                    methods += Math.round(methodTotal * methodProportion);
                    coveredMethods += Math.round(file.metrics._attributes.coveredmethods * methodProportion);
                    
                    const conditionalTotal = file.metrics._attributes.conditionals || 0;
                    const conditionalProportion = conditionalTotal > 0 ? totalRangeLines / conditionalTotal : 1;
                    conditionals += Math.round(conditionalTotal * conditionalProportion);
                    coveredConditionals += Math.round(file.metrics._attributes.coveredconditionals * conditionalProportion);
                } else {
                    // If we have line info but not for this file, count all lines
                    statements += file.metrics._attributes.statements;
                    coveredStatements += file.metrics._attributes.coveredstatements;
                    methods += file.metrics._attributes.methods;
                    coveredMethods += file.metrics._attributes.coveredmethods;
                    conditionals += file.metrics._attributes.conditionals;
                    coveredConditionals += file.metrics._attributes.coveredconditionals;
                }
            } else {
                // If no line info is provided, count all lines (original behavior)
                statements += file.metrics._attributes.statements;
                coveredStatements += file.metrics._attributes.coveredstatements;
                methods += file.metrics._attributes.methods;
                coveredMethods += file.metrics._attributes.coveredmethods;
                conditionals += file.metrics._attributes.conditionals;
                coveredConditionals += file.metrics._attributes.coveredconditionals;
            }
        });

        totalMetrics = {
            lines: new Coverage(statements, coveredStatements),
            methods: new Coverage(methods, coveredMethods),
            branches: new Coverage(conditionals, coveredConditionals),
        };
    }

    // Process files and group by folders
    const foldersMap = processFilesIntoFolders(allFiles);

    return new Stats(totalMetrics, foldersMap);
};

/**
 * Parses the Clover XML string and extracts the project data
 */
const parseCloverXML = (str: string) => {
  const parsed = JSON.parse(xml2json(str, { compact: true })) as CloverXML;
  return parsed.coverage.project;
};

/**
 * Combines files from packages and project root into a single array
 */
const getAllFiles = (projectData: any): CloverFileXML[] => {
  const filesFromRoot = asList(projectData.file);
  const filesFromPackages = asList(projectData.package).reduce(
    (acc, pkg) => [...acc, ...asList(pkg.file)],
    [] as CloverFileXML[]
  );
  
  return [...filesFromRoot, ...filesFromPackages];
};

/**
 * Creates total coverage metrics from Clover XML attributes
 */
const createTotalMetrics = (attributes: any) => {
  return {
    lines: new Coverage(attributes.statements, attributes.coveredstatements),
    methods: new Coverage(attributes.methods, attributes.coveredmethods),
    branches: new Coverage(attributes.conditionals, attributes.coveredconditionals),
  };
};

/**
 * Processes all files and groups them into folders
 */
const processFilesIntoFolders = (files: CloverFileXML[]): Map<string, Folder> => {
  // First, normalize and sort files
  const normalizedFiles = normalizeFileNames(files);
  const sortedFiles = sortFilesByName(normalizedFiles);
  const filesWithFolders = extractFolderPaths(sortedFiles);
  
  // Then group by folder
  return groupFilesByFolder(filesWithFolders);
};

/**
 * Normalizes file names by using path if available
 */
const normalizeFileNames = (files: CloverFileXML[]): CloverFileXML[] => {
  return files.map((file) => {
    file._attributes.name = file._attributes.path || file._attributes.name;
    return file;
  });
};

/**
 * Sorts files alphabetically by name
 */
const sortFilesByName = (files: CloverFileXML[]): CloverFileXML[] => {
  return files.sort((a, b) => 
    a._attributes.name < b._attributes.name ? -1 : 1
  );
};

/**
 * Extracts folder paths from file names
 */
const extractFolderPaths = (files: CloverFileXML[]) => {
  return files.map((file) => ({
    ...file,
    folder: extractFolderFromPath(file._attributes.name),
  }));
};

/**
 * Extracts folder path from a file path
 */
const extractFolderFromPath = (filePath: string): string => {
  return filePath.split("/").slice(0, -1).join("/");
};

/**
 * Groups files by their folder paths
 */
const groupFilesByFolder = (filesWithFolders: any[]): Map<string, Folder> => {
  const foldersMap = new Map<string, Folder>();
  
  for (const fileData of filesWithFolders) {
    const { folder, _attributes: { name }, metrics: { _attributes: m } } = fileData;
    
    // Get or create folder
    if (!foldersMap.has(folder)) {
      foldersMap.set(folder, new Folder(folder));
    }
    
    const folderObj = foldersMap.get(folder)!;
    
    // Create file metrics and add to folder
    const fileMetrics = createFileMetrics(m, fileData);
    const fileName = extractFileNameFromPath(name);
    
    folderObj.push({
      name: fileName,
      metrics: fileMetrics,
    });
  }
  
  return foldersMap;
};

/**
 * Creates file metrics from Clover XML attributes and line data
 */
const createFileMetrics = (attributes: any, fileData?: any) => {
  const lineCoverage: Array<{line: string, coverage: number}> = [];
  const methodCoverage: Array<{method: string, coverage: number}> = [];
  
  // Process line coverage if file data is available
  if (fileData && fileData.line) {
    const lines = Array.isArray(fileData.line) ? fileData.line : [fileData.line];
    
    // Group lines by coverage status
    const lineGroups: {[key: string]: {start: number, end: number, coverage: number}[]} = {};
    
    lines.forEach((line: any) => {
      const lineNum = parseInt(line._attributes.num, 10);
      const count = parseInt(line._attributes.count, 10);
      const coverage = count > 0 ? 100 : 0;
      
      // Add to appropriate group
      const key = `${coverage}`;
      if (!lineGroups[key]) {
        lineGroups[key] = [];
      }
      
      // Check if we can extend the last range
      const lastRange = lineGroups[key][lineGroups[key].length - 1];
      if (lastRange && lastRange.end === lineNum - 1) {
        lastRange.end = lineNum;
      } else {
        lineGroups[key].push({ start: lineNum, end: lineNum, coverage });
      }
      
      // If it's a method, add to method coverage
      if (line._attributes.type === 'method') {
        methodCoverage.push({
          method: line._attributes.name,
          coverage: coverage
        });
      }
    });
    
    // Convert groups to line coverage format
    Object.keys(lineGroups).forEach(coverageKey => {
      lineGroups[coverageKey].forEach(range => {
        lineCoverage.push({
          line: range.start === range.end ? `${range.start}` : `${range.start}-${range.end}`,
          coverage: range.coverage
        });
      });
    });
  }
  
  return {
    lines: new Coverage(attributes.statements, attributes.coveredstatements),
    methods: new Coverage(attributes.methods, attributes.coveredmethods),
    branches: new Coverage(attributes.conditionals, attributes.coveredconditionals),
    lineCoverage,
    methodCoverage
  };
};

/**
 * Extracts just the file name from a full path
 */
const extractFileNameFromPath = (filePath: string): string => {
  return filePath.split("/").pop() || filePath;
};
