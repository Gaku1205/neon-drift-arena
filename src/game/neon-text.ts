import { GLYPH_H, GLYPH_W, glyphFor, textUnits } from "../lib/glyphs";

export interface NeonTextOptions {
  /** 字の高さ（px） */
  size: number;
  color: string;
  /** 字の間（字の幅に対する割合。0.5 なら字幅の半分） */
  spacing?: number;
  align?: "left" | "center" | "right";
  /** 線の太さ（字の高さに対する割合） */
  weight?: number;
  /** 芯（白い細い線）を重ねる */
  core?: boolean;
  alpha?: number;
  /** 斜め（ラジアン相当の傾き。0.15 くらい） */
  skew?: number;
}

/** 線の字（ネオン管）で文字を描く。英字・数字・一部の記号だけ */
export function neonText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, o: NeonTextOptions): number {
  const unit = o.size / GLYPH_H;
  const spacing = (o.spacing ?? 0.5) * GLYPH_W;
  const width = textUnits(text, spacing) * unit;
  let cx = x;
  if (o.align === "center") cx = x - width / 2;
  else if (o.align === "right") cx = x - width;
  const weight = Math.max(1, o.size * (o.weight ?? 0.09));
  const skew = o.skew ?? 0;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = o.alpha ?? 1;
  const path = new Path2D();
  let gx = cx;
  for (const ch of text) {
    for (const line of glyphFor(ch)) {
      for (let i = 0; i < line.length; i += 2) {
        const ly = (line[i + 1] ?? 0) * unit;
        const px = gx + (line[i] ?? 0) * unit - skew * (ly - o.size);
        const py = y + ly;
        if (i === 0) path.moveTo(px, py);
        else path.lineTo(px, py);
      }
    }
    gx += (GLYPH_W + spacing) * unit;
  }
  ctx.strokeStyle = o.color;
  ctx.lineWidth = weight;
  ctx.stroke(path);
  if (o.core !== false) {
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = Math.max(1, weight * 0.38);
    ctx.stroke(path);
  }
  ctx.restore();
  return width;
}

/** 線の字の幅（px） */
export function neonTextWidth(text: string, size: number, spacing = 0.5): number {
  return textUnits(text, spacing * GLYPH_W) * (size / GLYPH_H);
}
