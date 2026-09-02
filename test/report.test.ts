import assert from "node:assert/strict";
import test from "node:test";

import {
  COMMENT_MARKER,
  renderReviewComment,
} from "../src/report.js";
import type { ReviewResult } from "../src/types.js";

test("PR 요약에 규칙 ID, 위치, 갱신 마커를 포함한다", () => {
  const result: ReviewResult = {
    standardVersion: "1.0.0",
    baseSha: "base",
    headSha: "head",
    ai: { status: "skipped" },
    files: [{
      path: "docs/guide.md",
      status: "modified",
      documentType: "learning",
      findings: [{
        ruleId: "TW-ARCH-002",
        severity: "required",
        source: "deterministic",
        scope: "document",
        path: "docs/guide.md",
        line: 1,
        title: "개요 누락",
        reason: "개요가 없습니다.",
        suggestion: "목적을 추가하세요.",
        fingerprint: "TW-ARCH-002:missing-overview",
      }],
    }],
  };
  const comment = renderReviewComment({
    result,
    repository: "company/docs",
    serverUrl: "https://github.example.com",
  });

  assert.match(comment, new RegExp(COMMENT_MARKER));
  assert.match(comment, /TW-ARCH-002/);
  assert.match(comment, /docs\/guide\.md:1/);
});
