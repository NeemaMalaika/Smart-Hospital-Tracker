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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEMO_CREDENTIALS = {
  username: 'admin',
  password: 'hospital123',
};

export default function LoginScreen() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);

  const handleLogin = async () => {
    if (isLocked) {
      Alert.alert('Account Locked', 'Too many failed attempts. Contact administrator.');
      return;
    }

    if (!username || !password) {
      Alert.alert('Error', 'Please enter both username and password');
      return;
    }

    setIsLoading(true);

    setTimeout(async () => {
      if (username === DEMO_CREDENTIALS.username && password === DEMO_CREDENTIALS.password) {
        try {
          await AsyncStorage.setItem('isAuthenticated', 'true');
          await AsyncStorage.setItem('username', username);
          router.replace('/(tabs)');
        } catch (error) {
          console.error('Storage error:', error);
        }
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);

        if (newAttempts >= 5) {
          setIsLocked(true);
          Alert.alert('Account Locked', 'Too many failed attempts.');
        } else {
          Alert.alert('Login Failed', `Invalid credentials.\n${5 - newAttempts} attempts remaining.`);
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
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.logoContainer}>
          <View style={styles.logoCircle}>
            <Ionicons name="lock-closed" size={48} color="#ffffff" />
          </View>
        </View>

        <Text style={styles.title}>Secure Access</Text>
        <Text style={styles.subtitle}>Enter your credentials to access the monitoring system</Text>

        <View style={styles.formContainer}>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={[styles.input, isLocked && styles.inputDisabled]}
              value={username}
              onChangeText={setUsername}
              placeholder="Enter your username"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLocked}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={[styles.passwordInput, isLocked && styles.inputDisabled]}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLocked}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeButton}
                disabled={isLocked}
              >
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <Text style={styles.helperText}>Demo: admin / hospital123</Text>
          </View>

          <TouchableOpacity
            style={[styles.loginButton, (isLoading || isLocked || !username || !password) && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={isLoading || isLocked || !username || !password}
          >
            <Text style={styles.loginButtonText}>
              {isLoading ? 'Authenticating...' : 'Sign In'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.securityNotice}>
          <Ionicons name="shield-checkmark" size={16} color="#6B7280" />
          <Text style={styles.securityText}>All access attempts are logged and monitored</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoContainer: { alignItems: 'center', marginBottom: 32 },
  logoCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#111827', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#6B7280', textAlign: 'center', marginBottom: 40, lineHeight: 24 },
  formContainer: { width: '100%', maxWidth: 400, alignSelf: 'center' },
  inputContainer: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: { backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#D1D5DB', borderRadius: 8, padding: 16, fontSize: 16, color: '#111827' },
  inputDisabled: { backgroundColor: '#F3F4F6', opacity: 0.6 },
  passwordContainer: { position: 'relative' },
  passwordInput: { backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#D1D5DB', borderRadius: 8, padding: 16, paddingRight: 56, fontSize: 16, color: '#111827' },
  eyeButton: { position: 'absolute', right: 16, top: 16 },
  helperText: { fontSize: 12, color: '#6B7280', marginTop: 6 },
  loginButton: { backgroundColor: '#2563EB', borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  loginButtonDisabled: { backgroundColor: '#9CA3AF', opacity: 0.6 },
  loginButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  securityNotice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 32, paddingTop: 24, borderTopWidth: 1, borderTopColor: '#E5E7EB', gap: 8 },
  securityText: { fontSize: 12, color: '#6B7280', textAlign: 'center', flex: 1 },
});