import {
  detectDocumentType,
  hasOverview,
  parseMarkdown,
} from "./markdown.js";
import type {
  DocumentValidation,
  Finding,
  FindingScope,
  RuleConfig,
  Severity,
  TechnicalWritingStandard,
} from "./types.js";

function createFinding(options: {
  path: string;
  rule: RuleConfig;
  scope: FindingScope;
  title: string;
  reason: string;
  suggestion?: string;
  line?: number;
  fingerprint: string;
}): Finding {
  return {
    ruleId: options.rule.id,
    severity: options.rule.severity,
    source: "deterministic",
    scope: options.scope,
    path: options.path,
    line: options.line,
    title: options.title,
    reason: options.reason,
    suggestion: options.suggestion,
    fingerprint: `${options.rule.id}:${options.fingerprint}`,
  };
}

function includesPhrase(text: string, phrase: string): boolean {
  return text.toLocaleLowerCase().includes(phrase.toLocaleLowerCase());
}

export function validateDocument(
  path: string,
  document: string,
  standard: TechnicalWritingStandard,
): DocumentValidation {
  const findings: Finding[] = [];

  if (Buffer.byteLength(document, "utf8") > standard.limits.maxDocumentBytes) {
    findings.push({
      ruleId: "TW-SYSTEM-001",
      severity: "confirmation",
      source: "system",
      scope: "document",
      path,
      title: "문서 크기 제한 초과",
      reason: `문서가 ${standard.limits.maxDocumentBytes}바이트를 넘어 전체 검사를 실행하지 않았습니다.`,
      suggestion: "문서를 주제별로 나누거나 크기 제한을 조정하세요.",
      fingerprint: "TW-SYSTEM-001:document-too-large",
    });
    return { documentType: "unknown", findings };
  }

  const parsed = parseMarkdown(document);
  const h1Headings = parsed.headings.filter((heading) => heading.depth === 1);

  if (parsed.frontmatterError && standard.metadata.rule.enabled !== false) {
    findings.push(createFinding({
      path,
      rule: standard.metadata.rule,
      scope: "document",
      line: 1,
      title: "frontmatter 형식 오류",
      reason: parsed.frontmatterError,
      suggestion: "YAML frontmatter 형식을 수정하세요.",
      fingerprint: "invalid-frontmatter",
    }));
  }

  if (standard.structure.singleH1.enabled !== false) {
    if (h1Headings.length === 0) {
      findings.push(createFinding({
        path,
        rule: standard.structure.singleH1,
        scope: "document",
        title: "대표 제목 누락",
        reason: "문서에 H1 제목이 없습니다.",
        suggestion: "문서의 핵심 키워드를 포함한 H1 제목을 추가하세요.",
        fingerprint: "missing-h1",
      }));
    }
    for (const heading of h1Headings.slice(1)) {
      findings.push(createFinding({
        path,
        rule: standard.structure.singleH1,
        scope: "line",
        line: heading.line,
        title: "H1 제목 중복",
        reason: "한 문서에 H1 제목이 두 개 이상 있습니다.",
        suggestion: "대표 제목 하나만 H1으로 두고 나머지는 H2 이하로 변경하세요.",
        fingerprint: `multiple-h1:${heading.normalizedTitle}`,
      }));
    }
  }

  if (
    standard.structure.overview.enabled !== false
    && h1Headings.length > 0
    && !hasOverview(parsed)
  ) {
    findings.push(createFinding({
      path,
      rule: standard.structure.overview,
      scope: "document",
      line: h1Headings[0].line,
      title: "개요 누락",
      reason: "대표 제목과 첫 번째 H2 사이에 문서의 목적과 독자가 얻을 결과가 없습니다.",
      suggestion: "독자가 이 문서를 읽고 무엇을 할 수 있는지 한두 문장으로 설명하세요.",
      fingerprint: "missing-overview",
    }));
  }

  for (const heading of parsed.headings) {
    if (
      standard.structure.headingLength.enabled !== false
      && [...heading.normalizedTitle].length > standard.structure.headingLength.max
    ) {
      findings.push(createFinding({
        path,
        rule: standard.structure.headingLength,
        scope: "line",
        line: heading.line,
        title: "긴 제목",
        reason: `제목이 ${standard.structure.headingLength.max}자를 넘습니다: ${heading.title}`,
        suggestion: "검색에 필요한 핵심 키워드만 남겨 제목을 줄이세요.",
        fingerprint: `long-heading:${heading.normalizedTitle}`,
      }));
    }
    if (
      standard.structure.headingPunctuation.enabled !== false
      && /[?!！？]$/.test(heading.title)
    ) {
      findings.push(createFinding({
        path,
        rule: standard.structure.headingPunctuation,
        scope: "line",
        line: heading.line,
        title: "의문형 또는 감탄형 제목",
        reason: `제목이 물음표나 느낌표로 끝납니다: ${heading.title}`,
        suggestion: "핵심 키워드를 포함한 평서문 제목으로 바꾸세요.",
        fingerprint: `heading-punctuation:${heading.normalizedTitle}`,
      }));
    }
    if (
      standard.structure.headingDepth.enabled !== false
      && heading.depth >= standard.structure.headingDepth.min
    ) {
      findings.push(createFinding({
        path,
        rule: standard.structure.headingDepth,
        scope: "line",
        line: heading.line,
        title: "깊은 제목 구조",
        reason: `H${heading.depth} 제목을 사용했습니다: ${heading.title}`,
        suggestion: "내용을 별도 문서로 나누거나 상위 구조를 단순화할지 검토하세요.",
        fingerprint: `deep-heading:${heading.normalizedTitle}`,
      }));
    }
  }

  if (standard.structure.headingOrder.enabled !== false) {
    for (let index = 1; index < parsed.headings.length; index += 1) {
      const previous = parsed.headings[index - 1];
      const current = parsed.headings[index];
      if (current.depth > previous.depth + 1) {
        findings.push(createFinding({
          path,
          rule: standard.structure.headingOrder,
          scope: "line",
          line: current.line,
          title: "제목 단계 건너뜀",
          reason: `제목 단계가 H${previous.depth}에서 H${current.depth}(으)로 건너뛰었습니다.`,
          suggestion: "제목 단계를 한 단계씩 내려가도록 수정하세요.",
          fingerprint: `heading-order:${current.normalizedTitle}`,
        }));
      }
    }
  }

  if (standard.metadata.rule.enabled !== false) {
    for (const field of standard.metadata.required) {
      if (!(field in parsed.frontmatter)) {
        findings.push(createFinding({
          path,
          rule: standard.metadata.rule,
          scope: "document",
          title: "필수 메타데이터 누락",
          reason: `frontmatter에 '${field}' 필드가 없습니다.`,
          suggestion: `문서 frontmatter에 '${field}' 값을 추가하세요.`,
          fingerprint: `missing-metadata:${field}`,
        }));
      }
    }
  }

  const detectedType = detectDocumentType(parsed, standard);
  if (standard.documentType.rule.enabled !== false) {
    if (standard.documentType.requireExplicitType && !detectedType.explicit) {
      findings.push(createFinding({
        path,
        rule: standard.documentType.rule,
        scope: "document",
        title: "문서 유형 누락",
        reason: "frontmatter에 document_type이 없습니다.",
        suggestion: `document_type에 ${Object.keys(standard.documentType.types).join(", ")} 중 하나를 지정하세요.`,
        fingerprint: "missing-document-type",
      }));
    } else if (detectedType.explicit && detectedType.type === "unknown") {
      findings.push(createFinding({
        path,
        rule: standard.documentType.rule,
        scope: "document",
        title: "알 수 없는 문서 유형",
        reason: "frontmatter의 document_type이 표준에 정의되어 있지 않습니다.",
        suggestion: `document_type에 ${Object.keys(standard.documentType.types).join(", ")} 중 하나를 지정하세요.`,
        fingerprint: "unknown-document-type",
      }));
    }

    if (detectedType.type !== "unknown") {
      const documentType = standard.documentType.types[detectedType.type];
      const sectionTitles = parsed.headings
        .filter((heading) => heading.depth >= 2)
        .map((heading) => heading.normalizedTitle);
      for (const section of documentType.requiredSections) {
        if (!sectionTitles.some((title) => section.aliases.includes(title))) {
          findings.push(createFinding({
            path,
            rule: standard.documentType.rule,
            scope: "document",
            title: "필수 섹션 누락",
            reason: `${detectedType.type} 문서에 필요한 '${section.name}' 섹션이 없습니다.`,
            suggestion: `문서 목적에 맞는 '${section.name}' 섹션을 추가하세요.`,
            fingerprint: `missing-section:${detectedType.type}:${section.name}`,
          }));
        }
      }
    }
  }

  for (const proseLine of parsed.proseLines) {
    if (standard.terminology.rule.enabled !== false) {
      for (const term of standard.terminology.terms) {
        const alternative = term.alternatives.find((value) => includesPhrase(proseLine.text, value));
        if (alternative) {
          findings.push(createFinding({
            path,
            rule: standard.terminology.rule,
            scope: "line",
            line: proseLine.line,
            title: "비표준 용어 사용",
            reason: `'${alternative}' 대신 표준 용어 '${term.preferred}'를 사용해야 합니다.`,
            suggestion: proseLine.text.replace(alternative, term.preferred),
            fingerprint: `terminology:${alternative}:${proseLine.text}`,
          }));
        }
      }
    }

    if (standard.sentence.metaDiscourse.enabled !== false) {
      const metaDiscourse = standard.sentence.metaDiscourse.phrases.find((phrase) =>
        includesPhrase(proseLine.text, phrase),
      );
      if (metaDiscourse) {
        findings.push(createFinding({
          path,
          rule: standard.sentence.metaDiscourse,
          scope: "line",
          line: proseLine.line,
          title: "불필요한 메타 담화",
          reason: `'${metaDiscourse}'는 문서 내용에 기여하지 않는 메타 담화입니다.`,
          suggestion: proseLine.text.replace(metaDiscourse, "").trim(),
          fingerprint: `meta-discourse:${metaDiscourse}:${proseLine.text}`,
        }));
      }
    }

    if (standard.sentence.nominalization.enabled !== false) {
      for (const [phrase, replacement] of Object.entries(
        standard.sentence.nominalization.replacements,
      )) {
        if (includesPhrase(proseLine.text, phrase)) {
          findings.push(createFinding({
            path,
            rule: standard.sentence.nominalization,
            scope: "line",
            line: proseLine.line,
            title: "명사형 표현",
            reason: `'${phrase}'를 동사 중심 표현으로 줄일 수 있습니다.`,
            suggestion: proseLine.text.replace(phrase, replacement),
            fingerprint: `nominalization:${phrase}:${proseLine.text}`,
          }));
        }
      }
    }
  }

  return {
    documentType: detectedType.type,
    findings,
  };
}

export function filterIntroducedFindings(options: {
  current: Finding[];
  previous?: Finding[];
  changedLines: Set<number>;
  isNewFile: boolean;
}): Finding[] {
  const previousFingerprints = new Set(
    (options.previous ?? []).filter((finding) => finding.scope === "document")
      .map((finding) => finding.fingerprint),
  );

  return options.current.filter((finding) => {
    if (finding.scope === "line") {
      return finding.line != null && options.changedLines.has(finding.line);
    }
    return options.isNewFile || !previousFingerprints.has(finding.fingerprint);
  });
}

export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  return findings.reduce<Record<Severity, number>>((counts, finding) => {
    counts[finding.severity] += 1;
    return counts;
  }, { required: 0, recommended: 0, confirmation: 0 });
}
