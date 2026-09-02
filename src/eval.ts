#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";
import { z } from "zod";

import { loadStandard } from "./standard.js";
import { validateDocument } from "./validator.js";

const EvalCaseSchema = z.object({
  name: z.string().min(1),
  expected_rule_ids: z.array(z.string()),
});

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

async function main(): Promise<void> {
  const evalRoot = resolve(projectRoot, "evals");
  const standard = await loadStandard(resolve(projectRoot, "standards", "technical-writing.yml"));
  const entries = await readdir(evalRoot, { withFileTypes: true });
  let failed = 0;
  let passed = 0;

  for (const entry of entries.filter((value) => value.isDirectory())) {
    const caseRoot = resolve(evalRoot, entry.name);
    const [document, caseSource] = await Promise.all([
      readFile(resolve(caseRoot, "input.md"), "utf8"),
      readFile(resolve(caseRoot, "case.yml"), "utf8"),
    ]);
    const testCase = EvalCaseSchema.parse(parse(caseSource));
    const result = validateDocument(`${entry.name}/input.md`, document, standard);
    const actual = result.findings.map((finding) => finding.ruleId).sort();
    const expected = [...testCase.expected_rule_ids].sort();
    if (JSON.stringify(actual) === JSON.stringify(expected)) {
      console.log(`PASS ${testCase.name}`);
      passed += 1;
    } else {
      console.error(`FAIL ${testCase.name}`);
      console.error(`  expected: ${expected.join(", ") || "없음"}`);
      console.error(`  actual:   ${actual.join(", ") || "없음"}`);
      failed += 1;
    }
  }

  console.log(`\n평가 결과: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
