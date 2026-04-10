import { type Node, type SourceFile, SyntaxKind } from 'ts-morph';
import { AstmendError } from './errors.js';
import { loadSourceDocumentFromFile, loadSourceDocumentFromText } from './project.js';

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

export interface ReferenceLocation {
  line: number;
  column: number;
  text: string;
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
  references: ReferenceLocation[];
  impactedDeclarations: ImpactedDeclaration[];
}

type ReferenceableNode = Node & {
  findReferencesAsNodes(): Node[];
};

const findUniqueTargetNode = (
  sourceFile: SourceFile,
  target: ReferenceTarget,
): ReferenceableNode => {
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

  return matches[0].getNameNode() as ReferenceableNode;
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

const toLocation = (node: Node): ReferenceLocation => {
  const position = node.getSourceFile().getLineAndColumnAtPos(node.getStart());
  return {
    line: position.line,
    column: position.column,
    text: node.getText(),
  };
};

export const analyzeReferences = (
  sourceFile: SourceFile,
  target: ReferenceTarget,
): ReferenceAnalysis => {
  const targetNode = findUniqueTargetNode(sourceFile, target);
  const referenceNodes = targetNode
    .findReferencesAsNodes()
    .filter(
      (node) =>
        !(
          node.getSourceFile() === targetNode.getSourceFile() &&
          node.getStart() === targetNode.getStart()
        ),
    );

  const references = referenceNodes
    .map(toLocation)
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
    references,
    impactedDeclarations,
  };
};

export const analyzeReferencesFromText = (
  sourceText: string,
  target: ReferenceTarget,
  filePath = '__astmend_references__.ts',
): ReferenceAnalysis => {
  const document = loadSourceDocumentFromText(filePath, sourceText);
  const sourceFile = document.project.getSourceFileOrThrow(document.sourceFilePath);
  return analyzeReferences(sourceFile, target);
};

export const analyzeReferencesFromFile = async (
  filePath: string,
  target: ReferenceTarget,
): Promise<ReferenceAnalysis> => {
  const document = await loadSourceDocumentFromFile(filePath);
  const sourceFile = document.project.getSourceFileOrThrow(document.sourceFilePath);
  return analyzeReferences(sourceFile, target);
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
