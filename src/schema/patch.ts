import { z } from 'zod';

export const patchOperationTypes = [
  'update_function',
  'update_interface',
  'add_import',
  'remove_import',
  'update_constructor',
  'rename_symbol',
  'update_return_type',
  'update_param_type',
  'update_property_type',
  'replace_function_body',
  'add_interface_extends',
  'remove_interface_extends',
] as const;

const addParamSchema = z
  .object({
    name: z.string().min(1),
    type: z.string().min(1),
  })
  .strict();

const removeParamSchema = z
  .object({
    name: z.string().min(1),
  })
  .strict();

const addPropertySchema = z
  .object({
    name: z.string().min(1),
    type: z.string().min(1),
    optional: z.boolean().optional(),
  })
  .strict();

const removePropertySchema = z
  .object({
    name: z.string().min(1),
  })
  .strict();

const renameTargetSchema = z
  .object({
    kind: z.enum(['function', 'interface', 'class', 'type_alias', 'enum', 'variable']),
    name: z.string().min(1),
  })
  .strict();

const callableTargetSchema = z
  .object({
    kind: z.enum(['function', 'method']),
    name: z.string().min(1),
    id: z.string().min(1).optional(),
  })
  .strict();

const propertyTargetSchema = z
  .object({
    kind: z.enum(['interface', 'class']),
    name: z.string().min(1),
    property: z.string().min(1),
    id: z.string().min(1).optional(),
  })
  .strict();

const namedImportSchema = z
  .object({
    name: z.string().min(1),
    alias: z.string().min(1).optional(),
  })
  .strict();

export const updateFunctionSchema = z
  .object({
    type: z.literal('update_function'),
    file: z.string().min(1),
    name: z.string().min(1),
    changes: z.union([
      z
        .object({
          add_param: addParamSchema,
        })
        .strict(),
      z
        .object({
          remove_param: removeParamSchema,
        })
        .strict(),
    ]),
  })
  .strict();

export const updateInterfaceSchema = z
  .object({
    type: z.literal('update_interface'),
    file: z.string().min(1),
    name: z.string().min(1),
    changes: z.union([
      z
        .object({
          add_property: addPropertySchema,
        })
        .strict(),
      z
        .object({
          remove_property: removePropertySchema,
        })
        .strict(),
    ]),
  })
  .strict();

export const addImportSchema = z
  .object({
    type: z.literal('add_import'),
    file: z.string().min(1),
    module: z.string().min(1),
    named: z.array(namedImportSchema).min(1),
  })
  .strict();

export const removeImportSchema = z
  .object({
    type: z.literal('remove_import'),
    file: z.string().min(1),
    module: z.string().min(1),
    named: z.array(namedImportSchema).min(1).optional(),
  })
  .strict();

export const updateConstructorSchema = z
  .object({
    type: z.literal('update_constructor'),
    file: z.string().min(1),
    class_name: z.string().min(1),
    changes: z
      .object({
        add_param: addParamSchema,
      })
      .strict(),
  })
  .strict();

export const renameSymbolSchema = z
  .object({
    type: z.literal('rename_symbol'),
    file: z.string().min(1),
    target: renameTargetSchema,
    newName: z.string().min(1),
  })
  .strict();

export const updateReturnTypeSchema = z
  .object({
    type: z.literal('update_return_type'),
    file: z.string().min(1),
    target: callableTargetSchema,
    returnType: z.string().min(1),
  })
  .strict();

export const updateParamTypeSchema = z
  .object({
    type: z.literal('update_param_type'),
    file: z.string().min(1),
    target: callableTargetSchema,
    paramName: z.string().min(1),
    paramType: z.string().min(1),
  })
  .strict();

export const updatePropertyTypeSchema = z
  .object({
    type: z.literal('update_property_type'),
    file: z.string().min(1),
    target: propertyTargetSchema,
    propertyType: z.string().min(1),
  })
  .strict();

export const replaceFunctionBodySchema = z
  .object({
    type: z.literal('replace_function_body'),
    file: z.string().min(1),
    target: callableTargetSchema,
    bodyText: z.string(),
  })
  .strict();

export const addInterfaceExtendsSchema = z
  .object({
    type: z.literal('add_interface_extends'),
    file: z.string().min(1),
    name: z.string().min(1),
    extends: z.string().min(1),
  })
  .strict();

export const removeInterfaceExtendsSchema = z
  .object({
    type: z.literal('remove_interface_extends'),
    file: z.string().min(1),
    name: z.string().min(1),
    extends: z.string().min(1),
  })
  .strict();

export const patchOperationSchema = z.discriminatedUnion('type', [
  updateFunctionSchema,
  updateInterfaceSchema,
  addImportSchema,
  removeImportSchema,
  updateConstructorSchema,
  renameSymbolSchema,
  updateReturnTypeSchema,
  updateParamTypeSchema,
  updatePropertyTypeSchema,
  replaceFunctionBodySchema,
  addInterfaceExtendsSchema,
  removeInterfaceExtendsSchema,
]);

export type UpdateFunctionOperation = z.infer<typeof updateFunctionSchema>;
export type UpdateInterfaceOperation = z.infer<typeof updateInterfaceSchema>;
export type AddImportOperation = z.infer<typeof addImportSchema>;
export type RemoveImportOperation = z.infer<typeof removeImportSchema>;
export type UpdateConstructorOperation = z.infer<typeof updateConstructorSchema>;
export type RenameSymbolOperation = z.infer<typeof renameSymbolSchema>;
export type UpdateReturnTypeOperation = z.infer<typeof updateReturnTypeSchema>;
export type UpdateParamTypeOperation = z.infer<typeof updateParamTypeSchema>;
export type UpdatePropertyTypeOperation = z.infer<typeof updatePropertyTypeSchema>;
export type ReplaceFunctionBodyOperation = z.infer<typeof replaceFunctionBodySchema>;
export type AddInterfaceExtendsOperation = z.infer<typeof addInterfaceExtendsSchema>;
export type RemoveInterfaceExtendsOperation = z.infer<typeof removeInterfaceExtendsSchema>;
export type PatchOperation = z.infer<typeof patchOperationSchema>;
