# Astmend MCP

このプロジェクトは `stdio` 方式の MCP サーバーとして利用できます。

## 結論

- 常駐サーバーは必須ではありません。
- MCP クライアントが必要時にプロセス起動する `stdio` 実行方式で運用可能です。

## セットアップ

1. 依存をインストールする。

```bash
npm install
```

2. サーバーをビルドする。

```bash
npm run build
```

3. ローカル確認する。

```bash
npm run mcp:start
```

開発中は `npm run mcp:dev` を使えます。

## 登録例

登録フォーマットは MCP クライアントにより異なるため、まずは `mcp/config.example.json` の形式をベースに設定してください。

ポイント:

- `command` は `node`
- `args` は `dist/mcp/server.js` の絶対パス
- `cwd` はこのリポジトリの絶対パス

## 提供ツール

- `apply_patch_to_text`
- `apply_patch_from_file`
- `analyze_references_from_text`
- `analyze_references_from_file`
- `analyze_references_from_project`
- `batch_analyze_references`
- `batch_analyze_references_from_text`
- `batch_analyze_references_from_file`
- `batch_analyze_references_from_project`
- `detect_impact_from_text`
- `detect_impact_from_file`
- `rename_symbol_from_text`
- `rename_symbol_from_file`

## 運用メモ

- 低頻度呼び出しなら `stdio` 実行で十分です。
- 高頻度で起動コストが目立つ場合のみ、常駐化やプロセスマネージャ導入を検討してください。

