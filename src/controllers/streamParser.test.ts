import fs from "fs";
import path from "path";
import { LangflowStreamParser, StreamProtocolError } from "./streamParser";
import { extractBotTexts, parseHttpErrorMessage } from "./runResult";
import { mergeToolActivities, redactSensitive } from "../chatWidget/toolActivity";

function collect(chunks: Uint8Array[]): ReturnType<LangflowStreamParser["pushBytes"]> {
  const parser = new LangflowStreamParser();
  const events = chunks.flatMap((chunk) => parser.pushBytes(chunk));
  return events.concat(parser.finish());
}

function encode(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

describe("LangflowStreamParser", () => {
  const token = (chunk: string, id = "m1") =>
    `${JSON.stringify({ event: "token", data: { chunk, id } })}\n\n`;

  test("joins an event split across chunks and keeps several events from one chunk", () => {
    const payload = token("SELECT ") + token("1 FROM dual;");
    const bytes = encode(payload);
    const splitAt = payload.indexOf("SELECT") + 3;
    const events = collect([bytes.slice(0, splitAt), bytes.slice(splitAt)]);
    expect(events.map((event) => (event.data as { chunk: string }).chunk).join("")).toBe("SELECT 1 FROM dual;");
  });

  test("keeps a separator split between the two newlines", () => {
    const payload = token("a");
    const boundary = payload.indexOf("\n\n") + 1;
    const bytes = encode(payload);
    const events = collect([bytes.slice(0, boundary), bytes.slice(boundary)]);
    expect(events).toHaveLength(1);
    expect((events[0].data as { chunk: string }).chunk).toBe("a");
  });

  test("decodes UTF-8 characters split on a byte boundary", () => {
    const payload = token("Привет — SQL");
    const bytes = encode(payload);
    for (let offset = 1; offset < bytes.length; offset += 1) {
      const events = collect([bytes.slice(0, offset), bytes.slice(offset)]);
      expect(events).toHaveLength(1);
      expect((events[0].data as { chunk: string }).chunk).toBe("Привет — SQL");
    }
  });

  test("parses the captured Langflow 1.8.3 stream independently of chunk size", () => {
    const file = fs.readFileSync(path.join(process.cwd(), "stream.txt"), "utf8");
    // The capture was saved with Windows newlines. Langflow itself emits LF blank lines.
    const headerEnd = file.search(/\r?\n\r?\n/);
    const body = file.slice(headerEnd).replace(/^\r?\n\r?\n/, "");
    const bytes = encode(body);
      const sizes = [64, 997, 4096];
    sizes.forEach((size) => {
      const chunks: Uint8Array[] = [];
      for (let offset = 0; offset < bytes.length; offset += size) {
        chunks.push(bytes.slice(offset, offset + size));
      }
      const events = collect(chunks);
      const tokens = events
        .filter((event) => event.event === "token")
        .map((event) => (event.data as { chunk: string }).chunk)
        .join("");
      const end = events.filter((event) => event.event === "end");
      expect(events.filter((event) => event.event === "add_message")).toHaveLength(13);
      expect(events.filter((event) => event.event === "token")).toHaveLength(177);
      expect(end).toHaveLength(1);
      const result = (end[0].data as { result: any }).result;
      const finalText = result.outputs[0].outputs[0].outputs.message.message as string;
      expect(tokens).toBe(finalText);
      expect(extractBotTexts(result)).toEqual([finalText]);
    });
  });

  test("rejects a block that is not JSON", () => {
    const parser = new LangflowStreamParser();
    expect(() => parser.pushText("not-json\n\n")).toThrow(StreamProtocolError);
  });

  test("does not emit an event until the blank-line separator arrives", () => {
    const parser = new LangflowStreamParser();
    const payload = token("abc");
    expect(parser.pushText(payload.slice(0, payload.length - 4))).toEqual([]);
    expect(parser.pushText(payload.slice(payload.length - 4))).toHaveLength(1);
  });

  test("reports a truncated event when the stream ends mid-JSON", () => {
    const parser = new LangflowStreamParser();
    parser.pushText(token("abc").slice(0, 12));
    expect(() => parser.finish()).toThrow(StreamProtocolError);
  });
});

describe("run result and tool activity", () => {
  test("formats authorization and validation errors", () => {
    expect(parseHttpErrorMessage(401, JSON.stringify({ detail: "Invalid API key" }))).toBe(
      "Authorization error: Invalid API key"
    );
    expect(parseHttpErrorMessage(500, JSON.stringify({ detail: "boom" }))).toBe("boom");
    expect(parseHttpErrorMessage(422, JSON.stringify({ detail: [{ msg: "field required" }] }))).toBe(
      "field required"
    );
  });

  test("redacts sensitive tool fields and tracks start and finish", () => {
    const first = mergeToolActivities(
      [
        {
          contents: [
            {
              type: "tool_use",
              name: "open_trace",
              tool_input: { trace_path: "/tmp/a.trc", api_key: "secret" },
              output: null,
              error: null,
              duration: 2,
            },
          ],
        },
      ],
      [],
      1_000
    );
    expect(first[0].status).toBe("running");
    expect(first[0].startedAt).toBe(1_000);
    expect((first[0].input as { api_key: string }).api_key).toBe("[redacted]");

    const second = mergeToolActivities(
      [
        {
          contents: [
            {
              type: "tool_use",
              name: "open_trace",
              tool_input: { api_key: "secret" },
              output: { token: "abc", ok: true },
              error: null,
              duration: 5,
            },
          ],
        },
      ],
      first,
      4_000
    );
    expect(second[0].status).toBe("completed");
    expect(second[0].startedAt).toBe(1_000);
    expect(second[0].finishedAt).toBe(4_000);
    expect(second[0].outputText).toContain("[redacted]");
    expect(redactSensitive({ password: "p", name: "tool" })).toEqual({
      password: "[redacted]",
      name: "tool",
    });
  });
});
