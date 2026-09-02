#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderCliReport } from "./report.js";
import { preparePullRequestReview } from "./review.js";
import { loadStandard } from "./standard.js";
import type { ReviewResult } from "./types.js";
import { validateDocument } from "./validator.js";

type CliOptions = {
  base: string;
  head: string;
  standardPath: string;
  json: boolean;
  fail: boolean;
  files: string[];
};

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function parseArguments(argv: string[]): CliOptions {
  const options: CliOptions = {
    base: "HEAD^",
    head: "HEAD",
    standardPath: resolve(projectRoot, "standards", "technical-writing.yml"),
    json: false,
    fail: false,
    files: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--base") {
      options.base = argv[++index] ?? options.base;
    } else if (argument === "--head") {
      options.head = argv[++index] ?? options.head;
    } else if (argument === "--standard") {
      options.standardPath = resolve(argv[++index] ?? options.standardPath);
    } else if (argument === "--json") {
      options.json = true;
    } else if (argument === "--fail") {
      options.fail = true;
    } else if (argument === "--help") {
      console.log([
        "사용법:",
        "  npm run review -- --base <sha> --head <sha> [--json] [--fail]",
        "  npm run review -- docs/guide.md [docs/reference.mdx] [--json] [--fail]",
      ].join("\n"));
      process.exit(0);
    } else {
      options.files.push(argument);
    }
  }
  return options;
}

async function reviewFiles(options: CliOptions): Promise<ReviewResult> {
  const standard = await loadStandard(options.standardPath);
  const files = await Promise.all(options.files.map(async (path) => {
    const document = await readFile(resolve(path), "utf8");
    const validation = validateDocument(path, document, standard);
    return {
      path,
      status: "modified" as const,
      documentType: validation.documentType,
      findings: validation.findings.slice(0, standard.limits.maxFindings),
    };
  }));
  return {
    standardVersion: standard.version,
    baseSha: "working-tree",
    headSha: "working-tree",
    files,
    ai: { status: "disabled" },
  };
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const standard = await loadStandard(options.standardPath);
  const result = options.files.length > 0
    ? await reviewFiles(options)
    : (await preparePullRequestReview({
      cwd: process.cwd(),
      baseSha: options.base,
      headSha: options.head,
      standard,
    })).result;

  console.log(options.json ? JSON.stringify(result, null, 2) : renderCliReport(result));
  if (options.fail && result.files.some((file) =>
    file.findings.some((finding) => finding.severity === "required"),
  )) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
