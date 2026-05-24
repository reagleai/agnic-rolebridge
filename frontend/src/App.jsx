/**
 * RoleBridge V2 - App Router
 */
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import LandingPage from './components/LandingPage';
import AuthCallback from './components/AuthCallback';

// ⚡ Bolt Performance Optimization:
// Code splitting route components using React.lazy() and Suspense.
// This reduces the main bundle size by ~65% (733kB -> 257kB) and defers loading
// heavy dependencies (like pdf.js in Setup/Profile) until the routes are actually visited.
const SetupPage = lazy(() => import('./components/SetupPage'));
const InterviewPage = lazy(() => import('./components/InterviewPage'));
const EndPage = lazy(() => import('./components/EndPage'));
const ProfilePage = lazy(() => import('./components/ProfilePage'));
const WalletPage = lazy(() => import('./components/WalletPage'));

const Fallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
    <span className="spinner" />
  </div>
);

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Suspense fallback={<Fallback />}>
        <Routes>
          {/* Keep LandingPage and AuthCallback eager as they are entry points */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/setup/:id" element={<SetupPage />} />
          <Route path="/interview/:id" element={<InterviewPage />} />
          <Route path="/complete" element={<EndPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
