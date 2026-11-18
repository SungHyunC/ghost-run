import { createRoot } from 'react-dom/client';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Missing #root element');
}

createRoot(container).render(<main aria-label="Ghost Hand">Ghost Hand</main>);
