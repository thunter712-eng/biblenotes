import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { hasAnyWork, lastBackupAt } from '../backup/backup.ts';
import { backUpNow } from '../backup/backUpNow.ts';
import { db } from '../db/schema.ts';
import { IconButton, toast } from '../ui/primitives.tsx';
import { isAppleTablet, isStandalone, requestPersistence } from './persistence.ts';
import { useSettings } from './settings.ts';
import { flushAllDocuments } from '../notebook/pageStore.ts';

/** First-run install advice, the backup reminder and the update prompt. */
export function AppNotices() {
  const [installTip, setInstallTip] = useState(false);
  const reminderDays = useSettings((s) => s.backupReminderDays);

  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    // A Home Screen app on iPad resumes from the background instead of relaunching, so it rarely
    // checks for a new version by itself. Check when it comes back to the front, and hourly while open.
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      let last = Date.now();
      const check = () => {
        if (!navigator.onLine || Date.now() - last < 60_000) return;
        last = Date.now();
        void reg.update().catch(() => {});
      };
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
      window.addEventListener('focus', check);
      setInterval(check, 60 * 60_000);
    },
  });
  const [updating, setUpdating] = useState(false);
  const applyUpdate = async () => {
    setUpdating(true);
    // Save open pages first: the reload replaces the page before a normal autosave would run.
    try { await flushAllDocuments(); } catch { /* Updating matters more than one unsaved stroke. */ }
    await updateServiceWorker(true);
  };

  useEffect(() => {
    void requestPersistence();
    void db.kv.get('installTipDismissed').then((row) => {
      if (!row && !isStandalone() && isAppleTablet()) setInstallTip(true);
    });
  }, []);

  useEffect(() => {
    if (!reminderDays) return;
    void (async () => {
      if (!(await hasAnyWork())) return;
      const last = await lastBackupAt();
      // Before a first backup, give it the same grace period, counted from the first run.
      let since = last;
      if (!since) {
        const first = (await db.kv.get('firstRunAt'))?.value as number | undefined;
        if (!first) {
          await db.kv.put({ key: 'firstRunAt', value: Date.now() });
          return;
        }
        since = first;
      }
      const days = (Date.now() - since) / 86_400_000;
      if (days >= reminderDays) {
        // The button backs up straight away: its tap is what lets iPad open the Share sheet.
        toast(last ? `It's been ${Math.floor(days)} days since your last backup` : 'You haven\'t made a backup yet', { label: 'Back up now', run: () => void backUpNow() }, 20000);
      }
    })();
  }, [reminderDays]);

  const dismiss = () => {
    setInstallTip(false);
    void db.kv.put({ key: 'installTipDismissed', value: true });
  };
  // The update banner stays until tapped, so it can't be lost behind other messages.
  if (needRefresh) {
    return (
      <div className="update-banner" role="alert">
        <span>A new version of Bible Notes is ready.</span>
        <button type="button" className="btn" disabled={updating} onClick={() => void applyUpdate()}>{updating ? 'Updating…' : 'Tap to refresh'}</button>
      </div>
    );
  }
  if (!installTip) return null;
  return (
    <div className="install-tip" role="region" aria-label="Install advice">
      <p><strong>Add Bible Notes to your Home Screen.</strong> Safari can clear data from websites you haven't visited lately, and that could include your notes. Installed apps are protected, and they work in airplane mode. Tap Share, then Add to Home Screen.</p>
      <IconButton icon="close" label="Dismiss" onClick={dismiss} />
    </div>
  );
}
