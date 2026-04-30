import { createHash } from 'node:crypto';
import { type Node, type SourceFile, SyntaxKind } from 'ts-morph';
import type { ReferenceTargetInput } from '../schema/analysis.js';
import { AstmendError } from './errors.js';
import { loadSourceDocumentFromFile, loadSourceDocumentFromText } from './project.js';

const normalizedLeafKinds = new Map<SyntaxKind, string>([
  [SyntaxKind.Identifier, 'ID'],
  [SyntaxKind.PrivateIdentifier, 'ID'],
  [SyntaxKind.StringLiteral, 'STR'],
  [SyntaxKind.NumericLiteral, 'NUM'],
  [SyntaxKind.BigIntLiteral, 'BIGINT'],
  [SyntaxKind.NoSubstitutionTemplateLiteral, 'STR'],
  [SyntaxKind.TrueKeyword, 'BOOL'],
  [SyntaxKind.FalseKeyword, 'BOOL'],
]);

export const getNormalizedAstStructure = (node: Node): string => {
  const normalizedLeaf = normalizedLeafKinds.get(node.getKind());
  if (normalizedLeaf) {
    return normalizedLeaf;
  }

  const children: string[] = [];
  node.forEachChild((child) => {
    children.push(getNormalizedAstStructure(child));
  });

  return `${node.getKindName()}(${children.join(',')})`;
};

export const generateAstFingerprint = (node: Node): string =>
  createHash('sha256').update(getNormalizedAstStructure(node)).digest('hex');

const findTargetNode = (sourceFile: SourceFile, target: ReferenceTargetInput): Node => {
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
      `Fingerprint target not found: ${target.kind}.${target.name}`,
    );
  }

  if (matches.length > 1) {
    throw new AstmendError(
      'TARGET_AMBIGUOUS',
      `Multiple fingerprint targets matched: ${target.kind}.${target.name}`,
    );
  }

  return matches[0];
};

export const generateAstFingerprintFromText = (
  sourceText: string,
  target?: ReferenceTargetInput,
  filePath = '__astmend_fingerprint__.ts',
): string => {
  const document = loadSourceDocumentFromText(filePath, sourceText);
  const sourceFile = document.project.getSourceFileOrThrow(document.sourceFilePath);
  return generateAstFingerprint(target ? findTargetNode(sourceFile, target) : sourceFile);
};

export const generateAstFingerprintFromFile = async (
  filePath: string,
  target?: ReferenceTargetInput,
): Promise<string> => {
  const document = await loadSourceDocumentFromFile(filePath);
  const sourceFile = document.project.getSourceFileOrThrow(document.sourceFilePath);
  return generateAstFingerprint(target ? findTargetNode(sourceFile, target) : sourceFile);
};
