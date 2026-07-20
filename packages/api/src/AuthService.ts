/**
 * AuthService - Singleton service for authentication and token management
 * 
 * Requirements:
 * - 3.1: Implement Access Token and Refresh Token pattern
 * - 3.2: Store Access Token in memory only (private class variable)
 * - 3.3: Store Refresh Token in localStorage
 * - 3.6: Implement automatic token refresh
 * - 3.9: Clear Access Token on application close
 */

import api from './api';

interface LoginResponse {
    success: boolean;
    data: {
        accessToken: string;
        refreshToken: string;
        user: {
            username: string;
            role: string;
            mustChangePassword: boolean;
        };
    };
}

interface UserInfo {
    username: string;
    role: string;
    mustChangePassword: boolean;
}

class AuthService {
    private static instance: AuthService;
    private accessToken: string | null = null; // Requirement 3.2: Memory only
    private readonly REFRESH_TOKEN_KEY = 'refreshToken';

    private constructor() {
        // Private constructor for singleton pattern
        // Clear access token on window unload (Requirement 3.9)
        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', () => {
                this.accessToken = null;
            });
        }
    }

    /**
     * Get singleton instance
     */
    public static getInstance(): AuthService {
        if (!AuthService.instance) {
            AuthService.instance = new AuthService();
        }
        return AuthService.instance;
    }

    /**
     * Login user and store tokens
     * Requirement 3.1: Store Access Token in memory, Refresh Token in localStorage
     */
    public async login(username: string, password: string): Promise<UserInfo> {
        try {
            const response = await api.post<LoginResponse>('/auth/login', {
                username,
                password
            });

            const { accessToken, refreshToken, user } = response.data.data;

            // Store Access Token in memory (Requirement 3.2)
            this.accessToken = accessToken;

            // Store Refresh Token in localStorage (Requirement 3.3)
            localStorage.setItem(this.REFRESH_TOKEN_KEY, refreshToken);

            return user;
        } catch (error: unknown) {
            // Clear any existing tokens on login failure
            this.clearTokens();
            throw error;
        }
    }

    /**
     * Logout user and clear all tokens
     */
    public logout(): void {
        this.clearTokens();
    }

    /**
     * Get current Access Token from memory
     * Requirement 3.2: Access Token stored in memory only
     */
    public getAccessToken(): string | null {
        return this.accessToken;
    }

    /**
     * Refresh Access Token using Refresh Token
     * Requirement 3.6: Automatic token refresh
     */
    public async refreshAccessToken(): Promise<string> {
        const refreshToken = localStorage.getItem(this.REFRESH_TOKEN_KEY);

        if (!refreshToken) {
            throw new Error('No refresh token available');
        }

        try {
            const response = await api.post<{
                success: boolean;
                data: { accessToken: string };
            }>('/auth/refresh', {
                refreshToken
            });

            const { accessToken } = response.data.data;

            // Store new Access Token in memory
            this.accessToken = accessToken;

            return accessToken;
        } catch (error) {
            // If refresh fails, clear all tokens and force re-login
            this.clearTokens();
            throw error;
        }
    }

    /**
     * Check if user is authenticated
     */
    public isAuthenticated(): boolean {
        // User is authenticated if we have an access token in memory
        // or a refresh token in localStorage (can be refreshed)
        return this.accessToken !== null || localStorage.getItem(this.REFRESH_TOKEN_KEY) !== null;
    }

    /**
     * Clear all tokens
     */
    private clearTokens(): void {
        this.accessToken = null;
        localStorage.removeItem(this.REFRESH_TOKEN_KEY);
    }
}

// Export singleton instance
export default AuthService.getInstance();
