import type {
  Finding,
  ReviewResult,
  Severity,
} from "./types.js";
import { countBySeverity } from "./validator.js";

export const COMMENT_MARKER = "<!-- technical-writing-review -->";

const labels: Record<Severity, string> = {
  required: "필수",
  recommended: "권장",
  confirmation: "확인",
};

function escapeMarkdown(value: string): string {
  return value
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r?\n/g, " ")
    .trim();
}

export function getAllFindings(result: ReviewResult): Finding[] {
  return result.files.flatMap((file) => file.findings);
}

export function getReviewStatus(result: ReviewResult): "pass" | "warning" | "fail" {
  const counts = countBySeverity(getAllFindings(result));
  if (counts.required > 0) {
    return "fail";
  }
  if (counts.recommended > 0 || counts.confirmation > 0) {
    return "warning";
  }
  return "pass";
}

function findingLocation(options: {
  finding: Finding;
  repository?: string;
  headSha: string;
  serverUrl?: string;
}): string {
  if (!options.finding.line) {
    return `\`${escapeMarkdown(options.finding.path)}\``;
  }
  if (!options.repository || !options.serverUrl) {
    return `\`${escapeMarkdown(options.finding.path)}:${options.finding.line}\``;
  }
  const path = options.finding.path.split("/").map(encodeURIComponent).join("/");
  const url = `${options.serverUrl}/${options.repository}/blob/${options.headSha}/${path}#L${options.finding.line}`;
  return `[\`${escapeMarkdown(options.finding.path)}:${options.finding.line}\`](${url})`;
}

export function renderReviewComment(options: {
  result: ReviewResult;
  repository?: string;
  serverUrl?: string;
}): string {
  const findings = getAllFindings(options.result);
  const counts = countBySeverity(findings);
  const status = getReviewStatus(options.result);
  const statusText = status === "pass"
    ? "✅ 표준 위반을 찾지 못했습니다."
    : status === "fail"
      ? "❌ 필수 표준 위반을 확인했습니다."
      : "⚠️ 확인하거나 개선할 항목이 있습니다.";
  const output: string[] = [
    COMMENT_MARKER,
    "## 기술 문서 표준 리뷰",
    "",
    statusText,
    "",
    `- 표준 버전: \`${escapeMarkdown(options.result.standardVersion)}\``,
    `- 필수: **${counts.required}** · 권장: **${counts.recommended}** · 확인: **${counts.confirmation}**`,
    `- AI 의미 리뷰: ${options.result.ai.status}${options.result.ai.model ? ` (\`${escapeMarkdown(options.result.ai.model)}\`)` : ""}`,
  ];

  if (options.result.ai.message) {
    output.push(`- AI 요약: ${escapeMarkdown(options.result.ai.message)}`);
  }

  if (options.result.files.length === 0) {
    output.push("", "변경된 Markdown 문서가 없습니다.");
  }

  for (const file of options.result.files) {
    if (file.findings.length === 0) {
      continue;
    }
    output.push("", `<details><summary><code>${escapeMarkdown(file.path)}</code> · ${file.findings.length}개</summary>`, "");
    for (const finding of file.findings) {
      const location = findingLocation({
        finding,
        repository: options.repository,
        headSha: options.result.headSha,
        serverUrl: options.serverUrl,
      });
      const confidence = finding.confidence == null
        ? ""
        : ` · 신뢰도 ${Math.round(finding.confidence * 100)}%`;
      output.push(
        `- **[${labels[finding.severity]}] \`${finding.ruleId}\` ${escapeMarkdown(finding.title)}** · ${location}${confidence}`,
        `  - ${escapeMarkdown(finding.reason)}`,
      );
      if (finding.suggestion) {
        output.push(`  - 수정 제안: ${escapeMarkdown(finding.suggestion)}`);
      }
    }
    output.push("", "</details>");
  }

  output.push(
    "",
    "<sub>결정적 필수 규칙만 병합 차단에 사용할 수 있습니다. AI 결과는 권장 또는 확인 항목으로만 제공됩니다.</sub>",
  );
  const rendered = output.join("\n");
  return rendered.length <= 60_000
    ? rendered
    : `${rendered.slice(0, 59_000)}\n\n…결과가 길어 일부를 생략했습니다.`;
}

export function renderCliReport(result: ReviewResult): string {
  const findings = getAllFindings(result);
  if (findings.length === 0) {
    return `PASS · 표준 ${result.standardVersion} · 위반 없음`;
  }
  return [
    `${getReviewStatus(result).toUpperCase()} · 표준 ${result.standardVersion}`,
    ...findings.map((finding) => {
      const line = finding.line ? `:${finding.line}` : "";
      return `[${labels[finding.severity]}] ${finding.ruleId} ${finding.path}${line} · ${finding.reason}`;
    }),
  ].join("\n");
}
