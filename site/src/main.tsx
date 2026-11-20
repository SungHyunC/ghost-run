import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/fredoka/latin-400.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import './styles/00-fonts.css';
import './styles/01-base.css';
import './styles/02-nav-hero.css';
import './styles/03-recipe.css';
import './styles/04-costumes.css';
import './styles/05-walkthrough.css';
import './styles/06-pane-content.css';
import './styles/07-judge.css';
import './styles/08-actor-say.css';
import './styles/09-make-footer.css';
import './styles/10-motion.css';
import './styles/99-page.css';
import './styles/11-responsive.css';
import { App } from './App';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element.');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
