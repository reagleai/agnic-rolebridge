/**
 * End page - session complete, report pending message.
 * Block D - frontend/src/components/EndPage.jsx
 */
import { useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { createSession } from '../lib/api';

export default function EndPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const email = location.state?.email || 'your email';
  const sessionId = location.state?.sessionId || '';
  const [isRestarting, setIsRestarting] = useState(false);

  const handleRestart = async () => {
    if (!email || email === 'your email') {
      navigate('/');
      return;
    }
    setIsRestarting(true);
    try {
      const data = await createSession(email);
      navigate(`/setup/${data.session_id}`, { state: { email } });
    } catch (err) {
      console.error('Failed to create new session', err);
      navigate('/');
    } finally {
      setIsRestarting(false);
    }
  };

  return (
    <div className="page-center">
      <div className="card end-card">
        <div className="end-icon" style={{ display: 'flex', justifyContent: 'center', color: 'var(--color-primary)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '64px', height: '64px' }}>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
        </div>
        <h2 className="end-title">Interview Complete!</h2>
        <p className="end-message">
          Your evaluation report is being generated and will be sent to{' '}
          <strong>{email}</strong>.
        </p>
        <p className="end-note" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px', flexShrink: 0 }}>
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
            <polyline points="22,6 12,13 2,6"></polyline>
          </svg>
          <span>Check your inbox (and spam folder) within the next few minutes.</span>
        </p>
        
        <button 
          className="btn-primary" 
          onClick={handleRestart} 
          disabled={isRestarting}
          style={{ marginTop: '2rem' }}
        >
          {isRestarting ? 'Restarting...' : 'Restart Interview'}
        </button>
      </div>
      <footer style={{ textAlign: 'center', padding: '2rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
        Built by Ajay Sharma · <a href="https://www.linkedin.com/in/workwithajay/" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>LinkedIn</a>
      </footer>
    </div>
  );
}
