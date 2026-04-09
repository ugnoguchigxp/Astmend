import type { ImportDeclaration, SourceFile } from 'ts-morph';
import type { AddImportOperation } from '../schema/patch.js';
import type { OperationResult } from './updateFunction.js';

const findImportDeclaration = (sourceFile: SourceFile, moduleSpecifier: string) =>
  sourceFile
    .getImportDeclarations()
    .find((declaration) => declaration.getModuleSpecifierValue() === moduleSpecifier);

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
  const existingDeclaration = findImportDeclaration(sourceFile, operation.module);
  const namedImportsToAdd = operation.named.filter(
    (entry) =>
      !existingDeclaration || !hasNamedImport(existingDeclaration, entry.name, entry.alias),
  );

  if (namedImportsToAdd.length === 0) {
    return {
      updatedText: sourceFile.getFullText(),
      changed: false,
    };
  }

  if (existingDeclaration) {
    existingDeclaration.addNamedImports(
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
