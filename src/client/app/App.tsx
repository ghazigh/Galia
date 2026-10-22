import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router';
import { useToast } from '../components/Toast';
import { Button, EmptyState, Spinner } from '../components/ui';
import { LogoMark } from '../components/Logo';
import { JoinPage } from '../features/auth/JoinPage';
import { LoginPage } from '../features/auth/LoginPage';
import { SetupPage } from '../features/auth/SetupPage';
import { FocusPage } from '../features/focus/FocusPage';
import { HomePage } from '../features/home/HomePage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { TasksPage } from '../features/tasks/TasksPage';
import { errorMessage } from '../lib/api';
import { useSession } from '../lib/queries';
import { AppShell } from './AppShell';
import { AppDataProvider, UiProvider } from './context';

const HousePlayground = import.meta.env.DEV
  ? lazy(() => import('../dev/HousePlayground').then((m) => ({ default: m.HousePlayground })))
  : null;

function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <LogoMark size={56} className="animate-pulse" />
      <Spinner />
    </div>
  );
}

function TaskRedirect() {
  const { id } = useParams();
  return <Navigate to={`/?task=${id}`} replace />;
}

function AuthGate() {
  const session = useSession();
  if (session.isLoading) return <Splash />;
  if (session.isError || !session.data) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <EmptyState
          title="Can't reach the house right now"
          body={errorMessage(session.error)}
          action={<Button onClick={() => void session.refetch()}>Try again</Button>}
        />
      </div>
    );
  }
  if (session.data.setupRequired) return <SetupPage />;
  if (!session.data.bootstrap) return <LoginPage />;
  return (
    <AppDataProvider>
      <UiProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="focus" element={<FocusPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="task/:id" element={<TaskRedirect />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </UiProvider>
    </AppDataProvider>
  );
}

/** Registers the service worker and offers a reload when a new version is ready. */
function UpdatePrompt() {
  const toast = useToast();
  useEffect(() => {
    if (import.meta.env.DEV) return;
    let cancelled = false;
    void import('virtual:pwa-register').then(({ registerSW }) => {
      if (cancelled) return;
      const update = registerSW({
        onNeedRefresh() {
          toast('A new version is ready', {
            duration: 15000,
            action: { label: 'Refresh', onClick: () => void update(true) },
          });
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [toast]);
  return null;
}

export function App() {
  return (
    <>
      <UpdatePrompt />
      <Routes>
        {HousePlayground && (
          <Route
            path="/__house"
            element={
              <Suspense fallback={<Splash />}>
                <HousePlayground />
              </Suspense>
            }
          />
        )}
        <Route path="/join/:token" element={<JoinPage />} />
        <Route path="*" element={<AuthGate />} />
      </Routes>
    </>
  );
}
