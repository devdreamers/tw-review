import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { parse } from "yaml";
import { z } from "zod";

import { getDocumentAtRevision } from "./git.js";
import { severities, type TechnicalWritingStandard } from "./types.js";

const SeveritySchema = z.enum(severities);
const RuleSchema = z.object({
  id: z.string().min(1),
  severity: SeveritySchema,
  enabled: z.boolean().optional().default(true),
});
const NonBlockingRuleSchema = RuleSchema.extend({
  severity: z.enum(["recommended", "confirmation"]),
});

const RawStandardSchema = z.object({
  version: z.union([z.string(), z.number()]).transform(String),
  limits: z.object({
    max_document_bytes: z.number().int().positive(),
    max_ai_characters: z.number().int().positive(),
    max_findings: z.number().int().positive(),
  }),
  structure: z.object({
    single_h1: RuleSchema,
    overview: RuleSchema,
    heading_length: RuleSchema.extend({ max: z.number().int().positive() }),
    heading_punctuation: RuleSchema,
    heading_depth: RuleSchema.extend({ min: z.number().int().min(2).max(6) }),
    heading_order: RuleSchema,
  }),
  document_type: z.object({
    require_explicit_type: z.boolean(),
    rule: RuleSchema,
    types: z.record(z.string(), z.object({
      labels: z.array(z.string().min(1)).min(1),
      required_sections: z.array(z.object({
        name: z.string().min(1),
        aliases: z.array(z.string().min(1)).min(1),
      })),
    })).refine((types) => Object.keys(types).length > 0, "문서 유형을 하나 이상 정의하세요."),
  }),
  metadata: z.object({
    rule: RuleSchema,
    required: z.array(z.string().min(1)),
  }),
  terminology: z.object({
    rule: RuleSchema,
    terms: z.array(z.object({
      preferred: z.string().min(1),
      alternatives: z.array(z.string().min(1)).min(1),
    })),
  }),
  sentence: z.object({
    meta_discourse: RuleSchema.extend({ phrases: z.array(z.string().min(1)) }),
    nominalization: RuleSchema.extend({
      replacements: z.record(z.string(), z.string().min(1)),
    }),
  }),
  semantic_rules: z.array(z.object({
    id: z.string().min(1),
    severity: NonBlockingRuleSchema.shape.severity,
    description: z.string().min(1),
  })),
  ai: z.object({
    prompt_version: z.union([z.string(), z.number()]).transform(String),
    min_confidence: z.number().min(0).max(1),
  }),
});

function assertUniqueRuleIds(standard: TechnicalWritingStandard): void {
  const ids = [
    standard.structure.singleH1.id,
    standard.structure.overview.id,
    standard.structure.headingLength.id,
    standard.structure.headingPunctuation.id,
    standard.structure.headingDepth.id,
    standard.structure.headingOrder.id,
    standard.documentType.rule.id,
    standard.metadata.rule.id,
    standard.terminology.rule.id,
    standard.sentence.metaDiscourse.id,
    standard.sentence.nominalization.id,
    ...standard.semanticRules.map((rule) => rule.id),
  ];
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length > 0) {
    throw new Error(`표준에 중복된 규칙 ID가 있습니다: ${[...new Set(duplicates)].join(", ")}`);
  }
}

export function parseStandard(source: string): TechnicalWritingStandard {
  const raw = RawStandardSchema.parse(parse(source));
  const standard: TechnicalWritingStandard = {
    version: raw.version,
    limits: {
      maxDocumentBytes: raw.limits.max_document_bytes,
      maxAiCharacters: raw.limits.max_ai_characters,
      maxFindings: raw.limits.max_findings,
    },
    structure: {
      singleH1: raw.structure.single_h1,
      overview: raw.structure.overview,
      headingLength: raw.structure.heading_length,
      headingPunctuation: raw.structure.heading_punctuation,
      headingDepth: raw.structure.heading_depth,
      headingOrder: raw.structure.heading_order,
    },
    documentType: {
      requireExplicitType: raw.document_type.require_explicit_type,
      rule: raw.document_type.rule,
      types: Object.fromEntries(Object.entries(raw.document_type.types).map(([name, type]) => [
        name,
        {
          labels: type.labels,
          requiredSections: type.required_sections.map((section) => ({
            name: section.name,
            aliases: section.aliases,
          })),
        },
      ])),
    },
    metadata: raw.metadata,
    terminology: raw.terminology,
    sentence: {
      metaDiscourse: raw.sentence.meta_discourse,
      nominalization: raw.sentence.nominalization,
    },
    semanticRules: raw.semantic_rules,
    ai: {
      promptVersion: raw.ai.prompt_version,
      minConfidence: raw.ai.min_confidence,
    },
  };
  assertUniqueRuleIds(standard);
  return standard;
}

export async function loadStandard(path: string): Promise<TechnicalWritingStandard> {
  return parseStandard(await readFile(path, "utf8"));
}

export async function loadStandardAtRevision(options: {
  cwd: string;
  revision: string;
  path: string;
}): Promise<TechnicalWritingStandard> {
  const absolutePath = resolve(options.cwd, options.path);
  const relativePath = relative(options.cwd, absolutePath);
  if (!relativePath || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error("standard-path는 저장소 안의 파일이어야 합니다.");
  }

  const gitPath = relativePath.split(sep).join("/");
  const source = await getDocumentAtRevision(options.cwd, options.revision, gitPath);
  if (source == null) {
    throw new Error(`base revision에서 문서 표준 파일을 찾을 수 없습니다: ${gitPath}`);
  }
  return parseStandard(source);
}
