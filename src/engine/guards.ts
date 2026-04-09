import { Project } from 'ts-morph';
import ts from 'typescript';
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
  namespaceImportNames: Set<string>;
}

const collectImportedBindings = (sourceFileText: string): ImportedBindingSets => {
  const project = createValidationProject();
  const sourceFile = project.createSourceFile('__astmend_source__.ts', sourceFileText, {
    overwrite: true,
  });
  const typeBindingNames = new Set<string>();
  const valueBindingNames = new Set<string>();
  const namespaceImportNames = new Set<string>();

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
      namespaceImportNames.add(localName);
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
    namespaceImportNames,
  };
};

interface NamespaceTypeMemberNode {
  children: Map<string, NamespaceTypeMemberNode>;
}

const createNamespaceTypeMemberNode = (): NamespaceTypeMemberNode => ({
  children: new Map<string, NamespaceTypeMemberNode>(),
});

const getQualifiedNameParts = (name: ts.EntityName): string[] => {
  if (ts.isIdentifier(name)) {
    return [name.text];
  }

  return [...getQualifiedNameParts(name.left), name.right.text];
};

const collectNamespaceMemberPathsFromTypeText = (
  typeText: string,
  namespaceImportNames: Set<string>,
): Map<string, NamespaceTypeMemberNode> => {
  if (namespaceImportNames.size === 0) {
    return new Map<string, NamespaceTypeMemberNode>();
  }

  const sourceFile = ts.createSourceFile(
    '__astmend_type_expr__.ts',
    `type __AstmendTypeCheck = ${typeText};`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const namespacePaths = new Map<string, NamespaceTypeMemberNode>();

  const addPath = (parts: string[]) => {
    if (parts.length < 2 || !namespaceImportNames.has(parts[0])) {
      return;
    }

    let current =
      namespacePaths.get(parts[0]) ??
      (() => {
        const root = createNamespaceTypeMemberNode();
        namespacePaths.set(parts[0], root);
        return root;
      })();

    for (const segment of parts.slice(1)) {
      let child = current.children.get(segment);
      if (!child) {
        child = createNamespaceTypeMemberNode();
        current.children.set(segment, child);
      }
      current = child;
    }
  };

  const visit = (node: ts.Node) => {
    if (ts.isQualifiedName(node)) {
      addPath(getQualifiedNameParts(node));
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return namespacePaths;
};

const renderNamespaceMemberLines = (
  node: NamespaceTypeMemberNode,
  indentation: string,
): string[] => {
  const names = [...node.children.keys()].sort((left, right) => left.localeCompare(right));
  const lines: string[] = [];

  for (const name of names) {
    const child = node.children.get(name);
    if (!child) {
      continue;
    }

    lines.push(`${indentation}export interface ${name} {}`);
    if (child.children.size > 0) {
      lines.push(`${indentation}export namespace ${name} {`);
      lines.push(...renderNamespaceMemberLines(child, `${indentation}  `));
      lines.push(`${indentation}}`);
    }
  }

  return lines;
};

const createNamespaceTypeStubs = (
  typeText: string,
  namespaceImportNames: Set<string>,
  localTopLevelNames: Set<string>,
): string[] => {
  const namespaceMemberPaths = collectNamespaceMemberPathsFromTypeText(
    typeText,
    namespaceImportNames,
  );
  const namespaceNames = [...namespaceMemberPaths.keys()]
    .filter((name) => !localTopLevelNames.has(name))
    .sort((left, right) => left.localeCompare(right));

  return namespaceNames
    .map((namespaceName) => {
      const namespaceRoot = namespaceMemberPaths.get(namespaceName);
      if (!namespaceRoot || namespaceRoot.children.size === 0) {
        return '';
      }

      const memberLines = renderNamespaceMemberLines(namespaceRoot, '  ');
      return `declare namespace ${namespaceName} {\n${memberLines.join('\n')}\n}`;
    })
    .filter((stub) => stub.length > 0);
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
  const { typeBindingNames, valueBindingNames, namespaceImportNames } =
    collectImportedBindings(sourceText);
  const importedValueStubs = [...valueBindingNames]
    .filter((name) => !localTopLevelNames.has(name))
    .sort()
    .map((name) => `declare const ${name}: unknown;`);
  const importedTypeStubs = [...typeBindingNames]
    .filter((name) => !localTopLevelNames.has(name) && !valueBindingNames.has(name))
    .sort()
    .map((name) => `type ${name} = unknown;`);
  const namespaceTypeStubs = createNamespaceTypeStubs(
    typeText,
    namespaceImportNames,
    localTopLevelNames,
  );
  const validationText = `${sourceTextWithoutImports}\n\n${[...importedValueStubs, ...importedTypeStubs, ...namespaceTypeStubs].join('\n')}\n\ntype __AstmendTypeCheck = ${typeText};\n`;
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
