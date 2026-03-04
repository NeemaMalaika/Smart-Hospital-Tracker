import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_KEY } from '../config';

export const useAuthenticatedAPI = () => {
  const [isTokenLoaded, setIsTokenLoaded] = useState(false);

  useEffect(() => {
    // We only need to signal that the hook has initialised.
    // No need to copy the token into state — we read it fresh on every request.
    AsyncStorage.getItem('sessionToken')
      .then((t) => {
        console.log(t ? '✅ Session token found in storage' : '⚠️ No session token in storage');
      })
      .catch((e) => console.error('Error checking session token:', e))
      .finally(() => setIsTokenLoaded(true));
  }, []);

  /**
   * Builds auth headers by reading AsyncStorage directly every time,
   * so we never serve a stale (null) value from React state.
   */
  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'API-KEY': API_KEY,
    };

    try {
      const token = await AsyncStorage.getItem('sessionToken');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      } else {
        console.warn('⚠️ getAuthHeaders: no sessionToken found — request will lack Authorization header');
      }
    } catch (e) {
      console.error('getAuthHeaders: AsyncStorage read failed', e);
    }

    return headers;
  };

  const authenticatedFetch = async (url: string, options: RequestInit = {}) => {
    const authHeaders = await getAuthHeaders(); // ← await the async read

    // JSON.stringify forces a snapshot so the log isn't a stale object reference
    console.log('Auth Headers:', JSON.stringify(authHeaders));
    console.log('Fetching URL:', url);

    return fetch(url, {
      method: options.method || 'GET',
      ...options,
      headers: {
        ...authHeaders,
        ...(options.headers as Record<string, string> || {}),
      },
    });
  };

  return {
    isTokenLoaded,
    getAuthHeaders,
    authenticatedFetch,
  };
};