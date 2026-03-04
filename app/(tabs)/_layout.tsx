import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Tabs, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';

// Flag to track if we've cleared auth this session (persists across component remounts)
let hasInitializedSession = false;

export default function TabLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize auth ONCE per app session
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Only clear auth if this is a fresh app launch
        if (!hasInitializedSession) {
          await AsyncStorage.removeItem('isAuthenticated');
          console.log('Fresh app launch - authentication cleared');
          hasInitializedSession = true;
          setIsAuthenticated(false);
        } else {
          // Check existing auth status
          const authStatus = await AsyncStorage.getItem('isAuthenticated');
          const isValid = authStatus === 'true';
          setIsAuthenticated(isValid);
          console.log('Checking auth:', isValid ? 'Authenticated' : 'Not authenticated');
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  // Listen for auth changes when navigation happens
  useEffect(() => {
    if (isLoading) return;

    // Small delay to let AsyncStorage updates complete
    const recheckAuth = async () => {
      try {
        // Wait a tiny bit for AsyncStorage to finish writing
        await new Promise(resolve => setTimeout(resolve, 100));

        const authStatus = await AsyncStorage.getItem('isAuthenticated');
        const isValid = authStatus === 'true';

        const onLoginPage = segments[1] === 'login';
        const onRegisterPage = segments[1] === 'register';

        console.log('Navigation check:', {
          authenticated: isValid,
          page: segments[1] || 'main',
        });

        // Update local state
        setIsAuthenticated(isValid);

        // Handle redirects
        if (!isValid && !onLoginPage && !onRegisterPage) {
          console.log('Not authenticated - redirecting to login');
          router.replace('/(tabs)/login');
        } else if (isValid && (onLoginPage || onRegisterPage)) {
          // Redirect authenticated users to the summary dashboard
          console.log('Already authenticated - redirecting to summary dashboard');
          router.replace('/(tabs)/summary');
        }
      } catch (error) {
        console.error('Error rechecking auth:', error);
        setIsAuthenticated(false);
        const onLoginPage = segments[1] === 'login';
        const onRegisterPage = segments[1] === 'register';
        if (!onLoginPage && !onRegisterPage) {
          router.replace('/(tabs)/login');
        }
      }
    };

    recheckAuth();
  }, [segments, isLoading]);

  // Show loading while initializing
  if (isLoading) {
    return null;
  }

  // Block rendering if not authenticated and not on login/register
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
          // Prevent tab navigation if not authenticated
          if (!isAuthenticated) {
            e.preventDefault();
            console.log('Tab press blocked - not authenticated');
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

      {/* Hidden Map Editor Screen */}
      <Tabs.Screen
        name="AdminMapEditor"
        options={{
          href: null,
        }}
      />

      {/* Summary Dashboard — first viewable tab, default aft login */}
      <Tabs.Screen
        name="summary"
        options={{
          title: 'Summary',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
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

      {/* Map View Screen */}
      <Tabs.Screen
        name="mapView"
        options={{
          title: 'Map View',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map-outline" size={size} color={color} />
          ),
        }}
      />

      {/* Alerts Screen */}
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