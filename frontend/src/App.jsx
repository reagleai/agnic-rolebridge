/**
 * RoleBridge V2 — App Router
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import LandingPage from './components/LandingPage';
import SetupPage from './components/SetupPage';
import InterviewPage from './components/InterviewPage';
import EndPage from './components/EndPage';
import ProfilePage from './components/ProfilePage';
import WalletPage from './components/WalletPage';
import AuthCallback from './components/AuthCallback';

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/setup/:id" element={<SetupPage />} />
        <Route path="/interview/:id" element={<InterviewPage />} />
        <Route path="/complete" element={<EndPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/wallet" element={<WalletPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
