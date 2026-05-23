import path from 'node:path';
import { analyzeChangedSymbolsFromText, type ChangedSymbol } from '../engine/diff.js';
import { AstmendError } from '../engine/errors.js';
import { extractCallRelations } from './callRelations.js';
import { extractChangedFilesFromDiff } from './changedFiles.js';
import { extractDbQueries } from './dbQueries.js';
import { isTypeScriptLikeFile } from './files.js';
import { readDiffSource, readFileFromGitRef } from './gitDiff.js';
import { extractRiskHints } from './riskHints.js';
import { extractRoutes } from './routes.js';
import {
  CONTEXT_PACKET_SCHEMA_VERSION,
  type ContextChangedSymbol,
  type ContextOptions,
  type ContextPacket,
  type ContextWarning,
  validateContextOptions,
  validateContextPacket,
} from './schema.js';
import { buildSourceExcerpts } from './sourceExcerpt.js';

const toContextWarning = (input: {
  code: string;
  message: string;
  file?: string;
  details?: string;
}): ContextWarning => input;

const toContextChangedSymbols = (symbols: ChangedSymbol[]): ContextChangedSymbol[] =>
  symbols.map((symbol) => ({
    kind: symbol.kind,
    name: symbol.name,
    changeKind: symbol.changeKind,
    line: symbol.line,
    column: symbol.column,
    file: symbol.file,
    isExported: symbol.isExported,
    exportKind: symbol.exportKind,
  }));

const detectStack = (
  routeCount: number,
  dbQueryCount: number,
  changedFilePaths: string[],
): string[] => {
  const stack = new Set<string>(['typescript']);
  if (routeCount > 0) {
    stack.add('hono');
  }
  if (dbQueryCount > 0) {
    stack.add('drizzle');
  }
  if (changedFilePaths.some((file) => file.endsWith('.tsx'))) {
    stack.add('react');
  }
  return [...stack];
};

export const createContextPacket = async (options: ContextOptions): Promise<ContextPacket> => {
  const parsedOptions = validateContextOptions(options);
  const repoRoot = path.resolve(parsedOptions.repoRoot);
  const warnings: ContextWarning[] = [];

  const diffSource = await readDiffSource(parsedOptions);
  const changedFiles = extractChangedFilesFromDiff(diffSource.diffText);
  const analyzedFiles: string[] = [];

  const changedSymbols: ContextChangedSymbol[] = [];
  const sourceTextByFile = new Map<string, string>();

  if (diffSource.mode === 'diff-file') {
    warnings.push(
      toContextWarning({
        code: 'SYMBOL_EXTRACTION_UNAVAILABLE',
        message:
          'Changed symbol extraction needs commit refs. diff-file mode currently extracts changed ranges only.',
      }),
    );
  }

  for (const changedFile of changedFiles) {
    if (changedFile.file === 'unknown') {
      warnings.push(
        toContextWarning({
          code: 'UNKNOWN_FILE_IN_DIFF',
          message: 'Diff contained a patch with unknown file path.',
        }),
      );
      continue;
    }

    if (changedFile.isBinary) {
      warnings.push(
        toContextWarning({
          code: 'BINARY_FILE_SKIPPED',
          file: changedFile.file,
          message: 'Binary file was skipped for symbol and semantic extraction.',
        }),
      );
      continue;
    }

    if (!isTypeScriptLikeFile(changedFile.file)) {
      warnings.push(
        toContextWarning({
          code: 'UNSUPPORTED_EXTENSION',
          file: changedFile.file,
          message: 'Only TypeScript-like files are analyzed in phase 1.',
        }),
      );
      continue;
    }

    if (changedFile.changeKind !== 'deleted') {
      analyzedFiles.push(changedFile.file);
    }

    if (diffSource.mode !== 'git') {
      continue;
    }

    const baseRef = diffSource.base;
    const headRef = diffSource.head;
    if (!baseRef || !headRef) {
      continue;
    }

    const beforeText = await readFileFromGitRef(
      repoRoot,
      baseRef,
      changedFile.oldPath ?? changedFile.file,
    );
    const afterText = await readFileFromGitRef(
      repoRoot,
      headRef,
      changedFile.newPath ?? changedFile.file,
    );

    if (beforeText) {
      sourceTextByFile.set(changedFile.file, beforeText);
    }
    if (afterText) {
      sourceTextByFile.set(changedFile.file, afterText);
    }

    if (!beforeText && !afterText) {
      warnings.push(
        toContextWarning({
          code: 'SOURCE_NOT_AVAILABLE',
          file: changedFile.file,
          message: 'Unable to resolve before/after source from git refs.',
        }),
      );
      continue;
    }

    try {
      const report = analyzeChangedSymbolsFromText(
        beforeText ?? '',
        afterText ?? '',
        changedFile.file,
      );
      for (const entry of report) {
        changedSymbols.push(...toContextChangedSymbols(entry.symbols));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(
        toContextWarning({
          code: 'SYMBOL_EXTRACTION_FAILED',
          file: changedFile.file,
          message,
        }),
      );
    }
  }

  const uniqueFiles = [...new Set(analyzedFiles)];
  const routesResult = await extractRoutes({ repoRoot, files: uniqueFiles });
  const dbQueriesResult = await extractDbQueries({ repoRoot, files: uniqueFiles });
  const riskHintsResult = await extractRiskHints({ repoRoot, files: uniqueFiles });

  warnings.push(...routesResult.warnings);
  warnings.push(...dbQueriesResult.warnings);
  warnings.push(...riskHintsResult.warnings);

  const callRelations = extractCallRelations(changedSymbols);
  const packet: ContextPacket = {
    schemaVersion: CONTEXT_PACKET_SCHEMA_VERSION,
    project: {
      name: path.basename(repoRoot),
      detectedStack: detectStack(
        routesResult.items.length,
        dbQueriesResult.items.length,
        uniqueFiles,
      ),
    },
    diff: {
      base: diffSource.base,
      head: diffSource.head,
      changedFiles,
    },
    changedSymbols,
    routes: routesResult.items,
    dbQueries: dbQueriesResult.items,
    callRelations,
    riskHints: riskHintsResult.items,
    recommendedSkills: [],
    warnings,
    ...(parsedOptions.includeSourceExcerpt
      ? { sourceExcerpts: buildSourceExcerpts(changedSymbols, sourceTextByFile) }
      : {}),
  };

  return validateContextPacket(packet);
};

export const assertContextOptions = (value: unknown): ContextOptions => {
  try {
    return validateContextOptions(value);
  } catch (error) {
    if (error instanceof Error) {
      throw new AstmendError('INVALID_INPUT', error.message);
    }
    throw new AstmendError('INVALID_INPUT', 'Invalid context options.');
  }
};
