import type { GlassButtonOptions } from './context';
import { finiteClamp } from './context';
import type { GlassElementConfig, GlassRect, LiquidGlassRenderer } from './vendor/renderer';

/** Public controls are native DOM buttons; upstream draws only their decorative bodies. */
export function buttonConfig(id: string, rect: GlassRect, options: GlassButtonOptions): GlassElementConfig {
  return {
    id, rect, kind: 'button',
    cornerRadius: finiteClamp(options.radius, 14, 0, Math.min(rect.w, rect.h) / 2),
    blurRadius: finiteClamp(options.blur, 2, 0, 24),
    refractionHeight: Math.min(12, rect.h / 2),
    refractionAmount: -finiteClamp(options.refraction, 24, 0, 48),
    depthEffect: false,
    chromaticAberration: false,
    saturation: 1.5, brightness: 0, contrast: 1,
    tintColor: options.variant === 'primary' ? [23 / 255, 95 / 255, 84 / 255, 1] : [0, 0, 0, 0],
    surfaceColor: options.variant === 'surface' ? [248 / 255, 252 / 255, 250 / 255, 0.78] : [0, 0, 0, 0],
    highlight: { mode: 0, color: [1, 1, 1], angle: Math.PI / 4, falloff: 1, alpha: 0.5, widthDp: 0.5 },
    outerShadow: { radius: 18, alpha: 0.1, offsetX: 0, offsetY: 3, color: [0.1, 0.23, 0.2] },
    label: '', labelColor: [0, 0, 0, 0], showChevron: false,
    isInteractive: !options.disabled, scroll: false,
    independentBackdrop: false, directBackdropSample: true,
    useContinuousSdf: false, useSeparableBlur: true,
  };
}

/** Adapted from upstream methods-wallpaper.ts. Loading/cancellation belong to the Vue host. */
export function uploadWallpaper(renderer: LiquidGlassRenderer, image: HTMLImageElement) {
  const gl = renderer.gl;
  const limit = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  if (image.naturalWidth > limit || image.naturalHeight > limit) throw new Error('背景图超过设备纹理尺寸上限');
  const texture = gl.createTexture();
  if (!texture) throw new Error('无法创建背景纹理');
  try {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (gl.getError() !== gl.NO_ERROR) throw new Error('背景纹理上传失败');
  } catch (error) {
    gl.deleteTexture(texture);
    throw error;
  }
  if (renderer.wallpaperTexture) gl.deleteTexture(renderer.wallpaperTexture);
  renderer.wallpaperTexture = texture;
  renderer.wallpaperSize = [image.naturalWidth, image.naturalHeight];
  renderer.wallpaperReady = true;
  renderer.clearBackdropBlurCache();
  renderer.wallpaperVersion++;
  renderer.markAllDirty();
}
