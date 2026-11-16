import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider, ToastProvider } from '@qabnah/shared';
import '@qabnah/shared/styles.css';
import './admin.css';
import { queryClient } from './api';
import { dictionaries } from './i18n';
import { SessionProvider } from './session';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider dictionaries={dictionaries} defaultLang="en" storageKey="qabnah.admin.lang">
        <ToastProvider>
          <BrowserRouter>
            <SessionProvider>
              <App />
            </SessionProvider>
          </BrowserRouter>
        </ToastProvider>
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>,
);
