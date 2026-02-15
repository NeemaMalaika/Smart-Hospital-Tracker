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
    return await AsyncStorage.getItem('sessionToken');
  }

  /**
   * Save auth token and timestamp 
   */
  private async saveToken(token: string): Promise<void> {
    await AsyncStorage.multiSet([
      ['sessionToken', token],
      ['isAuthenticated', 'true'],
      ['tokenTimestamp', Date.now().toString()],
    ]);
  }

  /**
   * Clear all auth data 
   */
  private async clearAuth(): Promise<void> {
    await AsyncStorage.multiRemove([
      'sessionToken', 
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
    const url = `${API_BASE_URL}/api/v1/auth/login?username=${encodeURIComponent(credentials.username)}&hashedPassword=${encodeURIComponent(hashedPassword)}`;
    
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
        console.log('✅ Token saved as sessionToken successfully');
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
   * 
   * NOTE: Backend may return 400 status even when account is created successfully.
   * We check both status code and response data to determine actual success.
   */
  async createAccount(credentials: CreateAccountCredentials): Promise<LoginResponse> {
    try {
      console.log('=== CREATE ACCOUNT REQUEST ===');
      
      // Get the current admin's token
      const token = await this.getToken();
      if (!token) {
        console.error('❌ No token found in AsyncStorage');
        return {
          success: false,
          message: 'You must be logged in as an admin to create accounts',
        };
      }
      
      // Check if token is expired
      const expired = await this.isTokenExpired();
      if (expired) {
        console.error('❌ Token has expired');
        await this.clearAuth();
        return {
          success: false,
          message: 'Your session has expired. Please log in again.',
        };
      }
      
      console.log('✅ Admin token found:', token.substring(0, 20) + '...');
      console.log('✅ Token is valid and not expired');
      
      // Hash password on frontend using SHA256
      const hashedPassword = this.hashPassword(credentials.password);
      console.log('✅ Password hashed successfully');

      // Build request body
      const requestBody: any = {
        username: credentials.username,
        hashedPassword: hashedPassword,
      };
      
      // Only include email if it's provided and not empty
      if (credentials.email && credentials.email.trim()) {
        requestBody.email = credentials.email.trim();
      }

      // ALSO build query parameters (in case backend expects both)
      let url = `${API_BASE_URL}/api/v1/auth/create-account?username=${encodeURIComponent(credentials.username)}&hashedPassword=${encodeURIComponent(hashedPassword)}`;
      if (credentials.email && credentials.email.trim()) {
        url += `&email=${encodeURIComponent(credentials.email.trim())}`;
      }

      console.log('📤 Request URL:', url);
      console.log('📤 Request body (password hidden):', {
        username: requestBody.username,
        hashedPassword: '***HIDDEN***',
        email: requestBody.email || 'not provided',
      });
      console.log('📤 Headers:', {
        'Content-Type': 'application/json',
        'API-KEY': API_KEY.substring(0, 10) + '...',
        'Authorization': `Bearer ${token.substring(0, 20)}...`,
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'API-KEY': API_KEY,
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      console.log('📥 Response status:', response.status);
      
      // Try to parse response data regardless of status code
      let data: any = null;
      try {
        data = await response.json();
        console.log('📥 Response data:', data);
      } catch (e) {
        console.log('⚠️ Could not parse response JSON');
      }
      
      // Check if response indicates success (either through status or data)
      if (response.ok || (data && data.success)) {
        console.log('✅ Account created successfully!');
        return { success: true, message: 'Account created successfully' };
      }
      
      // Handle 401 specifically - token might be invalid
      if (response.status === 401) {
        console.log('❌ 401 Unauthorized - clearing session and prompting re-login');
        await this.clearAuth();
        return {
          success: false,
          message: 'Authentication failed. Please log in again.',
        };
      }
      
      // Handle actual errors
      let errorMessage = 'Account creation failed';
      
      if (data && data.message) {
        errorMessage = data.message;
      } else {
        if (response.status === 409) {
          errorMessage = 'Username already exists';
        } else if (response.status === 400) {
          // For 400 errors, still try to be helpful
          errorMessage = 'Request error. However, the account may have been created. Try logging in with the credentials.';
        }
      }
      
      console.log('❌ Error:', errorMessage);
      
      return {
        success: false,
        message: errorMessage,
      };
    } catch (error) {
      console.error('❌ Create account error:', error);
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