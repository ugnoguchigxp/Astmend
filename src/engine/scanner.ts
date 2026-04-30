import path from 'node:path';
import {
  type ClassDeclaration,
  type ConstructorDeclaration,
  type FunctionDeclaration,
  IndentationText,
  type InterfaceDeclaration,
  type MethodDeclaration,
  Node,
  Project,
  type PropertyDeclaration,
  type PropertySignature,
  QuoteKind,
  type SourceFile,
  SyntaxKind,
  type Type,
  type VariableDeclaration,
} from 'ts-morph';
import type {
  AnalyzeCodeUnitsOptions,
  CodeUnitKind,
  ReferenceTargetInput,
} from '../schema/analysis.js';
import { generateAstFingerprint } from './fingerprint.js';
import { loadSourceDocumentFromFile, loadSourceDocumentFromText } from './project.js';

export type ExportKind = 'named' | 'default' | null;

export interface SourceRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface TypeMetadata {
  signature?: string;
  returnType?: string;
  parameters?: Array<{
    name: string;
    type: string;
    optional: boolean;
  }>;
  properties?: Array<{
    name: string;
    type: string;
    optional: boolean;
  }>;
  literalUnionValues?: string[];
  typeParameters?: string[];
}

export interface CodeUnitInfo {
  id: string;
  kind: CodeUnitKind;
  name: string;
  file: string;
  range: SourceRange;
  isExported: boolean;
  exportKind: ExportKind;
  parentId?: string;
  typeMetadata?: TypeMetadata;
  astHash?: string;
}

export type SymbolCandidate = CodeUnitInfo & {
  signature?: string;
};

type CodeUnitNode =
  | FunctionDeclaration
  | ClassDeclaration
  | MethodDeclaration
  | ConstructorDeclaration
  | InterfaceDeclaration
  | PropertyDeclaration
  | PropertySignature
  | VariableDeclaration
  | ReturnType<SourceFile['getTypeAliases']>[number]
  | ReturnType<SourceFile['getEnums']>[number];

interface CollectInput {
  node: CodeUnitNode;
  kind: CodeUnitKind;
  name: string;
  parentId?: string;
  qualifiedName?: string;
  inheritedExportInfo?: { isExported: boolean; exportKind: ExportKind };
  options: Required<Pick<AnalyzeCodeUnitsOptions, 'includeTypeMetadata' | 'includeAstHash'>>;
}

const defaultOptions = {
  includeNonExported: false,
  includeMembers: true,
  includeTypeMetadata: false,
  includeAstHash: false,
} satisfies Required<Omit<AnalyzeCodeUnitsOptions, 'kinds'>>;

const getPositionRange = (node: Node): SourceRange => {
  const sourceFile = node.getSourceFile();
  const start = sourceFile.getLineAndColumnAtPos(node.getStart());
  const end = sourceFile.getLineAndColumnAtPos(node.getEnd());
  return {
    startLine: start.line,
    startColumn: start.column,
    endLine: end.line,
    endColumn: end.column,
  };
};

const getExportInfo = (
  node: Node,
  inherited?: { isExported: boolean; exportKind: ExportKind },
): { isExported: boolean; exportKind: ExportKind } => {
  if (inherited) {
    return inherited;
  }

  const declaration = node as {
    isDefaultExport?: () => boolean;
    isExported?: () => boolean;
  };

  if (declaration.isDefaultExport?.()) {
    return { isExported: true, exportKind: 'default' };
  }

  if (declaration.isExported?.()) {
    return { isExported: true, exportKind: 'named' };
  }

  return { isExported: false, exportKind: null };
};

const toStableFilePath = (sourceFile: SourceFile): string =>
  path.normalize(sourceFile.getFilePath()).replaceAll(path.sep, path.posix.sep);

const createCodeUnitId = (
  sourceFile: SourceFile,
  kind: CodeUnitKind,
  name: string,
  range: SourceRange,
): string =>
  `${toStableFilePath(sourceFile)}#${kind}:${name}@${range.startLine}:${range.startColumn}`;

const getTextType = (type: Type, node: Node): string => type.getText(node);

const getLiteralUnionValues = (type: Type): string[] | undefined => {
  const values = type
    .getUnionTypes()
    .map((unionType) => unionType.getLiteralValue())
    .filter(
      (value): value is string | number => typeof value === 'string' || typeof value === 'number',
    )
    .map(String);

  return values.length > 0 ? values : undefined;
};

const getCallableMetadata = (
  node: FunctionDeclaration | MethodDeclaration | ConstructorDeclaration,
): TypeMetadata => {
  const parameters = node.getParameters().map((parameter) => ({
    name: parameter.getName(),
    type: parameter.getTypeNode()?.getText() ?? getTextType(parameter.getType(), parameter),
    optional: parameter.isOptional(),
  }));

  const typeParameters =
    'getTypeParameters' in node
      ? node.getTypeParameters().map((typeParameter) => typeParameter.getText())
      : [];

  if (Node.isConstructorDeclaration(node)) {
    return {
      signature: `constructor(${parameters
        .map((parameter) => `${parameter.name}${parameter.optional ? '?' : ''}: ${parameter.type}`)
        .join(', ')})`,
      parameters,
      ...(typeParameters.length > 0 ? { typeParameters } : {}),
    };
  }

  const returnType = node.getReturnTypeNode()?.getText() ?? getTextType(node.getReturnType(), node);

  return {
    signature: `(${parameters
      .map((parameter) => `${parameter.name}${parameter.optional ? '?' : ''}: ${parameter.type}`)
      .join(', ')}) => ${returnType}`,
    returnType,
    parameters,
    ...(typeParameters.length > 0 ? { typeParameters } : {}),
  };
};

const getPropertyMetadata = (node: PropertyDeclaration | PropertySignature): TypeMetadata => {
  const type = node.getTypeNode()?.getText() ?? getTextType(node.getType(), node);
  const property = {
    name: node.getName(),
    type,
    optional: Node.isPropertySignature(node) ? node.hasQuestionToken() : node.hasQuestionToken(),
  };

  return {
    properties: [property],
    literalUnionValues: getLiteralUnionValues(node.getType()),
  };
};

const getInterfaceMetadata = (node: InterfaceDeclaration): TypeMetadata => ({
  properties: node.getProperties().map((property) => ({
    name: property.getName(),
    type: property.getTypeNode()?.getText() ?? getTextType(property.getType(), property),
    optional: property.hasQuestionToken(),
  })),
  typeParameters: node.getTypeParameters().map((typeParameter) => typeParameter.getText()),
});

const getTypeAliasMetadata = (
  node: ReturnType<SourceFile['getTypeAliases']>[number],
): TypeMetadata => {
  const type = node.getType();
  return {
    signature: node.getTypeNodeOrThrow().getText(),
    literalUnionValues: getLiteralUnionValues(type),
    typeParameters: node.getTypeParameters().map((typeParameter) => typeParameter.getText()),
  };
};

const getVariableMetadata = (node: VariableDeclaration): TypeMetadata => ({
  signature: node.getTypeNode()?.getText() ?? getTextType(node.getType(), node),
  literalUnionValues: getLiteralUnionValues(node.getType()),
});

const getTypeMetadata = (node: CodeUnitNode): TypeMetadata | undefined => {
  if (
    Node.isFunctionDeclaration(node) ||
    Node.isMethodDeclaration(node) ||
    Node.isConstructorDeclaration(node)
  ) {
    return getCallableMetadata(node);
  }

  if (Node.isInterfaceDeclaration(node)) {
    return getInterfaceMetadata(node);
  }

  if (Node.isPropertyDeclaration(node) || Node.isPropertySignature(node)) {
    return getPropertyMetadata(node);
  }

  if (Node.isTypeAliasDeclaration(node)) {
    return getTypeAliasMetadata(node);
  }

  if (Node.isVariableDeclaration(node)) {
    return getVariableMetadata(node);
  }

  return undefined;
};

const collectCodeUnit = ({
  node,
  kind,
  name,
  parentId,
  qualifiedName,
  inheritedExportInfo,
  options,
}: CollectInput): CodeUnitInfo => {
  const range = getPositionRange(node);
  const exportInfo = getExportInfo(node, inheritedExportInfo);
  const id = createCodeUnitId(node.getSourceFile(), kind, qualifiedName ?? name, range);

  return {
    id,
    kind,
    name,
    file: toStableFilePath(node.getSourceFile()),
    range,
    isExported: exportInfo.isExported,
    exportKind: exportInfo.exportKind,
    ...(parentId ? { parentId } : {}),
    ...(options.includeTypeMetadata ? { typeMetadata: getTypeMetadata(node) } : {}),
    ...(options.includeAstHash ? { astHash: generateAstFingerprint(node) } : {}),
  };
};

const shouldInclude = (
  unit: CodeUnitInfo,
  options: Required<Omit<AnalyzeCodeUnitsOptions, 'kinds'>> & { kinds?: CodeUnitKind[] },
  isTopLevel: boolean,
): boolean => {
  if (options.kinds && !options.kinds.includes(unit.kind)) {
    return false;
  }

  if (isTopLevel && !options.includeNonExported && !unit.isExported) {
    return false;
  }

  return true;
};

export const scanCodeUnits = (
  sourceFile: SourceFile,
  options: AnalyzeCodeUnitsOptions = {},
): CodeUnitInfo[] => {
  const mergedOptions = { ...defaultOptions, ...options };
  const codeUnits: CodeUnitInfo[] = [];
  const metadataOptions = {
    includeTypeMetadata: mergedOptions.includeTypeMetadata,
    includeAstHash: mergedOptions.includeAstHash,
  };

  const pushTopLevel = (unit: CodeUnitInfo) => {
    if (shouldInclude(unit, mergedOptions, true)) {
      codeUnits.push(unit);
    }
  };

  for (const declaration of sourceFile.getFunctions()) {
    const name = declaration.getName();
    if (!name) {
      continue;
    }
    pushTopLevel(
      collectCodeUnit({ node: declaration, kind: 'function', name, options: metadataOptions }),
    );
  }

  for (const declaration of sourceFile.getClasses()) {
    const name = declaration.getName();
    if (!name) {
      continue;
    }

    const classUnit = collectCodeUnit({
      node: declaration,
      kind: 'class',
      name,
      options: metadataOptions,
    });
    pushTopLevel(classUnit);

    if (!mergedOptions.includeMembers) {
      continue;
    }

    const inheritedExportInfo = {
      isExported: classUnit.isExported,
      exportKind: classUnit.exportKind,
    };

    for (const method of declaration.getMethods()) {
      const methodUnit = collectCodeUnit({
        node: method,
        kind: 'method',
        name: method.getName(),
        parentId: classUnit.id,
        qualifiedName: `${name}.${method.getName()}`,
        inheritedExportInfo,
        options: metadataOptions,
      });
      if (shouldInclude(methodUnit, mergedOptions, false)) {
        codeUnits.push(methodUnit);
      }
    }

    for (const constructorDeclaration of declaration.getConstructors()) {
      const constructorUnit = collectCodeUnit({
        node: constructorDeclaration,
        kind: 'constructor',
        name: 'constructor',
        parentId: classUnit.id,
        qualifiedName: `${name}.constructor`,
        inheritedExportInfo,
        options: metadataOptions,
      });
      if (shouldInclude(constructorUnit, mergedOptions, false)) {
        codeUnits.push(constructorUnit);
      }
    }

    for (const property of declaration.getProperties()) {
      const propertyUnit = collectCodeUnit({
        node: property,
        kind: 'property',
        name: property.getName(),
        parentId: classUnit.id,
        qualifiedName: `${name}.${property.getName()}`,
        inheritedExportInfo,
        options: metadataOptions,
      });
      if (shouldInclude(propertyUnit, mergedOptions, false)) {
        codeUnits.push(propertyUnit);
      }
    }
  }

  for (const declaration of sourceFile.getInterfaces()) {
    const name = declaration.getName();
    const interfaceUnit = collectCodeUnit({
      node: declaration,
      kind: 'interface',
      name,
      options: metadataOptions,
    });
    pushTopLevel(interfaceUnit);

    if (!mergedOptions.includeMembers) {
      continue;
    }

    const inheritedExportInfo = {
      isExported: interfaceUnit.isExported,
      exportKind: interfaceUnit.exportKind,
    };

    for (const property of declaration.getProperties()) {
      const propertyUnit = collectCodeUnit({
        node: property,
        kind: 'property',
        name: property.getName(),
        parentId: interfaceUnit.id,
        qualifiedName: `${name}.${property.getName()}`,
        inheritedExportInfo,
        options: metadataOptions,
      });
      if (shouldInclude(propertyUnit, mergedOptions, false)) {
        codeUnits.push(propertyUnit);
      }
    }
  }

  for (const declaration of sourceFile.getTypeAliases()) {
    pushTopLevel(
      collectCodeUnit({
        node: declaration,
        kind: 'type_alias',
        name: declaration.getName(),
        options: metadataOptions,
      }),
    );
  }

  for (const declaration of sourceFile.getEnums()) {
    pushTopLevel(
      collectCodeUnit({
        node: declaration,
        kind: 'enum',
        name: declaration.getName(),
        options: metadataOptions,
      }),
    );
  }

  for (const declaration of sourceFile.getVariableDeclarations()) {
    if (
      declaration.getFirstAncestorByKind(SyntaxKind.VariableStatement)?.getParent() !== sourceFile
    ) {
      continue;
    }

    pushTopLevel(
      collectCodeUnit({
        node: declaration,
        kind: 'variable',
        name: declaration.getName(),
        options: metadataOptions,
      }),
    );
  }

  return codeUnits.sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.range.startLine - right.range.startLine ||
      left.range.startColumn - right.range.startColumn,
  );
};

const scanProject = (project: Project, options: AnalyzeCodeUnitsOptions): CodeUnitInfo[] =>
  project
    .getSourceFiles()
    .flatMap((sourceFile) => scanCodeUnits(sourceFile, options))
    .filter((unit) => !unit.file.includes('/node_modules/'));

export const analyzeCodeUnitsFromText = (
  sourceText: string,
  options: AnalyzeCodeUnitsOptions = {},
  filePath = '__astmend_code_units__.ts',
): CodeUnitInfo[] => {
  const document = loadSourceDocumentFromText(filePath, sourceText);
  const sourceFile = document.project.getSourceFileOrThrow(document.sourceFilePath);
  return scanCodeUnits(sourceFile, options);
};

export const analyzeCodeUnitsFromFile = async (
  filePath: string,
  options: AnalyzeCodeUnitsOptions = {},
): Promise<CodeUnitInfo[]> => {
  const document = await loadSourceDocumentFromFile(filePath);
  const sourceFile = document.project.getSourceFileOrThrow(document.sourceFilePath);
  return scanCodeUnits(sourceFile, options);
};

export const analyzeCodeUnitsFromProject = async (
  projectRoot: string,
  options: AnalyzeCodeUnitsOptions = {},
): Promise<CodeUnitInfo[]> => {
  const project = new Project({
    tsConfigFilePath: path.join(path.resolve(projectRoot), 'tsconfig.json'),
    manipulationSettings: {
      quoteKind: QuoteKind.Single,
      indentationText: IndentationText.TwoSpaces,
    },
  });
  return scanProject(project, options);
};

const targetKindToCodeUnitKinds = (kind: ReferenceTargetInput['kind']): CodeUnitKind[] => {
  switch (kind) {
    case 'type_alias':
      return ['type_alias'];
    default:
      return [kind];
  }
};

const toSymbolCandidates = (
  units: CodeUnitInfo[],
  target: ReferenceTargetInput,
): SymbolCandidate[] =>
  units
    .filter((unit) => targetKindToCodeUnitKinds(target.kind).includes(unit.kind))
    .filter((unit) => unit.name === target.name)
    .map((unit) => ({
      ...unit,
      ...(unit.typeMetadata?.signature ? { signature: unit.typeMetadata.signature } : {}),
    }));

export const resolveSymbolCandidatesFromText = (
  sourceText: string,
  target: ReferenceTargetInput,
  options: AnalyzeCodeUnitsOptions = {},
  filePath = '__astmend_symbol_candidates__.ts',
): SymbolCandidate[] =>
  toSymbolCandidates(
    analyzeCodeUnitsFromText(sourceText, { ...options, includeTypeMetadata: true }, filePath),
    target,
  );

export const resolveSymbolCandidatesFromFile = async (
  filePath: string,
  target: ReferenceTargetInput,
  options: AnalyzeCodeUnitsOptions = {},
): Promise<SymbolCandidate[]> =>
  toSymbolCandidates(
    await analyzeCodeUnitsFromFile(filePath, { ...options, includeTypeMetadata: true }),
    target,
  );

export const resolveSymbolCandidatesFromProject = async (
  projectRoot: string,
  target: ReferenceTargetInput,
  options: AnalyzeCodeUnitsOptions = {},
): Promise<SymbolCandidate[]> =>
  toSymbolCandidates(
    await analyzeCodeUnitsFromProject(projectRoot, { ...options, includeTypeMetadata: true }),
    target,
  );
