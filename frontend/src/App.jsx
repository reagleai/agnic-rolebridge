/**
 * RoleBridge App Router.
 * Block D - overwrites Block A shell with full routing.
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import LandingPage from './components/LandingPage';
import SetupPage from './components/SetupPage';
import InterviewPage from './components/InterviewPage';
import EndPage from './components/EndPage';

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/setup" element={<Navigate to="/" replace />} />
        <Route path="/setup/:id" element={<SetupPage />} />
        <Route path="/interview" element={<Navigate to="/" replace />} />
        <Route path="/interview/:id" element={<InterviewPage />} />
        <Route path="/complete" element={<EndPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <footer style={{ textAlign: 'center', padding: '2rem', fontSize: '0.875rem', color: 'var(--text-muted, #666)' }}>
        Built by Ajay Sharma · <a href="https://www.linkedin.com/in/workwithajay/" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>LinkedIn</a>
      </footer>
    </BrowserRouter>
  );
}
