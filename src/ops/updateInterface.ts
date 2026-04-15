import type { SourceFile } from 'ts-morph';
import { AstmendError } from '../engine/errors.js';
import { assertTypeResolvesInContext } from '../engine/guards.js';
import type { UpdateInterfaceOperation } from '../schema/patch.js';
import type { OperationResult } from './updateFunction.js';

const findUniqueInterfaceDeclaration = (sourceFile: SourceFile, name: string) => {
  const matches = sourceFile
    .getInterfaces()
    .filter((interfaceDeclaration) => interfaceDeclaration.getName() === name);

  if (matches.length === 0) {
    throw new AstmendError('TARGET_NOT_FOUND', `Interface not found: ${name}`);
  }

  if (matches.length > 1) {
    throw new AstmendError('TARGET_AMBIGUOUS', `Multiple interfaces matched: ${name}`);
  }

  return matches[0];
};

export const updateInterface = (
  sourceFile: SourceFile,
  operation: UpdateInterfaceOperation,
): OperationResult => {
  const interfaceDeclaration = findUniqueInterfaceDeclaration(sourceFile, operation.name);
  if ('add_property' in operation.changes) {
    const { name, type, optional } = operation.changes.add_property;
    const existingProperty = interfaceDeclaration.getProperty(name);

    if (existingProperty) {
      const existingType =
        existingProperty.getTypeNode()?.getText() ?? existingProperty.getType().getText();
      const existingOptional = existingProperty.hasQuestionToken();
      if (existingType === type && existingOptional === Boolean(optional)) {
        return {
          updatedText: sourceFile.getFullText(),
          changed: false,
        };
      }

      throw new AstmendError(
        'DUPLICATE_CHANGE',
        `Property already exists with a different shape: ${operation.name}.${name}`,
      );
    }

    assertTypeResolvesInContext(
      sourceFile.getFullText(),
      type,
      `Interface property ${operation.name}.${name}`,
    );

    interfaceDeclaration.addProperty({
      name,
      type,
      hasQuestionToken: optional ?? false,
    });

    return {
      updatedText: sourceFile.getFullText(),
      changed: true,
    };
  }

  const { name } = operation.changes.remove_property;
  const existingProperty = interfaceDeclaration.getProperty(name);

  if (!existingProperty) {
    return {
      updatedText: sourceFile.getFullText(),
      changed: false,
    };
  }

  existingProperty.remove();

  return {
    updatedText: sourceFile.getFullText(),
    changed: true,
  };
};
