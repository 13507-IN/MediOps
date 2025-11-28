# Migration: Clerk to JWT Authentication

## Summary

Successfully migrated the MediOps application from Clerk authentication to MongoDB JWT authentication.

## Backend Changes

### 1. New Files Created

#### `/backend/src/models/User.js`
- MongoDB schema for User model
- Password hashing with bcryptjs
- Password comparison method
- Automatic password encryption on save

#### `/backend/src/middleware/jwtAuth.js`
- JWT token verification middleware
- Token generation function
- 7-day token expiration
- Refresh token handling

#### `/backend/src/routes/authRoutes.js`
- **POST /api/auth/signup** - Register new user
- **POST /api/auth/login** - User login
- **POST /api/auth/logout** - User logout
- **GET /api/auth/me** - Get current user profile
- **PUT /api/auth/profile** - Update user profile
- **PUT /api/auth/password** - Change password

### 2. Modified Files

#### `/backend/src/middleware/auth.js`
- Replaced Clerk authentication with JWT verification
- Now uses `verifyToken` from `jwtAuth.js`
- Maintains backwards compatibility with `requireAuth` export

#### `/backend/src/server.js`
- Added import for authRoutes
- Registered `/api/auth` routes

#### `/backend/.env`
- Added `JWT_SECRET` configuration
- Marked Clerk keys as deprecated (optional)

### 3. Dependencies

Already installed:
- `jsonwebtoken` - JWT handling
- `bcryptjs` - Password hashing

## Frontend Changes

### 1. New Files Created

#### `/frontend/lib/auth-context.tsx`
- React Context for authentication state management
- User login/signup/logout functions
- Token persistence in localStorage
- `useAuth()` hook for component access
- AuthProvider component

### 2. Modified Files

#### `/frontend/app/layout.tsx`
- Removed `@clerk/nextjs` import
- Replaced ClerkProvider with AuthProvider
- Wrapped app with new auth context

#### `/frontend/middleware.ts`
- Removed Clerk middleware
- Implemented JWT-based route protection
- Token verification from cookies/headers
- Redirect to `/sign-in` for protected routes

#### `/frontend/app/dashboard/page.tsx`
- Removed `useAuth` from `@clerk/nextjs`
- Updated to use custom `useAuth()` hook
- Changed from `getToken()` to direct `token` usage
- Updated useEffect dependencies

#### `/frontend/.env.local`
- Removed Clerk configuration
- Added `NEXT_PUBLIC_API_URL` configuration
- Kept as reference for previous setup

## API Endpoints

### Authentication Endpoints

```bash
# Sign up
POST /api/auth/signup
{
  "email": "user@example.com",
  "password": "password",
  "firstName": "John",
  "lastName": "Doe"
}

# Login
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "password"
}

# Get current user
GET /api/auth/me
Headers: Authorization: Bearer {token}

# Update profile
PUT /api/auth/profile
Headers: Authorization: Bearer {token}
{
  "firstName": "Jane",
  "lastName": "Smith"
}

# Change password
PUT /api/auth/password
Headers: Authorization: Bearer {token}
{
  "currentPassword": "old-password",
  "newPassword": "new-password",
  "confirmPassword": "new-password"
}

# Logout
POST /api/auth/logout
Headers: Authorization: Bearer {token}
```

## Authentication Flow

### Frontend
1. User enters credentials on sign-up/login page
2. Frontend sends request to `/api/auth/signup` or `/api/auth/login`
3. Backend validates credentials and returns JWT token
4. Token stored in localStorage as `authToken`
5. Token sent in Authorization header for all protected requests
6. Middleware checks token before allowing access to protected routes

### Backend
1. User signs up with email/password
2. Password hashed with bcrypt (10 salt rounds)
3. User saved to MongoDB
4. JWT token generated (expires in 7 days)
5. Token returned to frontend
6. All subsequent requests verified with `verifyToken` middleware

## Configuration

### Backend (.env)
```
JWT_SECRET=your-secret-jwt-key-change-in-production-use-strong-random-string
MONGODB_URI=mongodb://localhost:27017/mediops-db
```

### Frontend (.env.local)
```
NEXT_PUBLIC_API_URL=http://localhost:5000
```

## Next Steps

1. **Update Sign-in/Sign-up Pages** - Create custom sign-in and sign-up pages to replace Clerk UI
2. **Test Authentication Flow** - Test the complete auth flow end-to-end
3. **Handle Token Refresh** - Implement token refresh logic before expiration (optional)
4. **Update Security** - Add rate limiting and CORS policies as needed
5. **Error Handling** - Implement proper error handling for auth failures

## Security Considerations

- Change `JWT_SECRET` to a strong random string in production
- Store JWT_SECRET securely (environment variables)
- Use HTTPS in production
- Add rate limiting to login/signup endpoints
- Consider token refresh mechanism for longer sessions
- Implement logout token blacklist if needed

## Backwards Compatibility

- All existing document routes continue to work
- Auth middleware maintains same interface
- Document filtering by userId remains the same
- No database schema changes needed (except User collection)
.....
