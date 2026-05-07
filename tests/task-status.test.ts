import { describe, expect, it } from "vitest";
import { getCurrentTaskLabel } from "../src/renderer/task-status";

describe("getCurrentTaskLabel", () => {
  it("uses a neutral label when input is empty", () => {
    expect(getCurrentTaskLabel("   \n ")).toBe("当前任务");
  });

  it("normalizes and truncates long task descriptions", () => {
    expect(getCurrentTaskLabel("  给每一个页面的规划，详细的描述出每一个页面的样式，并补充交互动效和状态说明，尤其是儿童横屏涂色流程  ")).toBe(
      "给每一个页面的规划，详细的描述出每一个页面的样式，并补充交互动效和状态说明，尤其是儿..."
    );
  });
});
