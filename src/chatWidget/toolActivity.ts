export type ToolActivityStatus = "running" | "completed" | "error" | "cancelled";

export type ToolActivity = {
  id: string;
  name: string;
  status: ToolActivityStatus;
  startedAt: number | null;
  finishedAt: number | null;
  durationSeconds: number | null;
  input: unknown;
  outputText: string | null;
  errorText: string | null;
};

const SENSITIVE_KEY = /pass(?:word)?|token|secret|api[_-]?key|authorization|credential|cookie/i;
const PREVIEW_LIMIT = 600;

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item));
  }
  if (value && typeof value === "object") {
    const output: { [key: string]: unknown } = {};
    Object.keys(value as { [key: string]: unknown }).forEach((key) => {
      const nested = (value as { [key: string]: unknown })[key];
      output[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redactSensitive(nested);
    });
    return output;
  }
  return value;
}

export function mergeToolActivities(
  contentBlocks: unknown,
  previous: ToolActivity[],
  now: number
): ToolActivity[] {
  if (!Array.isArray(contentBlocks)) {
    return previous;
  }
  const contents = contentBlocks.flatMap((block) => {
    if (!block || typeof block !== "object") {
      return [];
    }
    const nested = (block as { contents?: unknown }).contents;
    return Array.isArray(nested) ? nested : [];
  });
  const tools = contents.filter((entry) => {
    return !!entry && typeof entry === "object" && (entry as { type?: unknown }).type === "tool_use";
  });
  return tools.map((entry, index) => {
    const tool = entry as {
      name?: unknown;
      header?: { title?: unknown };
      tool_input?: unknown;
      output?: unknown;
      error?: unknown;
      duration?: unknown;
    };
    const previousTool = previous[index];
    const hasError = tool.error != null && tool.error !== "";
    const hasOutput = tool.output != null;
    const status: ToolActivityStatus = hasError ? "error" : hasOutput ? "completed" : "running";
    const name =
      typeof tool.name === "string" && tool.name
        ? tool.name
        : typeof tool.header?.title === "string"
          ? tool.header.title
          : "tool";
    return {
      id: `${index}:${name}`,
      name,
      status,
      startedAt: previousTool?.startedAt ?? now,
      finishedAt: status === "running" ? null : previousTool?.finishedAt ?? now,
      durationSeconds: typeof tool.duration === "number" ? tool.duration : null,
      input: redactSensitive(tool.tool_input ?? null),
      outputText: hasOutput ? previewValue(tool.output) : null,
      errorText: hasError ? previewValue(tool.error) : null,
    };
  });
}

function previewValue(value: unknown): string {
  const redacted = redactSensitive(value);
  let text: string;
  if (typeof redacted === "string") {
    text = redacted;
  } else {
    try {
      text = JSON.stringify(redacted, null, 2);
    } catch {
      text = String(redacted);
    }
  }
  if (text.length <= PREVIEW_LIMIT) {
    return text;
  }
  return `${text.slice(0, PREVIEW_LIMIT)}…`;
}
