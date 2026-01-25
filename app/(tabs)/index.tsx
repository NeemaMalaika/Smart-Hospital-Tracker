import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform, Dimensions, ActivityIndicator } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

// API CONFIGURATION
const API_CONFIG = {
  BASE_URL: 'https://backend.smartenvironment.tech/api/v1',
  ENDPOINTS: {
    NODES: '/nodes',
    CURRENT_SENSORS: '/sensors/current',
    SENSOR_HISTORY: '/sensors/history',
  },
  POLLING_INTERVAL: 30000, // 30 seconds
};

// SENSOR CONFIGURATION - Generic and easily Customizable
const SENSOR_DEFINITIONS = [
  {
    id: 'temperature',
    name: 'Temperature',
    unit: '°C',
    icon: 'thermometer',
    color: '#EF4444',
    apiKey: 'temperature',
    thresholds: { min: 18, max: 24, critical: 26 },
    decimalPlaces: 1,
  },
  {
    id: 'humidity',
    name: 'Humidity',
    unit: '%',
    icon: 'water',
    color: '#3B82F6',
    apiKey: 'humidity',
    thresholds: { min: 30, max: 60, critical: 80 },
    decimalPlaces: 1,
  },
  {
    id: 'pressure',
    name: 'Pressure',
    unit: 'hPa',
    icon: 'speedometer',
    color: '#8B5CF6',
    apiKey: 'pressure',
    thresholds: { min: 980, max: 1020, critical: 1040 },
    decimalPlaces: 0,
  },
  {
    id: 'lightRed',
    name: 'Light (Red)',
    unit: 'lux',
    icon: 'bulb',
    color: '#DC2626',
    apiKey: 'lightRed',
    thresholds: { min: 0, max: 1000, critical: 2000 },
    decimalPlaces: 0,
  },
  {
    id: 'lightGreen',
    name: 'Light (Green)',
    unit: 'lux',
    icon: 'bulb',
    color: '#10B981',
    apiKey: 'lightGreen',
    thresholds: { min: 0, max: 1000, critical: 2000 },
    decimalPlaces: 0,
  },
  {
    id: 'lightBlue',
    name: 'Light (Blue)',
    unit: 'lux',
    icon: 'bulb',
    color: '#3B82F6',
    apiKey: 'lightBlue',
    thresholds: { min: 0, max: 1000, critical: 2000 },
    decimalPlaces: 0,
  },
  {
    id: 'lightClear',
    name: 'Light (Clear)',
    unit: 'lux',
    icon: 'sunny',
    color: '#FBBF24',
    apiKey: 'lightClear',
    thresholds: { min: 0, max: 1000, critical: 2000 },
    decimalPlaces: 0,
  },
  {
    id: 'noiseLevel',
    name: 'Noise Level',
    unit: 'dB',
    icon: 'volume-high',
    color: '#F59E0B',
    apiKey: 'noiseLevel',
    thresholds: { min: 0, max: 60, critical: 85 },
    decimalPlaces: 1,
  },
];

// DEFAULT CONFIGURATION
const DEFAULT_CONFIG = {
  systemName: 'Environmental Monitoring System',
  entityName: 'Node',
  entityPlural: 'Nodes',
};

export default function EnvironmentalMonitor() {
  const router = useRouter();
  

  // STATE MANAGEMENT

  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [nodes, setNodes] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [sensorData, setSensorData] = useState({});
  const [historyData, setHistoryData] = useState({});
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // INITIALIZATION EFFECTS
  
  // Runs once when the component mounts
  useEffect(() => {
    checkAuth();
    loadConfig();
    loadThemePreference();  // Load saved theme preference (dark/light mode)
    fetchNodes(); // Fetch initial list of nodes
  }, []);

  useEffect(() => {
    if (selectedNode) {
      fetchAllData();
      // Set up polling to refresh data at a regular interval
      const interval = setInterval(fetchAllData, API_CONFIG.POLLING_INTERVAL);
      return () => clearInterval(interval); // Clean up interval on unmount or change
    }
  }, [selectedNode]);

  // AUTHENTICATION & CONFIGURATION
  
  // Check if user is authenticated; if not, redirect to login
  const checkAuth = async () => {
    try {
      const isAuth = await AsyncStorage.getItem('isAuthenticated');
      
      if (!isAuth) {
        router.replace('/login');
      }
    } catch (error) {
      console.error('Auth check error:', error);
      Alert.alert('Error', 'Authentication failed. Please log in again.');
      router.replace('/login');
    }
  };

  // Load saved system configuration from local storage
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

  // Toggle dark mode on/off and save preference
  const toggleDarkMode = async () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    try {
      await AsyncStorage.setItem('isDarkMode', String(newMode));
    } catch (error) {
      console.error('Theme save error:', error);
    }
  };

  // API INTEGRATION
  const getAuthHeaders = () => ({
    'Content-Type': 'application/json',
    'API-KEY': '49643a60-0aff-4a88-8e65-30ea428df8ee',
  });

  const fetchNodes = async () => {
    try {
      setIsLoading(true);
      setError(null);

      console.log('Fetching nodes from:', `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.NODES}`);

      const response = await fetch(
        `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.NODES}`,
        {
          method: 'GET',
          headers: getAuthHeaders(),
        }
      );

      console.log('Nodes response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Nodes API error:', errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Nodes data received:', data);
      
      // Handle different possible response formats
      const nodesList = Array.isArray(data) ? data : (data.nodes || data.data || []);
      
      console.log('Processed nodes list:', nodesList);
      
      if (nodesList.length === 0) {
        setError('No nodes available');
        return;
      }
      
      // Filter to only show ROOM_NODE types for environmental sensors
      const roomNodes = nodesList.filter(node => node.type === 'ROOM_NODE');

      setNodes(roomNodes);

      if (roomNodes.length > 0 && !selectedNode) {
        const firstNodeId = roomNodes[0].id || roomNodes[0].nodeId || roomNodes[0].uuid;
        setSelectedNode(firstNodeId);
    }
      
    } catch (error) {
      console.error('Error fetching nodes:', error);
      setError(`Failed to fetch nodes: ${error.message}`);
      Alert.alert(
        'Connection Error',
        `Unable to fetch node list: ${error.message}`,
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoading(false);
    }
  };

 const fetchAllData = async () => {
  if (!selectedNode) {
    console.warn('fetchAllData skipped: selectedNode is null');
    return;
  }

  try {
    setIsLoading(true);
    setError(null);

    await Promise.all([
      fetchCurrentSensorData(),
      fetchSensorHistory(),
    ]);

    setLastUpdated(new Date());
  } catch (error) {
    console.error('Error fetching data:', error);
    setError('Failed to fetch data from server');
  } finally {
    setIsLoading(false);
  }
};


  const fetchCurrentSensorData = async () => {
    try {
      const url = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.CURRENT_SENSORS}?nodeId=${selectedNode}`;
      console.log('Fetching current sensor data from:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      console.log('Current sensors response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Current sensors API error:', errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Current sensor data received:', data);
      
      // Store sensor data generically
      const processedData = {};
      SENSOR_DEFINITIONS.forEach(sensor => {
        const value = data[sensor.apiKey];
        if (value !== undefined && value !== null) {
          processedData[sensor.id] = parseFloat(value);
        }
      });
      
      console.log('Processed sensor data:', processedData);
      setSensorData(processedData);
      
    } catch (error) {
      console.error('Error fetching current sensor data:', error);
      throw error;
    }
  };

  const fetchSensorHistory = async () => {
    try {
      const url = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SENSOR_HISTORY}?nodeId=${selectedNode}`;
      console.log('Fetching sensor history from:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      console.log('Sensor history response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Sensor history API error:', errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('Sensor history data received:', result);
      
      // Handle different possible response formats
      const historyArray = Array.isArray(result) ? result : (result.data || result.history || []);
      
      console.log('History array length:', historyArray.length);
      
      // Process history data for each sensor
      const processedHistory = {};
      
      SENSOR_DEFINITIONS.forEach(sensor => {
        const labels = [];
        const values = [];
        
        historyArray.forEach((reading, index) => {
          const date = new Date(reading.timestamp || reading.time || reading.date);
          const hour = date.getHours();
          
          // Only show label every 2 hours to avoid clutter
          labels.push(index % 2 === 0 ? `${hour.toString().padStart(2, '0')}:00` : '');
          
          const value = reading[sensor.apiKey];
          if (value !== undefined && value !== null) {
            values.push(parseFloat(parseFloat(value).toFixed(sensor.decimalPlaces)));
          } else {
            values.push(null);
          }
        });
        
        const validValues = values.filter(v => v !== null);
        console.log(`${sensor.name} history: ${validValues.length} valid values`);
        
        processedHistory[sensor.id] = {
          labels,
          datasets: [{ data: validValues.length > 0 ? validValues : [0] }],
        };
      });
      
      setHistoryData(processedHistory);
      
    } catch (error) {
      console.error('Error fetching sensor history:', error);
      throw error;
    }
  };

  // HELPER FUNCTIONS

  const getStatus = (value, sensor) => {
    if (value === null || value === undefined) {
      return {
        label: 'No Data',
        color: '#6B7280',
        bgColor: isDarkMode ? '#374151' : '#F3F4F6',
      };
    }
    
    const thresholds = sensor.thresholds;
    
    if (value > thresholds.critical) {
      return {
        label: 'Critical',
        color: isDarkMode ? '#f89571ff' : '#dc6626ff',
        bgColor: isDarkMode ? '#913316ff' : '#feeae2ff',
      };
    }
    
    if (value > thresholds.max) {
      return {
        label: 'High',
        color: isDarkMode ? '#FBBF24' : '#F59E0B',
        bgColor: isDarkMode ? '#78350F' : '#FEF3C7',
      };
    }
    
    if (value < thresholds.min) {
      return {
        label: 'Low',
        color: isDarkMode ? '#60A5FA' : '#3B82F6',
        bgColor: isDarkMode ? '#1E3A8A' : '#DBEAFE',
      };
    }
    
    return {
      label: 'Normal',
      color: isDarkMode ? '#9b34d3ff' : '#8f10b9ff',
      bgColor: isDarkMode ? '#32064eff' : '#e6d1faff',
    };
  };

  const handleLogout = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem('isAuthenticated');
          router.replace('/login');
        },
      },
    ]);
  };

  // RENDER HELPERS
  
  const selectedNodeData = nodes.find(n => (n.id || n.nodeId || n.uuid) === selectedNode);
  const selectedNodeName = selectedNodeData?.friendlyName || selectedNodeData?.name || selectedNode || 'Unknown Node';
  const screenWidth = Dimensions.get('window').width;

  const dynamicStyles = {
    container: { ...styles.container, backgroundColor: isDarkMode ? '#111827' : '#F9FAFB' },
    header: { ...styles.header, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderBottomColor: isDarkMode ? '#374151' : '#E5E7EB' },
    headerTitle: { ...styles.headerTitle, color: isDarkMode ? '#F9FAFB' : '#111827' },
    headerSubtitle: { ...styles.headerSubtitle, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    nodeSelector: { ...styles.nodeSelector, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderBottomColor: isDarkMode ? '#374151' : '#E5E7EB' },
    sectionLabel: { ...styles.sectionLabel, color: isDarkMode ? '#D1D5DB' : '#374151' },
    nodeButton: { ...styles.nodeButton, backgroundColor: isDarkMode ? '#374151' : '#FFFFFF', borderColor: isDarkMode ? '#4B5563' : '#D1D5DB' },
    nodeButtonActive: { ...styles.nodeButtonActive, backgroundColor: isDarkMode ? '#1E3A8A' : '#EFF6FF', borderColor: isDarkMode ? '#3B82F6' : '#2563EB' },
    nodeButtonText: { ...styles.nodeButtonText, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    nodeButtonTextActive: { ...styles.nodeButtonTextActive, color: isDarkMode ? '#93C5FD' : '#2563EB' },
    card: { ...styles.card, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderColor: isDarkMode ? '#374151' : '#E5E7EB' },
    cardTitle: { ...styles.cardTitle, color: isDarkMode ? '#F9FAFB' : '#111827' },
    currentValueLabel: { ...styles.currentValueLabel, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    currentValue: { ...styles.currentValue, color: isDarkMode ? '#F9FAFB' : '#111827' },
    thresholdsTitle: { ...styles.thresholdsTitle, color: isDarkMode ? '#F9FAFB' : '#111827' },
    thresholdLabel: { ...styles.thresholdLabel, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    thresholdValue: { ...styles.thresholdValue, color: isDarkMode ? '#F9FAFB' : '#111827' },
    chartSubtitle: { ...styles.chartSubtitle, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    footer: { ...styles.footer, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderTopColor: isDarkMode ? '#374151' : '#E5E7EB' },
    footerText: { ...styles.footerText, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
  };

  // SENSOR CARD COMPONENT
  const SensorCard = ({ sensor }) => {
    const value = sensorData[sensor.id];
    const status = getStatus(value, sensor);
    const history = historyData[sensor.id];
    const hasHistoryData = history && history.datasets[0].data.length > 0;

    return (
      <View 
        style={dynamicStyles.card}
        accessible={true}
        accessibilityRole="summary"
        accessibilityLabel={`${sensor.name} sensor card. Current reading: ${value !== null && value !== undefined ? `${value.toFixed(sensor.decimalPlaces)} ${sensor.unit}` : 'no data'}. Status: ${status.label}`}
      >
        <View style={styles.cardHeader}>
          <Ionicons 
            name={sensor.icon} 
            size={24} 
            color={sensor.color}
            accessible={false}
          />
          <Text style={dynamicStyles.cardTitle}>{sensor.name}</Text>
        </View>

        {/* Current Value Display */}
        <View style={styles.currentValueContainer}>
          <Text 
            style={dynamicStyles.currentValueLabel}
            accessible={true}
            accessibilityLabel="Current reading"
          >
            Current Reading
          </Text>
          <Text 
            style={dynamicStyles.currentValue}
            accessible={true}
            accessibilityLabel={value !== null && value !== undefined ? `${value.toFixed(sensor.decimalPlaces)} ${sensor.unit}` : 'No data available'}
          >
            {value !== null && value !== undefined ? `${value.toFixed(sensor.decimalPlaces)}${sensor.unit}` : '--'}
          </Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: status.bgColor, borderColor: status.color },
            ]}
            accessible={true}
            accessibilityRole="text"
            accessibilityLabel={`Status: ${status.label}`}
          >
            <Text style={[styles.statusText, { color: status.color }]}>
              Status: {status.label}
            </Text>
          </View>
        </View>

        {/* Thresholds */}
        <View style={styles.thresholdsContainer}>
          <Text 
            style={dynamicStyles.thresholdsTitle}
            accessible={true}
            accessibilityRole="header"
          >
            Thresholds
          </Text>
          <View style={styles.thresholdRow}>
            <Text 
              style={dynamicStyles.thresholdLabel}
              accessible={true}
              accessibilityLabel={`Minimum safe level: ${sensor.thresholds.min} ${sensor.unit}`}
            >
              Minimum safe level:
            </Text>
            <Text style={dynamicStyles.thresholdValue}>
              {sensor.thresholds.min}{sensor.unit}
            </Text>
          </View>
          <View style={styles.thresholdRow}>
            <Text 
              style={dynamicStyles.thresholdLabel}
              accessible={true}
              accessibilityLabel={`Maximum safe level: ${sensor.thresholds.max} ${sensor.unit}`}
            >
              Maximum safe level:
            </Text>
            <Text style={dynamicStyles.thresholdValue}>
              {sensor.thresholds.max}{sensor.unit}
            </Text>
          </View>
          <View style={styles.thresholdRow}>
            <Text 
              style={dynamicStyles.thresholdLabel}
              accessible={true}
              accessibilityLabel={`Critical level: ${sensor.thresholds.critical} ${sensor.unit}`}
            >
              Critical level:
            </Text>
            <Text style={dynamicStyles.thresholdValue}>
              {sensor.thresholds.critical}{sensor.unit}
            </Text>
          </View>
        </View>

        {/* Historical Chart */}
        <View style={styles.chartContainer}>
          <Text 
            style={dynamicStyles.chartSubtitle}
            accessible={true}
            accessibilityLabel={`24-hour history for ${sensor.name}`}
          >
            24-Hour History
          </Text>
          {hasHistoryData ? (
            <LineChart
              data={history}
              width={screenWidth - 80}
              height={220}
              chartConfig={{
                backgroundColor: isDarkMode ? '#1F2937' : '#ffffff',
                backgroundGradientFrom: isDarkMode ? '#1F2937' : '#ffffff',
                backgroundGradientTo: isDarkMode ? '#1F2937' : '#ffffff',
                decimalPlaces: sensor.decimalPlaces,
                color: (opacity = 1) => `${sensor.color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`,
                labelColor: (opacity = 1) =>
                  isDarkMode
                    ? `rgba(156, 163, 175, ${opacity})`
                    : `rgba(107, 114, 128, ${opacity})`,
                propsForDots: {
                  r: '4',
                  strokeWidth: '2',
                  stroke: sensor.color,
                },
              }}
              bezier
              style={styles.chart}
              accessible={true}
              accessibilityLabel={`Line chart showing ${sensor.name} readings over the past 24 hours`}
            />
          ) : (
            <Text 
              style={[styles.noDataText, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}
              accessible={true}
              accessibilityLabel="No historical data available for this sensor"
            >
              No historical data available
            </Text>
          )}
        </View>
      </View>
    );
  };

  // MAIN COMPONENT RENDER

  return (
    <ScrollView 
      style={dynamicStyles.container}
      accessible={true}
      accessibilityLabel="Environmental monitoring dashboard"
    >
      {/* HEADER */}
      <View style={dynamicStyles.header}>
        <View style={{ flex: 1 }}>
          <Text 
            style={dynamicStyles.headerTitle}
            accessible={true}
            accessibilityRole="header"
            accessibilityLabel={config.systemName}
          >
            {config.systemName}
          </Text>
          <Text 
            style={dynamicStyles.headerSubtitle}
            accessible={true}
            accessibilityLabel={`Monitoring ${config.entityPlural.toLowerCase()}`}
          >
            Monitoring {config.entityPlural.toLowerCase()}
          </Text>
        </View>

        {/* Dark Mode Toggle */}
        <TouchableOpacity
          onPress={toggleDarkMode}
          style={styles.themeButton}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          accessibilityHint="Toggles between light and dark display modes"
        >
          <Ionicons
            name={isDarkMode ? 'sunny' : 'moon'}
            size={24}
            color={isDarkMode ? '#FBBF24' : '#6B7280'}
            accessible={false}
          />
        </TouchableOpacity>

        {/* Logout Button */}
        <TouchableOpacity 
          onPress={handleLogout} 
          style={styles.logoutButton}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          accessibilityHint="Signs you out of the application"
        >
          <Ionicons 
            name="log-out-outline" 
            size={24} 
            color="#DC2626"
            accessible={false}
          />
        </TouchableOpacity>
      </View>

      {/* NODE SELECTOR */}
      <View style={dynamicStyles.nodeSelector}>
        <Text 
          style={dynamicStyles.sectionLabel}
          accessible={true}
          accessibilityRole="header"
          accessibilityLabel={`Select ${config.entityName}`}
        >
          Select {config.entityName}
        </Text>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          accessible={true}
          accessibilityLabel="Node selection buttons"
        >
          {nodes.map((node) => {
            const nodeId = node.id || node.nodeId || node.uuid;
            const nodeName = node.friendlyName || node.name || nodeId;
            const isSelected = selectedNode === nodeId;
            
            return (
              <TouchableOpacity
                key={nodeId}
                onPress={() => setSelectedNode(nodeId)}
                style={[
                  dynamicStyles.nodeButton,
                  isSelected && dynamicStyles.nodeButtonActive,
                ]}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={nodeName}
                accessibilityState={{ selected: isSelected }}
                accessibilityHint={`Selects ${nodeName} for monitoring`}
              >
                <Text
                  style={[
                    dynamicStyles.nodeButtonText,
                    isSelected && dynamicStyles.nodeButtonTextActive,
                  ]}
                  accessible={false}
                >
                  {nodeName}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* LOADING INDICATOR */}
      {isLoading && nodes.length === 0 && (
        <View 
          style={styles.loadingContainer}
          accessible={true}
          accessibilityLabel="Loading sensor data"
          accessibilityLiveRegion="polite"
        >
          <ActivityIndicator 
            size="large" 
            color={isDarkMode ? '#60A5FA' : '#2563EB'}
            accessible={false}
          />
          <Text style={[styles.loadingText, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
            Fetching sensor data...
          </Text>
        </View>
      )}

      {/* ERROR MESSAGE */}
      {error && (
        <View 
          style={styles.errorContainer}
          accessible={true}
          accessibilityRole="alert"
          accessibilityLabel={`Error: ${error}`}
          accessibilityLiveRegion="assertive"
        >
          <Ionicons 
            name="alert-circle" 
            size={24} 
            color="#DC2626"
            accessible={false}
          />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity 
            onPress={fetchAllData} 
            style={styles.retryButton}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Retry loading data"
            accessibilityHint="Attempts to reload sensor data from the server"
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* SENSOR CARDS - Render all sensors dynamically */}
      {selectedNode && !isLoading && SENSOR_DEFINITIONS.map(sensor => (
        <SensorCard key={sensor.id} sensor={sensor} />
      ))}

      {/* FOOTER */}
      <View style={dynamicStyles.footer}>
        <View style={styles.footerItem}>
          <View 
            style={styles.statusDot}
            accessible={true}
            accessibilityLabel="System status indicator: active"
          />
          <Text 
            style={dynamicStyles.footerText}
            accessible={true}
            accessibilityLabel="System active, updates every 30 seconds"
          >
            System active • Updates every 30 seconds
          </Text>
        </View>
        <View style={styles.footerItem}>
          <Ionicons
            name="time-outline"
            size={14}
            color={isDarkMode ? '#9CA3AF' : '#6B7280'}
            accessible={false}
          />
          <Text 
            style={dynamicStyles.footerText}
            accessible={true}
            accessibilityLabel={`Last updated: ${lastUpdated.toLocaleTimeString()}`}
          >
            Last updated: {lastUpdated.toLocaleTimeString()}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  themeButton: {
    padding: 8,
    marginRight: 8,
  },
  logoutButton: {
    padding: 8,
  },
  nodeSelector: {
    padding: 20,
    borderBottomWidth: 1,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  nodeButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
    marginRight: 12,
  },
  nodeButtonActive: {},
  nodeButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  nodeButtonTextActive: {},
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  errorContainer: {
    margin: 20,
    padding: 20,
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DC2626',
    alignItems: 'center',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#DC2626',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  card: {
    margin: 20,
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  currentValueContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  currentValueLabel: {
    fontSize: 14,
    marginBottom: 4,
  },
  currentValue: {
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  thresholdsContainer: {
    marginTop: 8,
  },
  thresholdsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  thresholdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  thresholdLabel: {
    fontSize: 14,
  },
  thresholdValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  chartContainer: {
    marginTop: 16,
  },
  chartSubtitle: {
    fontSize: 14,
    marginBottom: 8,
  },
  chart: {
    marginVertical: 12,
    borderRadius: 12,
  },
  noDataText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 14,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    marginBottom: 20,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
  },
  footerText: {
    fontSize: 12,
  },
});
