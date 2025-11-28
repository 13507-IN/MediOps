<!-- Improved README for clarity and faster onboarding -->
# MediOps — Healthcare Management Platform

A full-stack healthcare management platform with PDF OCR (Google Vision), resource & document management, and predictive analytics. This repo contains both the backend (Express) and the frontend (Next.js) used by MediOps.

## Highlights
- PDF upload + OCR (Google Cloud Vision)
- Clerk authentication
- MongoDB data store (Mongoose models)
- Dashboard with analytics and prediction components
- Modern frontend (Next.js + TypeScript + Tailwind)

## Quick links
- Backend docs: `backend/README.md`
- Setup notes: `SETUP.md` and `QUICKSTART.md`

## Quick start (development)
Follow these steps to run the app locally.

Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- Google Cloud project with Vision API enabled (service account JSON)
- Clerk account for authentication

Backend
1. Open a terminal and install dependencies:

	cd backend
	npm install

2. Create an env file from the example and fill in secrets:

	cp .env.example .env
	# edit .env and add MONGODB_URI, Clerk keys, GOOGLE_APPLICATION_CREDENTIALS, etc.

3. Start the backend in dev mode:

	npm run dev

Frontend
1. In a separate terminal, install frontend deps:

	cd frontend
	npm install

2. Add a local env file:

	cp .env.example .env.local
	# add Clerk publishable key, NEXT_PUBLIC_API_URL (e.g. http://localhost:5000)

3. Start the Next.js dev server:

	npm run dev

By default:
- Frontend: http://localhost:3000
- Backend: http://localhost:5000

## Environment variables (overview)
See the `.env.example` files in `backend/` and `frontend/` for the full list. Key variables include:
- BACKEND: PORT, MONGODB_URI, GOOGLE_APPLICATION_CREDENTIALS, FRONTEND_URL, MAX_FILE_SIZE
- FRONTEND: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, NEXT_PUBLIC_API_URL

## Project layout

```
/backend    # Express API, OCR integration, Mongoose models, uploads
  /src
  package.json

/frontend   # Next.js (app router), components, pages, styles
  package.json

SETUP.md, QUICKSTART.md, backend/README.md
```

## APIs (examples)
- GET /health — health check
- POST /api/documents/upload — upload PDF (multipart/form-data, auth required)
- GET /api/documents — list documents (auth required)
- GET /api/documents/:id — fetch document details
- DELETE /api/documents/:id — remove document

See `backend/README.md` for full API docs and payload examples.

## Development tips
- Use a local MongoDB or MongoDB Atlas for easy setup.
- Ensure `GOOGLE_APPLICATION_CREDENTIALS` points to the service account JSON for Vision API.
- When adding new environment variables, update the examples in each `backend`/`frontend` folder.

## Testing
Run tests (if present) inside each package:

Backend:

  cd backend
  npm test

Frontend:

  cd frontend
  npm test

## Deployment
- Backend: deploy to Cloud providers (Railway, Render, Heroku). Provide env vars and connect to MongoDB Atlas.
- Frontend: deploy to Vercel or Netlify. Configure Clerk redirect URLs and environment variables.

## Contributing
1. Fork the repo
2. Create a branch: `git checkout -b feat/your-feature`
3. Commit and push
4. Open a PR describing the change and any migration notes

Please follow the existing code style and add tests for new business logic.

## License
ISC

## Support
If you get stuck, check:
- `SETUP.md` and `QUICKSTART.md` for environment-specific steps
- `backend/README.md` for API details

If you still need help, open an issue describing the problem and environment (OS, Node version, error output).

---
Updated: improved onboarding, shorter Quick Start, and clearer links to existing documentation.