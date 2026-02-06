import AsyncStorage from '@react-native-async-storage/async-storage';
import CryptoJS from 'crypto-js';

// Backend configuration
const API_BASE_URL = 'https://backend.smartenvironment.tech';
const API_KEY = '49643a60-0aff-4a88-8e65-30ea428df8ee';

interface LoginCredentials {
  username: string;
  password: string;
}

interface LoginResponse {
  success: boolean;
  token?: string;
  message?: string;
}

interface CreateAccountCredentials {
  username: string;
  password: string;
  email?: string;
}

class ApiService {
  /**
   * Hash password using SHA256 (UTF-8 charset)
   */
  private hashPassword(password: string): string {
    return CryptoJS.SHA256(password).toString(CryptoJS.enc.Hex);
  }

  /**
   * Get stored auth token
   */
  private async getToken(): Promise<string | null> {
    return await AsyncStorage.getItem('authToken');
  }

  /**
   * Save auth token and timestamp
   */
  private async saveToken(token: string): Promise<void> {
    await AsyncStorage.multiSet([
      ['authToken', token],
      ['isAuthenticated', 'true'],
      ['tokenTimestamp', Date.now().toString()],
    ]);
  }

  /**
   * Clear all auth data
   */
  private async clearAuth(): Promise<void> {
    await AsyncStorage.multiRemove([
      'authToken',
      'isAuthenticated',
      'username',
      'tokenTimestamp',
    ]);
  }

  /**
   * Check if token is expired (24 hours)
   */
  async isTokenExpired(): Promise<boolean> {
    try {
      const timestamp = await AsyncStorage.getItem('tokenTimestamp');
      if (!timestamp) return true;

      const tokenAge = Date.now() - parseInt(timestamp);
      const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

      return tokenAge >= TWENTY_FOUR_HOURS;
    } catch {
      return true;
    }
  }

  /**
   * Login with username and password
   */
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
  try {
    // Hash password on frontend using SHA256
    const hashedPassword = this.hashPassword(credentials.password);

    console.log('=== LOGIN REQUEST ===');
    console.log('Username:', credentials.username);
    console.log('Hashed Password:', hashedPassword);

    // BUILD URL WITH QUERY PARAMETERS 
    const url = `${API_BASE_URL}/api/v1/auth/login?username=${encodeURIComponent(credentials.username)}&hashedPassword=${encodeURIComponent(hashedPassword)}`; // ← ADD THIS LINE
    
    console.log('URL:', url); 

    const response = await fetch(url, { 
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-KEY': API_KEY,
      },
    });

      console.log('Response Status:', response.status);
      console.log('Response OK:', response.ok);

      // Handle empty response (401 with no body)
      if (!response.ok) {
        let errorMessage = 'Login failed';
        
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
          console.log('Error Data:', errorData);
        } catch (e) {
          // If response has no JSON body, use status-based message
          if (response.status === 401) {
            errorMessage = 'Invalid username or password';
          } else if (response.status === 500) {
            errorMessage = 'Server error. Please try again later.';
          }
          console.log('No JSON error body, using default message');
        }

        return {
          success: false,
          message: errorMessage,
        };
      }

      // Parse successful response
      const data: LoginResponse = await response.json();
      console.log('Login Response:', data);

      if (data.success && data.token) {
        // Save token and username
        await this.saveToken(data.token);
        await AsyncStorage.setItem('username', credentials.username);
        console.log('Token saved successfully');
        return { success: true, token: data.token };
      } else {
        return {
          success: false,
          message: data.message || 'Login failed',
        };
      }
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        message: 'Network error. Please check your connection.',
      };
    }
  }

  /**
   * Create a new account (Admin only - requires authentication)
   */
  async createAccount(credentials: CreateAccountCredentials): Promise<LoginResponse> {
    try {
      console.log('=== CREATE ACCOUNT REQUEST ===');
      console.log('URL:', `${API_BASE_URL}/api/v1/auth/create-account`);
      
      // Get the current admin's token
      const token = await this.getToken();
      if (!token) {
        return {
          success: false,
          message: 'You must be logged in as an admin to create accounts',
        };
      }
      
      console.log('Admin token found');
      
      // Hash password on frontend using SHA256
      const hashedPassword = this.hashPassword(credentials.password);
      console.log('Password hashed successfully');

      const requestBody = {
        username: credentials.username,
        hashedPassword: hashedPassword,
        ...(credentials.email && { email: credentials.email }),
      };

      console.log('Request body (password hidden):', {
        username: requestBody.username,
        hashedPassword: '***HIDDEN***',
        email: requestBody.email || 'none',
      });

      const response = await fetch(`${API_BASE_URL}/api/v1/auth/create-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'API-KEY': API_KEY,
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      console.log('Response status:', response.status);
      
      if (!response.ok) {
        let errorMessage = 'Account creation failed';
        
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
          console.log('Error Data:', errorData);
        } catch (e) {
          if (response.status === 401) {
            errorMessage = 'Unauthorized. Admin access required.';
          } else if (response.status === 409) {
            errorMessage = 'Username already exists';
          }
        }

        return {
          success: false,
          message: errorMessage,
        };
      }

      const data: LoginResponse = await response.json();
      console.log('Response data:', data);

      if (data.success) {
        return { success: true, message: 'Account created successfully' };
      } else {
        return {
          success: false,
          message: data.message || 'Account creation failed',
        };
      }
    } catch (error) {
      console.error('Create account error:', error);
      return {
        success: false,
        message: 'Network error. Please check your connection.',
      };
    }
  }

  /**
   * Logout - invalidate token on backend
   */
  async logout(): Promise<void> {
    try {
      const token = await this.getToken();

      if (token) {
        await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'API-KEY': API_KEY,
          },
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      await this.clearAuth();
    }
  }

  /**
   * Verify if user is authenticated and token is valid
   */
  async verifyAuth(): Promise<boolean> {
    try {
      const token = await this.getToken();
      if (!token) return false;

      // Check if token is expired (24 hours)
      const expired = await this.isTokenExpired();
      if (expired) {
        await this.clearAuth();
        return false;
      }

      return true;
    } catch (error) {
      console.error('Auth verification error:', error);
      return false;
    }
  }
}

export default new ApiService();


