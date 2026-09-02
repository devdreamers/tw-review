import assert from "node:assert/strict";
import test from "node:test";

import {
  getChangedLineNumbers,
  hasDocumentContentChanges,
  parseChangedDocuments,
} from "../src/git.js";

test("추가, 수정, 이름 변경 문서를 파싱한다", () => {
  const result = parseChangedDocuments([
    "A", "docs/new.md",
    "M", "README.md",
    "R100", "docs/old.md", "docs/new-name.md",
    "",
  ].join("\0"));

  assert.deepEqual(result, [
    { status: "added", path: "docs/new.md" },
    { status: "modified", path: "README.md" },
    { status: "renamed", previousPath: "docs/old.md", path: "docs/new-name.md" },
  ]);
});

test("Git diff hunk에서 새 파일 줄 번호를 구한다", () => {
  const diff = [
    "@@ -2,0 +3,2 @@",
    "+첫 번째 줄",
    "+두 번째 줄",
    "@@ -10 +12 @@",
    "-이전 줄",
    "+새 줄",
  ].join("\n");

  assert.deepEqual([...getChangedLineNumbers(diff)], [3, 4, 12]);
});

test("이름만 바뀐 문서는 AI 의미 리뷰에서 제외한다", () => {
  const renamed = [
    "similarity index 100%",
    "rename from docs/old.md",
    "rename to docs/new.md",
  ].join("\n");
  const deletedLine = [
    "--- a/docs/guide.md",
    "+++ b/docs/guide.md",
    "@@ -1 +0,0 @@",
    "----",
  ].join("\n");

  assert.equal(hasDocumentContentChanges(renamed), false);
  assert.equal(hasDocumentContentChanges(deletedLine), true);
});
