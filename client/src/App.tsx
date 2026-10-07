import { Link, Navigate, Route, Routes, useParams } from 'react-router';
import { RequireAuth, useAuth } from './auth.tsx';
import { LoginPage, RegisterPage } from './AuthPages.tsx';
import { useLang, useT, type Lang } from './i18n.tsx';
import { useTheme, type ThemePref } from './theme.tsx';

export function App() {
  return (
    <>
      <Header />
      <main>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/" element={<LibraryPage />} />
            <Route path="/doc/:id" element={<DocumentPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}

function Header() {
  const t = useT();
  const { lang, setLang } = useLang();
  const { pref, setPref } = useTheme();
  const { user, logout } = useAuth();

  return (
    <header>
      <Link to="/">NoteMinds</Link>
      <label>
        {t('header.language')}{' '}
        <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
          <option value="vi" lang="vi">Tiếng Việt</option>
          <option value="en" lang="en">English</option>
        </select>
      </label>
      <label>
        {t('header.theme')}{' '}
        <select value={pref} onChange={(e) => setPref(e.target.value as ThemePref)}>
          <option value="system">{t('theme.system')}</option>
          <option value="light">{t('theme.light')}</option>
          <option value="dark">{t('theme.dark')}</option>
        </select>
      </label>
      {user && (
        <>
          <span>{user.displayName ?? user.username}</span>
          <button type="button" onClick={logout}>{t('auth.logout')}</button>
        </>
      )}
    </header>
  );
}

// Placeholders: the real screens come with the document features.
function LibraryPage() {
  const t = useT();
  return <h1>{t('library.title')}</h1>;
}

function DocumentPage() {
  const t = useT();
  const { id } = useParams();
  return <h1>{t('doc.title')} {id}</h1>;
}
