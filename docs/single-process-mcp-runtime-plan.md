# Single-Process MCP Runtime Plan

## Goal

Astmend should stop being a long-lived Codex-spawned stdio process. It should
be loadable as an in-process MCP service by the shared local MCP host, while
retaining a direct stdio command for development and compatibility.

Target steady state:

- The shared host process loads Astmend tools in-process.
- Codex no longer starts `bun run src/mcp/server.ts` for Astmend directly.
- Any stdio entrypoint that still exists is a short-lived adapter or dev-only
  fallback.

## Current State

Current MCP entrypoint:

- `src/mcp/server.ts`
- `package.json` scripts:
  - `mcp:dev`: `tsx src/mcp/server.ts`
  - `mcp:start`: `node dist/mcp/server.js`

The server already has a good split point: `createServer()` builds the MCP
server, and the bottom of the file wires `StdioServerTransport`. The missing
piece is a host-facing service adapter that exposes the tool definitions and
handlers without binding to stdio.

## Architecture

```text
shared MCP host process
  -> import Astmend service factory
      -> Astmend tools and handlers

dev-only direct mode
  -> src/mcp/server.ts
      -> StdioServerTransport
```

The direct mode remains useful for local debugging, but it should not be the
primary Codex runtime after migration.

## Implementation Plan

### Phase 1: Separate Tool Registration From Transport

Files:

- `src/mcp/server.ts`
- `src/mcp/service.ts`
- `src/index.ts`
- `test` or `tests` MCP coverage files

Tasks:

1. Move tool registration into a new `createAstmendMcpService()` or equivalent
   module.
2. Keep `createServer()` as a compatibility wrapper that builds an SDK
   `McpServer` from the service definition.
3. Ensure importing the service module does not open stdio, mutate global
   process state, or start timers.

Acceptance:

- Existing direct MCP server still starts in dev mode.
- The service factory can be imported in a test without keeping the process
  alive.
- Tool names and input schemas stay unchanged.

### Phase 2: Add Host-Facing Service Contract

Files:

- `src/mcp/service.ts`
- `src/mcp/results.ts`
- `src/index.ts`

Tasks:

1. Export a plain service object:
   - `name`
   - `version`
   - `tools`
   - `callTool(name, args)`
2. Preserve current structured success/error result behavior.
3. Avoid host-specific dependencies. The service should not know whether it is
   called through stdio, socket, tests, or the shared host.

Acceptance:

- Host code can call Astmend tools without constructing `StdioServerTransport`.
- Invalid input still returns the same MCP-style error shape.
- Public package exports are explicit and documented.

### Phase 3: Keep Direct Stdio as Fallback

Files:

- `src/mcp/server.ts`
- `mcp/README.md`
- `README.md`
- `package.json`

Tasks:

1. Keep `mcp:dev` and `mcp:start` as development-only direct server commands.
2. Add documentation that Codex production/local runtime should use the shared
   host adapter, not direct Astmend stdio.
3. Add an idle timeout to direct stdio mode if it remains in regular use.

Acceptance:

- Direct stdio mode exits on transport close or stdin close.
- Running direct mode repeatedly does not leave extra long-lived processes.
- Docs clearly distinguish host mode from direct debug mode.

### Phase 4: Integration With Shared Host

Files:

- Astmend exports in this repo.
- Gnosis host integration files in `/Users/y.noguchi/Code/gnosis`.

Tasks:

1. Provide a stable import path for the host, such as package root export or
   `dist/mcp/service.js`.
2. Confirm the host can call:
   - `analyze_references_from_file`
   - `detect_impact_from_file`
   - `apply_patch_from_file`
3. Ensure file-system operations still resolve paths relative to the caller's
   supplied inputs, not the host's current working directory unless explicitly
   documented.

Acceptance:

- Astmend tools work through the shared host.
- Direct Astmend MCP process is not required in `~/.codex/config.toml`.
- No Astmend Bun process remains after adapter disconnect.

## Watchdog Position

Astmend should not need its own watchdog. It is mostly stateless and should rely
on the shared host lifecycle.

Keep any watchdog logic in the shared host only, where it can detect:

- direct Astmend stdio processes that were accidentally left running;
- stale adapter processes;
- host/service health failures.

The watchdog should be a recovery path, not the normal owner of Astmend
lifecycle.

## Validation Commands

Run from `/Users/y.noguchi/Code/Astmend`:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Host integration smoke, run after Gnosis host support exists:

```bash
node -e "import('./dist/mcp/service.js').then(m => console.log(Object.keys(m)))"
```

Expected runtime state after migration:

- No long-lived `bun run src/mcp/server.ts` Astmend process.
- Astmend tools are served by the shared host process.

