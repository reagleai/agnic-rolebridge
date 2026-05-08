/**
 * Section name normalization - mirrors backend validation.ts whitelist.
 * Block D - frontend/src/lib/sectionNormalizer.js
 */

export const SECTION_OPTIONS = [
  { value: 'Work Experience', label: 'Work Experience' },
  { value: 'Projects', label: 'Projects' },
  { value: 'Skills', label: 'Skills' },
];

const SECTION_MAP = {
  // Work Experience variants
  'work experience': 'Work Experience',
  experience: 'Work Experience',
  'professional experience': 'Work Experience',
  'work history': 'Work Experience',
  employment: 'Work Experience',
  'employment history': 'Work Experience',
  'career history': 'Work Experience',
  'professional background': 'Work Experience',
  history: 'Work Experience',
  
  // Projects variants
  projects: 'Projects',
  'personal projects': 'Projects',
  'side projects': 'Projects',
  'academic projects': 'Projects',
  'key projects': 'Projects',
  'selected projects': 'Projects',
  'other projects': 'Projects',
  
  // Skills variants
  skills: 'Skills',
  'technical skills': 'Skills',
  'core competencies': 'Skills',
  technologies: 'Skills',
  'tools & technologies': 'Skills',
  'tools and technologies': 'Skills',
  expertise: 'Skills',
  competencies: 'Skills',
};

export function normalizeSection(name) {
  if (!name || typeof name !== 'string') return null;
  return SECTION_MAP[name.trim().toLowerCase()] || null;
}
