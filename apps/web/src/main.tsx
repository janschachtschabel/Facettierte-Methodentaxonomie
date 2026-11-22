import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/barlow-semi-condensed/500.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/barlow-semi-condensed/700.css';
import '@fontsource/literata/400.css';
import '@fontsource/literata/600.css';
import 'katex/dist/katex.min.css';
import './styles/tokens.css';
import './styles/global.css';
import { App } from './App.js';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
