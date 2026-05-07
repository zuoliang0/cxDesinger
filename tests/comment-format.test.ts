import { describe, expect, it } from "vitest";
import { formatDocumentComment } from "../src/renderer/comment-format";

describe("formatDocumentComment", () => {
  it("formats document path, line and comment for chat input", () => {
    expect(
      formatDocumentComment({
        documentPath: "docs/prd.md",
        line: 42,
        comment: "  这里需要补充儿童年龄段  "
      })
    ).toBe("针对 docs/prd.md 第 42 行的备注：\n这里需要补充儿童年龄段");
  });
});
