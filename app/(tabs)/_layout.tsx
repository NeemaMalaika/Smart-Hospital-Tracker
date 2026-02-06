import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Tabs, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import ApiService from '../../services/api';

export default function TabLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  // Re-check auth when segments change (when user navigates)
  useEffect(() => {
    const onLoginPage = segments[1] === 'login';
    const onRegisterPage = segments[1] === 'register';
    
    if (!isAuthenticated && !onLoginPage && !onRegisterPage && !isLoading) {
      router.replace('/(tabs)/login');
    }
  }, [segments, isAuthenticated, isLoading]);

  const checkAuth = async () => {
    try {
      const isValid = await ApiService.verifyAuth();
      setIsAuthenticated(isValid);

      const onLoginPage = segments[1] === 'login';
      const onRegisterPage = segments[1] === 'register';

      if (!isValid && !onLoginPage && !onRegisterPage) {
        router.replace('/(tabs)/login');
      } else if (isValid && (onLoginPage || onRegisterPage)) {
        router.replace('/(tabs)');
      }
    } catch (error) {
      console.error('Auth check error:', error);
      setIsAuthenticated(false);
      const onLoginPage = segments[1] === 'login';
      const onRegisterPage = segments[1] === 'register';
      if (!onLoginPage && !onRegisterPage) {
        router.replace('/(tabs)/login');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Show nothing while checking auth
  if (isLoading) {
    return null;
  }

  // If not authenticated and not on login/register page, force to login
  if (!isAuthenticated && segments[1] !== 'login' && segments[1] !== 'register') {
    return null;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#2563EB',
        headerShown: false,
      }}
      screenListeners={{
        tabPress: (e) => {
          // Prevent navigation if not authenticated
          if (!isAuthenticated) {
            e.preventDefault();
            router.replace('/(tabs)/login');
          }
        },
      }}
    >
      {/* Hidden Login Screen */}
      <Tabs.Screen
        name="login"
        options={{
          href: null,
        }}
      />

      {/* Hidden Register Screen */}
      <Tabs.Screen
        name="register"
        options={{
          href: null,
        }}
      />

      {/* Main Monitor Screen */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Monitor',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="thermometer" size={size} color={color} />
          ),
        }}
      />

      {/* Explore / Dev Screen */}
      <Tabs.Screen
        name="mapView"
        options={{
          title: 'Map View',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="alert"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="warning-outline" size={size} color={color} />
          ),
        }}
      />


      {/* Admin / Config Screen */}
      <Tabs.Screen
        name="config"
        options={{
          title: 'Admin',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}