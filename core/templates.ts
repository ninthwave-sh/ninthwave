// Decomposition template loading and matching.
//
// Templates are markdown files in the templates/ directory that define
// common decomposition patterns (API endpoint, frontend component, etc.).
// The /decompose skill uses these to suggest starting points during Phase 2.

import { readdirSync, readFileSync } from "fs";
import { join, basename } from "path";

export interface DecompositionTemplate {
  /** Slug derived from filename, e.g. "api-endpoint" */
  slug: string;
  /** Human-readable name from the H1 heading */
  name: string;
  /** Keywords for matching against feature descriptions */
  keywords: string[];
  /** Full markdown body of the template */
  body: string;
}

export interface TemplateMatch {
  template: DecompositionTemplate;
  /** Number of keyword hits (higher = better match) */
  score: number;
}

/**
 * Parse a template markdown file into a DecompositionTemplate.
 *
 * Expected format:
 * - Line 1: `# Template Name`
 * - A `## Keywords` section with a comma-separated list of terms
 * - Remaining content is the full body
 */
export function parseTemplate(
  filename: string,
  content: string,
): DecompositionTemplate {
  const slug = basename(filename, ".md");

  // Extract name from first H1
  const nameMatch = content.match(/^#\s+(.+)$/m);
  const name = nameMatch ? nameMatch[1].trim() : slug;

  // Extract keywords from ## Keywords section.
  // Walk lines to avoid regex flag conflicts between `m` (^ per line) and `s` (. matches \n).
  const lines = content.split("\n");
  let keywordsRaw = "";
  let inKeywords = false;
  for (const line of lines) {
    if (/^##\s+Keywords/i.test(line)) {
      inKeywords = true;
      continue;
    }
    if (inKeywords && /^##\s/.test(line)) break;
    if (inKeywords && line.trim()) {
      keywordsRaw += (keywordsRaw ? ", " : "") + line.trim();
    }
  }
  const keywords = keywordsRaw
    .split(/[,\n]+/)
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length > 0);

  return { slug, name, keywords, body: content };
}

/**
 * Load all decomposition templates from a directory.
 *
 * @param templatesDir - Absolute path to the templates/ directory
 * @returns Array of parsed templates, sorted by name
 */
export function loadTemplates(
  templatesDir: string,
  readDir: (path: string) => string[] = (p) => readdirSync(p),
  readFile: (path: string) => string = (p) =>
    readFileSync(p, "utf-8"),
): DecompositionTemplate[] {
  let entries: string[];
  try {
    entries = readDir(templatesDir);
  } catch {
    return [];
  }

  const mdFiles = entries
    .filter((f) => f.endsWith(".md"))
    .sort();

  return mdFiles.map((f) => {
    const content = readFile(join(templatesDir, f));
    return parseTemplate(f, content);
  });
}

/**
 * Match templates against a feature description.
 *
 * Scores each template by counting how many of its keywords appear in the
 * description (case-insensitive, word-boundary aware). Returns matches
 * sorted by score descending, filtered to score > 0.
 *
 * @param description - The feature description to match against
 * @param templates - Available templates to score
 * @returns Matching templates sorted by relevance (best first)
 */
export function matchTemplates(
  description: string,
  templates: DecompositionTemplate[],
): TemplateMatch[] {
  const descLower = description.toLowerCase();

  const matches: TemplateMatch[] = [];

  for (const template of templates) {
    let score = 0;
    for (const keyword of template.keywords) {
      // Use word boundary matching for single words,
      // substring match for multi-word keywords
      if (keyword.includes(" ")) {
        if (descLower.includes(keyword)) score++;
      } else {
        const pattern = new RegExp(`\\b${escapeRegex(keyword)}\\b`, "i");
        if (pattern.test(descLower)) score++;
      }
    }
    if (score > 0) {
      matches.push({ template, score });
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}

/** Escape special regex characters in a string. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
