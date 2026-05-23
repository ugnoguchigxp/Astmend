import { Node, type PropertyAccessExpression, SyntaxKind } from 'ts-morph';
import { loadSourceDocumentFromFile } from '../engine/project.js';
import { resolveTargetFiles, toRelativePath } from './files.js';
import type { ContextWarning, ExtractionResult, RouteInfo } from './schema.js';

const routeMethods = new Set(['get', 'post', 'put', 'patch', 'delete']);

const isRouteCall = (callee: Node): callee is PropertyAccessExpression => {
  if (!Node.isPropertyAccessExpression(callee)) {
    return false;
  }
  const receiver = callee.getExpression().getText();
  const method = callee.getName();
  return (receiver === 'app' || receiver === 'route') && routeMethods.has(method);
};

const extractPathLiteral = (value: Node | undefined): string | null => {
  if (!value) {
    return null;
  }
  if (Node.isStringLiteral(value) || Node.isNoSubstitutionTemplateLiteral(value)) {
    return value.getLiteralText();
  }
  return null;
};

const extractPathParams = (pathValue: string): string[] => {
  const params: string[] = [];
  const regex = /:([A-Za-z0-9_]+)/g;
  for (const match of pathValue.matchAll(regex)) {
    const value = match[1];
    if (value) {
      params.push(value);
    }
  }
  return params;
};

const extractHandlerName = (handlerNode: Node | undefined): string | null => {
  if (!handlerNode) {
    return null;
  }
  if (Node.isIdentifier(handlerNode)) {
    return handlerNode.getText();
  }
  if (Node.isPropertyAccessExpression(handlerNode)) {
    return handlerNode.getText();
  }
  return null;
};

const extractMiddlewareLikeArgs = (args: Node[]): string[] => {
  if (args.length < 2) {
    return [];
  }
  const middlewareNodes = args.slice(1, -1);
  return middlewareNodes
    .filter((node) => !Node.isArrowFunction(node) && !Node.isFunctionExpression(node))
    .map((node) => node.getText());
};

export const extractRoutes = async (options: {
  repoRoot: string;
  files?: string[];
}): Promise<ExtractionResult<RouteInfo>> => {
  const { files, warnings: fileWarnings } = await resolveTargetFiles(
    options.repoRoot,
    options.files,
  );

  const warnings: ContextWarning[] = fileWarnings.map((message) => ({
    code: 'FILE_RESOLUTION_WARNING',
    message,
  }));
  const items: RouteInfo[] = [];

  for (const absolutePath of files) {
    try {
      const document = await loadSourceDocumentFromFile(absolutePath);
      const sourceFile = document.project.getSourceFileOrThrow(document.sourceFilePath);
      const relativePath = toRelativePath(options.repoRoot, absolutePath);

      const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
      for (const call of callExpressions) {
        const callee = call.getExpression();
        if (!isRouteCall(callee)) {
          continue;
        }
        const method = callee.getName() as RouteInfo['method'];
        const args = call.getArguments();
        const pathValue = extractPathLiteral(args[0]);
        const handlerName = extractHandlerName(args[args.length - 1]);
        const middlewareLikeArgs = extractMiddlewareLikeArgs(args);
        const position = sourceFile.getLineAndColumnAtPos(call.getStart());
        if (args.length === 0 || pathValue === null) {
          warnings.push({
            code: 'ROUTE_PATH_UNRESOLVED',
            message: 'Route path is not a static string literal.',
            file: relativePath,
            details: callee.getText(),
          });
        }

        items.push({
          file: relativePath,
          line: position.line,
          column: position.column,
          method,
          path: pathValue,
          pathParams: pathValue ? extractPathParams(pathValue) : [],
          handlerName,
          middlewareLikeArgs,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push({
        code: 'ROUTE_PARSE_FAILED',
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
