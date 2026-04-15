import { type Node, type SourceFile, SyntaxKind } from 'ts-morph';
import { AstmendError } from './errors.js';
import {
  loadSourceDocumentFromFile,
  loadSourceDocumentFromProjectRoot,
  loadSourceDocumentFromText,
} from './project.js';

export type ReferenceTargetKind =
  | 'function'
  | 'interface'
  | 'class'
  | 'type_alias'
  | 'enum'
  | 'variable';

export interface ReferenceTarget {
  kind: ReferenceTargetKind;
  name: string;
}

export type ExportKind = 'named' | 'default' | 'namespace' | null;

export interface ReferenceLocation {
  line: number;
  column: number;
  text: string;
  file?: string;
  isDefinition?: boolean;
}

export interface ImpactedDeclaration {
  kind: string;
  name: string;
  line: number;
  column: number;
  referenceCount: number;
}

export interface ReferenceAnalysis {
  target: ReferenceTarget;
  isExported: boolean;
  exportKind: ExportKind;
  definition: ReferenceLocation;
  references: ReferenceLocation[];
  impactedDeclarations: ImpactedDeclaration[];
}

type ReferenceableNode = Node & {
  findReferencesAsNodes(): Node[];
};

type ExportableDeclaration = Node & {
  getNameNode(): Node;
  isDefaultExport(): boolean;
  isExported(): boolean;
};

const findUniqueTargetDeclaration = (
  sourceFile: SourceFile,
  target: ReferenceTarget,
): ExportableDeclaration => {
  const matches = (() => {
    switch (target.kind) {
      case 'function':
        return sourceFile
          .getFunctions()
          .filter((declaration) => declaration.getName() === target.name);
      case 'interface':
        return sourceFile
          .getInterfaces()
          .filter((declaration) => declaration.getName() === target.name);
      case 'class':
        return sourceFile
          .getClasses()
          .filter((declaration) => declaration.getName() === target.name);
      case 'type_alias':
        return sourceFile
          .getTypeAliases()
          .filter((declaration) => declaration.getName() === target.name);
      case 'enum':
        return sourceFile.getEnums().filter((declaration) => declaration.getName() === target.name);
      case 'variable':
        return sourceFile
          .getVariableDeclarations()
          .filter((declaration) => declaration.getName() === target.name);
    }
  })();

  if (matches.length === 0) {
    throw new AstmendError(
      'TARGET_NOT_FOUND',
      `Reference target not found: ${target.kind}.${target.name}`,
    );
  }

  if (matches.length > 1) {
    throw new AstmendError(
      'TARGET_AMBIGUOUS',
      `Multiple reference targets matched: ${target.kind}.${target.name}`,
    );
  }

  return matches[0] as ExportableDeclaration;
};

const findUniqueTargetNode = (
  sourceFile: SourceFile,
  target: ReferenceTarget,
): ReferenceableNode => {
  return findUniqueTargetDeclaration(sourceFile, target).getNameNode() as ReferenceableNode;
};

const impactOwnerKinds = [
  SyntaxKind.MethodDeclaration,
  SyntaxKind.Constructor,
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.ClassDeclaration,
  SyntaxKind.InterfaceDeclaration,
  SyntaxKind.TypeAliasDeclaration,
  SyntaxKind.EnumDeclaration,
  SyntaxKind.VariableDeclaration,
  SyntaxKind.PropertyDeclaration,
  SyntaxKind.PropertySignature,
] as const;

const impactOwnerKindSet = new Set<number>(impactOwnerKinds as readonly number[]);

const findImpactOwner = (node: Node): Node | undefined => {
  for (const ancestor of node.getAncestors()) {
    if (impactOwnerKindSet.has(ancestor.getKind())) {
      return ancestor;
    }
  }

  return undefined;
};

const getNodeLabel = (node: Node): string => {
  if (node.getKind() === SyntaxKind.Constructor) {
    return 'constructor';
  }

  const nameNode = (node as { getNameNode?: () => Node | undefined }).getNameNode?.();
  if (nameNode) {
    return nameNode.getText();
  }

  return node.getText();
};

const toLocation = (node: Node, isDefinition = false): ReferenceLocation => {
  const position = node.getSourceFile().getLineAndColumnAtPos(node.getStart());
  return {
    line: position.line,
    column: position.column,
    text: node.getText(),
    file: node.getSourceFile().getFilePath(),
    isDefinition,
  };
};

const getExportKind = (declaration: ExportableDeclaration): ExportKind => {
  if (declaration.isDefaultExport()) {
    return 'default';
  }

  if (declaration.isExported()) {
    return 'named';
  }

  return null;
};

export const analyzeReferences = (
  sourceFile: SourceFile,
  target: ReferenceTarget,
): ReferenceAnalysis => {
  return analyzeReferencesForTarget(sourceFile, target);
};

const analyzeReferencesForTarget = (
  sourceFile: SourceFile,
  target: ReferenceTarget,
): ReferenceAnalysis => {
  const declaration = findUniqueTargetDeclaration(sourceFile, target);
  const targetNode = findUniqueTargetNode(sourceFile, target);
  const exportKind = getExportKind(declaration);
  const referenceNodes = targetNode
    .findReferencesAsNodes()
    .filter(
      (node) =>
        !(
          node.getSourceFile() === targetNode.getSourceFile() &&
          node.getStart() === targetNode.getStart()
        ),
    );

  const definitionLocation = toLocation(targetNode, true);
  const references = referenceNodes
    .map((node) => toLocation(node, false))
    .sort((left, right) => left.line - right.line || left.column - right.column);

  const impactedByKey = new Map<string, ImpactedDeclaration>();

  for (const referenceNode of referenceNodes) {
    const owner = findImpactOwner(referenceNode);
    if (!owner) {
      continue;
    }

    const position = owner.getSourceFile().getLineAndColumnAtPos(owner.getStart());
    const key = `${owner.getKindName()}:${position.line}:${position.column}:${getNodeLabel(owner)}`;
    const existing = impactedByKey.get(key);

    if (existing) {
      existing.referenceCount += 1;
      continue;
    }

    impactedByKey.set(key, {
      kind: owner.getKindName(),
      name: getNodeLabel(owner),
      line: position.line,
      column: position.column,
      referenceCount: 1,
    });
  }

  const impactedDeclarations = [...impactedByKey.values()].sort((left, right) => {
    return left.line - right.line || left.column - right.column;
  });

  return {
    target,
    isExported: exportKind !== null,
    exportKind,
    definition: definitionLocation,
    references,
    impactedDeclarations,
  };
};

export const batchAnalyzeReferences = (
  sourceFile: SourceFile,
  targets: ReferenceTarget[],
): ReferenceAnalysis[] => targets.map((target) => analyzeReferencesForTarget(sourceFile, target));

export const analyzeReferencesFromText = (
  sourceText: string,
  target: ReferenceTarget,
  filePath = '__astmend_references__.ts',
): ReferenceAnalysis => {
  const document = loadSourceDocumentFromText(filePath, sourceText);
  const sourceFile = document.project.getSourceFileOrThrow(document.sourceFilePath);
  return analyzeReferences(sourceFile, target);
};

export const batchAnalyzeReferencesFromText = (
  sourceText: string,
  targets: ReferenceTarget[],
  filePath = '__astmend_references__.ts',
): ReferenceAnalysis[] => {
  const document = loadSourceDocumentFromText(filePath, sourceText);
  const sourceFile = document.project.getSourceFileOrThrow(document.sourceFilePath);
  return batchAnalyzeReferences(sourceFile, targets);
};

export const analyzeReferencesFromFile = async (
  filePath: string,
  target: ReferenceTarget,
): Promise<ReferenceAnalysis> => {
  const document = await loadSourceDocumentFromFile(filePath);
  const sourceFile = document.project.getSourceFileOrThrow(document.sourceFilePath);
  return analyzeReferences(sourceFile, target);
};

export const batchAnalyzeReferencesFromFile = async (
  filePath: string,
  targets: ReferenceTarget[],
): Promise<ReferenceAnalysis[]> => {
  const document = await loadSourceDocumentFromFile(filePath);
  const sourceFile = document.project.getSourceFileOrThrow(document.sourceFilePath);
  return batchAnalyzeReferences(sourceFile, targets);
};

export const analyzeReferencesFromProject = async (
  projectRoot: string,
  entryFile: string,
  target: ReferenceTarget,
): Promise<ReferenceAnalysis> => {
  const document = await loadSourceDocumentFromProjectRoot(projectRoot, entryFile);
  const sourceFile = document.project.getSourceFileOrThrow(document.sourceFilePath);
  return analyzeReferences(sourceFile, target);
};

export const batchAnalyzeReferencesFromProject = async (
  projectRoot: string,
  entryFile: string,
  targets: ReferenceTarget[],
): Promise<ReferenceAnalysis[]> => {
  const document = await loadSourceDocumentFromProjectRoot(projectRoot, entryFile);
  const sourceFile = document.project.getSourceFileOrThrow(document.sourceFilePath);
  return batchAnalyzeReferences(sourceFile, targets);
};

export const detectImpactFromText = (
  sourceText: string,
  target: ReferenceTarget,
  filePath = '__astmend_references__.ts',
) => analyzeReferencesFromText(sourceText, target, filePath).impactedDeclarations;

export const detectImpactFromFile = async (
  filePath: string,
  target: ReferenceTarget,
): Promise<ImpactedDeclaration[]> =>
  (await analyzeReferencesFromFile(filePath, target)).impactedDeclarations;
