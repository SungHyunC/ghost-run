import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/fredoka/latin-400.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import '../styles/00-fonts.css';
import '../styles/01-base.css';
import '../styles/01-nav.css';
import '@ghost-run/ui/styles.css';
import './styles/showcase.css';
import { ShowcaseApp } from './ShowcaseApp';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element.');
createRoot(container).render(
  <StrictMode>
    <ShowcaseApp />
  </StrictMode>,
);
