# Quick Start Guide

Get your Healthcare Management System up and running in 5 minutes!

## ⚡ Fast Setup

### Step 1: Install Dependencies
```bash
# Backend
cd backend
npm install

# Frontend
cd frontend
npm install --legacy-peer-deps
```

### Step 2: Environment Files

Environment files are already created. Just verify they exist:
- `backend/.env` ✓
- `frontend/.env.local` ✓

### Step 3: Start MongoDB

MongoDB is already running on localhost:27017

### Step 4: Start Servers

```bash
# Terminal 1 - Backend
cd backend
PORT=5001 npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

### Step 5: Access Application

- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:5001

## 🎯 Usage

1. Sign up at http://localhost:3000/sign-up
2. Upload PDF at http://localhost:3000/upload (5MB-10MB)
3. View results at http://localhost:3000/dashboard

## ⚠️ Important Notes

- **Google Cloud Vision**: Required for OCR. Set up at https://console.cloud.google.com/
- **Port 5001**: Backend uses 5001 (not 5000) due to macOS conflicts
 - **Clerk Dashboard**: Configure authentication methods in the Clerk Dashboard. This project uses email/password (no phone/SMS-based sign-in in the UI).

## 📚 Documentation

See [README.md](./README.md) for full documentation
......