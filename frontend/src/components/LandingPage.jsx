/**
 * RoleBridge V2 - Landing Page
 * Sign-in/Sign-up buttons are in the Navbar.
 * This page focuses on value proposition with a clear hero CTA.
 */
export default function LandingPage() {
  const openSignup = () => {
    if (!import.meta.env.VITE_AGNIC_CLIENT_ID) {
      window.alert('Agnic sign-in is not configured for this deployment.');
      return;
    }

    // Dispatch a custom event that Navbar listens for
    window.dispatchEvent(new CustomEvent('rb:open-auth', { detail: 'signup' }));
  };

  return (
    <div className="landing-page">

      {/* ─── Hero ─── */}
      <section className="landing-section landing-hero">
        <div className="section-label">Interview Pressure-Test · Powered by AI</div>

        <h1 className="landing-hero__headline">
          Your resume got you in.<br />
          <span className="highlight">Can your answers hold up?</span>
        </h1>

        <p className="landing-hero__subhead">
          Most career changers lose offers not in screening - but when an interviewer pushes back on their story.
          RoleBridge takes your resume and target role, then applies intelligent follow-up pressure on the sections that matter most.
        </p>

        <button className="landing-hero__cta" onClick={openSignup}>
          Get Started Free
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
        <p className="landing-hero__cta-note">$5 free credits on signup · No card required</p>
      </section>

      {/* ─── How it Works ─── */}
      <section className="landing-section">
        <h2 className="landing-section__heading">How it works</h2>
        <p className="landing-section__subheading">
          One sign-in. Your credits. Your pace.
        </p>

        <ol className="landing-steps-list">
          {[
            { n: 1, text: 'Sign in with Agnic - new users get $5.00 free credits instantly.' },
            { n: 2, text: 'Upload your resume (PDF or paste), or import from your saved profile.' },
            { n: 3, text: 'Paste the target job description and pick a focus section.' },
            { n: 4, text: 'Choose how many questions (6–15) and start the interview.' },
            { n: 5, text: 'Answer by voice or text. AI asks smart follow-ups when answers are vague.' },
            { n: 6, text: 'Get your full 6-dimension evaluation report on-screen and by email.' },
          ].map(({ n, text }) => (
            <li className="landing-step" key={n}>
              <span className="landing-step__number">{n}</span>
              <div className="landing-step__content">
                <span className="landing-step__text">{text}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ─── Problem ─── */}
      <section className="landing-section">
        <h2 className="landing-section__heading">The real failure mode</h2>
        <p className="landing-problem__intro">
          Your resume is strong enough to get shortlisted. But when the interviewer starts probing -
          asking for specifics, testing ownership, pushing for evidence - your answers get vague.
        </p>

        <ul className="landing-pain-list">
          {[
            'Answers become vague when follow-up questions dig deeper.',
            'You default to old functional language instead of speaking like the role you want.',
            'Ownership and evidence claims weaken under pressure.',
            'You know you\'ve done the work, but can\'t explain it sharply in the moment.',
          ].map((pain, i) => (
            <li className="landing-pain-item" key={i}>
              <span className="landing-pain-item__marker" />
              <span>{pain}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ─── Features ─── */}
      <section className="landing-section">
        <h2 className="landing-section__heading">What this actually does</h2>
        <p className="landing-section__subheading">
          A focused interview simulation grounded in your real background - not generic coaching.
        </p>

        <div className="landing-feature-list">
          {[
            {
              icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '22px', height: '22px' }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>,
              title: 'Grounded in your resume + target JD',
              desc: 'Questions are generated from your actual experience and the specific job you\'re targeting.',
            },
            {
              icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '22px', height: '22px' }}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 9h6M9 12h6M9 15h4" /></svg>,
              title: 'All sections unlocked - you choose depth',
              desc: 'Work Experience, Projects, Skills, Full Resume - and 6 to 15 questions, your call.',
            },
            {
              icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '22px', height: '22px' }}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
              title: 'Follow-up pressure on weak answers',
              desc: 'Vague answers trigger probing follow-ups - exactly like a real interviewer would push.',
            },
            {
              icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '22px', height: '22px' }}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>,
              title: 'Full report - on-screen + email, always',
              desc: '6-dimension evaluation with scores, evidence flags, and specific points to improve.',
            },
          ].map((f, i) => (
            <div className="landing-feature-item" key={i}>
              <div className="landing-feature-item__icon">{f.icon}</div>
              <div className="landing-feature-item__content">
                <span className="landing-feature-item__title">{f.title}</span>
                <span className="landing-feature-item__desc">{f.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Outcomes ─── */}
      <section className="landing-section">
        <h2 className="landing-section__heading">What changes after a session</h2>
        <p className="landing-section__subheading">
          Not motivation. Not tips. Concrete awareness of where your story holds up and where it doesn't.
        </p>

        <ul className="landing-outcome-list">
          {[
            'Sharper articulation of real past experience.',
            'Stronger translation of past work into target-role language.',
            'Better awareness of weak answers before the real interview.',
            'More confidence under follow-up pressure.',
            'Clearer ownership and evidence in your answers.',
          ].map((o, i) => (
            <li className="landing-outcome-item" key={i}>
              <span className="landing-outcome-item__marker" />
              <span>{o}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ─── Footer ─── */}
      <footer className="landing-footer">
        <div className="landing-footer__main">RoleBridge - Interview pressure-testing for career-transition candidates.</div>
        <div className="landing-footer__sub">
          Powered by <strong>Agnic</strong> · Built by Ajay Sharma ·{' '}
          <a href="https://www.linkedin.com/in/workwithajay/" target="_blank" rel="noopener noreferrer">LinkedIn</a>
        </div>
      </footer>

    </div>
  );
}
