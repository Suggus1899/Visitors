# Implementation Plan: Security Critical Improvements

## Overview

This implementation plan addresses 12 critical and high-priority security vulnerabilities identified in the AF Visitor System security audit. The plan follows a 6-phase approach over 10 days, implementing secure key management, robust authentication, password policies, XSS protection, account lockout, comprehensive auditing, email services, and photo validation.

The implementation uses TypeScript for both backend (Express + Sequelize + SQLCipher) and frontend (React + Vite), with Electron 40 for the desktop application.

## Tasks

### Phase 1: Foundation (Days 1-2)

- [ ] 1. Set up database schema and configuration
  - [ ] 1.1 Create database migration for password policy fields
    - Create migration file `add-password-policy-fields.sql`
    - Add `mustChangePassword` BOOLEAN field (default: 1)
    - Add `passwordChangedAt` DATETIME field (nullable)
    - _Requirements: 5.1, 5.2_
  
  - [ ] 1.2 Create database migration for account lockout fields
    - Create migration file `add-account-lockout-fields.sql`
    - Add `loginAttempts` INTEGER field (default: 0)
    - Add `lockedUntil` DATETIME field (nullable)
    - _Requirements: 9.1, 9.2_
  
  - [ ] 1.3 Create database migration for extended audit log fields
    - Create migration file `extend-audit-log-fields.sql`
    - Add `ipAddress` VARCHAR(45), `userAgent` TEXT, `method` VARCHAR(10)
    - Add `path` VARCHAR(255), `statusCode` INTEGER, `duration` INTEGER
    - Add `severity` VARCHAR(20) with default 'low'
    - _Requirements: 10.5_

  - [ ] 1.4 Update User model with new fields
    - Add `mustChangePassword`, `passwordChangedAt`, `loginAttempts`, `lockedUntil` fields to User model
    - Update TypeScript interface definitions
    - _Requirements: 5.1, 5.2, 9.1, 9.2_
  
  - [ ] 1.5 Update AppConfig with security settings
    - Add `bcryptRounds` configuration (default: 12)
    - Add `maxLoginAttempts` configuration (default: 5)
    - Add `lockoutDurationMinutes` configuration (default: 15)
    - Add environment variable parsing for BCRYPT_ROUNDS
    - _Requirements: 8.4, 8.5, 8.6_
  
  - [ ] 1.6 Update .env.example with new variables
    - Add BCRYPT_ROUNDS, MAX_LOGIN_ATTEMPTS, LOCKOUT_DURATION_MINUTES
    - Add SMTP configuration variables (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD)
    - Remove hardcoded secrets (DB_ENCRYPTION_KEY, JWT_SECRET, etc.)
    - Document all new environment variables
    - _Requirements: 2.8, 11.1_
  
  - [ ] 1.7 Run migrations on development database
    - Execute all three migration files
    - Verify schema changes are applied correctly
    - Test rollback functionality
    - _Requirements: 5.1, 5.2, 9.1, 9.2, 10.5_

- [ ] 2. Implement core security services
  - [ ] 2.1 Implement PasswordPolicy service
    - Create `server/src/domain/services/PasswordPolicy.ts`
    - Implement validation rules: min 12 chars, max 128 chars, complexity requirements
    - Create `common-passwords.ts` with top 1000 common passwords as Set
    - Implement `validate()` method returning ValidationResult with specific errors
    - Implement `isCommonPassword()` method for dictionary check
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_

  - [ ]* 2.2 Write property test for PasswordPolicy
    - **Property 7: Password Policy Validation**
    - **Validates: Requirements 4.1-4.8**
    - Test that valid passwords meeting all requirements pass validation
    - Test that invalid passwords return specific error messages
  
  - [ ] 2.3 Implement KeyManager for Electron
    - Create `electron/services/KeyManager.ts` as singleton
    - Implement `initialize()`, `getKey()`, `setKey()`, `generateKey()` methods
    - Integrate keytar for OS keychain access
    - Implement key generation using crypto.randomBytes (32 bytes for AES, 64 bytes for JWT)
    - Create key setup dialog for first-time initialization
    - Implement warning dialog for master key backup
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_
  
  - [ ]* 2.4 Write property test for KeyManager
    - **Property 1: Key Storage Round Trip**
    - **Validates: Requirements 1.3, 1.4**
    - Test that stored keys can be retrieved with same value
    - **Property 2: Generated Key Lengths**
    - **Validates: Requirements 1.6, 2.2, 2.3, 2.4**
    - Test that generated keys have correct byte lengths
  
  - [ ] 2.5 Update JwtAuthService with refresh token support
    - Update `server/src/infrastructure/services/JwtAuthService.ts`
    - Implement `generateAccessToken()` with 15-minute expiration
    - Implement `generateRefreshToken()` with 7-day expiration
    - Implement `verifyAccessToken()` and `verifyRefreshToken()` methods
    - Implement `refreshAccessToken()` method
    - _Requirements: 3.1, 3.4, 3.5, 3.6_
  
  - [ ]* 2.6 Write property test for JWT token durations
    - **Property 4: Token Duration Validation**
    - **Validates: Requirements 3.4, 3.5**
    - Test that Access Tokens expire in 15 minutes
    - Test that Refresh Tokens expire in 7 days

  - [ ] 2.7 Implement EmailService with nodemailer
    - Create `server/src/infrastructure/services/EmailService.ts`
    - Implement SMTP configuration from environment variables
    - Implement `sendPasswordResetEmail()` with token and reset link
    - Implement `sendPasswordChangedEmail()` for confirmation
    - Implement `isConfigured()` to check if SMTP is set up
    - Create email templates for password reset and confirmation
    - Handle errors gracefully without exposing technical details
    - _Requirements: 11.1, 11.2, 11.6, 11.7, 11.10, 11.12_
  
  - [ ]* 2.8 Write unit tests for core services
    - Test PasswordPolicy validation rules and error messages
    - Test KeyManager key generation and storage (mock keytar)
    - Test JwtAuthService token generation and verification
    - Test EmailService template generation and error handling

- [ ] 3. Checkpoint - Verify foundation is complete
  - Ensure all migrations run successfully
  - Ensure all core services have passing tests
  - Verify configuration is properly set up
  - Ask the user if questions arise

### Phase 2: Backend Authentication & Authorization (Days 3-4)

- [ ] 4. Implement authentication endpoints and middleware
  - [ ] 4.1 Implement refresh token endpoint
    - Create POST `/api/v1/auth/refresh` endpoint
    - Accept refresh token in request body
    - Verify refresh token validity
    - Generate new access token
    - Return new access token to client
    - _Requirements: 3.6, 3.10_
  
  - [ ] 4.2 Implement password change endpoint
    - Create POST `/api/v1/auth/change-password` endpoint
    - Accept current password, new password, confirm password
    - Verify current password is correct
    - Validate new password against PasswordPolicy
    - Hash new password with bcrypt 12 rounds
    - Update user password, set mustChangePassword=false, update passwordChangedAt
    - Send confirmation email
    - _Requirements: 5.4, 5.5, 5.7, 5.8, 5.10, 11.10_

  - [ ] 4.3 Implement mustChangePassword middleware
    - Create `server/src/middleware/mustChangePassword.ts`
    - Check if user.mustChangePassword is true
    - Allow access to `/api/v1/auth/change-password` endpoint
    - Return HTTP 403 with code PASSWORD_CHANGE_REQUIRED for other endpoints
    - _Requirements: 5.3, 5.4_
  
  - [ ]* 4.4 Write property test for mustChangePassword enforcement
    - **Property 9: Must Change Password Enforcement**
    - **Validates: Requirements 5.3**
    - Test that users with mustChangePassword=true cannot access protected endpoints
    - Test that password change endpoint is always accessible
  
  - [ ] 4.5 Update auth middleware to verify access tokens
    - Update `server/src/middleware/auth.ts`
    - Extract token from Authorization header
    - Verify token using JwtAuthService
    - Attach user info to request object
    - Handle token expiration errors
    - _Requirements: 3.1, 3.8_
  
  - [ ] 4.6 Implement account lockout logic in login
    - Update login use case in `server/src/application/usecases/auth/Login.usecase.ts`
    - Check if account is locked (lockedUntil > now) before verifying password
    - Return error with remaining lockout time if locked
    - Increment loginAttempts on failed login
    - Set lockedUntil to 15 minutes in future when loginAttempts reaches 5
    - Reset loginAttempts and lockedUntil on successful login
    - Create audit log with ACCOUNT_LOCKED action and high severity
    - Notify user of remaining attempts after 3rd failed attempt
    - _Requirements: 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.10_
  
  - [ ]* 4.7 Write property tests for account lockout
    - **Property 17: Account Lockout Check on Login**
    - **Validates: Requirements 9.3, 9.4**
    - **Property 18: Login Attempt Increment on Failure**
    - **Validates: Requirements 9.5**
    - **Property 19: Account Lockout Trigger**
    - **Validates: Requirements 9.6**
    - **Property 20: Login Attempt Reset on Success**
    - **Validates: Requirements 9.7**

  - [ ] 4.8 Update bcrypt rounds to 12
    - Update all password hashing to use config.bcryptRounds (12)
    - Update seeder to use 12 rounds
    - Update registration, password change, and password reset flows
    - _Requirements: 8.1, 8.2, 8.3_
  
  - [ ] 4.9 Implement automatic password re-hashing on login
    - In login use case, check bcrypt rounds of stored password hash
    - If rounds < config.bcryptRounds, re-hash password with new rounds
    - Update user password in database transparently
    - _Requirements: 8.7, 8.8_
  
  - [ ]* 4.10 Write property test for bcrypt rounds
    - **Property 15: Bcrypt Rounds for New Passwords**
    - **Validates: Requirements 8.1**
    - Test that newly hashed passwords use 12 rounds
    - **Property 16: Bcrypt Compatibility and Migration**
    - **Validates: Requirements 8.7, 8.8**
    - Test that old passwords (8 rounds) are re-hashed on successful login

- [ ] 5. Implement password reset flow with email
  - [ ] 5.1 Implement forgot password endpoint
    - Create POST `/api/v1/auth/forgot-password` endpoint
    - Accept username or email
    - Generate secure 32-byte token using crypto.randomBytes
    - Hash token with SHA-256 before storing
    - Set resetTokenExpiry to 15 minutes in future
    - Send password reset email with unhashed token
    - Return success message without revealing if user exists
    - _Requirements: 11.3, 11.4, 11.5, 11.6_
  
  - [ ] 5.2 Implement reset password endpoint
    - Create POST `/api/v1/auth/reset-password` endpoint
    - Accept token and new password
    - Hash received token with SHA-256
    - Find user by hashed token
    - Verify token has not expired
    - Validate new password against PasswordPolicy
    - Hash new password with bcrypt 12 rounds
    - Update password, clear resetToken and resetTokenExpiry
    - Set mustChangePassword=false
    - Send password changed confirmation email
    - _Requirements: 11.8, 11.9, 11.10_

  - [ ]* 5.3 Write property tests for password reset
    - **Property 26: Password Reset Token Generation**
    - **Validates: Requirements 11.3**
    - **Property 27: Password Reset Token Hashing**
    - **Validates: Requirements 11.4**
    - **Property 28: Password Reset Token Expiration**
    - **Validates: Requirements 11.5**
    - **Property 30: Password Reset Token Validation**
    - **Validates: Requirements 11.8**
    - **Property 31: Password Reset Token Invalidation**
    - **Validates: Requirements 11.9**
  
  - [ ]* 5.4 Write unit tests for authentication flows
    - Test refresh token endpoint with valid and expired tokens
    - Test password change with valid and invalid passwords
    - Test mustChangePassword middleware blocking
    - Test account lockout and unlock flows
    - Test password reset complete flow

- [ ] 6. Implement auditing and validation
  - [ ] 6.1 Extend AuditLog model with new fields
    - Update `server/src/models/AuditLog.ts` (or ActivityLog.ts)
    - Add ipAddress, userAgent, method, path, statusCode, duration, severity fields
    - Update TypeScript interface definitions
    - _Requirements: 10.5_
  
  - [ ] 6.2 Update audit middleware with comprehensive logging
    - Update `server/src/middleware/auditor.ts`
    - Capture request information: ipAddress, userAgent, method, path
    - Capture response information: statusCode, duration
    - Implement automatic severity determination based on status code and action
    - Create audit log asynchronously using res.on('finish')
    - Handle audit log errors without failing main operation
    - _Requirements: 10.6, 10.7, 10.8, 10.9_
  
  - [ ] 6.3 Implement audit logging for all security events
    - Add audit logs for: LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT
    - Add audit logs for: PASSWORD_CHANGED, PASSWORD_RESET_REQUESTED, PASSWORD_RESET_COMPLETED
    - Add audit logs for: ACCOUNT_LOCKED, ACCOUNT_UNLOCKED
    - Add audit logs for: ACCESS_DENIED (403), UNAUTHORIZED_ACCESS (401)
    - Add audit logs for: VISITOR_CREATED, VISITOR_UPDATED, VISITOR_DELETED
    - Add audit logs for: VISIT_CHECKIN, VISIT_CHECKOUT, VISIT_ADMITTED
    - Add audit logs for: BACKUP_CREATED, BACKUP_RESTORED, DATA_EXPORTED
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [ ]* 6.4 Write property tests for audit logging
    - **Property 23: Audit Log Completeness**
    - **Validates: Requirements 10.5**
    - Test that all required fields are present in audit logs
    - **Property 24: Audit Severity Determination**
    - **Validates: Requirements 10.7**
    - Test automatic severity assignment based on status codes
    - **Property 25: Audit Log Error Resilience**
    - **Validates: Requirements 10.9**
    - Test that audit errors don't fail main operations
  
  - [ ] 6.5 Implement backend photo validation
    - Update `server/src/utils/PhotoStorage.ts`
    - Validate photo type (JPEG/PNG) by checking base64 prefix
    - Validate photo size (max 5MB) by calculating from base64 length
    - Throw specific errors for invalid type or size
    - _Requirements: 12.1, 12.2, 12.4, 12.5_
  
  - [ ]* 6.6 Write unit tests for backend validation
    - Test audit middleware captures all required information
    - Test severity determination for different status codes
    - Test async audit log creation
    - Test photo validation for valid and invalid inputs

- [ ] 7. Checkpoint - Verify backend implementation is complete
  - Ensure all authentication endpoints work correctly
  - Ensure account lockout triggers and unlocks properly
  - Ensure audit logs are created for all security events
  - Ensure password reset flow works end-to-end
  - Ask the user if questions arise

### Phase 3: Frontend Authentication & Token Management (Days 5-6)

- [x] 8. Implement AuthService and token management
  - [x] 8.1 Implement AuthService singleton
    - Create `client/src/services/AuthService.ts`
    - Implement singleton pattern
    - Store Access Token in private class variable (memory only)
    - Store Refresh Token in localStorage
    - Implement login() method to authenticate and store tokens
    - Implement logout() method to clear tokens
    - Implement getAccessToken() method
    - Implement refreshAccessToken() method to get new access token
    - Implement isAuthenticated() method
    - _Requirements: 3.1, 3.2, 3.3, 3.6, 3.9_

  - [ ]* 8.2 Write property test for token storage
    - **Property 3: Access Token Memory Storage**
    - **Validates: Requirements 3.2, 3.11**
    - Test that Access Token is never stored in localStorage
    - Test that Access Token is cleared when application closes
  
  - [x] 8.3 Update API interceptors for token injection
    - Update `client/src/services/api.v1.ts`
    - Add request interceptor to inject Access Token in Authorization header
    - Implement automatic token refresh on 401 response
    - Retry original request with new token after refresh
    - Redirect to login if refresh fails
    - _Requirements: 3.6, 3.7, 3.8_
  
  - [ ]* 8.4 Write property test for token injection
    - **Property 6: HTTP Request Token Injection**
    - **Validates: Requirements 3.8**
    - Test that all authenticated requests include Authorization header
  
  - [x] 8.5 Implement response interceptor for error handling
    - Add response interceptor to handle PASSWORD_CHANGE_REQUIRED error
    - Dispatch custom event 'password-change-required' when detected
    - Handle ACCOUNT_LOCKED error with remaining time display
    - Handle VALIDATION_ERROR with specific error messages
    - Implement generic error handling for network errors
    - _Requirements: 5.3, 9.4_
  
  - [ ]* 8.6 Write property test for token refresh
    - **Property 5: Token Refresh on Expiration**
    - **Validates: Requirements 3.6**
    - Test that expired Access Token triggers automatic refresh
    - Test that valid Refresh Token obtains new Access Token
  
  - [ ]* 8.7 Write unit tests for AuthService
    - Test login stores tokens correctly (access in memory, refresh in localStorage)
    - Test logout clears all tokens
    - Test automatic refresh on 401
    - Test redirect to login when refresh fails
    - Test token injection in requests

- [x] 9. Implement PasswordChangeModal component
  - [x] 9.1 Create PasswordChangeModal component
    - Create `client/src/components/PasswordChangeModal.tsx`
    - Implement non-closable modal (no X button, no backdrop click)
    - Create form with: current password, new password, confirm password fields
    - Add password visibility toggles
    - Display password policy requirements
    - Show validation errors from server
    - _Requirements: 5.6, 5.7_

  - [x] 9.2 Implement password change submission
    - Call POST `/api/v1/auth/change-password` endpoint
    - Display validation errors if password policy fails
    - Close modal and allow navigation on success
    - Show success toast notification
    - _Requirements: 5.7, 5.8_
  
  - [x] 9.3 Integrate modal with global error handler
    - Listen for 'password-change-required' custom event
    - Show modal when event is triggered
    - Ensure modal appears on any PASSWORD_CHANGE_REQUIRED error
    - _Requirements: 5.3, 5.6_
  
  - [ ]* 9.4 Write unit tests for PasswordChangeModal
    - Test modal displays when PASSWORD_CHANGE_REQUIRED is received
    - Test modal cannot be closed until password is changed
    - Test form validation
    - Test successful password change flow

- [x] 10. Implement sanitization and XSS protection
  - [x] 10.1 Install and configure DOMPurify
    - Install DOMPurify package
    - Create `client/src/utils/sanitizer.ts`
    - _Requirements: 6.1_
  
  - [x] 10.2 Implement sanitization functions
    - Implement sanitizeInput() to remove all HTML tags
    - Implement sanitizeHTML() to allow only safe tags (b, i, em, strong, p, br)
    - Configure DOMPurify with appropriate settings
    - _Requirements: 6.2, 6.3_
  
  - [ ]* 10.3 Write property tests for sanitization
    - **Property 12: HTML Tag Removal in sanitizeInput**
    - **Validates: Requirements 6.2, 6.7, 6.8**
    - Test that all HTML tags are removed while preserving text
    - **Property 13: Safe HTML Tag Allowlist in sanitizeHTML**
    - **Validates: Requirements 6.3**
    - Test that only safe tags are allowed
    - **Property 14: XSS Prevention in User Inputs**
    - **Validates: Requirements 6.7**
    - Test that malicious scripts are removed
  
  - [x] 10.4 Update components to use sanitization
    - Update ActiveVisits.tsx to sanitize visitor names, companies, notes
    - Update VisitForm.tsx to sanitize input fields
    - Update WaitingVisits.tsx to sanitize displayed data
    - Update VisitDetailsModal.tsx to sanitize all user-generated content
    - Use useMemo to cache sanitized values for performance
    - _Requirements: 6.4, 6.5, 6.6_

  - [ ]* 10.5 Write unit tests for sanitization integration
    - Test sanitization in ActiveVisits component
    - Test sanitization in VisitForm component
    - Test XSS payload prevention in rendering
    - Test text preservation while removing dangerous code

- [x] 11. Implement photo validation
  - [x] 11.1 Create PhotoValidator utility
    - Create `client/src/utils/photoValidator.ts`
    - Implement validateImage() to check type and size
    - Implement getImageType() to extract MIME type from base64
    - Implement getImageSize() to calculate bytes from base64
    - Define allowed types: JPEG and PNG
    - Define max size: 5MB
    - _Requirements: 12.1, 12.2, 12.4, 12.5_
  
  - [ ]* 11.2 Write property tests for photo validation
    - **Property 34: Photo Type Validation**
    - **Validates: Requirements 12.1, 12.2**
    - Test that only JPEG and PNG are accepted
    - **Property 36: Photo Size Calculation**
    - **Validates: Requirements 12.4**
    - Test correct size calculation from base64
    - **Property 37: Photo Size Limit Enforcement**
    - **Validates: Requirements 12.5, 12.6**
    - Test that photos over 5MB are rejected
  
  - [x] 11.3 Update PhotoCapture component with validation
    - Update `client/src/components/PhotoCapture.tsx`
    - Validate photo after webcam capture
    - Validate photo after file upload
    - Display error toast for invalid type or size
    - Prevent upload to server if validation fails
    - Show specific error messages (type vs size)
    - _Requirements: 12.3, 12.6, 12.7, 12.8, 12.9_
  
  - [ ]* 11.4 Write unit tests for PhotoCapture validation
    - Test validation after webcam capture
    - Test validation after file upload
    - Test error display for invalid photos
    - Test upload prevention on validation failure

- [ ] 12. Checkpoint - Verify frontend implementation is complete
  - Ensure AuthService stores tokens correctly
  - Ensure automatic token refresh works
  - Ensure PasswordChangeModal appears and functions correctly
  - Ensure sanitization prevents XSS in all components
  - Ensure photo validation rejects invalid uploads
  - Ask the user if questions arise


### Phase 4: Electron Security Integration (Day 7)

- [ ] 13. Implement KeyManager in Electron main process
  - [ ] 13.1 Create KeyManager service
    - Create `electron/services/KeyManager.ts`
    - Implement singleton pattern
    - Integrate keytar for keychain access
    - Implement initialize() to check for existing keys
    - Implement generateKey() using crypto.randomBytes
    - Implement getKey() and setKey() for keychain operations
    - Cache keys in memory after loading
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
  
  - [ ] 13.2 Create key setup dialog
    - Create dialog for first-time key setup
    - Offer options: generate automatically or enter manually
    - If generating, create keys with correct lengths (32 bytes for AES, 64 bytes for JWT)
    - Display master key to user with warning to save it
    - If entering manually, accept master key and derive other keys
    - Store all keys in keychain using keytar
    - _Requirements: 1.2, 1.6, 1.7_
  
  - [ ] 13.3 Integrate KeyManager with server startup
    - Update `electron/main.ts` to initialize KeyManager before starting server
    - Retrieve keys from keychain
    - Pass keys to server via environment variables or IPC
    - Prevent server startup if keys are not configured
    - _Requirements: 1.4, 1.8_
  
  - [ ] 13.4 Remove hardcoded secrets from Electron code
    - Remove all hardcoded DB_ENCRYPTION_KEY, ENCRYPTION_KEY, JWT_SECRET, BACKUP_PASSWORD
    - Verify no secrets remain in code
    - Update .gitignore to exclude any sensitive files
    - _Requirements: 1.1, 2.8_
  
  - [ ]* 13.5 Write unit tests for KeyManager
    - Test key generation with correct lengths
    - Test keychain storage and retrieval (mock keytar)
    - Test initialization flow
    - Test error handling when keychain is unavailable

- [ ] 14. Implement Content Security Policy
  - [ ] 14.1 Configure CSP in BrowserWindow
    - Update `electron/main.ts` to set CSP headers
    - Set default-src 'self'
    - Set script-src 'self'
    - Set style-src 'self' 'unsafe-inline' (for Tailwind CSS)
    - Set img-src 'self' data: blob: (for base64 images)
    - Set connect-src 'self' http://localhost:3000
    - Set object-src 'none'
    - Set base-uri 'self'
    - Set form-action 'self'
    - Set frame-ancestors 'none'
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10_

  - [ ] 14.2 Enable sandbox mode
    - Update BrowserWindow webPreferences to set sandbox: true
    - Ensure contextIsolation: true and nodeIntegration: false
    - Test that renderer process is properly sandboxed
    - _Requirements: 7.11_
  
  - [ ] 14.3 Test CSP violations
    - Attempt to load external scripts (should be blocked)
    - Attempt to execute inline scripts (should be blocked)
    - Verify CSP violations appear in browser console
    - Verify legitimate resources load correctly
    - _Requirements: 7.12_
  
  - [ ]* 14.4 Write integration tests for Electron security
    - Test KeyManager initialization on first run
    - Test key retrieval from keychain
    - Test CSP blocks unauthorized resources
    - Test sandbox mode restrictions

- [ ] 15. Test keychain integration on all platforms
  - [ ] 15.1 Test on Windows
    - Verify keytar works with Windows Credential Vault
    - Test key storage and retrieval
    - Test application restart with existing keys
  
  - [ ] 15.2 Test on macOS
    - Verify keytar works with macOS Keychain
    - Test key storage and retrieval
    - Test application restart with existing keys
  
  - [ ] 15.3 Test on Linux
    - Verify keytar works with Secret Service API
    - Test key storage and retrieval
    - Test application restart with existing keys
  
  - [ ] 15.4 Document platform-specific requirements
    - Document any platform-specific setup needed
    - Update README with keychain configuration instructions
    - _Requirements: 2.7_

- [ ] 16. Checkpoint - Verify Electron integration is complete
  - Ensure KeyManager works on all platforms
  - Ensure CSP is properly configured and enforced
  - Ensure no hardcoded secrets remain in code
  - Ensure server starts only when keys are configured
  - Ask the user if questions arise

### Phase 5: Testing & Validation (Days 8-9)

- [ ] 17. Write property-based tests for all correctness properties
  - [ ]* 17.1 Write property tests for key management
    - Property 1: Key Storage Round Trip
    - Property 2: Generated Key Lengths

  - [ ]* 17.2 Write property tests for token management
    - Property 3: Access Token Memory Storage
    - Property 4: Token Duration Validation
    - Property 5: Token Refresh on Expiration
    - Property 6: HTTP Request Token Injection
  
  - [ ]* 17.3 Write property tests for password policy
    - Property 7: Password Policy Validation
    - Property 8: Password Validation Error Messages
    - Property 11: Password Policy Application on Change
  
  - [ ]* 17.4 Write property tests for password change enforcement
    - Property 9: Must Change Password Enforcement
    - Property 10: Password Change State Update
  
  - [ ]* 17.5 Write property tests for sanitization
    - Property 12: HTML Tag Removal in sanitizeInput
    - Property 13: Safe HTML Tag Allowlist in sanitizeHTML
    - Property 14: XSS Prevention in User Inputs
  
  - [ ]* 17.6 Write property tests for bcrypt
    - Property 15: Bcrypt Rounds for New Passwords
    - Property 16: Bcrypt Compatibility and Migration
  
  - [ ]* 17.7 Write property tests for account lockout
    - Property 17: Account Lockout Check on Login
    - Property 18: Login Attempt Increment on Failure
    - Property 19: Account Lockout Trigger
    - Property 20: Login Attempt Reset on Success
    - Property 21: Account Lockout Audit Log
    - Property 22: Remaining Attempts Notification
  
  - [ ]* 17.8 Write property tests for audit logging
    - Property 23: Audit Log Completeness
    - Property 24: Audit Severity Determination
    - Property 25: Audit Log Error Resilience
  
  - [ ]* 17.9 Write property tests for password reset
    - Property 26: Password Reset Token Generation
    - Property 27: Password Reset Token Hashing
    - Property 28: Password Reset Token Expiration
    - Property 29: Password Reset Email Content
    - Property 30: Password Reset Token Validation
    - Property 31: Password Reset Token Invalidation
    - Property 32: Password Change Confirmation Email
    - Property 33: Email Error Handling
  
  - [ ]* 17.10 Write property tests for photo validation
    - Property 34: Photo Type Validation
    - Property 35: Photo Type Rejection
    - Property 36: Photo Size Calculation
    - Property 37: Photo Size Limit Enforcement
    - Property 38: Photo Upload Prevention on Validation Failure

  - [ ]* 17.11 Run all property tests with 100 iterations
    - Execute all property tests with minimum 100 iterations
    - Fix any failures discovered
    - Verify all properties pass consistently

- [ ] 18. Write integration tests for critical flows
  - [ ]* 18.1 Write E2E test for first login flow
    - User logs in with default password
    - System detects mustChangePassword=true
    - Modal appears and blocks navigation
    - User changes password successfully
    - System allows normal operation
  
  - [ ]* 18.2 Write E2E test for account lockout
    - User enters wrong password 5 times
    - Account gets locked for 15 minutes
    - User cannot login during lockout
    - Audit log is created with ACCOUNT_LOCKED
    - After 15 minutes, user can login successfully
  
  - [ ]* 18.3 Write E2E test for password reset
    - User requests password reset
    - Email is sent with token
    - User clicks link and enters new password
    - Password is validated against policy
    - Token is invalidated after use
    - Confirmation email is sent
  
  - [ ]* 18.4 Write E2E test for token refresh
    - User logs in and gets tokens
    - Access token expires after 15 minutes
    - System automatically refreshes using refresh token
    - User continues working without interruption
    - Refresh token expires after 7 days
    - User is redirected to login
  
  - [ ]* 18.5 Write E2E test for XSS prevention
    - User enters malicious script in visitor name
    - System sanitizes on render
    - Script tags are removed
    - Text content is preserved
    - No script execution occurs
  
  - [ ]* 18.6 Write E2E test for photo upload
    - User captures photo from webcam
    - System validates type and size
    - Invalid photos are rejected with error
    - Valid photos are uploaded to server
    - Server validates again (defense in depth)

- [ ] 19. Verify test coverage
  - [ ]* 19.1 Run code coverage analysis
    - Execute all unit tests with coverage reporting
    - Verify minimum 80% code coverage
    - Identify uncovered critical paths
  
  - [ ]* 19.2 Ensure 100% coverage of critical paths
    - Authentication and authorization: 100% coverage
    - Password validation and hashing: 100% coverage
    - Token generation and validation: 100% coverage
    - Account lockout logic: 100% coverage
    - Audit log creation: 100% coverage
    - Sanitization functions: 100% coverage
    - Photo validation: 100% coverage

  - [ ]* 19.3 Fix any coverage gaps
    - Add tests for uncovered code paths
    - Focus on error handling and edge cases
    - Re-run coverage analysis to verify improvements

- [ ] 20. Checkpoint - Verify all tests pass
  - Ensure all unit tests pass
  - Ensure all property tests pass (100 iterations each)
  - Ensure all integration tests pass
  - Ensure code coverage meets targets (80%+)
  - Ask the user if questions arise

### Phase 6: Documentation & Deployment (Day 10)

- [ ] 21. Update documentation
  - [ ] 21.1 Update README with setup instructions
    - Document keychain configuration for all platforms
    - Document email service configuration (SMTP)
    - Document environment variables
    - Document first-time setup process
    - Document password policy requirements
    - _Requirements: 2.7_
  
  - [ ] 21.2 Create migration guide for existing users
    - Document database migration steps
    - Document key rotation process
    - Document seeder updates
    - Document breaking changes
    - Provide rollback instructions
  
  - [ ] 21.3 Update .env.example
    - Ensure all new variables are documented
    - Remove hardcoded secrets
    - Add comments explaining each variable
    - _Requirements: 2.8_
  
  - [ ] 21.4 Document security features
    - Document token management approach
    - Document password policy
    - Document account lockout behavior
    - Document audit logging
    - Document XSS protection
    - Document CSP configuration

- [ ] 22. Update seeder with new fields
  - [ ] 22.1 Update user seeder
    - Set mustChangePassword=true for all test users
    - Use bcrypt 12 rounds for password hashing
    - Initialize loginAttempts=0 and lockedUntil=null
    - _Requirements: 5.9, 8.2_
  
  - [ ] 22.2 Test seeder with new schema
    - Run seeder on clean database
    - Verify all fields are populated correctly
    - Test login with seeded users
    - Verify password change flow works


- [ ] 23. Perform security audit
  - [ ] 23.1 Verify no secrets in code
    - Search codebase for hardcoded secrets
    - Verify .env is in .gitignore
    - Run git-secrets or similar tool
    - _Requirements: 1.1, 2.8_
  
  - [ ] 23.2 Verify CSP configuration
    - Check CSP headers in browser console
    - Verify no CSP violations for legitimate resources
    - Test that unauthorized resources are blocked
    - _Requirements: 7.1-7.12_
  
  - [ ] 23.3 Verify token storage
    - Inspect localStorage (should only have refresh token)
    - Verify access token is not in localStorage
    - Test token clearing on logout
    - _Requirements: 3.2, 3.3, 3.11_
  
  - [ ] 23.4 Verify password policy enforcement
    - Test weak passwords are rejected
    - Test common passwords are rejected
    - Test strong passwords are accepted
    - _Requirements: 4.1-4.11_
  
  - [ ] 23.5 Verify account lockout
    - Test lockout triggers after 5 failed attempts
    - Test lockout duration is 15 minutes
    - Test automatic unlock after expiration
    - _Requirements: 9.1-9.10_
  
  - [ ] 23.6 Verify audit logging
    - Check database for audit logs
    - Verify all security events are logged
    - Verify severity is assigned correctly
    - _Requirements: 10.1-10.11_
  
  - [ ] 23.7 Verify XSS protection
    - Test malicious scripts in all input fields
    - Verify scripts are sanitized
    - Verify no script execution occurs
    - _Requirements: 6.1-6.9_
  
  - [ ] 23.8 Verify photo validation
    - Test invalid file types are rejected
    - Test oversized files are rejected
    - Verify error messages are displayed
    - _Requirements: 12.1-12.9_

- [ ] 24. Deploy to staging environment
  - [ ] 24.1 Create backup of production database
    - Export current database
    - Store backup in secure location
    - Verify backup integrity
  
  - [ ] 24.2 Run database migrations
    - Execute all migration files
    - Verify schema changes are applied
    - Test rollback if needed

  - [ ] 24.3 Configure environment variables
    - Set BCRYPT_ROUNDS=12
    - Configure SMTP settings for email service
    - Verify all required variables are set
    - Test email delivery
  
  - [ ] 24.4 Deploy backend and frontend
    - Deploy updated backend code
    - Deploy updated frontend code
    - Deploy updated Electron application
    - Verify all services start correctly
  
  - [ ] 24.5 Test keychain integration
    - Test key setup on first run
    - Test key retrieval on subsequent runs
    - Test on all target platforms (Windows, macOS, Linux)
  
  - [ ] 24.6 Perform manual testing
    - Test first login flow with password change
    - Test account lockout and unlock
    - Test password reset via email
    - Test token refresh on expiration
    - Test XSS prevention in all forms
    - Test photo upload validation
    - Test audit log creation
  
  - [ ] 24.7 Monitor for errors
    - Check error logs for 24 hours
    - Monitor CSP violations
    - Monitor audit log completeness
    - Address any issues discovered

- [ ] 25. Final checkpoint - Verify deployment success
  - Ensure all tests pass in staging environment
  - Ensure no critical errors in logs
  - Ensure all security features work as expected
  - Ensure performance is acceptable
  - Collect feedback from stakeholders
  - Create deployment checklist for production

## Notes

- Tasks marked with `*` are optional testing tasks and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties with 100+ iterations
- Unit tests validate specific examples and edge cases
- Integration tests validate end-to-end user flows
- The implementation follows Clean Architecture principles
- All security features implement defense in depth with multiple layers of protection
- Email service is optional - system functions without it but with reduced password recovery capability
- Keychain integration is critical - application will not start without properly configured keys

## Success Criteria

- Zero hardcoded secrets in code
- All JWT tokens stored correctly (access in memory, refresh in localStorage)
- 100% of users have strong passwords (12+ chars, complexity requirements)
- All security events logged with appropriate severity
- XSS attacks prevented through sanitization
- Account lockout protects against brute force attacks
- CSP prevents unauthorized script execution
- Photo uploads validated for type and size
- All tests passing (unit, property, integration)
- Code coverage ≥80% overall, 100% for critical security paths
- No CSP violations for legitimate resources
- Email service configured and functional (or gracefully degraded)
- Documentation complete and accurate
- Successful deployment to staging environment
