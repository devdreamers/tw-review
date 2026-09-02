import { parse } from "yaml";

import type {
  Heading,
  ParsedMarkdown,
  TechnicalWritingStandard,
} from "./types.js";

function normalizeHeading(title: string): string {
  return title
    .replace(/`/g, "")
    .replace(/^\s*[\d.]+\s*/, "")
    .replace(/[?!！？]+$/, "")
    .trim();
}

function readFrontmatter(lines: string[]): {
  frontmatter: Record<string, unknown>;
  endLine: number;
  error?: string;
} {
  if (lines[0]?.trim() !== "---") {
    return { frontmatter: {}, endLine: 0 };
  }

  const closingIndex = lines.slice(1).findIndex((line) => line.trim() === "---");
  if (closingIndex === -1) {
    return {
      frontmatter: {},
      endLine: 0,
      error: "frontmatter를 닫는 '---'가 없습니다.",
    };
  }

  const endLine = closingIndex + 2;
  try {
    const value = parse(lines.slice(1, endLine - 1).join("\n"));
    if (value == null) {
      return { frontmatter: {}, endLine };
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      return {
        frontmatter: {},
        endLine,
        error: "frontmatter는 key-value 객체여야 합니다.",
      };
    }
    return { frontmatter: value as Record<string, unknown>, endLine };
  } catch (error) {
    return {
      frontmatter: {},
      endLine,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function parseMarkdown(document: string): ParsedMarkdown {
  const lines = document.split(/\r?\n/);
  const frontmatterResult = readFrontmatter(lines);
  const headings: Heading[] = [];
  const proseLines: ParsedMarkdown["proseLines"] = [];
  let fenceMarker: "`" | "~" | undefined;
  let fenceLength = 0;

  for (let index = frontmatterResult.endLine; index < lines.length; index += 1) {
    const line = lines[index];
    const fence = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const marker = fence[1][0] as "`" | "~";
      if (!fenceMarker) {
        fenceMarker = marker;
        fenceLength = fence[1].length;
      } else if (marker === fenceMarker && fence[1].length >= fenceLength) {
        fenceMarker = undefined;
        fenceLength = 0;
      }
      continue;
    }
    if (fenceMarker) {
      continue;
    }

    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      const title = heading[2].trim();
      headings.push({
        depth: heading[1].length,
        line: index + 1,
        title,
        normalizedTitle: normalizeHeading(title),
      });
      continue;
    }

    const withoutInlineCode = line.replace(/`[^`]*`/g, "").trim();
    if (
      withoutInlineCode.length > 0
      && !withoutInlineCode.startsWith("<!--")
      && !withoutInlineCode.startsWith("![")
    ) {
      proseLines.push({ line: index + 1, text: withoutInlineCode });
    }
  }

  return {
    lines,
    headings,
    proseLines,
    frontmatter: frontmatterResult.frontmatter,
    frontmatterError: frontmatterResult.error,
  };
}

export function hasOverview(parsed: ParsedMarkdown): boolean {
  const firstH1 = parsed.headings.find((heading) => heading.depth === 1);
  if (!firstH1) {
    return false;
  }
  const nextH2 = parsed.headings.find(
    (heading) => heading.depth === 2 && heading.line > firstH1.line,
  );
  const lastLine = nextH2 ? nextH2.line : parsed.lines.length + 1;
  return parsed.proseLines.some(
    (line) => line.line > firstH1.line && line.line < lastLine,
  );
}

function normalizeTypeLabel(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function detectDocumentType(
  parsed: ParsedMarkdown,
  standard: TechnicalWritingStandard,
): { type: string | "unknown"; explicit: boolean } {
  const explicitValue = parsed.frontmatter.document_type ?? parsed.frontmatter.documentType;
  if (typeof explicitValue === "string") {
    const normalized = normalizeTypeLabel(explicitValue);
    for (const [type, config] of Object.entries(standard.documentType.types)) {
      if (
        normalizeTypeLabel(type) === normalized
        || config.labels.some((label) => normalizeTypeLabel(label) === normalized)
      ) {
        return { type, explicit: true };
      }
    }
    return { type: "unknown", explicit: true };
  }

  const sectionTitles = parsed.headings
    .filter((heading) => heading.depth >= 2)
    .map((heading) => heading.normalizedTitle);
  const scores = Object.entries(standard.documentType.types).map(([type, config]) => ({
    type,
    score: config.requiredSections.filter((section) =>
      sectionTitles.some((title) => section.aliases.includes(title)),
    ).length,
  })).sort((left, right) => right.score - left.score);

  if (scores.length === 0 || scores[0].score < 2 || scores[0].score === scores[1]?.score) {
    return { type: "unknown", explicit: false };
  }
  return { type: scores[0].type, explicit: false };
}
