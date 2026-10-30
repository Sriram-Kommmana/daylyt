import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/figtree';
import './styles.css';
import App from './App';

registerSW({ immediate: true });

// Ask the browser not to evict our data under storage pressure. Installed PWAs are usually granted this.
void navigator.storage?.persist?.();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
