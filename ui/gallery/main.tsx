import { createRoot } from 'react-dom/client';

// Placeholder gallery entry. The gallery task fills in every component with fixture data.
const container = document.getElementById('root');
if (container !== null) {
  createRoot(container).render(<p>Ghost Run+ UI kit gallery</p>);
}
