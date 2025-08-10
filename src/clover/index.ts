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
  // Parse the XML to JSON
  const {
    coverage: {
      project: {
        metrics: { _attributes: m },
        file: files,
        package: packages,
      },
    },
  } = JSON.parse(xml2json(str, { compact: true })) as CloverXML;

  // Combine files from packages and project root
  const allFiles = asList(packages).reduce(
    (acc, p) => [...acc, ...asList(p.file)],
    asList(files)
  );

  // Create Stats object from parsed data
  return new Stats(
    {
      // Create total metrics
      lines: new Coverage(m.statements, m.coveredstatements),
      methods: new Coverage(m.methods, m.coveredmethods),
      branches: new Coverage(m.conditionals, m.coveredconditionals),
    },
    allFiles
      // Normalize file names
      .map((f) => {
        f._attributes.name = f._attributes.path || f._attributes.name;
        return f;
      })
      // Sort files by name
      .sort((a, b) => (a._attributes.name < b._attributes.name ? -1 : 1))
      // Extract folder from file path
      .map((f) => ({
        ...f,
        folder: f._attributes.name.split("/").slice(0, -1).join("/"),
      }))
      // Group files by folder
      .reduce(
        (
          files,
          { folder, _attributes: { name }, metrics: { _attributes: m } }
        ) =>
          files.set(
            folder,
            (files.get(folder) || new Folder(folder)).push({
              name: name.split("/").pop(),
              metrics: {
                lines: new Coverage(m.statements, m.coveredstatements),
                methods: new Coverage(m.methods, m.coveredmethods),
                branches: new Coverage(m.conditionals, m.coveredconditionals),
              },
            })
          ),
        new Map<string, Folder>()
      )
  );
};
