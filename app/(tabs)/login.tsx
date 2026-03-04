import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation(); 

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('info');

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToastVisible(false);
    setTimeout(() => {
      setToastMessage(message);
      setToastType(type);
      setToastVisible(true);
    }, 50);
  };

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

  const handleLogin = async () => {
    if (!username.trim()) {
      showToast(t('login.validation.enterUsername'), 'error');
      return;
    }
    if (!password.trim()) {
      showToast(t('login.validation.enterPassword'), 'error');
      return;
    }
    if (username.trim().length < 3) {
      showToast(t('login.validation.usernameMinLength'), 'error');
      return;
    }
    if (password.length < 6) {
      showToast(t('login.validation.passwordMinLength'), 'error');
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
        await AsyncStorage.setItem('isAuthenticated', 'true');
        console.log('✅ Authentication set to true');

        const r = response as any;
        if (r.token) {
          await AsyncStorage.setItem('sessionToken', r.token);
        } else if (r.data?.token) {
          await AsyncStorage.setItem('sessionToken', r.data.token);
        } else if (r.access_token) {
          await AsyncStorage.setItem('sessionToken', r.access_token);
        } else {
          console.log('⚠️ No token found in response, using API-KEY only');
        }

        showToast(t('login.validation.welcomeBack', { username: username.trim() }), 'success');

        setTimeout(() => {
          console.log('🚀 Navigating to summary dashboard...');
          router.replace('/(tabs)/summary' as any);
        }, 800);
      } else {
        console.log('❌ Login failed — server returned success: false');
        showToast(t('login.validation.incorrectCredentials'), 'error');
        setPassword('');
      }
    } catch (error) {
      console.error('❌ Login error:', error);

      if (isCredentialsError(error)) {
        showToast(t('login.validation.incorrectCredentials'), 'error');
        setPassword('');
      } else {
        showToast(t('login.validation.connectionError'), 'error');
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
        <Text style={styles.title}>{t('login.title')}</Text>
        <Text style={styles.subtitle}>{t('login.subtitle')}</Text>

        {/* Login Form */}
        <View style={styles.formContainer}>
          {/* Username */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>{t('login.usernameLabel')}</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder={t('login.usernamePlaceholder')}
              autoCapitalize="none"
              editable={!isLoading}
              autoCorrect={false}
            />
          </View>

          {/* Password */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>{t('login.passwordLabel')}</Text>

            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                value={password}
                onChangeText={setPassword}
                placeholder={t('login.passwordPlaceholder')}
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
                accessibilityLabel={showPassword ? t('login.hidePassword') : t('login.showPassword')}
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
            accessibilityLabel={t('login.signIn')}
            accessibilityHint={t('login.signInHint')}
            accessibilityState={{ disabled: isLoading || !username || !password }}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.loginButtonText}>{t('login.signIn')}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer Notice */}
        <View style={styles.securityNotice}>
          <Ionicons name="shield-checkmark" size={16} color="#6B7280" />
          <Text style={styles.securityText}>{t('login.forgotCredentials')}</Text>
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