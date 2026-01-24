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
      
      // Redirect logic
      const onLoginPage = segments[1] === 'login';
      
      if (!isAuth && !onLoginPage) {
        // Not authenticated and not on login -> redirect to login
        router.replace('/(tabs)/login');
      } else if (isAuth && onLoginPage) {
        // Authenticated but still on login -> redirect to home
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
      <Tabs.Screen 
        name="login" 
        options={{ 
          href: null, // Hide from tab bar
        }} 
      />
      <Tabs.Screen 
        name="index" 
        options={{ 
          title: 'Monitor', 
          tabBarIcon: ({ color, size }) => <Ionicons name="thermometer" size={size} color={color} /> 
        }} 
      />
      <Tabs.Screen 
        name="explore" 
        options={{ 
          title: 'Explore', 
          tabBarIcon: ({ color, size }) => <Ionicons name="code-slash" size={size} color={color} /> 
        }} 
      />
    </Tabs>

    
  );
}