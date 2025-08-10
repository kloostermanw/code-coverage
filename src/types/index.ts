/**
 * Types module for the comment-coverage-clover project
 * This module defines the data structures used to represent code coverage information
 */

/**
 * Represents coverage metrics for a specific aspect (lines, methods, branches)
 */
export class Coverage {
  /** Total number of items that could be covered */
  total: number;
  
  /** Number of items that are actually covered */
  covered: number;
  
  /** Coverage percentage as a decimal (0.0 to 1.0) */
  percentual: number | undefined;
  
  /**
   * Creates a new Coverage instance
   * 
   * @param total - Total number of items that could be covered
   * @param covered - Number of items that are actually covered
   */
  constructor(total: number, covered: number) {
    this.total = Number(total);
    this.covered = Number(covered);
    // Calculate percentage, handling division by zero
    this.percentual =
      this.total == 0
        ? 1.0
        : parseFloat((this.covered / this.total).toFixed(4));
  }
}

/**
 * Represents all coverage metrics for a project
 */
export interface StatsMetrics {
  /** Line coverage metrics */
  lines: Coverage;
  
  /** Method coverage metrics */
  methods: Coverage;
  
  /** Branch coverage metrics */
  branches: Coverage;
}

/**
 * Represents detailed coverage metrics for a file
 */
export interface FileMetrics {
  /** Line coverage metrics */
  lines: Coverage;
  
  /** Method coverage metrics */
  methods: Coverage;
  
  /** Branch coverage metrics */
  branches: Coverage;

  /** Detailed line coverage information */
  lineCoverage: Array<{
    line: string;
    coverage: number;
  }>;

  /** Detailed method coverage information */
  methodCoverage: Array<{
    method: string;
    coverage: number;
  }>;
}

/**
 * Represents a source file with coverage metrics
 */
export interface File {
  /** Name of the file */
  name: string;
  
  /** Coverage metrics for the file */
  metrics: FileMetrics;
}

/**
 * Represents a folder containing source files
 */
export class Folder {
  /**
   * Creates a new Folder instance
   *
   * @param name - Name of the folder
   * @param files - Array of files in the folder
   */
  constructor(public name: string, public files: File[] = []) {}

  /**
   * Adds files to the folder
   *
   * @param files - Files to add
   * @returns The folder instance for chaining
   */
  push(...files: File[]): Folder {
    this.files.push(...files);
    return this;
  }

  /**
   * Gets a file by name
   *
   * @param name - Name of the file to get
   * @returns The file if found, null otherwise
   */
  get(name: string): File | null {
    const i = this.files.findIndex((f) => f.name === name);
    return i === -1 ? null : this.files[i];
  }
}

/**
 * Represents coverage statistics for an entire project
 */
export class Stats {
  /**
   * Creates a new Stats instance
   * 
   * @param total - Total coverage metrics for the project
   * @param folders - Map of folders containing files
   */
  constructor(public total: StatsMetrics, public folders: Map<string, Folder>) {}

  /**
   * Gets a file by folder and file name
   * 
   * @param folder - Name of the folder
   * @param file - Name of the file
   * @returns The file if found, null otherwise
   */
  get(folder: string, file: string): File | null {
    return this.folders.get(folder)?.get(file);
  }
}

/**
 * Icons used to represent coverage changes
 */
export class Icons {
  /** Icon for unchanged coverage */
  equals: string;
  
  /** Icon for increased coverage */
  increased: string;
  
  /** Icon for decreased coverage */
  decreased: string;
  
  /** Icon for new files */
  new: string;
}
