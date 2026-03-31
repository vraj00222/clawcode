/**
 * Minimal Anthropic→OpenAI API translator proxy for Novita AI.
 * Translates Claude Code's Anthropic API requests into OpenAI format.
 */

const NOVITA_API_KEY = process.env.NOVITA_API_KEY || "";
const NOVITA_BASE = "https://api.novita.ai/openai/v1";
const PORT = Number(process.env.PROXY_PORT) || 4010;

// Map Anthropic model names → Novita model IDs
const MODEL_MAP: Record<string, string> = {
  "claude-opus-4-6":            "qwen/qwen3.5-397b-a17b",
  "claude-sonnet-4-6":          "qwen/qwen3-235b-a22b-thinking-2507",
  "claude-haiku-4-5-20251001":  "deepseek/deepseek-v3.2",
  "claude-3-5-sonnet-20241022": "qwen/qwen3-235b-a22b-thinking-2507",
  "claude-3-5-haiku-20241022":  "deepseek/deepseek-v3.2",
};
const DEFAULT_MODEL = "qwen/qwen3-235b-a22b-thinking-2507";

function mapModel(anthropicModel: string): string {
  return MODEL_MAP[anthropicModel] || DEFAULT_MODEL;
}

// Convert Anthropic message content to OpenAI format
function convertContent(content: any): string | any[] {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: any[] = [];
    for (const block of content) {
      if (block.type === "text") {
        parts.push({ type: "text", text: block.text });
      } else if (block.type === "tool_use") {
        // Will be handled as tool_calls
      } else if (block.type === "tool_result") {
        // Will be handled separately
      } else if (block.type === "image") {
        parts.push({
          type: "image_url",
          image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` },
        });
      }
    }
    return parts.length === 1 && parts[0].type === "text" ? parts[0].text : parts;
  }
  return String(content || "");
}

// Convert Anthropic tool definitions to OpenAI function format
function convertTools(tools: any[]): any[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description || "",
      parameters: tool.input_schema || { type: "object", properties: {} },
    },
  }));
}

// Convert Anthropic messages to OpenAI format
function convertMessages(messages: any[], system?: string | any[]): any[] {
  const result: any[] = [];

  // System prompt
  if (system) {
    const text = typeof system === "string"
      ? system
      : system.map((b: any) => b.text || "").join("\n");
    result.push({ role: "system", content: text });
  }

  for (const msg of messages) {
    if (msg.role === "user") {
      result.push({ role: "user", content: convertContent(msg.content) });
    } else if (msg.role === "assistant") {
      const content = typeof msg.content === "string" ? msg.content : undefined;
      const toolCalls: any[] = [];
      let textParts = "";

      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "text") textParts += block.text;
          if (block.type === "tool_use") {
            toolCalls.push({
              id: block.id,
              type: "function",
              function: {
                name: block.name,
                arguments: typeof block.input === "string" ? block.input : JSON.stringify(block.input),
              },
            });
          }
        }
      }

      const assistantMsg: any = { role: "assistant" };
      if (content) assistantMsg.content = content;
      else if (textParts) assistantMsg.content = textParts;
      if (toolCalls.length > 0) assistantMsg.tool_calls = toolCalls;
      result.push(assistantMsg);
    }

    // Handle tool_result blocks in user messages
    if (msg.role === "user" && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === "tool_result") {
          const resultContent = typeof block.content === "string"
            ? block.content
            : Array.isArray(block.content)
              ? block.content.map((b: any) => b.text || "").join("\n")
              : JSON.stringify(block.content);
          // Insert tool message before the user message
          result.splice(-1, 0, {
            role: "tool",
            tool_call_id: block.tool_use_id,
            content: resultContent,
          });
        }
      }
    }
  }

  return result;
}

// Convert OpenAI streaming response to Anthropic SSE format
function convertStreamChunk(chunk: any, inputModel: string): any[] {
  const events: any[] = [];
  const choice = chunk.choices?.[0];
  if (!choice) return events;

  const delta = choice.delta;

  if (delta?.role === "assistant") {
    events.push({
      type: "message_start",
      message: {
        id: `msg_${chunk.id}`,
        type: "message",
        role: "assistant",
        content: [],
        model: inputModel,
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    });
    events.push({
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    });
  }

  if (delta?.content) {
    events.push({
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: delta.content },
    });
  }

  if (delta?.tool_calls) {
    for (const tc of delta.tool_calls) {
      if (tc.function?.name) {
        events.push({
          type: "content_block_start",
          index: tc.index + 1,
          content_block: {
            type: "tool_use",
            id: tc.id || `toolu_${Date.now()}`,
            name: tc.function.name,
            input: {},
          },
        });
      }
      if (tc.function?.arguments) {
        events.push({
          type: "content_block_delta",
          index: tc.index + 1,
          delta: { type: "input_json_delta", partial_json: tc.function.arguments },
        });
      }
    }
  }

  if (choice.finish_reason) {
    events.push({ type: "content_block_stop", index: 0 });
    const stopReason = choice.finish_reason === "tool_calls" ? "tool_use" : "end_turn";
    events.push({
      type: "message_delta",
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { output_tokens: chunk.usage?.completion_tokens || 0 },
    });
    events.push({ type: "message_stop" });
  }

  return events;
}

// Convert non-streaming OpenAI response to Anthropic format
function convertResponse(oaiResp: any, inputModel: string): any {
  const choice = oaiResp.choices?.[0];
  const content: any[] = [];

  if (choice?.message?.content) {
    content.push({ type: "text", text: choice.message.content });
  }

  if (choice?.message?.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      content.push({
        type: "tool_use",
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments || "{}"),
      });
    }
  }

  return {
    id: `msg_${oaiResp.id}`,
    type: "message",
    role: "assistant",
    content,
    model: inputModel,
    stop_reason: choice?.finish_reason === "tool_calls" ? "tool_use" : "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: oaiResp.usage?.prompt_tokens || 0,
      output_tokens: oaiResp.usage?.completion_tokens || 0,
    },
  };
}

const server = Bun.serve({
  port: PORT,
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // Health check
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle Anthropic /v1/messages endpoint
    if (url.pathname === "/v1/messages" && req.method === "POST") {
      const body = await req.json();
      const inputModel = body.model;
      const novitaModel = mapModel(inputModel);
      const stream = body.stream === true;

      // Build OpenAI request
      const oaiBody: any = {
        model: novitaModel,
        messages: convertMessages(body.messages, body.system),
        max_tokens: body.max_tokens || 4096,
        temperature: body.temperature ?? 0.7,
        stream,
      };

      if (body.tools?.length > 0) {
        oaiBody.tools = convertTools(body.tools);
      }
      if (body.top_p != null) oaiBody.top_p = body.top_p;

      console.log(`[proxy] ${inputModel} -> ${novitaModel}${stream ? " (stream)" : ""}`);

      const oaiResp = await fetch(`${NOVITA_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${NOVITA_API_KEY}`,
        },
        body: JSON.stringify(oaiBody),
      });

      if (!oaiResp.ok) {
        const errText = await oaiResp.text();
        console.error(`[proxy] Novita error ${oaiResp.status}: ${errText}`);
        return new Response(JSON.stringify({
          type: "error",
          error: { type: "api_error", message: `Novita API error: ${oaiResp.status} ${errText}` },
        }), { status: oaiResp.status, headers: { "Content-Type": "application/json" } });
      }

      if (!stream) {
        const oaiData = await oaiResp.json();
        return new Response(JSON.stringify(convertResponse(oaiData, inputModel)), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Streaming response
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          const reader = oaiResp.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                const data = line.slice(6).trim();
                if (data === "[DONE]") {
                  controller.enqueue(encoder.encode("event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"));
                  continue;
                }
                try {
                  const chunk = JSON.parse(data);
                  const events = convertStreamChunk(chunk, inputModel);
                  for (const evt of events) {
                    controller.enqueue(encoder.encode(`event: ${evt.type}\ndata: ${JSON.stringify(evt)}\n\n`));
                  }
                } catch {}
              }
            }
          } finally {
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // Fallback
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Novita AI proxy running on http://localhost:${PORT}`);
console.log(`Model mapping:`);
for (const [k, v] of Object.entries(MODEL_MAP)) {
  console.log(`  ${k} -> ${v}`);
}
