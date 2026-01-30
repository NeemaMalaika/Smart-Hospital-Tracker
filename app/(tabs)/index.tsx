import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';

// ============================================================================
// TYPE DEFINITIONS
// These interfaces define the shape of our data throughout the application
// ============================================================================

interface APIConfig {
  BASE_URL: string;
  ENDPOINTS: {
    NODES: string;
    CURRENT_SENSORS: string;
    SENSOR_HISTORY: string;
  };
  POLLING_INTERVAL: number;
}

interface SensorThresholds {
  min: number;
  max: number;
  critical: number;
}

// Defines what each sensor needs (name, unit, icon, etc.)
interface SensorDefinition {
  id: string;
  name: string;
  unit: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  apiKey: string;  // The key used in API responses
  thresholds: SensorThresholds;
  decimalPlaces: number;
}

interface Config {
  systemName: string;
  entityName: string;
  entityPlural: string;
}

// Represents a monitoring node/device
interface Node {
  id?: string;
  nodeId?: string;
  uuid?: string;
  friendlyName?: string;
  name?: string;
  type?: string;
}

interface SensorData {
  [key: string]: number;
}

// Structure for chart data (labels and values)
interface HistoryDataset {
  labels: string[];
  datasets: [{ data: number[] }];
}

interface HistoryData {
  [key: string]: HistoryDataset;
}

// Status badge configuration (color, label, background)
interface Status {
  label: string;
  color: string;
  bgColor: string;
}

// Time range options for historical graphs
interface TimeRange {
  id: string;
  label: string;
  minutes: number;
}

// ============================================================================
// API CONFIGURATION
// Connection details for the backend server
// ============================================================================
const API_CONFIG: APIConfig = {
  BASE_URL: 'https://backend.smartenvironment.tech/api/v1',
  ENDPOINTS: {
    NODES: '/node/list',
    CURRENT_SENSORS: '/sensors/current',
    SENSOR_HISTORY: '/sensors/history',
  },
  POLLING_INTERVAL: 30000, // Refresh data every 30 seconds
};

// ============================================================================
// TIME RANGES FOR HISTORICAL DATA
// User can select how far back they want to see data
// ============================================================================
const TIME_RANGES: TimeRange[] = [
  { id: '5m', label: '5m', minutes: 5 },
  { id: '15m', label: '15m', minutes: 15 },
  { id: '30m', label: '30m', minutes: 30 },
  { id: '1h', label: '1h', minutes: 60 },
  { id: '3h', label: '3h', minutes: 180 },
  { id: '12h', label: '12h', minutes: 720 },
  { id: '24h', label: '24h', minutes: 1440 },
  { id: '3d', label: '3d', minutes: 4320 },
  { id: '7d', label: '7d', minutes: 10080 },
  { id: '30d', label: '30d', minutes: 43200 },
];

// ============================================================================
// SENSOR CONFIGURATION
// Defines all the sensors we're monitoring - easy to add more!
// ============================================================================
const SENSOR_DEFINITIONS: SensorDefinition[] = [
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

// Default system configuration
const DEFAULT_CONFIG: Config = {
  systemName: 'Environmental Monitoring System',
  entityName: 'Node',
  entityPlural: 'Nodes',
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function EnvironmentalMonitor() {
  const router = useRouter();
  
  // ============================================================================
  // STATE MANAGEMENT
  // All the data our app needs to keep track of
  // ============================================================================
  
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [nodes, setNodes] = useState<Node[]>([]);  // List of all available nodes
  const [selectedNode, setSelectedNode] = useState<string | null>(null);  // Which node we're viewing
  const [sensorData, setSensorData] = useState<SensorData>({});  // Current sensor readings
  const [historyData, setHistoryData] = useState<HistoryData>({});  // Historical data for charts
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());  // When we last fetched data
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);  // Light or dark theme
  const [isLoading, setIsLoading] = useState<boolean>(true);  // Are we fetching data?
  const [error, setError] = useState<string | null>(null);  // Any error messages
  
  // Sensor dropdown state
  const [selectedSensor, setSelectedSensor] = useState<string>(SENSOR_DEFINITIONS[0].id);
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  
  // Time range selector state
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>('24h');  // Default to 24 hours

  // ============================================================================
  // LIFECYCLE HOOKS
  // These run at specific times in the component's life
  // ============================================================================
  
  // Run once when component first loads
  useEffect(() => {
    checkAuth();  // Make sure user is logged in
    loadConfig();  // Load saved settings
    loadThemePreference();  // Load dark/light mode preference
    fetchNodes();  // Get the list of nodes from the server
  }, []);

  // Run whenever the selected node changes
  useEffect(() => {
    if (selectedNode) {
      fetchAllData();  // Fetch data for the new node
      // Set up automatic refresh every 30 seconds
      const interval = setInterval(fetchAllData, API_CONFIG.POLLING_INTERVAL);
      return () => clearInterval(interval);  // Clean up when component unmounts
    }
  }, [selectedNode]);

  // Refetch history when time range changes
  useEffect(() => {
    if (selectedNode) {
      fetchSensorHistory();
    }
  }, [selectedTimeRange]);

  // ============================================================================
  // AUTHENTICATION & CONFIGURATION
  // ============================================================================
  
  // Check if user is authenticated, redirect to login if not
  const checkAuth = async (): Promise<void> => {
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

  // Load saved system configuration from device storage
  const loadConfig = async (): Promise<void> => {
    try {
      const savedConfig = await AsyncStorage.getItem('systemConfig');
      if (savedConfig) {
        setConfig(JSON.parse(savedConfig));
      }
    } catch (error) {
      console.error('Config load error:', error);
    }
  };

  // Load the user's preferred theme (dark or light mode)
  const loadThemePreference = async (): Promise<void> => {
    try {
      const savedTheme = await AsyncStorage.getItem('isDarkMode');
      if (savedTheme !== null) {
        setIsDarkMode(savedTheme === 'true');
      }
    } catch (error) {
      console.error('Theme load error:', error);
    }
  };

  // Toggle between dark and light mode
  const toggleDarkMode = async (): Promise<void> => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    try {
      await AsyncStorage.setItem('isDarkMode', String(newMode));
    } catch (error) {
      console.error('Theme save error:', error);
    }
  };

  // ============================================================================
  // API INTEGRATION
  // Functions that talk to the backend server
  // ============================================================================
  
  // Standard headers for API requests (includes API key)
  const getAuthHeaders = () => ({
    'Content-Type': 'application/json',
    'API-KEY': '49643a60-0aff-4a88-8e65-30ea428df8ee',
  });

  // Fetch the list of available nodes from the server
  const fetchNodes = async (): Promise<void> => {
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
      
      // Handle different possible response formats from the API
      const nodesList: Node[] = Array.isArray(data) ? data : (data.nodes || data.data || []);
      
      console.log('Processed nodes list:', nodesList);
      
      if (nodesList.length === 0) {
        setError('No nodes available');
        return;
      }
      
      // We only want ROOM_NODE types for environmental sensors
      const roomNodes = nodesList.filter((node: Node) => node.type === 'ROOM_NODE');

      setNodes(roomNodes);

      // Automatically select the first node if none is selected
      if (roomNodes.length > 0 && !selectedNode) {
        const firstNodeId = roomNodes[0].id || roomNodes[0].nodeId || roomNodes[0].uuid;
        setSelectedNode(firstNodeId || null);
      }
      
    } catch (error) {
      console.error('Error fetching nodes:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(`Failed to fetch nodes: ${errorMessage}`);
      Alert.alert(
        'Connection Error',
        `Unable to fetch node list: ${errorMessage}`,
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch both current sensor data and historical data
  const fetchAllData = async (): Promise<void> => {
    if (!selectedNode) {
      console.warn('fetchAllData skipped: selectedNode is null');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Fetch both current and historical data in parallel
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

  // Fetch the current (latest) readings from all sensors
  const fetchCurrentSensorData = async (): Promise<void> => {
    try {
      const url = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.CURRENT_SENSORS}?nodeId=${selectedNode}`;
      console.log('Fetching current sensor data from:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      console.log('Current sensors response status:', response.status);

      // 204 means "no content" - the node hasn't sent data yet
      if (response.status === 204) {
        console.log('No current sensor data available (204)');
        setSensorData({});
        return;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Current sensors API error:', errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Current sensor data received:', data);
      
      // Convert API response to our internal format
      const processedData: SensorData = {};
      SENSOR_DEFINITIONS.forEach((sensor: SensorDefinition) => {
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

  // Fetch historical sensor data for graphs
  const fetchSensorHistory = async (): Promise<void> => {
    try {
      // Get the selected time range
      const timeRange = TIME_RANGES.find(tr => tr.id === selectedTimeRange);
      if (!timeRange) return;

      const url = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SENSOR_HISTORY}?nodeId=${selectedNode}&minutes=${timeRange.minutes}`;
      console.log('Fetching sensor history from:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      console.log('Sensor history response status:', response.status);

      // 204 means no historical data available yet
      if (response.status === 204) {
        console.log('No sensor history available (204)');
        // Set empty history for all sensors
        const emptyHistory: HistoryData = {};
        SENSOR_DEFINITIONS.forEach((sensor: SensorDefinition) => {
          emptyHistory[sensor.id] = {
            labels: [],
            datasets: [{ data: [0] }],
          };
        });
        setHistoryData(emptyHistory);
        return;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Sensor history API error:', errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('Sensor history data received:', result);
      
      // Handle different possible response formats
      const historyArray: any[] = Array.isArray(result) ? result : (result.data || result.history || []);
      
      console.log('History array length:', historyArray.length);
      
      // Process history data for each sensor
      const processedHistory: HistoryData = {};
      
      SENSOR_DEFINITIONS.forEach((sensor: SensorDefinition) => {
        const labels: string[] = [];
        const values: (number | null)[] = [];
        
        // Convert each reading into chart-friendly format
        historyArray.forEach((reading: any, index: number) => {
          const date = new Date(reading.timestamp || reading.time || reading.date);
          
          // Format the time label based on the time range
          let timeLabel = '';
          if (timeRange.minutes <= 60) {
            // For short ranges (≤1h), show minutes
            timeLabel = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          } else if (timeRange.minutes <= 1440) {
            // For medium ranges (≤24h), show hours
            const hour = date.getHours();
            timeLabel = `${hour.toString().padStart(2, '0')}:00`;
          } else {
            // For long ranges (>24h), show date
            timeLabel = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
          }
          
          // Only show labels periodically to avoid clutter
          const showLabel = index % Math.max(1, Math.floor(historyArray.length / 8)) === 0;
          labels.push(showLabel ? timeLabel : '');
          
          const value = reading[sensor.apiKey];
          if (value !== undefined && value !== null) {
            values.push(parseFloat(parseFloat(value).toFixed(sensor.decimalPlaces)));
          } else {
            values.push(null);
          }
        });
        
        const validValues = values.filter((v): v is number => v !== null);
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

  // ============================================================================
  // HELPER FUNCTIONS
  // Utility functions for common tasks
  // ============================================================================

  // Determine the status (Normal, High, Low, Critical) based on sensor value
  const getStatus = (value: number | null | undefined, sensor: SensorDefinition): Status => {
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

  // Handle user logout
  const handleLogout = async (): Promise<void> => {
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

  // ============================================================================
  // RENDER HELPERS
  // Variables and functions used in the UI
  // ============================================================================
  
  const selectedNodeData = nodes.find((n: Node) => (n.id || n.nodeId || n.uuid) === selectedNode);
  const selectedNodeName = selectedNodeData?.friendlyName || selectedNodeData?.name || selectedNode || 'Unknown Node';
  const screenWidth = Dimensions.get('window').width;

  // Dynamic styles that change based on dark/light mode
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
    dropdownButton: { ...styles.dropdownButton, backgroundColor: isDarkMode ? '#374151' : '#FFFFFF', borderColor: isDarkMode ? '#4B5563' : '#D1D5DB' },
    dropdownButtonText: { ...styles.dropdownButtonText, color: isDarkMode ? '#F9FAFB' : '#111827' },
    dropdownMenu: { ...styles.dropdownMenu, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderColor: isDarkMode ? '#374151' : '#E5E7EB' },
    dropdownItem: { ...styles.dropdownItem, borderBottomColor: isDarkMode ? '#374151' : '#E5E7EB' },
    dropdownItemText: { ...styles.dropdownItemText, color: isDarkMode ? '#D1D5DB' : '#374151' },
    timeRangeButton: { ...styles.timeRangeButton, backgroundColor: isDarkMode ? '#374151' : '#F3F4F6', borderColor: isDarkMode ? '#4B5563' : '#D1D5DB' },
    timeRangeButtonActive: { ...styles.timeRangeButtonActive, backgroundColor: isDarkMode ? '#3B82F6' : '#2563EB' },
    timeRangeButtonText: { ...styles.timeRangeButtonText, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    timeRangeButtonTextActive: { ...styles.timeRangeButtonTextActive, color: '#FFFFFF' },
  };

  // ============================================================================
  // UI COMPONENTS
  // Reusable pieces of the interface
  // ============================================================================

  // Dropdown for selecting which sensor to view
  const SensorDropdown: React.FC = () => {
    const currentSensor = SENSOR_DEFINITIONS.find((s: SensorDefinition) => s.id === selectedSensor);
    
    return (
      <View style={styles.dropdownContainer}>
        <Text 
          style={dynamicStyles.sectionLabel}
          accessible={true}
          accessibilityRole="header"
        >
          Select Sensor to View
        </Text>
        
        {/* Dropdown Button */}
        <TouchableOpacity
          onPress={() => setIsDropdownOpen(!isDropdownOpen)}
          style={dynamicStyles.dropdownButton}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={`Selected sensor: ${currentSensor?.name}. Tap to change.`}
          accessibilityHint="Opens a menu to select a different sensor"
        >
          <View style={styles.dropdownButtonContent}>
            <Ionicons 
              name={currentSensor?.icon || 'help'} 
              size={20} 
              color={currentSensor?.color}
              accessible={false}
            />
            <Text style={dynamicStyles.dropdownButtonText}>
              {currentSensor?.name}
            </Text>
          </View>
          <Ionicons 
            name={isDropdownOpen ? 'chevron-up' : 'chevron-down'} 
            size={20} 
            color={isDarkMode ? '#9CA3AF' : '#6B7280'}
            accessible={false}
          />
        </TouchableOpacity>
        
        {/* Dropdown Menu */}
        {isDropdownOpen && (
          <View 
            style={dynamicStyles.dropdownMenu}
            accessible={true}
            accessibilityLabel="Sensor selection menu"
          >
            {SENSOR_DEFINITIONS.map((sensor: SensorDefinition) => (
              <TouchableOpacity
                key={sensor.id}
                onPress={() => {
                  setSelectedSensor(sensor.id);
                  setIsDropdownOpen(false);
                }}
                style={[
                  dynamicStyles.dropdownItem,
                  sensor.id === selectedSensor && styles.dropdownItemActive
                ]}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={sensor.name}
                accessibilityState={{ selected: sensor.id === selectedSensor }}
              >
                <View style={styles.dropdownItemContent}>
                  <Ionicons 
                    name={sensor.icon} 
                    size={20} 
                    color={sensor.color}
                    accessible={false}
                  />
                  <Text style={dynamicStyles.dropdownItemText}>
                    {sensor.name}
                  </Text>
                </View>
                {sensor.id === selectedSensor && (
                  <Ionicons 
                    name="checkmark" 
                    size={20} 
                    color={sensor.color}
                    accessible={false}
                  />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  // Time range selector for historical graphs
  const TimeRangeSelector: React.FC = () => {
    return (
      <View style={styles.timeRangeContainer}>
        <Text 
          style={dynamicStyles.sectionLabel}
          accessible={true}
          accessibilityRole="header"
        >
          Time Range
        </Text>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          accessible={true}
          accessibilityLabel="Time range selection buttons"
        >
          {TIME_RANGES.map((range: TimeRange) => {
            const isSelected = selectedTimeRange === range.id;
            
            return (
              <TouchableOpacity
                key={range.id}
                onPress={() => setSelectedTimeRange(range.id)}
                style={[
                  dynamicStyles.timeRangeButton,
                  isSelected && dynamicStyles.timeRangeButtonActive,
                ]}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={range.label}
                accessibilityState={{ selected: isSelected }}
                accessibilityHint={`Shows data from the last ${range.label}`}
              >
                <Text
                  style={[
                    dynamicStyles.timeRangeButtonText,
                    isSelected && dynamicStyles.timeRangeButtonTextActive,
                  ]}
                  accessible={false}
                >
                  {range.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  // Card displaying a single sensor's data
  interface SensorCardProps {
    sensor: SensorDefinition;
  }

  const SensorCard: React.FC<SensorCardProps> = ({ sensor }) => {
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
        {/* Sensor Header */}
        <View style={styles.cardHeader}>
          <Ionicons 
            name={sensor.icon} 
            size={24} 
            color={sensor.color}
            accessible={false}
          />
          <Text style={dynamicStyles.cardTitle}>{sensor.name}</Text>
        </View>

        {/* Current Reading Display */}
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

        {/* Safety Thresholds */}
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
            accessibilityLabel={`Historical data for ${sensor.name}`}
          >
            Historical Data ({TIME_RANGES.find(tr => tr.id === selectedTimeRange)?.label})
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
              accessibilityLabel={`Line chart showing ${sensor.name} readings over time`}
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

  // ============================================================================
  // MAIN RENDER
  // The actual UI that gets displayed
  // ============================================================================

  return (
    <ScrollView 
      style={dynamicStyles.container}
      accessible={true}
      accessibilityLabel="Environmental monitoring dashboard"
    >
      {/* Top Header with System Name */}
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

        {/* Dark Mode Toggle Button */}
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

      {/* Node/Device Selector */}
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
          {nodes.map((node: Node) => {
            const nodeId = node.id || node.nodeId || node.uuid;
            const nodeName = node.friendlyName || node.name || nodeId;
            const isSelected = selectedNode === nodeId;
            
            return (
              <TouchableOpacity
                key={nodeId}
                onPress={() => setSelectedNode(nodeId || null)}
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

      {/* Sensor Selection Dropdown */}
      {selectedNode && !isLoading && (
        <View style={dynamicStyles.nodeSelector}>
          <SensorDropdown />
        </View>
      )}

      {/* Time Range Selector */}
      {selectedNode && !isLoading && (
        <View style={dynamicStyles.nodeSelector}>
          <TimeRangeSelector />
        </View>
      )}

      {/* Loading Indicator */}
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

      {/* Error Message Display */}
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

      {/* Display Selected Sensor Card */}
      {selectedNode && !isLoading && (() => {
        const sensor = SENSOR_DEFINITIONS.find((s: SensorDefinition) => s.id === selectedSensor);
        return sensor ? <SensorCard key={sensor.id} sensor={sensor} /> : null;
      })()}

      {/* Footer with System Status */}
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
// All the styling for the components
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
  
  // Dropdown Styles
  dropdownContainer: {
    marginTop: 8,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 2,
  },
  dropdownButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dropdownButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  dropdownMenu: {
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  dropdownItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dropdownItemText: {
    fontSize: 15,
  },
  dropdownItemActive: {
    opacity: 0.7,
  },

  // Time Range Selector Styles
  timeRangeContainer: {
    marginTop: 8,
  },
  timeRangeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
    minWidth: 50,
    alignItems: 'center',
  },
  timeRangeButtonActive: {},
  timeRangeButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  timeRangeButtonTextActive: {},
  
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