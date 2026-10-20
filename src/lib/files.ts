const LAST_EXPORT_KEY = 'shiftly-last-export';

export function getLastExport(): number | null {
  try {
    const v = localStorage.getItem(LAST_EXPORT_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

function setLastExport(ts: number) {
  try {
    localStorage.setItem(LAST_EXPORT_KEY, String(ts));
  } catch {
    // Storage may be blocked; the reminder text is a convenience only.
  }
}

export type ExportResult = 'shared' | 'downloaded' | 'cancelled';

/**
 * Hands a backup to the user. On iPhone the share sheet is the reliable way to save a file
 * from an installed web app; elsewhere (or if sharing is unavailable) a normal download is used.
 */
export async function exportBackupFile(text: string, filename: string): Promise<ExportResult> {
  const file = new File([text], filename, { type: 'application/json' });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Shiftly backup' });
      setLastExport(Date.now());
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // Any other failure falls through to a regular download.
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  setLastExport(Date.now());
  return 'downloaded';
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsText(file);
  });
}
