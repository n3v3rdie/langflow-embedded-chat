export class StreamProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StreamProtocolError";
  }
}

export type LangflowStreamEvent = {
  event: string;
  data: unknown;
};

/**
 * Incremental parser for the Langflow 1.8.3 run stream.
 * Each event is a JSON object terminated by a blank line (`\n\n`),
 * matching EventManager.send_event. Network chunks are not events:
 * one event may span many chunks, and one chunk may contain many events.
 * Incomplete UTF-8 sequences stay inside TextDecoder until the next chunk.
 */
export class LangflowStreamParser {
  private readonly decoder = new TextDecoder("utf-8");
  private buffer = "";

  pushBytes(chunk: Uint8Array): LangflowStreamEvent[] {
    return this.pushText(this.decoder.decode(chunk, { stream: true }));
  }

  pushText(text: string): LangflowStreamEvent[] {
    this.buffer += text;
    return this.drain(false);
  }

  finish(): LangflowStreamEvent[] {
    this.buffer += this.decoder.decode();
    return this.drain(true);
  }

  private drain(flush: boolean): LangflowStreamEvent[] {
    const events: LangflowStreamEvent[] = [];
    while (this.buffer.length > 0) {
      const separator = findEventSeparator(this.buffer);
      if (!separator) {
        break;
      }
      const raw = this.buffer.slice(0, separator.index);
      this.buffer = this.buffer.slice(separator.index + separator.length);
      const event = parseEventBlock(raw);
      if (event) {
        events.push(event);
      }
    }
    if (flush && this.buffer.trim()) {
      const event = parseEventBlock(this.buffer);
      this.buffer = "";
      if (event) {
        events.push(event);
      }
    }
    return events;
  }
}

function findEventSeparator(buffer: string): { index: number; length: number } | null {
  const lf = buffer.indexOf("\n\n");
  const crlf = buffer.indexOf("\r\n\r\n");
  if (lf < 0 && crlf < 0) {
    return null;
  }
  if (lf < 0) {
    return { index: crlf, length: 4 };
  }
  if (crlf < 0 || lf <= crlf) {
    return { index: lf, length: 2 };
  }
  return { index: crlf, length: 4 };
}

function parseEventBlock(raw: string): LangflowStreamEvent | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new StreamProtocolError("Invalid stream event");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new StreamProtocolError("Invalid stream event");
  }
  const eventName = (parsed as { event?: unknown }).event;
  if (typeof eventName !== "string" || eventName.length === 0) {
    throw new StreamProtocolError("Stream event is missing event name");
  }
  return {
    event: eventName,
    data: (parsed as { data?: unknown }).data,
  };
}

export function isAbortError(error: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}
