import { Node, SyntaxKind } from 'ts-morph';
import { loadSourceDocumentFromFile } from '../engine/project.js';
import { resolveTargetFiles, toRelativePath } from './files.js';
import type { ContextWarning, DbQueryInfo, ExtractionResult } from './schema.js';

const getEnclosingSymbolName = (node: Node): string | null => {
  const symbolOwner = node
    .getAncestors()
    .find((ancestor) =>
      [
        SyntaxKind.FunctionDeclaration,
        SyntaxKind.MethodDeclaration,
        SyntaxKind.ClassDeclaration,
        SyntaxKind.ArrowFunction,
      ].includes(ancestor.getKind()),
    );

  if (!symbolOwner) {
    return null;
  }
  if (Node.isClassDeclaration(symbolOwner) || Node.isFunctionDeclaration(symbolOwner)) {
    return symbolOwner.getName() ?? null;
  }
  if (Node.isMethodDeclaration(symbolOwner)) {
    return symbolOwner.getName();
  }
  return 'anonymous';
};

const getWhereLikeText = (node: Node): string | null => {
  const statement = node.getFirstAncestorByKind(SyntaxKind.ExpressionStatement);
  const source = statement?.getText() ?? node.getText();
  const whereMatch = source.match(/\.where\((.+?)\)/);
  return whereMatch?.[1]?.trim() ?? null;
};

const normalizeOperationFromCall = (
  callText: string,
): Pick<DbQueryInfo, 'operation' | 'isRawSql'> | null => {
  if (callText.includes('db.query.')) {
    return { operation: 'query', isRawSql: false };
  }
  if (callText.includes('db.select') || callText.endsWith('.from')) {
    return { operation: 'select', isRawSql: false };
  }
  if (callText.includes('db.insert')) {
    return { operation: 'insert', isRawSql: false };
  }
  if (callText.includes('db.update')) {
    return { operation: 'update', isRawSql: false };
  }
  if (callText.includes('db.delete')) {
    return { operation: 'delete', isRawSql: false };
  }
  return null;
};

const extractTableLikeName = (callExpression: Node): string | null => {
  if (!Node.isCallExpression(callExpression)) {
    return null;
  }
  const callee = callExpression.getExpression();
  const args = callExpression.getArguments();
  if (Node.isPropertyAccessExpression(callee) && callee.getName() === 'from') {
    const firstArg = args[0];
    if (!firstArg) {
      return null;
    }
    return firstArg.getText();
  }
  if (args.length > 0) {
    return args[0].getText();
  }
  return null;
};

export const extractDbQueries = async (options: {
  repoRoot: string;
  files?: string[];
}): Promise<ExtractionResult<DbQueryInfo>> => {
  const { files, warnings: fileWarnings } = await resolveTargetFiles(
    options.repoRoot,
    options.files,
  );
  const warnings: ContextWarning[] = fileWarnings.map((message) => ({
    code: 'FILE_RESOLUTION_WARNING',
    message,
  }));
  const items: DbQueryInfo[] = [];

  for (const absolutePath of files) {
    try {
      const document = await loadSourceDocumentFromFile(absolutePath);
      const sourceFile = document.project.getSourceFileOrThrow(document.sourceFilePath);
      const relativePath = toRelativePath(options.repoRoot, absolutePath);

      const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
      for (const call of callExpressions) {
        const callText = call.getExpression().getText();
        const operation = normalizeOperationFromCall(callText);
        if (!operation) {
          continue;
        }
        const position = sourceFile.getLineAndColumnAtPos(call.getStart());
        items.push({
          file: relativePath,
          line: position.line,
          column: position.column,
          operation: operation.operation,
          tableLikeName: extractTableLikeName(call),
          whereLikeText: getWhereLikeText(call),
          isRawSql: operation.isRawSql,
          enclosingSymbol: getEnclosingSymbolName(call),
        });
      }

      const taggedTemplates = sourceFile.getDescendantsOfKind(SyntaxKind.TaggedTemplateExpression);
      for (const taggedTemplate of taggedTemplates) {
        if (taggedTemplate.getTag().getText() !== 'sql') {
          continue;
        }
        const position = sourceFile.getLineAndColumnAtPos(taggedTemplate.getStart());
        items.push({
          file: relativePath,
          line: position.line,
          column: position.column,
          operation: 'raw_sql',
          tableLikeName: null,
          whereLikeText: null,
          isRawSql: true,
          enclosingSymbol: getEnclosingSymbolName(taggedTemplate),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push({
        code: 'DB_QUERY_PARSE_FAILED',
        message,
        file: toRelativePath(options.repoRoot, absolutePath),
      });
    }
  }

  return {
    items,
    warnings,
  };
};
