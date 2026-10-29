import { parseAdditionalHeaders } from "../chatWidget/utils";
import { parseHttpErrorMessage } from "./runResult";
import { LangflowStreamEvent, LangflowStreamParser, StreamProtocolError } from "./streamParser";

export type FlowStreamHandlers = {
  onToken?: (chunk: string, messageId?: string) => void;
  onAddMessage?: (data: any) => void;
  onEnd?: (result: any) => void;
};

export async function runFlowStream(
  baseUrl: string,
  flowId: string,
  message: string,
  input_type: string,
  output_type: string,
  sessionId: { current: string },
  output_component: string | undefined,
  tweaks: Object | undefined,
  api_key: string | undefined,
  additional_headers: { [key: string]: string } | string | undefined,
  stream: boolean,
  handlers: FlowStreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  const data: any = { input_type, input_value: message, output_type };
  if (tweaks) {
    data.tweaks = tweaks;
  }
  if (output_component) {
    data.output_component = output_component;
  }
  if (sessionId.current && sessionId.current !== "") {
    data.session_id = sessionId.current;
  }

  const headers: { [key: string]: string } = { "Content-Type": "application/json" };
  if (api_key) {
    headers["x-api-key"] = api_key;
  }
  if (additional_headers) {
    const parsedHeaders = parseAdditionalHeaders(additional_headers);
    if (parsedHeaders) {
      Object.keys(parsedHeaders).forEach((key) => {
        headers[key] = String(parsedHeaders[key]);
      });
    }
  }

  const endpoint = `${baseUrl}/api/v1/run/${flowId}`;
  const response = await fetch(stream ? `${endpoint}?stream=true` : endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
    signal,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new StreamProtocolError(parseHttpErrorMessage(response.status, body));
  }

  const contentType = response.headers.get("content-type") || "";
  if (!stream || contentType.includes("application/json")) {
    const json = await response.json();
    handlers.onEnd?.(json);
    return;
  }

  if (!response.body) {
    throw new StreamProtocolError("Empty response");
  }

  const reader = response.body.getReader();
  const parser = new LangflowStreamParser();
  let sawTerminal = false;
  let sawEvent = false;

  const applyEvent = (event: LangflowStreamEvent) => {
    sawEvent = true;
    if (event.event === "token") {
      const tokenData = event.data as { chunk?: unknown; id?: unknown } | null;
      if (tokenData && typeof tokenData.chunk === "string") {
        handlers.onToken?.(tokenData.chunk, typeof tokenData.id === "string" ? tokenData.id : undefined);
      }
      return;
    }
    if (event.event === "add_message") {
      handlers.onAddMessage?.(event.data);
      return;
    }
    if (event.event === "end") {
      sawTerminal = true;
      const payload = event.data as { result?: unknown } | null;
      handlers.onEnd?.(payload && payload.result !== undefined ? payload.result : event.data);
      return;
    }
    if (event.event === "error") {
      sawTerminal = true;
      const payload = event.data as { error?: unknown } | string | null;
      const errorText =
        typeof payload === "string"
          ? payload
          : payload && typeof payload.error === "string"
            ? payload.error
            : "Flow error";
      throw new StreamProtocolError(errorText);
    }
  };

  try {
    while (!sawTerminal) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }
      const events = parser.pushBytes(value);
      for (let index = 0; index < events.length; index += 1) {
        applyEvent(events[index]);
        if (sawTerminal) {
          break;
        }
      }
    }
    if (!sawTerminal) {
      const trailing = parser.finish();
      for (let index = 0; index < trailing.length; index += 1) {
        applyEvent(trailing[index]);
        if (sawTerminal) {
          break;
        }
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // The stream is already closed or cancelled.
    }
  }

  if (!sawTerminal) {
    throw new StreamProtocolError(
      sawEvent ? "The response stream ended before it finished" : "Empty response"
    );
  }
}
