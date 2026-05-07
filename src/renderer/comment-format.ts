export interface DocumentCommentInput {
  documentPath: string;
  line: number;
  comment: string;
}

export function formatDocumentComment(input: DocumentCommentInput): string {
  return `针对 ${input.documentPath} 第 ${input.line} 行的备注：\n${input.comment.trim()}`;
}
