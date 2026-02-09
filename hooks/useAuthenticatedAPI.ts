import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_KEY = '49643a60-0aff-4a88-8e65-30ea428df8ee';

export const useAuthenticatedAPI = () => {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isTokenLoaded, setIsTokenLoaded] = useState(false);

  useEffect(() => {
    loadAuthToken();
  }, []);

  const loadAuthToken = async () => {
    try {
      // Try to load session token from login
      const storedSessionToken = await AsyncStorage.getItem('sessionToken');
      
      if (storedSessionToken) {
        console.log('✅ Found session token from login');
        setSessionToken(storedSessionToken);
      }
      
      // Always set the API key
      setAuthToken(API_KEY);
      setIsTokenLoaded(true);
    } catch (error) {
      console.error('Error loading auth token:', error);
      setAuthToken(API_KEY);
      setIsTokenLoaded(true); // Still set to true to prevent blocking
    }
  };

  const getAuthHeaders = () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'API-KEY': authToken || API_KEY,
    };
    
    // Add session token if available
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }
    
    return headers;
  };

  const authenticatedFetch = async (url: string, options: RequestInit = {}) => {
    const authHeaders = getAuthHeaders();
    
    // Debug logging
    console.log(' Auth Headers:', authHeaders);
    console.log(' Fetching URL:', url);
    
    return fetch(url, {
      method: options.method || 'GET',
      ...options,
      headers: {
        ...authHeaders,
        ...(options.headers || {}),
      },
    });
  };

  return {
    authToken,
    sessionToken,
    isTokenLoaded,
    getAuthHeaders,
    authenticatedFetch,
  };
};