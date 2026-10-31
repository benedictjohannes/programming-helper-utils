export interface RawTranscriptRecord {
  step_index: number;
  source: 'USER_EXPLICIT' | 'MODEL' | 'SYSTEM' | string;
  type: 'USER_INPUT' | 'PLANNER_RESPONSE' | 'GENERIC' | 'SYSTEM_MESSAGE' | string;
  status?: string;
  created_at: string;
  content?: string;
  thinking?: string;
  tool_calls?: Array<{
    name: string;
    args: Record<string, any>;
  }>;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  error?: any;
  media?: Array<{
    mime_type: string;
    uri: string;
  }>;
}

export interface ToolExecutionItem {
  id: string;
  name: string;
  args: Record<string, any>;
  summaryText: string;
  outputContent?: string;
  status: string;
  error?: any;
  thinking?: string;
  stepIndexCall: number;
  stepIndexResult?: number;
  createdAt: string;
}

export interface ModelInfo {
  model: string;
  variant?: string;
  provider?: string;
}

export type TimelineItemType = 
  | 'user_input'
  | 'tool_executions'
  | 'model_response'
  | 'system_message';

export interface TimelineItem {
  id: string;
  type: TimelineItemType;
  stepIndex: number;
  createdAt: string;
  status?: string;
  // For user_input and model_response and system_message
  content?: string;
  thinking?: string;
  media?: Array<{ mime_type: string; uri: string }>;
  // For tool_executions
  tools?: ToolExecutionItem[];
  // Tokens info
  tokens?: {
    input?: number;
    output?: number;
    cacheRead?: number;
  };
  // Model info
  modelInfo?: ModelInfo;
}

export interface SearchMatch {
  itemId: string;
  subId?: string; // tool id or content area
  field: 'user_prompt' | 'assistant_text' | 'tool_input' | 'tool_output' | 'system';
  preview: string;
  matchIndex: number;
}
