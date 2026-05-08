import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../src/renderer/i18n";
import { MarkdownDocument } from "../src/renderer/MarkdownDocument";

describe("MarkdownDocument", () => {
  it("renders markdown and emits a line comment", () => {
    const onAddComment = vi.fn();

    render(
      <I18nProvider>
        <MarkdownDocument
          content={"# PRD\n\n正文内容\n\n- 功能一"}
          documentPath="docs/prd.md"
          onAddComment={onAddComment}
        />
      </I18nProvider>
    );

    expect(screen.getByRole("heading", { name: "PRD" })).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Add comment: line 1"));
    fireEvent.change(screen.getByPlaceholderText("Add comment..."), {
      target: { value: "标题需要更具体" }
    });
    fireEvent.click(screen.getByTitle("Confirm comment"));

    expect(onAddComment).toHaveBeenCalledWith(1, "标题需要更具体");
  });
});
