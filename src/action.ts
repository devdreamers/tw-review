import { existsSync } from "node:fs";
import { resolve } from "node:path";

import * as core from "@actions/core";
import * as github from "@actions/github";

import { runAiReview } from "./ai.js";
import {
  COMMENT_MARKER,
  getAllFindings,
  getReviewStatus,
  renderReviewComment,
} from "./report.js";
import { preparePullRequestReview } from "./review.js";
import { loadStandard, loadStandardAtRevision } from "./standard.js";
import type { Finding, ReviewResult, TechnicalWritingStandard } from "./types.js";
import { countBySeverity } from "./validator.js";

function requiredInputSha(name: "base-sha" | "head-sha", fallback?: string): string {
  const value = core.getInput(name) || fallback;
  if (!value) {
    throw new Error(`${name}를 결정할 수 없습니다. pull_request 이벤트가 아니라면 입력값을 지정하세요.`);
  }
  if (!/^[0-9a-f]{7,64}$/i.test(value)) {
    throw new Error(`${name}는 Git commit SHA여야 합니다.`);
  }
  return value;
}

function parseMaxAiFindings(): number {
  const value = Number(core.getInput("max-ai-findings") || "5");
  if (!Number.isInteger(value) || value < 1 || value > 20) {
    throw new Error("max-ai-findings는 1에서 20 사이의 정수여야 합니다.");
  }
  return value;
}

function addAiFindings(result: ReviewResult, findings: Finding[]): void {
  for (const finding of findings) {
    const file = result.files.find((candidate) => candidate.path === finding.path);
    if (file) {
      file.findings.push(finding);
    }
  }
}

function emitAnnotations(result: ReviewResult, failOnRequired: boolean): void {
  for (const finding of getAllFindings(result)) {
    const properties: core.AnnotationProperties = {
      title: `[${finding.ruleId}] ${finding.title}`,
      file: finding.path,
      ...(finding.line ? { startLine: finding.line, endLine: finding.line } : {}),
    };
    const message = finding.suggestion
      ? `${finding.reason}\n수정 제안: ${finding.suggestion}`
      : finding.reason;
    if (finding.severity === "required") {
      if (failOnRequired) {
        core.error(message, properties);
      } else {
        core.warning(message, properties);
      }
    } else if (finding.severity === "confirmation") {
      core.warning(message, properties);
    } else {
      core.notice(message, properties);
    }
  }
}

async function postOrUpdateComment(token: string, body: string): Promise<void> {
  const pullRequest = github.context.payload.pull_request;
  if (!pullRequest) {
    core.info("pull_request 이벤트가 아니므로 PR 코멘트를 작성하지 않습니다.");
    return;
  }

  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;
  const issueNumber = pullRequest.number;
  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });
  const existing = comments.find((comment) => comment.body?.includes(COMMENT_MARKER));
  if (existing) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
  } else {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });
  }
}

async function run(): Promise<void> {
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
  const actionPath = process.env.GITHUB_ACTION_PATH ?? resolve(workspace);
  const pullRequest = github.context.payload.pull_request;
  const baseSha = requiredInputSha("base-sha", pullRequest?.base.sha);
  const headSha = requiredInputSha("head-sha", pullRequest?.head.sha);
  const customStandardPath = core.getInput("standard-path");
  const defaultStandardPath = resolve(actionPath, "standards", "technical-writing.yml");
  if (!customStandardPath && !existsSync(defaultStandardPath)) {
    throw new Error(`문서 표준 파일을 찾을 수 없습니다: ${defaultStandardPath}`);
  }

  const failOnRequired = core.getBooleanInput("fail-on-required");
  const shouldComment = core.getBooleanInput("comment");
  const shouldRunAi = core.getBooleanInput("ai-review");
  const apiKey = core.getInput("anthropic-api-key");
  const model = core.getInput("model") || "claude-sonnet-5";
  const githubToken = core.getInput("github-token");
  if (apiKey) {
    core.setSecret(apiKey);
  }
  if (githubToken) {
    core.setSecret(githubToken);
  }

  let standard: TechnicalWritingStandard;
  if (customStandardPath) {
    const [baseStandard] = await Promise.all([
      loadStandardAtRevision({
        cwd: workspace,
        revision: baseSha,
        path: customStandardPath,
      }),
      loadStandardAtRevision({
        cwd: workspace,
        revision: headSha,
        path: customStandardPath,
      }),
    ]);
    standard = baseStandard;
    core.info(`PR base revision의 사용자 표준을 적용합니다: ${customStandardPath}`);
  } else {
    standard = await loadStandard(defaultStandardPath);
  }
  const prepared = await preparePullRequestReview({
    cwd: workspace,
    baseSha,
    headSha,
    standard,
  });

  if (!shouldRunAi) {
    prepared.result.ai = { status: "disabled" };
  } else if (!apiKey) {
    prepared.result.ai = {
      status: "skipped",
      message: "ANTHROPIC_API_KEY가 없어 결정적 검사만 실행했습니다.",
    };
  } else if (prepared.documents.length === 0) {
    prepared.result.ai = {
      status: "skipped",
      model,
      message: "AI가 검토할 Markdown 변경이 없습니다.",
    };
  } else {
    try {
      const aiReview = await runAiReview({
        apiKey,
        model,
        maxFindings: parseMaxAiFindings(),
        documents: prepared.documents,
        standard,
      });
      addAiFindings(prepared.result, aiReview.findings);
      prepared.result.ai = {
        status: "completed",
        model,
        promptVersion: standard.ai.promptVersion,
        inputTokens: aiReview.inputTokens,
        outputTokens: aiReview.outputTokens,
        message: aiReview.summary,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      core.warning(`AI 의미 리뷰를 완료하지 못했습니다: ${message}`);
      prepared.result.ai = { status: "failed", model, message };
    }
  }

  const commentBody = renderReviewComment({
    result: prepared.result,
    repository: process.env.GITHUB_REPOSITORY,
    serverUrl: process.env.GITHUB_SERVER_URL,
  });
  emitAnnotations(prepared.result, failOnRequired);
  await core.summary.addRaw(commentBody.replace(COMMENT_MARKER, "").trim(), true).write();

  if (shouldComment && githubToken) {
    try {
      await postOrUpdateComment(githubToken, commentBody);
    } catch (error) {
      core.warning(`PR 요약 코멘트를 작성하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const counts = countBySeverity(getAllFindings(prepared.result));
  core.setOutput("status", getReviewStatus(prepared.result));
  core.setOutput("required-count", counts.required);
  core.setOutput("recommended-count", counts.recommended);
  core.setOutput("confirmation-count", counts.confirmation);
  core.setOutput("standard-version", prepared.result.standardVersion);

  if (failOnRequired && counts.required > 0) {
    core.setFailed(`필수 기술 문서 표준 위반 ${counts.required}개를 확인했습니다.`);
  }
}

run().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
