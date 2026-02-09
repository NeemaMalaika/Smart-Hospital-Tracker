import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { useAuthenticatedAPI } from '../../hooks/useAuthenticatedAPI';

// ============================================================================
// TYPE DEFINITIONS
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

interface SensorDefinition {
  id: string;
  name: string;
  unit: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  apiKey: string | string[];  // Can be array for combined sensors
  thresholds: SensorThresholds;
  decimalPlaces: number;
  aggregate?: 'average' | 'sum';  // How to combine multiple values
}

interface Config {
  systemName: string;
  entityName: string;
  entityPlural: string;
}

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

interface HistoryDataset {
  labels: string[];
  datasets: [{ data: number[] }];
}

interface HistoryData {
  [key: string]: HistoryDataset;
}

interface Status {
  label: string;
  color: string;
  bgColor: string;
}

interface TimeRange {
  id: string;
  label: string;
  minutes: number;
}

// ============================================================================
// API CONFIGURATION
// ============================================================================
const API_CONFIG: APIConfig = {
  BASE_URL: 'https://backend.smartenvironment.tech/api/v1',
  ENDPOINTS: {
    NODES: '/node/list',
    CURRENT_SENSORS: '/sensors/current',
    SENSOR_HISTORY: '/sensors/history',
  },
  POLLING_INTERVAL: 30000,
};

// ============================================================================
// TIME RANGES
// ============================================================================
const TIME_RANGES: TimeRange[] = [
  { id: '5m', label: '5 min', minutes: 5 },
  { id: '15m', label: '15 min', minutes: 15 },
  { id: '1h', label: '1 hour', minutes: 60 },
  { id: '3h', label: '3 hours', minutes: 180 },
  { id: '6h', label: '6 hours', minutes: 360 },
  { id: '24h', label: '24 hours', minutes: 1440 },
  { id: '7d', label: '7 days', minutes: 10080 },
  { id: '30d', label: '30 days', minutes: 43200 },
];

// ============================================================================
// SENSOR CONFIGURATION - Combined Light Sensor
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
    unit: 'kPa',
    icon: 'speedometer',
    color: '#8B5CF6',
    apiKey: 'pressure',
    thresholds: { min: 980, max: 1020, critical: 1040 },
    decimalPlaces: 2,
  },
  {
    id: 'light',
    name: 'Light Level',
    unit: 'lux',
    icon: 'sunny',
    color: '#FBBF24',
    apiKey: 'light',
    aggregate: 'average',
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

const DEFAULT_CONFIG: Config = {
  systemName: 'Environmental Monitor',
  entityName: 'Node',
  entityPlural: 'Nodes',
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function EnvironmentalMonitor() {
  const router = useRouter();
  
  // authentication hook
  const { authToken, isTokenLoaded, getAuthHeaders, authenticatedFetch } = useAuthenticatedAPI();
  
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [sensorData, setSensorData] = useState<SensorData>({});
  const [historyData, setHistoryData] = useState<HistoryData>({});
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Multi-select for sensors and time ranges
  const [selectedSensors, setSelectedSensors] = useState<string[]>([SENSOR_DEFINITIONS[0].id]);
  const [selectedTimeRanges, setSelectedTimeRanges] = useState<string[]>(['24h']);
  
  // Node search
  const [nodeSearchQuery, setNodeSearchQuery] = useState<string>('');
  const [isNodeSearchFocused, setIsNodeSearchFocused] = useState<boolean>(false);

  // ============================================================================
  // LIFECYCLE HOOKS
  // ============================================================================
  
  useEffect(() => {
    console.log('📊 Dashboard mounted - auth already checked by _layout.tsx');
    loadConfig();
    loadThemePreference();
    // ✅ CHANGED: Only fetch nodes after token is loaded
    if (isTokenLoaded) {
      fetchNodes();
    }
  }, [isTokenLoaded]); // Added dependency

  useEffect(() => {
    if (selectedNode && isTokenLoaded) { //Added isTokenLoaded check
      fetchAllData();
      const interval = setInterval(fetchAllData, API_CONFIG.POLLING_INTERVAL);
      return () => clearInterval(interval);
    }
  }, [selectedNode, isTokenLoaded]); //Added isTokenLoaded dependency

  useEffect(() => {
    if (selectedNode && isTokenLoaded) { //  Added isTokenLoaded check
      fetchSensorHistory();
    }
  }, [selectedTimeRanges, isTokenLoaded]); //  Added isTokenLoaded dependency

  // ============================================================================
  // AUTHENTICATION & CONFIGURATION
  // ============================================================================

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
  // ============================================================================

  const fetchNodes = async (): Promise<void> => {
    try {
      //  Check if token is loaded
      if (!isTokenLoaded) {
        console.log('⏳ Waiting for auth token...');
        return;
      }

      setIsLoading(true);
      setError(null);

      //Use authenticatedFetch from hook
      const response = await authenticatedFetch(
        `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.NODES}`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const nodesList: Node[] = Array.isArray(data) ? data : (data.nodes || data.data || []);
      
      if (nodesList.length === 0) {
        setError('No nodes available');
        return;
      }
      
      const roomNodes = nodesList.filter((node: Node) => node.type === 'ROOM_NODE');
      setNodes(roomNodes);

      if (roomNodes.length > 0 && !selectedNode) {
        const firstNodeId = roomNodes[0].id || roomNodes[0].nodeId || roomNodes[0].uuid;
        setSelectedNode(firstNodeId || null);
      }
      
    } catch (error) {
      console.error('Error fetching nodes:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(`Failed to fetch nodes: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAllData = async (): Promise<void> => {
    if (!selectedNode || !isTokenLoaded) return; //  Added isTokenLoaded check

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

  const fetchCurrentSensorData = async (): Promise<void> => {
    try {
      const url = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.CURRENT_SENSORS}?nodeId=${selectedNode}`;

      // Use authenticatedFetch from hook
      const response = await authenticatedFetch(url);

      if (response.status === 204) {
        setSensorData({});
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      const processedData: SensorData = {};
      SENSOR_DEFINITIONS.forEach((sensor: SensorDefinition) => {
        if (Array.isArray(sensor.apiKey)) {
          // Combined sensor - aggregate multiple values
          const values = sensor.apiKey
            .map(key => data[key])
            .filter(v => v !== undefined && v !== null)
            .map(v => parseFloat(v));
          
          if (values.length > 0) {
            if (sensor.aggregate === 'average') {
              processedData[sensor.id] = values.reduce((a, b) => a + b, 0) / values.length;
            } else if (sensor.aggregate === 'sum') {
              processedData[sensor.id] = values.reduce((a, b) => a + b, 0);
            }
          }
        } else {
          // Single sensor
          const value = sensor.apiKey === 'pressure' ? data[sensor.apiKey] / 1000 : data[sensor.apiKey];
          if (value !== undefined && value !== null) {
            processedData[sensor.id] = parseFloat(value);
          }
        }
      });
      
      setSensorData(processedData);
      
    } catch (error) {
      console.error('Error fetching current sensor data:', error);
      throw error;
    }
  };

  const fetchSensorHistory = async (): Promise<void> => {
    try {
      // Fetch history for all selected time ranges
      const allHistoryData: HistoryData = {};
      
      for (const timeRangeId of selectedTimeRanges) {
        const timeRange = TIME_RANGES.find(tr => tr.id === timeRangeId);
        if (!timeRange) continue;

        const url = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SENSOR_HISTORY}?nodeId=${selectedNode}&minutes=${timeRange.minutes}`;

        // Use authenticatedFetch from hook
        const response = await authenticatedFetch(url);

        if (response.status === 204) {
          continue;
        }

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        const historyArray: any[] = Array.isArray(result) ? result : (result.data || result.history || []);
        
        SENSOR_DEFINITIONS.forEach((sensor: SensorDefinition) => {
          const labels: string[] = [];
          const values: (number | null)[] = [];
          
          historyArray.forEach((reading: any, index: number) => {
            const date = new Date(reading.timestamp || reading.time || reading.date);
            
            let timeLabel = '';
            if (timeRange.minutes <= 60) {
              timeLabel = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } else if (timeRange.minutes <= 1440) {
              const hour = date.getHours();
              timeLabel = `${hour.toString().padStart(2, '0')}:00`;
            } else {
              timeLabel = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
            }
            
            const showLabel = index % Math.max(1, Math.floor(historyArray.length / 8)) === 0;
            labels.push(showLabel ? timeLabel : '');
            
            if (Array.isArray(sensor.apiKey)) {
              // Combined sensor
              const sensorValues = sensor.apiKey
                .map(key => reading[key])
                .filter(v => v !== undefined && v !== null)
                .map(v => parseFloat(v));
              
              if (sensorValues.length > 0) {
                let aggregatedValue;
                if (sensor.aggregate === 'average') {
                  aggregatedValue = sensorValues.reduce((a, b) => a + b, 0) / sensorValues.length;
                } else {
                  aggregatedValue = sensorValues.reduce((a, b) => a + b, 0);
                }
                values.push(parseFloat(aggregatedValue.toFixed(sensor.decimalPlaces)));
              } else {
                values.push(null);
              }
            } else {
              // Single sensor
              const value = reading[sensor.apiKey];
              if (value !== undefined && value !== null) {
                values.push(parseFloat(parseFloat(value).toFixed(sensor.decimalPlaces)));
              } else {
                values.push(null);
              }
            }
          });
          
          const validValues = values.filter((v): v is number => v !== null);
          const key = `${sensor.id}_${timeRangeId}`;
          
          allHistoryData[key] = {
            labels,
            datasets: [{ data: validValues.length > 0 ? validValues : [0] }],
          };
        });
      }
      
      setHistoryData(allHistoryData);
      
    } catch (error) {
      console.error('Error fetching sensor history:', error);
      throw error;
    }
  };

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

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

  // Toggle sensor selection
  const toggleSensor = (sensorId: string): void => {
    setSelectedSensors(prev => {
      if (prev.includes(sensorId)) {
        // Don't allow deselecting if it's the last one
        if (prev.length === 1) return prev;
        return prev.filter(id => id !== sensorId);
      } else {
        return [...prev, sensorId];
      }
    });
  };

  // Toggle time range selection
  const toggleTimeRange = (timeRangeId: string): void => {
    setSelectedTimeRanges(prev => {
      if (prev.includes(timeRangeId)) {
        // Don't allow deselecting if it's the last one
        if (prev.length === 1) return prev;
        return prev.filter(id => id !== timeRangeId);
      } else {
        return [...prev, timeRangeId];
      }
    });
  };

  // Filter nodes based on search query
  const filteredNodes = nodes.filter((node: Node) => {
    const nodeName = (node.friendlyName || node.name || node.id || node.nodeId || node.uuid || '').toLowerCase();
    return nodeName.includes(nodeSearchQuery.toLowerCase());
  });

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================
  
  const selectedNodeData = nodes.find((n: Node) => (n.id || n.nodeId || n.uuid) === selectedNode);
  const selectedNodeName = selectedNodeData?.friendlyName || selectedNodeData?.name || selectedNode || 'Unknown Node';
  const screenWidth = Dimensions.get('window').width;

  const dynamicStyles = {
    container: { ...styles.container, backgroundColor: isDarkMode ? '#111827' : '#F9FAFB' },
    header: { ...styles.header, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderBottomColor: isDarkMode ? '#374151' : '#E5E7EB' },
    headerTitle: { ...styles.headerTitle, color: isDarkMode ? '#F9FAFB' : '#111827' },
    headerSubtitle: { ...styles.headerSubtitle, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    section: { ...styles.section, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderBottomColor: isDarkMode ? '#374151' : '#E5E7EB' },
    sectionLabel: { ...styles.sectionLabel, color: isDarkMode ? '#D1D5DB' : '#374151' },
    searchInput: { ...styles.searchInput, backgroundColor: isDarkMode ? '#374151' : '#F3F4F6', color: isDarkMode ? '#F9FAFB' : '#111827', borderColor: isDarkMode ? '#4B5563' : '#D1D5DB' },
    nodeDropdown: { ...styles.nodeDropdown, backgroundColor: isDarkMode ? '#374151' : '#FFFFFF', borderColor: isDarkMode ? '#4B5563' : '#D1D5DB' },
    nodeItem: { ...styles.nodeItem, borderBottomColor: isDarkMode ? '#4B5563' : '#E5E7EB' },
    nodeItemText: { ...styles.nodeItemText, color: isDarkMode ? '#D1D5DB' : '#374151' },
    nodeItemActive: { ...styles.nodeItemActive, backgroundColor: isDarkMode ? '#1E3A8A' : '#EFF6FF' },
    chipButton: { ...styles.chipButton, backgroundColor: isDarkMode ? '#374151' : '#F3F4F6', borderColor: isDarkMode ? '#4B5563' : '#D1D5DB' },
    chipButtonActive: { ...styles.chipButtonActive, backgroundColor: isDarkMode ? '#3B82F6' : '#2563EB', borderColor: isDarkMode ? '#3B82F6' : '#2563EB' },
    chipButtonText: { ...styles.chipButtonText, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    chipButtonTextActive: { ...styles.chipButtonTextActive, color: '#FFFFFF' },
    card: { ...styles.card, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderColor: isDarkMode ? '#374151' : '#E5E7EB' },
    cardTitle: { ...styles.cardTitle, color: isDarkMode ? '#F9FAFB' : '#111827' },
    currentValueLabel: { ...styles.currentValueLabel, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    currentValue: { ...styles.currentValue, color: isDarkMode ? '#F9FAFB' : '#111827' },
    chartSubtitle: { ...styles.chartSubtitle, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    footer: { ...styles.footer, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderTopColor: isDarkMode ? '#374151' : '#E5E7EB' },
    footerText: { ...styles.footerText, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
  };

  // ============================================================================
  // UI COMPONENTS
  // ============================================================================

  // Searchable Node Selector
  const NodeSelector: React.FC = () => {
    return (
      <View style={dynamicStyles.section}>        
        <View style={styles.searchContainer}>
          <Ionicons 
            name="search" 
            size={20} 
            color={isDarkMode ? '#9CA3AF' : '#6B7280'}
            style={styles.searchIcon}
            importantForAccessibility="no-hide-descendants"
          />
          <TextInput
            style={dynamicStyles.searchInput}
            placeholder="Select a device..."
            placeholderTextColor={isDarkMode ? '#6B7280' : '#9CA3AF'}
            value={nodeSearchQuery}
            onChangeText={setNodeSearchQuery}
            onFocus={() => setIsNodeSearchFocused(true)}
            onBlur={() => setTimeout(() => setIsNodeSearchFocused(false), 200)}
            accessible={true}
            accessibilityLabel="Search for nodes"
            accessibilityHint="Type to filter available monitoring nodes"
            accessibilityRole="search"
          />
        </View>

        {/* Show current selection when not searching */}
        {!isNodeSearchFocused && selectedNode && (
          <TouchableOpacity
            style={[dynamicStyles.chipButton, dynamicStyles.chipButtonActive, styles.selectedNodeChip]}
            onPress={() => setIsNodeSearchFocused(true)}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={`Selected node: ${selectedNodeName}`}
            accessibilityHint="Tap to search for a different node"
          >
            <Ionicons name="radio-button-on" size={16} color="#FFFFFF" importantForAccessibility="no-hide-descendants" />
            <Text style={dynamicStyles.chipButtonTextActive} importantForAccessibility="no-hide-descendants">{selectedNodeName}</Text>
          </TouchableOpacity>
        )}

        {/* Dropdown results */}
        {isNodeSearchFocused && filteredNodes.length > 0 && (
          <View 
            style={dynamicStyles.nodeDropdown}
            accessible={true}
            accessibilityLabel="Node selection menu"
          >
            <ScrollView style={styles.nodeDropdownScroll} nestedScrollEnabled>
              {filteredNodes.map((node: Node) => {
                const nodeId = node.id || node.nodeId || node.uuid;
                const nodeName = node.friendlyName || node.name || nodeId;
                const isSelected = selectedNode === nodeId;
                
                return (
                  <TouchableOpacity
                    key={nodeId}
                    onPress={() => {
                      setSelectedNode(nodeId || null);
                      setNodeSearchQuery('');
                      setIsNodeSearchFocused(false);
                    }}
                    style={[
                      dynamicStyles.nodeItem,
                      isSelected && dynamicStyles.nodeItemActive,
                    ]}
                    accessible={true}
                    accessibilityRole="button"
                    accessibilityLabel={nodeName}
                    accessibilityState={{ selected: isSelected }}
                    accessibilityHint={`Selects ${nodeName} for monitoring`}
                  >
                    <Text style={dynamicStyles.nodeItemText} importantForAccessibility="no-hide-descendants">{nodeName}</Text>
                    {isSelected && (
                      <Ionicons name="checkmark" size={20} color={isDarkMode ? '#60A5FA' : '#2563EB'} importantForAccessibility="no-hide-descendants" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  // Multi-Select Sensor Selector
  const SensorSelector: React.FC = () => {
    return (
      <View style={dynamicStyles.section}>
        <Text 
          style={dynamicStyles.sectionLabel}
          accessible={true}
          accessibilityRole="header"
        >
          Select Sensors
        </Text>
        <View 
          style={styles.chipContainer}
          accessible={true}
          accessibilityLabel="Sensor selection buttons"
        >
          {SENSOR_DEFINITIONS.map((sensor: SensorDefinition) => {
            const isSelected = selectedSensors.includes(sensor.id);
            
            return (
              <TouchableOpacity
                key={sensor.id}
                onPress={() => toggleSensor(sensor.id)}
                style={[
                  dynamicStyles.chipButton,
                  isSelected && dynamicStyles.chipButtonActive,
                ]}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={sensor.name}
                accessibilityState={{ selected: isSelected }}
                accessibilityHint={isSelected ? `Tap to hide ${sensor.name} data` : `Tap to show ${sensor.name} data`}
              >
                <Ionicons 
                  name={sensor.icon} 
                  size={16} 
                  color={isSelected ? '#FFFFFF' : sensor.color}
                  importantForAccessibility="no-hide-descendants"
                />
                <Text
                  style={[
                    dynamicStyles.chipButtonText,
                    isSelected && dynamicStyles.chipButtonTextActive,
                  ]}
                  importantForAccessibility="no-hide-descendants"
                >
                  {sensor.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  // Multi-Select Time Range Selector
  const TimeRangeSelector: React.FC = () => {
    return (
      <View style={dynamicStyles.section}>
        <Text 
          style={dynamicStyles.sectionLabel}
          accessible={true}
          accessibilityRole="header"
        >
          Time Ranges
        </Text>
        <View 
          style={styles.chipContainer}
          accessible={true}
          accessibilityLabel="Time range selection buttons"
        >
          {TIME_RANGES.map((range: TimeRange) => {
            const isSelected = selectedTimeRanges.includes(range.id);
            
            return (
              <TouchableOpacity
                key={range.id}
                onPress={() => toggleTimeRange(range.id)}
                style={[
                  dynamicStyles.chipButton,
                  isSelected && dynamicStyles.chipButtonActive,
                ]}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={range.label}
                accessibilityState={{ selected: isSelected }}
                accessibilityHint={isSelected ? `Tap to hide ${range.label} graphs` : `Tap to show ${range.label} graphs`}
              >
                <Text
                  style={[
                    dynamicStyles.chipButtonText,
                    isSelected && dynamicStyles.chipButtonTextActive,
                  ]}
                  importantForAccessibility="no-hide-descendants"
                >
                  {range.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  // Sensor Card with Multiple Time Ranges
  interface SensorCardProps {
    sensor: SensorDefinition;
  }

  const SensorCard: React.FC<SensorCardProps> = ({ sensor }) => {
    const value = sensorData[sensor.id];
    const status = getStatus(value, sensor);

    return (
      <View 
        style={dynamicStyles.card}
        accessible={false}
        accessibilityRole="none"
      >
        {/* Sensor Header */}
        <View 
          style={styles.cardHeader}
          accessible={true}
          accessibilityRole="header"
          accessibilityLabel={`${sensor.name} sensor`}
        >
          <Ionicons name={sensor.icon} size={24} color={sensor.color} importantForAccessibility="no-hide-descendants" />
          <Text style={dynamicStyles.cardTitle} importantForAccessibility="no-hide-descendants">{sensor.name}</Text>
        </View>

        {/* Current Reading */}
        <View style={styles.currentValueContainer} accessible={false}>
          <Text 
            style={dynamicStyles.currentValueLabel}
            accessible={true}
            accessibilityRole="text"
          >
            Current reading
          </Text>
          <Text 
            style={dynamicStyles.currentValue}
            accessible={true}
            accessibilityRole="text"
            accessibilityLabel={`${sensor.name} current reading: ${value !== null && value !== undefined ? `${value.toFixed(sensor.decimalPlaces)} ${sensor.unit}` : 'No data available'}`}
          >
            {value !== null && value !== undefined ? `${value.toFixed(sensor.decimalPlaces)}${sensor.unit}` : '--'}
          </Text>
          <View
            style={[styles.statusBadge, { backgroundColor: status.bgColor, borderColor: status.color }]}
            accessible={true}
            accessibilityRole="text"
            accessibilityLabel={`Status: ${status.label}`}
          >
            <Text style={[styles.statusText, { color: status.color }]} importantForAccessibility="no-hide-descendants">
              {status.label}
            </Text>
          </View>
        </View>

        {/* Charts for each selected time range */}
        {selectedTimeRanges.map((timeRangeId: string) => {
          const timeRange = TIME_RANGES.find(tr => tr.id === timeRangeId);
          const historyKey = `${sensor.id}_${timeRangeId}`;
          const history = historyData[historyKey];
          const hasHistoryData = history && history.datasets[0].data.length > 0 && history.datasets[0].data[0] !== 0;

          return (
            <View key={timeRangeId} style={styles.chartContainer} accessible={false}>
              <Text 
                style={dynamicStyles.chartSubtitle}
                accessible={true}
                accessibilityRole="header"
                accessibilityLabel={`${sensor.name} historical data over ${timeRange?.label}`}
              >
                {timeRange?.label}
              </Text>
              {hasHistoryData ? (
                <View
                  accessible={true}
                  accessibilityRole="image"
                  accessibilityLabel={`Line chart showing ${sensor.name} readings over the last ${timeRange?.label}. Chart displays trend data for this time period.`}
                >
                  <LineChart
                    data={history}
                    width={screenWidth - 80}
                    height={180}
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
                        r: '3',
                        strokeWidth: '1.5',
                        stroke: sensor.color,
                      },
                    }}
                    bezier
                    style={styles.chart}
                  />
                </View>
              ) : (
                <Text 
                  style={[styles.noDataText, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}
                  accessible={true}
                  accessibilityRole="text"
                  accessibilityLabel={`No historical data available for ${sensor.name} over ${timeRange?.label}`}
                >
                  No data available
                </Text>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  return (
    <ScrollView 
      style={dynamicStyles.container}
      accessible={true}
      accessibilityLabel="Environmental monitoring dashboard"
    >
      {/* Header */}
      <View style={dynamicStyles.header}>
        <View style={{ flex: 1 }} accessible={false}>
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
            accessibilityRole="text"
          >
            Real-time Monitoring
          </Text>
        </View>

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
            importantForAccessibility="no-hide-descendants"
          />
        </TouchableOpacity>

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
            importantForAccessibility="no-hide-descendants"
          />
        </TouchableOpacity>
      </View>

      {/* Node Selector */}
      <NodeSelector />

      {/* Sensor Selector */}
      {selectedNode && !isLoading && <SensorSelector />}

      {/* Time Range Selector */}
      {selectedNode && !isLoading && <TimeRangeSelector />}

      {/* Loading Indicator */}
      {isLoading && nodes.length === 0 && (
        <View 
          style={styles.loadingContainer}
          accessible={true}
          accessibilityLabel="Loading sensor data"
          accessibilityLiveRegion="polite"
          accessibilityRole="progressbar"
        >
          <ActivityIndicator 
            size="large" 
            color={isDarkMode ? '#60A5FA' : '#2563EB'}
            importantForAccessibility="no-hide-descendants"
          />
          <Text style={[styles.loadingText, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]} importantForAccessibility="no-hide-descendants">
            Loading...
          </Text>
        </View>
      )}

      {/* Error Message */}
      {error && (
        <View 
          style={styles.errorContainer}
          accessible={false}
        >
          <Ionicons 
            name="alert-circle" 
            size={24} 
            color="#DC2626"
            importantForAccessibility="no-hide-descendants"
          />
          <Text 
            style={styles.errorText}
            accessible={true}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
          >
            {error}
          </Text>
          <TouchableOpacity 
            onPress={fetchAllData} 
            style={styles.retryButton}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Retry loading data"
            accessibilityHint="Attempts to reload sensor data from the server"
          >
            <Text style={styles.retryButtonText} importantForAccessibility="no-hide-descendants">Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Sensor Cards */}
      {selectedNode && !isLoading && selectedSensors.map((sensorId: string) => {
        const sensor = SENSOR_DEFINITIONS.find((s: SensorDefinition) => s.id === sensorId);
        return sensor ? <SensorCard key={sensor.id} sensor={sensor} /> : null;
      })}

      {/* Footer */}
      <View style={dynamicStyles.footer} accessible={false}>
        <View style={styles.footerItem} accessible={false}>
          <View 
            style={styles.statusDot}
            importantForAccessibility="no-hide-descendants"
          />
          <Text 
            style={dynamicStyles.footerText}
            accessible={true}
            accessibilityRole="text"
            accessibilityLabel="System active, updates every 30 seconds"
          >
            Updates every 30s
          </Text>
        </View>
        <View style={styles.footerItem} accessible={false}>
          <Ionicons 
            name="time-outline" 
            size={14} 
            color={isDarkMode ? '#9CA3AF' : '#6B7280'}
            importantForAccessibility="no-hide-descendants"
          />
          <Text 
            style={dynamicStyles.footerText}
            accessible={true}
            accessibilityRole="text"
            accessibilityLabel={`Last updated at ${lastUpdated.toLocaleTimeString()}`}
          >
            Last: {lastUpdated.toLocaleTimeString()}
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
  section: {
    padding: 20,
    borderBottomWidth: 1,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  
  // Search Input
  searchContainer: {
    position: 'relative',
  },
  searchIcon: {
    position: 'absolute',
    left: 12,
    top: 12,
    zIndex: 1,
  },
  searchInput: {
    paddingHorizontal: 40,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 15,
  },
  selectedNodeChip: {
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  
  // Node Dropdown
  nodeDropdown: {
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    maxHeight: 200,
    overflow: 'hidden',
  },
  nodeDropdownScroll: {
    maxHeight: 200,
  },
  nodeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  nodeItemText: {
    fontSize: 15,
  },
  nodeItemActive: {},
  
  // Chip Buttons
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  chipButtonActive: {},
  chipButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  chipButtonTextActive: {},
  
  // Cards
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
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  currentValueLabel: {
    fontSize: 12,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  currentValue: {
    fontSize: 32,
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
    fontSize: 12,
    fontWeight: '600',
  },
  chartContainer: {
    marginTop: 16,
  },
  chartSubtitle: {
    fontSize: 13,
    marginBottom: 8,
    fontWeight: '600',
  },
  chart: {
    marginVertical: 8,
    borderRadius: 12,
  },
  noDataText: {
    textAlign: 'center',
    marginVertical: 20,
    fontSize: 13,
  },
  
  // Loading & Error
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
  
  // Footer
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