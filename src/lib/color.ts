/**
 * Conversões dos tokens de cor (canais "H S% L%" de src/styles/globals.css)
 * para os formatos que bibliotecas externas exigem (Monaco, pdf-lib). As cores
 * continuam nos tokens: aqui só se converte o valor lido em runtime.
 */

/** Cor em canais de 0 a 1. */
export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

/** Converte canais "H S% L%" em vermelho, verde e azul de 0 a 1. */
export function hslChannelsToRgb(channels: string): RgbColor {
  const [h = 0, s = 0, l = 0] = channels.replace(/%/g, '').trim().split(/\s+/).map(Number);
  const saturation = s / 100;
  const lightness = l / 100;
  const a = saturation * Math.min(lightness, 1 - lightness);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    return lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return { r: channel(0), g: channel(8), b: channel(4) };
}

/** Lê um token de cor do documento: os canais "H S% L%", sem a função de cor em volta. */
export function readColorToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
}
