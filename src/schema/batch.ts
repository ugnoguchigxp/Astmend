import { z } from 'zod';
import { patchOperationSchema } from './patch.js';

export const patchBatchOperationSchema = z
  .object({
    file: z.string().min(1),
    operations: z.array(patchOperationSchema).min(1),
    stopOnReject: z.boolean().optional(),
  })
  .strict();

export const patchProjectExecutionModeSchema = z.enum(['sequential']);

export const patchProjectOperationSchema = z
  .object({
    operations: z.array(patchOperationSchema).min(1),
    stopOnReject: z.boolean().optional(),
    executionMode: patchProjectExecutionModeSchema.optional(),
  })
  .strict();

export type PatchBatchOperation = z.infer<typeof patchBatchOperationSchema>;
export type PatchProjectExecutionMode = z.infer<typeof patchProjectExecutionModeSchema>;
export type PatchProjectOperation = z.infer<typeof patchProjectOperationSchema>;
