import { execFile } from "node:child_process";

import type { ChangedDocument } from "./types.js";

function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      { cwd, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`git ${args.join(" ")} 실패: ${stderr.trim() || error.message}`));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

export function parseChangedDocuments(output: string): ChangedDocument[] {
  const values = output.split("\0").filter((value) => value.length > 0);
  const documents: ChangedDocument[] = [];
  for (let index = 0; index < values.length;) {
    const status = values[index++];
    if (status.startsWith("R")) {
      const previousPath = values[index++];
      const path = values[index++];
      if (previousPath && path) {
        documents.push({ status: "renamed", previousPath, path });
      }
      continue;
    }

    const path = values[index++];
    if (!path) {
      continue;
    }
    documents.push({
      status: status === "A" ? "added" : "modified",
      path,
    });
  }
  return documents;
}

export async function getChangedDocuments(
  cwd: string,
  baseSha: string,
  headSha: string,
): Promise<ChangedDocument[]> {
  const output = await runGit([
    "diff",
    "--name-status",
    "-z",
    "--find-renames",
    "--diff-filter=AMR",
    baseSha,
    headSha,
    "--",
    "*.md",
    "*.mdx",
  ], cwd);
  return parseChangedDocuments(output);
}

export async function getDocumentAtRevision(
  cwd: string,
  revision: string,
  path: string,
): Promise<string | undefined> {
  try {
    return await runGit(["show", `${revision}:${path}`], cwd);
  } catch {
    return undefined;
  }
}

export async function getDocumentDiff(
  cwd: string,
  baseSha: string,
  headSha: string,
  path: string,
): Promise<string> {
  return runGit([
    "diff",
    "--unified=0",
    "--no-color",
    baseSha,
    headSha,
    "--",
    path,
  ], cwd);
}

export function getChangedLineNumbers(diff: string): Set<number> {
  const lines = new Set<number>();
  for (const line of diff.split(/\r?\n/)) {
    const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!match) {
      continue;
    }
    const start = Number(match[1]);
    const count = match[2] == null ? 1 : Number(match[2]);
    for (let offset = 0; offset < count; offset += 1) {
      lines.add(start + offset);
    }
  }
  return lines;
}

export function hasDocumentContentChanges(diff: string): boolean {
  return /^@@ /m.test(diff);
}
