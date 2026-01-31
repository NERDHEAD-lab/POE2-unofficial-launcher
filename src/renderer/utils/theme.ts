import { logger } from "./logger";

export interface ThemeColors {
  text: string;
  accent: string;
  footer: string;
}

// Helper: RGB to HSL
export function rgbToHsl(r: number, g: number, b: number) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0;
  let s: number;
  const l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h * 360, s, l];
}

// Helper: HSL to Hex
export function hslToHex(h: number, s: number, l: number) {
  l /= 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Helper: Simple Hash for ImageData (DJB2)
export function hashImageData(data: Uint8ClampedArray): string {
  let hash = 5381;
  for (let i = 0; i < data.length; i++) {
    // Force unsigned 32-bit integer for consistent hex string
    hash = ((hash << 5) + hash + data[i]) >>> 0;
  }
  return hash.toString(16);
}

// Extract Theme Colors from Image
export async function extractThemeColors(
  imageUrl: string,
  fallback: { text: string; accent: string; footer: string },
): Promise<{ colors: ThemeColors; hash: string }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = imageUrl;
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return resolve({ colors: fallback, hash: "error" });

      // 1. Get Hash from small sample (faster than full image)
      canvas.width = 10;
      canvas.height = 10;
      ctx.drawImage(img, 0, 0, 10, 10);
      const hashData = ctx.getImageData(0, 0, 10, 10).data;
      const hash = hashImageData(hashData);

      // 2. Extract Average Color
      canvas.width = 1;
      canvas.height = 1;
      ctx.drawImage(img, 0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;

      const [h, s, l] = rgbToHsl(r, g, b);

      const accentS = Math.max(s * 100, 50);
      const accentL = Math.max(Math.min(l * 100 * 1.5, 80), 60);
      const accent = hslToHex(h, accentS, accentL);

      const textS = Math.min(s * 100, 20);
      const textL = 90;
      const text = hslToHex(h, textS, textL);

      const footerS = Math.min(s * 100, 20);
      const footerL = 8;
      const footer = hslToHex(h, footerS, footerL);

      resolve({ colors: { text, accent, footer }, hash });
    };
    img.onerror = () => {
      logger.warn("Failed to load bg image, using fallback:", imageUrl);
      resolve({ colors: fallback, hash: "error" });
    };
  });
}

// Apply CSS Variables
export function applyThemeColors(colors: ThemeColors) {
  document.documentElement.style.setProperty("--theme-text", colors.text);
  document.documentElement.style.setProperty("--theme-accent", colors.accent);
  document.documentElement.style.setProperty(
    "--theme-footer-bg",
    colors.footer,
  );
}
