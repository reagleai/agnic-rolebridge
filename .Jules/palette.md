## 2026-05-24 - [Keyboard Accessibility for Custom Drop Zones]
**Learning:** Custom 'drop-zone' div elements for file uploads lack native keyboard support, preventing keyboard users from triggering file selection without explicit tabIndex, ARIA roles, and keydown handlers.
**Action:** Always add `tabIndex={0}`, `role="button"`, and `onKeyDown` handlers (checking for Enter/Space) alongside `onClick` when turning non-interactive elements like `div` into interactive upload drop zones. Also ensure visible focus states are styled.
