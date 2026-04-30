import path from 'node:path';
import { IndentationText, Project, QuoteKind, type SourceFile } from 'ts-morph';
import { loadSourceDocumentFromFile } from './project.js';

export interface ImportEdge {
  fromFile: string;
  moduleSpecifier: string;
  importedName: string | null;
  localName: string;
  importKind: 'named' | 'default' | 'namespace' | 'side_effect';
  resolvedFile?: string;
}

export interface ExportInfo {
  file: string;
  exportedName: string;
  localName?: string;
  exportKind: 'named' | 'default' | 'namespace' | 're_export' | 'export_all';
  moduleSpecifier?: string;
  resolvedFile?: string;
}

export interface ImportExportGraph {
  files: Array<{
    file: string;
    imports: ImportEdge[];
    exports: ExportInfo[];
  }>;
}

const toStableFilePath = (filePath: string): string =>
  path.normalize(filePath).replaceAll(path.sep, path.posix.sep);

const maybeResolvedFile = (sourceFile: SourceFile | undefined): { resolvedFile?: string } =>
  sourceFile ? { resolvedFile: toStableFilePath(sourceFile.getFilePath()) } : {};

const collectImports = (sourceFile: SourceFile): ImportEdge[] => {
  const file = toStableFilePath(sourceFile.getFilePath());
  const imports: ImportEdge[] = [];

  for (const declaration of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = declaration.getModuleSpecifierValue();
    const resolved = maybeResolvedFile(declaration.getModuleSpecifierSourceFile());

    const defaultImport = declaration.getDefaultImport();
    if (defaultImport) {
      imports.push({
        fromFile: file,
        moduleSpecifier,
        importedName: 'default',
        localName: defaultImport.getText(),
        importKind: 'default',
        ...resolved,
      });
    }

    const namespaceImport = declaration.getNamespaceImport();
    if (namespaceImport) {
      imports.push({
        fromFile: file,
        moduleSpecifier,
        importedName: null,
        localName: namespaceImport.getText(),
        importKind: 'namespace',
        ...resolved,
      });
    }

    for (const namedImport of declaration.getNamedImports()) {
      imports.push({
        fromFile: file,
        moduleSpecifier,
        importedName: namedImport.getName(),
        localName: namedImport.getAliasNode()?.getText() ?? namedImport.getName(),
        importKind: 'named',
        ...resolved,
      });
    }

    if (!defaultImport && !namespaceImport && declaration.getNamedImports().length === 0) {
      imports.push({
        fromFile: file,
        moduleSpecifier,
        importedName: null,
        localName: '',
        importKind: 'side_effect',
        ...resolved,
      });
    }
  }

  return imports;
};

const collectDeclarationExports = (sourceFile: SourceFile): ExportInfo[] => {
  const file = toStableFilePath(sourceFile.getFilePath());
  const exports: ExportInfo[] = [];

  const namedDeclarations = [
    ...sourceFile.getFunctions(),
    ...sourceFile.getClasses(),
    ...sourceFile.getInterfaces(),
    ...sourceFile.getTypeAliases(),
    ...sourceFile.getEnums(),
  ];

  for (const declaration of namedDeclarations) {
    if (!declaration.isExported()) {
      continue;
    }

    const localName = declaration.getName();
    const isDefault =
      (declaration as { hasDefaultKeyword?: () => boolean }).hasDefaultKeyword?.() ?? false;

    if (!localName && !isDefault) {
      continue;
    }

    exports.push({
      file,
      exportedName: isDefault ? 'default' : (localName as string),
      ...(localName ? { localName } : {}),
      exportKind: isDefault ? 'default' : 'named',
    });
  }

  for (const statement of sourceFile.getVariableStatements()) {
    if (!statement.isExported()) {
      continue;
    }

    for (const declaration of statement.getDeclarations()) {
      exports.push({
        file,
        exportedName: declaration.getName(),
        localName: declaration.getName(),
        exportKind: 'named',
      });
    }
  }

  return exports;
};

const collectExportDeclarations = (sourceFile: SourceFile): ExportInfo[] => {
  const file = toStableFilePath(sourceFile.getFilePath());
  const exports: ExportInfo[] = [];

  for (const declaration of sourceFile.getExportDeclarations()) {
    const moduleSpecifier = declaration.getModuleSpecifierValue();
    const moduleFields = moduleSpecifier ? { moduleSpecifier } : {};
    const resolved = maybeResolvedFile(declaration.getModuleSpecifierSourceFile());
    const namespaceExport = (
      declaration as unknown as { getNamespaceExport?: () => { getName: () => string } | undefined }
    ).getNamespaceExport?.();

    if (namespaceExport) {
      exports.push({
        file,
        exportedName: namespaceExport.getName(),
        exportKind: 'namespace',
        ...moduleFields,
        ...resolved,
      });
      continue;
    }

    const namedExports = declaration.getNamedExports();
    if (namedExports.length === 0) {
      exports.push({
        file,
        exportedName: '*',
        exportKind: 'export_all',
        ...moduleFields,
        ...resolved,
      });
      continue;
    }

    for (const namedExport of namedExports) {
      const exportedName = namedExport.getAliasNode()?.getText() ?? namedExport.getName();
      exports.push({
        file,
        exportedName,
        localName: namedExport.getName(),
        exportKind: moduleSpecifier ? 're_export' : 'named',
        ...moduleFields,
        ...resolved,
      });
    }
  }

  for (const assignment of sourceFile.getExportAssignments()) {
    exports.push({
      file,
      exportedName: 'default',
      localName: assignment.getExpression().getText(),
      exportKind: 'default',
    });
  }

  return exports;
};

const analyzeSourceFile = (sourceFile: SourceFile): ImportExportGraph['files'][number] => ({
  file: toStableFilePath(sourceFile.getFilePath()),
  imports: collectImports(sourceFile),
  exports: [...collectDeclarationExports(sourceFile), ...collectExportDeclarations(sourceFile)],
});

export const analyzeImportExportGraphFromFile = async (
  filePath: string,
): Promise<ImportExportGraph> => {
  const document = await loadSourceDocumentFromFile(filePath);
  const sourceFile = document.project.getSourceFileOrThrow(document.sourceFilePath);
  return {
    files: [analyzeSourceFile(sourceFile)],
  };
};

export const analyzeImportExportGraphFromProject = async (
  projectRoot: string,
): Promise<ImportExportGraph> => {
  const project = new Project({
    tsConfigFilePath: path.join(path.resolve(projectRoot), 'tsconfig.json'),
    manipulationSettings: {
      quoteKind: QuoteKind.Single,
      indentationText: IndentationText.TwoSpaces,
    },
  });

  return {
    files: project
      .getSourceFiles()
      .filter(
        (sourceFile) => !toStableFilePath(sourceFile.getFilePath()).includes('/node_modules/'),
      )
      .map(analyzeSourceFile)
      .sort((left, right) => left.file.localeCompare(right.file)),
  };
};
