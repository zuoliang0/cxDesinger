import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarkdownDocument } from "../src/renderer/MarkdownDocument";

describe("MarkdownDocument", () => {
  it("renders markdown and emits a line comment", () => {
    const onAddComment = vi.fn();

    render(
      <MarkdownDocument
        content={"# PRD\n\n正文内容\n\n- 功能一"}
        documentPath="docs/prd.md"
        onAddComment={onAddComment}
      />
    );

    expect(screen.getByRole("heading", { name: "PRD" })).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("添加备注：第 1 行"));
    fireEvent.change(screen.getByPlaceholderText("添加评论..."), {
      target: { value: "标题需要更具体" }
    });
    fireEvent.click(screen.getByTitle("确认备注"));

    expect(onAddComment).toHaveBeenCalledWith(1, "标题需要更具体");
  });
});
