import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  AccessibilityInfo,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * DEMO AUTHENTICATION CREDENTIALS
 * --------------------------------
 * These credentials are hard-coded for Sprint 1 demonstration purposes.
 * A real system would authenticate users via a secure backend.
 */
const DEMO_CREDENTIALS = {
  username: 'admin',
  password: 'hospital123',
};

export default function LoginScreen() {
  const router = useRouter();

  // User input state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Security state
  const [attempts, setAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);

  /**
   * Handles demo login logic.
   * Uses screen reader announcements for accessibility.
   */
  const handleLogin = async () => {
    if (isLocked) {
      Alert.alert('Account Locked', 'Too many failed attempts.');
      AccessibilityInfo.announceForAccessibility(
        'Account locked due to too many failed attempts'
      );
      return;
    }

    if (!username || !password) {
      Alert.alert('Error', 'Please enter both username and password');
      AccessibilityInfo.announceForAccessibility(
        'Login error. Username and password are required'
      );
      return;
    }

    setIsLoading(true);
    AccessibilityInfo.announceForAccessibility('Authenticating, please wait');

    // Simulated network delay
    setTimeout(async () => {
      const loginSuccess =
        username === DEMO_CREDENTIALS.username &&
        password === DEMO_CREDENTIALS.password;

      if (loginSuccess) {
        // Store authentication state (demo session)
        await AsyncStorage.setItem('isAuthenticated', 'true');
        await AsyncStorage.setItem('username', username);

        AccessibilityInfo.announceForAccessibility(
          'Login successful. Redirecting to dashboard'
        );

        router.replace('/(tabs)');
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);

        if (newAttempts >= 5) {
          setIsLocked(true);
          Alert.alert('Account Locked', 'Too many failed attempts.');
          AccessibilityInfo.announceForAccessibility(
            'Account locked after multiple failed attempts'
          );
        } else {
          Alert.alert(
            'Login Failed',
            `Invalid credentials. ${5 - newAttempts} attempts remaining.`
          );
          AccessibilityInfo.announceForAccessibility(
            'Login failed. Invalid username or password'
          );
        }

        setPassword('');
      }

      setIsLoading(false);
    }, 1000);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* App Icon */}
        <View style={styles.logoContainer} accessible accessibilityLabel="Secure login">
          <View style={styles.logoCircle}>
            <Ionicons name="lock-closed" size={48} color="#ffffff" />
          </View>
        </View>

        {/* Page Title */}
        <Text style={styles.title} accessibilityRole="header">
          Secure Access
        </Text>

        <Text style={styles.subtitle}>
          Enter your credentials to access the monitoring system
        </Text>

        {/* Login Form */}
        <View style={styles.formContainer}>
          {/* Username */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={[styles.input, isLocked && styles.inputDisabled]}
              value={username}
              onChangeText={setUsername}
              placeholder="Enter your username"
              autoCapitalize="none"
              editable={!isLocked}
              accessibilityLabel="Username input"
              accessibilityHint="Enter your username"
            />
          </View>

          {/* Password */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>

            <View style={styles.passwordContainer}>
              <TextInput
                style={[styles.passwordInput, isLocked && styles.inputDisabled]}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                editable={!isLocked}
                accessibilityLabel="Password input"
                accessibilityHint="Enter your password"
              />

              {/* Show / Hide password */}
              <TouchableOpacity
                onPress={() => {
                  setShowPassword(!showPassword);
                  AccessibilityInfo.announceForAccessibility(
                    showPassword ? 'Password hidden' : 'Password visible'
                  );
                }}
                style={styles.eyeButton}
                accessibilityRole="button"
                accessibilityLabel="Toggle password visibility"
              >
                <Ionicons
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={24}
                  color="#6B7280"
                />
              </TouchableOpacity>
            </View>

            <Text style={styles.helperText}>
              Demo credentials: admin / hospital123
            </Text>
          </View>

          {/* Login Button */}
          <TouchableOpacity
            style={[
              styles.loginButton,
              (isLoading || isLocked || !username || !password) &&
                styles.loginButtonDisabled,
            ]}
            onPress={handleLogin}
            disabled={isLoading || isLocked || !username || !password}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
            accessibilityHint="Attempts to log into the system"
          >
            <Text style={styles.loginButtonText}>
              {isLoading ? 'Authenticating...' : 'Sign In'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Footer Notice */}
        <View style={styles.securityNotice}>
          <Ionicons name="shield-checkmark" size={16} color="#6B7280" />
          <Text style={styles.securityText}>
            Demo system. Authentication is simulated for Sprint 1.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
  },
  formContainer: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111827',
  },
  inputDisabled: {
    backgroundColor: '#F3F4F6',
    color: '#9CA3AF',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
  },
  passwordInput: {
    flex: 1,
    padding: 12,
    fontSize: 16,
    color: '#111827',
  },
  eyeButton: {
    padding: 12,
  },
  helperText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 6,
  },
  loginButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  loginButtonDisabled: {
    backgroundColor: '#9CA3AF',
    shadowOpacity: 0,
    elevation: 0,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  securityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    gap: 8,
  },
  securityText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
});

