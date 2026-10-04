import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import { LanguageProvider } from './i18n/index.js';
import { ToastProvider } from './context/ToastContext.js';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <LanguageProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </LanguageProvider>
  </React.StrictMode>
);

