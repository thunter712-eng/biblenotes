import { useEffect, useRef, useState } from 'react';
import { createBackup, lastBackupAt, readBackup, restoreMerge, restoreReplace, type ParsedBackup } from '../backup/backup.ts';
import { shareOrDownload } from '../backup/share.ts';
import { forgetAllDocuments } from '../notebook/pageStore.ts';
import { Field, Sheet, toast } from '../ui/primitives.tsx';
import { navigate } from './router.ts';
import { PageShell } from './PageShell.tsx';
import { useSettings } from './settings.ts';
import { isStandalone } from './persistence.ts';

const when = (t: number | null) => {
  if (!t) return 'Never backed up.';
  const days = Math.floor((Date.now() - t) / 86_400_000);
  return `Last backed up ${days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`} (${new Date(t).toLocaleDateString()}).`;
};

export function SettingsPage() {
  const s = useSettings();
  const [last, setLast] = useState<number | null>(null);
  const [storage, setStorage] = useState<{ persisted: boolean | null; usedMb: number | null }>({ persisted: null, usedMb: null });
  const [pending, setPending] = useState<ParsedBackup | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void lastBackupAt().then(setLast);
    void (async () => {
      const persisted = (await navigator.storage?.persisted?.()) ?? null;
      const est = await navigator.storage?.estimate?.();
      setStorage({ persisted, usedMb: est?.usage != null ? est.usage / 1024 / 1024 : null });
    })();
  }, []);

  const backup = async () => {
    setBusy(true);
    try {
      const blob = await createBackup();
      const date = new Date().toISOString().slice(0, 10);
      await shareOrDownload(blob, `bible-notes-backup-${date}.zip`);
      setLast(await lastBackupAt());
    } catch (e) {
      toast(`The backup failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    try {
      setPending(await readBackup(f));
    } catch (e) {
      toast((e as Error).message, undefined, 6000);
    }
  };

  const restore = async (mode: 'merge' | 'replace') => {
    if (!pending) return;
    setBusy(true);
    try {
      const fn = mode === 'merge' ? restoreMerge : restoreReplace;
      const r = await fn(pending);
      forgetAllDocuments();
      await useSettings.getState().load();
      setPending(null);
      toast(mode === 'merge' ? `Merged ${r.notes} notes and ${r.pages} pages from the backup.` : `Restored ${r.notes} notes and ${r.pages} pages.`, undefined, 5000);
    } catch (e) {
      toast(`The restore failed, and nothing was changed: ${(e as Error).message}`, undefined, 6000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell title="Settings">
      <div className="prose settings">
        <h2>Apple Pencil</h2>
        <label className="check-row">
          <input type="checkbox" checked={s.fingerDraws} onChange={(e) => s.set({ fingerDraws: e.target.checked })} />
          <span>Let fingers draw too. Two fingers still pan and zoom.</span>
        </label>

        <h2>Backup</h2>
        <p data-testid="last-backup">{when(last)}</p>
        <p className="muted">Your notes live only on this iPad. A backup is one file you can keep in iCloud Drive or Files, and restore on any device.</p>
        <div className="button-row">
          <button type="button" className="btn" disabled={busy} onClick={() => void backup()}>Back up now</button>
          <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => file.current?.click()}>Restore from a backup</button>
          <input ref={file} type="file" accept=".zip,.json,application/zip,application/json" hidden data-testid="restore-input" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        <Field label="Remind me to back up">
          <select value={s.backupReminderDays} onChange={(e) => s.set({ backupReminderDays: +e.target.value })}>
            <option value={7}>Every week</option>
            <option value={14}>Every two weeks</option>
            <option value={30}>Every month</option>
            <option value={0}>Never</option>
          </select>
        </Field>

        <h2>Storage</h2>
        <p>
          {storage.persisted === true && 'This device has agreed to keep your notes when space runs low.'}
          {storage.persisted === false && (isStandalone()
            ? 'The browser has not confirmed protected storage, so keep regular backups.'
            : 'Safari may clear data for sites that aren\'t on the Home Screen. Add Bible Notes to your Home Screen to protect your notes: tap Share, then Add to Home Screen.')}
          {storage.persisted === null && 'This browser does not report whether storage is protected, so keep regular backups.'}
        </p>
        {storage.usedMb !== null && <p className="muted">Using about {storage.usedMb.toFixed(1)} MB.</p>}

        <h2>More</h2>
        <div className="menu-list">
          <button type="button" className="list-row" onClick={() => navigate({ name: 'about' })}>About and translation licenses</button>
          <button type="button" className="list-row" onClick={() => navigate({ name: 'ink-test' })}>Ink test page, with live Pencil readouts</button>
        </div>
        <h2>Keyboard</h2>
        <p className="muted">Command-Z undoes and Shift-Command-Z redoes. On a notebook page: P pen, H highlighter, E stroke eraser, X pixel eraser, L lasso, T text, S shapes.</p>
      </div>
      {pending && (
        <Sheet title="Restore this backup?" onClose={() => setPending(null)} width={480}>
          <p>From {new Date(pending.data.exportedAt).toLocaleString()}: {pending.data.notes.length} notes, {pending.data.pages.filter((p) => p.notebookId).length} pages, {pending.data.highlights.length} highlights.</p>
          <div className="form-stack">
            <div>
              <button type="button" className="btn" disabled={busy} onClick={() => void restore('merge')}>Merge with what's here</button>
              <p className="muted">Keeps everything on this device, and adds what's new. If an item exists on both sides, the most recently edited one wins.</p>
            </div>
            <div>
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void restore('replace')}>Replace everything here</button>
              <p className="muted">Deletes all notes on this device first, then restores the backup. This can't be undone.</p>
            </div>
          </div>
        </Sheet>
      )}
    </PageShell>
  );
}
