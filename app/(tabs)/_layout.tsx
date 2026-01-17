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
      setIsAuthenticated(auth === 'true');
      
      // Redirect based on auth status
      if (auth !== 'true' && segments[1] !== 'login') {
        router.replace('/(tabs)/login');
      }
    } catch (error) {
      console.error('Auth check error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return null; // or a loading screen
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