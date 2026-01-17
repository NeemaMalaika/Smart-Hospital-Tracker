import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  Dimensions,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEFAULT_CONFIG = {
  systemName: 'Hospital Monitoring System',
  entityName: 'Ward',
  entityPlural: 'Wards',
  zones: [
    { id: 'zone-1', name: 'Emergency Ward' },
    { id: 'zone-2', name: 'Intensive Care Unit' },
    { id: 'zone-3', name: 'General Ward' },
  ],
  tempThresholds: { min: 18, max: 24, critical: 26 },
};

export default function TemperatureMonitor() {
  const router = useRouter();
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [selectedZone, setSelectedZone] = useState(DEFAULT_CONFIG.zones[0].id);
  const [temperatureData, setTemperatureData] = useState({ labels: [], datasets: [{ data: [] }] });
  const [currentTemp, setCurrentTemp] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    checkAuth();
    loadConfig();
    loadThemePreference();
  }, []);

  useEffect(() => {
    generateMockData();
    const interval = setInterval(generateMockData, 30000);
    return () => clearInterval(interval);
  }, [selectedZone, config]);

  const loadThemePreference = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem('isDarkMode');
      if (savedTheme !== null) {
        setIsDarkMode(savedTheme === 'true');
      }
    } catch (error) {
      console.error('Theme load error:', error);
    }
  };

  const toggleDarkMode = async () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    try {
      await AsyncStorage.setItem('isDarkMode', String(newMode));
    } catch (error) {
      console.error('Theme save error:', error);
    }
  };

  const checkAuth = async () => {
    try {
      const isAuth = await AsyncStorage.getItem('isAuthenticated');
      if (!isAuth) {
        router.replace('/login');
      }
    } catch (error) {
      console.error('Auth check error:', error);
    }
  };

  const loadConfig = async () => {
    try {
      const savedConfig = await AsyncStorage.getItem('systemConfig');
      if (savedConfig) {
        setConfig(JSON.parse(savedConfig));
      }
    } catch (error) {
      console.error('Config load error:', error);
    }
  };

  const generateMockData = () => {
    const now = new Date();
    const labels = [];
    const data = [];

    for (let i = 23; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 3600000);
      const hour = time.getHours();
      labels.push(i % 4 === 0 ? `${hour.toString().padStart(2, '0')}:00` : '');
      const baseTemp = 21 + Math.sin(i / 4) * 3;
      const temp = baseTemp + (Math.random() - 0.5) * 2;
      data.push(parseFloat(temp.toFixed(1)));
    }

    setTemperatureData({ labels, datasets: [{ data }] });
    const latest = data[data.length - 1];
    setCurrentTemp(latest);
    checkAlerts(latest);
    setLastUpdated(new Date());
  };

  const checkAlerts = (temp) => {
    const newAlerts = [];
    const zoneName = config.zones.find((z) => z.id === selectedZone)?.name;

    if (temp > config.tempThresholds.critical) {
      newAlerts.push({ id: 'critical', level: 'critical', message: `Critical: ${temp}°C in ${zoneName}. Max safe: ${config.tempThresholds.critical}°C.` });
    } else if (temp > config.tempThresholds.max) {
      newAlerts.push({ id: 'warning-high', level: 'warning', message: `Warning: ${temp}°C in ${zoneName}. Max: ${config.tempThresholds.max}°C.` });
    } else if (temp < config.tempThresholds.min) {
      newAlerts.push({ id: 'warning-low', level: 'warning', message: `Warning: ${temp}°C in ${zoneName}. Min: ${config.tempThresholds.min}°C.` });
    }

    setAlerts(newAlerts);
  };

  const getStatus = () => {
    if (!currentTemp) return { label: 'Loading', color: '#6B7280', bgColor: isDarkMode ? '#374151' : '#F3F4F6' };
    if (currentTemp > config.tempThresholds.critical) return { label: 'Critical', color: isDarkMode ? '#F87171' : '#DC2626', bgColor: isDarkMode ? '#7F1D1D' : '#FEE2E2' };
    if (currentTemp > config.tempThresholds.max) return { label: 'High', color: isDarkMode ? '#FBBF24' : '#F59E0B', bgColor: isDarkMode ? '#78350F' : '#FEF3C7' };
    if (currentTemp < config.tempThresholds.min) return { label: 'Low', color: isDarkMode ? '#60A5FA' : '#3B82F6', bgColor: isDarkMode ? '#1E3A8A' : '#DBEAFE' };
    return { label: 'Normal', color: isDarkMode ? '#34D399' : '#10B981', bgColor: isDarkMode ? '#064E3B' : '#D1FAE5' };
  };

  const handleLogout = async () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
        await AsyncStorage.removeItem('isAuthenticated');
        router.replace('/login');
      }},
    ]);
  };

  const status = getStatus();
  const zoneName = config.zones.find((z) => z.id === selectedZone)?.name;
  const screenWidth = Dimensions.get('window').width;

  // Dynamic styles based on theme
  const dynamicStyles = {
    container: { ...styles.container, backgroundColor: isDarkMode ? '#111827' : '#F9FAFB' },
    header: { ...styles.header, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderBottomColor: isDarkMode ? '#374151' : '#E5E7EB' },
    headerTitle: { ...styles.headerTitle, color: isDarkMode ? '#F9FAFB' : '#111827' },
    headerSubtitle: { ...styles.headerSubtitle, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    zoneSelector: { ...styles.zoneSelector, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderBottomColor: isDarkMode ? '#374151' : '#E5E7EB' },
    sectionLabel: { ...styles.sectionLabel, color: isDarkMode ? '#D1D5DB' : '#374151' },
    zoneButton: { ...styles.zoneButton, backgroundColor: isDarkMode ? '#374151' : '#FFFFFF', borderColor: isDarkMode ? '#4B5563' : '#D1D5DB' },
    zoneButtonActive: { ...styles.zoneButtonActive, backgroundColor: isDarkMode ? '#1E3A8A' : '#EFF6FF', borderColor: isDarkMode ? '#3B82F6' : '#2563EB' },
    zoneButtonText: { ...styles.zoneButtonText, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    zoneButtonTextActive: { ...styles.zoneButtonTextActive, color: isDarkMode ? '#93C5FD' : '#2563EB' },
    card: { ...styles.card, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderColor: isDarkMode ? '#374151' : '#E5E7EB' },
    cardTitle: { ...styles.cardTitle, color: isDarkMode ? '#F9FAFB' : '#111827' },
    currentTempLabel: { ...styles.currentTempLabel, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    currentTemp: { ...styles.currentTemp, color: isDarkMode ? '#F9FAFB' : '#111827' },
    thresholdsTitle: { ...styles.thresholdsTitle, color: isDarkMode ? '#F9FAFB' : '#111827' },
    thresholdLabel: { ...styles.thresholdLabel, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    thresholdValue: { ...styles.thresholdValue, color: isDarkMode ? '#F9FAFB' : '#111827' },
    chartSubtitle: { ...styles.chartSubtitle, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    footer: { ...styles.footer, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderTopColor: isDarkMode ? '#374151' : '#E5E7EB' },
    footerText: { ...styles.footerText, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    alertTitle: { ...styles.alertTitle, color: isDarkMode ? '#F9FAFB' : '#111827' },
    alertMessage: { ...styles.alertMessage, color: isDarkMode ? '#D1D5DB' : '#374151' },
  };

  return (
    <ScrollView style={dynamicStyles.container}>
      <View style={dynamicStyles.header}>
        <View style={{ flex: 1 }}>
          <Text style={dynamicStyles.headerTitle}>{config.systemName}</Text>
          <Text style={dynamicStyles.headerSubtitle}>Monitoring {config.entityPlural.toLowerCase()}</Text>
        </View>
        
        {/* Dark Mode Toggle */}
        <TouchableOpacity 
          onPress={toggleDarkMode} 
          style={styles.themeButton}
          accessibilityLabel={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          accessibilityRole="button"
        >
          <Ionicons name={isDarkMode ? 'sunny' : 'moon'} size={24} color={isDarkMode ? '#FBBF24' : '#6B7280'} />
        </TouchableOpacity>

        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Ionicons name="log-out-outline" size={24} color="#DC2626" />
        </TouchableOpacity>
      </View>

      <View style={dynamicStyles.zoneSelector}>
        <Text style={dynamicStyles.sectionLabel}>Select {config.entityName}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {config.zones.map((zone) => (
            <TouchableOpacity
              key={zone.id}
              onPress={() => setSelectedZone(zone.id)}
              style={[dynamicStyles.zoneButton, selectedZone === zone.id && dynamicStyles.zoneButtonActive]}
            >
              <Text style={[dynamicStyles.zoneButtonText, selectedZone === zone.id && dynamicStyles.zoneButtonTextActive]}>
                {zone.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {alerts.length > 0 && (
        <View style={styles.alertsContainer}>
          {alerts.map((alert) => (
            <View key={alert.id} style={[styles.alert, alert.level === 'critical' ? styles.alertCritical : styles.alertWarning]}>
              <Ionicons name="warning" size={24} color={alert.level === 'critical' ? '#DC2626' : '#F59E0B'} />
              <View style={styles.alertTextContainer}>
                <Text style={dynamicStyles.alertTitle}>{alert.level === 'critical' ? 'Critical Alert' : 'Warning'}</Text>
                <Text style={dynamicStyles.alertMessage}>{alert.message}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={dynamicStyles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="thermometer" size={24} color={isDarkMode ? '#60A5FA' : '#2563EB'} />
          <Text style={dynamicStyles.cardTitle}>Current Status</Text>
        </View>
        <View style={styles.currentTempContainer}>
          <Text style={dynamicStyles.currentTempLabel}>Current Temperature</Text>
          <Text style={dynamicStyles.currentTemp}>{currentTemp ? `${currentTemp}°C` : '--'}</Text>
          <View style={[styles.statusBadge, { backgroundColor: status.bgColor, borderColor: status.color }]}>
            <Text style={[styles.statusText, { color: status.color }]}>Status: {status.label}</Text>
          </View>
        </View>
        <View style={styles.thresholdsContainer}>
          <Text style={dynamicStyles.thresholdsTitle}>Temperature Thresholds</Text>
          <View style={styles.thresholdRow}>
            <Text style={dynamicStyles.thresholdLabel}>Minimum safe level:</Text>
            <Text style={dynamicStyles.thresholdValue}>{config.tempThresholds.min}°C</Text>
          </View>
          <View style={styles.thresholdRow}>
            <Text style={dynamicStyles.thresholdLabel}>Maximum safe level:</Text>
            <Text style={dynamicStyles.thresholdValue}>{config.tempThresholds.max}°C</Text>
          </View>
          <View style={styles.thresholdRow}>
            <Text style={dynamicStyles.thresholdLabel}>Critical level:</Text>
            <Text style={dynamicStyles.thresholdValue}>{config.tempThresholds.critical}°C</Text>
          </View>
        </View>
      </View>

      <View style={dynamicStyles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="analytics" size={24} color={isDarkMode ? '#60A5FA' : '#2563EB'} />
          <Text style={dynamicStyles.cardTitle}>24-Hour Temperature History</Text>
        </View>
        <Text style={dynamicStyles.chartSubtitle}>Showing readings for {zoneName}</Text>
        <LineChart
          data={temperatureData}
          width={screenWidth - 80}
          height={220}
          chartConfig={{
            backgroundColor: isDarkMode ? '#1F2937' : '#ffffff',
            backgroundGradientFrom: isDarkMode ? '#1F2937' : '#ffffff',
            backgroundGradientTo: isDarkMode ? '#1F2937' : '#ffffff',
            decimalPlaces: 1,
            color: (opacity = 1) => isDarkMode ? `rgba(96, 165, 250, ${opacity})` : `rgba(37, 99, 235, ${opacity})`,
            labelColor: (opacity = 1) => isDarkMode ? `rgba(156, 163, 175, ${opacity})` : `rgba(107, 114, 128, ${opacity})`,
            propsForDots: { r: '4', strokeWidth: '2', stroke: isDarkMode ? '#60A5FA' : '#2563EB' },
          }}
          bezier
          style={styles.chart}
        />
      </View>

      <View style={dynamicStyles.footer}>
        <View style={styles.footerItem}>
          <View style={styles.statusDot} />
          <Text style={dynamicStyles.footerText}>System active • Updates every 30 seconds</Text>
        </View>
        <View style={styles.footerItem}>
          <Ionicons name="time-outline" size={14} color={isDarkMode ? '#9CA3AF' : '#6B7280'} />
          <Text style={dynamicStyles.footerText}>Last updated: {lastUpdated.toLocaleTimeString()}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 20, borderBottomWidth: 1 },
  headerTitle: { fontSize: 24, fontWeight: 'bold' },
  headerSubtitle: { fontSize: 14, marginTop: 4 },
  themeButton: { padding: 8, marginRight: 8 },
  logoutButton: { padding: 8 },
  zoneSelector: { padding: 20, borderBottomWidth: 1 },
  sectionLabel: { fontSize: 14, fontWeight: '600', marginBottom: 12 },
  zoneButton: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 2, marginRight: 12 },
  zoneButtonActive: {},
  zoneButtonText: { fontSize: 14, fontWeight: '600' },
  zoneButtonTextActive: {},
  alertsContainer: { padding: 20, gap: 12 },
  alert: { flexDirection: 'row', padding: 16, borderRadius: 8, borderWidth: 2, gap: 12 },
  alertCritical: { backgroundColor: '#FEE2E2', borderColor: '#DC2626' },
  alertWarning: { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' },
  alertTextContainer: { flex: 1 },
  alertTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  alertMessage: { fontSize: 14, lineHeight: 20 },
  card: { margin: 20, marginTop: 0, padding: 20, borderRadius: 12, borderWidth: 1, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 },
  cardTitle: { fontSize: 18, fontWeight: 'bold' },
  currentTempContainer: { alignItems: 'center', paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  currentTempLabel: { fontSize: 14, marginBottom: 8 },
  currentTemp: { fontSize: 56, fontWeight: 'bold', marginBottom: 16 },
  statusBadge: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, borderWidth: 2 },
  statusText: { fontSize: 16, fontWeight: 'bold' },
  thresholdsContainer: { marginTop: 16 },
  thresholdsTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 12 },
  thresholdRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  thresholdLabel: { fontSize: 14 },
  thresholdValue: { fontSize: 14, fontWeight: '600' },
  chartSubtitle: { fontSize: 14, marginBottom: 16 },
  chart: { marginVertical: 8, borderRadius: 16 },
  footer: { padding: 20, borderTopWidth: 1, gap: 8, marginBottom: 20 },
  footerItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  footerText: { fontSize: 12 },
});
