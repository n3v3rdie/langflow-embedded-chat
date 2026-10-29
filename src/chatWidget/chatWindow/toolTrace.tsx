import { ToolActivity } from "../toolActivity";

function formatClock(timestamp: number | null): string {
  if (timestamp == null) {
    return "";
  }
  return new Date(timestamp).toLocaleTimeString();
}

function statusLabel(status: ToolActivity["status"]): string {
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

export default function ToolTrace({ tools }: { tools: ToolActivity[] }) {
  if (!tools.length) {
    return null;
  }
  return (
    <div className="cl-tool-list">
      {tools.map((tool) => {
        const started = formatClock(tool.startedAt);
        const finished = formatClock(tool.finishedAt);
        const range = finished && finished !== started ? `${started}–${finished}` : started;
        const duration = tool.durationSeconds != null ? `${tool.durationSeconds}s` : "";
        return (
          <details key={tool.id} className="cl-tool-item">
            <summary>
              <span className="cl-tool-name">{tool.name}</span>
              <span className={`cl-tool-status cl-tool-${tool.status}`}>{statusLabel(tool.status)}</span>
              {range ? <span className="cl-tool-time">{range}</span> : null}
              {duration ? <span className="cl-tool-time">{duration}</span> : null}
            </summary>
            {tool.input != null ? (
              <pre className="cl-tool-body">{JSON.stringify(tool.input, null, 2)}</pre>
            ) : null}
            {tool.errorText ? <pre className="cl-tool-body cl-tool-error">{tool.errorText}</pre> : null}
            {tool.outputText ? <pre className="cl-tool-body">{tool.outputText}</pre> : null}
          </details>
        );
      })}
    </div>
  );
}
