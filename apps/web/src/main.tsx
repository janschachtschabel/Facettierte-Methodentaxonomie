import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/barlow-semi-condensed/latin-500.css';
import '@fontsource/barlow-semi-condensed/latin-ext-500.css';
import '@fontsource/barlow-semi-condensed/latin-600.css';
import '@fontsource/barlow-semi-condensed/latin-ext-600.css';
import '@fontsource/barlow-semi-condensed/latin-700.css';
import '@fontsource/barlow-semi-condensed/latin-ext-700.css';
import '@fontsource/literata/latin-400.css';
import '@fontsource/literata/latin-ext-400.css';
import '@fontsource/literata/latin-600.css';
import '@fontsource/literata/latin-ext-600.css';
import 'katex/dist/katex.min.css';
import './styles/tokens.css';
import './styles/global.css';
import { App } from './App.js';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
