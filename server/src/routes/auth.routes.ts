import express from 'express';
import * as AuthController from '../controllers/AuthController';
import { authLimiter, refreshLimiter, demoLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import { loginSchema, forgotPasswordSchema, resetPasswordSchema, refreshTokenSchema, changePasswordSchema, selectTenantSchema, createDemoSchema } from '../schemas/auth.schema';
import { asyncHandler } from '../utils/asyncHandler';
import { verifyToken } from '../middleware/auth';

const router = express.Router();

/**
 * Clean Architecture Auth Routes (v1)
 */

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication management
 */

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Successful login
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                     user:
 *                       type: object
 *                       properties:
 *                         username:
 *                           type: string
 *                         role:
 *                           type: string
 *       401:
 *         description: Invalid credentials
 */
router.post('/v1/auth/login', authLimiter, validate(loginSchema), asyncHandler(AuthController.login));

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout and clear auth cookies
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
router.post('/v1/auth/logout', verifyToken, asyncHandler(AuthController.logout));

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request password reset token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *             properties:
 *               username:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token generated
 *       404:
 *         description: User not found
 */
router.post('/v1/auth/forgot-password', authLimiter, validate(forgotPasswordSchema), asyncHandler(AuthController.forgotPassword));

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset password using token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - newPassword
 *             properties:
 *               token:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password reset successful
 *       400:
 *         description: Invalid or expired token
 */
router.post('/v1/auth/reset-password', authLimiter, validate(resetPasswordSchema), asyncHandler(AuthController.resetPassword));

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Refresh access token using refresh token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: New access token generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *       401:
 *         description: Invalid or expired refresh token
 */
router.post('/v1/auth/refresh', refreshLimiter, validate(refreshTokenSchema), asyncHandler(AuthController.refreshToken));

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     summary: Change user password (requires authentication)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *               confirmPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Validation error or password policy violation
 *       401:
 *         description: Invalid current password
 */
router.post('/v1/auth/change-password', verifyToken, validate(changePasswordSchema), asyncHandler(AuthController.changePassword));

/**
 * @swagger
 * /auth/tenants:
 *   get:
 *     summary: List tenants the authenticated user belongs to
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of tenants with the user role in each
 *       401:
 *         description: Unauthorized
 */
router.get('/v1/auth/tenants', verifyToken, asyncHandler(AuthController.listTenants));

/**
 * @swagger
 * /auth/select-tenant:
 *   post:
 *     summary: Select a working tenant and receive a tenant-scoped access token
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tenantSlug
 *             properties:
 *               tenantSlug:
 *                 type: string
 *     responses:
 *       200:
 *         description: New tenant-scoped access token
 *       403:
 *         description: Forbidden or tenant unavailable
 */
router.post('/v1/auth/select-tenant', verifyToken, validate(selectTenantSchema), asyncHandler(AuthController.selectTenant));

/**
 * @swagger
 * /auth/demo:
 *   post:
 *     summary: Create a demo tenant with pre-provisioned users and seed data
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               company:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       201:
 *         description: Demo tenant created
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/v1/auth/demo', demoLimiter, validate(createDemoSchema), asyncHandler(AuthController.createDemo));

export default router;
