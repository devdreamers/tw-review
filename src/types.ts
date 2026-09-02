export const severities = ["required", "recommended", "confirmation"] as const;
export type Severity = (typeof severities)[number];

export type RuleConfig = {
  id: string;
  severity: Severity;
  enabled?: boolean;
};

export type SectionConfig = {
  name: string;
  aliases: string[];
};

export type DocumentTypeConfig = {
  labels: string[];
  requiredSections: SectionConfig[];
};

export type SemanticRule = {
  id: string;
  severity: Exclude<Severity, "required">;
  description: string;
};

export type TechnicalWritingStandard = {
  version: string;
  limits: {
    maxDocumentBytes: number;
    maxAiCharacters: number;
    maxFindings: number;
  };
  structure: {
    singleH1: RuleConfig;
    overview: RuleConfig;
    headingLength: RuleConfig & { max: number };
    headingPunctuation: RuleConfig;
    headingDepth: RuleConfig & { min: number };
    headingOrder: RuleConfig;
  };
  documentType: {
    requireExplicitType: boolean;
    rule: RuleConfig;
    types: Record<string, DocumentTypeConfig>;
  };
  metadata: {
    rule: RuleConfig;
    required: string[];
  };
  terminology: {
    rule: RuleConfig;
    terms: Array<{ preferred: string; alternatives: string[] }>;
  };
  sentence: {
    metaDiscourse: RuleConfig & { phrases: string[] };
    nominalization: RuleConfig & { replacements: Record<string, string> };
  };
  semanticRules: SemanticRule[];
  ai: {
    promptVersion: string;
    minConfidence: number;
  };
};

export type FindingSource = "deterministic" | "ai" | "system";
export type FindingScope = "document" | "line";

export type Finding = {
  ruleId: string;
  severity: Severity;
  source: FindingSource;
  scope: FindingScope;
  path: string;
  line?: number;
  title: string;
  reason: string;
  suggestion?: string;
  confidence?: number;
  fingerprint: string;
};

export type Heading = {
  depth: number;
  line: number;
  title: string;
  normalizedTitle: string;
};

export type ProseLine = {
  line: number;
  text: string;
};

export type ParsedMarkdown = {
  lines: string[];
  headings: Heading[];
  proseLines: ProseLine[];
  frontmatter: Record<string, unknown>;
  frontmatterError?: string;
};

export type DocumentValidation = {
  documentType: string | "unknown";
  findings: Finding[];
};

export type ChangedDocument = {
  status: "added" | "modified" | "renamed";
  path: string;
  previousPath?: string;
};

export type ReviewFile = {
  path: string;
  previousPath?: string;
  status: ChangedDocument["status"];
  documentType: string | "unknown";
  findings: Finding[];
};

export type ReviewResult = {
  standardVersion: string;
  baseSha: string;
  headSha: string;
  files: ReviewFile[];
  ai: {
    status: "disabled" | "skipped" | "completed" | "failed";
    model?: string;
    promptVersion?: string;
    inputTokens?: number;
    outputTokens?: number;
    message?: string;
  };
};

export type ReviewDocumentContext = {
  path: string;
  status: ChangedDocument["status"];
  content: string;
  diff: string;
  changedLines: Set<number>;
  documentType: string | "unknown";
};

export type PreparedReview = {
  result: ReviewResult;
  documents: ReviewDocumentContext[];
};
