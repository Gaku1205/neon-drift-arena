/** 色は docs/design.md の表だけを使う。ここがその写し */
export const COLOR = {
  bg: "#07060f",
  floor: "#0b0a1a",
  grid: "#2b2470",
  gridHot: "#6a5cff",
  border: "#5b4dff",
  player: "#3ef2ff",
  playerCore: "#e8feff",
  enemyBullet: "#ff3fb4",
  enemyBulletCore: "#ffffff",
  drifter: "#ff2e88",
  darter: "#ffb020",
  splitter: "#9dff3c",
  turret: "#a46bff",
  guardian: "#ff4d5e",
  shard: "#ffd84a",
  text: "#f2f0ff",
  textSub: "#a9a3d6",
  textDim: "#6c6699",
  danger: "#ff4d5e",
  white: "#ffffff",
} as const;

/** 画面の文字の書体（日本語）。Windows の書体を先に */
export const JP_FONT = '"Yu Gothic UI", "Yu Gothic", "Meiryo", "Noto Sans JP", "Noto Sans CJK JP", "Hiragino Sans", sans-serif';

/** 闘技場の大きさ（論理座標） */
export const ARENA_W = 1600;
export const ARENA_H = 900;
