/**
 * Landing page — full product-led page with email CTA.
 * Block D — frontend/src/components/LandingPage.jsx
 *
 * Preserves the exact email → createSession → navigate(/setup/:id) flow.
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

  /* Shared email input to avoid duplication */
  const emailInput = (
    <input
      id="email"
      type="email"
      className="form-input"
      placeholder="you@example.com"
      value={email}
      onChange={(e) => setEmail(e.target.value)}
      disabled={loading}
    />
  );

  const submitButton = (
    <button type="submit" className="btn-primary" disabled={loading}>
      {loading ? 'Creating session…' : 'Start Interview →'}
    </button>
  );

  return (
    <div className="landing-page">

      {/* ─── Hero ─── */}
      <section className="landing-section landing-hero">
        <div className="pill">Interview Pressure-Test</div>

        <h1 className="landing-hero__headline">
          Your resume got you in.<br />
          Can your answers hold up?
        </h1>

        <p className="landing-hero__subhead">
          RoleBridge simulates a focused interview using your real resume and
          target job description — then pushes on weak answers so you can find
          where your story breaks before the real thing.
        </p>

        <form onSubmit={handleSubmit} className="landing-hero__form">
          <label htmlFor="email" className="form-label" style={{ textAlign: 'center' }}>
            Enter your email to start
          </label>
          {emailInput}
          {error && <p className="form-error">{error}</p>}
          {submitButton}
        </form>

        <p className="landing-hero__microcopy">
          Report delivered to your inbox after the session.
        </p>

        <div className="landing-hero__steps">
          <span>Upload resume</span>
          <span className="landing-hero__step-arrow">→</span>
          <span>Paste JD</span>
          <span className="landing-hero__step-arrow">→</span>
          <span>Pick a section</span>
          <span className="landing-hero__step-arrow">→</span>
          <span>Practice under pressure</span>
        </div>

        <div className="landing-hero__trust">
          Uses your real resume, target JD, and live follow-up pressure.
        </div>
      </section>

      <div className="landing-divider" />

      {/* ─── Problem ─── */}
      <section className="landing-section">
        <h2 className="landing-section__heading">The real failure mode</h2>
        <p className="landing-problem__intro">
          Your resume is strong enough to get you shortlisted. But when the
          interviewer starts probing — asking for specifics, testing ownership,
          pushing for evidence — your answers get vague. The problem isn't your
          experience. It's that you haven't pressure-tested how you explain it.
        </p>

        <ul className="landing-pain-list">
          <li className="landing-pain-item">
            <span className="landing-pain-item__marker" />
            <span>Answers become vague when follow-up questions dig deeper.</span>
          </li>
          <li className="landing-pain-item">
            <span className="landing-pain-item__marker" />
            <span>You default to old functional language instead of speaking like the role you want.</span>
          </li>
          <li className="landing-pain-item">
            <span className="landing-pain-item__marker" />
            <span>Ownership and evidence claims weaken under pressure.</span>
          </li>
          <li className="landing-pain-item">
            <span className="landing-pain-item__marker" />
            <span>You know you've done the work, but can't explain it sharply in the moment.</span>
          </li>
        </ul>
      </section>

      <div className="landing-divider" />

      {/* ─── What RoleBridge Does ─── */}
      <section className="landing-section">
        <h2 className="landing-section__heading">What this actually does</h2>
        <p className="landing-section__subheading">
          A focused interview simulation grounded in your real background — not generic coaching.
        </p>

        <div className="landing-feature-list">
          <div className="landing-feature-item">
            <div className="landing-feature-item__icon">📄</div>
            <div className="landing-feature-item__content">
              <span className="landing-feature-item__title">Grounded in your resume + target JD</span>
              <span className="landing-feature-item__desc">
                Questions are generated from your actual experience and the specific job you're targeting.
              </span>
            </div>
          </div>

          <div className="landing-feature-item">
            <div className="landing-feature-item__icon">🎯</div>
            <div className="landing-feature-item__content">
              <span className="landing-feature-item__title">One section at a time</span>
              <span className="landing-feature-item__desc">
                You pick one resume section to focus on. The interview goes deep, not wide.
              </span>
            </div>
          </div>

          <div className="landing-feature-item">
            <div className="landing-feature-item__icon">🔍</div>
            <div className="landing-feature-item__content">
              <span className="landing-feature-item__title">Follow-up pressure on weak answers</span>
              <span className="landing-feature-item__desc">
                Vague or surface-level answers trigger probing follow-ups — the same way a real interviewer would push.
              </span>
            </div>
          </div>

          <div className="landing-feature-item">
            <div className="landing-feature-item__icon">📬</div>
            <div className="landing-feature-item__content">
              <span className="landing-feature-item__title">Detailed evaluation report by email</span>
              <span className="landing-feature-item__desc">
                After the session, you receive a structured report covering evidence quality, ownership, role-language fit, and specific areas to improve.
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="landing-divider" />

      {/* ─── Outcomes ─── */}
      <section className="landing-section">
        <h2 className="landing-section__heading">What changes after a session</h2>
        <p className="landing-section__subheading">
          Not motivation. Not tips. Concrete awareness of where your story holds up and where it doesn't.
        </p>

        <ul className="landing-outcome-list">
          <li className="landing-outcome-item">
            <span className="landing-outcome-item__marker" />
            <span>Sharper articulation of real past experience.</span>
          </li>
          <li className="landing-outcome-item">
            <span className="landing-outcome-item__marker" />
            <span>Stronger translation of past work into target-role language.</span>
          </li>
          <li className="landing-outcome-item">
            <span className="landing-outcome-item__marker" />
            <span>Better awareness of weak answers before the real interview.</span>
          </li>
          <li className="landing-outcome-item">
            <span className="landing-outcome-item__marker" />
            <span>More confidence under follow-up pressure.</span>
          </li>
          <li className="landing-outcome-item">
            <span className="landing-outcome-item__marker" />
            <span>Clearer ownership and evidence in your answers.</span>
          </li>
        </ul>
      </section>

      <div className="landing-divider" />

      {/* ─── How It Works ─── */}
      <section className="landing-section">
        <h2 className="landing-section__heading">How it works</h2>
        <p className="landing-section__subheading">
          Five steps. A few minutes. One honest report.
        </p>

        <ol className="landing-steps-list">
          <li className="landing-step">
            <span className="landing-step__number">1</span>
            <span className="landing-step__text">Enter your email address.</span>
          </li>
          <li className="landing-step">
            <span className="landing-step__number">2</span>
            <span className="landing-step__text">Upload your resume and paste the target job description.</span>
          </li>
          <li className="landing-step">
            <span className="landing-step__number">3</span>
            <span className="landing-step__text">Choose one resume section to focus on.</span>
          </li>
          <li className="landing-step">
            <span className="landing-step__number">4</span>
            <span className="landing-step__text">Answer interview questions by voice or text.</span>
          </li>
          <li className="landing-step">
            <span className="landing-step__number">5</span>
            <span className="landing-step__text">Receive your evaluation report by email.</span>
          </li>
        </ol>
      </section>

      <div className="landing-divider" />

      {/* ─── Bottom CTA ─── */}
      <section className="landing-section landing-bottom-cta">
        <h2 className="landing-section__heading">
          Ready to pressure-test your story?
        </h2>

        <form onSubmit={handleSubmit} className="landing-bottom-cta__form">
          <input
            type="email"
            className="form-input"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Creating session…' : 'Start Interview →'}
          </button>
        </form>

        <p className="landing-bottom-cta__microcopy">
          Start with your email. Takes a few minutes.
        </p>
      </section>

      {/* ─── Footer ─── */}
      <footer className="landing-footer">
        RoleBridge — Interview pressure-testing for career-transition candidates.
      </footer>

    </div>
  );
}
