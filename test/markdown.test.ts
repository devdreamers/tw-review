import assert from "node:assert/strict";
import test from "node:test";

import { parseMarkdown } from "../src/markdown.js";

test("코드 블록 안의 Markdown 제목을 문서 구조에서 제외한다", () => {
  const parsed = parseMarkdown([
    "# 실제 제목",
    "",
    "문서의 목적을 설명합니다.",
    "",
    "```markdown",
    "#### 예제 제목?",
    "```",
    "",
    "## 실제 섹션",
  ].join("\n"));

  assert.deepEqual(parsed.headings.map((heading) => heading.title), ["실제 제목", "실제 섹션"]);
});

test("YAML frontmatter를 문서 내용과 분리한다", () => {
  const parsed = parseMarkdown([
    "---",
    "document_type: explanation",
    "owner: docs-team",
    "---",
    "# 제목",
  ].join("\n"));

  assert.equal(parsed.frontmatter.document_type, "explanation");
  assert.equal(parsed.headings[0].line, 5);
});
