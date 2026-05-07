/**
 * Section name normalization — mirrors backend validation.ts whitelist.
 * Block D — frontend/src/lib/sectionNormalizer.js
 */

export const SECTION_OPTIONS = [
  { value: 'Work Experience', label: 'Work Experience' },
  { value: 'Projects', label: 'Projects' },
  { value: 'Skills', label: 'Skills' },
];

const SECTION_ALIASES = {
  // Work Experience aliases
  "work experience": "Work Experience",
  "experience": "Work Experience",
  "professional experience": "Work Experience",
  "work history": "Work Experience",
  "employment history": "Work Experience",
  "professional background": "Work Experience",
  "career history": "Work Experience",
  "relevant experience": "Work Experience",
  "internship experience": "Work Experience",
  "employment": "Work Experience",

  // Projects aliases
  "projects": "Projects",
  "personal projects": "Projects",
  "side projects": "Projects",
  "academic projects": "Projects",
  "relevant projects": "Projects",
  "selected projects": "Projects",
  "project experience": "Projects",
  "key projects": "Projects",

  // Skills aliases
  "skills": "Skills",
  "technical skills": "Skills",
  "core competencies": "Skills",
  "key skills": "Skills",
  "skills and tools": "Skills",
  "technical proficiencies": "Skills",
  "tools and technologies": "Skills",
  "competencies": "Skills",
  "expertise": "Skills",
  "tech stack": "Skills",
  "technologies": "Skills"
};

export function normalizeSection(name) {
  if (!name || typeof name !== 'string') return null;
  
  const key = name
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return SECTION_ALIASES[key] || null;
}
