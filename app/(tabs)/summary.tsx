import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API_BASE } from '../../config';
import {
  ActivityIndicator,
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
import Toast from '../../components/toast';

// ============================================================================
// TYPES
// ============================================================================
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

// CONFIG — all endpoints require authentication (admin panel)
const POLLING_INTERVAL = 30000;

const SUMMARY_METRICS: SummaryMetric[] = [
  { id: 'temperature', name: 'Temperature', unit: '°C',   icon: 'thermometer', color: '#EF4444', apiKey: 'temperature', decimalPlaces: 1, statusThresholds: { min: 18, max: 24, critical: 26 } },
  { id: 'humidity',    name: 'Humidity',    unit: '%',    icon: 'water',        color: '#3B82F6', apiKey: 'humidity',    decimalPlaces: 1, statusThresholds: { min: 30, max: 60, critical: 80 } },
  { id: 'light',       name: 'Light Level', unit: 'lux',  icon: 'sunny',        color: '#FBBF24', apiKey: 'light',       decimalPlaces: 0, statusThresholds: { min: 0,  max: 1000, critical: 2000 } },
  { id: 'noiseLevel',  name: 'Noise Level', unit: 'dB',   icon: 'volume-high',  color: '#F59E0B', apiKey: 'noiseLevel',  decimalPlaces: 1, statusThresholds: { min: 0,  max: 60,   critical: 85 } },
  { id: 'pressure',    name: 'Pressure',    unit: 'kPa',  icon: 'speedometer',  color: '#8B5CF6', apiKey: 'pressure',    decimalPlaces: 2, statusThresholds: { min: 98, max: 102,  critical: 104 } },
  { id: 'battery',     name: 'Battery',     unit: '%',    icon: 'battery-half', color: '#10B981', apiKey: 'battery',     decimalPlaces: 0, statusThresholds: { min: 20, max: 100,  critical: 10 } },
  { id: 'occupancy',   name: 'Occupancy',   unit: '',     icon: 'people',       color: '#6366F1', apiKey: 'peopleInRoom',decimalPlaces: 0 },
];

const DEFAULT_CONFIG: Config = { systemName: 'Environmental Monitor' };

// COMPONENT
export default function SummaryDashboard() {
  const router = useRouter();
  const { isTokenLoaded, authenticatedFetch } = useAuthenticatedAPI();
  const { t } = useTranslation();

  const { width: windowWidth } = useWindowDimensions();
  const isPhone  = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1280;

  const [config, setConfig]             = useState<Config>(DEFAULT_CONFIG);
  const [nodes, setNodes]               = useState<Node[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [sensorData, setSensorData]     = useState<SensorData>({});
  const [lastUpdated, setLastUpdated]   = useState<Date>(new Date());
  const [isDarkMode, setIsDarkMode]     = useState<boolean>(false);
  const [isLoading, setIsLoading]       = useState<boolean>(true);
  const [error, setError]               = useState<string | null>(null);
  const [nodeSearchQuery, setNodeSearchQuery]     = useState<string>('');
  const [isNodeDropdownOpen, setIsNodeDropdownOpen] = useState<boolean>(false);

  // Toast
  const [showToast, setShowToast]       = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType]       = useState<'success' | 'error' | 'info'>('success');

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  useEffect(() => {
    loadConfig();
    loadThemePreference();
    if (isTokenLoaded) fetchNodes();
  }, [isTokenLoaded]);

  useEffect(() => {
    if (selectedNode && isTokenLoaded) {
      AsyncStorage.setItem('selectedNodeId', selectedNode).catch(() => {});
      fetchCurrentData();
      const interval = setInterval(fetchCurrentData, POLLING_INTERVAL);
      return () => clearInterval(interval);
    }
  }, [selectedNode, isTokenLoaded]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const loadConfig = async () => {
    try { const s = await AsyncStorage.getItem('systemConfig'); if (s) setConfig(JSON.parse(s)); }
    catch (e) { console.error('Config load error:', e); }
  };

  const loadThemePreference = async () => {
    try { const s = await AsyncStorage.getItem('isDarkMode'); if (s !== null) setIsDarkMode(s === 'true'); }
    catch (e) { console.error('Theme load error:', e); }
  };

  const toggleDarkMode = async () => {
    const next = !isDarkMode; setIsDarkMode(next);
    try { await AsyncStorage.setItem('isDarkMode', String(next)); } catch {}
  };

  // ── API — all use authenticatedFetch (admin only) ──────────────────────────
  const fetchNodes = async () => {
    try {
      if (!isTokenLoaded) return;
      setIsLoading(true); setError(null);
      const res = await authenticatedFetch(`${API_BASE}/node/list`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: Node[] = Array.isArray(data) ? data : (data.nodes || data.data || []);
      if (list.length === 0) { setError(t('summary.noNodesAvailable')); return; }
      const rooms = list.filter((n) => n.type === 'ROOM_NODE');
      setNodes(rooms);
      if (rooms.length > 0 && !selectedNode) {
        const savedId = await AsyncStorage.getItem('selectedNodeId');
        const match   = savedId ? rooms.find((n) => (n.id || n.nodeId || n.uuid) === savedId) : null;
        const firstId = (match ?? rooms[0]);
        setSelectedNode(firstId.id || firstId.nodeId || firstId.uuid || null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(t('summary.failedFetchNodes', { error: msg }));
    } finally { setIsLoading(false); }
  };

  const fetchCurrentData = async () => {
    if (!selectedNode || !isTokenLoaded) return;
    try {
      setError(null);
      const res = await authenticatedFetch(`${API_BASE}/node/summary?nodeId=${selectedNode}`);
      if (res.status === 204) { setSensorData({}); setLastUpdated(new Date()); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const processed: SensorData = {};
      SUMMARY_METRICS.forEach((m) => {
        let raw = data[m.apiKey];
        if (raw == null) { processed[m.id] = null; return; }
        if (m.apiKey === 'pressure') raw = Number(raw) / 1000;
        processed[m.id] = parseFloat(raw);
      });
      setSensorData(processed);
      setLastUpdated(new Date());
    } catch (e) {
      console.error('fetchCurrentData error:', e);
      setError(t('summary.failedFetchData'));
    }
  };

  const getStatus = (value: number | null | undefined, metric: SummaryMetric) => {
    if (value == null)
      return { label: t('common.status.noData'), color: '#6B7280', bgColor: isDarkMode ? '#374151' : '#F3F4F6' };
    if (!metric.statusThresholds)
      return { label: t('common.status.normal'), color: isDarkMode ? '#9b34d3ff' : '#8f10b9ff', bgColor: isDarkMode ? '#32064eff' : '#e6d1faff' };
    const { min, max, critical } = metric.statusThresholds;
    if (metric.id === 'battery') {
      if (value <= critical) return { label: t('common.status.critical'), color: isDarkMode ? '#f89571ff' : '#dc6626ff', bgColor: isDarkMode ? '#913316ff' : '#feeae2ff' };
      if (value <= min)      return { label: t('common.status.low'),      color: isDarkMode ? '#FBBF24' : '#F59E0B',   bgColor: isDarkMode ? '#78350F' : '#FEF3C7' };
      return { label: t('common.status.normal'), color: isDarkMode ? '#9b34d3ff' : '#8f10b9ff', bgColor: isDarkMode ? '#32064eff' : '#e6d1faff' };
    }
    if (value > critical) return { label: t('common.status.critical'), color: isDarkMode ? '#f89571ff' : '#dc6626ff', bgColor: isDarkMode ? '#913316ff' : '#feeae2ff' };
    if (value > max)      return { label: t('common.status.high'),     color: isDarkMode ? '#FBBF24' : '#F59E0B',   bgColor: isDarkMode ? '#78350F' : '#FEF3C7' };
    if (value < min)      return { label: t('common.status.low'),      color: isDarkMode ? '#60A5FA' : '#3B82F6',   bgColor: isDarkMode ? '#1E3A8A' : '#DBEAFE' };
    return { label: t('common.status.normal'), color: isDarkMode ? '#9b34d3ff' : '#8f10b9ff', bgColor: isDarkMode ? '#32064eff' : '#e6d1faff' };
  };

  const filteredNodes    = nodes.filter((n) =>
    (n.friendlyName || n.name || n.id || n.nodeId || n.uuid || '').toLowerCase().includes(nodeSearchQuery.toLowerCase())
  );
  const selectedNodeData = nodes.find((n) => (n.id || n.nodeId || n.uuid) === selectedNode);
  const selectedNodeName = selectedNodeData?.friendlyName || selectedNodeData?.name || selectedNode || t('common.unknown');

  // ── Dynamic styles ─────────────────────────────────────────────────────────
  const ds = {
    container:          { ...styles.container,        backgroundColor: isDarkMode ? '#111827' : '#F9FAFB' },
    header:             { ...styles.header,           backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderBottomColor: isDarkMode ? '#374151' : '#E5E7EB' },
    headerTitle:        { ...styles.headerTitle,      color: isDarkMode ? '#F9FAFB' : '#111827' },
    headerSubtitle:     { ...styles.headerSubtitle,   color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    controlBar:         { ...styles.controlBar,       backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderBottomColor: isDarkMode ? '#374151' : '#E5E7EB' },
    searchInput:        { ...styles.searchInput,      backgroundColor: isDarkMode ? '#374151' : '#F3F4F6', color: isDarkMode ? '#F9FAFB' : '#111827', borderColor: isDarkMode ? '#4B5563' : '#D1D5DB' },
    dropdownMenu:       { ...styles.dropdownMenu,     backgroundColor: isDarkMode ? '#374151' : '#FFFFFF', borderColor: isDarkMode ? '#4B5563' : '#D1D5DB' },
    dropdownItem:       { ...styles.dropdownItem,     borderBottomColor: isDarkMode ? '#4B5563' : '#E5E7EB' },
    dropdownItemText:   { ...styles.dropdownItemText, color: isDarkMode ? '#D1D5DB' : '#374151' },
    dropdownItemActive: { backgroundColor: isDarkMode ? '#1E3A8A' : '#EFF6FF' },
    selectedNodeChip:   { ...styles.selectedNodeChip, backgroundColor: isDarkMode ? '#3B82F6' : '#2563EB' },
    card:               { ...styles.card,             backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderColor: isDarkMode ? '#374151' : '#E5E7EB' },
    cardTitle:          { ...styles.cardTitle,        color: isDarkMode ? '#F9FAFB' : '#111827' },
    metricValue:        { ...styles.metricValue,      color: isDarkMode ? '#F9FAFB' : '#111827' },
    metricValuePhone:   { ...styles.metricValuePhone, color: isDarkMode ? '#F9FAFB' : '#111827' },
    footer:             { ...styles.footer,           backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderTopColor: isDarkMode ? '#374151' : '#E5E7EB' },
    footerText:         { ...styles.footerText,       color: isDarkMode ? '#9CA3AF' : '#6B7280' },
  };

  // ── Metric card ────────────────────────────────────────────────────────────
  const MetricCard = ({ metric }: { metric: SummaryMetric }) => {
    const value  = sensorData[metric.id] ?? null;
    const status = getStatus(value, metric);
    const name   = t(`summary.metrics.${metric.id}` as any);
    const display =
      value != null
        ? metric.id === 'occupancy'
          ? `${Math.round(value)} ${value === 1 ? t('summary.person') : t('summary.people')}`
          : `${value.toFixed(metric.decimalPlaces)}${metric.unit}`
        : t('common.noData', '--');

    if (isPhone) {
      return (
        <View style={[ds.card, styles.cardPhone]}>
          <View style={styles.cardPhoneLeft}>
            <View style={[styles.iconCircle, { backgroundColor: `${metric.color}22` }]}>
              <Ionicons name={metric.icon} size={22} color={metric.color} />
            </View>
            <Text style={ds.cardTitle} numberOfLines={1}>{name}</Text>
          </View>
          <View style={styles.cardPhoneRight}>
            <Text style={ds.metricValuePhone} numberOfLines={1} adjustsFontSizeToFit>{display}</Text>
            <View style={[styles.statusBadge, { backgroundColor: status.bgColor, borderColor: status.color }]}>
              <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
            </View>
          </View>
        </View>
      );
    }
    return (
      <View style={[ds.card, isTablet ? styles.cardTablet : styles.cardDesktop]}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconCircle, { backgroundColor: `${metric.color}22` }]}>
            <Ionicons name={metric.icon} size={24} color={metric.color} />
          </View>
          <Text style={ds.cardTitle}>{name}</Text>
        </View>
        <View style={styles.metricValueContainer}>
          <Text style={ds.metricValue} numberOfLines={1} adjustsFontSizeToFit>{display}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: status.bgColor, borderColor: status.color }]}>
          <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <Toast visible={showToast} message={toastMessage} type={toastType} onHide={() => setShowToast(false)} />

      <View style={ds.container}>
        {/* Header */}
        <View style={ds.header}>
          <View style={{ flex: 1 }}>
            <Text style={ds.headerTitle}>{config.systemName}</Text>
            <Text style={ds.headerSubtitle}>{t('summary.subtitle')}</Text>
          </View>
          <TouchableOpacity onPress={toggleDarkMode} style={styles.headerButton}>
            <Ionicons name={isDarkMode ? 'sunny' : 'moon'} size={22} color={isDarkMode ? '#FBBF24' : '#6B7280'} />
          </TouchableOpacity>
        </View>

        {/* Node selector */}
        <View style={ds.controlBar}>
          <View style={isPhone ? styles.nodeRowPhone : styles.nodeRowLaptop}>
            <View style={isPhone ? styles.searchContainerPhone : styles.searchContainerLaptop}>
              <Ionicons name="search" size={18} color={isDarkMode ? '#9CA3AF' : '#6B7280'} style={styles.searchIcon} />
              <TextInput
                style={ds.searchInput}
                placeholder={t('summary.searchPlaceholder')}
                placeholderTextColor={isDarkMode ? '#6B7280' : '#9CA3AF'}
                value={nodeSearchQuery}
                onChangeText={setNodeSearchQuery}
                onFocus={() => setIsNodeDropdownOpen(true)}
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>
            {selectedNode && (
              <TouchableOpacity style={ds.selectedNodeChip} onPress={() => setIsNodeDropdownOpen(true)}>
                <Ionicons name="radio-button-on" size={14} color="#FFFFFF" />
                <Text style={styles.selectedNodeChipText} numberOfLines={1}>{selectedNodeName}</Text>
              </TouchableOpacity>
            )}
          </View>

          {isNodeDropdownOpen && filteredNodes.length > 0 && (
            <View style={[ds.dropdownMenu, styles.nodeDropdownMenu]}>
              <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
                {filteredNodes.map((node) => {
                  const id   = node.id || node.nodeId || node.uuid;
                  const name = node.friendlyName || node.name || id;
                  const sel  = selectedNode === id;
                  return (
                    <TouchableOpacity key={id}
                      onPress={() => { setSelectedNode(id || null); setNodeSearchQuery(''); setIsNodeDropdownOpen(false); }}
                      style={[ds.dropdownItem, sel && ds.dropdownItemActive]}>
                      <Text style={ds.dropdownItemText}>{name}</Text>
                      {sel && <Ionicons name="checkmark" size={18} color={isDarkMode ? '#60A5FA' : '#2563EB'} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Content */}
        <View style={isPhone ? styles.contentPhone : styles.contentDesktop}>
          <ScrollView style={isPhone ? styles.scrollArea : styles.scrollArea} contentContainerStyle={styles.scrollContent}>

            {isLoading && nodes.length === 0 && (
              <View style={styles.centered}>
                <ActivityIndicator size="large" color={isDarkMode ? '#60A5FA' : '#2563EB'} />
                <Text style={[styles.loadingText, ds.footerText]}>{t('common.loading')}</Text>
              </View>
            )}

            {error && (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={24} color="#DC2626" />
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity onPress={fetchCurrentData} style={styles.retryButton}>
                  <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
                </TouchableOpacity>
              </View>
            )}

            {selectedNode && !isLoading && (
              <View style={isPhone ? styles.gridPhone : isTablet ? styles.gridTablet : styles.gridDesktop}>
                {SUMMARY_METRICS.map((m) => <MetricCard key={m.id} metric={m} />)}
              </View>
            )}
          </ScrollView>
        </View>

        {/* Footer */}
        <View style={ds.footer}>
          <View style={styles.footerItem}><View style={styles.statusDot} /><Text style={ds.footerText}>{t('common.updatesEvery30s')}</Text></View>
          <View style={styles.footerItem}>
            <Ionicons name="time-outline" size={14} color={isDarkMode ? '#9CA3AF' : '#6B7280'} />
            <Text style={ds.footerText}>{t('common.last')} {lastUpdated.toLocaleTimeString()}</Text>
          </View>
        </View>
      </View>
    </>
  );
}

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  container:    { flex: 1 },
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, paddingTop: Platform.OS === 'ios' ? 60 : 16, borderBottomWidth: 1, zIndex: 999 },
  headerTitle:  { fontSize: 20, fontWeight: 'bold' },
  headerSubtitle:{ fontSize: 13, marginTop: 2 },
  headerButton: { padding: 8, marginLeft: 12 },

  controlBar:            { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, position: 'relative', zIndex: 1000, overflow: 'visible' },
  nodeRowPhone:          { flexDirection: 'column', gap: 8, width: '100%', zIndex: 1002 },
  nodeRowLaptop:         { flexDirection: 'row', alignItems: 'center', gap: 12, zIndex: 1002 },
  searchContainerPhone:  { position: 'relative', width: '100%', zIndex: 1003 },
  searchContainerLaptop: { position: 'relative', flex: 1, maxWidth: 400, zIndex: 1003 },
  searchIcon:            { position: 'absolute', left: 10, top: 10, zIndex: 1 },
  searchInput:           { paddingLeft: 36, paddingRight: 12, paddingVertical: 9, borderRadius: 8, borderWidth: 1, fontSize: 14 },
  selectedNodeChip:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8, maxWidth: 240 },
  selectedNodeChipText:  { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  dropdownMenu:          { borderRadius: 8, borderWidth: 1, maxHeight: 240, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 20, zIndex: 10000 },
  nodeDropdownMenu:      { position: 'absolute', top: 88, left: 16, right: 16, zIndex: 10000 },
  dropdownScroll:        { maxHeight: 240 },
  dropdownItem:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  dropdownItemText:      { fontSize: 14 },

  contentPhone:   { flex: 1 },
  contentDesktop: { flex: 1 },
  scrollArea:     { flex: 1 },
  scrollContent:  { paddingBottom: 20 },

  gridPhone:   { padding: 12, gap: 12 },
  gridTablet:  { padding: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  gridDesktop: { padding: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 20 },

  card:             { borderRadius: 16, borderWidth: 1, padding: 20, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3, alignItems: 'center' },
  cardPhone:        { width: '100%', flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
  cardPhoneLeft:    { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: 12 },
  cardPhoneRight:   { alignItems: 'flex-end', gap: 6, flexShrink: 0 },
  cardTablet:       { width: '45%', minWidth: 160 },
  cardDesktop:      { width: '30%', minWidth: 180 },
  cardHeader:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, width: '100%' },
  iconCircle:       { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  cardTitle:        { fontSize: 14, fontWeight: '700', flex: 1 },
  metricValueContainer: { alignItems: 'center', marginBottom: 12, width: '100%' },
  metricValue:      { fontSize: 32, fontWeight: 'bold', textAlign: 'center' },
  metricValuePhone: { fontSize: 20, fontWeight: 'bold', textAlign: 'right' },
  statusBadge:      { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, borderWidth: 1 },
  statusText:       { fontSize: 12, fontWeight: '600' },

  footer:     { padding: 16, borderTopWidth: 1 },
  footerItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 6 },
  statusDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  footerText: { fontSize: 12 },

  centered:        { padding: 40, alignItems: 'center', gap: 12 },
  loadingText:     { marginTop: 12, fontSize: 14 },
  errorContainer:  { margin: 20, padding: 20, backgroundColor: '#FEE2E2', borderRadius: 12, borderWidth: 1, borderColor: '#DC2626', alignItems: 'center' },
  errorText:       { color: '#DC2626', fontSize: 14, marginTop: 8, textAlign: 'center' },
  retryButton:     { marginTop: 12, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#DC2626', borderRadius: 8 },
  retryButtonText: { color: '#FFFFFF', fontWeight: '600' },
});