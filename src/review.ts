import {
  getChangedDocuments,
  getChangedLineNumbers,
  getDocumentAtRevision,
  getDocumentDiff,
  hasDocumentContentChanges,
} from "./git.js";
import type {
  PreparedReview,
  ReviewDocumentContext,
  ReviewFile,
  TechnicalWritingStandard,
} from "./types.js";
import {
  filterIntroducedFindings,
  validateDocument,
} from "./validator.js";

export async function preparePullRequestReview(options: {
  cwd: string;
  baseSha: string;
  headSha: string;
  standard: TechnicalWritingStandard;
}): Promise<PreparedReview> {
  const changedDocuments = await getChangedDocuments(
    options.cwd,
    options.baseSha,
    options.headSha,
  );
  const files: ReviewFile[] = [];
  const documents: ReviewDocumentContext[] = [];

  for (const changedDocument of changedDocuments) {
    const [content, previousContent, diff] = await Promise.all([
      getDocumentAtRevision(options.cwd, options.headSha, changedDocument.path),
      changedDocument.status === "added"
        ? Promise.resolve(undefined)
        : getDocumentAtRevision(
          options.cwd,
          options.baseSha,
          changedDocument.previousPath ?? changedDocument.path,
        ),
      getDocumentDiff(options.cwd, options.baseSha, options.headSha, changedDocument.path),
    ]);
    if (content == null) {
      continue;
    }

    const changedLines = getChangedLineNumbers(diff);
    const currentValidation = validateDocument(changedDocument.path, content, options.standard);
    const previousValidation = previousContent == null
      ? undefined
      : validateDocument(changedDocument.previousPath ?? changedDocument.path, previousContent, options.standard);
    const findings = filterIntroducedFindings({
      current: currentValidation.findings,
      previous: previousValidation?.findings,
      changedLines,
      isNewFile: changedDocument.status === "added",
    }).slice(0, options.standard.limits.maxFindings);

    files.push({
      path: changedDocument.path,
      previousPath: changedDocument.previousPath,
      status: changedDocument.status,
      documentType: currentValidation.documentType,
      findings,
    });
    if (hasDocumentContentChanges(diff)) {
      documents.push({
        path: changedDocument.path,
        status: changedDocument.status,
        content,
        diff,
        changedLines,
        documentType: currentValidation.documentType,
      });
    }
  }

  return {
    result: {
      standardVersion: options.standard.version,
      baseSha: options.baseSha,
      headSha: options.headSha,
      files,
      ai: { status: "disabled" },
    },
    documents,
  };
}
