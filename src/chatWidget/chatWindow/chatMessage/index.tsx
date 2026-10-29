import Markdown from "react-markdown";
import { MoreHorizontal } from "lucide-react";
import { ChatMessageType } from "../../../types/chatWidget";
import remarkGfm from "remark-gfm";
import rehypeMathjax from "rehype-mathjax";
import ToolTrace from "../toolTrace";

export default function ChatMessage({
  message,
  isSend,
  error,
  status,
  statusNote,
  tools,
  user_message_style,
  bot_message_style,
  error_message_style,
}: ChatMessageType) {
  const streaming = status === "streaming";
  const toolList = tools && tools.length > 0 ? <ToolTrace tools={tools} /> : null;

  return (
    <div
      className={
        "cl-chat-message " + (isSend ? " cl-justify-end" : " cl-justify-start")
      }
    >
      {isSend ? (
        <div style={user_message_style} className="cl-user_message">
          {message}
        </div>
      ) : error ? (
        <div style={error_message_style} className={"cl-error_message"}>
          {toolList}
          {message}
        </div>
      ) : (
        <div style={bot_message_style} className={"cl-bot_message"}>
          {toolList}
          {message ? (
            <Markdown
              className={
                "markdown-body prose flex flex-col word-break-break-word" +
                (streaming ? " cl-streaming" : "")
              }
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeMathjax]}
            >
              {message}
            </Markdown>
          ) : streaming ? (
            <div className="cl-animate-pulse">
              <MoreHorizontal />
            </div>
          ) : null}
          {statusNote ? <div className="cl-status-note">{statusNote}</div> : null}
        </div>
      )}
    </div>
  );
}
