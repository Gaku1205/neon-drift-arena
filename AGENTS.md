# このリポジトリの注意（ゲーム）

- ゲームの本体は `src/`（`src/main.ts` が入口）。`index.html` は canvas を1枚置くだけ。`vite.config.ts` の `base: "./"` は exe（file://）で開くために要るので変えない
- exe は `electron/main.cjs` が `dist/index.html` を開く。`npm run dist` が Windows の exe（`release/*.exe`）を作る（GitHub の Windows のランナーで動く）
- 画面を撮る：`npm run build` のあと `node .github/scripts/shot.mjs --serve /`。遊んでいる途中の場面は、`/?scene=play` のように URL で直接開けるようにしておくと撮れる（`--steps` でキーを押してもよい）
- 音は Web Audio API で作る（外の音のファイルを読み込まない）
