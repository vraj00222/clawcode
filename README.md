# Clawcode

Run Claude Code CLI locally with open-source models (Qwen, DeepSeek) via [Novita AI](https://novita.ai).

This repo contains the build infrastructure and proxy needed to compile and run the Claude Code source (`src/`) with third-party LLM providers.

## Prerequisites

- **[Bun](https://bun.sh)** v1.3+ — `curl -fsSL https://bun.sh/install | bash`
- **Node.js** 18+
- **Novita AI API key** — get one at [novita.ai](https://novita.ai)

## Setup

```bash
# 1. Install dependencies
bun install

# 2. Build
bun run build

# 3. Set your API key
export NOVITA_API_KEY="your-key-here"

# 4. Run
./start.sh                        # interactive mode
./start.sh -p "your prompt"       # one-shot mode
./start.sh --help                 # see all options
```

## How it works

Claude Code is built for the Anthropic API. To use it with Novita AI (OpenAI-compatible API), a lightweight Bun proxy (`proxy.ts`) translates between the two formats:

```
Claude Code  →  proxy.ts (Anthropic → OpenAI)  →  Novita AI  →  Qwen/DeepSeek
```

`start.sh` launches the proxy and CLI together.

## Model Mapping

| Claude Code model | Novita AI model | Notes |
|---|---|---|
| `claude-opus-4-6` | `qwen/qwen3.5-397b-a17b` | Best Qwen model |
| `claude-sonnet-4-6` | `qwen/qwen3-235b-a22b-thinking` | Thinking model |
| `claude-haiku-4-5` | `deepseek/deepseek-v3.2` | Fast & cheap |

Edit `MODEL_MAP` in `proxy.ts` to change models.

## Build Details

`build.ts` uses Bun's bundler with:
- `MACRO.*` build-time constant injection
- Path resolution for `src/` absolute imports
- Auto-stubbing of unavailable internal Anthropic packages (`@ant/*`, `@anthropic-ai/sandbox-runtime`, etc.)

## Files

| File | Purpose |
|---|---|
| `package.json` | Dependencies |
| `build.ts` | Bun build script |
| `proxy.ts` | Anthropic → OpenAI API translator |
| `start.sh` | One-command launcher |
| `tsconfig.json` | TypeScript config |
| `litellm_config.yaml` | Alternative litellm proxy config |
| `src/` | Claude Code source (not included — add your own) |

## Limitations

- Tool use (Bash, Edit, Read) may behave differently with Qwen/DeepSeek vs Claude
- Sandbox, computer use, and Anthropic-internal features are stubbed out
- Some skills have placeholder content
