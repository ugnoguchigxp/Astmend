import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createAstmendMcpService } from './service.js';

export const createServer = () => {
  const service = createAstmendMcpService();
  const server = new McpServer({
    name: service.name,
    version: service.version,
  });

  for (const tool of service.tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      tool.handler,
    );
  }

  return server;
};

type LifecycleServer = {
  close: () => Promise<void>;
};

type LifecycleTransport = {
  onerror?: (error: Error) => void;
  onclose?: () => void;
};

type LifecycleProcess = {
  stdin: {
    once: (event: 'end' | 'close', listener: () => void) => void;
  };
  stderr: {
    write: (chunk: string) => boolean;
  };
  setExitCode: (code: number) => void;
};

const defaultLifecycleProcess: LifecycleProcess = {
  stdin: process.stdin,
  stderr: process.stderr,
  setExitCode: (code) => {
    process.exitCode = code;
  },
};

export const bindServerLifecycle = (
  server: LifecycleServer,
  transport: LifecycleTransport,
  lifecycleProcess: LifecycleProcess = defaultLifecycleProcess,
) => {
  let closing = false;

  const shutdown = async () => {
    if (closing) {
      return;
    }
    closing = true;
    await server.close();
  };

  transport.onerror = (error) => {
    lifecycleProcess.stderr.write(`[astmend-mcp] transport error: ${error.message}\n`);
  };
  transport.onclose = () => {
    lifecycleProcess.setExitCode(0);
  };

  lifecycleProcess.stdin.once('end', () => {
    void shutdown();
  });
  lifecycleProcess.stdin.once('close', () => {
    void shutdown();
  });

  return {
    shutdown,
  };
};

const main = async () => {
  const server = createServer();
  const transport = new StdioServerTransport();
  bindServerLifecycle(server, transport);

  await server.connect(transport);
};

const runAsMain = process.argv[1] === fileURLToPath(import.meta.url);

if (runAsMain) {
  main().catch((error) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`[astmend-mcp] ${message}\n`);
    process.exit(1);
  });
}
