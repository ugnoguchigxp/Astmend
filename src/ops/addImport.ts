import type { ImportDeclaration, SourceFile } from 'ts-morph';
import type { AddImportOperation } from '../schema/patch.js';
import type { OperationResult } from './updateFunction.js';

const findImportDeclarations = (sourceFile: SourceFile, moduleSpecifier: string) =>
  sourceFile
    .getImportDeclarations()
    .filter((declaration) => declaration.getModuleSpecifierValue() === moduleSpecifier);

const hasNamedImport = (
  importDeclaration: ImportDeclaration,
  name: string,
  alias?: string,
): boolean =>
  importDeclaration.getNamedImports().some((specifier) => {
    const specifierName = specifier.getName();
    const specifierAlias = specifier.getAliasNode()?.getText();
    if (alias === undefined) {
      return specifierName === name && specifierAlias === undefined;
    }

    return specifierName === name && specifierAlias === alias;
  });

export const addImport = (
  sourceFile: SourceFile,
  operation: AddImportOperation,
): OperationResult => {
  const existingDeclarations = findImportDeclarations(sourceFile, operation.module);
  const namedImportsToAdd = operation.named.filter(
    (entry) =>
      !existingDeclarations.some((declaration) =>
        hasNamedImport(declaration, entry.name, entry.alias),
      ),
  );

  if (namedImportsToAdd.length === 0) {
    return {
      updatedText: sourceFile.getFullText(),
      changed: false,
    };
  }

  const targetDeclaration = existingDeclarations[0];
  if (targetDeclaration) {
    targetDeclaration.addNamedImports(
      namedImportsToAdd.map((entry) => ({
        name: entry.name,
        alias: entry.alias,
      })),
    );
  } else {
    sourceFile.addImportDeclaration({
      moduleSpecifier: operation.module,
      namedImports: namedImportsToAdd.map((entry) => ({
        name: entry.name,
        alias: entry.alias,
      })),
    });
  }

  return {
    updatedText: sourceFile.getFullText(),
    changed: true,
  };
};
