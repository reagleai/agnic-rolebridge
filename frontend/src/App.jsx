/**
 * RoleBridge App Router.
 * Block D — overwrites Block A shell with full routing.
 */
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './components/LandingPage';
import SetupPage from './components/SetupPage';
import InterviewPage from './components/InterviewPage';
import EndPage from './components/EndPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/setup/:id" element={<SetupPage />} />
        <Route path="/interview/:id" element={<InterviewPage />} />
        <Route path="/complete" element={<EndPage />} />
      </Routes>
    </BrowserRouter>
  );
}
