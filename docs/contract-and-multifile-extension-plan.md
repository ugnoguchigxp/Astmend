# Astmend 拡張計画: 契約強化 + マルチファイル適用

最終更新: 2026-05-12

この文書は、Astmend の次期拡張を以下 2 テーマに限定して実装可能な粒度で定義する。

1. 契約強化 (Contract Hardening)
2. マルチファイル適用 (Multi-file Apply)

本計画は、既存の AST コア責務を維持しつつ、呼び出し側連携の安定性と実運用での適用範囲を広げることを目的とする。

## 0. 前提と方針

### 対象範囲

- 対象リポジトリ: Astmend
- 主要対象:
  - `src/mcp/service.ts`
  - `src/mcp/results.ts`
  - `src/router.ts`
  - `src/schema/batch.ts` (または新規 schema)
  - `src/index.ts`
  - `test/*`

### 非対象

- 永続インデックス (SQLite など)
- LLM 提案機能そのものの内製化
- Web/API サーバー化

### 互換性方針

- 既存 API (`applyPatchToText`, `applyPatchFromFile`, `applyPatchBatchToText`, `applyPatchBatchFromFile`) は破壊しない。
- 既存 MCP ツール名と戻り値契約を維持し、拡張は追加 API で行う。

---

## 1. テーマA: 契約強化 (Contract Hardening)

### 1.1 目的

- 呼び出し側が Astmend の機能差分を機械判定できるようにする。
- エラー契約を揃え、リトライ/分岐条件を安定化する。
- パッチ適用前の入力検証を明示 API として提供する。

### 1.2 実装項目

#### A-1. Capabilities 契約の公開

- 新規型を追加:
  - `AstmendCapabilities`
  - `AstmendContractVersion`
- 返却内容:
  - `service`: `{ name, version }`
  - `contractVersion`: 文字列定数 (例: `2026-05-12`)
  - `operations`: `patchOperationSchema` の `type` 一覧
  - `tools`: MCP ツール名一覧
  - `features`: `batchSingleFile`, `batchMultiFile`, `referenceProject` 等の boolean

対象ファイル案:
- `src/mcp/service.ts`
- `src/index.ts`
- 必要なら `src/schema/contract.ts` 新規

#### A-2. Capabilities 取得 API の追加

- ライブラリ API:
  - `getAstmendCapabilities(): AstmendCapabilities`
- MCP ツール:
  - `get_capabilities`

対象ファイル案:
- `src/mcp/service.ts` (tool 追加)
- `src/index.ts` (export 追加)
- `test/mcp-service.test.ts` (tool 公開確認)

#### A-3. エラー契約の統一 (非破壊)

- `toToolErrorResult` の `structuredContent` に `code` を常時含める。
  - AstmendError: 既存 code 維持
  - generic Error: `INTERNAL_ERROR`
  - unknown: `UNKNOWN_ERROR`
- 既存 `message` は維持。

対象ファイル案:
- `src/mcp/results.ts`
- `test/mcp-results.test.ts`

#### A-4. 入力検証 API の追加

- 新規ライブラリ API:
  - `validatePatchOperation(input): { valid: boolean; errors?: string[] }`
  - `validatePatchBatchOperation(input): { valid: boolean; errors?: string[] }`
- 新規 MCP ツール:
  - `validate_patch_operation`
  - `validate_patch_batch_operation`

注: 実際の適用は行わず、schema 契約チェックのみを実施する。

対象ファイル案:
- `src/router.ts` (validator helper 追加)
- `src/mcp/service.ts` (tool 追加)
- `src/index.ts` (export 追加)
- `test/router.test.ts` または `test/contract.test.ts`

### 1.3 完了条件

- [ ] `get_capabilities` が service/contract/features を返す
- [ ] MCP エラー `structuredContent.code` が常時存在する
- [ ] validate 系 API/tool が追加され、apply 実行なしで schema 判定できる
- [ ] 既存 MCP ツールの契約互換テストが通る

---

## 2. テーマB: マルチファイル適用 (Multi-file Apply)

### 2.1 目的

- 複数ファイルにまたがる operation 群を、順序を保って 1 リクエストで適用できるようにする。
- 部分失敗時の停止制御と結果集約を、既存 `ApplyResponse` より詳細に扱えるようにする。

### 2.2 データ契約

#### B-1. 入力スキーマ

新規 schema (例: `patchProjectOperationSchema`) を追加:

- `operations: PatchOperation[]` (min 1)
- `stopOnReject?: boolean` (default `true`)
- `executionMode?: 'sequential'` (初期は sequential 固定)

ポイント:
- 既存 `patchBatchOperationSchema` は単一ファイル向けとして維持。
- operation 内の `file` をそのまま利用し、トップレベル `file` は持たない。

#### B-2. 返却スキーマ

新規レスポンス型 (例: `ApplyProjectResponse`) を追加:

- `success: boolean`
- `patchedFiles: string[]`
- `rejects: ApplyReject[]`
- `diagnostics: string[]`
- `diffByFile: Record<string, string>`
- `updatedTextByFile?: Record<string, string>`
- `operationResults: Array<{ index: number; file: string; success: boolean; changed: boolean }>`

### 2.3 実装項目

#### B-3. ライブラリ API 追加

- `applyPatchBatchFromProject(input): Promise<ApplyProjectResponse>`
  - 各 `operation.file` を遅延ロード
  - 同一ファイルへの複数 operation は、当該ファイルの最新テキストに連続適用
  - ファイルごとの最終 diff を `diffByFile` に格納

- `applyPatchBatchToFiles(input, sourceTextByFile): ApplyProjectResponse`
  - メモリ上で複数ファイル適用
  - テスト/呼び出し側 dry-run 用

#### B-4. 実行アルゴリズム (sequential)

1. 入力 schema を検証
2. `operations` を先頭から順に処理
3. `file` ごとに current text をキャッシュ
4. operation 失敗時:
   - `stopOnReject=true`: 全体停止
   - `stopOnReject=false`: 次 operation 継続
5. 最終的に file 単位で diff 集約

#### B-5. MCP ツール追加

- `apply_patch_batch_from_project`
- `apply_patch_batch_to_files`

対象ファイル案:
- `src/schema/batch.ts` (または `src/schema/projectBatch.ts` 新設)
- `src/router.ts`
- `src/mcp/service.ts`
- `src/index.ts`

### 2.4 テスト計画

追加テスト:

- `test/batch-project.test.ts` 新規
  - 複数ファイル成功ケース
  - 同一ファイル連続適用ケース
  - `stopOnReject=true/false` の分岐
  - 部分成功時の `patchedFiles` / `diffByFile` 検証

既存テスト更新:

- `test/mcp-service.test.ts`
  - 新規ツール公開確認
- 必要に応じて `test/contract.test.ts`
  - 返却契約の型・フィールド保証

### 2.5 完了条件

- [ ] 複数ファイル operation を 1 回で適用できる
- [ ] 失敗制御 (`stopOnReject`) が期待通りに機能する
- [ ] ファイル単位差分 (`diffByFile`) が返る
- [ ] 単一ファイル batch API と後方互換を維持する

---

## 3. 実装順序

### Phase 1: 契約強化

1. `AstmendCapabilities` と `get_capabilities`
2. MCP error `code` の統一
3. validate API/tool
4. テスト更新

### Phase 2: マルチファイル適用

1. schema と response 型追加
2. router 実装 (`applyPatchBatchFromProject`, `applyPatchBatchToFiles`)
3. MCP tool 追加
4. テスト追加

### Phase 3: 互換確認

1. 既存テスト全通
2. 新規契約テスト全通
3. README / `mcp/README.md` 更新 (公開面の差分反映)

---

## 4. 受け入れゲート

実装完了の判定は以下を必須とする。

- `npm run typecheck`
- `npm run test`
- `npm run check`
- `npm run build`

加えて、MCP 互換確認として以下を推奨する。

- `npm run mcp:start` の起動確認
- `createAstmendMcpService().tools` に新規 tool が含まれることを確認

---

## 5. リスクと対策

### リスク1: 契約変更によるクライアント破壊

- 対策:
  - 既存フィールドを削除しない
  - 追加フィールドは additive に限定
  - `mcp-service` 契約テストで退行を検知

### リスク2: マルチファイル適用時の順序依存バグ

- 対策:
  - 初期は `sequential` のみ
  - `operationResults` に index を残し、デバッグ可能にする

### リスク3: 部分失敗時の診断不足

- 対策:
  - `diagnostics` に `operation {index}` プレフィックスを必須化
  - `rejects` と `operationResults` の両方で追跡可能にする

---

## 6. この計画の出口

この 2 テーマ完了後、Astmend は次の状態になる。

- 呼び出し側が「何ができるか」を runtime で判定できる
- パッチ前検証を適用処理から分離できる
- 単一ファイル中心の運用から、実運用に近いマルチファイル適用へ進める
- 既存 API を壊さずに拡張可能な基盤が整う
