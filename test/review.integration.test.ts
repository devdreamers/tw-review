import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { preparePullRequestReview } from "../src/review.js";
import { loadStandard, loadStandardAtRevision } from "../src/standard.js";

const execFileAsync = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf8" });
  return stdout.trim();
}

test("실제 Git 변경에서 기존 부채는 숨기고 새 위반만 보고한다", async () => {
  const repository = await mkdtemp(join(tmpdir(), "technical-writing-review-"));
  try {
    await git(repository, "init", "--quiet");
    await mkdir(join(repository, "docs"));
    await mkdir(join(repository, ".github"));
    const standardSource = await readFile(resolve("standards/technical-writing.yml"), "utf8");
    await writeFile(join(repository, ".github", "technical-writing.yml"), standardSource);
    await writeFile(
      join(repository, "docs", "guide.md"),
      "# 설정 가이드\n\n## 준비\n\n기존 설정을 진행합니다.\n",
    );
    await git(repository, "add", ".github/technical-writing.yml", "docs/guide.md");
    await git(
      repository,
      "-c", "user.name=Test",
      "-c", "user.email=test@example.com",
      "commit", "--quiet", "-m", "base",
    );
    const baseSha = await git(repository, "rev-parse", "HEAD");

    await writeFile(
      join(repository, ".github", "technical-writing.yml"),
      standardSource.replace("version: 1.0.0", "version: 999.0.0"),
    );
    await writeFile(
      join(repository, "docs", "guide.md"),
      "# 설정 가이드\n\n## 준비\n\n기존 설정을 진행합니다.\n설정을 진행합니다.\n",
    );
    await git(repository, "add", ".github/technical-writing.yml", "docs/guide.md");
    await git(
      repository,
      "-c", "user.name=Test",
      "-c", "user.email=test@example.com",
      "commit", "--quiet", "-m", "head",
    );
    const headSha = await git(repository, "rev-parse", "HEAD");
    const standard = await loadStandard(resolve("standards/technical-writing.yml"));
    standard.limits.maxFindings = 1;
    const baseStandard = await loadStandardAtRevision({
      cwd: repository,
      revision: baseSha,
      path: ".github/technical-writing.yml",
    });

    const review = await preparePullRequestReview({
      cwd: repository,
      baseSha,
      headSha,
      standard,
    });

    assert.equal(review.result.files.length, 1);
    assert.equal(baseStandard.version, "1.0.0");
    assert.deepEqual(
      review.result.files[0].findings.map((finding) => finding.ruleId),
      ["TW-SENT-002"],
    );
    assert.equal(review.result.files[0].findings[0].line, 6);
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
});
