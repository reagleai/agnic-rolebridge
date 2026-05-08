/**
 * Setup page - PDF upload, JD entry, section selection.
 * Block D - frontend/src/components/SetupPage.jsx
 */
import { useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { setupSession } from '../lib/api';
import { extractTextFromPDF } from '../lib/pdfExtractor';
import { SECTION_OPTIONS } from '../lib/sectionNormalizer';

const ERROR_MAP = {
  resume_too_short: 'Resume text is too short (min 200 characters). Try pasting the full text below.',
  jd_too_short: 'Job description is too short (min 100 characters).',
  invalid_section: 'Please select a valid resume section.',
  section_not_found: 'That section was not found in your resume. Please try another.',
  session_not_found: 'Session not found. Please start over.',
  session_already_active: 'This session is already active.',
  llm_rate_limited: 'Service is busy. Please wait a moment and try again.',
  llm_error: 'AI service encountered an error. Please try again in a moment.',
  question_gen_failed: 'Failed to generate questions. Please try again.',
};

export default function SetupPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email || '';

  const [resumeText, setResumeText] = useState('');
  const [jdText, setJdText] = useState('');
  const [sectionName, setSectionName] = useState('Work Experience');
  const [pdfName, setPdfName] = useState('');
  const [pdfError, setPdfError] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const fileRef = useRef(null);

  const handleFile = async (file) => {
    setPdfError('');
    setPdfName(file.name);
    try {
      const text = await extractTextFromPDF(file);
      setResumeText(text);
      setShowPaste(false);
    } catch (err) {
      let msg = 'Failed to read PDF.';
      if (err.message === 'pdf_too_large') msg = 'PDF is too large (max 5MB).';
      if (err.message === 'pdf_no_text') msg = 'This PDF appears to be scanned or has very little text.';
      if (err.message === 'pdf_parse_failed') msg = 'Could not parse this PDF file.';
      setPdfError(msg);
      setShowPaste(true);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (resumeText.length < 200) {
      setError('Resume text must be at least 200 characters.');
      return;
    }
    if (jdText.length < 100) {
      setError('Job description must be at least 100 characters.');
      return;
    }
    setLoading(true);
    try {
      const data = await setupSession(id, {
        resume_text: resumeText,
        jd_text: jdText,
        section_name: sectionName,
      });
      navigate(`/interview/${id}`, {
        state: {
          email,
          firstQuestion: data.first_question,
          sessionExpiresAt: data.session_expires_at,
        },
      });
    } catch (err) {
      const code = err.data?.error || '';
      const backendMsg = err.data?.message || '';
      setError(ERROR_MAP[code] || backendMsg || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-center">
      <div className="card setup-card">
        <h2 className="setup-title">Prepare Your Interview</h2>
        <p className="setup-subtitle">
          Upload your resume, paste the target job description, and pick a
          section to focus on.
        </p>

        <form onSubmit={handleSubmit} className="setup-form">
          {/* PDF Upload */}
          <div className="form-group">
            <label className="form-label">Resume (PDF)</label>
            <div
              className="drop-zone"
              onClick={() => fileRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".pdf"
                style={{ display: 'none' }}
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              {pdfName ? (
                <span className="drop-zone-name">📄 {pdfName}</span>
              ) : (
                <span className="drop-zone-hint">
                  Drop PDF here or click to upload
                </span>
              )}
            </div>
            {pdfError && <p className="form-error">{pdfError}</p>}
          </div>

          {/* Paste fallback */}
          {(showPaste || !pdfName) && (
            <div className="form-group">
              <label className="form-label">
                {showPaste ? 'Paste resume text instead' : 'Or paste resume text'}
              </label>
              <textarea
                className="form-textarea"
                placeholder="Paste your resume text here (min 200 characters)…"
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                rows={6}
              />
              <span className="char-count">
                {resumeText.length} / 200 min
              </span>
            </div>
          )}

          {/* Extracted text preview */}
          {resumeText && !showPaste && pdfName && (
            <div className="form-group">
              <label className="form-label">Extracted text preview</label>
              <div className="text-preview" style={{ whiteSpace: 'pre-wrap' }}>
                {resumeText}
              </div>
            </div>
          )}

          {/* JD */}
          <div className="form-group">
            <label className="form-label">Target Job Description</label>
            <textarea
              className="form-textarea"
              placeholder="Paste the job description here (min 100 characters)…"
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              rows={5}
            />
            <span className="char-count">
              {jdText.length} / 100 min
            </span>
          </div>

          {/* Section */}
          <div className="form-group">
            <label className="form-label">Resume Section to Focus On</label>
            <select
              className="form-select"
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
            >
              {SECTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Generating questions…' : 'Start Interview →'}
          </button>
        </form>
      </div>
    </div>
  );
}
