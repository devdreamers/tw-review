import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { loadStandardAtRevision, parseStandard } from "../src/standard.js";

test("기본 표준을 읽고 고유한 규칙 ID를 확인한다", async () => {
  const source = await readFile(resolve("standards/technical-writing.yml"), "utf8");
  const standard = parseStandard(source);

  assert.equal(standard.version, "1.0.0");
  assert.equal(standard.structure.headingLength.max, 30);
  assert.ok(standard.semanticRules.length > 0);
});

test("중복된 규칙 ID를 거부한다", async () => {
  const source = await readFile(resolve("standards/technical-writing.yml"), "utf8");
  const duplicated = source.replace("id: TW-ARCH-002", "id: TW-ARCH-001");

  assert.throws(() => parseStandard(duplicated), /중복된 규칙 ID/);
});

test("저장소 밖의 사용자 표준 경로를 거부한다", async () => {
  await assert.rejects(
    loadStandardAtRevision({
      cwd: resolve("."),
      revision: "HEAD",
      path: "../technical-writing.yml",
    }),
    /저장소 안의 파일/,
  );
});
