/**
 * Landing page — email entry to start a session.
 * Block D — frontend/src/components/LandingPage.jsx
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createSession } from '../lib/api';

export default function LandingPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      const data = await createSession(email);
      navigate(`/setup/${data.session_id}`, { state: { email } });
    } catch (err) {
      if (err.data?.error === 'invalid_email') {
        setError('Invalid email address. Please check and try again.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-center">
      <div className="card landing-card">
        <div className="landing-badge">Career Transition Simulator</div>
        <h1 className="landing-title">RoleBridge</h1>
        <p className="landing-subtitle">
          Defend and translate your real experience under follow-up pressure.
          Practice targeted interview questions generated from your resume and target job description.
        </p>
        <form onSubmit={handleSubmit} className="landing-form">
          <label htmlFor="email" className="form-label">
            Your email (for the detailed report card)
          </label>
          <input
            id="email"
            type="email"
            className="form-input"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            autoFocus
          />
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Creating session…' : 'Start Interview →'}
          </button>
        </form>
      </div>
    </div>
  );
}
