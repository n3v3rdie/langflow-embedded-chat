import { Send, Square } from "lucide-react";
import { getAnimationOrigin, getChatPosition, parseAdditionalHeaders } from "../utils";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChatMessageType, GenerationState } from "../../types/chatWidget";
import ChatMessage from "./chatMessage";
import { runFlowStream } from "../../controllers";
import { isAbortError } from "../../controllers/streamParser";
import { extractBotTexts } from "../../controllers/runResult";
import { mergeToolActivities, ToolActivity } from "../toolActivity";

const STREAM_FLUSH_MS = 50;

export default function ChatWindow({
  api_key,
  flowId,
  hostUrl,
  messages,
  output_type,
  input_type,
  output_component,
  bot_message_style,
  send_icon_style,
  user_message_style,
  chat_window_style,
  error_message_style,
  placeholder_sending,
  send_button_style,
  online = true,
  open,
  online_message = "We'll reply as soon as we can",
  offline_message = "We're offline now",
  window_title = "Chat",
  placeholder,
  input_style,
  input_container_style,
  addMessage,
  patchMessage,
  removeMessage,
  position,
  triggerRef,
  width = 450,
  height = 650,
  tweaks,
  sessionId,
  additional_headers,
  stream = false
}: {
  api_key?: string;
  output_type: string,
  input_type: string,
  output_component?: string,
  bot_message_style?: React.CSSProperties;
  send_icon_style?: React.CSSProperties;
  user_message_style?: React.CSSProperties;
  chat_window_style?: React.CSSProperties;
  error_message_style?: React.CSSProperties;
  send_button_style?: React.CSSProperties;
  online?: boolean;
  open: boolean;
  online_message?: string;
  placeholder_sending?: string;
  offline_message?: string;
  window_title?: string;
  placeholder?: string;
  input_style?: React.CSSProperties;
  input_container_style?: React.CSSProperties;
  tweaks?: { [key: string]: any };
  flowId: string;
  hostUrl: string;
  messages: ChatMessageType[];
  addMessage: Function;
  patchMessage: Function;
  removeMessage: Function;
  position?: string;
  triggerRef: React.RefObject<HTMLButtonElement>;
  width?: number;
  height?: number;
  sessionId: React.MutableRefObject<string>;
  additional_headers?: { [key: string]: string } | string;
  stream?: boolean;

}) {
  const [value, setValue] = useState<string>("");
  const ref = useRef<HTMLDivElement>(null);
  const lastMessage = useRef<HTMLDivElement>(null);
  const [windowPosition, setWindowPosition] = useState({ left: "0", top: "0" });
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (triggerRef)
      setWindowPosition(
        getChatPosition(
          triggerRef.current!.getBoundingClientRect(),
          width,
          height,
          position
        )
      );
  }, [triggerRef, width, height, position]);

  const [generationState, setGenerationState] = useState<GenerationState>("idle");
  const generationRef = useRef<GenerationState>("idle");
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const messageSeq = useRef(0);
  const flushTimer = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const draftRef = useRef<{ text: string; tools: ToolActivity[] }>({ text: "", tools: [] });

  const parsedHeaders = useMemo(() => parseAdditionalHeaders(additional_headers), [additional_headers]);
  const streaming = generationState === "streaming";

  function setGeneration(next: GenerationState) {
    generationRef.current = next;
    if (mountedRef.current) {
      setGenerationState(next);
    }
  }

  function nextMessageId() {
    messageSeq.current += 1;
    return `msg-${messageSeq.current}`;
  }

  function clearFlush() {
    if (flushTimer.current != null) {
      window.clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
  }

  function rememberSession(session: unknown) {
    if (typeof session === "string" && session !== "") {
      sessionId.current = session;
    }
  }

  function stopGeneration() {
    abortRef.current?.abort();
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (flushTimer.current != null) {
        window.clearTimeout(flushTimer.current);
        flushTimer.current = null;
      }
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
    }
  }, [open]);

  function handleClick() {
    if (generationRef.current === "streaming") {
      stopGeneration();
      return;
    }
    if (!value || value.trim() === "") {
      return;
    }
    const userText = value;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const assistantId = nextMessageId();
    const controller = new AbortController();
    abortRef.current = controller;
    draftRef.current = { text: "", tools: [] };
    clearFlush();
    addMessage({ id: nextMessageId(), message: userText, isSend: true });
    addMessage({
      id: assistantId,
      message: "",
      isSend: false,
      status: "streaming",
    });
    setGeneration("streaming");
    setValue("");

    const stillCurrent = () => mountedRef.current && requestId === requestIdRef.current;

    const flushDraft = (patch: Partial<ChatMessageType>) => {
      if (!stillCurrent()) {
        return;
      }
      clearFlush();
      patchMessage(assistantId, { message: draftRef.current.text, tools: draftRef.current.tools, ...patch });
    };

    const scheduleFlush = () => {
      if (flushTimer.current != null || !stillCurrent()) {
        return;
      }
      flushTimer.current = window.setTimeout(() => {
        flushTimer.current = null;
        if (!stillCurrent()) {
          return;
        }
        patchMessage(assistantId, { message: draftRef.current.text });
      }, STREAM_FLUSH_MS);
    };

    runFlowStream(
      hostUrl,
      flowId,
      userText,
      input_type,
      output_type,
      sessionId,
      output_component,
      tweaks,
      api_key,
      parsedHeaders,
      stream,
      {
        onToken: (chunk) => {
          if (!stillCurrent()) {
            return;
          }
          draftRef.current.text += chunk;
          scheduleFlush();
        },
        onAddMessage: (data) => {
          if (!stillCurrent() || !data || typeof data !== "object") {
            return;
          }
          rememberSession(data.session_id);
          const sender = data.sender || data.data?.sender;
          if (sender === "User") {
            return;
          }
          const blocks = data.content_blocks || data.data?.content_blocks;
          draftRef.current.tools = mergeToolActivities(blocks, draftRef.current.tools, Date.now());
          patchMessage(assistantId, { tools: draftRef.current.tools });
        },
        onEnd: (result) => {
          if (!stillCurrent()) {
            return;
          }
          rememberSession(result?.session_id);
          const texts = extractBotTexts(result, output_component).filter((text) => text.length > 0);
          if (texts.length > 0) {
            draftRef.current.text = texts[0];
          }
          const hasContent = draftRef.current.text.trim().length > 0 || draftRef.current.tools.length > 0;
          if (!hasContent) {
            flushDraft({
              status: "completed",
              statusNote: "Empty response",
              error: false,
            });
          } else {
            flushDraft({ status: "completed", statusNote: undefined, error: false });
          }
          texts.slice(1).forEach((text) => {
            addMessage({
              id: nextMessageId(),
              message: text,
              isSend: false,
              status: "completed",
            });
          });
        },
      },
      controller.signal
    )
      .then(() => {
        if (!stillCurrent()) {
          return;
        }
        setGeneration("completed");
      })
      .catch((error) => {
        if (!stillCurrent()) {
          return;
        }
        if (isAbortError(error)) {
          const stoppedAt = Date.now();
          draftRef.current.tools = draftRef.current.tools.map((tool) =>
            tool.status === "running" ? { ...tool, status: "cancelled", finishedAt: stoppedAt } : tool
          );
          const hasContent = draftRef.current.text.trim().length > 0 || draftRef.current.tools.length > 0;
          if (!hasContent) {
            clearFlush();
            removeMessage(assistantId);
          } else {
            flushDraft({ status: "cancelled", statusNote: "Generation stopped", error: false });
          }
          setGeneration("cancelled");
          return;
        }
        const note = describeError(error);
        if (draftRef.current.text.trim().length > 0) {
          flushDraft({ status: "error", statusNote: note, error: false });
        } else {
          clearFlush();
          patchMessage(assistantId, {
            message: note,
            tools: draftRef.current.tools,
            status: "error",
            error: true,
            statusNote: undefined,
          });
        }
        setGeneration("error");
      });
  }

  useEffect(() => {
    if (lastMessage.current)
      lastMessage.current.scrollIntoView({ behavior: streaming ? "auto" : "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    if (streaming) {
      return;
    }
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => window.clearTimeout(timer);
  }, [generationState, open, streaming]);

  return (
    <div
      className={
        "cl-chat-window " +
        getAnimationOrigin(position) +
        (open ? " cl-scale-100" : " cl-scale-0")
      }
      style={{ ...windowPosition, zIndex: 9999 }}
    >
      <div
        style={{ ...chat_window_style, width: width, height: height }}
        ref={ref}
        className="cl-window"
      >
        <div className="cl-header">
          {window_title}
          <div className="cl-header-subtitle">
            {online ? (
              <>
                <div className="cl-online-message"></div>
                {online_message}
              </>
            ) : (
              <>
                <div className="cl-offline-message"></div>
                {offline_message}
              </>
            )}
          </div>
        </div>
        <div className="cl-messages_container">
          {messages.map((message, index) => (
            <ChatMessage
              bot_message_style={bot_message_style}
              user_message_style={user_message_style}
              error_message_style={error_message_style}
              key={message.id || index}
              message={message.message}
              isSend={message.isSend}
              error={message.error}
              status={message.status}
              statusNote={message.statusNote}
              tools={message.tools}
            />
          ))}
          <div ref={lastMessage}></div>
        </div>
        <div style={input_container_style} className="cl-input_container">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleClick();
            }}
            type="text"
            disabled={streaming}
            placeholder={streaming ? (placeholder_sending || "Thinking...") : (placeholder || "Type your message...")}
            style={input_style}
            ref={inputRef}
            className="cl-input-element"
          />
          <button
            type="button"
            style={send_button_style}
            aria-label={streaming ? "Stop" : "Send"}
            onClick={handleClick}
          >
            {streaming ? (
              <Square
                style={{ fill: "#3b82f6", ...send_icon_style }}
                className="cl-send-icon cl-notsending-message"
              />
            ) : (
              <Send
                style={send_icon_style}
                className="cl-send-icon cl-notsending-message"
              />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function describeError(error: unknown): string {
  if (error instanceof TypeError && /fetch|network|failed|load/i.test(error.message)) {
    return "Network error";
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Request failed";
}
