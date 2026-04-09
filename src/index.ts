export { AstmendError, isAstmendError } from './engine/errors.js';
export { loadSourceDocumentFromFile, loadSourceDocumentFromText } from './engine/project.js';
export { createPatchDiff } from './engine/diff.js';
export {
  analyzeReferences,
  analyzeReferencesFromFile,
  analyzeReferencesFromText,
  detectImpactFromFile,
  detectImpactFromText,
  type ImpactedDeclaration,
  type ReferenceAnalysis,
  type ReferenceLocation,
  type ReferenceTarget,
  type ReferenceTargetKind,
} from './engine/references.js';
export { addImport } from './ops/addImport.js';
export { removeImport } from './ops/removeImport.js';
export { updateConstructor } from './ops/updateConstructor.js';
export {
  addImportSchema,
  patchOperationSchema,
  removeImportSchema,
  updateConstructorSchema,
  updateFunctionSchema,
  updateInterfaceSchema,
  type AddImportOperation,
  type PatchOperation,
  type RemoveImportOperation,
  type UpdateConstructorOperation,
  type UpdateFunctionOperation,
  type UpdateInterfaceOperation,
} from './schema/patch.js';
export { applyPatchFromFile, applyPatchToText, parsePatchOperation } from './router.js';
