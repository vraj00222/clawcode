/**
 * Build script for clawcode (Claude Code source)
 *
 * Uses Bun's bundler to compile the CLI with:
 * - MACRO.* build-time constants
 * - feature() flags for dead-code elimination
 * - Path resolution for absolute 'src/' imports
 * - Auto-stubbing for unavailable/missing packages and files
 */

import { existsSync } from "fs";
import { join } from "path";

const now = new Date().toISOString();
const version = "1.0.100-dev";
const projectRoot = import.meta.dir;

// Track what we stub for the build summary
const stubbedModules = new Set<string>();

// Packages to always stub (internal/unavailable)
const alwaysStub = [
  "@ant/",
  "@anthropic-ai/bedrock-sdk",
  "@anthropic-ai/foundry-sdk",
  "@anthropic-ai/vertex-sdk",
  "@anthropic-ai/mcpb",
  "@anthropic-ai/sandbox-runtime",
  "@azure/identity",
  "color-diff-napi",
  "modifiers-napi",
];

function shouldAlwaysStub(path: string): boolean {
  return alwaysStub.some((prefix) => path.startsWith(prefix));
}

function tryResolveFile(basePath: string): string | null {
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".txt", "/index.ts", "/index.tsx", "/index.js"];
  if (existsSync(basePath)) return basePath;
  const stripped = basePath.replace(/\.js$/, "");
  for (const ext of extensions) {
    const candidate = stripped + ext;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

// Custom stub code for packages that need more than a generic Proxy
const customStubs: Record<string, string> = {
  "@anthropic-ai/sandbox-runtime": `
    // SandboxManager stub with proper return values
    export const SandboxManager = {
      checkDependencies: () => ({ errors: ["sandbox-runtime not available"], warnings: [] }),
      isSupportedPlatform: () => false,
      reset: () => {},
      getAllowUnixSockets: () => false,
      getAllowLocalBinding: () => false,
      getEnableWeakerNestedSandbox: () => false,
      getProxyPort: () => 0,
      getSocksProxyPort: () => 0,
    };
    export const SandboxRuntimeConfigSchema = { parse: (v) => v, safeParse: (v) => ({ success: true, data: v }) };
    export const SandboxViolationStore = { getViolations: () => [], clear: () => {} };
    export default SandboxManager;
    export const __stub__ = true;
  `,
};

// Named exports needed by each stubbed package (extracted from source imports)
const packageExports: Record<string, string[]> = {
  "@anthropic-ai/sandbox-runtime": [
    "SandboxManager", "SandboxRuntimeConfigSchema", "SandboxViolationStore",
  ],
  "@anthropic-ai/mcpb": [],
  "@ant/claude-for-chrome-mcp": [
    "BROWSER_TOOLS", "createClaudeForChromeMcpServer",
  ],
  "@ant/computer-use-input": [],
  "@ant/computer-use-mcp": [
    "bindSessionContext", "buildComputerUseTools", "createComputerUseMcpServer",
    "DEFAULT_GRANT_FLAGS", "API_RESIZE_PARAMS", "targetImageSize",
  ],
  "@ant/computer-use-mcp/sentinelApps": [],
  "@ant/computer-use-mcp/types": [],
  "@ant/computer-use-swift": [],
  "color-diff-napi": [
    "ColorDiff", "ColorFile", "getSyntaxTheme",
  ],
  "modifiers-napi": ["isModifierPressed"],
};

function getNamedExportsForPackage(path: string): string[] {
  // Try exact match first, then prefix match
  if (packageExports[path]) return packageExports[path];
  for (const [pkg, exports] of Object.entries(packageExports)) {
    if (path.startsWith(pkg)) return exports;
  }
  return [];
}

const resolverPlugin: import("bun").BunPlugin = {
  name: "clawcode-resolver",
  setup(build) {
    // Resolve bare 'src/...' imports to the actual src directory
    build.onResolve({ filter: /^src\// }, (args) => {
      const relativePath = args.path.replace(/^src\//, "");
      const fullPath = join(projectRoot, "src", relativePath);
      const resolved = tryResolveFile(fullPath);
      if (resolved) return { path: resolved };
      stubbedModules.add(args.path);
      return { path: args.path, namespace: "stub" };
    });

    // Stub internal/unavailable packages
    build.onResolve({ filter: /.*/ }, (args) => {
      if (shouldAlwaysStub(args.path)) {
        stubbedModules.add(args.path);
        return { path: args.path, namespace: "stub" };
      }
      return undefined;
    });

    // Handle .d.ts imports (type-only, no runtime needed)
    build.onResolve({ filter: /\.d\.ts$/ }, (args) => {
      return { path: join(args.resolveDir || projectRoot, args.path), namespace: "stub" };
    });

    // Handle .txt imports as text
    build.onResolve({ filter: /\.txt$/ }, (args) => {
      const fullPath = join(args.resolveDir || projectRoot, args.path);
      if (existsSync(fullPath)) {
        return { path: fullPath, namespace: "text-file" };
      }
      return undefined;
    });

    // Handle .md imports as text
    build.onResolve({ filter: /\.md$/ }, (args) => {
      if (!args.path.startsWith(".")) return undefined;
      const fullPath = join(args.resolveDir || projectRoot, args.path);
      if (existsSync(fullPath)) {
        return { path: fullPath, namespace: "md-text" };
      }
      stubbedModules.add(args.path);
      return { path: fullPath, namespace: "stub" };
    });

    // Load .txt files as string exports
    build.onLoad({ filter: /.*/, namespace: "text-file" }, async (args) => {
      const text = await Bun.file(args.path).text();
      return {
        contents: `export default ${JSON.stringify(text)};`,
        loader: "js",
      };
    });

    // Load .md files as string exports
    build.onLoad({ filter: /.*/, namespace: "md-text" }, async (args) => {
      const text = await Bun.file(args.path).text();
      return {
        contents: `export default ${JSON.stringify(text)};`,
        loader: "js",
      };
    });

    // Provide stubs with correct named exports for each stubbed package
    build.onLoad({ filter: /.*/, namespace: "stub" }, (args) => {
      // Use custom stub if available
      const custom = customStubs[args.path];
      if (custom) {
        return { contents: custom, loader: "js" };
      }

      const namedExports = getNamedExportsForPackage(args.path);
      const exportLines = namedExports
        .map((name) => `export const ${name} = stub;`)
        .join("\n");

      return {
        contents: `
          // Stub: ${args.path} (unavailable in local dev build)
          const noop = () => ({ errors: [], warnings: [] });
          const stub = new Proxy(noop, {
            get: (_, prop) => {
              if (prop === 'then' || prop === Symbol.toPrimitive) return undefined;
              if (prop === '__stub__') return true;
              if (prop === 'length') return 0;
              if (prop === 'errors' || prop === 'warnings') return [];
              return stub;
            },
            apply: () => ({ errors: [], warnings: [] }),
            construct: () => stub,
          });
          export default stub;
          export const __stub__ = true;
          ${exportLines}
        `,
        loader: "js",
      };
    });
  },
};

console.log("Building clawcode...\n");

const result = await Bun.build({
  entrypoints: ["./src/entrypoints/cli.tsx"],
  outdir: "./dist",
  target: "bun",
  format: "esm",
  splitting: false,
  sourcemap: "external",
  plugins: [resolverPlugin],
  external: ["sharp"], // sharp has native bindings, keep external
  define: {
    "MACRO.VERSION": JSON.stringify(version),
    "MACRO.BUILD_TIME": JSON.stringify(now),
    "MACRO.PACKAGE_URL": JSON.stringify(""),
    "MACRO.NATIVE_PACKAGE_URL": JSON.stringify(""),
    "MACRO.FEEDBACK_CHANNEL": JSON.stringify("github"),
    "MACRO.ISSUES_EXPLAINER": JSON.stringify("https://github.com/anthropics/claude-code/issues"),
    "MACRO.VERSION_CHANGELOG": JSON.stringify(""),
  },
});

if (!result.success) {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const msg of result.logs) {
    const text = String(msg);
    if (text.includes("Could not resolve") || text.includes("File not found")) {
      warnings.push(text);
    } else {
      errors.push(text);
    }
  }

  if (warnings.length > 0) {
    console.warn(`\n${warnings.length} unresolved imports (stubbed, features using these won't work):`);
    const seen = new Set<string>();
    for (const w of warnings) {
      const match = w.match(/"([^"]+)"/);
      if (match && !seen.has(match[1])) {
        seen.add(match[1]);
        console.warn(`  - ${match[1]}`);
      }
    }
  }

  if (errors.length > 0) {
    console.error("\nFatal build errors:");
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }

  // If only warnings (unresolved imports) but no real errors, treat as success
  // since we have stubs for missing modules
  if (warnings.length > 0 && errors.length === 0) {
    console.log("\nBuild completed with warnings (missing modules are stubbed).");
  }
}

if (stubbedModules.size > 0) {
  console.log(`\nStubbed ${stubbedModules.size} unavailable modules`);
}

if (result.outputs && result.outputs.length > 0) {
  let totalSize = 0;
  for (const output of result.outputs) {
    totalSize += output.size;
  }
  console.log(`\nBuild output: ${result.outputs.length} files, ${(totalSize / 1024 / 1024).toFixed(1)} MB total -> ./dist`);
}
