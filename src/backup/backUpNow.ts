import { toast } from '../ui/primitives.tsx';
import { createBackup } from './backup.ts';
import { shareOrDownload } from './share.ts';

/** Builds a backup and hands it to the Share sheet, where Save to Files puts it in iCloud Drive. */
export async function backUpNow(): Promise<void> {
  try {
    const blob = await createBackup();
    const date = new Date().toISOString().slice(0, 10);
    await shareOrDownload(blob, `bible-notes-backup-${date}.zip`);
  } catch (e) {
    toast(`The backup failed: ${(e as Error).message}`);
  }
}
