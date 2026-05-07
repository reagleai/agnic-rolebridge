/**
 * End page — session complete, report pending message.
 * Block D — frontend/src/components/EndPage.jsx
 */
import { useLocation } from 'react-router-dom';

export default function EndPage() {
  const location = useLocation();
  const email = location.state?.email || 'your email';
  const sessionId = location.state?.sessionId || '';

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
        {sessionId && (
          <p className="end-session-id">
            Session ID: <code>{sessionId}</code>
          </p>
        )}
      </div>
    </div>
  );
}
