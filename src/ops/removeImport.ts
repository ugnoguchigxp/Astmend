import type { ImportDeclaration, SourceFile } from 'ts-morph';
import type { RemoveImportOperation } from '../schema/patch.js';
import type { OperationResult } from './updateFunction.js';

const findImportDeclarations = (sourceFile: SourceFile, moduleSpecifier: string) =>
  sourceFile
    .getImportDeclarations()
    .filter((declaration) => declaration.getModuleSpecifierValue() === moduleSpecifier);

const shouldRemoveSpecifier = (
  importDeclaration: ImportDeclaration,
  name: string,
  alias?: string,
): boolean =>
  importDeclaration.getNamedImports().some((specifier) => {
    const specifierName = specifier.getName();
    const specifierAlias = specifier.getAliasNode()?.getText();

    if (alias === undefined) {
      return specifierName === name;
    }

    return specifierName === name && specifierAlias === alias;
  });

export const removeImport = (
  sourceFile: SourceFile,
  operation: RemoveImportOperation,
): OperationResult => {
  const existingDeclarations = findImportDeclarations(sourceFile, operation.module);

  if (existingDeclarations.length === 0) {
    return {
      updatedText: sourceFile.getFullText(),
      changed: false,
    };
  }
  let changed = false;

  if (!operation.named) {
    for (const existingDeclaration of existingDeclarations) {
      existingDeclaration.remove();
      changed = true;
    }

    return {
      updatedText: sourceFile.getFullText(),
      changed,
    };
  }

  for (const existingDeclaration of existingDeclarations) {
    const specifiersToRemove = operation.named.filter((entry) =>
      shouldRemoveSpecifier(existingDeclaration, entry.name, entry.alias),
    );

    if (specifiersToRemove.length === 0) {
      continue;
    }

    for (const specifier of existingDeclaration.getNamedImports()) {
      const specifierName = specifier.getName();
      const specifierAlias = specifier.getAliasNode()?.getText();

      const shouldRemove = specifiersToRemove.some((entry) => {
        if (entry.alias === undefined) {
          return specifierName === entry.name;
        }

        return specifierName === entry.name && specifierAlias === entry.alias;
      });

      if (shouldRemove) {
        specifier.remove();
        changed = true;
      }
    }

    if (
      existingDeclaration.getNamedImports().length === 0 &&
      !existingDeclaration.getDefaultImport() &&
      !existingDeclaration.getNamespaceImport()
    ) {
      existingDeclaration.remove();
      changed = true;
    }
  }

  if (!changed) {
    return {
      updatedText: sourceFile.getFullText(),
      changed: false,
    };
  }

  return {
    updatedText: sourceFile.getFullText(),
    changed,
  };
};
