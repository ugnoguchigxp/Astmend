import type { SourceFile } from 'ts-morph';
import { AstmendError } from '../engine/errors.js';
import type { RenameSymbolOperation } from '../schema/patch.js';
import type { OperationResult } from './updateFunction.js';

type RenameableDeclaration = {
  getNameNode(): { rename(newName: string): void };
};

const findUniqueRenameTarget = (sourceFile: SourceFile, kind: RenameSymbolOperation['target']['kind'], name: string): RenameableDeclaration => {
  const matches = (() => {
    switch (kind) {
      case 'function':
        return sourceFile.getFunctions().filter((declaration) => declaration.getName() === name);
      case 'interface':
        return sourceFile.getInterfaces().filter((declaration) => declaration.getName() === name);
      case 'class':
        return sourceFile.getClasses().filter((declaration) => declaration.getName() === name);
      case 'type_alias':
        return sourceFile.getTypeAliases().filter((declaration) => declaration.getName() === name);
      case 'enum':
        return sourceFile.getEnums().filter((declaration) => declaration.getName() === name);
      case 'variable':
        return sourceFile.getVariableDeclarations().filter((declaration) => declaration.getName() === name);
    }
  })();

  if (matches.length === 0) {
    throw new AstmendError('TARGET_NOT_FOUND', `Rename target not found: ${kind}.${name}`);
  }

  if (matches.length > 1) {
    throw new AstmendError('TARGET_AMBIGUOUS', `Multiple rename targets matched: ${kind}.${name}`);
  }

  return matches[0] as RenameableDeclaration;
};

export const renameSymbol = (
  sourceFile: SourceFile,
  operation: RenameSymbolOperation,
): OperationResult => {
  const beforeText = sourceFile.getFullText();
  const target = findUniqueRenameTarget(sourceFile, operation.target.kind, operation.target.name);
  target.getNameNode().rename(operation.newName);

  const updatedText = sourceFile.getFullText();

  return {
    updatedText,
    changed: updatedText !== beforeText,
  };
};