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
- 透明性: `changed` と `diff` で変更有無と内容が一目でわかる
- 拡張性: 操作単位（`update_function` など）で機能を段階追加できる
- 運用性: MCP は `stdio` 実行に対応し、常駐サーバーなしで導入可能

## 現在の主な機能

- パッチ適用
  - `update_function`（関数パラメータ追加）
  - `update_interface`（interface プロパティ追加）
  - `add_import`
  - `remove_import`
  - `update_constructor`（constructor パラメータ追加）
- 解析
  - 参照解析（`analyzeReferences*`）
  - 影響範囲検出（`detectImpact*`）
- 入力検証
  - Zod スキーマによる命令バリデーション
  - 不正入力時の明確な `AstmendError` 返却

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

console.log(result.changed); // true / false
console.log(result.diff);    // unified diff
console.log(result.updatedText);
```

## MCP として使う

`stdio` 方式の MCP サーバーを同梱しています。低頻度利用なら常駐化は不要です。

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
  mcp/      # MCP サーバー実装
```

## ライセンス

[MIT](./LICENSE)
