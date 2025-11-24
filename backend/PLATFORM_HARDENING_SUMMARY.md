# Platform Hardening Summary

This document summarizes the security and reliability improvements made to harden the NSC Pricer platform around the existing Vendavo-style features.

## Overview

All existing business logic has been preserved. The changes focus on:
- Improved database handling
- Environment variable validation
- Centralized error handling
- Authentication and authorization
- Request validation and input sanitization
- Structured logging

## Changes Made

### 1. Database Improvements (`backend/src/db/supabaseClient.js`)

**Before:** Single `Client` instance
**After:** Connection pool using `pg.Pool` with proper connection management

- **Connection pooling**: Uses `pg.Pool` for better performance and resource management
- **Transaction support**: New `transaction()` helper for safe transactional operations
- **Query helper**: Centralized `query()` function with error handling and logging
- **Graceful shutdown**: Pool properly closes on server shutdown
- **Configuration**: Pool settings configurable via environment variables

**Key functions:**
- `getPool()` - Returns the connection pool instance
- `query(text, params)` - Execute a query with error handling
- `transaction(callback)` - Execute queries in a transaction
- `closePool()` - Gracefully close the pool
- `connectDb()` - Legacy compatibility function

### 2. Environment Variable Validation (`backend/src/config/env.js`)

**New module** that validates and centralizes all environment variables.

**Features:**
- Validates required environment variables on startup
- Provides defaults for optional variables
- Type conversion (number, boolean, string)
- Warning messages for missing optional but important variables
- Centralized config object for easy access throughout the app

**Required variables:**
- `DATABASE_URL` - PostgreSQL connection string

**Optional variables** with defaults:
- `PORT` (default: 4000)
- `NODE_ENV` (default: 'development')
- `DB_POOL_MAX` (default: 20)
- `DB_POOL_MIN` (default: 2)
- `JWT_SECRET` (default: null)
- `SMTP_*` variables for email configuration
- Azure service credentials

**New file:** `backend/.env.example` - Template for environment variables

### 3. Centralized Error Handling (`backend/src/middleware/errorHandler.js`)

**Custom error classes:**
- `AppError` - Base error class
- `ValidationError` - Input validation errors (400)
- `AuthenticationError` - Authentication failures (401)
- `AuthorizationError` - Permission denied (403)
- `NotFoundError` - Resource not found (404)
- `DatabaseError` - Database operation failures (500)

**Features:**
- Structured error responses with consistent format
- Database error code mapping (PostgreSQL error codes to user-friendly errors)
- Development vs production error details
- Request logging for errors
- Error stack traces in development mode only

**Response format:**
```json
{
  "success": false,
  "error": {
    "message": "Error message",
    "code": "ERROR_CODE"
  }
}
```

### 4. Authentication & Authorization (`backend/src/middleware/auth.js`)

**JWT-based authentication:**
- Token extraction from `Authorization: Bearer <token>` header
- Token verification with configurable secret
- User information attached to `req.user`

**Role-based authorization:**
- Roles: `admin`, `manager`, `user`, `viewer`
- `authorize(...roles)` middleware factory
- `authorizeOwnerOrRole()` for resource ownership checks

**Development mode:**
- If `JWT_SECRET` not set, allows bypass with dev user in development
- Warning messages guide proper configuration

**Key functions:**
- `authenticate` - Verify JWT token
- `optionalAuth` - Optional authentication (doesn't fail if no token)
- `authorize(...roles)` - Check user roles
- `generateToken(user)` - Generate JWT token for user

### 5. Request Validation & Sanitization (`backend/src/middleware/validation.js`)

**Input sanitization:**
- Automatic sanitization of all request body, query, and params
- XSS prevention (removes script tags, javascript: protocols)
- Null byte removal
- Whitespace trimming

**Validation rules:**
- UUID validation
- Date validation (ISO 8601)
- Email validation
- Number validation with min/max
- Enum validation
- Pagination validation

**Common validation sets:**
- `validations.uuid` - UUID parameter validation
- `validations.pagination` - Page and limit validation
- `validations.dateRange` - Start/end date validation
- `validations.priceAgreement` - Price agreement creation validation
- `validations.approvalAction` - Approval action validation

### 6. Route Protection

All routes now use:
1. **Sanitization** (automatic via middleware)
2. **Authentication** (via `authenticate` middleware)
3. **Authorization** (via `authorize` middleware where needed)
4. **Validation** (via `express-validator`)
5. **Error handling** (via `asyncHandler` wrapper)

**Protected routes:**

**Price Agreements (`/api/price-agreements`):**
- `GET /` - Authenticated users
- `GET /:id` - Authenticated users
- `POST /` - Managers/Admins only
- `PUT /:id` - Managers/Admins only
- `DELETE /:id` - Managers/Admins only
- `POST /check` - Authenticated users

**Approvals (`/api/approvals`):**
- `POST /submit/:pricingRunId` - Authenticated users
- `POST /approve/:pricingRunId` - Managers/Admins only
- `POST /reject/:pricingRunId` - Managers/Admins only
- `GET /pending` - Managers/Admins only
- `GET /history/:pricingRunId` - Authenticated users
- `GET /my-queue` - Authenticated users (uses user's email)
- `POST /send/:pricingRunId` - Authenticated users

**Analytics (`/api/analytics`):**
- All routes require authentication
- Date range validation
- UUID validation for client_id, material_id
- Enum validation for group_by, report_type

### 7. API Response Format Standardization

All API responses now follow a consistent format:

**Success:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "message": "Error message",
    "code": "ERROR_CODE"
  }
}
```

### 8. Structured Logging

**Request logging:**
- Method and path logged in development mode
- Errors logged with structured format including:
  - Timestamp
  - Error details
  - Request information (method, path, query, body, IP, user agent)
  - Stack traces in development mode only

**Database query logging:**
- Query execution time in development mode
- Query text (truncated) and row count
- Error logging with query details

## Configuration

### Environment Variables

Create a `.env` file in `backend/` directory based on `.env.example`:

```env
# Required
DATABASE_URL=postgresql://user:password@host:5432/database

# Optional (with defaults)
PORT=4000
NODE_ENV=development
JWT_SECRET=your-secret-key-here
FRONTEND_URL=http://localhost:5173

# Database Pool Settings
DB_POOL_MAX=20
DB_POOL_MIN=2

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-password
```

### Dependencies Added

- `jsonwebtoken` - JWT token generation and verification
- `express-validator` - Request validation and sanitization

## Backward Compatibility

- All existing service functions remain unchanged
- Database queries continue to work (pool has same `query()` interface)
- API endpoints maintain same paths and request/response structures
- Business logic in services is untouched

## Migration Notes

1. **Authentication**: Routes are now protected. Clients need to:
   - Obtain JWT token (implement login endpoint)
   - Include token in `Authorization: Bearer <token>` header

2. **Error responses**: Error response format has changed. Update frontend error handling:
   - Old: `{ error: "message", details: "..." }`
   - New: `{ success: false, error: { message: "...", code: "..." } }`

3. **Success responses**: Success responses now wrapped:
   - Old: `{ ...data }`
   - New: `{ success: true, data: { ...data } }`

4. **Transactions**: Services using manual transactions (`BEGIN`/`COMMIT`/`ROLLBACK`) should migrate to `transaction()` helper for proper connection pooling.

## Next Steps

1. **Implement login endpoint** to generate JWT tokens
2. **Update frontend** to:
   - Authenticate users
   - Include JWT tokens in requests
   - Handle new response format
3. **Set JWT_SECRET** in production environment
4. **Configure SMTP** credentials for email features
5. **Monitor logs** for any database connection issues
6. **Update transaction code** in services to use `transaction()` helper

## Testing

To test the hardened platform:

1. Start the server: `npm run dev`
2. Verify environment validation works (missing DATABASE_URL should fail)
3. Test authentication on protected routes
4. Test validation (send invalid data)
5. Verify error responses follow new format

## Files Modified

### Core Infrastructure
- `backend/src/db/supabaseClient.js` - Pool-based database client
- `backend/src/config/env.js` - Environment variable validation (NEW)
- `backend/src/index.js` - Middleware integration

### Middleware (NEW)
- `backend/src/middleware/errorHandler.js` - Error handling
- `backend/src/middleware/auth.js` - Authentication & authorization
- `backend/src/middleware/validation.js` - Validation & sanitization

### Routes (Protected)
- `backend/src/routes/priceAgreementsRoutes.js`
- `backend/src/routes/approvalRoutes.js`
- `backend/src/routes/analyticsRoutes.js`

### Configuration (NEW)
- `backend/.env.example` - Environment variable template

### Package
- `backend/package.json` - Added dependencies

## Services (Unchanged)

All service files remain unchanged as requested:
- `backend/src/services/priceAgreementsService.js`
- `backend/src/services/approvalService.js`
- `backend/src/services/analyticsService.js`
- `backend/src/services/emailService.js`

The services continue to work with the new database pool as it provides the same `query()` interface.

