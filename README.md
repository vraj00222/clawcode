# Clawcode

Plain helper files to build and run the open-source CLI locally.

## Requirements

- Bun 1.3+
- Node.js 18+
- API key

## Quick Start

```bash
bun install
bun run build

export API_KEY="your-api-key"
# Optional: only if your provider needs a custom base URL
# export API_BASE_URL="https://your-provider.example/v1"

./start.sh
```

## Print Mode

```bash
./start.sh -p "your prompt"
```

## Environment Variables

- API_KEY: required
- API_BASE_URL: optional, defaults to https://api.openai.com/v1
- PROXY_PORT: optional, defaults to 4010

## Notes

- This repository is only setup/build/run helper files.
- Edit model mapping in proxy.ts if you want different models.
