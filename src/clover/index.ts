/**
 * Clover module for parsing Clover XML coverage reports
 * This module converts Clover XML data into the project's internal data structures
 */

import { xml2json } from "xml-js";
import { Coverage, Folder, Stats } from "../types";

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
 * @returns Stats object representing the coverage data
 */
export const fromString = (str: string): Stats => {
  // Parse the XML to JSON and extract project data
  const cloverData = parseCloverXML(str);
  
  // Combine all files from packages and project root
  const allFiles = getAllFiles(cloverData);

  console.log("allFiles: ", allFiles);
  
  // Create total coverage metrics
  const totalMetrics = createTotalMetrics(cloverData.metrics._attributes);
  
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
    const fileMetrics = createFileMetrics(m);
    const fileName = extractFileNameFromPath(name);
    
    folderObj.push({
      name: fileName,
      metrics: fileMetrics,
    });
  }
  
  return foldersMap;
};

/**
 * Creates file metrics from Clover XML attributes
 */
const createFileMetrics = (attributes: any) => {
  return {
    lines: new Coverage(attributes.statements, attributes.coveredstatements),
    methods: new Coverage(attributes.methods, attributes.coveredmethods),
    branches: new Coverage(attributes.conditionals, attributes.coveredconditionals),
  };
};

/**
 * Extracts just the file name from a full path
 */
const extractFileNameFromPath = (filePath: string): string => {
  return filePath.split("/").pop() || filePath;
};
