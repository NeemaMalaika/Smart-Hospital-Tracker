import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { useAuthenticatedAPI } from '../../hooks/useAuthenticatedAPI';

// ============================================================================
// TYPE DEFINITIONS 
// ============================================================================
interface APIConfig {
  BASE_URL: string;
  ENDPOINTS: { NODES: string; NODE_SUMMARY: string };
  POLLING_INTERVAL: number;
}
interface SummaryMetric {
  id: string;
  name: string;
  unit: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  apiKey: string;
  decimalPlaces: number;
  statusThresholds?: { min: number; max: number; critical: number };
}
interface Node {
  id?: string; nodeId?: string; uuid?: string;
  friendlyName?: string; name?: string; type?: string;
}
interface SensorData { [key: string]: number | null }
interface Config { systemName: string }

// ============================================================================
// API CONFIG 
// ============================================================================
const API_CONFIG: APIConfig = {
  BASE_URL: 'https://backend.smartenvironment.tech/api/v1',
  ENDPOINTS: { NODES: '/node/list', NODE_SUMMARY: '/node/summary' },
  POLLING_INTERVAL: 30000,
};

// ============================================================================
// SUMMARY METRIC DEFINITIONS  
// ============================================================================
const SUMMARY_METRICS: SummaryMetric[] = [
  { id: 'temperature', name: 'Temperature', unit: '°C', icon: 'thermometer', color: '#EF4444', apiKey: 'temperature', decimalPlaces: 1, statusThresholds: { min: 18, max: 24, critical: 26 } },
  { id: 'humidity', name: 'Humidity', unit: '%', icon: 'water', color: '#3B82F6', apiKey: 'humidity', decimalPlaces: 1, statusThresholds: { min: 30, max: 60, critical: 80 } },
  { id: 'light', name: 'Light Level', unit: 'lux', icon: 'sunny', color: '#FBBF24', apiKey: 'light', decimalPlaces: 0, statusThresholds: { min: 0, max: 1000, critical: 2000 } },
  { id: 'noiseLevel', name: 'Noise Level', unit: 'dB', icon: 'volume-high', color: '#F59E0B', apiKey: 'noiseLevel', decimalPlaces: 1, statusThresholds: { min: 0, max: 60, critical: 85 } },
  { id: 'pressure', name: 'Pressure', unit: 'kPa', icon: 'speedometer', color: '#8B5CF6', apiKey: 'pressure', decimalPlaces: 2, statusThresholds: { min: 98, max: 102, critical: 104 } },
  { id: 'battery', name: 'Device Battery', unit: '%', icon: 'battery-half', color: '#10B981', apiKey: 'battery', decimalPlaces: 0, statusThresholds: { min: 20, max: 100, critical: 10 } },
  { id: 'occupancy', name: 'People in Room', unit: '', icon: 'people', color: '#6366F1', apiKey: 'peopleInRoom', decimalPlaces: 0 },
];

const DEFAULT_CONFIG: Config = { systemName: 'Environmental Monitor' };

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function SummaryDashboard() {
  const router = useRouter();
  const { isTokenLoaded, authenticatedFetch } = useAuthenticatedAPI();
  const { t } = useTranslation(); // ← NEW

  const { width: windowWidth } = useWindowDimensions();
  const isPhone = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1280;

  // ============================================================================
  // STATE  
  // ============================================================================
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [sensorData, setSensorData] = useState<SensorData>({});
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [nodeSearchQuery, setNodeSearchQuery] = useState<string>('');
  const [isNodeDropdownOpen, setIsNodeDropdownOpen] = useState<boolean>(false);

  // ============================================================================
  // LIFECYCLE  
  // ============================================================================
  useEffect(() => {
    loadConfig();
    loadThemePreference();
    if (isTokenLoaded) fetchNodes();
  }, [isTokenLoaded]);

  useEffect(() => {
    if (selectedNode && isTokenLoaded) {
      AsyncStorage.setItem('selectedNodeId', selectedNode).catch(() => {});
      fetchCurrentData();
      const interval = setInterval(fetchCurrentData, API_CONFIG.POLLING_INTERVAL);
      return () => clearInterval(interval);
    }
  }, [selectedNode, isTokenLoaded]);

  // ============================================================================
  // CONFIG & THEME  
  // ============================================================================
  const loadConfig = async (): Promise<void> => {
    try {
      const saved = await AsyncStorage.getItem('systemConfig');
      if (saved) setConfig(JSON.parse(saved));
    } catch (e) { console.error('Config load error:', e); }
  };
  const loadThemePreference = async (): Promise<void> => {
    try {
      const saved = await AsyncStorage.getItem('isDarkMode');
      if (saved !== null) setIsDarkMode(saved === 'true');
    } catch (e) { console.error('Theme load error:', e); }
  };
  const toggleDarkMode = async (): Promise<void> => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    try { await AsyncStorage.setItem('isDarkMode', String(newMode)); }
    catch (e) { console.error('Theme save error:', e); }
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
        setError(t('summary.noNodesAvailable'));
        return;
      }

      const roomNodes = nodesList.filter((n: Node) => n.type === 'ROOM_NODE');
      setNodes(roomNodes);

      if (roomNodes.length > 0 && !selectedNode) {
        const savedNodeId = await AsyncStorage.getItem('selectedNodeId');
        const matchingNode = savedNodeId
          ? roomNodes.find((n) => (n.id || n.nodeId || n.uuid) === savedNodeId)
          : null;
        const firstNodeId =
          (matchingNode
            ? matchingNode.id || matchingNode.nodeId || matchingNode.uuid
            : roomNodes[0].id || roomNodes[0].nodeId || roomNodes[0].uuid) || null;
        setSelectedNode(firstNodeId);
      }
    } catch (e) {
      console.error('Error fetching nodes:', e);
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(t('summary.failedFetchNodes', { error: msg }));
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCurrentData = async (): Promise<void> => {
    if (!selectedNode || !isTokenLoaded) return;
    try {
      setError(null);
      const url = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.NODE_SUMMARY}?nodeId=${selectedNode}`;
      const response = await authenticatedFetch(url);

      if (response.status === 204) { setSensorData({}); setLastUpdated(new Date()); return; }
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();
      console.log('📦 Raw API Response:', JSON.stringify(data, null, 2));

      const processed: SensorData = {};
      SUMMARY_METRICS.forEach((metric) => {
        let raw = data[metric.apiKey];
        console.log(`🔍 Processing ${metric.name} (apiKey: ${metric.apiKey}):`, raw);
        if (raw === undefined || raw === null) { processed[metric.id] = null; return; }
        processed[metric.id] = parseFloat(raw);
      });

      console.log('✅ Processed Sensor Data:', JSON.stringify(processed, null, 2));
      setSensorData(processed);
      setLastUpdated(new Date());
    } catch (e) {
      console.error('Error fetching sensor data:', e);
      setError(t('summary.failedFetchData'));
    }
  };

  // ============================================================================
  // HELPERS  
  // ============================================================================
  const getStatus = (value: number | null | undefined, metric: SummaryMetric) => {
    if (value === null || value === undefined)
      return { label: t('common.status.noData'), color: '#6B7280', bgColor: isDarkMode ? '#374151' : '#F3F4F6' };
    if (!metric.statusThresholds)
      return { label: t('common.status.normal'), color: isDarkMode ? '#9b34d3ff' : '#8f10b9ff', bgColor: isDarkMode ? '#32064eff' : '#e6d1faff' };

    const { min, max, critical } = metric.statusThresholds;

    if (metric.id === 'battery') {
      if (value <= critical) return { label: t('common.status.critical'), color: isDarkMode ? '#f89571ff' : '#dc6626ff', bgColor: isDarkMode ? '#913316ff' : '#feeae2ff' };
      if (value <= min) return { label: t('common.status.low'), color: isDarkMode ? '#FBBF24' : '#F59E0B', bgColor: isDarkMode ? '#78350F' : '#FEF3C7' };
      return { label: t('common.status.normal'), color: isDarkMode ? '#9b34d3ff' : '#8f10b9ff', bgColor: isDarkMode ? '#32064eff' : '#e6d1faff' };
    }
    if (value > critical) return { label: t('common.status.critical'), color: isDarkMode ? '#f89571ff' : '#dc6626ff', bgColor: isDarkMode ? '#913316ff' : '#feeae2ff' };
    if (value > max) return { label: t('common.status.high'), color: isDarkMode ? '#FBBF24' : '#F59E0B', bgColor: isDarkMode ? '#78350F' : '#FEF3C7' };
    if (value < min) return { label: t('common.status.low'), color: isDarkMode ? '#60A5FA' : '#3B82F6', bgColor: isDarkMode ? '#1E3A8A' : '#DBEAFE' };
    return { label: t('common.status.normal'), color: isDarkMode ? '#9b34d3ff' : '#8f10b9ff', bgColor: isDarkMode ? '#32064eff' : '#e6d1faff' };
  };

  const filteredNodes = nodes.filter((node: Node) => {
    const nodeName = (node.friendlyName || node.name || node.id || node.nodeId || node.uuid || '').toLowerCase();
    return nodeName.includes(nodeSearchQuery.toLowerCase());
  });

  const selectedNodeData = nodes.find((n: Node) => (n.id || n.nodeId || n.uuid) === selectedNode);
  const selectedNodeName = selectedNodeData?.friendlyName || selectedNodeData?.name || selectedNode || t('common.unknown');

  // ============================================================================
  // DYNAMIC STYLES 
  // ============================================================================
  const dynamicStyles = {
    container: { ...styles.container, backgroundColor: isDarkMode ? '#111827' : '#F9FAFB' },
    header: { ...styles.header, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderBottomColor: isDarkMode ? '#374151' : '#E5E7EB' },
    headerTitle: { ...styles.headerTitle, color: isDarkMode ? '#F9FAFB' : '#111827' },
    headerSubtitle: { ...styles.headerSubtitle, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    controlBar: { ...styles.controlBar, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderBottomColor: isDarkMode ? '#374151' : '#E5E7EB' },
    searchInput: { ...styles.searchInput, backgroundColor: isDarkMode ? '#374151' : '#F3F4F6', color: isDarkMode ? '#F9FAFB' : '#111827', borderColor: isDarkMode ? '#4B5563' : '#D1D5DB' },
    dropdownMenu: { ...styles.dropdownMenu, backgroundColor: isDarkMode ? '#374151' : '#FFFFFF', borderColor: isDarkMode ? '#4B5563' : '#D1D5DB' },
    dropdownItem: { ...styles.dropdownItem, borderBottomColor: isDarkMode ? '#4B5563' : '#E5E7EB' },
    dropdownItemText: { ...styles.dropdownItemText, color: isDarkMode ? '#D1D5DB' : '#374151' },
    dropdownItemActive: { ...styles.dropdownItemActive, backgroundColor: isDarkMode ? '#1E3A8A' : '#EFF6FF' },
    selectedNodeChip: { ...styles.selectedNodeChip, backgroundColor: isDarkMode ? '#3B82F6' : '#2563EB' },
    card: { ...styles.card, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderColor: isDarkMode ? '#374151' : '#E5E7EB' },
    cardTitle: { ...styles.cardTitle, color: isDarkMode ? '#F9FAFB' : '#111827' },
    metricValue: { ...styles.metricValue, color: isDarkMode ? '#F9FAFB' : '#111827' },
    metricValuePhone: { ...styles.metricValuePhone, color: isDarkMode ? '#F9FAFB' : '#111827' },
    footer: { ...styles.footer, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderTopColor: isDarkMode ? '#374151' : '#E5E7EB' },
    footerText: { ...styles.footerText, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
  };

  // ============================================================================
  // METRIC CARD COMPONENT  
  // ============================================================================
  interface MetricCardProps { metric: SummaryMetric }

  const MetricCard: React.FC<MetricCardProps> = ({ metric }) => {
    const raw = sensorData[metric.id];
    const value = raw !== undefined ? raw : null;
    const status = getStatus(value, metric);

    // Translate the metric name at render time
    const translatedName = t(`summary.metrics.${metric.id}` as any);

    const displayValue =
      value !== null && value !== undefined
        ? metric.id === 'occupancy'
          ? `${Math.round(value)} ${value === 1 ? t('summary.person') : t('summary.people')}`
          : `${value.toFixed(metric.decimalPlaces)}${metric.unit}`
        : t('common.noData', '--');

    const accessibilityText =
      value !== null && value !== undefined
        ? `${translatedName}: ${displayValue}. Status: ${status.label}`
        : `${translatedName}: ${t('common.noDataAvailable')}`;

    // ── PHONE: horizontal row layout ──────────────────────────────────────────
    if (isPhone) {
      return (
        <View
          style={[dynamicStyles.card, styles.cardPhone]}
          accessible={true}
          accessibilityLabel={accessibilityText}
          accessibilityRole="text"
        >
          <View
            style={styles.cardPhoneLeft}
            accessible={true}
            accessibilityRole="header"
            accessibilityLabel={`${translatedName} sensor`}
          >
            <View style={[styles.iconCircle, { backgroundColor: `${metric.color}22` }]} accessible={false}>
              <Ionicons name={metric.icon} size={22} color={metric.color} importantForAccessibility="no-hide-descendants" accessible={false} />
            </View>
            <Text style={dynamicStyles.cardTitle} importantForAccessibility="no-hide-descendants" numberOfLines={1}>
              {translatedName}
            </Text>
          </View>

          <View
            style={styles.cardPhoneRight}
            accessible={true}
            accessibilityLabel={`Current reading: ${displayValue}. Status: ${status.label}`}
          >
            <Text style={dynamicStyles.metricValuePhone} importantForAccessibility="no-hide-descendants" numberOfLines={1} adjustsFontSizeToFit>
              {displayValue}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: status.bgColor, borderColor: status.color }]} accessible={false}>
              <Text style={[styles.statusText, { color: status.color }]} importantForAccessibility="no-hide-descendants">
                {status.label}
              </Text>
            </View>
          </View>
        </View>
      );
    }

    // ── TABLET / DESKTOP: centred column layout ────────────────────────────────
    return (
      <View
        style={[dynamicStyles.card, isTablet ? styles.cardTablet : styles.cardDesktop]}
        accessible={true}
        accessibilityLabel={accessibilityText}
        accessibilityRole="text"
      >
        <View style={styles.cardHeader} accessible={true} accessibilityRole="header" accessibilityLabel={`${translatedName} sensor`}>
          <View style={[styles.iconCircle, { backgroundColor: `${metric.color}22` }]} accessible={false}>
            <Ionicons name={metric.icon} size={24} color={metric.color} importantForAccessibility="no-hide-descendants" accessible={false} />
          </View>
          <Text style={dynamicStyles.cardTitle} importantForAccessibility="no-hide-descendants">
            {translatedName}
          </Text>
        </View>

        <View style={styles.metricValueContainer} accessible={true} accessibilityLabel={`Current reading: ${displayValue}`}>
          <Text style={dynamicStyles.metricValue} importantForAccessibility="no-hide-descendants" numberOfLines={1} adjustsFontSizeToFit>
            {displayValue}
          </Text>
        </View>

        <View style={[styles.statusBadge, { backgroundColor: status.bgColor, borderColor: status.color }]} accessible={true} accessibilityLabel={`Status: ${status.label}`}>
          <Text style={[styles.statusText, { color: status.color }]} importantForAccessibility="no-hide-descendants">
            {status.label}
          </Text>
        </View>
      </View>
    );
  };

  // ============================================================================
  // MAIN RENDER
  // ============================================================================
  return (
    <View style={dynamicStyles.container} accessible={false} accessibilityLabel="Summary dashboard">
      {/* Header */}
      <View style={dynamicStyles.header} accessible={true} accessibilityRole="header" accessibilityLabel={`${config.systemName}, summary dashboard`}>
        <View style={{ flex: 1 }} accessible={false}>
          <Text style={dynamicStyles.headerTitle} accessibilityRole="header" importantForAccessibility="no-hide-descendants">
            {config.systemName}
          </Text>
          <Text style={dynamicStyles.headerSubtitle} importantForAccessibility="no-hide-descendants">
            {t('summary.subtitle')}
          </Text>
        </View>

        <TouchableOpacity
          onPress={toggleDarkMode}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <Ionicons name={isDarkMode ? 'sunny' : 'moon'} size={22} color={isDarkMode ? '#FBBF24' : '#6B7280'} importantForAccessibility="no-hide-descendants" />
        </TouchableOpacity>
      </View>

      {/* Node Control Bar */}
      <View style={dynamicStyles.controlBar} accessible={true} accessibilityRole="toolbar" accessibilityLabel="Node selection controls">
        <View style={isPhone ? styles.nodeRowPhone : styles.nodeRowLaptop}>
          {/* Search */}
          <View style={isPhone ? styles.searchContainerPhone : styles.searchContainerLaptop}>
            <Ionicons name="search" size={18} color={isDarkMode ? '#9CA3AF' : '#6B7280'} style={styles.searchIcon} importantForAccessibility="no-hide-descendants" accessible={false} />
            <TextInput
              style={dynamicStyles.searchInput}
              placeholder={t('summary.searchPlaceholder')}
              placeholderTextColor={isDarkMode ? '#6B7280' : '#9CA3AF'}
              value={nodeSearchQuery}
              onChangeText={setNodeSearchQuery}
              onFocus={() => setIsNodeDropdownOpen(true)}
              accessibilityLabel="Search for monitoring nodes"
              accessibilityHint="Type to filter available nodes"
              accessibilityRole="search"
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>

          {/* Selected Node Chip */}
          {selectedNode && (
            <TouchableOpacity
              style={dynamicStyles.selectedNodeChip}
              onPress={() => setIsNodeDropdownOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`Selected node: ${selectedNodeName}`}
              accessibilityHint={t('summary.searchNodeHint')}
            >
              <Ionicons name="radio-button-on" size={14} color="#FFFFFF" importantForAccessibility="no-hide-descendants" />
              <Text style={styles.selectedNodeChipText} numberOfLines={1} importantForAccessibility="no-hide-descendants">
                {selectedNodeName}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Node Dropdown */}
        {isNodeDropdownOpen && filteredNodes.length > 0 && (
          <View style={[dynamicStyles.dropdownMenu, styles.nodeDropdownMenu]} accessibilityLabel={`Node selection menu. Showing ${filteredNodes.length} nodes`} accessibilityRole="menu" accessible={true}>
            <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
              {filteredNodes.map((node: Node) => {
                const nodeId = node.id || node.nodeId || node.uuid;
                const nodeName = node.friendlyName || node.name || nodeId;
                const isSelected = selectedNode === nodeId;
                return (
                  <TouchableOpacity
                    key={nodeId}
                    onPress={() => { setSelectedNode(nodeId || null); setNodeSearchQuery(''); setIsNodeDropdownOpen(false); }}
                    style={[dynamicStyles.dropdownItem, isSelected && dynamicStyles.dropdownItemActive]}
                    accessibilityRole="menuitem"
                    accessibilityLabel={`${nodeName} monitoring node`}
                    accessibilityState={{ selected: isSelected }}
                    accessibilityHint={`Double tap to monitor ${nodeName}`}
                  >
                    <Text style={dynamicStyles.dropdownItemText} importantForAccessibility="no-hide-descendants">{nodeName}</Text>
                    {isSelected && <Ionicons name="checkmark" size={18} color={isDarkMode ? '#60A5FA' : '#2563EB'} importantForAccessibility="no-hide-descendants" accessible={false} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Content */}
      <ScrollView contentContainerStyle={styles.scrollContent} accessibilityLabel="Summary sensor readings" accessible={false}>
        {/* Loading */}
        {isLoading && nodes.length === 0 && (
          <View style={styles.loadingContainer} accessibilityLabel={t('summary.loadingLabel', 'Loading sensor data, please wait')} accessibilityRole="progressbar" accessibilityLiveRegion="polite" accessible={true}>
            <ActivityIndicator size="large" color={isDarkMode ? '#60A5FA' : '#2563EB'} />
            <Text style={[styles.loadingText, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]} importantForAccessibility="no-hide-descendants">
              {t('common.loading')}
            </Text>
          </View>
        )}

        {/* Error */}
        {error && (
          <View style={styles.errorContainer} accessible={true} accessibilityRole="alert" accessibilityLiveRegion="assertive" accessibilityLabel={`Error: ${error}`}>
            <Ionicons name="alert-circle" size={24} color="#DC2626" accessible={false} />
            <Text style={styles.errorText} importantForAccessibility="no-hide-descendants">{error}</Text>
            <TouchableOpacity onPress={fetchCurrentData} style={styles.retryButton} accessibilityRole="button" accessibilityLabel="Retry loading data" accessibilityHint="Double tap to attempt reloading sensor data">
              <Text style={styles.retryButtonText} importantForAccessibility="no-hide-descendants">{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Metrics Grid */}
        {selectedNode && !isLoading && (
          <View style={isPhone ? styles.gridPhone : isTablet ? styles.gridTablet : styles.gridDesktop} accessible={false} accessibilityLabel={`Summary showing ${SUMMARY_METRICS.length} sensor metrics`}>
            {SUMMARY_METRICS.map((metric) => <MetricCard key={metric.id} metric={metric} />)}
          </View>
        )}

        {/* Footer */}
        <View style={dynamicStyles.footer} accessible={true} accessibilityLabel={`System status: Updates every 30 seconds. Last update at ${lastUpdated.toLocaleTimeString()}`}>
          <View style={styles.footerItem} accessible={false}>
            <View style={styles.statusDot} accessible={false} />
            <Text style={dynamicStyles.footerText} importantForAccessibility="no-hide-descendants">
              {t('common.updatesEvery30s')}
            </Text>
          </View>
          <View style={styles.footerItem} accessible={false}>
            <Ionicons name="time-outline" size={14} color={isDarkMode ? '#9CA3AF' : '#6B7280'} accessible={false} />
            <Text style={dynamicStyles.footerText} importantForAccessibility="no-hide-descendants">
              {t('common.last')} {lastUpdated.toLocaleTimeString()}
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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, paddingTop: Platform.OS === 'ios' ? 60 : 16, borderBottomWidth: 1, zIndex: 999 },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  headerSubtitle: { fontSize: 13, marginTop: 2 },
  headerButton: { padding: 8, marginLeft: 12 },
  controlBar: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, position: 'relative', zIndex: 1000, overflow: 'visible' },
  nodeRowPhone: { flexDirection: 'column', gap: 8, width: '100%', zIndex: 1002 },
  nodeRowLaptop: { flexDirection: 'row', alignItems: 'center', gap: 12, zIndex: 1002 },
  searchContainerPhone: { position: 'relative', width: '100%', zIndex: 1003 },
  searchContainerLaptop: { position: 'relative', flex: 1, maxWidth: 400, zIndex: 1003 },
  searchIcon: { position: 'absolute', left: 10, top: 10, zIndex: 1 },
  searchInput: { paddingLeft: 36, paddingRight: 12, paddingVertical: 9, borderRadius: 8, borderWidth: 1, fontSize: 14 },
  selectedNodeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8, maxWidth: 240 },
  selectedNodeChipText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  dropdownMenu: { borderRadius: 8, borderWidth: 1, maxHeight: 240, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 20, zIndex: 10000 },
  nodeDropdownMenu: { position: 'absolute', top: 88, left: 16, right: 16, zIndex: 10000 },
  dropdownScroll: { maxHeight: 240 },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  dropdownItemText: { fontSize: 14 },
  dropdownItemActive: {},
  scrollContent: { paddingBottom: 20 },
  gridPhone: { padding: 12, gap: 12 },
  gridTablet: { padding: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  gridDesktop: { padding: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
  card: { borderRadius: 16, borderWidth: 1, padding: 20, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3, alignItems: 'center' },
  cardPhone: { width: '100%', flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
  cardPhoneLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: 12 },
  cardPhoneRight: { alignItems: 'flex-end', gap: 6, flexShrink: 0 },
  metricValuePhone: { fontSize: 20, fontWeight: 'bold', textAlign: 'right' },
  cardTablet: { width: '45%', minWidth: 160 },
  cardDesktop: { width: '30%', minWidth: 180 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, width: '100%' },
  iconCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '700', flex: 1 },
  metricValueContainer: { alignItems: 'center', marginBottom: 12, width: '100%' },
  metricValue: { fontSize: 32, fontWeight: 'bold', textAlign: 'center' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, borderWidth: 1 },
  statusText: { fontSize: 12, fontWeight: '600' },
  loadingContainer: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, fontSize: 14 },
  errorContainer: { margin: 20, padding: 20, backgroundColor: '#FEE2E2', borderRadius: 12, borderWidth: 1, borderColor: '#DC2626', alignItems: 'center' },
  errorText: { color: '#DC2626', fontSize: 14, marginTop: 8, textAlign: 'center' },
  retryButton: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#DC2626', borderRadius: 8 },
  retryButtonText: { color: '#FFFFFF', fontWeight: '600' },
  footer: { padding: 16, borderTopWidth: 1, marginTop: 20 },
  footerItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  footerText: { fontSize: 12 },
});