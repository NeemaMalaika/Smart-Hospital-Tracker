import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Toast from '../../components/toast';
import ApiService from '../../services/api';

export default function LoginScreen() {
  const router = useRouter();

  // User input state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Toast notification state
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('info');

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    // Dismiss any existing toast first, then show the new one
    setToastVisible(false);
    setTimeout(() => {
      setToastMessage(message);
      setToastType(type);
      setToastVisible(true);
    }, 50);
  };

  /**
   * Determines whether an error looks like bad credentials or lik a network problem
   */
  const isCredentialsError = (error: unknown): boolean => {
    if (!error) return false;
    const msg = String(
      (error as any)?.message || (error as any)?.status || error
    ).toLowerCase();
    return (
      msg.includes('401') ||
      msg.includes('403') ||
      msg.includes('unauthorized') ||
      msg.includes('forbidden') ||
      msg.includes('invalid') ||
      msg.includes('incorrect') ||
      msg.includes('wrong') ||
      msg.includes('credentials') ||
      msg.includes('password') ||
      msg.includes('username')
    );
  };

  /**
   * Handle real backend login
   */
  const handleLogin = async () => {
    // Input validation — use toast instead of Alert for consistency
    if (!username.trim()) {
      showToast('Please enter your username.', 'error');
      return;
    }

    if (!password.trim()) {
      showToast('Please enter your password.', 'error');
      return;
    }

    if (username.trim().length < 3) {
      showToast('Username must be at least 3 characters.', 'error');
      return;
    }

    if (password.length < 6) {
      showToast('Password must be at least 6 characters.', 'error');
      return;
    }

    setIsLoading(true);

    try {
      console.log('🔐 Attempting login...');

      const response = await ApiService.login({
        username: username.trim(),
        password: password,
      });

      console.log('📡 Login response success:', response.success);

      if (response.success) {
        // Set authentication flag FIRST
        await AsyncStorage.setItem('isAuthenticated', 'true');
        console.log('✅ Authentication set to true');

        // Save session token if available for API requests.
        // Cast to `any` because the LoginResponse type only declares `token`;
        // `data` and `access_token` are optional fields some backends return.
        const r = response as any;
        if (r.token) {
          await AsyncStorage.setItem('sessionToken', r.token);
          console.log('✅ Session token saved:', r.token);
        } else if (r.data?.token) {
          await AsyncStorage.setItem('sessionToken', r.data.token);
          console.log('✅ Session token saved from data:', r.data.token);
        } else if (r.access_token) {
          await AsyncStorage.setItem('sessionToken', r.access_token);
          console.log('✅ Access token saved:', r.access_token);
        } else {
          console.log('⚠️ No token found in response, using API-KEY only');
        }

        // Show success toast
        showToast(`Welcome back, ${username.trim()}! Login successful.`, 'success');

        // Navigate to summary dashboard after short delay.
        // Cast required until Expo Router re-generates typed routes for summary.
        setTimeout(() => {
          console.log('🚀 Navigating to summary dashboard...');
          router.replace('/(tabs)/summary' as any);
        }, 800);
      } else {
        // Server explicitly said login failed
        console.log('❌ Login failed — server returned success: false');
        showToast('Incorrect username or password. Please try again.', 'error');
        setPassword('');
      }
    } catch (error) {
      console.error('❌ Login error:', error);

      // know between bad credentials and a network/server problem
      if (isCredentialsError(error)) {
        showToast('Incorrect username or password. Please try again.', 'error');
        setPassword('');
      } else {
        showToast(
          'Unable to connect to the server. Please check your internet connection.',
          'error'
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      {/* Toast Notification */}
      <Toast
        visible={toastVisible}
        message={toastMessage}
        type={toastType}
        onHide={() => setToastVisible(false)}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* App Icon */}
        <View style={styles.logoContainer}>
          <View style={styles.logoCircle}>
            <Ionicons name="lock-closed" size={48} color="#ffffff" />
          </View>
        </View>

        {/* Page Title */}
        <Text style={styles.title}>Admin Access</Text>
        <Text style={styles.subtitle}>Enter your credentials below to login</Text>

        {/* Login Form */}
        <View style={styles.formContainer}>
          {/* Username */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="Enter your username"
              autoCapitalize="none"
              editable={!isLoading}
              autoCorrect={false}
            />
          </View>

          {/* Password */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>

            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                editable={!isLoading}
                autoCorrect={false}
                onSubmitEditing={handleLogin}
                returnKeyType="go"
              />

              {/* Show / Hide password */}
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeButton}
                disabled={isLoading}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Ionicons
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={24}
                  color="#6B7280"
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Login Button */}
          <TouchableOpacity
            style={[
              styles.loginButton,
              (isLoading || !username || !password) && styles.loginButtonDisabled,
            ]}
            onPress={handleLogin}
            disabled={isLoading || !username || !password}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
            accessibilityHint="Double tap to submit your login credentials"
            accessibilityState={{ disabled: isLoading || !username || !password }}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.loginButtonText}>Sign In</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer Notice */}
        <View style={styles.securityNotice}>
          <Ionicons name="shield-checkmark" size={16} color="#6B7280" />
          <Text style={styles.securityText}>
            Forgotten your credentials? Please contact the system administrator
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