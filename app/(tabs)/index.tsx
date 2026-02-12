import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { useAuthenticatedAPI } from '../../hooks/useAuthenticatedAPI';

// TYPE DEFINITIONS

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
  apiKey: string | string[];
  thresholds: SensorThresholds;
  decimalPlaces: number;
  aggregate?: 'average' | 'sum';
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
  { id: '5m', label: 'Current', minutes: 5 },
  { id: '6h', label: '6 hours', minutes: 360 },
  { id: '24h', label: '24 hours', minutes: 1440 },
  { id: '7d', label: '7 days', minutes: 10080 },
  { id: '30d', label: '30 days', minutes: 43200 },
];

// ============================================================================
// SENSOR DEFINITIONS
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
    thresholds: { min: 98, max: 102, critical: 104 },
    decimalPlaces: 2,
  },
  {
    id: 'light',
    name: 'Light Level',
    unit: 'lux',
    icon: 'sunny',
    color: '#FBBF24',
    apiKey: 'light',
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
  const { isTokenLoaded, authenticatedFetch } = useAuthenticatedAPI();

  // Responsive sizing - Updated breakpoints for better laptop support
  const { width: windowWidth } = useWindowDimensions();
  const isPhone = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1280;
  const isDesktop = windowWidth >= 1280;

  // Responsive chart sizing
  const getChartWidth = () => {
    if (isPhone) return windowWidth - 64;
    if (isTablet) return (windowWidth - 80) / 2 - 20;
    return (windowWidth - 120) / 3 - 20;
  };

  const chartWidth = getChartWidth();
  const chartHeight = isPhone ? 180 : 200;

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

  const [selectedSensors, setSelectedSensors] = useState<string[]>([SENSOR_DEFINITIONS[0].id]);
  const [selectedTimeRanges, setSelectedTimeRanges] = useState<string[]>(['24h']);

  const [nodeSearchQuery, setNodeSearchQuery] = useState<string>('');
  const [isNodeDropdownOpen, setIsNodeDropdownOpen] = useState<boolean>(false);
  const [isSensorDropdownOpen, setIsSensorDropdownOpen] = useState<boolean>(false);
  const [isTimeRangeDropdownOpen, setIsTimeRangeDropdownOpen] = useState<boolean>(false);

  // ============================================================================
  // THRESHOLD EDITING STATE  (NEW)
  // ============================================================================
  const [customThresholds, setCustomThresholds] = useState<{
    [sensorId: string]: SensorThresholds;
  }>({});
  const [editingSensor, setEditingSensor] = useState<string | null>(null);
  const [thresholdInputs, setThresholdInputs] = useState<{
    min: string;
    max: string;
    critical: string;
  }>({ min: '', max: '', critical: '' });

  // ============================================================================
  // LIFECYCLE HOOKS
  // ============================================================================
  useEffect(() => {
    loadConfig();
    loadThemePreference();
    loadCustomThresholds();
    if (isTokenLoaded) {
      fetchNodes();
    }
  }, [isTokenLoaded]);

  useEffect(() => {
    if (selectedNode && isTokenLoaded) {
      fetchAllData();
      const interval = setInterval(fetchAllData, API_CONFIG.POLLING_INTERVAL);
      return () => clearInterval(interval);
    }
  }, [selectedNode, isTokenLoaded]);

  useEffect(() => {
    if (selectedNode && isTokenLoaded) {
      fetchSensorHistory();
    }
  }, [selectedTimeRanges, selectedNode, isTokenLoaded]);

  // ============================================================================
  // AUTH & CONFIG
  // ============================================================================
  const loadConfig = async (): Promise<void> => {
    try {
      const savedConfig = await AsyncStorage.getItem('systemConfig');
      if (savedConfig) setConfig(JSON.parse(savedConfig));
    } catch (e) {
      console.error('Config load error:', e);
    }
  };

  const loadThemePreference = async (): Promise<void> => {
    try {
      const savedTheme = await AsyncStorage.getItem('isDarkMode');
      if (savedTheme !== null) setIsDarkMode(savedTheme === 'true');
    } catch (e) {
      console.error('Theme load error:', e);
    }
  };

  const toggleDarkMode = async (): Promise<void> => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    try {
      await AsyncStorage.setItem('isDarkMode', String(newMode));
    } catch (e) {
      console.error('Theme save error:', e);
    }
  };

  // ============================================================================
  // THRESHOLD HELPERS  (NEW)
  // ============================================================================
  const loadCustomThresholds = async (): Promise<void> => {
    try {
      const saved = await AsyncStorage.getItem('customSensorThresholds');
      if (saved) setCustomThresholds(JSON.parse(saved));
    } catch (e) {
      console.error('Threshold load error:', e);
    }
  };

  const getEffectiveThresholds = (sensor: SensorDefinition): SensorThresholds => {
    return customThresholds[sensor.id] ?? sensor.thresholds;
  };

  const openThresholdEditor = (sensor: SensorDefinition): void => {
    const effective = getEffectiveThresholds(sensor);
    setThresholdInputs({
      min: String(effective.min),
      max: String(effective.max),
      critical: String(effective.critical),
    });
    setEditingSensor(sensor.id);
    // Close other dropdowns
    setIsNodeDropdownOpen(false);
    setIsSensorDropdownOpen(false);
    setIsTimeRangeDropdownOpen(false);
  };

  const saveThresholds = async (sensorId: string): Promise<void> => {
    const min = parseFloat(thresholdInputs.min);
    const max = parseFloat(thresholdInputs.max);
    const critical = parseFloat(thresholdInputs.critical);

    if (isNaN(min) || isNaN(max) || isNaN(critical)) {
      Alert.alert('Invalid Values', 'Please enter valid numbers for all threshold fields.');
      return;
    }

    const updated = { ...customThresholds, [sensorId]: { min, max, critical } };
    setCustomThresholds(updated);
    try {
      await AsyncStorage.setItem('customSensorThresholds', JSON.stringify(updated));
    } catch (e) {
      console.error('Threshold save error:', e);
    }
    setEditingSensor(null);
  };

  const resetThresholds = async (sensor: SensorDefinition): Promise<void> => {
    const updated = { ...customThresholds };
    delete updated[sensor.id];
    setCustomThresholds(updated);
    try {
      await AsyncStorage.setItem('customSensorThresholds', JSON.stringify(updated));
    } catch (e) {
      console.error('Threshold reset error:', e);
    }
    setEditingSensor(null);
  };

  // ============================================================================
  // API
  // ============================================================================
  const fetchNodes = async (): Promise<void> => {
    try {
      if (!isTokenLoaded) return;

      setIsLoading(true);
      setError(null);

      const response = await authenticatedFetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.NODES}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

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
    } catch (e) {
      console.error('Error fetching nodes:', e);
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(`Failed to fetch nodes: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAllData = async (): Promise<void> => {
    if (!selectedNode || !isTokenLoaded) return;

    try {
      setIsLoading(true);
      setError(null);

      await Promise.all([fetchCurrentSensorData(), fetchSensorHistory()]);
      setLastUpdated(new Date());
    } catch (e) {
      console.error('Error fetching data:', e);
      setError('Failed to fetch data from server');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCurrentSensorData = async (): Promise<void> => {
    if (!selectedNode) return;

    const url = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.CURRENT_SENSORS}?nodeId=${selectedNode}`;
    const response = await authenticatedFetch(url);

    if (response.status === 204) {
      setSensorData({});
      return;
    }
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();
    const processedData: SensorData = {};

    SENSOR_DEFINITIONS.forEach((sensor: SensorDefinition) => {
      if (Array.isArray(sensor.apiKey)) {
        const values = sensor.apiKey
          .map(key => data[key])
          .filter(v => v !== undefined && v !== null)
          .map(v => parseFloat(v));

        if (values.length > 0) {
          const aggregatedValue =
            sensor.aggregate === 'sum'
              ? values.reduce((a, b) => a + b, 0)
              : values.reduce((a, b) => a + b, 0) / values.length;

          processedData[sensor.id] = aggregatedValue;
        }
      } else {
        let raw = data[sensor.apiKey];
        if (raw === undefined || raw === null) return;

        if (sensor.apiKey === 'pressure') {
          raw = Number(raw) / 1000;
        }

        processedData[sensor.id] = parseFloat(raw);
      }
    });

    setSensorData(processedData);
  };

  const fetchSensorHistory = async (): Promise<void> => {
    if (!selectedNode) return;

    const allHistoryData: HistoryData = {};

    for (const timeRangeId of selectedTimeRanges) {
      const timeRange = TIME_RANGES.find(tr => tr.id === timeRangeId);
      if (!timeRange) continue;

      const url = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SENSOR_HISTORY}?nodeId=${selectedNode}&minutes=${timeRange.minutes}`;
      const response = await authenticatedFetch(url);

      if (response.status === 204) continue;
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

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

          const targetLabels = isPhone ? 5 : 8;
          const showLabel = index % Math.max(1, Math.floor(historyArray.length / targetLabels)) === 0;
          labels.push(showLabel ? timeLabel : '');

          if (Array.isArray(sensor.apiKey)) {
            const sensorValues = sensor.apiKey
              .map(key => reading[key])
              .filter(v => v !== undefined && v !== null)
              .map(v => parseFloat(v));

            if (sensorValues.length > 0) {
              const aggregatedValue =
                sensor.aggregate === 'sum'
                  ? sensorValues.reduce((a, b) => a + b, 0)
                  : sensorValues.reduce((a, b) => a + b, 0) / sensorValues.length;

              values.push(parseFloat(aggregatedValue.toFixed(sensor.decimalPlaces)));
            } else {
              values.push(null);
            }
          } else {
            let raw = reading[sensor.apiKey];
            if (raw === undefined || raw === null) {
              values.push(null);
              return;
            }

            if (sensor.apiKey === 'pressure') {
              raw = Number(raw) / 1000;
            }

            values.push(parseFloat(Number(raw).toFixed(sensor.decimalPlaces)));
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
  };

  // ============================================================================
  // HELPERS
  // ============================================================================
  const getStatus = (value: number | null | undefined, sensor: SensorDefinition): Status => {
    if (value === null || value === undefined) {
      return { label: 'No Data', color: '#6B7280', bgColor: isDarkMode ? '#374151' : '#F3F4F6' };
    }

    // Use custom thresholds if set, otherwise use defaults
    const thresholds = getEffectiveThresholds(sensor);

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

  const toggleSensor = (sensorId: string): void => {
    setSelectedSensors(prev => {
      if (prev.includes(sensorId)) {
        if (prev.length === 1) return prev;
        return prev.filter(id => id !== sensorId);
      }
      return [...prev, sensorId];
    });
  };

  const toggleTimeRange = (timeRangeId: string): void => {
    setSelectedTimeRanges(prev => {
      if (prev.includes(timeRangeId)) {
        if (prev.length === 1) return prev;
        return prev.filter(id => id !== timeRangeId);
      }
      return [...prev, timeRangeId];
    });
  };

  const filteredNodes = nodes.filter((node: Node) => {
    const nodeName = (node.friendlyName || node.name || node.id || node.nodeId || node.uuid || '').toLowerCase();
    return nodeName.includes(nodeSearchQuery.toLowerCase());
  });

  const selectedNodeData = nodes.find((n: Node) => (n.id || n.nodeId || n.uuid) === selectedNode);
  const selectedNodeName =
    selectedNodeData?.friendlyName || selectedNodeData?.name || selectedNode || 'Unknown Node';

  // ============================================================================
  // DYNAMIC STYLES
  // ============================================================================
  const dynamicStyles = {
    container: { ...styles.container, backgroundColor: isDarkMode ? '#111827' : '#F9FAFB' },
    header: {
      ...styles.header,
      backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF',
      borderBottomColor: isDarkMode ? '#374151' : '#E5E7EB',
    },
    headerTitle: { ...styles.headerTitle, color: isDarkMode ? '#F9FAFB' : '#111827' },
    headerSubtitle: { ...styles.headerSubtitle, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    controlBar: {
      ...styles.controlBar,
      backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF',
      borderBottomColor: isDarkMode ? '#374151' : '#E5E7EB',
    },
    searchInput: {
      ...styles.searchInput,
      backgroundColor: isDarkMode ? '#374151' : '#F3F4F6',
      color: isDarkMode ? '#F9FAFB' : '#111827',
      borderColor: isDarkMode ? '#4B5563' : '#D1D5DB',
    },
    dropdownButton: {
      ...styles.dropdownButton,
      backgroundColor: isDarkMode ? '#374151' : '#F3F4F6',
      borderColor: isDarkMode ? '#4B5563' : '#D1D5DB',
    },
    dropdownButtonText: { ...styles.dropdownButtonText, color: isDarkMode ? '#F9FAFB' : '#111827' },
    dropdownMenu: {
      ...styles.dropdownMenu,
      backgroundColor: isDarkMode ? '#374151' : '#FFFFFF',
      borderColor: isDarkMode ? '#4B5563' : '#D1D5DB',
    },
    dropdownItem: { ...styles.dropdownItem, borderBottomColor: isDarkMode ? '#4B5563' : '#E5E7EB' },
    dropdownItemText: { ...styles.dropdownItemText, color: isDarkMode ? '#D1D5DB' : '#374151' },
    dropdownItemActive: { ...styles.dropdownItemActive, backgroundColor: isDarkMode ? '#1E3A8A' : '#EFF6FF' },
    selectedNodeChip: {
      ...styles.selectedNodeChip,
      backgroundColor: isDarkMode ? '#3B82F6' : '#2563EB',
    },
    card: {
      ...styles.card,
      backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF',
      borderColor: isDarkMode ? '#374151' : '#E5E7EB',
    },
    cardTitle: { ...styles.cardTitle, color: isDarkMode ? '#F9FAFB' : '#111827' },
    currentValueLabel: { ...styles.currentValueLabel, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    currentValue: { ...styles.currentValue, color: isDarkMode ? '#F9FAFB' : '#111827' },
    chartSubtitle: { ...styles.chartSubtitle, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    footer: {
      ...styles.footer,
      backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF',
      borderTopColor: isDarkMode ? '#374151' : '#E5E7EB',
    },
    footerText: { ...styles.footerText, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    // Threshold editor styles
    thresholdPanel: {
      ...styles.thresholdPanel,
      backgroundColor: isDarkMode ? '#111827' : '#F3F4F6',
      borderColor: isDarkMode ? '#374151' : '#D1D5DB',
    },
    thresholdLabel: { ...styles.thresholdLabel, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    thresholdInput: {
      ...styles.thresholdInput,
      backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF',
      color: isDarkMode ? '#F9FAFB' : '#111827',
      borderColor: isDarkMode ? '#4B5563' : '#D1D5DB',
    },
  };

  // ============================================================================
  // UI COMPONENTS
  // ============================================================================
  const ControlBar: React.FC = () => {
    return (
      <View 
        style={dynamicStyles.controlBar}
        accessible={true}
        accessibilityRole="toolbar"
        accessibilityLabel="Monitoring controls"
      >
        {/* PHONE: Vertical layout */}
        {isPhone && (
          <View style={styles.controlBarColumnPhone}>
            {/* Search and Node Selection */}
            <View style={styles.nodeRowPhone}>
              <View style={styles.searchContainer}>
                <Ionicons
                  name="search"
                  size={18}
                  color={isDarkMode ? '#9CA3AF' : '#6B7280'}
                  style={styles.searchIcon}
                  importantForAccessibility="no-hide-descendants"
                  accessible={false}
                />
                <TextInput
                  style={[dynamicStyles.searchInput, styles.searchInputPhone]}
                  placeholder="Search nodes..."
                  placeholderTextColor={isDarkMode ? '#6B7280' : '#9CA3AF'}
                  value={nodeSearchQuery}
                  onChangeText={setNodeSearchQuery}
                  onFocus={() => {
                    setIsNodeDropdownOpen(true);
                    setIsSensorDropdownOpen(false);
                    setIsTimeRangeDropdownOpen(false);
                  }}
                  accessibilityLabel="Search for monitoring nodes"
                  accessibilityHint="Type to filter available nodes. Currently showing all nodes."
                  accessibilityRole="search"
                  returnKeyType="search"
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </View>

              {selectedNode && (
                <TouchableOpacity
                  style={[dynamicStyles.selectedNodeChip, styles.selectedNodeChipPhone]}
                  onPress={() => {
                    setIsNodeDropdownOpen(true);
                    setIsSensorDropdownOpen(false);
                    setIsTimeRangeDropdownOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Selected node: ${selectedNodeName}`}
                  accessibilityHint="Tap to search for a different node"
                >
                  <Ionicons
                    name="radio-button-on"
                    size={14}
                    color="#FFFFFF"
                    importantForAccessibility="no-hide-descendants"
                  />
                  <Text style={styles.selectedNodeChipText} numberOfLines={1} importantForAccessibility="no-hide-descendants">
                    {selectedNodeName}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Filters Row */}
            <View style={styles.filtersRowPhone}>
              {/* Sensors Dropdown */}
              <View style={styles.dropdownContainer}>
                <TouchableOpacity
                  style={[dynamicStyles.dropdownButton, styles.dropdownButtonPhone]}
                  onPress={() => {
                    setIsSensorDropdownOpen(!isSensorDropdownOpen);
                    setIsNodeDropdownOpen(false);
                    setIsTimeRangeDropdownOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Sensor filter: ${selectedSensors.length} selected`}
                  accessibilityHint="Tap to select which sensors to display"
                  accessibilityState={{ expanded: isSensorDropdownOpen }}
                >
                  <Ionicons
                    name="options"
                    size={16}
                    color={isDarkMode ? '#9CA3AF' : '#6B7280'}
                    importantForAccessibility="no-hide-descendants"
                  />
                  <Text style={dynamicStyles.dropdownButtonText} numberOfLines={1} importantForAccessibility="no-hide-descendants">
                    Sensors ({selectedSensors.length})
                  </Text>
                  <Ionicons
                    name={isSensorDropdownOpen ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={isDarkMode ? '#9CA3AF' : '#6B7280'}
                    importantForAccessibility="no-hide-descendants"
                  />
                </TouchableOpacity>
              </View>

              {/* Time Range Dropdown */}
              <View style={styles.dropdownContainer}>
                <TouchableOpacity
                  style={[dynamicStyles.dropdownButton, styles.dropdownButtonPhone]}
                  onPress={() => {
                    setIsTimeRangeDropdownOpen(!isTimeRangeDropdownOpen);
                    setIsNodeDropdownOpen(false);
                    setIsSensorDropdownOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Time range filter: ${selectedTimeRanges.length} selected`}
                  accessibilityHint="Tap to select which time ranges to display"
                  accessibilityState={{ expanded: isTimeRangeDropdownOpen }}
                >
                  <Ionicons
                    name="time"
                    size={16}
                    color={isDarkMode ? '#9CA3AF' : '#6B7280'}
                    importantForAccessibility="no-hide-descendants"
                  />
                  <Text style={dynamicStyles.dropdownButtonText} numberOfLines={1} importantForAccessibility="no-hide-descendants">
                    Time ({selectedTimeRanges.length})
                  </Text>
                  <Ionicons
                    name={isTimeRangeDropdownOpen ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={isDarkMode ? '#9CA3AF' : '#6B7280'}
                    importantForAccessibility="no-hide-descendants"
                  />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* TABLET/DESKTOP: Search on top, filters below */}
        {!isPhone && (
          <View style={styles.controlBarColumnLaptop}>
            {/* Row 1: Search and Node Selection */}
            <View style={styles.nodeRowLaptop}>
              <View style={styles.searchContainerLaptop}>
                <Ionicons
                  name="search"
                  size={18}
                  color={isDarkMode ? '#9CA3AF' : '#6B7280'}
                  style={styles.searchIcon}
                  importantForAccessibility="no-hide-descendants"
                  accessible={false}
                />
                <TextInput
                  style={dynamicStyles.searchInput}
                  placeholder="Search nodes..."
                  placeholderTextColor={isDarkMode ? '#6B7280' : '#9CA3AF'}
                  value={nodeSearchQuery}
                  onChangeText={setNodeSearchQuery}
                  onFocus={() => {
                    setIsNodeDropdownOpen(true);
                    setIsSensorDropdownOpen(false);
                    setIsTimeRangeDropdownOpen(false);
                  }}
                  accessibilityLabel="Search for monitoring nodes"
                  accessibilityHint="Type to filter available nodes. Currently showing all nodes."
                  accessibilityRole="search"
                  returnKeyType="search"
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </View>

              {selectedNode && (
                <TouchableOpacity
                  style={dynamicStyles.selectedNodeChip}
                  onPress={() => {
                    setIsNodeDropdownOpen(true);
                    setIsSensorDropdownOpen(false);
                    setIsTimeRangeDropdownOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Selected node: ${selectedNodeName}`}
                  accessibilityHint="Tap to search for a different node"
                >
                  <Ionicons
                    name="radio-button-on"
                    size={14}
                    color="#FFFFFF"
                    importantForAccessibility="no-hide-descendants"
                  />
                  <Text style={styles.selectedNodeChipText} numberOfLines={1} importantForAccessibility="no-hide-descendants">
                    {selectedNodeName}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Row 2: Filters */}
            <View style={styles.filtersRowLaptop}>
              {/* Sensors Dropdown */}
              <View style={styles.dropdownContainerLaptop}>
                <TouchableOpacity
                  style={dynamicStyles.dropdownButton}
                  onPress={() => {
                    setIsSensorDropdownOpen(!isSensorDropdownOpen);
                    setIsNodeDropdownOpen(false);
                    setIsTimeRangeDropdownOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Sensor filter: ${selectedSensors.length} selected`}
                  accessibilityHint="Tap to select which sensors to display"
                  accessibilityState={{ expanded: isSensorDropdownOpen }}
                >
                  <Ionicons
                    name="options"
                    size={16}
                    color={isDarkMode ? '#9CA3AF' : '#6B7280'}
                    importantForAccessibility="no-hide-descendants"
                  />
                  <Text style={dynamicStyles.dropdownButtonText} numberOfLines={1} importantForAccessibility="no-hide-descendants">
                    Sensors ({selectedSensors.length})
                  </Text>
                  <Ionicons
                    name={isSensorDropdownOpen ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={isDarkMode ? '#9CA3AF' : '#6B7280'}
                    importantForAccessibility="no-hide-descendants"
                  />
                </TouchableOpacity>
              </View>

              {/* Time Range Dropdown */}
              <View style={styles.dropdownContainerLaptop}>
                <TouchableOpacity
                  style={dynamicStyles.dropdownButton}
                  onPress={() => {
                    setIsTimeRangeDropdownOpen(!isTimeRangeDropdownOpen);
                    setIsNodeDropdownOpen(false);
                    setIsSensorDropdownOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Time range filter: ${selectedTimeRanges.length} selected`}
                  accessibilityHint="Tap to select which time ranges to display"
                  accessibilityState={{ expanded: isTimeRangeDropdownOpen }}
                >
                  <Ionicons
                    name="time"
                    size={16}
                    color={isDarkMode ? '#9CA3AF' : '#6B7280'}
                    importantForAccessibility="no-hide-descendants"
                  />
                  <Text style={dynamicStyles.dropdownButtonText} numberOfLines={1} importantForAccessibility="no-hide-descendants">
                    Time ({selectedTimeRanges.length})
                  </Text>
                  <Ionicons
                    name={isTimeRangeDropdownOpen ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={isDarkMode ? '#9CA3AF' : '#6B7280'}
                    importantForAccessibility="no-hide-descendants"
                  />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Dropdown Menus - Rendered with proper Za-index */}
        {/* Node Dropdown */}
        {isNodeDropdownOpen && filteredNodes.length > 0 && (
          <View 
            style={[dynamicStyles.dropdownMenu, styles.nodeDropdownMenu]} 
            accessibilityLabel={`Node selection menu. Showing ${filteredNodes.length} of ${nodes.length} nodes`}
            accessibilityRole="menu"
            accessible={true}
          >
            <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
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
                      setIsNodeDropdownOpen(false);
                    }}
                    style={[dynamicStyles.dropdownItem, isSelected && dynamicStyles.dropdownItemActive]}
                    accessibilityRole="menuitem"
                    accessibilityLabel={`${nodeName} monitoring node`}
                    accessibilityState={{ selected: isSelected }}
                    accessibilityHint={`Double tap to monitor ${nodeName}`}
                  >
                    <Text style={dynamicStyles.dropdownItemText} importantForAccessibility="no-hide-descendants">
                      {nodeName}
                    </Text>
                    {isSelected && (
                      <Ionicons
                        name="checkmark"
                        size={18}
                        color={isDarkMode ? '#60A5FA' : '#2563EB'}
                        importantForAccessibility="no-hide-descendants"
                        accessible={false}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Sensor Dropdown lists */}
        {isSensorDropdownOpen && (
          <View 
            style={[
              dynamicStyles.dropdownMenu, 
              isPhone ? styles.sensorDropdownMenuPhone : styles.sensorDropdownMenuLaptop
            ]} 
            accessibilityLabel={`Sensor selection menu. ${selectedSensors.length} of ${SENSOR_DEFINITIONS.length} sensors selected`}
            accessibilityRole="menu"
            accessible={true}
          >
            <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
              {SENSOR_DEFINITIONS.map((sensor: SensorDefinition) => {
                const isSelected = selectedSensors.includes(sensor.id);
                return (
                  <TouchableOpacity
                    key={sensor.id}
                    onPress={() => {
                      toggleSensor(sensor.id);
                    }}
                    style={[dynamicStyles.dropdownItem, isSelected && dynamicStyles.dropdownItemActive]}
                    accessibilityRole="menuitem"
                    accessibilityLabel={`${sensor.name} sensor`}
                    accessibilityState={{ selected: isSelected, checked: isSelected }}
                    accessibilityHint={isSelected ? `Double tap to deselect ${sensor.name}` : `Double tap to select ${sensor.name}`}
                  >
                    <View style={styles.dropdownItemContent}>
                      <Ionicons
                        name={sensor.icon}
                        size={18}
                        color={sensor.color}
                        importantForAccessibility="no-hide-descendants"
                      />
                      <Text style={dynamicStyles.dropdownItemText} importantForAccessibility="no-hide-descendants">
                        {sensor.name}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons
                        name="checkmark"
                        size={18}
                        color={isDarkMode ? '#60A5FA' : '#2563EB'}
                        importantForAccessibility="no-hide-descendants"
                        accessible={false}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Time Range Dropdown list */}
        {isTimeRangeDropdownOpen && (
          <View 
            style={[
              dynamicStyles.dropdownMenu, 
              isPhone ? styles.timeDropdownMenuPhone : styles.timeDropdownMenuLaptop
            ]} 
            accessibilityLabel={`Time range selection menu. ${selectedTimeRanges.length} of ${TIME_RANGES.length} time ranges selected`}
            accessibilityRole="menu"
            accessible={true}
          >
            <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
              {TIME_RANGES.map((range: TimeRange) => {
                const isSelected = selectedTimeRanges.includes(range.id);
                return (
                  <TouchableOpacity
                    key={range.id}
                    onPress={() => {
                      toggleTimeRange(range.id);
                    }}
                    style={[dynamicStyles.dropdownItem, isSelected && dynamicStyles.dropdownItemActive]}
                    accessibilityRole="menuitem"
                    accessibilityLabel={`${range.label} time range`}
                    accessibilityState={{ selected: isSelected, checked: isSelected }}
                    accessibilityHint={isSelected ? `Double tap to deselect ${range.label}` : `Double tap to select ${range.label}`}
                  >
                    <Text style={dynamicStyles.dropdownItemText} importantForAccessibility="no-hide-descendants">
                      {range.label}
                    </Text>
                    {isSelected && (
                      <Ionicons
                        name="checkmark"
                        size={18}
                        color={isDarkMode ? '#60A5FA' : '#2563EB'}
                        importantForAccessibility="no-hide-descendants"
                        accessible={false}
                      />
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

  interface SensorCardProps {
    sensor: SensorDefinition;
  }

  const SensorCard: React.FC<SensorCardProps> = ({ sensor }) => {
    const value = sensorData[sensor.id];
    const status = getStatus(value, sensor);
    const isEditing = editingSensor === sensor.id;
    const effectiveThresholds = getEffectiveThresholds(sensor);
    const hasCustomThresholds = !!customThresholds[sensor.id];

    const currentReadingText = value !== null && value !== undefined 
      ? `${value.toFixed(sensor.decimalPlaces)} ${sensor.unit}` 
      : 'No data available';

    return (
      <View
        style={[dynamicStyles.card, isPhone && styles.cardPhone]}
        accessible={true}
        accessibilityLabel={`${sensor.name} sensor. Current reading: ${currentReadingText}. Status: ${status.label}`}
      >
        <View 
          style={styles.cardHeader} 
          accessible={true}
          accessibilityRole="header" 
          accessibilityLabel={`${sensor.name} sensor data`}
        >
          <Ionicons
            name={sensor.icon}
            size={20}
            color={sensor.color}
            importantForAccessibility="no-hide-descendants"
            accessible={false}
          />
          <Text style={dynamicStyles.cardTitle} importantForAccessibility="no-hide-descendants">
            {sensor.name}
          </Text>

          {/* ── THRESHOLD EDIT BUTTON (NEW) ── */}
          <TouchableOpacity
            onPress={() =>
              isEditing ? setEditingSensor(null) : openThresholdEditor(sensor)
            }
            style={styles.thresholdEditButton}
            accessibilityRole="button"
            accessibilityLabel={
              isEditing
                ? `Close threshold editor for ${sensor.name}`
                : `Edit alert thresholds for ${sensor.name}`
            }
            accessibilityHint={
              isEditing
                ? 'Double tap to close the threshold editor'
                : 'Double tap to open threshold editor and change min, max and critical values'
            }
            accessibilityState={{ expanded: isEditing }}
          >
            <Ionicons
              name={isEditing ? 'close-circle-outline' : 'options-outline'}
              size={18}
              color={
                hasCustomThresholds
                  ? '#3B82F6'
                  : isDarkMode
                  ? '#9CA3AF'
                  : '#6B7280'
              }
              importantForAccessibility="no-hide-descendants"
              accessible={false}
            />
          </TouchableOpacity>
        </View>

        {/* ── THRESHOLD EDITOR PANEL (NEW) ── */}
        {isEditing && (
          <View
            style={dynamicStyles.thresholdPanel}
            accessible={true}
            accessibilityLabel={`Threshold editor for ${sensor.name}. Current values: minimum ${effectiveThresholds.min}, maximum ${effectiveThresholds.max}, critical ${effectiveThresholds.critical}`}
          >
            <Text
              style={[styles.thresholdPanelTitle, { color: isDarkMode ? '#F9FAFB' : '#111827' }]}
              accessibilityRole="header"
              importantForAccessibility="no-hide-descendants"
            >
              Alert Thresholds ({sensor.unit})
            </Text>

            <View style={styles.thresholdRow}>
              {/* Min */}
              <View style={styles.thresholdField}>
                <Text
                  style={dynamicStyles.thresholdLabel}
                  importantForAccessibility="no-hide-descendants"
                >
                  Min
                </Text>
                <TextInput
                  style={dynamicStyles.thresholdInput}
                  value={thresholdInputs.min}
                  onChangeText={(v) =>
                    setThresholdInputs((prev) => ({ ...prev, min: v }))
                  }
                  keyboardType="numeric"
                  accessibilityLabel={`Minimum threshold for ${sensor.name}, currently ${thresholdInputs.min} ${sensor.unit}`}
                  accessibilityHint="Enter a number to set the minimum normal value"
                  returnKeyType="next"
                />
              </View>

              {/* Max */}
              <View style={styles.thresholdField}>
                <Text
                  style={dynamicStyles.thresholdLabel}
                  importantForAccessibility="no-hide-descendants"
                >
                  Max
                </Text>
                <TextInput
                  style={dynamicStyles.thresholdInput}
                  value={thresholdInputs.max}
                  onChangeText={(v) =>
                    setThresholdInputs((prev) => ({ ...prev, max: v }))
                  }
                  keyboardType="numeric"
                  accessibilityLabel={`Maximum threshold for ${sensor.name}, currently ${thresholdInputs.max} ${sensor.unit}`}
                  accessibilityHint="Enter a number to set the maximum normal value"
                  returnKeyType="next"
                />
              </View>

              {/* Critical */}
              <View style={styles.thresholdField}>
                <Text
                  style={dynamicStyles.thresholdLabel}
                  importantForAccessibility="no-hide-descendants"
                >
                  Critical
                </Text>
                <TextInput
                  style={dynamicStyles.thresholdInput}
                  value={thresholdInputs.critical}
                  onChangeText={(v) =>
                    setThresholdInputs((prev) => ({ ...prev, critical: v }))
                  }
                  keyboardType="numeric"
                  accessibilityLabel={`Critical threshold for ${sensor.name}, currently ${thresholdInputs.critical} ${sensor.unit}`}
                  accessibilityHint="Enter a number to set the critical alert value"
                  returnKeyType="done"
                  onSubmitEditing={() => saveThresholds(sensor.id)}
                />
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.thresholdActions}>
              <TouchableOpacity
                style={styles.thresholdSaveButton}
                onPress={() => saveThresholds(sensor.id)}
                accessibilityRole="button"
                accessibilityLabel={`Save threshold changes for ${sensor.name}`}
                accessibilityHint="Double tap to apply and save the new threshold values"
              >
                <Text
                  style={styles.thresholdSaveText}
                  importantForAccessibility="no-hide-descendants"
                >
                  Save
                </Text>
              </TouchableOpacity>

              {hasCustomThresholds && (
                <TouchableOpacity
                  style={styles.thresholdResetButton}
                  onPress={() => resetThresholds(sensor)}
                  accessibilityRole="button"
                  accessibilityLabel={`Reset thresholds for ${sensor.name} to defaults`}
                  accessibilityHint="Double tap to restore the original default threshold values"
                >
                  <Text
                    style={styles.thresholdResetText}
                    importantForAccessibility="no-hide-descendants"
                  >
                    Reset to Default
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        <View 
          style={styles.currentValueContainer}
          accessible={true}
          accessibilityLabel={`Current ${sensor.name} reading: ${currentReadingText}. Status: ${status.label}`}
        >
          <Text style={dynamicStyles.currentValueLabel} importantForAccessibility="no-hide-descendants">
            Current
          </Text>
          <Text
            style={dynamicStyles.currentValue}
            importantForAccessibility="no-hide-descendants"
          >
            {value !== null && value !== undefined ? `${value.toFixed(sensor.decimalPlaces)}${sensor.unit}` : '--'}
          </Text>

          <View 
            style={[styles.statusBadge, { backgroundColor: status.bgColor, borderColor: status.color }]}
            importantForAccessibility="no-hide-descendants"
          >
            <Text style={[styles.statusText, { color: status.color }]} importantForAccessibility="no-hide-descendants">
              {status.label}
            </Text>
          </View>
        </View>

        {selectedTimeRanges.map((timeRangeId: string) => {
          const timeRange = TIME_RANGES.find(tr => tr.id === timeRangeId);
          const historyKey = `${sensor.id}_${timeRangeId}`;
          const history = historyData[historyKey];
          const hasHistoryData = history && history.datasets[0].data.length > 0 && history.datasets[0].data[0] !== 0;

          // Calculate data summary for accessibility
          let dataDescription = 'No data available';
          if (hasHistoryData) {
            const values = history.datasets[0].data;
            const min = Math.min(...values);
            const max = Math.max(...values);
            const avg = values.reduce((a, b) => a + b, 0) / values.length;
            dataDescription = `Chart showing ${sensor.name} over ${timeRange?.label}. Minimum: ${min.toFixed(sensor.decimalPlaces)} ${sensor.unit}. Maximum: ${max.toFixed(sensor.decimalPlaces)} ${sensor.unit}. Average: ${avg.toFixed(sensor.decimalPlaces)} ${sensor.unit}. ${values.length} data points.`;
          }

          return (
            <View 
              key={timeRangeId} 
              style={styles.chartContainer}
              accessible={true}
              accessibilityLabel={dataDescription}
              accessibilityRole="image"
            >
              <Text 
                style={dynamicStyles.chartSubtitle} 
                accessibilityRole="header"
                importantForAccessibility="no-hide-descendants"
              >
                {timeRange?.label}
              </Text>

              {hasHistoryData ? (
                <LineChart
                  data={history}
                  width={chartWidth}
                  height={chartHeight}
                  withInnerLines={false}
                  segments={4}
                  chartConfig={{
                    backgroundColor: isDarkMode ? '#1F2937' : '#ffffff',
                    backgroundGradientFrom: isDarkMode ? '#1F2937' : '#ffffff',
                    backgroundGradientTo: isDarkMode ? '#1F2937' : '#ffffff',
                    decimalPlaces: sensor.decimalPlaces,
                    color: (opacity = 1) =>
                      `${sensor.color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`,
                    labelColor: (opacity = 1) =>
                      isDarkMode
                        ? `rgba(156, 163, 175, ${opacity})`
                        : `rgba(107, 114, 128, ${opacity})`,
                    propsForDots: {
                      r: '2.5',
                      strokeWidth: '1.5',
                      stroke: sensor.color,
                    },
                  }}
                  bezier
                  style={styles.chart}
                />
              ) : (
                <Text 
                  style={[styles.noDataText, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}
                  importantForAccessibility="no-hide-descendants"
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
    <View 
      style={dynamicStyles.container}
      accessible={false}
      accessibilityLabel="Environmental monitoring application"
    >
      {/* Header */}
      <View 
        style={dynamicStyles.header}
        accessible={true}
        accessibilityRole="header"
        accessibilityLabel={`${config.systemName}, real-time monitoring dashboard`}
      >
        <View style={{ flex: 1 }} accessible={false}>
          <Text style={dynamicStyles.headerTitle} accessibilityRole="header" importantForAccessibility="no-hide-descendants">
            {config.systemName}
          </Text>
          <Text style={dynamicStyles.headerSubtitle} importantForAccessibility="no-hide-descendants">
            Real-time Monitoring
          </Text>
        </View>

        <TouchableOpacity
          onPress={toggleDarkMode}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <Ionicons
            name={isDarkMode ? 'sunny' : 'moon'}
            size={22}
            color={isDarkMode ? '#FBBF24' : '#6B7280'}
            importantForAccessibility="no-hide-descendants"
          />
        </TouchableOpacity>

      </View>

      {/* Control Bar */}
      <ControlBar />

      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        accessibilityLabel="Environmental monitoring dashboard"
        accessible={false}
      >
        {isLoading && nodes.length === 0 && (
          <View 
            style={styles.loadingContainer} 
            accessibilityLabel="Loading sensor data, please wait" 
            accessibilityRole="progressbar"
            accessibilityLiveRegion="polite"
            accessible={true}
          >
            <ActivityIndicator size="large" color={isDarkMode ? '#60A5FA' : '#2563EB'} />
            <Text style={[styles.loadingText, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]} importantForAccessibility="no-hide-descendants">
              Loading...
            </Text>
          </View>
        )}

        {error && (
          <View 
            style={styles.errorContainer}
            accessible={true}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
            accessibilityLabel={`Error: ${error}`}
          >
            <Ionicons name="alert-circle" size={24} color="#DC2626" accessible={false} />
            <Text style={styles.errorText} importantForAccessibility="no-hide-descendants">
              {error}
            </Text>
            <TouchableOpacity 
              onPress={fetchAllData} 
              style={styles.retryButton} 
              accessibilityRole="button"
              accessibilityLabel="Retry loading data"
              accessibilityHint="Double tap to attempt reloading sensor data"
            >
              <Text style={styles.retryButtonText} importantForAccessibility="no-hide-descendants">Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {selectedNode && !isLoading && (
          <View 
            style={isPhone ? styles.cardsContainerPhone : isTablet ? styles.cardsContainerTablet : styles.cardsContainerDesktop}
            accessible={false}
            accessibilityLabel={`Displaying ${selectedSensors.length} sensor cards`}
          >
            {selectedSensors.map((sensorId: string) => {
              const sensor = SENSOR_DEFINITIONS.find((s: SensorDefinition) => s.id === sensorId);
              return sensor ? <SensorCard key={sensor.id} sensor={sensor} /> : null;
            })}
          </View>
        )}

        <View 
          style={dynamicStyles.footer}
          accessible={true}
          accessibilityLabel={`System status: Updates every 30 seconds. Last update at ${lastUpdated.toLocaleTimeString()}`}
        >
          <View style={styles.footerItem} accessible={false}>
            <View style={styles.statusDot} accessible={false} />
            <Text style={dynamicStyles.footerText} importantForAccessibility="no-hide-descendants">
              Updates every 30s
            </Text>
          </View>
          <View style={styles.footerItem} accessible={false}>
            <Ionicons 
              name="time-outline" 
              size={14} 
              color={isDarkMode ? '#9CA3AF' : '#6B7280'} 
              accessible={false}
            />
            <Text style={dynamicStyles.footerText} importantForAccessibility="no-hide-descendants">
              Last: {lastUpdated.toLocaleTimeString()}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  container: { flex: 1 },
  
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 16,
    borderBottomWidth: 1,
    zIndex: 999,
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  headerSubtitle: { fontSize: 13, marginTop: 2 },
  headerButton: { padding: 8, marginLeft: 12 },

  // Control Bar
  controlBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    position: 'relative',
    zIndex: 1000,
    overflow: 'visible',
  },

  // PHONE LAYOUT
  controlBarColumnPhone: {
    flexDirection: 'column',
    gap: 12,
    zIndex: 1001,
  },
  nodeRowPhone: {
    flexDirection: 'column',
    gap: 8,
    width: '100%',
    zIndex: 1002,
  },
  filtersRowPhone: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    zIndex: 1002,
  },

  // LAPTOP/TABLET LAYOUT - Search on top, filters below
  controlBarColumnLaptop: {
    flexDirection: 'column',
    gap: 12,
    zIndex: 1001,
  },
  nodeRowLaptop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    zIndex: 1002,
  },
  filtersRowLaptop: {
    flexDirection: 'row',
    gap: 12,
    zIndex: 1002,
  },

  // Search
  searchContainer: {
    position: 'relative',
    flex: 1,
    minWidth: 180,
    zIndex: 1003,
  },
  searchContainerLaptop: {
    position: 'relative',
    flex: 1,
    maxWidth: 400,
    zIndex: 1003,
  },
  searchIcon: {
    position: 'absolute',
    left: 10,
    top: 10,
    zIndex: 1,
  },
  searchInput: {
    paddingLeft: 36,
    paddingRight: 12,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 14,
  },
  searchInputPhone: {
    width: '100%',
  },

  // Selected Node Chip
  selectedNodeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    maxWidth: 200,
  },
  selectedNodeChipPhone: {
    maxWidth: '100%',
  },
  selectedNodeChipText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },

  // Dropdown
  dropdownContainer: {
    position: 'relative',
    flex: 1,
    minWidth: 130,
    zIndex: 1001,
  },
  dropdownContainerLaptop: {
    position: 'relative',
    minWidth: 200,
    maxWidth: 250,
    zIndex: 1001,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
  },
  dropdownButtonPhone: {
    width: '100%',
  },
  dropdownButtonText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  dropdownMenu: {
    borderRadius: 8,
    borderWidth: 1,
    maxHeight: 240,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 20,
    zIndex: 10000,
  },
  
  // Dropdown positioning
  nodeDropdownMenu: {
    position: 'absolute',
    top: 88,
    left: 16,
    right: 16,
    zIndex: 10000,
  },
  sensorDropdownMenuPhone: {
    position: 'absolute',
    top: 150,
    left: 16,
    right: '50%',
    marginRight: 4,
    zIndex: 10000,
  },
  timeDropdownMenuPhone: {
    position: 'absolute',
    top: 150,
    left: '50%',
    right: 16,
    marginLeft: 4,
    zIndex: 10000,
  },
  sensorDropdownMenuLaptop: {
    position: 'absolute',
    top: 102,
    left: 16,
    width: 200,
    zIndex: 10000,
  },
  timeDropdownMenuLaptop: {
    position: 'absolute',
    top: 102,
    left: 228,
    width: 200,
    zIndex: 10000,
  },
  
  dropdownScroll: {
    maxHeight: 240,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  dropdownItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dropdownItemText: {
    fontSize: 14,
  },
  dropdownItemActive: {},

  // Scroll Content
  scrollContent: {
    paddingBottom: 20,
  },

  // Cards Container
  cardsContainerPhone: {
    padding: 12,
    gap: 12,
    zIndex: 1,
  },
  cardsContainerTablet: {
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    zIndex: 1,
  },
  cardsContainerDesktop: {
    padding: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
    zIndex: 1,
  },

  // Card
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  cardPhone: {
    width: '100%',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },

  // Threshold Edit Button to change is user wants to
  thresholdEditButton: {
    padding: 4,
    marginLeft: 4,
  },

  // Threshold Panel 
  thresholdPanel: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  thresholdPanelTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  thresholdRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  thresholdField: {
    flex: 1,
  },
  thresholdLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  thresholdInput: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    textAlign: 'center',
  },
  thresholdActions: {
    flexDirection: 'row',
    gap: 8,
  },
  thresholdSaveButton: {
    flex: 1,
    backgroundColor: '#2563EB',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  thresholdSaveText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  thresholdResetButton: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#6B7280',
  },
  thresholdResetText: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '500',
  },

  // Current Value
  currentValueContainer: {
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  currentValueLabel: {
    fontSize: 11,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  currentValue: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Chart
  chartContainer: {
    marginTop: 12,
  },
  chartSubtitle: {
    fontSize: 12,
    marginBottom: 8,
    fontWeight: '600',
  },
  chart: {
    marginVertical: 4,
    borderRadius: 8,
  },
  noDataText: {
    textAlign: 'center',
    marginVertical: 20,
    fontSize: 13,
  },

  // Loading
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },

  // Error
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
    marginTop: 20,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  footerText: {
    fontSize: 12,
  },
});