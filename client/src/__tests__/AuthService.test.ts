import { describe, it, expect, vi, beforeEach } from 'vitest';
import AuthService from '../services/AuthService';
import api from '../services/api.v1';

// Mock the axios instance used by AuthService so no real HTTP calls are made
vi.mock('../services/api.v1', () => ({
  default: {
    post: vi.fn(),
  },
}));

describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Reset singleton in-memory state (clearTokens is private, reachable via logout)
    AuthService.logout();
  });

  describe('getAccessToken', () => {
    it('should return null initially', () => {
      expect(AuthService.getAccessToken()).toBeNull();
    });
  });

  describe('login', () => {
    it('should store the access token in memory after a successful login', async () => {
      (api.post as any).mockResolvedValue({
        data: {
          success: true,
          data: {
            accessToken: 'access-token-123',
            refreshToken: 'refresh-token-456',
            user: { username: 'admin', role: 'ADMIN', mustChangePassword: false },
          },
        },
      });

      const user = await AuthService.login('admin', 'password');

      expect(api.post).toHaveBeenCalledWith('/auth/login', {
        username: 'admin',
        password: 'password',
      });
      expect(user).toEqual({
        username: 'admin',
        role: 'ADMIN',
        mustChangePassword: false,
      });
      // Access token kept in memory only
      expect(AuthService.getAccessToken()).toBe('access-token-123');
      // Refresh token persisted to localStorage
      expect(localStorage.getItem('refreshToken')).toBe('refresh-token-456');
    });

    it('should clear tokens on login failure', async () => {
      (api.post as any).mockRejectedValue(new Error('Invalid credentials'));

      await expect(AuthService.login('admin', 'wrong')).rejects.toThrow(
        'Invalid credentials'
      );

      expect(AuthService.getAccessToken()).toBeNull();
      expect(localStorage.getItem('refreshToken')).toBeNull();
    });
  });

  describe('logout / clearTokens', () => {
    it('should clear the access token and refresh token on logout', async () => {
      // Seed tokens via login
      (api.post as any).mockResolvedValue({
        data: {
          success: true,
          data: {
            accessToken: 'a',
            refreshToken: 'r',
            user: { username: 'u', role: 'ADMIN', mustChangePassword: false },
          },
        },
      });
      await AuthService.login('u', 'p');
      expect(AuthService.getAccessToken()).not.toBeNull();
      expect(localStorage.getItem('refreshToken')).not.toBeNull();

      AuthService.logout();

      expect(AuthService.getAccessToken()).toBeNull();
      expect(localStorage.getItem('refreshToken')).toBeNull();
    });
  });

  describe('refreshAccessToken', () => {
    it('should call the API and update the access token', async () => {
      // Simulate a refresh token previously stored in localStorage
      localStorage.setItem('refreshToken', 'refresh-token-456');
      (api.post as any).mockResolvedValue({
        data: {
          success: true,
          data: { accessToken: 'new-access-token' },
        },
      });

      const token = await AuthService.refreshAccessToken();

      expect(api.post).toHaveBeenCalledWith('/auth/refresh', {
        refreshToken: 'refresh-token-456',
      });
      expect(token).toBe('new-access-token');
      expect(AuthService.getAccessToken()).toBe('new-access-token');
    });

    it('should throw if no refresh token is available', async () => {
      await expect(AuthService.refreshAccessToken()).rejects.toThrow(
        'No refresh token available'
      );
      expect(api.post).not.toHaveBeenCalled();
    });

    it('should clear all tokens when the refresh call fails', async () => {
      localStorage.setItem('refreshToken', 'refresh-token-456');
      (api.post as any).mockRejectedValue(new Error('Refresh failed'));

      await expect(AuthService.refreshAccessToken()).rejects.toThrow(
        'Refresh failed'
      );

      expect(AuthService.getAccessToken()).toBeNull();
      expect(localStorage.getItem('refreshToken')).toBeNull();
    });
  });

  describe('isAuthenticated', () => {
    it('should return false when no tokens are present', () => {
      expect(AuthService.isAuthenticated()).toBe(false);
    });

    it('should return true when a refresh token exists in localStorage', () => {
      localStorage.setItem('refreshToken', 'r');
      expect(AuthService.isAuthenticated()).toBe(true);
    });

    it('should return true when an access token exists in memory', async () => {
      (api.post as any).mockResolvedValue({
        data: {
          success: true,
          data: {
            accessToken: 'a',
            refreshToken: 'r',
            user: { username: 'u', role: 'ADMIN', mustChangePassword: false },
          },
        },
      });
      await AuthService.login('u', 'p');
      // Remove refresh token so only the in-memory access token remains
      localStorage.removeItem('refreshToken');
      expect(AuthService.isAuthenticated()).toBe(true);
    });
  });
});
