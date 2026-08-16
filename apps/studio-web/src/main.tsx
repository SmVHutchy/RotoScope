import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Shell } from './Shell';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root fehlt in index.html');

createRoot(root).render(
  <StrictMode>
    <Shell />
  </StrictMode>,
);
