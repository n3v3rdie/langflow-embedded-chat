import { ToolActivity } from "../../chatWidget/toolActivity";

export type GenerationState = "idle" | "streaming" | "completed" | "error" | "cancelled";

export type ChatMessageType = {
    id?: string;
    message: string;
    isSend: boolean;
    error?: boolean;
    status?: Exclude<GenerationState, "idle">;
    statusNote?: string;
    tools?: ToolActivity[];
    bot_message_style?: React.CSSProperties;
    user_message_style?: React.CSSProperties;
    error_message_style?: React.CSSProperties;
  };


  export type ChatMessagePlaceholderType = {
    bot_message_style?: React.CSSProperties;
  };