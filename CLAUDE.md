# Gravix Sales Trainer — Frontend Context

Stack:
- Next.js App Router
- TypeScript
- Tailwind CSS
- Dark enterprise UI
- Frontend communicates ONLY through /api/proxy

Architecture:
- Multi-tenant org-scoped platform
- Minimal premium interface
- Responsive layouts
- CRM + AI coaching workflows

Rules:
- Do not invent API routes
- Do not invent DB fields
- Preserve existing route structure
- Small reversible patches only
- Avoid unrelated refactors
- Reuse existing components/styles
- Maintain org-scoped architecture
- Keep styling consistent across pages
- Prefer simple scalable solutions
- Preserve existing business logic

Important:
- Use existing proxyFetch patterns
- Maintain App Router conventions
- Avoid massive component abstractions
- Keep dashboard UX clean and fast
- Do not break current pages/routes
- Prefer additive changes over rewrites

Current Priorities:
- Global app shell
- Persistent sidebar navigation
- Workflow consolidation
- CRM workspace polish
- Coaching workspace UX
- Responsive layouts
- Testing infrastructure
- Platform consistency
- Enterprise dashboard feel

UI Direction:
- Clean dark enterprise UI
- Compact information density
- Minimal clutter
- Strong spacing consistency
- Smooth navigation experience
- Sidebar-first workflow navigation
- Reduce isolated/disconnected pages

Current Navigation Direction:
Workspace
- Dashboard
- Calls
- CRM
- Accounts
- Contacts

Coaching
- Assignments
- Replay Centre
- Sparring
- AI Feedback

Live
- Whisperer
- Live Calls

Admin
- Team
- Analytics
- Settings
- Integrations