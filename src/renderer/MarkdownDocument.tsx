import { useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { Check, MessageCircle, X } from "lucide-react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";

type AnnotatableTag = "h1" | "h2" | "h3" | "p" | "li" | "pre" | "blockquote" | "table";

interface MarkdownDocumentProps {
  content: string;
  documentPath: string;
  onAddComment: (line: number, comment: string) => void;
}

interface PositionLike {
  position?: {
    start?: {
      line?: number;
    };
  };
}

interface AnnotatableBlockProps {
  as: AnnotatableTag;
  children: ReactNode;
  className?: string;
  line: number | null;
  onAddComment: (line: number, comment: string) => void;
  passthroughProps: Record<string, unknown>;
}

export function MarkdownDocument({ content, documentPath, onAddComment }: MarkdownDocumentProps) {
  const components: Components = {
    h1: createAnnotatableComponent("h1", onAddComment),
    h2: createAnnotatableComponent("h2", onAddComment),
    h3: createAnnotatableComponent("h3", onAddComment),
    p: createAnnotatableComponent("p", onAddComment),
    li: createAnnotatableComponent("li", onAddComment),
    pre: createAnnotatableComponent("pre", onAddComment),
    blockquote: createAnnotatableComponent("blockquote", onAddComment),
    table: createAnnotatableComponent("table", onAddComment)
  };

  if (!content.trim()) {
    return <div className="empty-state compact">暂无内容</div>;
  }

  return (
    <article className="markdown-document" aria-label={documentPath}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </article>
  );
}

function createAnnotatableComponent(
  as: AnnotatableTag,
  onAddComment: (line: number, comment: string) => void
) {
  return function AnnotatableMarkdownNode(
    props: ComponentPropsWithoutRef<AnnotatableTag> & ExtraProps
  ) {
    const { node, children, className, ...rest } = props;

    return (
      <AnnotatableBlock
        as={as}
        className={className}
        line={getNodeLine(node)}
        onAddComment={onAddComment}
        passthroughProps={rest as Record<string, unknown>}
      >
        {children}
      </AnnotatableBlock>
    );
  };
}

function AnnotatableBlock({
  as,
  children,
  className,
  line,
  onAddComment,
  passthroughProps
}: AnnotatableBlockProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [comment, setComment] = useState("");
  const canComment = typeof line === "number";

  function submitComment() {
    const trimmed = comment.trim();

    if (!trimmed || !canComment) {
      return;
    }

    onAddComment(line, trimmed);
    setComment("");
    setIsEditing(false);
  }

  const control = canComment ? (
    <>
      <button
        className="comment-anchor-button"
        type="button"
        title={`添加备注：第 ${line} 行`}
        onClick={() => setIsEditing(true)}
      >
        <MessageCircle size={14} />
      </button>
      {isEditing ? (
        <div className="comment-popover">
          <input
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                submitComment();
              }

              if (event.key === "Escape") {
                setIsEditing(false);
                setComment("");
              }
            }}
            placeholder="添加评论..."
            autoFocus
          />
          <button type="button" title="确认备注" onClick={submitComment}>
            <Check size={14} />
          </button>
          <button
            type="button"
            title="取消备注"
            onClick={() => {
              setIsEditing(false);
              setComment("");
            }}
          >
            <X size={14} />
          </button>
        </div>
      ) : null}
    </>
  ) : null;

  if (as === "li") {
    return (
      <li
        {...(passthroughProps as ComponentPropsWithoutRef<"li">)}
        className={joinClassName("markdown-annotatable", className)}
        data-line={line ?? undefined}
      >
        {children}
        {control}
      </li>
    );
  }

  const Element = as;

  return (
    <div className="markdown-annotatable" data-line={line ?? undefined}>
      <Element {...passthroughProps} className={className}>
        {children}
      </Element>
      {control}
    </div>
  );
}

function getNodeLine(node: unknown): number | null {
  const line = (node as PositionLike | undefined)?.position?.start?.line;
  return typeof line === "number" ? line : null;
}

function joinClassName(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}
