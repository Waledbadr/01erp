import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { installAuthFetch } from './lib/installAuthFetch.js';
import { applyTheme, getTheme } from './lib/theme.js';
import './index.css';

installAuthFetch();
// Apply the saved/system theme before the first render (no light flash).
applyTheme(getTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
