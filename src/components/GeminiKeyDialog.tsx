import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ExternalLink, KeyRound } from 'lucide-react';

const API_PATH = '/api/gemini-key';

export type GeminiKeyDialogMode = 'setup' | 'manage';

export function GeminiKeyDialog({
  initialMode,
  accountId,
  onClose,
  onSessionLost,
}: {
  initialMode: GeminiKeyDialogMode;
  accountId: string;
  onClose: () => void;
  onSessionLost: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState(initialMode);
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  async function updateKey(method: 'PUT' | 'DELETE', value = '') {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(API_PATH, {
        method,
        headers: { 'X-Naseeb-Account': accountId, ...(method === 'PUT' && { 'Content-Type': 'application/json' }) },
        ...(method === 'PUT' && {
          body: JSON.stringify({ apiKey: value }),
        }),
      });
      if (response.status === 401) {
        onSessionLost();
        return;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'API key belum bisa diperbarui. Coba lagi ya.');
      }

      if (method === 'DELETE') {
        setApiKey('');
        setMode('setup');
        return;
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ada gangguan saat menghubungi server.');
    } finally {
      setBusy(false);
    }
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busy) void updateKey('PUT', apiKey);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="gemini-key-title"
      aria-describedby="gemini-key-storage"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl backdrop:bg-slate-950/45 sm:p-7"
    >
      <KeyRound aria-hidden="true" className="mb-3 h-5 w-5 text-blue-600" />
      <h2 id="gemini-key-title" className="mb-3 text-2xl font-semibold">
        {mode === 'manage' ? 'Kelola API key Gemini' : 'API key Gemini'}
      </h2>

      <form onSubmit={handleSave} className="space-y-4">
        <p className="text-sm leading-relaxed text-slate-600">
          Pakai API key dari proyek Gemini <strong>Free Tier</strong> untuk main dengan kuota gratis.
        </p>
        <a
          href="https://aistudio.google.com/api-keys"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-8 items-center gap-1.5 text-sm font-semibold text-blue-700 underline underline-offset-4"
        >
          Dapatkan API key di Google AI Studio
          <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
        </a>
        <div>
          <label htmlFor="gemini-api-key" className="mb-1.5 block text-sm font-medium">
            {mode === 'manage' ? 'API key baru' : 'Masukkan API key'}
          </label>
          <input
            id="gemini-api-key"
            type="password"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            disabled={busy}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            className="w-full min-h-11 rounded-lg border border-slate-300 px-3 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <p id="gemini-key-storage" className="text-xs leading-relaxed text-slate-600">
          API key disimpan dalam bentuk terenkripsi.
        </p>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full min-h-11 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {busy ? 'Memproses…' : 'Test and Save'}
        </button>
        <div className="flex flex-wrap justify-between gap-2">
          {mode === 'manage' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void updateKey('DELETE')}
              className="min-h-11 rounded-lg px-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Hapus API key
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="min-h-11 rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Tutup
          </button>
        </div>
      </form>
    </dialog>
  );
}
