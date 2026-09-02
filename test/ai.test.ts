import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { normalizeAiFindings } from "../src/ai.js";
import { parseStandard } from "../src/standard.js";

test("허용된 규칙과 파일에 대한 신뢰도 높은 AI 결과만 사용한다", async () => {
  const standard = parseStandard(await readFile(resolve("standards/technical-writing.yml"), "utf8"));
  const output = {
    summary: "문맥 확인이 필요합니다.",
    findings: [
      {
        rule_id: "TW-CONTEXT-002",
        path: "docs/guide.md",
        line: 3,
        target_text: "설정하세요",
        reason: "대상 독자의 사전 지식이 드러나지 않습니다.",
        suggestion: "대상 독자와 필요한 권한을 먼저 설명하세요.",
        confidence: 0.9,
      },
      {
        rule_id: "UNKNOWN",
        path: "docs/guide.md",
        line: 3,
        target_text: null,
        reason: "허용되지 않은 규칙입니다.",
        suggestion: null,
        confidence: 1,
      },
      {
        rule_id: "TW-CONTEXT-001",
        path: "docs/guide.md",
        line: 3,
        target_text: null,
        reason: "신뢰도가 낮습니다.",
        suggestion: null,
        confidence: 0.2,
      },
    ],
  };
  const findings = normalizeAiFindings({
    output,
    documents: [{
      path: "docs/guide.md",
      status: "modified",
      content: "# 가이드\n\n설정하세요.",
      diff: "+설정하세요.",
      changedLines: new Set([3]),
      documentType: "unknown",
    }],
    semanticRules: standard.semanticRules,
    minConfidence: standard.ai.minConfidence,
    maxFindings: 5,
  });

  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleId, "TW-CONTEXT-002");
  assert.equal(findings[0].severity, "confirmation");
  assert.equal(findings[0].line, 3);
});

test("변경 라인이나 원문과 일치하지 않는 AI 결과는 버린다", async () => {
  const standard = parseStandard(await readFile(resolve("standards/technical-writing.yml"), "utf8"));
  const findings = normalizeAiFindings({
    output: {
      summary: "근거가 맞지 않습니다.",
      findings: [
        {
          rule_id: "TW-SENT-103",
          path: "docs/guide.md",
          line: 2,
          target_text: "없는 문장",
          reason: "모호합니다.",
          suggestion: null,
          confidence: 0.9,
        },
      ],
    },
    documents: [{
      path: "docs/guide.md",
      status: "modified",
      content: "# 가이드\n\n정확한 문장입니다.",
      diff: "+정확한 문장입니다.",
      changedLines: new Set([3]),
      documentType: "unknown",
    }],
    semanticRules: standard.semanticRules,
    minConfidence: standard.ai.minConfidence,
    maxFindings: 5,
  });

  assert.deepEqual(findings, []);
});
