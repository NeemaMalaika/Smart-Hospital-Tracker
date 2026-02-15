import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';

const API_BASE_URL = 'https://backend.smartenvironment.tech/api/v1';
const API_KEY = '49643a60-0aff-4a88-8e65-30ea428df8ee';

const API_ENDPOINTS = {
  NODES: '/node/list',
  ALERTS_LIST: '/alerts/list',
  ALERTS_ACK: '/alerts/acknowledge',
  ALERTS_RESOLVE: '/alerts/resolve',
  ALERTS_CLEAR: '/alerts/clear',
  ALERTS_SETTINGS_GET: '/alerts/settings',
  ALERTS_SETTINGS_POST: '/alerts/settings',
};

// ── Types ──────────────────────────────────────────────────────────────────
type NodeSummary = {
  id?: string; nodeId?: string; uuid?: string;
  friendlyName?: string; name?: string; type?: string;
  battery?: number; lastHeartbeat?: number;
  alertSettings?: any; alerts?: any; alertMetadata?: any;
};

type Severity = 'WARNING' | 'CRITICAL';
type AlertStatus = 'ACTIVE' | 'ATTENDED' | 'RESOLVED';
type AlertType =
  | 'TEMPERATURE' | 'HUMIDITY' | 'PRESSURE' | 'NOISE' | 'LIGHT'
  | 'BATTERY_LOW' | 'HEARTBEAT_MISSED' | 'OCCUPANCY_HIGH'
  // backend-aligned names:
  | 'BATTERY' | 'HEARTBEAT' | 'ROOM_LIMIT';

type AlertLogItem = {
  id: string; nodeId: string; nodeName?: string; type: AlertType;
  severity: Severity; status: AlertStatus; message: string;
  value?: number; createdAt: number;
};

type SensorThreshold = { min: number; max: number; critical: number; disabled?: boolean };
type CurrentSensorsResponse = { friendlyName?: string; timestamp?: number; [key: string]: any };

type AlertSettings = {
  enabled: Record<AlertType, boolean>;
  actions: { flashOnCritical: boolean; soundOnCritical: boolean; fanOnCritical: boolean };
  maxPeoplePerRoom: number; heartbeatTimeoutSeconds: number; batteryLowPercent: number;
};

const DEFAULT_SETTINGS: AlertSettings = {
  enabled: {
    TEMPERATURE: true, HUMIDITY: true, PRESSURE: false, NOISE: true, LIGHT: false,
    BATTERY_LOW: true, HEARTBEAT_MISSED: true, OCCUPANCY_HIGH: true,
    // backend-aligned
    BATTERY: true, HEARTBEAT: true, ROOM_LIMIT: true,
  },
  actions: { flashOnCritical: true, soundOnCritical: false, fanOnCritical: false },
  maxPeoplePerRoom: 10, heartbeatTimeoutSeconds: 180, batteryLowPercent: 20,
};

// ── Helpers ────────────────────────────────────────────────────────────────
function safeNodeId(n: NodeSummary): string | null {
  return (n.id || n.nodeId || n.uuid || null) as string | null;
}

function formatLastSeen(lastHeartbeat?: number, t?: any): string {
  if (!lastHeartbeat) return t ? t('common.unknown') : 'N/A';
  const diffMs = Date.now() - lastHeartbeat;
  if (diffMs < 0) return t ? t('common.justNow') : 'Just now';
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return t ? t('common.secondsAgo', { count: secs }) : `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return t ? t('common.minutesAgo', { count: mins }) : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t ? t('common.hoursAgo', { count: hrs }) : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return t ? t('common.daysAgo', { count: days }) : `${days}d ago`;
}

function badgeColors(severity: Severity, isDark: boolean) {
  if (severity === 'CRITICAL') return { bg: isDark ? '#4C1D95' : '#F3E8FF', text: isDark ? '#E9D5FF' : '#6B21A8', border: isDark ? '#C4B5FD' : '#A855F7' };
  return { bg: isDark ? '#7C2D12' : '#FFEDD5', text: isDark ? '#FED7AA' : '#9A3412', border: isDark ? '#FDBA74' : '#F97316' };
}

function statusChip(status: AlertStatus, isDark: boolean) {
  if (status === 'RESOLVED') return { bg: isDark ? '#064E3B' : '#D1FAE5', text: isDark ? '#34D399' : '#047857', border: isDark ? '#10B981' : '#059669' };
  if (status === 'ATTENDED') return { bg: isDark ? '#1E3A8A' : '#DBEAFE', text: isDark ? '#93C5FD' : '#1D4ED8', border: isDark ? '#60A5FA' : '#2563EB' };
  return { bg: isDark ? '#374151' : '#F3F4F6', text: isDark ? '#E5E7EB' : '#4B5563', border: isDark ? '#4B5563' : '#D1D5DB' };
}

function clampNum(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

// Maps backend alert shape → AlertLogItem[]
function mapBackendAlertsToLog(
  nodeId: string,
  nodeName: string,
  alertsByType: Record<string, any>
): AlertLogItem[] {
  const out: AlertLogItem[] = [];
  if (!alertsByType || typeof alertsByType !== 'object') return out;

  Object.entries(alertsByType).forEach(([typeKey, arr]) => {
    if (!Array.isArray(arr)) return;
    for (const a of arr) {
      const createdAt = typeof a?.createdAt === 'number' ? a.createdAt : Date.now();
      const level = String(a?.level || a?.alertLevel || a?.severity || 'WARNING').toUpperCase();
      const severity: Severity = level === 'CRITICAL' ? 'CRITICAL' : 'WARNING';
      const acknowledged = Boolean(a?.acknowledged);
      const resolved = Boolean(a?.resolved);
      const status: AlertStatus = resolved ? 'RESOLVED' : acknowledged ? 'ATTENDED' : 'ACTIVE';
      const id = String(a?.alertId || a?.id || `${typeKey}_${createdAt}`);
      out.push({
        id, nodeId, nodeName,
        type: typeKey as AlertType, severity, status,
        message: a?.message ? String(a.message) : `${typeKey} ${severity === 'CRITICAL' ? 'critical' : 'warning'}`,
        createdAt,
      });
    }
  });

  out.sort((a, b) => b.createdAt - a.createdAt);
  return out;
}

// ── Component ──────────────────────────────────────────────────────────────
export default function AlertsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const isPhone = windowWidth < 768;

  const log = (...args: any[]) => { if (__DEV__) console.log('[AlertsScreen]', ...args); };
  const warn = (...args: any[]) => { if (__DEV__) console.warn('[AlertsScreen]', ...args); };

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [nodes, setNodes] = useState<NodeSummary[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [isLoadingNodes, setIsLoadingNodes] = useState(true);
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(false);
  const [settings, setSettings] = useState<AlertSettings>(DEFAULT_SETTINGS);
  const [alertLog, setAlertLog] = useState<AlertLogItem[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<AlertLogItem[]>([]);

  // Search / dropdown
  const [nodeSearchQuery, setNodeSearchQuery] = useState('');
  const [isNodeDropdownOpen, setIsNodeDropdownOpen] = useState(false);

  const lastAnnouncedHashRef = useRef<string>('');
  const isMountedRef = useRef<boolean>(false);

  // ── Auth + Theme ───────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try { const isAuth = await AsyncStorage.getItem('isAuthenticated'); if (!isAuth) router.replace('/login'); }
      catch { router.replace('/login'); }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try { const saved = await AsyncStorage.getItem('isDarkMode'); if (saved !== null) setIsDarkMode(saved === 'true'); }
      catch { }
    })();
  }, []);

  const toggleDarkMode = async () => {
    const n = !isDarkMode; setIsDarkMode(n);
    try { await AsyncStorage.setItem('isDarkMode', String(n)); } catch { }
  };

  // ── Auth headers (teammate's session-token-aware version) ─────────────
  const getAdminHeaders = async () => {
    const sessionToken = await AsyncStorage.getItem('sessionToken');
    const authToken = await AsyncStorage.getItem('authToken');
    const token = sessionToken || authToken;
    return {
      'Content-Type': 'application/json',
      'API-KEY': API_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const adminFetch = async (url: string, init?: RequestInit) => {
    const headers = await getAdminHeaders();
    log('FETCH', url, { method: init?.method || 'GET', hasAuth: !!(headers as any).Authorization });
    return fetch(url, { ...(init || {}), headers: { ...headers, ...(init?.headers || {}) } });
  };

  // ── Node Fetch ─────────────────────────────────────────────────────────
  const fetchNodes = async () => {
    setIsLoadingNodes(true);
    try {
      const res = await adminFetch(`${API_BASE_URL}${API_ENDPOINTS.NODES}`, { method: 'GET' });
      if (!res.ok) throw new Error(`Failed to fetch nodes: ${res.status} ${res.statusText}`);
      const data = await res.json();
      const list: NodeSummary[] = Array.isArray(data) ? data : data.nodes || data.data || [];
      setNodes(list);
      if (!selectedNode && list.length > 0) {
        const first = safeNodeId(list[0]);
        if (first) setSelectedNode(first);
      }
    } catch (e: any) {
      warn('NODES_FETCH_FAIL', e?.message || e);
      Alert.alert('Error', e?.message || 'Could not fetch nodes');
    } finally { setIsLoadingNodes(false); }
  };
  useEffect(() => { fetchNodes(); }, []);

  const selectedNodeObj = useMemo(() => nodes.find((n) => safeNodeId(n) === selectedNode) || null, [nodes, selectedNode]);
  const selectedNodeName = selectedNodeObj?.friendlyName || selectedNodeObj?.name || selectedNode || t('common.unknown');

  // Filtered nodes for search
  const filteredNodes = useMemo(() =>
    nodes.filter((n) => (n.friendlyName || n.name || safeNodeId(n) || '').toLowerCase().includes(nodeSearchQuery.toLowerCase())),
    [nodes, nodeSearchQuery]
  );

  // ── Storage Keys ───────────────────────────────────────────────────────
  const storageKeys = useMemo(() => {
    if (!selectedNode) return { settingsKey: null, logKey: null };
    return { settingsKey: `alertSettings:${selectedNode}`, logKey: `alertLog:${selectedNode}` };
  }, [selectedNode]);

  const loadStoredLocal = async () => {
    if (!selectedNode || !storageKeys.settingsKey || !storageKeys.logKey) return;
    try {
      const [sRaw, lRaw] = await Promise.all([AsyncStorage.getItem(storageKeys.settingsKey), AsyncStorage.getItem(storageKeys.logKey)]);
      if (sRaw) {
        const parsed = JSON.parse(sRaw);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed, enabled: { ...DEFAULT_SETTINGS.enabled, ...(parsed.enabled || {}) }, actions: { ...DEFAULT_SETTINGS.actions, ...(parsed.actions || {}) } });
      } else { setSettings(DEFAULT_SETTINGS); }
      if (lRaw) { const parsedLog: AlertLogItem[] = JSON.parse(lRaw); setAlertLog(Array.isArray(parsedLog) ? parsedLog : []); }
      else { setAlertLog([]); }
    } catch { setSettings(DEFAULT_SETTINGS); setAlertLog([]); }
  };
  useEffect(() => { if (selectedNode) loadStoredLocal(); }, [selectedNode]);

  const persistSettingsLocal = async (next: AlertSettings) => {
    if (!storageKeys.settingsKey) return;
    try { await AsyncStorage.setItem(storageKeys.settingsKey, JSON.stringify(next)); } catch { }
  };
  const persistLogLocal = async (nextLog: AlertLogItem[]) => {
    if (!storageKeys.logKey) return;
    try { await AsyncStorage.setItem(storageKeys.logKey, JSON.stringify(nextLog)); } catch { }
  };

  // ── Backend: fetch settings ────────────────────────────────────────────
  const fetchBackendSettings = async () => {
    if (!selectedNode) return;
    try {
      const res = await adminFetch(`${API_BASE_URL}${API_ENDPOINTS.ALERTS_SETTINGS_GET}?nodeId=${encodeURIComponent(selectedNode)}`, { method: 'GET' });
      if (res.status === 401) { warn('SETTINGS_GET_401'); return; }
      if (!res.ok) { warn('SETTINGS_GET_FAIL', res.status); return; }
      const json = await res.json();
      const enabledAlerts: string[] = Array.isArray(json?.enabledAlerts) ? json.enabledAlerts : [];
      const next: AlertSettings = {
        ...DEFAULT_SETTINGS,
        actions: {
          flashOnCritical: Boolean(json?.flashOnCritical),
          soundOnCritical: Boolean(json?.soundOnCritical),
          fanOnCritical: Boolean(json?.fanOnCritical),
        },
        maxPeoplePerRoom: typeof json?.maxPeopleAllowedInRoom === 'number' ? json.maxPeopleAllowedInRoom : DEFAULT_SETTINGS.maxPeoplePerRoom,
        heartbeatTimeoutSeconds: typeof json?.heartbeatTimeout === 'number' ? Math.floor(json.heartbeatTimeout / 1000) : DEFAULT_SETTINGS.heartbeatTimeoutSeconds,
        batteryLowPercent: typeof json?.batteryLowThreshold === 'number' ? json.batteryLowThreshold : DEFAULT_SETTINGS.batteryLowPercent,
        enabled: {
          ...DEFAULT_SETTINGS.enabled,
          HEARTBEAT: enabledAlerts.includes('HEARTBEAT'),
          BATTERY: enabledAlerts.includes('BATTERY'),
          ROOM_LIMIT: enabledAlerts.includes('ROOM_LIMIT'),
        },
      };
      setSettings((prev) => ({ ...prev, ...next, enabled: { ...prev.enabled, ...next.enabled }, actions: { ...prev.actions, ...next.actions } }));
      log('SETTINGS_GET_OK');
    } catch (e) { warn('SETTINGS_GET_EXCEPTION', e); }
  };

  // ── Backend: fetch alerts ──────────────────────────────────────────────
  const fetchBackendAlerts = async () => {
    if (!selectedNode) return;
    const res = await adminFetch(`${API_BASE_URL}${API_ENDPOINTS.ALERTS_LIST}?nodeId=${encodeURIComponent(selectedNode)}`, { method: 'GET' });
    if (res.status === 401) { warn('ALERTS_LIST_401'); return; }
    if (!res.ok) { warn('ALERTS_LIST_FAIL', res.status); return; }
    const json = await res.json();
    const mapped = mapBackendAlertsToLog(selectedNode, selectedNodeName, json);
    setAlertLog(mapped.slice(0, 200));
    await persistLogLocal(mapped.slice(0, 200));
    const actives = mapped.filter((a) => a.status !== 'RESOLVED');
    setActiveAlerts(actives);
    log('ALERTS_LIST_OK', { log: mapped.length, active: actives.length });
  };

  // ── Backend: post settings ─────────────────────────────────────────────
  const postBackendSettings = async () => {
    if (!selectedNode) return;
    const enabledAlerts: string[] = [];
    if (settings.enabled.HEARTBEAT) enabledAlerts.push('HEARTBEAT');
    if (settings.enabled.BATTERY) enabledAlerts.push('BATTERY');
    if (settings.enabled.ROOM_LIMIT) enabledAlerts.push('ROOM_LIMIT');
    const payload = {
      enabledAlerts,
      flashOnCritical: settings.actions.flashOnCritical,
      soundOnCritical: settings.actions.soundOnCritical,
      fanOnCritical: settings.actions.fanOnCritical,
      maxPeopleAllowedInRoom: settings.maxPeoplePerRoom,
      heartbeatTimeout: settings.heartbeatTimeoutSeconds * 1000,
      batteryLowThreshold: settings.batteryLowPercent,
    };
    try {
      const res = await adminFetch(`${API_BASE_URL}${API_ENDPOINTS.ALERTS_SETTINGS_POST}?nodeId=${encodeURIComponent(selectedNode)}`, { method: 'POST', body: JSON.stringify(payload) });
      if (res.status === 401) { Alert.alert('Unauthorized', 'Your admin session token is missing or expired. Please login again.'); return; }
      if (!res.ok) { const txt = await res.text(); warn('SETTINGS_POST_FAIL', res.status, txt); Alert.alert('Error', 'Failed to save alert settings to backend.'); return; }
      Alert.alert(t('alerts.clearLogTitle'), 'Alert settings saved to backend.');
      log('SETTINGS_POST_OK');
    } catch (e) { warn('SETTINGS_POST_EXCEPTION', e); Alert.alert('Error', 'Network error while saving settings.'); }
  };

  // ── Backend: acknowledge / resolve / clear ─────────────────────────────
  const acknowledgeAlert = async (alertId: string) => {
    if (!selectedNode) return;
    const res = await adminFetch(`${API_BASE_URL}${API_ENDPOINTS.ALERTS_ACK}?nodeId=${encodeURIComponent(selectedNode)}&alertId=${encodeURIComponent(alertId)}`, { method: 'POST' });
    if (res.status === 401) { Alert.alert('Unauthorized', 'Please login again to acknowledge alerts.'); return; }
    if (!res.ok) { warn('ACK_FAIL', res.status); Alert.alert('Error', 'Failed to acknowledge alert.'); return; }
    AccessibilityInfo.announceForAccessibility?.('Alert marked as attended');
    await fetchBackendAlerts();
  };

  const resolveAlert = async (alertId: string) => {
    if (!selectedNode) return;
    const res = await adminFetch(`${API_BASE_URL}${API_ENDPOINTS.ALERTS_RESOLVE}?nodeId=${encodeURIComponent(selectedNode)}&alertId=${encodeURIComponent(alertId)}`, { method: 'POST' });
    if (res.status === 401) { Alert.alert('Unauthorized', 'Please login again to resolve alerts.'); return; }
    if (!res.ok) { warn('RESOLVE_FAIL', res.status); Alert.alert('Error', 'Failed to resolve alert.'); return; }
    AccessibilityInfo.announceForAccessibility?.('Alert resolved');
    await fetchBackendAlerts();
  };

  const clearBackendAlerts = async () => {
    if (!selectedNode) return;
    const res = await adminFetch(`${API_BASE_URL}${API_ENDPOINTS.ALERTS_CLEAR}?nodeId=${encodeURIComponent(selectedNode)}`, { method: 'POST' });
    if (res.status === 401) { Alert.alert('Unauthorized', 'Please login again to clear alerts.'); return; }
    if (!res.ok) { warn('CLEAR_FAIL', res.status); Alert.alert('Error', 'Failed to clear backend alerts.'); return; }
    setAlertLog([]); setActiveAlerts([]);
    await persistLogLocal([]);
    AccessibilityInfo.announceForAccessibility?.('Alert log cleared');
    Alert.alert(t('alerts.clearLogTitle'), t('alerts.clearLogMessage'));
  };

  // ── Refresh orchestration ──────────────────────────────────────────────
  const refreshAll = async () => {
    if (!selectedNode) return;
    setIsLoadingAlerts(true);
    log('REFRESH_START', { nodeId: selectedNode });
    try {
      await fetchNodes();
      await fetchBackendSettings();
      await fetchBackendAlerts();
      log('REFRESH_SUCCESS');
    } catch (e) { warn('REFRESH_FAIL', e); }
    finally { setIsLoadingAlerts(false); }
  };

  useEffect(() => { if (selectedNode) { refreshAll(); log('NODE_SELECTED', selectedNode); } }, [selectedNode]);
  useEffect(() => { if (selectedNode) { persistSettingsLocal(settings); log('SETTINGS_CHANGED_LOCAL_PERSIST'); } }, [settings, selectedNode]);

  // ── Accessibility announcements ────────────────────────────────────────
  useEffect(() => {
    if (!isMountedRef.current) { isMountedRef.current = true; return; }
    const summary = activeAlerts.map((a) => `${a.severity}:${a.type}:${a.message}`).sort().join('|');
    if (!summary || summary === lastAnnouncedHashRef.current) return;
    lastAnnouncedHashRef.current = summary;
    const critical = activeAlerts.find((a) => a.severity === 'CRITICAL');
    if (critical) AccessibilityInfo.announceForAccessibility?.(`Critical alert for ${selectedNodeName}. ${critical.type}. ${critical.message}`);
    else if (activeAlerts.length > 0) AccessibilityInfo.announceForAccessibility?.(`New alerts for ${selectedNodeName}. ${activeAlerts.length} active.`);
  }, [activeAlerts, selectedNodeName]);

  // ── Dynamic styles ─────────────────────────────────────────────────────
  const dynamic = {
    container: { ...styles.container, backgroundColor: isDarkMode ? '#111827' : '#F9FAFB' },
    header: { ...styles.header, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderBottomColor: isDarkMode ? '#374151' : '#E5E7EB' },
    title: { ...styles.title, color: isDarkMode ? '#F9FAFB' : '#111827' },
    subtitle: { ...styles.subtitle, color: isDarkMode ? '#D1D5DB' : '#6B7280' },
    sectionLabel: { ...styles.sectionLabel, color: isDarkMode ? '#E5E7EB' : '#374151' },
    selector: { ...styles.selector, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderBottomColor: isDarkMode ? '#374151' : '#E5E7EB' },
    card: { ...styles.card, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderColor: isDarkMode ? '#374151' : '#E5E7EB' },
    cardTitle: { ...styles.cardTitle, color: isDarkMode ? '#F9FAFB' : '#111827' },
    smallText: { ...styles.smallText, color: isDarkMode ? '#D1D5DB' : '#6B7280' },
    valueText: { ...styles.valueText, color: isDarkMode ? '#F9FAFB' : '#111827' },
    input: { ...styles.input, backgroundColor: isDarkMode ? '#0B1220' : '#FFFFFF', borderColor: isDarkMode ? '#4B5563' : '#D1D5DB', color: isDarkMode ? '#F9FAFB' : '#111827' },
    inputLabel: { ...styles.inputLabel, color: isDarkMode ? '#E5E7EB' : '#374151' },
    divider: { ...styles.divider, backgroundColor: isDarkMode ? '#374151' : '#E5E7EB' },
    metaText: { color: isDarkMode ? '#D1D5DB' : '#6B7280' },
    bodyText: { color: isDarkMode ? '#F9FAFB' : '#111827' },
    // Search bar
    searchInput: { ...styles.searchInput, backgroundColor: isDarkMode ? '#374151' : '#F3F4F6', color: isDarkMode ? '#F9FAFB' : '#111827', borderColor: isDarkMode ? '#4B5563' : '#D1D5DB' },
    dropdownMenu: { ...styles.dropdownMenu, backgroundColor: isDarkMode ? '#374151' : '#FFFFFF', borderColor: isDarkMode ? '#4B5563' : '#D1D5DB' },
    dropdownItem: { ...styles.dropdownItem, borderBottomColor: isDarkMode ? '#4B5563' : '#E5E7EB' },
    dropdownItemText: { ...styles.dropdownItemText, color: isDarkMode ? '#D1D5DB' : '#374151' },
    dropdownItemActive: { backgroundColor: isDarkMode ? '#1E3A8A' : '#EFF6FF' },
    selectedChip: { ...styles.selectedChip, backgroundColor: isDarkMode ? '#3B82F6' : '#2563EB' },
  };

  // Alert toggle rows — uses backend-aligned type names
  const enabledAlertRows: { type: AlertType; icon: keyof typeof Ionicons.glyphMap }[] = [
    { type: 'TEMPERATURE', icon: 'thermometer' },
    { type: 'HUMIDITY', icon: 'water' },
    { type: 'NOISE', icon: 'volume-high' },
    { type: 'BATTERY', icon: 'battery-dead-outline' },
    { type: 'HEARTBEAT', icon: 'pulse' },
    { type: 'ROOM_LIMIT', icon: 'people' },
    { type: 'PRESSURE', icon: 'speedometer' },
    { type: 'LIGHT', icon: 'bulb' },
  ];

  const displayedLog = useMemo(() => [...alertLog].sort((a, b) => b.createdAt - a.createdAt), [alertLog]);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <ScrollView style={dynamic.container} contentContainerStyle={{ paddingBottom: 24 }} accessibilityLabel="Alerts screen">
      {/* Header */}
      <View style={dynamic.header} accessible accessibilityRole="header">
        <View style={{ flex: 1 }}>
          <Text style={dynamic.title} accessibilityRole="header">{t('alerts.title')}</Text>
          <Text style={dynamic.subtitle}>{t('alerts.subtitle')}</Text>
        </View>
        <TouchableOpacity onPress={toggleDarkMode} style={styles.iconButton} accessibilityRole="button"
          accessibilityLabel={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name={isDarkMode ? 'sunny' : 'moon'} size={22} color={isDarkMode ? '#FBBF24' : '#6B7280'} />
        </TouchableOpacity>
        <TouchableOpacity onPress={refreshAll} style={styles.iconButton} accessibilityRole="button"
          accessibilityLabel="Refresh alerts" accessibilityHint="Fetches latest node list and backend alerts"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="refresh" size={22} color={isDarkMode ? '#93C5FD' : '#2563EB'} />
        </TouchableOpacity>
      </View>

      {/* ── Node Selector with Search Bar ─────────────────────────────── */}
      <View style={[dynamic.selector, { zIndex: 1000, overflow: 'visible' }]} accessibilityLabel="Node selector">
        <Text style={dynamic.sectionLabel}>{t('alerts.selectNode')}</Text>

        {isLoadingNodes ? (
          <View style={{ paddingVertical: 12 }}>
            <ActivityIndicator accessibilityLabel="Loading nodes" accessibilityRole="progressbar" />
          </View>
        ) : (
          <View style={isPhone ? styles.searchRowPhone : styles.searchRowLaptop}>
            <View style={isPhone ? styles.searchContainerPhone : styles.searchContainerLaptop}>
              <Ionicons name="search" size={18} color={isDarkMode ? '#9CA3AF' : '#6B7280'} style={styles.searchIcon} accessible={false} />
              <TextInput
                style={dynamic.searchInput}
                placeholder={t('alerts.searchPlaceholder')}
                placeholderTextColor={isDarkMode ? '#6B7280' : '#9CA3AF'}
                value={nodeSearchQuery}
                onChangeText={setNodeSearchQuery}
                onFocus={() => setIsNodeDropdownOpen(true)}
                accessibilityLabel="Search for nodes"
                accessibilityRole="search"
                autoCorrect={false} autoCapitalize="none" returnKeyType="search"
              />
            </View>
            {selectedNode && (
              <TouchableOpacity style={dynamic.selectedChip} onPress={() => setIsNodeDropdownOpen(true)}
                accessibilityRole="button" accessibilityLabel={`Selected node: ${selectedNodeName}`}>
                <Ionicons name="radio-button-on" size={14} color="#FFFFFF" />
                <Text style={styles.selectedChipText} numberOfLines={1}>{selectedNodeName}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {isNodeDropdownOpen && filteredNodes.length > 0 && (
          <View style={[dynamic.dropdownMenu, styles.dropdownPositioned]} accessibilityRole="menu">
            <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {filteredNodes.map((node) => {
                const id = safeNodeId(node); if (!id) return null;
                const name = node.friendlyName || node.name || id;
                const isSelected = selectedNode === id;
                return (
                  <TouchableOpacity key={id}
                    onPress={() => { setSelectedNode(id); setNodeSearchQuery(''); setIsNodeDropdownOpen(false); }}
                    style={[dynamic.dropdownItem, isSelected && dynamic.dropdownItemActive]}
                    accessibilityRole="menuitem" accessibilityLabel={`Select node ${name}`} accessibilityState={{ selected: isSelected }}>
                    <Text style={dynamic.dropdownItemText}>{name}</Text>
                    {isSelected && <Ionicons name="checkmark" size={18} color={isDarkMode ? '#60A5FA' : '#2563EB'} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
      </View>
      {/* ─────────────────────────────────────────────────────────────── */}

      {/* Node status card */}
      <View style={dynamic.card} accessible accessibilityLabel={`Node status for ${selectedNodeName}`}>
        <View style={styles.cardHeader}>
          <Ionicons name="information-circle-outline" size={22} color={isDarkMode ? '#60A5FA' : '#2563EB'} />
          <Text style={dynamic.cardTitle}>{t('alerts.nodeStatus')}</Text>
        </View>
        <View style={styles.row}><Text style={dynamic.smallText}>{t('alerts.node')}</Text><Text style={dynamic.valueText}>{selectedNodeName}</Text></View>
        <View style={styles.row}><Text style={dynamic.smallText}>{t('alerts.lastHeartbeat')}</Text><Text style={dynamic.valueText}>{selectedNodeObj?.lastHeartbeat ? new Date(selectedNodeObj.lastHeartbeat).toLocaleString() : 'N/A'}</Text></View>
        <View style={styles.row}><Text style={dynamic.smallText}>{t('alerts.lastSeen')}</Text><Text style={dynamic.valueText}>{formatLastSeen(selectedNodeObj?.lastHeartbeat, t)}</Text></View>
      </View>

      {/* Active alerts */}
      <View style={dynamic.card} accessibilityLabel={`Active alerts for ${selectedNodeName}`} accessibilityLiveRegion={Platform.OS === 'android' ? 'polite' : undefined}>
        <View style={styles.cardHeader}>
          <Ionicons name="warning-outline" size={22} color={isDarkMode ? '#FBBF24' : '#F59E0B'} />
          <Text style={dynamic.cardTitle}>{t('alerts.activeAlerts')}</Text>
        </View>
        {isLoadingAlerts ? (
          <View style={{ paddingVertical: 14 }}>
            <ActivityIndicator accessibilityLabel="Loading alerts" accessibilityRole="progressbar" />
            <Text style={[styles.centerText, dynamic.smallText]}>{t('alerts.checkingReadings')}</Text>
          </View>
        ) : activeAlerts.length === 0 ? (
          <Text style={dynamic.smallText}>{t('alerts.noActiveAlerts')}</Text>
        ) : (
          activeAlerts.map((a) => {
            const sev = badgeColors(a.severity, isDarkMode);
            return (
              <View key={a.id} style={[styles.alertCard, { borderColor: sev.border }]} accessible accessibilityLabel={`${a.severity} ${a.type}. ${a.message}`}>
                <View style={styles.alertTopRow}>
                  <View style={[styles.badge, { backgroundColor: sev.bg, borderColor: sev.border }]}><Text style={[styles.badgeText, { color: sev.text }]}>{a.severity}</Text></View>
                  <Text style={[styles.alertType, dynamic.metaText]}>{a.type}</Text>
                  <Text style={[styles.alertTime, dynamic.metaText]}>{new Date(a.createdAt).toLocaleTimeString()}</Text>
                </View>
                <Text style={[styles.alertMessage, dynamic.bodyText]}>{a.message}</Text>
                <View style={styles.actionRow}>
                  <TouchableOpacity style={[styles.smallButton, styles.primaryButton]}
                    onPress={() => acknowledgeAlert(a.id)}
                    accessibilityRole="button" accessibilityLabel="Mark alert as attended"
                    accessibilityHint="Sends acknowledge to backend and clears alert on node">
                    <Text style={styles.smallButtonText}>{t('alerts.markAttended')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.smallButton, styles.successButton]}
                    onPress={() => resolveAlert(a.id)}
                    accessibilityRole="button" accessibilityLabel="Resolve alert"
                    accessibilityHint="Sends resolve to backend and clears alert on node">
                    <Text style={styles.smallButtonText}>{t('alerts.resolve')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* Alert log */}
      <View style={dynamic.card} accessibilityLabel={`Alert log for ${selectedNodeName}`}>
        <View style={styles.cardHeader}>
          <Ionicons name="list-outline" size={22} color={isDarkMode ? '#60A5FA' : '#2563EB'} />
          <Text style={dynamic.cardTitle}>{t('alerts.alertLog')}</Text>
        </View>
        {displayedLog.length === 0 ? (
          <Text style={dynamic.smallText}>{t('alerts.noAlertHistory')}</Text>
        ) : (
          displayedLog.slice(0, 40).map((a) => {
            const sev = badgeColors(a.severity, isDarkMode);
            const st = statusChip(a.status, isDarkMode);
            return (
              <View key={a.id} style={[styles.logRow, { borderColor: isDarkMode ? '#374151' : '#E5E7EB' }]} accessible accessibilityLabel={`Logged alert. ${a.severity}. Status ${a.status}. ${a.type}. ${a.message}.`}>
                <View style={styles.logHeader}>
                  <View style={[styles.badge, { backgroundColor: sev.bg, borderColor: sev.border }]}><Text style={[styles.badgeText, { color: sev.text }]}>{a.severity}</Text></View>
                  <View style={[styles.badge, { backgroundColor: st.bg, borderColor: st.border }]}><Text style={[styles.badgeText, { color: st.text }]}>{a.status}</Text></View>
                  <Text style={[styles.logMeta, dynamic.metaText]}>{new Date(a.createdAt).toLocaleString()}</Text>
                </View>
                <Text style={[styles.logType, dynamic.metaText]}>{a.type}</Text>
                <Text style={[styles.logMessage, dynamic.bodyText]}>{a.message}</Text>
                <View style={styles.actionRow}>
                  <TouchableOpacity disabled={a.status === 'RESOLVED'} style={[styles.smallButton, styles.primaryButton, { opacity: a.status === 'RESOLVED' ? 0.5 : 1 }]}
                    onPress={() => acknowledgeAlert(a.id)}
                    accessibilityRole="button" accessibilityLabel="Mark log entry as attended" accessibilityState={{ disabled: a.status === 'RESOLVED' }}>
                    <Text style={styles.smallButtonText}>{t('alerts.attended')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity disabled={a.status === 'RESOLVED'} style={[styles.smallButton, styles.successButton, { opacity: a.status === 'RESOLVED' ? 0.5 : 1 }]}
                    onPress={() => resolveAlert(a.id)}
                    accessibilityRole="button" accessibilityLabel="Mark log entry as resolved" accessibilityState={{ disabled: a.status === 'RESOLVED' }}>
                    <Text style={styles.smallButtonText}>{t('alerts.resolved')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* Settings */}
      <View style={dynamic.card} accessibilityLabel={`Alert settings for ${selectedNodeName}`}>
        <View style={styles.cardHeader}>
          <Ionicons name="options-outline" size={22} color={isDarkMode ? '#60A5FA' : '#2563EB'} />
          <Text style={dynamic.cardTitle}>{t('alerts.alertSettings')}</Text>
        </View>

        <Text style={dynamic.sectionLabel}>{t('alerts.enabledAlerts')}</Text>
        <View style={dynamic.divider} />
        {enabledAlertRows.map((row) => (
          <View key={row.type} style={styles.toggleRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <Ionicons name={row.icon} size={18} color={isDarkMode ? '#93C5FD' : '#2563EB'} />
              <Text style={[styles.toggleLabel, dynamic.bodyText]}>{t(`alerts.alertTypes.${row.type}` as any)}</Text>
            </View>
            <Switch value={!!settings.enabled[row.type]}
              onValueChange={(v) => setSettings((prev) => ({ ...prev, enabled: { ...prev.enabled, [row.type]: v } }))}
              accessibilityLabel={`Toggle ${t(`alerts.alertTypes.${row.type}` as any)}`} />
          </View>
        ))}

        <View style={{ marginTop: 18 }}>
          <Text style={dynamic.sectionLabel}>{t('alerts.criticalActions')}</Text>
          <View style={dynamic.divider} />
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, dynamic.bodyText]}>{t('alerts.flashOnCritical')}</Text>
            <Switch value={settings.actions.flashOnCritical} onValueChange={(v) => setSettings((p) => ({ ...p, actions: { ...p.actions, flashOnCritical: v } }))} accessibilityLabel="Toggle flash on critical" />
          </View>
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, dynamic.bodyText]}>{t('alerts.soundOnCritical')}</Text>
            <Switch value={settings.actions.soundOnCritical} onValueChange={(v) => setSettings((p) => ({ ...p, actions: { ...p.actions, soundOnCritical: v } }))} accessibilityLabel="Toggle sound on critical" />
          </View>
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, dynamic.bodyText]}>{t('alerts.fanOnCritical')}</Text>
            <Switch value={settings.actions.fanOnCritical} onValueChange={(v) => setSettings((p) => ({ ...p, actions: { ...p.actions, fanOnCritical: v } }))} accessibilityLabel="Toggle fan on critical" />
          </View>
          <Text style={[styles.hint, dynamic.smallText]}>{t('alerts.criticalActionsNote')}</Text>
        </View>

        <View style={{ marginTop: 18 }}>
          <Text style={dynamic.sectionLabel}>{t('alerts.systemThresholds')}</Text>
          <View style={dynamic.divider} />
          <Text style={dynamic.inputLabel}>{t('alerts.heartbeatTimeout')}</Text>
          <TextInput value={String(settings.heartbeatTimeoutSeconds)} keyboardType="numeric" style={dynamic.input}
            onChangeText={(txt) => { const n = clampNum(parseInt(txt || '0', 10) || 0, 10, 3600); setSettings((p) => ({ ...p, heartbeatTimeoutSeconds: n })); }}
            accessibilityLabel="Heartbeat timeout in seconds" accessibilityHint="Controls how long without a heartbeat triggers an alert" />
          <Text style={dynamic.inputLabel}>{t('alerts.batteryThreshold')}</Text>
          <TextInput value={String(settings.batteryLowPercent)} keyboardType="numeric" style={dynamic.input}
            onChangeText={(txt) => { const n = clampNum(parseInt(txt || '0', 10) || 0, 0, 100); setSettings((p) => ({ ...p, batteryLowPercent: n })); }}
            accessibilityLabel="Battery low threshold percentage" accessibilityHint="Controls when battery low triggers an alert" />
          <Text style={dynamic.inputLabel}>{t('alerts.maxPeopleLabel')}</Text>
          <TextInput value={String(settings.maxPeoplePerRoom)} keyboardType="numeric" style={dynamic.input}
            onChangeText={(txt) => { const n = clampNum(parseInt(txt || '0', 10) || 0, 0, 999); setSettings((p) => ({ ...p, maxPeoplePerRoom: n })); }}
            accessibilityLabel="Maximum people per room" accessibilityHint="Controls occupancy limit used by the backend ROOM_LIMIT alert" />
        </View>

        {/* Save settings to backend */}
        <TouchableOpacity onPress={postBackendSettings} style={styles.saveServerButton}
          accessibilityRole="button" accessibilityLabel="Save settings to server"
          accessibilityHint="Sends alert settings to backend so they persist and affect node alerting">
          <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" />
          <Text style={styles.saveServerButtonText}>{t('alerts.saveSettings')}</Text>
        </TouchableOpacity>

        {/* Clear alerts */}
        <TouchableOpacity onPress={clearBackendAlerts} style={styles.clearButton}
          accessibilityRole="button" accessibilityLabel="Clear alert log"
          accessibilityHint="Clears backend alert list for this node">
          <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
          <Text style={styles.clearButtonText}>{t('alerts.clearLog')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 20, borderBottomWidth: 1 },
  title: { fontSize: 24, fontWeight: 'bold' },
  subtitle: { fontSize: 14, marginTop: 4 },
  iconButton: { padding: 10, marginLeft: 6, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  selector: { padding: 20, borderBottomWidth: 1 },
  sectionLabel: { fontSize: 14, fontWeight: '700', marginBottom: 10 },

  // Search bar — same pattern as all other screens
  searchRowPhone: { flexDirection: 'column', gap: 10 },
  searchRowLaptop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  searchContainerPhone: { position: 'relative', width: '100%' },
  searchContainerLaptop: { position: 'relative', flex: 1, maxWidth: 400 },
  searchIcon: { position: 'absolute', left: 10, top: 11, zIndex: 1 },
  searchInput: { paddingLeft: 36, paddingRight: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, fontSize: 14 },
  selectedChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  selectedChipText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  dropdownMenu: { borderRadius: 8, borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 20 },
  dropdownPositioned: { marginTop: 4, zIndex: 9999 },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1 },
  dropdownItemText: { fontSize: 14 },

  card: { margin: 20, marginTop: 10, borderRadius: 12, borderWidth: 1, padding: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  cardTitle: { fontSize: 18, fontWeight: '700' },
  smallText: { fontSize: 13 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  valueText: { fontSize: 14, fontWeight: '700' },
  divider: { height: 1, width: '100%', marginTop: 6 },

  alertCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 10 },
  alertTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  alertType: { fontSize: 12, fontWeight: '800' },
  alertTime: { marginLeft: 'auto', fontSize: 12 },
  alertMessage: { marginTop: 8, fontSize: 14, fontWeight: '700' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  badgeText: { fontSize: 12, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  smallButton: { paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 44 },
  primaryButton: { backgroundColor: '#1D4ED8' },
  successButton: { backgroundColor: '#047857' },
  smallButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  hint: { marginTop: 8, fontSize: 12, lineHeight: 16 },

  logRow: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 10 },
  logHeader: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  logMeta: { marginLeft: 'auto', fontSize: 12 },
  logType: { marginTop: 8, fontSize: 12, fontWeight: '900' },
  logMessage: { marginTop: 4, fontSize: 14, fontWeight: '700' },

  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  toggleLabel: { fontSize: 14, fontWeight: '600' },
  inputLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, minHeight: 44 },

  saveServerButton: { marginTop: 18, backgroundColor: '#2563EB', paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, minHeight: 44 },
  saveServerButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  clearButton: { marginTop: 12, backgroundColor: '#B91C1C', paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, minHeight: 44 },
  clearButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  centerText: { textAlign: 'center', marginTop: 10 },
});