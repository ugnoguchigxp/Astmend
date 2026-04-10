import type { ClassDeclaration, ConstructorDeclaration, SourceFile } from 'ts-morph';
import { AstmendError } from '../engine/errors.js';
import { assertTypeResolvesInContext } from '../engine/guards.js';
import type { UpdateConstructorOperation } from '../schema/patch.js';
import type { OperationResult } from './updateFunction.js';

const findUniqueClassDeclaration = (
  sourceFile: SourceFile,
  className: string,
): ClassDeclaration => {
  const matches = sourceFile
    .getClasses()
    .filter((classDeclaration) => classDeclaration.getName() === className);

  if (matches.length === 0) {
    throw new AstmendError('TARGET_NOT_FOUND', `Class not found: ${className}`);
  }

  if (matches.length > 1) {
    throw new AstmendError('TARGET_AMBIGUOUS', `Multiple classes matched: ${className}`);
  }

  return matches[0];
};

const getConstructorParameterShape = (
  constructorDeclaration: ConstructorDeclaration,
  name: string,
) => {
  const parameter = constructorDeclaration
    .getParameters()
    .find((entry) => entry.getName() === name);
  if (!parameter) {
    return undefined;
  }

  return {
    type: parameter.getTypeNode()?.getText() ?? parameter.getType().getText(),
    hasQuestionToken: parameter.hasQuestionToken(),
  };
};

export const updateConstructor = (
  sourceFile: SourceFile,
  operation: UpdateConstructorOperation,
): OperationResult => {
  const classDeclaration = findUniqueClassDeclaration(sourceFile, operation.class_name);
  const constructors = classDeclaration.getConstructors();
  const { name, type } = operation.changes.add_param;

  assertTypeResolvesInContext(
    sourceFile.getFullText(),
    type,
    `Constructor parameter ${operation.class_name}.${name}`,
  );

  if (constructors.length === 0) {
    classDeclaration.addConstructor({
      parameters: [
        {
          name,
          type,
        },
      ],
    });

    return {
      updatedText: sourceFile.getFullText(),
      changed: true,
    };
  }

  const shapes = constructors.map((constructorDeclaration) =>
    getConstructorParameterShape(constructorDeclaration, name),
  );
  const existingShapes = shapes.filter((shape) => shape !== undefined);

  if (existingShapes.length > 0) {
    const allHaveParameter = existingShapes.length === constructors.length;
    const allMatch = existingShapes.every(
      (shape) => shape.type === type && shape.hasQuestionToken === false,
    );

    if (allHaveParameter && allMatch) {
      return {
        updatedText: sourceFile.getFullText(),
        changed: false,
      };
    }

    throw new AstmendError(
      'DUPLICATE_CHANGE',
      `Constructor parameter already exists with a different shape: ${operation.class_name}.${name}`,
    );
  }

  for (const constructorDeclaration of constructors) {
    constructorDeclaration.addParameter({
      name,
      type,
    });
  }

  return {
    updatedText: sourceFile.getFullText(),
    changed: true,
  };
};
