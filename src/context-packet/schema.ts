import { z } from 'zod';

export const CONTEXT_PACKET_SCHEMA_VERSION = '0.1.0';

export const contextWarningSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  file: z.string().min(1).optional(),
  details: z.string().min(1).optional(),
});

export type ContextWarning = z.infer<typeof contextWarningSchema>;

export const changedRangeInfoSchema = z.object({
  beforeStart: z.number().int().nonnegative(),
  beforeLines: z.number().int().nonnegative(),
  afterStart: z.number().int().nonnegative(),
  afterLines: z.number().int().nonnegative(),
});

export type ChangedRangeInfo = z.infer<typeof changedRangeInfoSchema>;

export const changedFileInfoSchema = z.object({
  file: z.string().min(1),
  changeKind: z.enum(['modified', 'added', 'deleted', 'renamed']),
  oldPath: z.string().min(1).optional(),
  newPath: z.string().min(1).optional(),
  isBinary: z.boolean().default(false),
  ranges: z.array(changedRangeInfoSchema),
});

export type ChangedFileInfo = z.infer<typeof changedFileInfoSchema>;

export const contextChangedSymbolSchema = z.object({
  kind: z.enum([
    'function',
    'class',
    'method',
    'constructor',
    'interface',
    'property',
    'type_alias',
    'enum',
    'variable',
  ]),
  name: z.string().min(1),
  changeKind: z.enum(['added', 'modified', 'removed']),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
  file: z.string().min(1),
  isExported: z.boolean(),
  exportKind: z.enum(['named', 'default']).nullable(),
});

export type ContextChangedSymbol = z.infer<typeof contextChangedSymbolSchema>;

export const routeInfoSchema = z.object({
  file: z.string().min(1),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
  method: z.enum(['get', 'post', 'put', 'patch', 'delete']),
  path: z.string().min(1).nullable(),
  pathParams: z.array(z.string().min(1)),
  handlerName: z.string().min(1).nullable(),
  middlewareLikeArgs: z.array(z.string().min(1)),
});

export type RouteInfo = z.infer<typeof routeInfoSchema>;

export const dbQueryInfoSchema = z.object({
  file: z.string().min(1),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
  operation: z.enum(['query', 'select', 'insert', 'update', 'delete', 'raw_sql']),
  tableLikeName: z.string().min(1).nullable(),
  whereLikeText: z.string().min(1).nullable(),
  isRawSql: z.boolean(),
  enclosingSymbol: z.string().min(1).nullable(),
});

export type DbQueryInfo = z.infer<typeof dbQueryInfoSchema>;

export const callRelationInfoSchema = z.object({
  file: z.string().min(1),
  fromSymbol: z.string().min(1).nullable(),
  toExpression: z.string().min(1),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
});

export type CallRelationInfo = z.infer<typeof callRelationInfoSchema>;

export const riskHintInfoSchema = z.object({
  kind: z.enum([
    'id-parameter',
    'auth-middleware-not-detected',
    'id-only-query',
    'raw-sql',
    'external-fetch',
    'file-system-access',
    'admin-like-route',
    'delete-operation',
    'update-operation',
  ]),
  severity: z.enum(['info', 'low', 'medium']),
  file: z.string().min(1),
  line: z.number().int().positive(),
  evidence: z.string().min(1),
  reason: z.string().min(1),
});

export type RiskHintInfo = z.infer<typeof riskHintInfoSchema>;

export const sourceExcerptInfoSchema = z.object({
  file: z.string().min(1),
  line: z.number().int().positive(),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  excerpt: z.string(),
});

export type SourceExcerptInfo = z.infer<typeof sourceExcerptInfoSchema>;

export const extractionResultSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    warnings: z.array(contextWarningSchema),
  });

export type ExtractionResult<T> = {
  items: T[];
  warnings: ContextWarning[];
};

export const contextPacketSchema = z.object({
  schemaVersion: z.literal(CONTEXT_PACKET_SCHEMA_VERSION),
  project: z.object({
    name: z.string().min(1),
    detectedStack: z.array(z.string().min(1)),
  }),
  diff: z.object({
    base: z.string().nullable(),
    head: z.string().nullable(),
    changedFiles: z.array(changedFileInfoSchema),
  }),
  changedSymbols: z.array(contextChangedSymbolSchema),
  routes: z.array(routeInfoSchema),
  dbQueries: z.array(dbQueryInfoSchema),
  callRelations: z.array(callRelationInfoSchema),
  riskHints: z.array(riskHintInfoSchema),
  recommendedSkills: z.array(z.string().min(1)),
  warnings: z.array(contextWarningSchema),
  sourceExcerpts: z.array(sourceExcerptInfoSchema).optional(),
});

export type ContextPacket = z.infer<typeof contextPacketSchema>;

export const contextOptionsSchema = z
  .object({
    repoRoot: z.string().min(1),
    base: z.string().min(1).optional(),
    head: z.string().min(1).optional(),
    diffFile: z.string().min(1).optional(),
    includeSourceExcerpt: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    if (value.diffFile && (value.base || value.head)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'diffFile cannot be combined with base/head.',
      });
    }
  });

export type ContextOptions = z.infer<typeof contextOptionsSchema>;

export const validateContextPacket = (value: unknown): ContextPacket =>
  contextPacketSchema.parse(value);
export const validateContextOptions = (value: unknown): ContextOptions =>
  contextOptionsSchema.parse(value);
