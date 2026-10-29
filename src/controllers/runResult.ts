import { extractMessageFromOutput } from "../chatWidget/utils";

export function extractBotTexts(data: any, outputComponent?: string): string[] {
  if (!data || !data.outputs || Object.keys(data.outputs).length === 0) {
    return [];
  }
  const flowOutputs: Array<any> = data.outputs[0] && data.outputs[0].outputs;
  if (!flowOutputs || flowOutputs.length === 0) {
    return [];
  }

  const textsFrom = (flowOutput: any): string[] => {
    if (!flowOutput || !flowOutput.outputs) {
      return [];
    }
    return Object.values(flowOutput.outputs).map((output: any) => {
      const text = extractMessageFromOutput(output);
      if (typeof text === "string") {
        return text;
      }
      if (text == null) {
        return "";
      }
      return String(text);
    });
  };

  if (outputComponent && flowOutputs.map((entry) => entry.component_id).includes(outputComponent)) {
    return textsFrom(flowOutputs.find((entry) => entry.component_id === outputComponent));
  }
  if (flowOutputs.length === 1) {
    return textsFrom(flowOutputs[0]);
  }
  return flowOutputs
    .slice()
    .sort((a, b) => {
      const aTimestamp = Math.min(
        ...Object.values(a.outputs || {}).map((output: any) => Date.parse(output.message?.timestamp))
      );
      const bTimestamp = Math.min(
        ...Object.values(b.outputs || {}).map((output: any) => Date.parse(output.message?.timestamp))
      );
      return aTimestamp - bTimestamp;
    })
    .flatMap(textsFrom);
}

export function parseHttpErrorMessage(status: number, body: string): string {
  let detail = "";
  const trimmed = body.trim();
  if (trimmed) {
    try {
      const json = JSON.parse(trimmed);
      if (typeof json?.detail === "string") {
        detail = json.detail;
      } else if (Array.isArray(json?.detail)) {
        detail = json.detail
          .map((item: any) => (typeof item?.msg === "string" ? item.msg : JSON.stringify(item)))
          .join("; ");
      } else if (typeof json?.message === "string") {
        detail = json.message;
      }
    } catch {
      detail = trimmed.slice(0, 500);
    }
  }
  if (status === 401 || status === 403) {
    return detail ? `Authorization error: ${detail}` : "Authorization error";
  }
  if (detail) {
    return detail;
  }
  return `Request failed (${status})`;
}
