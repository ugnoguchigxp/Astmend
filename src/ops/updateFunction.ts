import type { SourceFile } from 'ts-morph';
import { AstmendError } from '../engine/errors.js';
import { assertTypeResolvesInContext } from '../engine/guards.js';
import type { UpdateFunctionOperation } from '../schema/patch.js';

export interface OperationResult {
  updatedText: string;
  changed: boolean;
}

const findUniqueFunctionDeclaration = (sourceFile: SourceFile, name: string) => {
  const matches = sourceFile
    .getFunctions()
    .filter((functionDeclaration) => functionDeclaration.getName() === name);

  if (matches.length === 0) {
    throw new AstmendError('TARGET_NOT_FOUND', `Function not found: ${name}`);
  }

  if (matches.length > 1) {
    throw new AstmendError('TARGET_AMBIGUOUS', `Multiple functions matched: ${name}`);
  }

  return matches[0];
};

export const updateFunction = (
  sourceFile: SourceFile,
  operation: UpdateFunctionOperation,
): OperationResult => {
  const functionDeclaration = findUniqueFunctionDeclaration(sourceFile, operation.name);
  const { name, type } = operation.changes.add_param;
  const existingParameter = functionDeclaration
    .getParameters()
    .find((parameter) => parameter.getName() === name);

  if (existingParameter) {
    const existingType =
      existingParameter.getTypeNode()?.getText() ?? existingParameter.getType().getText();
    if (existingType === type) {
      return {
        updatedText: sourceFile.getFullText(),
        changed: false,
      };
    }

    throw new AstmendError(
      'DUPLICATE_CHANGE',
      `Parameter already exists with a different type: ${operation.name}.${name}`,
    );
  }

  assertTypeResolvesInContext(
    sourceFile.getFullText(),
    type,
    `Function parameter ${operation.name}.${name}`,
  );

  functionDeclaration.addParameter({
    name,
    type,
  });

  return {
    updatedText: sourceFile.getFullText(),
    changed: true,
  };
};
