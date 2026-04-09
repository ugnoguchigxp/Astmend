import { Project } from 'ts-morph';
import { AstmendError } from './errors.js';

const createValidationProject = () =>
  new Project({
    useInMemoryFileSystem: true,
  });

const countLines = (text: string) => text.split(/\r?\n/).length;

const collectLocalTopLevelNames = (sourceFileText: string): Set<string> => {
  const project = createValidationProject();
  const sourceFile = project.createSourceFile('__astmend_source__.ts', sourceFileText, {
    overwrite: true,
  });
  const names = new Set<string>();

  for (const declaration of [
    ...sourceFile.getTypeAliases(),
    ...sourceFile.getInterfaces(),
    ...sourceFile.getClasses(),
    ...sourceFile.getEnums(),
    ...sourceFile.getFunctions(),
    ...sourceFile.getVariableDeclarations(),
  ]) {
    const name = declaration.getName();
    if (name) {
      names.add(name);
    }
  }

  return names;
};

interface ImportedBindingSets {
  typeBindingNames: Set<string>;
  valueBindingNames: Set<string>;
}

const collectImportedBindings = (sourceFileText: string): ImportedBindingSets => {
  const project = createValidationProject();
  const sourceFile = project.createSourceFile('__astmend_source__.ts', sourceFileText, {
    overwrite: true,
  });
  const typeBindingNames = new Set<string>();
  const valueBindingNames = new Set<string>();

  const addTypeBinding = (name: string) => {
    if (!valueBindingNames.has(name)) {
      typeBindingNames.add(name);
    }
  };

  const addValueBinding = (name: string) => {
    valueBindingNames.add(name);
    typeBindingNames.delete(name);
  };

  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    const declarationIsTypeOnly = importDeclaration.isTypeOnly();

    const defaultImport = importDeclaration.getDefaultImport();
    if (defaultImport) {
      const localName = defaultImport.getText();
      if (declarationIsTypeOnly) {
        addTypeBinding(localName);
      } else {
        addValueBinding(localName);
      }
    }

    const namespaceImport = importDeclaration.getNamespaceImport();
    if (namespaceImport) {
      const localName = namespaceImport.getText();
      if (declarationIsTypeOnly) {
        addTypeBinding(localName);
      } else {
        addValueBinding(localName);
      }
    }

    for (const namedImport of importDeclaration.getNamedImports()) {
      const localName = namedImport.getAliasNode()?.getText() ?? namedImport.getName();
      if (declarationIsTypeOnly || namedImport.isTypeOnly()) {
        addTypeBinding(localName);
      } else {
        addValueBinding(localName);
      }
    }
  }

  return {
    typeBindingNames,
    valueBindingNames,
  };
};

const stripImportDeclarations = (sourceFileText: string): string => {
  const project = createValidationProject();
  const sourceFile = project.createSourceFile('__astmend_source__.ts', sourceFileText, {
    overwrite: true,
  });
  const lines = sourceFileText.split(/\r?\n/);

  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    const startLine = sourceFile.getLineAndColumnAtPos(importDeclaration.getStartLinePos()).line;
    const endLine = sourceFile.getLineAndColumnAtPos(importDeclaration.getEnd()).line;

    for (let lineIndex = startLine - 1; lineIndex < endLine; lineIndex += 1) {
      lines[lineIndex] = '';
    }
  }

  return lines.join('\n');
};

export const assertTypeResolvesInContext = (
  sourceText: string,
  typeText: string,
  subjectDescription: string,
): void => {
  const project = createValidationProject();
  const validationFilePath = '__astmend_type_validation__.ts';
  const sourceTextWithoutImports = stripImportDeclarations(sourceText);
  const localTopLevelNames = collectLocalTopLevelNames(sourceTextWithoutImports);
  const { typeBindingNames, valueBindingNames } = collectImportedBindings(sourceText);
  const importedValueStubs = [...valueBindingNames]
    .filter((name) => !localTopLevelNames.has(name))
    .sort()
    .map((name) => `declare const ${name}: unknown;`);
  const importedTypeStubs = [...typeBindingNames]
    .filter((name) => !localTopLevelNames.has(name) && !valueBindingNames.has(name))
    .sort()
    .map((name) => `type ${name} = unknown;`);
  const validationText = `${sourceTextWithoutImports}\n\n${[...importedValueStubs, ...importedTypeStubs].join('\n')}\n\ntype __AstmendTypeCheck = ${typeText};\n`;
  project.createSourceFile(validationFilePath, validationText, { overwrite: true });

  const probeLine = countLines(sourceTextWithoutImports) + 2;
  const diagnostics = project.getPreEmitDiagnostics().filter((diagnostic) => {
    const lineNumber = diagnostic.getLineNumber();
    return lineNumber !== undefined && lineNumber >= probeLine;
  });

  if (diagnostics.length === 0) {
    return;
  }

  const message = diagnostics
    .map((diagnostic) => diagnostic.getMessageText())
    .map(String)
    .join('; ');

  throw new AstmendError(
    'TYPE_NOT_FOUND',
    `${subjectDescription} uses an invalid or unresolved type: ${typeText}. ${message}`,
  );
};
