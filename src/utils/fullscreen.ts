interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenEnabled?: boolean;
}

export function isFullscreenSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as FullscreenDocument;
  const el = document.documentElement as FullscreenElement;
  return Boolean(
    doc.fullscreenEnabled ||
      doc.webkitFullscreenEnabled ||
      el.requestFullscreen ||
      el.webkitRequestFullscreen,
  );
}

export function isCurrentlyFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as FullscreenDocument;
  return Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
}

export function enterFullscreen(): void {
  if (typeof document === 'undefined') return;
  try {
    if (isCurrentlyFullscreen()) return;
    const el = document.documentElement as FullscreenElement;
    if (el.requestFullscreen) {
      Promise.resolve(el.requestFullscreen()).catch(() => {});
    } else if (el.webkitRequestFullscreen) {
      Promise.resolve(el.webkitRequestFullscreen()).catch(() => {});
    }
  } catch {
    // Ignore when iframe or browser blocks native fullscreen
  }
}

export function exitFullscreen(): void {
  if (typeof document === 'undefined') return;
  try {
    if (!isCurrentlyFullscreen()) return;
    const doc = document as FullscreenDocument;
    if (doc.exitFullscreen) {
      Promise.resolve(doc.exitFullscreen()).catch(() => {});
    } else if (doc.webkitExitFullscreen) {
      Promise.resolve(doc.webkitExitFullscreen()).catch(() => {});
    }
  } catch {
    // Ignore fullscreen exit errors
  }
}
