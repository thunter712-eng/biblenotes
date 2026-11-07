import type { ReactNode } from 'react';
import { IconButton } from '../ui/primitives.tsx';

/** Full-page chrome for everything that isn't the study view. */
export function PageShell({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-shell">
      <header className="page-head">
        <IconButton icon="back" label="Back to reading" onClick={() => { location.hash = lastReadHash(); }} />
        <h1>{title}</h1>
        <div className="page-head-actions">{actions}</div>
      </header>
      <main className="page-body">{children}</main>
    </div>
  );
}

let lastHash = '#/read/JHN/3';
export const rememberReadHash = (hash: string) => { lastHash = hash; };
export const lastReadHash = () => lastHash;
