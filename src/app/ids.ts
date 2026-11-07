export const newId = (): string =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : // randomUUID needs a secure context; a plain-http dev server on a LAN iPad has none.
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
