import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { parseStandard } from "../src/standard.js";
import {
  filterIntroducedFindings,
  validateDocument,
} from "../src/validator.js";

async function defaultStandard() {
  return parseStandard(await readFile(resolve("standards/technical-writing.yml"), "utf8"));
}

test("표준을 충족하는 설명 문서는 위반이 없다", async () => {
  const standard = await defaultStandard();
  const result = validateDocument("docs/event-sourcing.md", [
    "---",
    "document_type: explanation",
    "---",
    "# 이벤트 소싱",
    "",
    "이 문서를 읽으면 이벤트 소싱의 등장 배경과 활용 방법을 이해할 수 있습니다.",
    "",
    "## 개념 소개",
    "",
    "이벤트 소싱은 상태 변경 이벤트를 저장하는 방식입니다.",
    "",
    "## 등장 배경",
    "",
    "변경 이력을 추적하기 위해 등장했습니다.",
    "",
    "## 활용",
    "",
    "감사가 필요한 시스템에서 활용합니다.",
  ].join("\n"), standard);

  assert.equal(result.documentType, "explanation");
  assert.deepEqual(result.findings, []);
});

test("참조 문서의 누락된 필수 섹션을 모두 찾는다", async () => {
  const standard = await defaultStandard();
  const result = validateDocument("docs/api.md", [
    "---",
    "document_type: reference",
    "---",
    "# 사용자 API",
    "",
    "사용자 API의 요청과 응답 형식을 확인할 수 있습니다.",
    "",
    "## 개요",
    "",
    "사용자 정보를 조회합니다.",
  ].join("\n"), standard);

  assert.equal(result.documentType, "reference");
  assert.equal(result.findings.filter((finding) => finding.ruleId === "TW-TYPE-001").length, 4);
});

test("이전 문서에 이미 있던 문서 단위 위반은 새 PR 결과에서 제외한다", async () => {
  const standard = await defaultStandard();
  const previous = validateDocument("README.md", "# 제목\n\n## 사용법\n\n기존 내용", standard);
  const current = validateDocument("README.md", "# 제목\n\n## 사용법\n\n새로운 내용", standard);
  const introduced = filterIntroducedFindings({
    current: current.findings,
    previous: previous.findings,
    changedLines: new Set([5]),
    isNewFile: false,
  });

  assert.ok(previous.findings.some((finding) => finding.ruleId === "TW-ARCH-002"));
  assert.ok(!introduced.some((finding) => finding.ruleId === "TW-ARCH-002"));
});

test("문장 규칙은 변경된 줄에서만 보고한다", async () => {
  const standard = await defaultStandard();
  const result = validateDocument("README.md", [
    "# 제목",
    "",
    "문서의 목적을 설명합니다.",
    "",
    "## 사용법",
    "",
    "아시다시피 설정을 진행합니다.",
  ].join("\n"), standard);

  const unchanged = filterIntroducedFindings({
    current: result.findings,
    changedLines: new Set([5]),
    isNewFile: false,
  });
  const changed = filterIntroducedFindings({
    current: result.findings,
    changedLines: new Set([7]),
    isNewFile: false,
  });

  assert.equal(unchanged.length, 0);
  assert.deepEqual(changed.map((finding) => finding.ruleId).sort(), ["TW-SENT-001", "TW-SENT-002"]);
});

test("비활성화한 규칙은 판정하지 않는다", async () => {
  const standard = await defaultStandard();
  standard.documentType.rule.enabled = false;
  standard.metadata.rule.enabled = false;
  standard.metadata.required = ["owner"];
  standard.terminology.rule.enabled = false;
  standard.terminology.terms = [{ preferred: "표준어", alternatives: ["금지어"] }];
  standard.sentence.metaDiscourse.enabled = false;
  standard.sentence.nominalization.enabled = false;

  const result = validateDocument("docs/guide.md", [
    "---",
    "document_type: reference",
    "---",
    "# 제목",
    "",
    "이 문서에서 설정 방법을 확인할 수 있습니다.",
    "",
    "## 사용법",
    "",
    "아시다시피 금지어 설정을 진행합니다.",
  ].join("\n"), standard);

  assert.deepEqual(result.findings, []);
});
