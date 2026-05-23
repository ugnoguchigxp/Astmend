import { z } from 'zod';
import { createContextPacket } from '../context-packet/createContextPacket.js';
import { extractDbQueries } from '../context-packet/dbQueries.js';
import { extractRiskHints } from '../context-packet/riskHints.js';
import { extractRoutes } from '../context-packet/routes.js';
import {
  analyzeImportExportGraphFromFile,
  analyzeImportExportGraphFromProject,
} from '../engine/importExportGraph.js';
import {
  analyzeReferencesFromFile,
  analyzeReferencesFromProject,
  analyzeReferencesFromText,
  batchAnalyzeReferencesFromFile,
  batchAnalyzeReferencesFromProject,
  batchAnalyzeReferencesFromText,
  detectImpactFromFile,
  detectImpactFromText,
} from '../engine/references.js';
import {
  analyzeCodeUnitsFromFile,
  analyzeCodeUnitsFromProject,
  analyzeCodeUnitsFromText,
  resolveSymbolCandidatesFromFile,
  resolveSymbolCandidatesFromProject,
  resolveSymbolCandidatesFromText,
} from '../engine/scanner.js';
import {
  applyPatchBatchFromFile,
  applyPatchBatchFromProject,
  applyPatchBatchToFiles,
  applyPatchBatchToText,
  applyPatchFromFile,
  applyPatchToText,
  validatePatchBatchOperation,
  validatePatchOperation,
  validatePatchProjectOperation,
} from '../router.js';
import { analyzeCodeUnitsOptionsSchema, referenceTargetSchema } from '../schema/analysis.js';
import { patchOperationTypes } from '../schema/patch.js';
import { type ToolResult, toToolErrorResult, toToolSuccessResult } from './results.js';

const patchOperationInputSchema = z.record(z.string(), z.unknown());
const patchBatchOperationInputSchema = z.record(z.string(), z.unknown());
const patchProjectOperationInputSchema = z.record(z.string(), z.unknown());

const renameOperationInputSchema = z.object({
  type: z.literal('rename_symbol'),
  file: z.string().min(1),
  target: referenceTargetSchema,
  newName: z.string().min(1),
});

const batchAnalyzeReferencesInputSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('text'),
    sourceText: z.string(),
    targets: z.array(referenceTargetSchema).min(1),
    filePath: z.string().optional(),
  }),
  z.object({
    mode: z.literal('file'),
    filePath: z.string().min(1),
    targets: z.array(referenceTargetSchema).min(1),
  }),
  z.object({
    mode: z.literal('project'),
    projectRoot: z.string().min(1),
    entryFile: z.string().min(1),
    targets: z.array(referenceTargetSchema).min(1),
  }),
]);

const analyzeCodeUnitsFromTextInputSchema = z.object({
  sourceText: z.string(),
  filePath: z.string().optional(),
  options: analyzeCodeUnitsOptionsSchema.optional(),
});

const analyzeCodeUnitsFromFileInputSchema = z.object({
  filePath: z.string().min(1),
  options: analyzeCodeUnitsOptionsSchema.optional(),
});

const analyzeCodeUnitsFromProjectInputSchema = z.object({
  projectRoot: z.string().min(1),
  options: analyzeCodeUnitsOptionsSchema.optional(),
});

const resolveSymbolCandidatesFromTextInputSchema = z.object({
  sourceText: z.string(),
  target: referenceTargetSchema,
  filePath: z.string().optional(),
  options: analyzeCodeUnitsOptionsSchema.optional(),
});

const resolveSymbolCandidatesFromFileInputSchema = z.object({
  filePath: z.string().min(1),
  target: referenceTargetSchema,
  options: analyzeCodeUnitsOptionsSchema.optional(),
});

const resolveSymbolCandidatesFromProjectInputSchema = z.object({
  projectRoot: z.string().min(1),
  target: referenceTargetSchema,
  options: analyzeCodeUnitsOptionsSchema.optional(),
});

const analyzeImportExportGraphFromFileInputSchema = z.object({
  filePath: z.string().min(1),
});

const analyzeImportExportGraphFromProjectInputSchema = z.object({
  projectRoot: z.string().min(1),
});

const getContextInputSchema = z
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

const extractionInputSchema = z.object({
  repoRoot: z.string().min(1),
  files: z.array(z.string().min(1)).optional(),
});

type MaybePromise<T> = T | Promise<T>;

export type AstmendMcpToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  handler: (input: unknown) => MaybePromise<ToolResult>;
};

export type AstmendMcpService = {
  name: string;
  version: string;
  tools: readonly AstmendMcpToolDefinition[];
  callTool: (name: string, args: unknown) => Promise<ToolResult>;
};

export interface AstmendCapabilities {
  service: {
    name: string;
    version: string;
  };
  contractVersion: string;
  operations: string[];
  tools: string[];
  features: {
    batchSingleFile: boolean;
    batchMultiFile: boolean;
    referenceProject: boolean;
  };
}

const CONTRACT_VERSION = '2026-05-12';

const defineTool = <Schema extends z.ZodTypeAny>(definition: {
  name: string;
  title: string;
  description: string;
  inputSchema: Schema;
  handler: (input: z.infer<Schema>) => MaybePromise<ToolResult>;
}): AstmendMcpToolDefinition => ({
  ...definition,
  handler: definition.handler as (input: unknown) => MaybePromise<ToolResult>,
});

const tools = [
  defineTool({
    name: 'get_capabilities',
    title: 'Get Capabilities',
    description: 'Return Astmend service capabilities and contract metadata.',
    inputSchema: z.object({}).strict(),
    handler: () => {
      try {
        return toToolSuccessResult(getAstmendCapabilities());
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'validate_patch_operation',
    title: 'Validate Patch Operation',
    description: 'Validate a patch operation against the Astmend schema without applying it.',
    inputSchema: z.object({
      operation: patchOperationInputSchema,
    }),
    handler: ({ operation }) => {
      try {
        return toToolSuccessResult(validatePatchOperation(operation));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'validate_patch_batch_operation',
    title: 'Validate Patch Batch Operation',
    description:
      'Validate a single-file patch batch operation against the Astmend schema without applying it.',
    inputSchema: z.object({
      operation: patchBatchOperationInputSchema,
    }),
    handler: ({ operation }) => {
      try {
        return toToolSuccessResult(validatePatchBatchOperation(operation));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'validate_patch_project_operation',
    title: 'Validate Patch Project Operation',
    description:
      'Validate a multi-file patch batch operation against the Astmend schema without applying it.',
    inputSchema: z.object({
      operation: patchProjectOperationInputSchema,
    }),
    handler: ({ operation }) => {
      try {
        return toToolSuccessResult(validatePatchProjectOperation(operation));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'get_context',
    title: 'Get Context Packet',
    description: 'Build a context packet from repo diff and static analysis results.',
    inputSchema: getContextInputSchema,
    handler: async ({ repoRoot, base, head, diffFile, includeSourceExcerpt }) => {
      try {
        return toToolSuccessResult(
          await createContextPacket({
            repoRoot,
            ...(base ? { base } : {}),
            ...(head ? { head } : {}),
            ...(diffFile ? { diffFile } : {}),
            ...(typeof includeSourceExcerpt === 'boolean' ? { includeSourceExcerpt } : {}),
          }),
        );
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'extract_routes',
    title: 'Extract Routes',
    description: 'Extract Hono-like route definitions from project files.',
    inputSchema: extractionInputSchema,
    handler: async ({ repoRoot, files }) => {
      try {
        return toToolSuccessResult(await extractRoutes({ repoRoot, files }));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'extract_db_queries',
    title: 'Extract DB Queries',
    description: 'Extract Drizzle-like database query expressions.',
    inputSchema: extractionInputSchema,
    handler: async ({ repoRoot, files }) => {
      try {
        return toToolSuccessResult(await extractDbQueries({ repoRoot, files }));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'get_risk_hints',
    title: 'Get Risk Hints',
    description: 'Extract lightweight static-analysis review hints.',
    inputSchema: extractionInputSchema,
    handler: async ({ repoRoot, files }) => {
      try {
        return toToolSuccessResult(await extractRiskHints({ repoRoot, files }));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'analyze_code_units_from_text',
    title: 'Analyze Code Units From Text',
    description: 'List AST code units from source text.',
    inputSchema: analyzeCodeUnitsFromTextInputSchema,
    handler: ({ sourceText, filePath, options }) => {
      try {
        return toToolSuccessResult(analyzeCodeUnitsFromText(sourceText, options, filePath));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'analyze_code_units_from_file',
    title: 'Analyze Code Units From File',
    description: 'List AST code units from a file.',
    inputSchema: analyzeCodeUnitsFromFileInputSchema,
    handler: async ({ filePath, options }) => {
      try {
        return toToolSuccessResult(await analyzeCodeUnitsFromFile(filePath, options));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'analyze_code_units_from_project',
    title: 'Analyze Code Units From Project',
    description: 'List AST code units from a TypeScript project.',
    inputSchema: analyzeCodeUnitsFromProjectInputSchema,
    handler: async ({ projectRoot, options }) => {
      try {
        return toToolSuccessResult(await analyzeCodeUnitsFromProject(projectRoot, options));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'resolve_symbol_candidates_from_text',
    title: 'Resolve Symbol Candidates From Text',
    description: 'Resolve AST symbol candidates from source text.',
    inputSchema: resolveSymbolCandidatesFromTextInputSchema,
    handler: ({ sourceText, target, filePath, options }) => {
      try {
        return toToolSuccessResult(
          resolveSymbolCandidatesFromText(sourceText, target, options, filePath),
        );
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'resolve_symbol_candidates_from_file',
    title: 'Resolve Symbol Candidates From File',
    description: 'Resolve AST symbol candidates from a file.',
    inputSchema: resolveSymbolCandidatesFromFileInputSchema,
    handler: async ({ filePath, target, options }) => {
      try {
        return toToolSuccessResult(
          await resolveSymbolCandidatesFromFile(filePath, target, options),
        );
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'resolve_symbol_candidates_from_project',
    title: 'Resolve Symbol Candidates From Project',
    description: 'Resolve AST symbol candidates from a TypeScript project.',
    inputSchema: resolveSymbolCandidatesFromProjectInputSchema,
    handler: async ({ projectRoot, target, options }) => {
      try {
        return toToolSuccessResult(
          await resolveSymbolCandidatesFromProject(projectRoot, target, options),
        );
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'analyze_import_export_graph_from_file',
    title: 'Analyze Import Export Graph From File',
    description: 'Analyze import and export declarations from a file.',
    inputSchema: analyzeImportExportGraphFromFileInputSchema,
    handler: async ({ filePath }) => {
      try {
        return toToolSuccessResult(await analyzeImportExportGraphFromFile(filePath));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'analyze_import_export_graph_from_project',
    title: 'Analyze Import Export Graph From Project',
    description: 'Analyze import and export declarations from a TypeScript project.',
    inputSchema: analyzeImportExportGraphFromProjectInputSchema,
    handler: async ({ projectRoot }) => {
      try {
        return toToolSuccessResult(await analyzeImportExportGraphFromProject(projectRoot));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'apply_patch_to_text',
    title: 'Apply Patch To Text',
    description: 'Apply an Astmend patch operation to source text in memory.',
    inputSchema: z.object({
      operation: patchOperationInputSchema,
      sourceText: z.string(),
    }),
    handler: ({ operation, sourceText }) => {
      try {
        return toToolSuccessResult(applyPatchToText(operation, sourceText));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'apply_patch_from_file',
    title: 'Apply Patch From File',
    description:
      'Apply an Astmend patch operation to a file. This does not write to disk and only returns diff and updated text.',
    inputSchema: z.object({
      operation: patchOperationInputSchema,
    }),
    handler: async ({ operation }) => {
      try {
        return toToolSuccessResult(await applyPatchFromFile(operation));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'apply_patch_batch_to_text',
    title: 'Apply Patch Batch To Text',
    description: 'Apply multiple Astmend patch operations to source text in memory.',
    inputSchema: z.object({
      operation: patchBatchOperationInputSchema,
      sourceText: z.string(),
    }),
    handler: ({ operation, sourceText }) => {
      try {
        return toToolSuccessResult(applyPatchBatchToText(operation, sourceText));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'apply_patch_batch_from_file',
    title: 'Apply Patch Batch From File',
    description:
      'Apply multiple Astmend patch operations to a file. This does not write to disk and only returns diff and updated text.',
    inputSchema: z.object({
      operation: patchBatchOperationInputSchema,
    }),
    handler: async ({ operation }) => {
      try {
        return toToolSuccessResult(await applyPatchBatchFromFile(operation));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'apply_patch_batch_to_files',
    title: 'Apply Patch Batch To Files',
    description: 'Apply multiple Astmend patch operations to multiple source texts in memory.',
    inputSchema: z.object({
      operation: patchProjectOperationInputSchema,
      sourceTextByFile: z.record(z.string(), z.string()),
    }),
    handler: async ({ operation, sourceTextByFile }) => {
      try {
        return toToolSuccessResult(await applyPatchBatchToFiles(operation, sourceTextByFile));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'apply_patch_batch_from_project',
    title: 'Apply Patch Batch From Project',
    description:
      'Apply multiple Astmend patch operations across multiple files in a project. This does not write to disk and only returns per-file diffs and updated text.',
    inputSchema: z.object({
      operation: patchProjectOperationInputSchema,
    }),
    handler: async ({ operation }) => {
      try {
        return toToolSuccessResult(await applyPatchBatchFromProject(operation));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'analyze_references_from_text',
    title: 'Analyze References From Text',
    description: 'Analyze references and impacted declarations in source text.',
    inputSchema: z.object({
      sourceText: z.string(),
      target: referenceTargetSchema,
      filePath: z.string().optional(),
    }),
    handler: ({ sourceText, target, filePath }) => {
      try {
        return toToolSuccessResult(analyzeReferencesFromText(sourceText, target, filePath));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'analyze_references_from_file',
    title: 'Analyze References From File',
    description: 'Analyze references and impacted declarations in a file.',
    inputSchema: z.object({
      filePath: z.string().min(1),
      target: referenceTargetSchema,
    }),
    handler: async ({ filePath, target }) => {
      try {
        return toToolSuccessResult(await analyzeReferencesFromFile(filePath, target));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'detect_impact_from_text',
    title: 'Detect Impact From Text',
    description: 'Detect impacted declarations from source text.',
    inputSchema: z.object({
      sourceText: z.string(),
      target: referenceTargetSchema,
      filePath: z.string().optional(),
    }),
    handler: ({ sourceText, target, filePath }) => {
      try {
        return toToolSuccessResult(detectImpactFromText(sourceText, target, filePath));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'detect_impact_from_file',
    title: 'Detect Impact From File',
    description: 'Detect impacted declarations from a file.',
    inputSchema: z.object({
      filePath: z.string().min(1),
      target: referenceTargetSchema,
    }),
    handler: async ({ filePath, target }) => {
      try {
        return toToolSuccessResult(await detectImpactFromFile(filePath, target));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'batch_analyze_references_from_text',
    title: 'Batch Analyze References From Text',
    description:
      'Analyze references and impacted declarations for multiple targets in source text.',
    inputSchema: z.object({
      sourceText: z.string(),
      targets: z.array(referenceTargetSchema).min(1),
      filePath: z.string().optional(),
    }),
    handler: ({ sourceText, targets, filePath }) => {
      try {
        return toToolSuccessResult(batchAnalyzeReferencesFromText(sourceText, targets, filePath));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'batch_analyze_references',
    title: 'Batch Analyze References',
    description: 'Analyze references and impacted declarations for multiple targets.',
    inputSchema: batchAnalyzeReferencesInputSchema,
    handler: async (input) => {
      try {
        switch (input.mode) {
          case 'text':
            return toToolSuccessResult(
              batchAnalyzeReferencesFromText(input.sourceText, input.targets, input.filePath),
            );
          case 'file':
            return toToolSuccessResult(
              await batchAnalyzeReferencesFromFile(input.filePath, input.targets),
            );
          case 'project':
            return toToolSuccessResult(
              await batchAnalyzeReferencesFromProject(
                input.projectRoot,
                input.entryFile,
                input.targets,
              ),
            );
        }
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'batch_analyze_references_from_file',
    title: 'Batch Analyze References From File',
    description: 'Analyze references and impacted declarations for multiple targets in a file.',
    inputSchema: z.object({
      filePath: z.string().min(1),
      targets: z.array(referenceTargetSchema).min(1),
    }),
    handler: async ({ filePath, targets }) => {
      try {
        return toToolSuccessResult(await batchAnalyzeReferencesFromFile(filePath, targets));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'analyze_references_from_project',
    title: 'Analyze References From Project',
    description: 'Analyze references and impacted declarations across a TypeScript project.',
    inputSchema: z.object({
      projectRoot: z.string().min(1),
      entryFile: z.string().min(1),
      target: referenceTargetSchema,
    }),
    handler: async ({ projectRoot, entryFile, target }) => {
      try {
        return toToolSuccessResult(
          await analyzeReferencesFromProject(projectRoot, entryFile, target),
        );
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'batch_analyze_references_from_project',
    title: 'Batch Analyze References From Project',
    description:
      'Analyze references and impacted declarations for multiple targets across a TypeScript project.',
    inputSchema: z.object({
      projectRoot: z.string().min(1),
      entryFile: z.string().min(1),
      targets: z.array(referenceTargetSchema).min(1),
    }),
    handler: async ({ projectRoot, entryFile, targets }) => {
      try {
        return toToolSuccessResult(
          await batchAnalyzeReferencesFromProject(projectRoot, entryFile, targets),
        );
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'rename_symbol_from_text',
    title: 'Rename Symbol From Text',
    description: 'Rename a symbol and its references in source text.',
    inputSchema: z.object({
      operation: renameOperationInputSchema,
      sourceText: z.string(),
    }),
    handler: ({ operation, sourceText }) => {
      try {
        return toToolSuccessResult(applyPatchToText(operation, sourceText));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
  defineTool({
    name: 'rename_symbol_from_file',
    title: 'Rename Symbol From File',
    description: 'Rename a symbol and its references in a file.',
    inputSchema: z.object({
      operation: renameOperationInputSchema,
    }),
    handler: async ({ operation }) => {
      try {
        return toToolSuccessResult(await applyPatchFromFile(operation));
      } catch (error) {
        return toToolErrorResult(error);
      }
    },
  }),
] as const;

export const getAstmendCapabilities = (): AstmendCapabilities => ({
  service: {
    name: 'astmend-mcp',
    version: '0.1.0',
  },
  contractVersion: CONTRACT_VERSION,
  operations: [...patchOperationTypes],
  tools: tools.map((tool) => tool.name),
  features: {
    batchSingleFile: true,
    batchMultiFile: true,
    referenceProject: true,
  },
});

export const createAstmendMcpService = (): AstmendMcpService => {
  const toolMap = new Map(tools.map((tool) => [tool.name, tool]));

  return {
    name: 'astmend-mcp',
    version: '0.1.0',
    tools,
    async callTool(name, args) {
      const tool = toolMap.get(name);

      if (!tool) {
        return toToolErrorResult(new Error(`Unknown Astmend MCP tool: ${name}`));
      }

      const parsedArgs = tool.inputSchema.safeParse(args);
      if (!parsedArgs.success) {
        return toToolErrorResult(parsedArgs.error);
      }

      return tool.handler(parsedArgs.data);
    },
  };
};
