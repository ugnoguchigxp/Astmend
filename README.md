# Astmend

**Astmend は、TypeScript コードを AST ベースで安全に変更する Semantic Patch Engine です。**  
文字列置換ではなく構文木を使って変更することで、LLM 連携時の「壊れた修正」を減らし、変更差分を明確に返します。

## このプロジェクトの趣旨

Astmend は「コード編集をテキスト処理から構造処理へ移す」ための基盤です。  
目的は、**自動修正の信頼性・再現性・監査性**を上げることです。

- 構文を壊しにくい変更を行う
- JSON 命令で操作を明示化する
- 変更結果を diff で可視化する
- ファイルへ直接保存せず、適用判断を呼び出し側に委ねる

## メリット

- 安全性: AST 操作で文字列編集由来の崩れを回避
- 冪等性: 同じ命令を再実行しても不要な変更を出しにくい設計
- 透明性: `success`, `patchedFiles`, `diff` で変更有無と内容が一目でわかる
- 拡張性: 操作単位（`update_function` など）で機能を段階追加できる
- 運用性: MCP は `stdio` 実行に対応し、常駐サーバーなしで導入可能

## 現在の主な機能

- パッチ適用
  - `update_function`（関数パラメータ追加）
  - `rename_symbol`（同一ファイル内のシンボル名変更）
  - `update_interface`（interface プロパティ追加）
  - `add_import`
  - `remove_import`
  - `update_constructor`（constructor パラメータ追加）
  - `update_return_type`
  - `update_param_type`
  - `update_property_type`
  - `replace_function_body`
  - `add_interface_extends`
  - `remove_interface_extends`
  - 単一ファイル内 batch apply
  - 複数ファイル batch apply (`applyPatchBatchToFiles`, `applyPatchBatchFromProject`)
- 解析
  - CodeUnit Scanner（関数・class・interface・type alias・enum・変数・メンバーの一覧化）
  - Symbol Candidate 解決
  - Type metadata 抽出
  - AST fingerprint 生成
  - import/export graph 解析
  - 参照解析（`analyzeReferences*`）
  - バッチ参照解析（`batchAnalyzeReferences*`）
  - プロジェクト横断参照解析（`analyzeReferencesFromProject`）
  - 影響範囲検出（`detectImpact*`）
  - export 情報の付与（`isExported`, `exportKind`）
- 入力検証
  - Zod スキーマによる命令バリデーション
  - operation/batch の事前検証 API (`validatePatchOperation*`)
  - 構造化された診断情報の返却 (`ApplyResponse`)
  - capabilities 契約取得 (`getAstmendCapabilities`)

## 非ゴール（このリポジトリがやらないこと）

- Web フレームワークの提供
- 自動ファイル保存の強制
- UI の提供

## クイックスタート

```bash
npm install
npm run check
```

開発時:

```bash
npm run test:watch
```

## OSS 向けの補助ファイル

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- [SECURITY.md](./SECURITY.md)
- [CHANGELOG.md](./CHANGELOG.md)

## 使い方（ライブラリ）

```ts
import { applyPatchToText } from 'astmend';

const source = `function getUser(id: string) { return id }`;

const result = applyPatchToText(
  {
    type: 'update_function',
    file: 'src/userService.ts',
    name: 'getUser',
    changes: {
      add_param: { name: 'includeDeleted', type: 'boolean' },
    },
  },
  source,
);

console.log(result.success);      // true / false
console.log(result.patchedFiles); // ['src/userService.ts'] (変更があった場合)
console.log(result.diff);         // unified diff
console.log(result.updatedText);
```

### CodeUnit Scanner

```ts
import { analyzeCodeUnitsFromText } from 'astmend';

const units = analyzeCodeUnitsFromText(source, {
  includeMembers: true,
  includeTypeMetadata: true,
  includeAstHash: true,
});

console.log(units[0]?.id);
console.log(units[0]?.typeMetadata);
console.log(units[0]?.astHash);
```

### Import / Export Graph

```ts
import { analyzeImportExportGraphFromProject } from 'astmend';

const graph = await analyzeImportExportGraphFromProject('/path/to/project');
console.log(graph.files[0]?.imports);
console.log(graph.files[0]?.exports);
```

### Batch Apply

```ts
import { applyPatchBatchToText } from 'astmend';

const result = applyPatchBatchToText(
  {
    file: 'src/userService.ts',
    operations: [
      {
        type: 'add_import',
        file: 'src/userService.ts',
        module: './types',
        named: [{ name: 'User' }],
      },
      {
        type: 'update_return_type',
        file: 'src/userService.ts',
        target: { kind: 'function', name: 'getUser' },
        returnType: 'User',
      },
    ],
  },
  source,
);

console.log(result.diff);
```

### Multi-file Batch Apply

```ts
import { applyPatchBatchToFiles } from 'astmend';

const result = await applyPatchBatchToFiles(
  {
    operations: [
      {
        type: 'update_function',
        file: 'src/user.ts',
        name: 'getUser',
        changes: { add_param: { name: 'activeOnly', type: 'boolean' } },
      },
      {
        type: 'update_interface',
        file: 'src/types.ts',
        name: 'User',
        changes: { add_property: { name: 'active', type: 'boolean' } },
      },
    ],
  },
  {
    'src/user.ts': `export function getUser(id: string) { return id }`,
    'src/types.ts': `export interface User { id: string }`,
  },
);

console.log(result.patchedFiles);
console.log(result.diffByFile);
```

### Capabilities / Validation

```ts
import {
  getAstmendCapabilities,
  validatePatchBatchOperation,
  validatePatchOperation,
} from 'astmend';

console.log(getAstmendCapabilities().tools);
console.log(validatePatchOperation({ type: 'update_function' })); // { valid: false, ... }
console.log(validatePatchBatchOperation({ file: 'a.ts', operations: [] })); // { valid: false, ... }
```

### 失敗時のレスポンス

失敗時は `success: false` となり、`rejects` に詳細な理由が含まれます。

```json
{
  "success": false,
  "patchedFiles": [],
  "rejects": [
    {
      "path": "src/userService.ts",
      "reason": "SYMBOL_NOT_FOUND"
    }
  ],
  "diagnostics": ["Function not found: getUser"],
  "diff": ""
}
```

#### 主な失敗理由 (reason)
1. `SYMBOL_NOT_FOUND`: 対象の関数やインターフェースが見つからない
2. `INVALID_PATCH_SCHEMA`: パッチ命令の形式が不正
3. `FILE_NOT_FOUND`: 対象ファイルが存在しない
4. `CONFLICT`: 既に対象の変更が存在する、または曖昧な対象指定
5. `UNKNOWN`: その他の予期せぬエラー

## MCP として使う

Astmend の MCP ツールは、共有 MCP ホストから in-process service として読み込めます。
通常のローカル実行では、長時間動く Astmend 専用 stdio プロセスではなく、共有ホスト側から
`createAstmendMcpService()` を import して使う構成を推奨します。

```ts
import { createAstmendMcpService } from 'astmend';

const service = createAstmendMcpService();
const result = await service.callTool('analyze_code_units_from_file', {
  filePath: '/path/to/source.ts',
  options: { includeTypeMetadata: true },
});
```

開発・互換性確認用に `stdio` 方式の MCP サーバーも同梱しています。

```bash
npm run build
npm run mcp:start
```

開発時:

```bash
npm run mcp:dev
```

詳細は [`mcp/README.md`](./mcp/README.md) を参照してください。

## 開発コマンド

- `npm run format` / `npm run format:check`
- `npm run lint` / `npm run lint:fix`
- `npm run typecheck`
- `npm run test`
- `npm run check`（format/lint/typecheck/test の一括）

## プロジェクト構成

```text
src/
  schema/   # パッチ命令の Zod スキーマ
  engine/   # 共通基盤（project/diff/guards/references/errors）
  ops/      # AST 操作単位の実装
  router.ts # 命令を解釈して操作へルーティング
  index.ts  # 公開 API
  mcp/      # MCP service と stdio アダプター
```

## ライセンス

[MIT](./LICENSE)
