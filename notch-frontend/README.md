# Notch — Frontend

The React single-page frontend for [Notch](../README.md). Built with Vite + React 19, it consumes the backend REST API and manages a JWT-based session.

> This is one half of a monorepo. For the full-stack overview, architecture, and deployment, see the [root README](../README.md).

## Stack

- **React 19** with **React Router 7**
- **Vite** build tooling
- **Axios** for HTTP, with request/response interceptors (auto-attach JWT, handle `401`)
- **React Context + `useReducer`** for auth state (persisted to `localStorage`)
- **Oxlint** for linting

## Getting Started

```bash
npm install
cp .env.example .env     # optional for local dev
npm run dev              # http://localhost:5173
```

During local development you can leave `VITE_API_URL` unset — the dev server proxies `/api` to the backend at `http://localhost:3000` (see [vite.config.js](vite.config.js)). Make sure the backend is running.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start the Vite dev server (port 5173) |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build |
| `npm run lint` | Run Oxlint |
| `npm test` | Run the API + auth-context unit tests |

## Environment

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | ❌ locally / ✅ in prod | Backend API base URL including `/api/v1` (e.g. `https://your-api.up.railway.app/api/v1`) |

## Project Structure

```
src/
├── pages/        # AuthPage, DashboardPage, NotesListPage, NoteDetailPage
├── components/   # LoginForm, SignupForm, NoteCard, CreateNoteModal, Navbar, ProtectedRoute, …
├── context/      # AuthContext + authReducer (JWT session state)
├── services/     # api (Axios instance), authService, notesService
└── App.jsx       # Route definitions
```

## Routes

| Route | Access | Purpose |
|-------|--------|---------|
| `/login`, `/signup` | Public | Authentication |
| `/dashboard` | Protected | Landing page after login |
| `/notes` | Protected | Notes list (create / delete / paginate) |
| `/notes/:id` | Protected | Note detail + edit |

## Deployment (Vercel)

Set the root directory to `notch-frontend`, build with `npm run build`, and serve `dist/`. SPA routing is handled by [vercel.json](vercel.json). Set `VITE_API_URL` to the deployed backend URL.
