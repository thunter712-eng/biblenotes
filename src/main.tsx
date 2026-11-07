import { createRoot } from 'react-dom/client';
import './app/fonts.ts';
import './styles/base.css';
import './styles/reader.css';
import { App } from './App.tsx';
import { useSettings } from './app/settings.ts';

await useSettings.getState().load();
createRoot(document.getElementById('root')!).render(<App />);
