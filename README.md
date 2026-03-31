# Clawcode

Because why pay for Claude when you can duct-tape open-source models to its CLI and pretend everything's fine?

This repo lets you run the Claude Code CLI locally with **any OpenAI-compatible API provider** — Novita AI, Together AI, Groq, OpenRouter, your self-hosted vLLM, your cousin's GPU in the basement, whatever.

## What is this?

Claude Code is Anthropic's fancy terminal AI assistant. It's built to talk exclusively to Claude models via the Anthropic API. This repo provides the build tooling and a translation proxy so you can point it at literally any other LLM provider instead.

Does it work perfectly? No. Does it work? Surprisingly, yes.

## Quick Start

```bash
# You need Bun. If you don't have it, honestly what are you doing.
curl -fsSL https://bun.sh/install | bash

# Also Node 18+. You probably have this already.

# Clone this, drop your Claude Code source into src/
git clone git@github.com:vraj00222/clawcode.git
cd clawcode

# Install the 70+ npm packages this thing needs
bun install

# Build it (takes ~10 seconds, outputs ~73MB because of course it does)
bun run build

# Set your API key (Novita AI, OpenRouter, Together, whatever)
export NOVITA_API_KEY="your-key-here"

# Run it
./start.sh
```

That's it. You're now running a $200/month tool with $0.30/million token models.

## Bring Your Own API Key

The proxy (`proxy.ts`) talks to any OpenAI-compatible endpoint. Edit these lines:

```typescript
// proxy.ts — change these to your provider
const NOVITA_API_KEY = process.env.NOVITA_API_KEY || "";
const NOVITA_BASE = "https://api.novita.ai/openai/v1";
```

Some providers that work:
- **Novita AI** — cheap Qwen & DeepSeek
- **Together AI** — good model selection
- **OpenRouter** — aggregator, lots of models
- **Groq** — blazing fast inference
- **Any vLLM/Ollama instance** — your hardware, your rules

## Model Mapping

The CLI asks for Claude models. The proxy swaps them out. Edit `MODEL_MAP` in `proxy.ts`:

```typescript
const MODEL_MAP = {
  "claude-opus-4-6":   "qwen/qwen3.5-397b-a17b",   // the big one
  "claude-sonnet-4-6": "qwen/qwen3-235b-a22b-thinking-2507",
  "claude-haiku-4-5":  "deepseek/deepseek-v3.2",    // fast and cheap
};
```

Change these to whatever models your provider offers.

## How It Actually Works

```
You type something
    ↓
Claude Code CLI (thinks it's talking to Anthropic)
    ↓
proxy.ts (translates Anthropic format → OpenAI format)
    ↓
Your API provider (Novita AI, etc.)
    ↓
Qwen/DeepSeek/whatever responds
    ↓
proxy.ts (translates response back to Anthropic format)
    ↓
Claude Code CLI (none the wiser)
```

The proxy is ~300 lines of TypeScript. It handles streaming, tool calls, system prompts, the works.

## Build System

The source code was never meant to be built outside Anthropic's internal tooling, so `build.ts` does some creative problem-solving:

- Injects `MACRO.VERSION` and other build-time constants
- Resolves `src/` absolute imports that the bundler doesn't understand
- Stubs out ~12 internal Anthropic packages that don't exist on npm (`@ant/*`, sandbox runtime, etc.)
- Creates proper named exports for the stubs so the bundler doesn't complain
- Handles `.md` and `.txt` file imports as strings

It's not pretty, but it works.

## What's In Here

```
package.json          — 70+ dependencies. yes, seventy.
build.ts              — the build script that holds this together
proxy.ts              — Anthropic ↔ OpenAI API translator
start.sh              — launches proxy + CLI in one command
tsconfig.json         — TypeScript config
litellm_config.yaml   — alternative proxy config (if you prefer Python)
src/                  — Claude Code source (not included, add your own)
```

## What Works

- CLI loads and responds
- API calls route through your provider
- Streaming responses
- Print mode (`-p`)
- Basic interactive mode

## What Doesn't

- Tool use (Bash, Edit, etc.) is hit-or-miss depending on your model's function calling ability
- Sandbox features — stubbed out, they need Anthropic's internal packages
- Computer use — same deal
- Some skills have placeholder content
- The models sometimes get confused by Claude-specific system prompts

## Troubleshooting

**"It just hangs and does nothing"** — your API key is probably wrong or the provider is down.

**"Tool calls don't work"** — your model probably doesn't support function calling well. Try a bigger model.

**"Build fails"** — make sure you have the `src/` directory with the actual Claude Code source.

**"Why is the bundle 73MB?"** — because it bundles React, an entire terminal UI framework, OpenTelemetry, multiple cloud SDKs, and what feels like half of npm. Welcome to modern JavaScript.

## License

The build tooling in this repo is yours to use. The Claude Code source (`src/`) is Anthropic's — check their terms.
