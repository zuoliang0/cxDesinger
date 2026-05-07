const MAX_TASK_LABEL_LENGTH = 42;

export function getCurrentTaskLabel(input: string): string {
  const normalized = input.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "当前任务";
  }

  if (normalized.length <= MAX_TASK_LABEL_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_TASK_LABEL_LENGTH)}...`;
}
