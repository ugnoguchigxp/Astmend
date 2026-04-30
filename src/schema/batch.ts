import { z } from 'zod';
import { patchOperationSchema } from './patch.js';

export const patchBatchOperationSchema = z
  .object({
    file: z.string().min(1),
    operations: z.array(patchOperationSchema).min(1),
    stopOnReject: z.boolean().optional(),
  })
  .strict();

export type PatchBatchOperation = z.infer<typeof patchBatchOperationSchema>;
