export interface DocumentCommentInput {
  documentPath: string;
  line: number;
  comment: string;
  locale?: "en" | "zh-CN" | "de";
}

export function formatDocumentComment(input: DocumentCommentInput): string {
  if (input.locale === "de") {
    return `Kommentar zu ${input.documentPath}, Zeile ${input.line}:\n${input.comment.trim()}`;
  }

  if (input.locale === "en") {
    return `Comment for ${input.documentPath}, line ${input.line}:\n${input.comment.trim()}`;
  }

  return `针对 ${input.documentPath} 第 ${input.line} 行的备注：\n${input.comment.trim()}`;
}
