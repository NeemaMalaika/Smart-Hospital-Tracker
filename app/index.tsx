import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function LandingPage() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      {/* Logo / Branding */}
      <View style={styles.hero}>
        <View style={styles.logoCircle}>
          <Ionicons name="leaf" size={52} color="#FFFFFF" />
        </View>
        <Text style={styles.title}>Smart Environment</Text>
        <Text style={styles.subtitle}>
          Real-time environmental monitoring{'\n'}for any space, anywhere.
        </Text>
      </View>

      {/* Entry Buttons */}
      <View style={styles.actions}>
        {/* Public View */}
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/public-view' as any)}
          accessibilityRole="button"
          accessibilityLabel="View public dashboard"
        >
          <Ionicons name="eye-outline" size={22} color="#FFFFFF" />
          <View style={styles.buttonTextGroup}>
            <Text style={styles.primaryButtonTitle}>View Dashboard</Text>
            <Text style={styles.primaryButtonSub}>Live sensor data — no login required</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>

        {/* Admin Login */}
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push('/(tabs)/login' as any)}
          accessibilityRole="button"
          accessibilityLabel="Admin login"
        >
          <Ionicons name="shield-checkmark-outline" size={22} color="#2563EB" />
          <View style={styles.buttonTextGroup}>
            <Text style={styles.secondaryButtonTitle}>Admin Login</Text>
            <Text style={styles.secondaryButtonSub}>Configure nodes, alerts & settings</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#93C5FD" />
        </TouchableOpacity>
      </View>

      {/* Footer */}
      <Text style={styles.footer}>Smart Environment Monitoring Platform</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 56,
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 22,
  },
  actions: {
    width: '100%',
    gap: 14,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#2563EB',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#1E293B',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  buttonTextGroup: {
    flex: 1,
  },
  primaryButtonTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  primaryButtonSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.65)',
  },
  secondaryButtonTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E2E8F0',
    marginBottom: 2,
  },
  secondaryButtonSub: {
    fontSize: 12,
    color: '#64748B',
  },
  footer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 40 : 24,
    fontSize: 12,
    color: '#334155',
  },
});