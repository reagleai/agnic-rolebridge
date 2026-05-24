## 2024-05-24 - Code splitting route components
**Learning:** The React application in `frontend/src/App.jsx` loaded all route components eagerly, leading to a large main bundle (733kB). `SetupPage` and `ProfilePage` pull in `pdf.js` indirectly via `pdfExtractor.js`, which is heavy. Eagerly loading these components impacts initial page load time significantly.
**Action:** Use `React.lazy()` and `<Suspense>` in the React Router setup to split route components into separate chunks. Eagerly load the entry point (`LandingPage`) and auth flow (`AuthCallback`), but lazy load the rest.
