import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { hasAnyWork, lastBackupAt } from '../backup/backup.ts';
import { db } from '../db/schema.ts';
import { IconButton, toast } from '../ui/primitives.tsx';
import { isAppleTablet, isStandalone, requestPersistence } from './persistence.ts';
import { navigate } from './router.ts';
import { useSettings } from './settings.ts';

/** First-run install advice, the backup reminder and the update prompt. */
export function AppNotices() {
  const [installTip, setInstallTip] = useState(false);
  const reminderDays = useSettings((s) => s.backupReminderDays);

  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  useEffect(() => {
    if (needRefresh) {
      toast('A new version of Bible Notes is ready', { label: 'Update', run: () => void updateServiceWorker(true) }, 0);
    }
  }, [needRefresh, updateServiceWorker]);

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
        toast(last ? `It's been ${Math.floor(days)} days since your last backup` : 'You haven\'t made a backup yet', { label: 'Back up', run: () => navigate({ name: 'settings' }) }, 12000);
      }
    })();
  }, [reminderDays]);

  if (!installTip) return null;
  const dismiss = () => {
    setInstallTip(false);
    void db.kv.put({ key: 'installTipDismissed', value: true });
  };
  return (
    <div className="install-tip" role="region" aria-label="Install advice">
      <p><strong>Add Bible Notes to your Home Screen.</strong> Safari can clear data from websites you haven't visited lately, and that could include your notes. Installed apps are protected, and they work in airplane mode. Tap Share, then Add to Home Screen.</p>
      <IconButton icon="close" label="Dismiss" onClick={dismiss} />
    </div>
  );
}
