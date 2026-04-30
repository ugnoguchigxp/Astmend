import { z } from 'zod';

export const codeUnitKindSchema = z.enum([
  'function',
  'class',
  'method',
  'constructor',
  'interface',
  'property',
  'type_alias',
  'enum',
  'variable',
]);

export const analyzeCodeUnitsOptionsSchema = z
  .object({
    kinds: z.array(codeUnitKindSchema).min(1).optional(),
    includeNonExported: z.boolean().optional(),
    includeMembers: z.boolean().optional(),
    includeTypeMetadata: z.boolean().optional(),
    includeAstHash: z.boolean().optional(),
  })
  .strict();

export const referenceTargetKindSchema = z.enum([
  'function',
  'interface',
  'class',
  'type_alias',
  'enum',
  'variable',
]);

export const referenceTargetSchema = z
  .object({
    kind: referenceTargetKindSchema,
    name: z.string().min(1),
  })
  .strict();

export type CodeUnitKind = z.infer<typeof codeUnitKindSchema>;
export type AnalyzeCodeUnitsOptions = z.infer<typeof analyzeCodeUnitsOptionsSchema>;
export type ReferenceTargetInput = z.infer<typeof referenceTargetSchema>;
