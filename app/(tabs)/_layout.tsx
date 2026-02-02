import { Tabs, useRouter, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function TabLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const auth = await AsyncStorage.getItem('isAuthenticated');
      const isAuth = auth === 'true';
      setIsAuthenticated(isAuth);

      const onLoginPage = segments[1] === 'login';

      if (!isAuth && !onLoginPage) {
        router.replace('/(tabs)/login');
      } else if (isAuth && onLoginPage) {
        router.replace('/(tabs)');
      }
    } catch (error) {
      console.error('Auth check error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return null;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#2563EB',
        headerShown: false,
      }}
    >
      {/* Hidden Login Screen */}
      <Tabs.Screen
        name="login"
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
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="code-slash" size={size} color={color} />
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
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="warning-outline" size={size} color={color} />
         ),
        }}
/>
    </Tabs>
  );
}
