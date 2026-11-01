import { lazy, Suspense, type ComponentType } from 'react';
import { Route, Router, Switch } from 'wouter';
import { RequireAuth } from '@/features/auth/components/require-auth';

// Cada rota vira um chunk próprio; o editor (Monaco) só carrega quando aberto.
const ProjectsPage = lazy(() => import('@/pages/projects-page'));
const LoginPage = lazy(() => import('@/pages/login-page'));
const EditorPage = lazy(() => import('@/pages/editor-page'));
const ReviewPage = lazy(() => import('@/pages/review-page'));
const NotFoundPage = lazy(() => import('@/pages/not-found-page'));

// Mesmo subcaminho do Vite (ex.: "/over-doc-tex" no GitHub Pages), sem a barra final.
const ROUTER_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function RouteFallback() {
  return <div className="h-viewport animate-pulse bg-muted/40" aria-busy="true" />;
}

/** Telas de trabalho: exigem login quando o Firebase está configurado. */
function protectedPage(Page: ComponentType) {
  return function ProtectedPage() {
    return (
      <RequireAuth>
        <Page />
      </RequireAuth>
    );
  };
}

const ProtectedProjectsPage = protectedPage(ProjectsPage);
const ProtectedEditorPage = protectedPage(EditorPage);

export function AppRouter() {
  return (
    <Router base={ROUTER_BASE}>
      <Suspense fallback={<RouteFallback />}>
        <Switch>
          <Route path="/" component={ProtectedProjectsPage} />
          <Route path="/login" component={LoginPage} />
          <Route path="/p/:projectId" component={ProtectedEditorPage} />
          {/* A revisão cuida do login: pelo link (?k=), entra sem conta. */}
          <Route path="/p/:projectId/reviews/:reviewId" component={ReviewPage} />
          <Route component={NotFoundPage} />
        </Switch>
      </Suspense>
    </Router>
  );
}
