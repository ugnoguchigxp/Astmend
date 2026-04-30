import path from 'node:path';
import type { FunctionDeclaration, MethodDeclaration, Node, SourceFile } from 'ts-morph';
import { AstmendError } from '../engine/errors.js';
import { assertTypeResolvesInContext } from '../engine/guards.js';
import { loadSourceDocumentFromText } from '../engine/project.js';
import type {
  AddInterfaceExtendsOperation,
  RemoveInterfaceExtendsOperation,
  ReplaceFunctionBodyOperation,
  UpdateParamTypeOperation,
  UpdatePropertyTypeOperation,
  UpdateReturnTypeOperation,
} from '../schema/patch.js';
import type { OperationResult } from './updateFunction.js';

type CallableOperation =
  | UpdateReturnTypeOperation
  | UpdateParamTypeOperation
  | ReplaceFunctionBodyOperation;

const createNodeId = (sourceFile: SourceFile, kind: string, name: string, node: Node): string => {
  const position = sourceFile.getLineAndColumnAtPos(node.getStart());
  const file = path.normalize(sourceFile.getFilePath()).replaceAll(path.sep, path.posix.sep);
  return `${file}#${kind}:${name}@${position.line}:${position.column}`;
};

const findUniqueCallable = (
  sourceFile: SourceFile,
  target: CallableOperation['target'],
): FunctionDeclaration | MethodDeclaration => {
  const candidates =
    target.kind === 'function'
      ? sourceFile
          .getFunctions()
          .filter((declaration) => declaration.getName() === target.name)
          .map((node) => ({
            id: createNodeId(sourceFile, 'function', target.name, node),
            node,
          }))
      : sourceFile.getClasses().flatMap((classDeclaration) =>
          classDeclaration
            .getMethods()
            .filter((method) => method.getName() === target.name)
            .map((node) => ({
              id: createNodeId(
                sourceFile,
                'method',
                `${classDeclaration.getName() ?? '<anonymous>'}.${target.name}`,
                node,
              ),
              node,
            })),
        );

  const matches = target.id
    ? candidates.filter((candidate) => candidate.id === target.id)
    : candidates;

  if (matches.length === 0) {
    throw new AstmendError('TARGET_NOT_FOUND', `Callable not found: ${target.kind}.${target.name}`);
  }

  if (matches.length > 1) {
    throw new AstmendError(
      'TARGET_AMBIGUOUS',
      `Multiple callables matched: ${target.kind}.${target.name}`,
    );
  }

  return matches[0].node;
};

const findUniqueInterface = (sourceFile: SourceFile, name: string) => {
  const matches = sourceFile
    .getInterfaces()
    .filter((declaration) => declaration.getName() === name);

  if (matches.length === 0) {
    throw new AstmendError('TARGET_NOT_FOUND', `Interface not found: ${name}`);
  }

  if (matches.length > 1) {
    throw new AstmendError('TARGET_AMBIGUOUS', `Multiple interfaces matched: ${name}`);
  }

  return matches[0];
};

export const updateReturnType = (
  sourceFile: SourceFile,
  operation: UpdateReturnTypeOperation,
): OperationResult => {
  const callable = findUniqueCallable(sourceFile, operation.target);
  const existingReturnTypeNode = callable.getReturnTypeNode();
  const existingType = existingReturnTypeNode?.getText();

  if (existingType === operation.returnType) {
    return { updatedText: sourceFile.getFullText(), changed: false };
  }

  assertTypeResolvesInContext(
    sourceFile.getFullText(),
    operation.returnType,
    `Return type ${operation.target.name}`,
  );

  callable.setReturnType(operation.returnType);
  return { updatedText: sourceFile.getFullText(), changed: true };
};

export const updateParamType = (
  sourceFile: SourceFile,
  operation: UpdateParamTypeOperation,
): OperationResult => {
  const callable = findUniqueCallable(sourceFile, operation.target);
  const parameter = callable
    .getParameters()
    .find((candidate) => candidate.getName() === operation.paramName);

  if (!parameter) {
    throw new AstmendError(
      'TARGET_NOT_FOUND',
      `Parameter not found: ${operation.target.name}.${operation.paramName}`,
    );
  }

  const existingType = parameter.getTypeNode()?.getText() ?? parameter.getType().getText();
  if (existingType === operation.paramType) {
    return { updatedText: sourceFile.getFullText(), changed: false };
  }

  assertTypeResolvesInContext(
    sourceFile.getFullText(),
    operation.paramType,
    `Parameter type ${operation.target.name}.${operation.paramName}`,
  );

  parameter.setType(operation.paramType);
  return { updatedText: sourceFile.getFullText(), changed: true };
};

export const updatePropertyType = (
  sourceFile: SourceFile,
  operation: UpdatePropertyTypeOperation,
): OperationResult => {
  const targetDeclaration = (() => {
    if (operation.target.kind === 'interface') {
      return findUniqueInterface(sourceFile, operation.target.name);
    }

    const matches = sourceFile
      .getClasses()
      .filter((declaration) => declaration.getName() === operation.target.name);
    if (matches.length === 0) {
      throw new AstmendError('TARGET_NOT_FOUND', `class not found: ${operation.target.name}`);
    }
    if (matches.length > 1) {
      throw new AstmendError(
        'TARGET_AMBIGUOUS',
        `Multiple classes matched: ${operation.target.name}`,
      );
    }
    return matches[0];
  })();

  const propertyCandidates = targetDeclaration
    .getProperties()
    .filter((candidate) => candidate.getName() === operation.target.property)
    .map((node) => ({
      id: createNodeId(
        sourceFile,
        'property',
        `${operation.target.name}.${operation.target.property}`,
        node,
      ),
      node,
    }));
  const property = operation.target.id
    ? propertyCandidates.find((candidate) => candidate.id === operation.target.id)?.node
    : propertyCandidates[0]?.node;
  if (!property) {
    throw new AstmendError(
      'TARGET_NOT_FOUND',
      `Property not found: ${operation.target.name}.${operation.target.property}`,
    );
  }

  const existingType = property.getTypeNode()?.getText() ?? property.getType().getText();
  if (existingType === operation.propertyType) {
    return { updatedText: sourceFile.getFullText(), changed: false };
  }

  assertTypeResolvesInContext(
    sourceFile.getFullText(),
    operation.propertyType,
    `Property type ${operation.target.name}.${operation.target.property}`,
  );

  property.setType(operation.propertyType);
  return { updatedText: sourceFile.getFullText(), changed: true };
};

export const replaceFunctionBody = (
  sourceFile: SourceFile,
  operation: ReplaceFunctionBodyOperation,
): OperationResult => {
  const callable = findUniqueCallable(sourceFile, operation.target);
  const body = callable.getBody();

  if (!body) {
    throw new AstmendError('TARGET_NOT_FOUND', `Callable body not found: ${operation.target.name}`);
  }

  const currentBody = body
    .getText()
    .replace(/^\{\s*/, '')
    .replace(/\s*\}$/, '')
    .trim();
  const nextBody = operation.bodyText.trim();

  if (currentBody === nextBody) {
    return { updatedText: sourceFile.getFullText(), changed: false };
  }

  callable.setBodyText(operation.bodyText);
  loadSourceDocumentFromText(operation.file, sourceFile.getFullText());
  return { updatedText: sourceFile.getFullText(), changed: true };
};

export const addInterfaceExtends = (
  sourceFile: SourceFile,
  operation: AddInterfaceExtendsOperation,
): OperationResult => {
  const declaration = findUniqueInterface(sourceFile, operation.name);
  const existingExtends = declaration.getExtends().map((heritage) => heritage.getText());

  if (existingExtends.includes(operation.extends)) {
    return { updatedText: sourceFile.getFullText(), changed: false };
  }

  assertTypeResolvesInContext(
    sourceFile.getFullText(),
    operation.extends,
    `Interface extends ${operation.name}`,
  );

  declaration.addExtends(operation.extends);
  return { updatedText: sourceFile.getFullText(), changed: true };
};

export const removeInterfaceExtends = (
  sourceFile: SourceFile,
  operation: RemoveInterfaceExtendsOperation,
): OperationResult => {
  const declaration = findUniqueInterface(sourceFile, operation.name);
  const heritage = declaration
    .getExtends()
    .find((candidate) => candidate.getText() === operation.extends);

  if (!heritage) {
    return { updatedText: sourceFile.getFullText(), changed: false };
  }

  declaration.removeExtends(heritage);
  return { updatedText: sourceFile.getFullText(), changed: true };
};
