// Share and copy that still work outside a secure context. navigator.share and
// navigator.clipboard only exist on https or localhost, so a phone on the LAN dev server
// (http://192.168…) has neither.

/** Copy text to the clipboard. Resolves true when it landed. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;font-size:16px';
  document.body.appendChild(ta);
  try {
    ta.select();
    ta.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    ta.remove();
  }
}

/**
 * Open the native share sheet, else copy. Returns 'shared', 'copied', 'cancelled' (the user
 * closed the sheet) or 'failed'.
 */
export async function shareOrCopy(data: { title: string; text: string; url?: string }): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'cancelled';
      /* NotAllowedError etc: fall back to copying */
    }
  }
  const text = data.url ? `${data.text}\n${data.url}` : data.text;
  return (await copyText(text)) ? 'copied' : 'failed';
}
