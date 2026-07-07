/**
 * Ai.ts
 * In-game AI Agents with Tool Calling and Safety Limits.
 */
import { apiClient, activeGameId, requireInit } from "./Core";
import { ensureGuestSession } from "./Auth";
import { deleteStorage, getStorage, setStorage } from "./Save";
import { withServiceGuard } from "./ServiceGuards";

type LlmResponsePayload = {
  input?: string | Array<Record<string, unknown>>;
  messages?: Array<Record<string, unknown>>;
  model?: string;
  stream?: boolean;
  instructions?: string;
  metadata?: Record<string, unknown>;
  previous_response_id?: string;
  prompt_cache_key?: string;
  prompt_cache_retention?: "in_memory" | "24h";
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  tools?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

type LlmResponse = {
  id?: string;
  object?: "response" | string;
  created_at?: number;
  model?: string;
  output_text?: string;
  output?: Array<Record<string, unknown>>;
  usage?: Record<string, unknown>;
  [key: string]: unknown;
};

type ResponseStreamEvent = {
  type?: string;
  delta?: string;
  response?: LlmResponse;
  item?: Record<string, unknown>;
  usage?: Record<string, unknown>;
  [key: string]: unknown;
};

interface ChatPayload {
  input?: string | Array<Record<string, unknown>>;
  messages?: Array<Record<string, unknown>>;
  tools?: Array<{
    type: "function" | string;
    name: string;
    description: string;
    parameters: unknown;
  }>;
  maxToolLoops?: number;
  history?: unknown;
  [key: string]: unknown;
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: unknown;
  execute: (args: Record<string, unknown>) => Promise<unknown> | unknown;
}

export interface AgentChatOptions {
  onChunk?: (textDelta: string, chunk: ResponseStreamEvent) => void;
}

export interface AgentHistoryOptions {
  /** Stable storage key for this conversation, scoped by the active game/user. */
  id: string;
  /** Instructions used to summarize older conversation history. */
  summarizePrompt: string;
  /** Summarize once the stored recent message count grows beyond this number. */
  maxMessages?: number;
  /** Number of latest messages to keep verbatim after summarizing. */
  keepRecentMessages?: number;
}

type AgentOptions = {
  maxToolLoops?: number;
  history?: AgentHistoryOptions;
  [key: string]: unknown;
};

type ChatMessage = {
  role: string;
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type?: string;
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
};

type StoredAgentHistory = {
  version: 1;
  summary?: string;
  messages: ChatMessage[];
  updatedAt: string;
};

const DEFAULT_AGENT_MODEL = "capybara_agent";
const DEFAULT_SUMMARIZE_MODEL = "capybara_summarize";
const DEFAULT_MAX_HISTORY_MESSAGES = 40;
const DEFAULT_KEEP_RECENT_MESSAGES = 12;
const AGENT_HISTORY_STORAGE_PREFIX = "agentHistory:";

async function* guardAsyncIterable<T>(
  service: string,
  iterableFactory: () => AsyncIterable<T> | Promise<AsyncIterable<T>>,
): AsyncGenerator<T, void, unknown> {
  const iterable = await withServiceGuard(service, () => iterableFactory());
  try {
    for await (const item of iterable) {
      yield item;
    }
  } catch (error) {
    // Convert stream-time 429s into the same stored/default guard behavior.
    await withServiceGuard(service, () => Promise.reject(error));
  }
}

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  return (
    typeof (value as { [Symbol.asyncIterator]?: unknown })?.[
      Symbol.asyncIterator
    ] === "function"
  );
}

function messageFromResponse(response: unknown): ChatMessage {
  const body = response as {
    output_text?: unknown;
    output?: Array<Record<string, unknown>>;
  };

  const toolCalls =
    body.output
      ?.filter((item) => item.type === "function_call")
      .map((item) => ({
        id: String(item.call_id ?? item.id ?? ""),
        type: "function",
        function: {
          name: String(item.name ?? ""),
          arguments: String(item.arguments ?? ""),
        },
      }))
      .filter((toolCall) => toolCall.id && toolCall.function.name) ?? [];

  const outputText = typeof body.output_text === "string" ? body.output_text : "";

  return {
    role: "assistant",
    content: outputText.length > 0 ? outputText : null,
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  };
}

async function messageFromStream(
  stream: AsyncIterable<ResponseStreamEvent>,
  options: AgentChatOptions = {},
): Promise<ChatMessage> {
  let content = "";
  let completedResponse: unknown;

  const toolCalls: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }> = [];

  for await (const event of stream) {
    if (
      event.type === "response.output_text.delta" &&
      typeof event.delta === "string"
    ) {
      content += event.delta;
      options.onChunk?.(event.delta, event);
    }

    if (event.type === "response.output_item.done") {
      const item = event.item;

      if (item?.type === "function_call") {
        const id = String(item.call_id ?? item.id ?? "");
        const name = String(item.name ?? "");
        const args = String(item.arguments ?? "");

        if (id && name) {
          toolCalls.push({
            id,
            type: "function",
            function: {
              name,
              arguments: args,
            },
          });
        }
      }
    }

    if (event.type === "response.completed" && event.response) {
      completedResponse = event.response;
    }
  }

  // Prefer the final completed response because it is authoritative and contains full output/tool-call data.
  if (completedResponse) {
    return messageFromResponse(completedResponse);
  }

  return {
    role: "assistant",
    content: content.length > 0 ? content : null,
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  };
}

async function requestChatMessage(
  payload: ChatPayload,
  options: AgentChatOptions = {},
): Promise<ChatMessage> {
  const response = completeChat(payload as LlmResponsePayload);

  if (isAsyncIterable<ResponseStreamEvent>(response)) {
    return messageFromStream(response, options);
  }

  return messageFromResponse(await response);
}

function getAgentHistoryStorageKey(id: string): string {
  return `${AGENT_HISTORY_STORAGE_PREFIX}${id}`;
}

function getHistoryMessages(history: ChatMessage[]): ChatMessage[] {
  return history.filter(
    (message) =>
      !(
        message.role === "system" &&
        typeof message.content === "string" &&
        message.content.startsWith("Previous conversation summary:")
      ),
  );
}

function buildAgentHistory(
  systemPrompt: string,
  summary: string | undefined,
  messages: ChatMessage[],
): ChatMessage[] {
  return [
    { role: "system", content: systemPrompt },
    ...(summary
      ? [
          {
            role: "system",
            content: `Previous conversation summary:\n${summary}`,
          },
        ]
      : []),
    ...messages,
  ];
}

function parseToolArguments(rawArguments: string): Record<string, unknown> {
  try {
    const args = JSON.parse(rawArguments || "{}");
    return args && typeof args === "object" && !Array.isArray(args) ? args : {};
  } catch {
    return {};
  }
}

function toResponsesInput(history: ChatMessage[]): Array<Record<string, unknown>> {
  const input: Array<Record<string, unknown>> = [];

  for (const message of history) {
    if (message.role === "system") {
      input.push({
        role: "system",
        content: message.content ?? "",
      });
      continue;
    }

    if (message.role === "user") {
      input.push({
        role: "user",
        content: message.content ?? "",
      });
      continue;
    }

    if (message.role === "assistant") {
      if (message.content) {
        input.push({
          role: "assistant",
          content: message.content,
        });
      }

      for (const toolCall of message.tool_calls ?? []) {
        input.push({
          type: "function_call",
          call_id: toolCall.id,
          name: toolCall.function.name,
          arguments: toolCall.function.arguments,
        });
      }

      continue;
    }

    if (message.role === "tool") {
      input.push({
        type: "function_call_output",
        call_id: message.tool_call_id,
        output: message.content ?? "",
      });
    }
  }

  return input;
}

/**
 * Sends a raw Responses API request using the underlying SDK.
 * Streaming is the default, matching the generated SDK types. Pass
 * `{ stream: false }` to request a non-streaming response object.
 *
 * @param {Object} payload - The OpenAI Responses request payload (input, model, tools, etc.)
 * @returns {AsyncGenerator|Promise<Object>} Stream events by default, or a raw response when `stream: false`.
 */
export function completeChat(
  payload: LlmResponsePayload & { stream: false },
): Promise<LlmResponse | Record<string, unknown>>;
export function completeChat(
  payload: LlmResponsePayload,
): AsyncGenerator<ResponseStreamEvent, void, unknown>;
export function completeChat(
  payload: LlmResponsePayload,
):
  | AsyncGenerator<ResponseStreamEvent, void, unknown>
  | Promise<LlmResponse | Record<string, unknown>> {
  requireInit();

  if (payload.stream === false) {
    return withServiceGuard("ai", async () => {
      requireInit();
      await ensureGuestSession();
      return apiClient.completeChat(activeGameId, payload);
    }) as unknown as Promise<LlmResponse | Record<string, unknown>>;
  }

  return guardAsyncIterable("ai", async () => {
    requireInit();
    await ensureGuestSession();
    return apiClient.completeChat(
      activeGameId,
      payload,
    ) as AsyncIterable<ResponseStreamEvent>;
  });
}

/**
 * A helper class to create stateful AI Agents that can interact with the game.
 */
export class Agent {
  /**
   * @param {string} systemPrompt - The core personality/instructions for the agent.
   * @param {Object} [options] - Options like temperature, model, tools, or persistent history.
   * @param {number} [options.maxToolLoops=5] - Prevents infinite AI tool-calling loops.
   */
  options: AgentOptions;
  systemPrompt: string;
  tools: Record<string, ToolDefinition>;
  history: ChatMessage[];
  private historyOptions?: AgentHistoryOptions;
  private historyLoaded = false;
  private summary?: string;
  private summarizationTask?: Promise<void>;

  constructor(systemPrompt: string, options: AgentOptions = {}) {
    const { history, model: _model, ...completionOptions } = options;
    this.options = {
      maxToolLoops: 5, // Safe default limit
      ...completionOptions,
    };
    this.historyOptions = history;
    this.systemPrompt = systemPrompt;
    this.tools = {};

    // Initialize history with the system prompt. Persistent history loads lazily on first chat.
    this.history = [{ role: "system", content: systemPrompt }];
  }

  /**
   * Registers a function that the AI can choose to call.
   * @param {Object} tool
   * @param {string} tool.name
   * @param {string} tool.description
   * @param {Object} tool.parameters - JSON schema for the arguments.
   * @param {Function} tool.execute - The JS function to run.
   */
  addTool({ name, description, parameters, execute }: ToolDefinition): void {
    this.tools[name] = { name, description, parameters, execute };
  }

  private async ensureHistoryLoaded(): Promise<void> {
    if (this.historyLoaded) return;
    this.historyLoaded = true;

    if (!this.historyOptions) return;

    const stored = await getStorage<StoredAgentHistory>(
      getAgentHistoryStorageKey(this.historyOptions.id),
    );

    if (stored?.version !== 1) return;

    this.summary = stored.summary;
    this.history = buildAgentHistory(
      this.systemPrompt,
      this.summary,
      Array.isArray(stored.messages) ? stored.messages : [],
    );
  }

  private async savePersistentHistory(): Promise<void> {
    if (!this.historyOptions) return;

    await setStorage<StoredAgentHistory>(
      getAgentHistoryStorageKey(this.historyOptions.id),
      {
        version: 1,
        summary: this.summary,
        messages: getHistoryMessages(this.history).slice(1),
        updatedAt: new Date().toISOString(),
      },
    );

    this.scheduleBackgroundSummarization();
  }

  private scheduleBackgroundSummarization(): void {
    if (!this.historyOptions || this.summarizationTask) return;

    const maxMessages =
      this.historyOptions.maxMessages ?? DEFAULT_MAX_HISTORY_MESSAGES;
    const messages = getHistoryMessages(this.history).slice(1);
    if (messages.length <= maxMessages) return;

    this.summarizationTask = this.summarizeHistoryIfNeeded().catch((error) => {
      console.warn(
        "[AI Agent] Background history summarization failed.",
        error,
      );
    });
    void this.summarizationTask.finally(() => {
      this.summarizationTask = undefined;
      this.scheduleBackgroundSummarization();
    });
  }

  private async summarizeHistoryIfNeeded(): Promise<void> {
    if (!this.historyOptions) return;

    const maxMessages =
      this.historyOptions.maxMessages ?? DEFAULT_MAX_HISTORY_MESSAGES;
    const keepRecentMessages = Math.max(
      1,
      Math.min(
        this.historyOptions.keepRecentMessages ?? DEFAULT_KEEP_RECENT_MESSAGES,
        maxMessages,
      ),
    );
    const messagesAtStart = getHistoryMessages(this.history).slice(1);

    if (messagesAtStart.length <= maxMessages) return;

    const messagesToSummarize = messagesAtStart.slice(0, -keepRecentMessages);
    const summarizedCount = messagesToSummarize.length;
    const previousSummary = this.summary?.trim()
      ? `Existing summary:\n${this.summary}\n\n`
      : "";

    const summaryMessage = await requestChatMessage({
      stream: false,
      input: [
        {
          role: "system",
          content: this.historyOptions.summarizePrompt,
        },
        {
          role: "user",
          content: `${previousSummary}Summarize these older conversation messages for future continuity. Preserve durable facts, player preferences, promises, unresolved tasks, and relationship changes.\n\n${JSON.stringify(
            messagesToSummarize,
          )}`,
        },
      ],
      model: DEFAULT_SUMMARIZE_MODEL,
      providerOptions: this.options.providerOptions,
      metadata: this.options.metadata,
    });

    const currentMessages = getHistoryMessages(this.history).slice(1);
    const remainingMessages = currentMessages.slice(summarizedCount);

    this.summary = summaryMessage.content ?? this.summary;
    this.history = buildAgentHistory(
      this.systemPrompt,
      this.summary,
      remainingMessages,
    );

    await setStorage<StoredAgentHistory>(
      getAgentHistoryStorageKey(this.historyOptions.id),
      {
        version: 1,
        summary: this.summary,
        messages: remainingMessages,
        updatedAt: new Date().toISOString(),
      },
    );
  }

  /**
   * Sends a message to the agent. Automatically handles tool calling loops.
   * Uses streaming completions by default and invokes `options.onChunk` as text arrives.
   *
   * @param {string} [userText] - The player's message
   * @param {Object} [options]
   * @param {Function} [options.onChunk] - Receives text deltas as they stream in.
   * @returns {Promise<string>} The agent's final text response.
   */
  async chat(
    userText?: string,
    options: AgentChatOptions = {},
  ): Promise<string> {
    await this.ensureHistoryLoaded();

    if (userText) {
      this.history.push({ role: "user", content: userText });
    }

    let currentLoop = 0;
    const maxLoops = this.options.maxToolLoops ?? 5;

    while (currentLoop < maxLoops) {
      currentLoop++;

      const payload: ChatPayload = {
        input: toResponsesInput(this.history),
        ...this.options,
        model: DEFAULT_AGENT_MODEL,
      };

      // Strip out our custom JS wrapper option before sending to the server
      delete payload.maxToolLoops;
      delete payload.history;

      const toolDefinitions = Object.values(this.tools);
      if (toolDefinitions.length > 0) {
        payload.tools = toolDefinitions.map((t) => ({
          type: "function",
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        }));
      }

      const message = await requestChatMessage(payload, options);

      // Save the assistant's response to history (required by OpenAI for tool calls)
      this.history.push(message);

      // 1. Base case: The AI did NOT call any tools. Return the text.
      if (!message.tool_calls || message.tool_calls.length === 0) {
        await this.savePersistentHistory();
        return message.content ?? "";
      }

      // 2. Execution step: The AI wants to call tools.
      for (const toolCall of message.tool_calls) {
        const funcName = toolCall.function.name;
        const args = parseToolArguments(toolCall.function.arguments);
        const tool = this.tools[funcName];

        let resultData;
        try {
          if (!tool)
            throw new Error(
              `Tool ${funcName} not found in agent configuration.`,
            );
          // Await the game developer's custom logic
          resultData = await tool.execute(args);
        } catch (error) {
          // Pass the error message back to the AI so it knows what went wrong
          resultData = {
            error: error instanceof Error ? error.message : String(error),
          };
        }

        // Append the tool's result to the history so the AI can read it
        this.history.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: funcName,
          content: JSON.stringify(resultData),
        });
      }

      // Loop restarts: the payload is re-built with the new tool results and sent back to the AI.
    }

    // --- Safety Net ---
    // If we break out of the while loop, the AI hit the max loop limit.
    // Clean up the user's message from history so the chat state isn't permanently broken.
    if (userText) {
      const userMessageIndex = this.history.findLastIndex(
        (msg) => msg.role === "user",
      );
      if (userMessageIndex !== -1) {
        this.history.splice(userMessageIndex);
      }
    }

    throw new Error(
      `AI Agent exceeded maximum tool execution loop of ${maxLoops}. It got confused.`,
    );
  }

  /**
   * Wipes the agent's memory back to just the system prompt and clears persistent history when configured.
   */
  async resetMemory(): Promise<void> {
    this.summary = undefined;
    this.historyLoaded = true;
    this.history = [{ role: "system", content: this.systemPrompt }];

    if (this.historyOptions) {
      await deleteStorage(getAgentHistoryStorageKey(this.historyOptions.id));
    }
  }
}
