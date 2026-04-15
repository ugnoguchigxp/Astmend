import { z } from 'zod';

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

export const patchOperationSchema = z.discriminatedUnion('type', [
  updateFunctionSchema,
  updateInterfaceSchema,
  addImportSchema,
  removeImportSchema,
  updateConstructorSchema,
  renameSymbolSchema,
]);

export type UpdateFunctionOperation = z.infer<typeof updateFunctionSchema>;
export type UpdateInterfaceOperation = z.infer<typeof updateInterfaceSchema>;
export type AddImportOperation = z.infer<typeof addImportSchema>;
export type RemoveImportOperation = z.infer<typeof removeImportSchema>;
export type UpdateConstructorOperation = z.infer<typeof updateConstructorSchema>;
export type RenameSymbolOperation = z.infer<typeof renameSymbolSchema>;
export type PatchOperation = z.infer<typeof patchOperationSchema>;
