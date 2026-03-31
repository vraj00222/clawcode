# Clawcode

Plain helper files to build and run the open-source CLI locally.

## Requirements

- Bun 1.3+
- Node.js 18+
- API key

## Steps (Clone -> Add src -> Run)

```bash
# 1) Clone this setup repo
git clone git@github.com:vraj00222/clawcode.git
cd clawcode

# 2) Put the source code's src folder here
# Replace /absolute/path/to/your/source with the source you already have access to
rm -rf ./src
cp -R /absolute/path/to/your/source/src ./src

# 3) Verify src is in the right place
test -f ./src/entrypoints/cli.tsx && echo "src ok"

# 4) Install and build
bun install
bun run build

# 5) Set API key
export API_KEY="your-api-key"

# Optional: only if your provider needs a custom base URL
# export API_BASE_URL="https://your-provider.example/v1"

# 6) Run
./start.sh
```

## Optional: One-shot mode

```bash
./start.sh -p "your prompt"
```

## If your source is in another git repo

```bash
git clone <your-source-repo-url> /tmp/source-repo
rm -rf ./src
cp -R /tmp/source-repo/src ./src
```

## Environment variables

- API_KEY: required
- API_BASE_URL: optional, defaults to https://api.openai.com/v1
- PROXY_PORT: optional, defaults to 4010

## Notes

- This repository is only setup/build/run helper files.
- Edit model mapping in proxy.ts if you want different models.
