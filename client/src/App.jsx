import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import AuthPage from './pages/AuthPage.jsx';
import BoardPage from './pages/BoardPage.jsx';
import Dashboard from './pages/Dashboard.jsx';
import WorkspacePage from './pages/WorkspacePage.jsx';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="boot">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { loading } = useAuth();
  if (loading) return <p className="boot">Loading…</p>;

  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/workspaces/:workspaceId" element={<Protected><WorkspacePage /></Protected>} />
      <Route path="/boards/:boardId" element={<Protected><BoardPage /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
