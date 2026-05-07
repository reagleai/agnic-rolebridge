/**
 * End page — session complete, report pending message.
 * Block D — frontend/src/components/EndPage.jsx
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
        <div className="end-icon">✅</div>
        <h2 className="end-title">Interview Complete!</h2>
        <p className="end-message">
          Your evaluation report is being generated and will be sent to{' '}
          <strong>{email}</strong>.
        </p>
        <p className="end-note">
          📬 Check your inbox (and spam folder) within the next few minutes.
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
    </div>
  );
}
