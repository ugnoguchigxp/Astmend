#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createContextPacket } from './context-packet/createContextPacket.js';
import { extractDbQueries } from './context-packet/dbQueries.js';
import { extractRoutes } from './context-packet/routes.js';
import { AstmendError } from './engine/errors.js';
import { analyzeCodeUnitsFromFile } from './engine/scanner.js';
import { bindServerLifecycle, createServer } from './mcp/server.js';

type ParsedArgs = {
  command: string | undefined;
  flags: Map<string, string[]>;
};

type CliStreams = {
  stdout: NodeJS.WriteStream;
  stderr: NodeJS.WriteStream;
  cwd: string;
};

const defaultStreams: CliStreams = {
  stdout: process.stdout,
  stderr: process.stderr,
  cwd: process.cwd(),
};

const parseArgs = (argv: string[]): ParsedArgs => {
  const [command, ...rest] = argv;
  const flags = new Map<string, string[]>();

  for (let index = 0; index < rest.length; index += 1) {
    const current = rest[index];
    if (!current?.startsWith('--')) {
      continue;
    }

    const key = current.slice(2);
    const next = rest[index + 1];
    const value = next && !next.startsWith('--') ? next : 'true';
    if (value !== 'true') {
      index += 1;
    }
    const existing = flags.get(key) ?? [];
    existing.push(value);
    flags.set(key, existing);
  }

  return { command, flags };
};

const getLastFlagValue = (flags: Map<string, string[]>, key: string): string | undefined => {
  const values = flags.get(key);
  if (!values || values.length === 0) {
    return undefined;
  }
  return values[values.length - 1];
};

const getFlagValues = (flags: Map<string, string[]>, key: string): string[] => flags.get(key) ?? [];
const hasFlag = (flags: Map<string, string[]>, key: string): boolean => flags.has(key);

const writeJson = (stdout: NodeJS.WriteStream, value: unknown): void => {
  stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};

const writeUsage = (stderr: NodeJS.WriteStream): void => {
  stderr.write(`Usage:
  astmend version
  astmend context --base <ref> --head <ref> [--repo-root <path>] [--include-source-excerpt] [--format json]
  astmend context --diff-file <path> [--repo-root <path>] [--format json]
  astmend symbols --file <path> [--repo-root <path>] [--include-non-exported] [--format json]
  astmend routes [--file <path>]... [--repo-root <path>] [--format json]
  astmend db-queries [--file <path>]... [--repo-root <path>] [--format json]
  astmend mcp
`);
};

const ensureJsonFormat = (flags: Map<string, string[]>): void => {
  const format = getLastFlagValue(flags, 'format') ?? 'json';
  if (format !== 'json') {
    throw new AstmendError('INVALID_INPUT', `Unsupported format: ${format}`);
  }
};

const resolveRepoRoot = (cwd: string, flags: Map<string, string[]>): string =>
  path.resolve(cwd, getLastFlagValue(flags, 'repo-root') ?? '.');

const resolveFileList = (flags: Map<string, string[]>): string[] | undefined => {
  const values = getFlagValues(flags, 'file');
  if (values.length === 0) {
    return undefined;
  }
  return values.filter((value) => value !== 'true');
};

const runVersionCommand = async (stdout: NodeJS.WriteStream): Promise<void> => {
  const cliPath = fileURLToPath(import.meta.url);
  const packageJsonPath = path.resolve(path.dirname(cliPath), '../package.json');
  const packageJsonRaw = await readFile(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(packageJsonRaw) as { version: string };
  stdout.write(`${packageJson.version}\n`);
};

const runContextCommand = async (
  streams: CliStreams,
  flags: Map<string, string[]>,
): Promise<void> => {
  ensureJsonFormat(flags);
  const repoRoot = resolveRepoRoot(streams.cwd, flags);
  const base = getLastFlagValue(flags, 'base');
  const head = getLastFlagValue(flags, 'head');
  const diffFile = getLastFlagValue(flags, 'diff-file');
  const includeSourceExcerpt = hasFlag(flags, 'include-source-excerpt');

  const packet = await createContextPacket({
    repoRoot,
    ...(base && base !== 'true' ? { base } : {}),
    ...(head && head !== 'true' ? { head } : {}),
    ...(diffFile && diffFile !== 'true' ? { diffFile } : {}),
    ...(includeSourceExcerpt ? { includeSourceExcerpt: true } : {}),
  });

  writeJson(streams.stdout, packet);
};

const runSymbolsCommand = async (
  streams: CliStreams,
  flags: Map<string, string[]>,
): Promise<void> => {
  ensureJsonFormat(flags);
  const repoRoot = resolveRepoRoot(streams.cwd, flags);
  const filePath = getLastFlagValue(flags, 'file');
  if (!filePath || filePath === 'true') {
    throw new AstmendError('INVALID_INPUT', 'symbols command requires --file <path>.');
  }

  const absolutePath = path.resolve(repoRoot, filePath);
  const includeNonExported = hasFlag(flags, 'include-non-exported');
  try {
    const items = await analyzeCodeUnitsFromFile(absolutePath, {
      includeNonExported,
      includeMembers: true,
      includeTypeMetadata: true,
    });
    writeJson(streams.stdout, { items, warnings: [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeJson(streams.stdout, {
      items: [],
      warnings: [
        {
          code: 'SYMBOL_SCAN_FAILED',
          message,
          file: filePath,
        },
      ],
    });
  }
};

const runRoutesCommand = async (
  streams: CliStreams,
  flags: Map<string, string[]>,
): Promise<void> => {
  ensureJsonFormat(flags);
  const repoRoot = resolveRepoRoot(streams.cwd, flags);
  const files = resolveFileList(flags);
  const result = await extractRoutes({ repoRoot, files });
  writeJson(streams.stdout, result);
};

const runDbQueriesCommand = async (
  streams: CliStreams,
  flags: Map<string, string[]>,
): Promise<void> => {
  ensureJsonFormat(flags);
  const repoRoot = resolveRepoRoot(streams.cwd, flags);
  const files = resolveFileList(flags);
  const result = await extractDbQueries({ repoRoot, files });
  writeJson(streams.stdout, result);
};

const runMcpCommand = async (): Promise<void> => {
  const server = createServer();
  const transport = new StdioServerTransport();
  bindServerLifecycle(server, transport);
  await server.connect(transport);
};

export const runCli = async (
  argv: string[],
  streams: CliStreams = defaultStreams,
): Promise<number> => {
  const { command, flags } = parseArgs(argv);

  if (!command || command === '--help' || command === 'help') {
    writeUsage(streams.stderr);
    return 0;
  }

  try {
    switch (command) {
      case 'version': {
        await runVersionCommand(streams.stdout);
        return 0;
      }
      case 'context': {
        if (hasFlag(flags, 'help')) {
          writeUsage(streams.stderr);
          return 0;
        }
        await runContextCommand(streams, flags);
        return 0;
      }
      case 'symbols': {
        await runSymbolsCommand(streams, flags);
        return 0;
      }
      case 'routes': {
        await runRoutesCommand(streams, flags);
        return 0;
      }
      case 'db-queries': {
        await runDbQueriesCommand(streams, flags);
        return 0;
      }
      case 'mcp': {
        await runMcpCommand();
        return 0;
      }
      default: {
        throw new AstmendError('INVALID_INPUT', `Unknown command: ${command}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    streams.stderr.write(`${message}\n`);
    if (error instanceof AstmendError && error.code === 'INVALID_INPUT') {
      return 2;
    }
    return 1;
  }
};

const runAsMain = process.argv[1] === fileURLToPath(import.meta.url);
if (runAsMain) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
