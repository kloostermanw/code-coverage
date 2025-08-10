/**
 * HTML helper module
 * This module provides utility functions for generating HTML elements
 */

/**
 * Interface for objects that can be converted to string
 */
interface Stringable {
  toString: () => string;
}

/**
 * Creates an HTML tag with the given name, children, and attributes
 * 
 * @param name - Tag name
 * @returns Function that takes children and attributes and returns an HTML string
 */
const tag =
  (name: string) =>
  /**
   * @param children - Array of child elements
   * @param attr - Optional attributes for the tag
   * @returns HTML string
   */
  (children: Stringable[], attr?: Record<string, Stringable>) =>
    `<${name}${
      // Add attributes if provided
      (attr &&
        " ".concat(
          Object.keys(attr)
            .map((k) => k + "=" + JSON.stringify(attr[k]))
            .join(" ")
        )) ||
      ""
    }>${children.join("")}</${name}>`;

/**
 * Creates a function that generates an HTML tag with the given name
 * 
 * @param name - Tag name
 * @returns Function that takes children and returns an HTML string
 */
export const c =
  (name: string) =>
  /**
   * @param children - Child elements
   * @returns HTML string
   */
  (...children: Stringable[]) =>
    tag(name)(children);

// HTML tag generators
export const details = c("details");  // Creates a collapsible details element
export const summary = c("summary");  // Creates a summary for a details element
export const table = c("table");      // Creates a table
export const tbody = c("tbody");      // Creates a table body
export const thead = c("thead");      // Creates a table header
export const tr = c("tr");            // Creates a table row
export const th = c("th");            // Creates a table header cell
/**
 * Creates a table data cell
 * 
 * @param content - Cell content
 * @param attr - Optional attributes for the cell
 * @returns HTML td element
 */
export const td = (content: Stringable, attr?: Record<string, Stringable>) =>
  tag("td")([content], attr);
export const b = c("b");              // Creates bold text

/**
 * Creates a fragment of HTML content
 * 
 * @param children - Content to include in the fragment
 * @returns HTML fragment
 */
export const fragment = (...children: Stringable[]) => children.join("");

/**
 * Creates a span element
 * 
 * @param content - Span content
 * @param attr - Optional attributes for the span
 * @returns HTML span element
 */
export const span = (content: Stringable, attr?: Record<string, Stringable>) =>
  tag("span")([content], attr);

/**
 * Creates an anchor element
 * 
 * @param href - Link URL
 * @param content - Link text
 * @returns HTML anchor element
 */
export const a = (href: string, content: string) =>
  tag("a")([content], { href });
