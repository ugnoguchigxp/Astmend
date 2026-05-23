import { promises as fs } from 'node:fs';
import { extractDbQueries } from './dbQueries.js';
import { resolveTargetFiles, toRelativePath } from './files.js';
import { extractRoutes } from './routes.js';
import type { ContextWarning, ExtractionResult, RiskHintInfo } from './schema.js';

const buildRiskHint = (input: RiskHintInfo): RiskHintInfo => input;

const looksIdOnlyQuery = (value: string | null): boolean => {
  if (!value) {
    return false;
  }
  const normalized = value.toLowerCase();
  return /\bid\b/.test(normalized) && !/\b(and|or)\b/.test(normalized);
};

const getLineAtIndex = (sourceText: string, index: number): number => {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (sourceText[i] === '\n') {
      line += 1;
    }
  }
  return line;
};

const extractTextDrivenHints = async (
  repoRoot: string,
  files?: string[],
): Promise<{ items: RiskHintInfo[]; warnings: ContextWarning[] }> => {
  const { files: targetFiles, warnings: fileWarnings } = await resolveTargetFiles(repoRoot, files);
  const items: RiskHintInfo[] = [];
  const warnings: ContextWarning[] = fileWarnings.map((message) => ({
    code: 'FILE_RESOLUTION_WARNING',
    message,
  }));

  for (const absolutePath of targetFiles) {
    const relativePath = toRelativePath(repoRoot, absolutePath);
    try {
      const sourceText = await fs.readFile(absolutePath, 'utf8');

      const fetchRegex = /fetch\s*\(\s*['"`]https?:\/\//g;
      for (const match of sourceText.matchAll(fetchRegex)) {
        const index = match.index ?? 0;
        items.push(
          buildRiskHint({
            kind: 'external-fetch',
            severity: 'info',
            file: relativePath,
            line: getLineAtIndex(sourceText, index),
            evidence: match[0],
            reason: 'External HTTP fetch usage detected.',
          }),
        );
      }

      const fsRegex =
        /(from\s+['"]node:fs['"])|(from\s+['"]fs['"])|(\bfs\.(readFile|writeFile|unlink|rm|mkdir))/g;
      for (const match of sourceText.matchAll(fsRegex)) {
        const index = match.index ?? 0;
        items.push(
          buildRiskHint({
            kind: 'file-system-access',
            severity: 'low',
            file: relativePath,
            line: getLineAtIndex(sourceText, index),
            evidence: match[0],
            reason: 'File system access usage detected.',
          }),
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push({
        code: 'RISK_TEXT_SCAN_FAILED',
        message,
        file: relativePath,
      });
    }
  }

  return { items, warnings };
};

export const extractRiskHints = async (options: {
  repoRoot: string;
  files?: string[];
}): Promise<ExtractionResult<RiskHintInfo>> => {
  const [routesResult, dbQueriesResult, textHintsResult] = await Promise.all([
    extractRoutes(options),
    extractDbQueries(options),
    extractTextDrivenHints(options.repoRoot, options.files),
  ]);

  const items: RiskHintInfo[] = [];
  const warnings: ContextWarning[] = [
    ...routesResult.warnings,
    ...dbQueriesResult.warnings,
    ...textHintsResult.warnings,
  ];

  for (const route of routesResult.items) {
    if (route.pathParams.some((param) => param.toLowerCase() === 'id')) {
      items.push(
        buildRiskHint({
          kind: 'id-parameter',
          severity: 'low',
          file: route.file,
          line: route.line,
          evidence: route.path ?? '(dynamic path)',
          reason: 'Route includes an id-like parameter.',
        }),
      );
    }

    if (route.path?.toLowerCase().includes('/admin')) {
      items.push(
        buildRiskHint({
          kind: 'admin-like-route',
          severity: 'medium',
          file: route.file,
          line: route.line,
          evidence: route.path,
          reason: 'Route path looks admin-scoped.',
        }),
      );
    }

    if (route.middlewareLikeArgs.length === 0) {
      items.push(
        buildRiskHint({
          kind: 'auth-middleware-not-detected',
          severity: 'info',
          file: route.file,
          line: route.line,
          evidence: route.path ?? '(dynamic path)',
          reason: 'No middleware-like argument was detected.',
        }),
      );
    }
  }

  for (const query of dbQueriesResult.items) {
    if (query.operation === 'delete') {
      items.push(
        buildRiskHint({
          kind: 'delete-operation',
          severity: 'medium',
          file: query.file,
          line: query.line,
          evidence: query.operation,
          reason: 'Delete operation detected.',
        }),
      );
    }

    if (query.operation === 'update') {
      items.push(
        buildRiskHint({
          kind: 'update-operation',
          severity: 'low',
          file: query.file,
          line: query.line,
          evidence: query.operation,
          reason: 'Update operation detected.',
        }),
      );
    }

    if (query.isRawSql) {
      items.push(
        buildRiskHint({
          kind: 'raw-sql',
          severity: 'medium',
          file: query.file,
          line: query.line,
          evidence: 'sql`...`',
          reason: 'Raw SQL usage detected.',
        }),
      );
    }

    if (looksIdOnlyQuery(query.whereLikeText)) {
      items.push(
        buildRiskHint({
          kind: 'id-only-query',
          severity: 'low',
          file: query.file,
          line: query.line,
          evidence: query.whereLikeText ?? '',
          reason: 'Query filter appears to depend only on id-like condition.',
        }),
      );
    }
  }

  items.push(...textHintsResult.items);

  const deduped = new Map<string, RiskHintInfo>();
  for (const item of items) {
    deduped.set(`${item.kind}:${item.file}:${item.line}:${item.evidence}`, item);
  }

  return {
    items: [...deduped.values()],
    warnings,
  };
};
