# 日本語の書体の元（M PLUS 1）

- `MPLUS1-500.woff2`・`MPLUS1-700.woff2`：M PLUS 1（可変フォント `MPLUS1[wght].ttf`）から、太さ 500 と 700 を取り出した物。文字は全部入っている（1つ約 650KB）。ゲームには、このまま入れない
- `OFL.txt`：ライセンス（SIL Open Font License 1.1）。Copyright 2021 The M+ FONTS Project Authors（https://github.com/coz-m/MPLUS_FONTS）
- 元のファイル：https://github.com/google/fonts/tree/main/ofl/mplus1

ゲームに入れるのは、`npm run fonts`（`scripts/subset-fonts.mjs`）が作る `public/fonts/mplus1-500.woff2`・`mplus1-700.woff2`。
`src/` と `index.html` に出てくる日本語の文字と、かな・記号・英数字だけを抜き出した物で、`npm run build` と `npm run dev` の前に自動で作り直す
（文言を変えても、文字が抜けない）。`public/fonts/` は作られる物なので、git には入れない。
