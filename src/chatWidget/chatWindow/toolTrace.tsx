import { useEffect, useId, useRef, useState } from "react";
import { ToolActivity, ToolActivityStatus } from "../toolActivity";

function formatSeconds(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return "";
  }
  if (value < 10) {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? `${rounded}s` : `${rounded.toFixed(1)}s`;
  }
  return `${Math.round(value)}s`;
}

function totalSeconds(tools: ToolActivity[]): number | null {
  let sum = 0;
  let any = false;
  tools.forEach((tool) => {
    if (typeof tool.durationSeconds === "number" && Number.isFinite(tool.durationSeconds)) {
      sum += tool.durationSeconds;
      any = true;
    }
  });
  return any ? sum : null;
}

function statusLabel(status: ToolActivityStatus): string {
  if (status === "running") {
    return "Running";
  }
  if (status === "error") {
    return "Failed";
  }
  if (status === "cancelled") {
    return "Stopped";
  }
  return "Done";
}

function phaseOf(tools: ToolActivity[]): ToolActivityStatus {
  if (tools.some((tool) => tool.status === "running")) {
    return "running";
  }
  if (tools.some((tool) => tool.status === "error")) {
    return "error";
  }
  if (tools.length > 0 && tools.every((tool) => tool.status === "cancelled")) {
    return "cancelled";
  }
  return "completed";
}

function traceCopy(tools: ToolActivity[], live: boolean): { title: string; meta: string; alert: string } {
  const count = tools.length;
  const noun = count === 1 ? "tool" : "tools";
  const running = tools.filter((tool) => tool.status === "running");
  const failed = tools.filter((tool) => tool.status === "error").length;
  const duration = formatSeconds(totalSeconds(tools) ?? NaN);
  const alert = failed > 0 ? (failed === 1 ? "1 failed" : `${failed} failed`) : "";

  if (live && running.length > 0) {
    const current = running[running.length - 1];
    return {
      title: `Running ${current.name}`,
      meta: count > 1 ? `${count} ${noun}` : "",
      alert: "",
    };
  }
  if (tools.length > 0 && tools.every((tool) => tool.status === "cancelled")) {
    return { title: "Stopped", meta: `${count} ${noun}`, alert: "" };
  }
  return {
    title: `Used ${count} ${noun}`,
    meta: duration,
    alert,
  };
}

function formatInput(input: unknown): string | null {
  if (input == null) {
    return null;
  }
  if (typeof input === "string") {
    return input.trim() ? input : null;
  }
  if (typeof input === "object" && !Array.isArray(input) && Object.keys(input as object).length === 0) {
    return null;
  }
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

function hasDetails(tool: ToolActivity): boolean {
  return formatInput(tool.input) != null || Boolean(tool.outputText) || Boolean(tool.errorText);
}

function ChevronIcon() {
  return (
    <svg className="cl-tool-chevron" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M6.2 3.8 10.4 8 6.2 12.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function pillText(tool: ToolActivity): string {
  if (tool.status === "completed" && tool.durationSeconds != null) {
    const duration = formatSeconds(tool.durationSeconds);
    if (duration) {
      return duration;
    }
  }
  return statusLabel(tool.status);
}

function ToolRow({ tool }: { tool: ToolActivity }) {
  const input = formatInput(tool.input);
  const expandable = hasDetails(tool);
  const body = (
    <>
      <span className="cl-tool-chevron-slot" aria-hidden="true">
        {expandable ? <ChevronIcon /> : null}
      </span>
      <span className={`cl-tool-dot cl-tool-dot-${tool.status}`} />
      <span className="cl-tool-name">{tool.name}</span>
      <span className={`cl-tool-pill cl-tool-pill-${tool.status}`}>{pillText(tool)}</span>
    </>
  );

  if (!expandable) {
    return <div className="cl-tool-row cl-tool-row-static">{body}</div>;
  }

  return (
    <details className="cl-tool-item">
      <summary className="cl-tool-row">{body}</summary>
      <div className="cl-tool-pane">
        {input ? (
          <div className="cl-tool-section">
            <span className="cl-tool-label">Input</span>
            <pre className="cl-tool-body">{input}</pre>
          </div>
        ) : null}
        {tool.errorText ? (
          <div className="cl-tool-section cl-tool-section-error">
            <span className="cl-tool-label">Error</span>
            <pre className="cl-tool-body">{tool.errorText}</pre>
          </div>
        ) : null}
        {tool.outputText ? (
          <div className="cl-tool-section">
            <span className="cl-tool-label">Output</span>
            <pre className="cl-tool-body">{tool.outputText}</pre>
          </div>
        ) : null}
      </div>
    </details>
  );
}

export default function ToolTrace({ tools, live = false }: { tools: ToolActivity[]; live?: boolean }) {
  const [open, setOpen] = useState(live);
  const liveRef = useRef(live);
  const panelId = useId();

  useEffect(() => {
    if (liveRef.current !== live) {
      setOpen(live);
      liveRef.current = live;
    }
  }, [live]);

  if (!tools.length) {
    return null;
  }

  const phase = phaseOf(tools);
  const copy = traceCopy(tools, live);

  return (
    <div className="cl-tool-trace" data-phase={phase}>
      <button
        type="button"
        className="cl-tool-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronIcon />
        <span className={`cl-tool-dot cl-tool-dot-${phase}`} />
        <span className="cl-tool-title">{copy.title}</span>
        {copy.alert ? <span className="cl-tool-meta cl-tool-meta-alert">{copy.alert}</span> : null}
        {copy.meta ? <span className="cl-tool-meta">{copy.meta}</span> : null}
      </button>
      {open ? (
        <div className="cl-tool-list" id={panelId}>
          {tools.map((tool) => (
            <ToolRow key={tool.id} tool={tool} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
