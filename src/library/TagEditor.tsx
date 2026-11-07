import { useState } from 'react';

/** Tags as removable chips, with a field for adding more. */
export function TagEditor({ tags, onChange, label = 'Add a tag' }: { tags: string[]; onChange: (tags: string[]) => void; label?: string }) {
  const [text, setText] = useState('');
  const add = () => {
    const t = text.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setText('');
  };
  return (
    <div className="tag-editor">
      {tags.map((t) => (
        <button key={t} type="button" className="tag" aria-label={`Remove tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>{t} ×</button>
      ))}
      <input
        type="text" value={text} placeholder={label} aria-label={label} onChange={(e) => setText(e.target.value)} onBlur={add}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
      />
    </div>
  );
}
