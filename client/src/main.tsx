import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App.tsx';
import { AuthProvider } from './auth.tsx';
import { I18nProvider } from './i18n.tsx';
import { ThemeProvider } from './theme.tsx';
import '@fontsource-variable/archivo/standard.css';
import '@fontsource/patrick-hand/400.css';
import './reset.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </I18nProvider>
  </StrictMode>,
);
