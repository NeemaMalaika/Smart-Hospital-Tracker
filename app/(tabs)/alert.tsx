import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
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
} from 'react-native';

const API_BASE_URL = 'https://backend.smartenvironment.tech/api/v1';

const API_ENDPOINTS = {
  NODES: '/node/list',

  // Alerts (backend)
  ALERTS_LIST: '/alerts/list',
  ALERTS_ACK: '/alerts/acknowledge',
  ALERTS_RESOLVE: '/alerts/resolve',
  ALERTS_CLEAR: '/alerts/clear',
  ALERTS_SETTINGS_GET: '/alerts/settings',
  ALERTS_SETTINGS_POST: '/alerts/settings',
};

const API_KEY = '49643a60-0aff-4a88-8e65-30ea428df8ee';

// Types 
type NodeSummary = {
  id?: string;
  nodeId?: string;
  uuid?: string;
  friendlyName?: string;
  name?: string;
  type?: string;
  battery?: number;
  lastHeartbeat?: number;

  alertSettings?: any;
  alerts?: any;
  alertMetadata?: any;
};

type Severity = 'WARNING' | 'CRITICAL';
type AlertStatus = 'ACTIVE' | 'ATTENDED' | 'RESOLVED';

type AlertType =
  | 'TEMPERATURE'
  | 'HUMIDITY'
  | 'PRESSURE'
  | 'NOISE'
  | 'LIGHT'
  | 'BATTERY_LOW'
  | 'HEARTBEAT_MISSED'
  | 'OCCUPANCY_HIGH'
  // backend naming:
  | 'BATTERY'
  | 'HEARTBEAT'
  | 'ROOM_LIMIT';

type AlertLogItem = {
  id: string; // backend UUID or local id
  nodeId: string;
  nodeName?: string;
  type: AlertType;
  severity: Severity;
  status: AlertStatus;
  message: string;
  value?: number;
  createdAt: number;
};

type SensorThreshold = {
  min: number;
  max: number;
  critical: number;
  disabled?: boolean;
};

type CurrentSensorsResponse = {
  friendlyName?: string;
  timestamp?: number;
  [key: string]: any;
};

type AlertSettings = {
  enabled: Record<AlertType, boolean>;
  actions: {
    flashOnCritical: boolean;
    soundOnCritical: boolean;
    fanOnCritical: boolean;
  };
  maxPeoplePerRoom: number;
  heartbeatTimeoutSeconds: number;
  batteryLowPercent: number;
};

const DEFAULT_SETTINGS: AlertSettings = {
  enabled: {
    TEMPERATURE: true,
    HUMIDITY: true,
    PRESSURE: false,
    NOISE: true,
    LIGHT: false,
    BATTERY_LOW: true,
    HEARTBEAT_MISSED: true,
    OCCUPANCY_HIGH: true,

    // backend-aligned
    BATTERY: true,
    HEARTBEAT: true,
    ROOM_LIMIT: true,
  },
  actions: {
    flashOnCritical: true,
    soundOnCritical: false,
    fanOnCritical: false,
  },
  maxPeoplePerRoom: 10,
  heartbeatTimeoutSeconds: 180,
  batteryLowPercent: 20,
};

// Helpers 
function safeNodeId(n: NodeSummary): string | null {
  return (n.id || n.nodeId || n.uuid || null) as string | null;
}

function formatLastSeen(lastHeartbeat?: number): string {
  if (!lastHeartbeat) return 'No heartbeat yet';
  const diffMs = Date.now() - lastHeartbeat;
  if (diffMs < 0) return 'Just now';
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function badgeColors(severity: Severity, isDark: boolean) {
  if (severity === 'CRITICAL') {
    return {
      bg: isDark ? '#4C1D95' : '#F3E8FF',
      text: isDark ? '#E9D5FF' : '#6B21A8',
      border: isDark ? '#C4B5FD' : '#A855F7',
    };
  }
  return {
    bg: isDark ? '#7C2D12' : '#FFEDD5',
    text: isDark ? '#FED7AA' : '#9A3412',
    border: isDark ? '#FDBA74' : '#F97316',
  };
}

function statusChip(status: AlertStatus, isDark: boolean) {
  if (status === 'RESOLVED') {
    return {
      bg: isDark ? '#064E3B' : '#D1FAE5',
      text: isDark ? '#34D399' : '#047857',
      border: isDark ? '#10B981' : '#059669',
    };
  }
  if (status === 'ATTENDED') {
    return {
      bg: isDark ? '#1E3A8A' : '#DBEAFE',
      text: isDark ? '#93C5FD' : '#1D4ED8',
      border: isDark ? '#60A5FA' : '#2563EB',
    };
  }
  return {
    bg: isDark ? '#374151' : '#F3F4F6',
    text: isDark ? '#E5E7EB' : '#4B5563',
    border: isDark ? '#4B5563' : '#D1D5DB',
  };
}

function clampNum(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

// Backend shape: { "TEMPERATURE": [ {alertId, type, level, createdAt, acknowledged, resolved}, ...], ... }
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

      // IMPORTANT: backend uses alertId UUID
      const id = String(a?.alertId || a?.id || `${typeKey}_${createdAt}`);

      out.push({
        id,
        nodeId,
        nodeName,
        type: typeKey as AlertType,
        severity,
        status,
        message: a?.message
          ? String(a.message)
          : `${typeKey} ${severity === 'CRITICAL' ? 'critical' : 'warning'}`,
        createdAt,
      });
    }
  });

  out.sort((a, b) => b.createdAt - a.createdAt);
  return out;
}

// Main Screen 
export default function AlertsScreen() {
  const router = useRouter();

  // DEV logger 
  const log = (...args: any[]) => {
    if (__DEV__) console.log('[AlertsScreen]', ...args);
  };
  const warn = (...args: any[]) => {
    if (__DEV__) console.warn('[AlertsScreen]', ...args);
  };

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [nodes, setNodes] = useState<NodeSummary[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const [isLoadingNodes, setIsLoadingNodes] = useState(true);
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(false);

  const [settings, setSettings] = useState<AlertSettings>(DEFAULT_SETTINGS);

  const [alertLog, setAlertLog] = useState<AlertLogItem[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<AlertLogItem[]>([]);

  // optional local sensor data 
  const [currentSensors, setCurrentSensors] = useState<CurrentSensorsResponse | null>(null);
  const [thresholds, setThresholds] = useState<Record<string, SensorThreshold>>({});

  const lastAnnouncedHashRef = useRef<string>('');
  const isMountedRef = useRef<boolean>(false);

  // Auth guard + Theme 
  useEffect(() => {
    (async () => {
      try {
        const isAuth = await AsyncStorage.getItem('isAuthenticated');
        log('Auth check ->', Boolean(isAuth));
        if (!isAuth) router.replace('/login');
      } catch (e) {
        warn('Auth check failed -> redirecting', e);
        router.replace('/login');
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const savedTheme = await AsyncStorage.getItem('isDarkMode');
        if (savedTheme !== null) {
          setIsDarkMode(savedTheme === 'true');
          log('Loaded theme from storage:', savedTheme);
        }
      } catch (e) {
        warn('Failed to load theme from storage', e);
      }
    })();
  }, []);

  const toggleDarkMode = async () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    log('Theme toggled ->', newMode ? 'Dark' : 'Light');
    try {
      await AsyncStorage.setItem('isDarkMode', String(newMode));
    } catch (e) {
      warn('Failed to persist theme', e);
    }
  };

  // Headers
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
    if (__DEV__) {
      log('FETCH', url, { method: init?.method || 'GET', hasAuth: !!headers.Authorization });
    }

    return fetch(url, {
      ...(init || {}),
      headers: {
        ...headers,
        ...(init?.headers || {}),
      },
    });
  };

  // Node Fetch 
  const fetchNodes = async () => {
    const t0 = Date.now();
    setIsLoadingNodes(true);
    log('NODES_FETCH_START');

    try {
      const res = await adminFetch(`${API_BASE_URL}${API_ENDPOINTS.NODES}`, { method: 'GET' });
      if (!res.ok) throw new Error(`Failed to fetch nodes: ${res.status} ${res.statusText}`);

      const data = await res.json();
      const list: NodeSummary[] = Array.isArray(data) ? data : data.nodes || data.data || [];
      setNodes(list);

      log('NODES_FETCH_SUCCESS', { count: list.length, ms: Date.now() - t0 });

      if (!selectedNode && list.length > 0) {
        const first = safeNodeId(list[0]);
        if (first) {
          setSelectedNode(first);
          log('NODE_AUTO_SELECTED', first);
        }
      }
    } catch (e: any) {
      warn('NODES_FETCH_FAIL', e?.message || e);
      Alert.alert('Error', e?.message || 'Could not fetch nodes');
    } finally {
      setIsLoadingNodes(false);
    }
  };

  useEffect(() => {
    fetchNodes();
  }, []);

  const selectedNodeObj = useMemo(
    () => nodes.find((n) => safeNodeId(n) === selectedNode) || null,
    [nodes, selectedNode]
  );

  const selectedNodeName =
    selectedNodeObj?.friendlyName || selectedNodeObj?.name || selectedNode || 'Unknown Node';

  // Storage Keys 
  const storageKeys = useMemo(() => {
    if (!selectedNode) return { settingsKey: null, logKey: null };
    return {
      settingsKey: `alertSettings:${selectedNode}`,
      logKey: `alertLog:${selectedNode}`,
    };
  }, [selectedNode]);

  const loadStoredLocal = async () => {
    if (!selectedNode || !storageKeys.settingsKey || !storageKeys.logKey) return;
    log('LOAD_STORED_LOCAL_START', selectedNode);

    try {
      const [sRaw, lRaw] = await Promise.all([
        AsyncStorage.getItem(storageKeys.settingsKey),
        AsyncStorage.getItem(storageKeys.logKey),
      ]);

      if (sRaw) {
        const parsed = JSON.parse(sRaw);
        setSettings({
          ...DEFAULT_SETTINGS,
          ...parsed,
          enabled: { ...DEFAULT_SETTINGS.enabled, ...(parsed.enabled || {}) },
          actions: { ...DEFAULT_SETTINGS.actions, ...(parsed.actions || {}) },
        });
        log('LOAD_SETTINGS_LOCAL_SUCCESS');
      } else {
        setSettings(DEFAULT_SETTINGS);
        log('LOAD_SETTINGS_LOCAL_DEFAULT');
      }

      if (lRaw) {
        const parsedLog: AlertLogItem[] = JSON.parse(lRaw);
        setAlertLog(Array.isArray(parsedLog) ? parsedLog : []);
        log('LOAD_LOG_LOCAL_SUCCESS', { count: Array.isArray(parsedLog) ? parsedLog.length : 0 });
      } else {
        setAlertLog([]);
        log('LOAD_LOG_LOCAL_EMPTY');
      }
    } catch (e) {
      warn('LOAD_STORED_LOCAL_FAIL', e);
      setSettings(DEFAULT_SETTINGS);
      setAlertLog([]);
    }
  };

  const persistSettingsLocal = async (next: AlertSettings) => {
    if (!storageKeys.settingsKey) return;
    try {
      await AsyncStorage.setItem(storageKeys.settingsKey, JSON.stringify(next));
      log('PERSIST_SETTINGS_LOCAL_OK');
    } catch (e) {
      warn('PERSIST_SETTINGS_LOCAL_FAIL', e);
    }
  };

  const persistLogLocal = async (nextLog: AlertLogItem[]) => {
    if (!storageKeys.logKey) return;
    try {
      await AsyncStorage.setItem(storageKeys.logKey, JSON.stringify(nextLog));
      log('PERSIST_LOG_LOCAL_OK', { count: nextLog.length });
    } catch (e) {
      warn('PERSIST_LOG_LOCAL_FAIL', e);
    }
  };

  useEffect(() => {
    if (selectedNode) loadStoredLocal();
  }, [selectedNode]);

  // Backend (fetch settings + alerts) 
  const fetchBackendSettings = async () => {
    if (!selectedNode) return;
    try {
      const res = await adminFetch(
        `${API_BASE_URL}${API_ENDPOINTS.ALERTS_SETTINGS_GET}?nodeId=${encodeURIComponent(selectedNode)}`,
        { method: 'GET' }
      );

      if (res.status === 401) {
        warn('SETTINGS_GET_401');
        return;
      }

      if (!res.ok) {
        warn('SETTINGS_GET_FAIL', res.status);
        return;
      }

      const json = await res.json();

      const enabledAlerts: string[] = Array.isArray(json?.enabledAlerts) ? json.enabledAlerts : [];
      const next: AlertSettings = {
        ...DEFAULT_SETTINGS,
        actions: {
          flashOnCritical: Boolean(json?.flashOnCritical),
          soundOnCritical: Boolean(json?.soundOnCritical),
          fanOnCritical: Boolean(json?.fanOnCritical),
        },
        maxPeoplePerRoom:
          typeof json?.maxPeopleAllowedInRoom === 'number'
            ? json.maxPeopleAllowedInRoom
            : DEFAULT_SETTINGS.maxPeoplePerRoom,
        heartbeatTimeoutSeconds:
          typeof json?.heartbeatTimeout === 'number'
            ? Math.floor(json.heartbeatTimeout / 1000)
            : DEFAULT_SETTINGS.heartbeatTimeoutSeconds,
        batteryLowPercent:
          typeof json?.batteryLowThreshold === 'number'
            ? json.batteryLowThreshold
            : DEFAULT_SETTINGS.batteryLowPercent,
        enabled: {
          ...DEFAULT_SETTINGS.enabled,
          HEARTBEAT: enabledAlerts.includes('HEARTBEAT'),
          BATTERY: enabledAlerts.includes('BATTERY'),
          ROOM_LIMIT: enabledAlerts.includes('ROOM_LIMIT'),
        },
      };

      setSettings((prev) => ({
        ...prev,
        ...next,
        enabled: { ...prev.enabled, ...next.enabled },
        actions: { ...prev.actions, ...next.actions },
      }));

      log('SETTINGS_GET_OK');
    } catch (e) {
      warn('SETTINGS_GET_EXCEPTION', e);
    }
  };

  const fetchBackendAlerts = async () => {
    if (!selectedNode) return;

    const res = await adminFetch(
      `${API_BASE_URL}${API_ENDPOINTS.ALERTS_LIST}?nodeId=${encodeURIComponent(selectedNode)}`,
      { method: 'GET' }
    );

    if (res.status === 401) {
      warn('ALERTS_LIST_401');
      return;
    }

    if (!res.ok) {
      warn('ALERTS_LIST_FAIL', res.status);
      return;
    }

    const json = await res.json();
    const mapped = mapBackendAlertsToLog(selectedNode, selectedNodeName, json);

    setAlertLog(mapped.slice(0, 200));
    await persistLogLocal(mapped.slice(0, 200));

    const actives = mapped.filter((a) => a.status !== 'RESOLVED');
    setActiveAlerts(actives);

    log('ALERTS_LIST_OK', { log: mapped.length, active: actives.length });
  };

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
      const res = await adminFetch(
        `${API_BASE_URL}${API_ENDPOINTS.ALERTS_SETTINGS_POST}?nodeId=${encodeURIComponent(selectedNode)}`,
        { method: 'POST', body: JSON.stringify(payload) }
      );

      if (res.status === 401) {
        Alert.alert('Unauthorized', 'Your admin session token is missing or expired. Please login again.');
        return;
      }

      if (!res.ok) {
        const t = await res.text();
        warn('SETTINGS_POST_FAIL', res.status, t);
        Alert.alert('Error', 'Failed to save alert settings to backend.');
        return;
      }

      Alert.alert('Saved', 'Alert settings saved to backend.');
      log('SETTINGS_POST_OK');
    } catch (e) {
      warn('SETTINGS_POST_EXCEPTION', e);
      Alert.alert('Error', 'Network error while saving settings.');
    }
  };

  // Refresh orchestration 
  const refreshAll = async () => {
    if (!selectedNode) return;
    const t0 = Date.now();

    setIsLoadingAlerts(true);
    log('REFRESH_START', { nodeId: selectedNode });

    try {
      await fetchNodes();
      await fetchBackendSettings();
      await fetchBackendAlerts();
      log('REFRESH_SUCCESS', { ms: Date.now() - t0 });
    } catch (e) {
      warn('REFRESH_FAIL', e);
    } finally {
      setIsLoadingAlerts(false);
    }
  };

  useEffect(() => {
    if (selectedNode) {
      refreshAll();
      log('NODE_SELECTED', selectedNode);
    }
  }, [selectedNode]);

  useEffect(() => {
    if (selectedNode) {
      persistSettingsLocal(settings);
      log('SETTINGS_CHANGED_LOCAL_PERSIST');
    }
  }, [settings, selectedNode]);

  // Status updates (backend calls) 
  const acknowledgeAlert = async (alertId: string) => {
    if (!selectedNode) return;

    const res = await adminFetch(
      `${API_BASE_URL}${API_ENDPOINTS.ALERTS_ACK}?nodeId=${encodeURIComponent(selectedNode)}&alertId=${encodeURIComponent(alertId)}`,
      { method: 'POST' }
    );

    if (res.status === 401) {
      Alert.alert('Unauthorized', 'Please login again to acknowledge alerts.');
      return;
    }

    if (!res.ok) {
      warn('ACK_FAIL', res.status);
      Alert.alert('Error', 'Failed to acknowledge alert.');
      return;
    }

    AccessibilityInfo.announceForAccessibility?.('Alert marked as attended');
    await fetchBackendAlerts();
  };

  const resolveAlert = async (alertId: string) => {
    if (!selectedNode) return;

    const res = await adminFetch(
      `${API_BASE_URL}${API_ENDPOINTS.ALERTS_RESOLVE}?nodeId=${encodeURIComponent(selectedNode)}&alertId=${encodeURIComponent(alertId)}`,
      { method: 'POST' }
    );

    if (res.status === 401) {
      Alert.alert('Unauthorized', 'Please login again to resolve alerts.');
      return;
    }

    if (!res.ok) {
      warn('RESOLVE_FAIL', res.status);
      Alert.alert('Error', 'Failed to resolve alert.');
      return;
    }

    AccessibilityInfo.announceForAccessibility?.('Alert resolved');
    await fetchBackendAlerts();
  };

  const clearBackendAlerts = async () => {
    if (!selectedNode) return;

    const res = await adminFetch(
      `${API_BASE_URL}${API_ENDPOINTS.ALERTS_CLEAR}?nodeId=${encodeURIComponent(selectedNode)}`,
      { method: 'POST' }
    );

    if (res.status === 401) {
      Alert.alert('Unauthorized', 'Please login again to clear alerts.');
      return;
    }

    if (!res.ok) {
      warn('CLEAR_FAIL', res.status);
      Alert.alert('Error', 'Failed to clear backend alerts.');
      return;
    }

    setAlertLog([]);
    setActiveAlerts([]);
    await persistLogLocal([]);
    AccessibilityInfo.announceForAccessibility?.('Alert log cleared');
    Alert.alert('Cleared', 'Alerts cleared for this node.');
  };

  // Accessibility
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }

    const summary = activeAlerts
      .map((a) => `${a.severity}:${a.type}:${a.message}`)
      .sort()
      .join('|');

    if (!summary || summary === lastAnnouncedHashRef.current) return;
    lastAnnouncedHashRef.current = summary;

    const critical = activeAlerts.find((a) => a.severity === 'CRITICAL');
    if (critical) {
      const msg = `Critical alert for ${selectedNodeName}. ${critical.type}. ${critical.message}`;
      AccessibilityInfo.announceForAccessibility?.(msg);
      log('A11Y_ANNOUNCE_CRITICAL', msg);
    } else if (activeAlerts.length > 0) {
      const msg = `New alerts for ${selectedNodeName}. ${activeAlerts.length} active.`;
      AccessibilityInfo.announceForAccessibility?.(msg);
      log('A11Y_ANNOUNCE_ALERTS', msg);
    }
  }, [activeAlerts, selectedNodeName]);

  // UI dynamic styles 
  const dynamic = {
    container: { ...styles.container, backgroundColor: isDarkMode ? '#111827' : '#F9FAFB' },
    header: {
      ...styles.header,
      backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF',
      borderBottomColor: isDarkMode ? '#374151' : '#E5E7EB',
    },
    title: { ...styles.title, color: isDarkMode ? '#F9FAFB' : '#111827' },
    subtitle: { ...styles.subtitle, color: isDarkMode ? '#D1D5DB' : '#6B7280' },
    sectionLabel: { ...styles.sectionLabel, color: isDarkMode ? '#E5E7EB' : '#374151' },
    selector: {
      ...styles.selector,
      backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF',
      borderBottomColor: isDarkMode ? '#374151' : '#E5E7EB',
    },
    nodeButton: {
      ...styles.nodeButton,
      backgroundColor: isDarkMode ? '#374151' : '#FFFFFF',
      borderColor: isDarkMode ? '#6B7280' : '#D1D5DB',
    },
    nodeButtonActive: {
      ...styles.nodeButtonActive,
      backgroundColor: isDarkMode ? '#0B3A66' : '#EFF6FF',
      borderColor: isDarkMode ? '#60A5FA' : '#2563EB',
    },
    nodeButtonText: { ...styles.nodeButtonText, color: isDarkMode ? '#E5E7EB' : '#4B5563' },
    nodeButtonTextActive: { ...styles.nodeButtonTextActive, color: isDarkMode ? '#DBEAFE' : '#1D4ED8' },

    card: {
      ...styles.card,
      backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF',
      borderColor: isDarkMode ? '#374151' : '#E5E7EB',
    },
    cardTitle: { ...styles.cardTitle, color: isDarkMode ? '#F9FAFB' : '#111827' },
    smallText: { ...styles.smallText, color: isDarkMode ? '#D1D5DB' : '#6B7280' },

    valueText: { ...styles.valueText, color: isDarkMode ? '#F9FAFB' : '#111827' },

    input: {
      ...styles.input,
      backgroundColor: isDarkMode ? '#0B1220' : '#FFFFFF',
      borderColor: isDarkMode ? '#4B5563' : '#D1D5DB',
      color: isDarkMode ? '#F9FAFB' : '#111827',
    },
    inputLabel: { ...styles.inputLabel, color: isDarkMode ? '#E5E7EB' : '#374151' },

    divider: { ...styles.divider, backgroundColor: isDarkMode ? '#374151' : '#E5E7EB' },

    metaText: { color: isDarkMode ? '#D1D5DB' : '#6B7280' },
    bodyText: { color: isDarkMode ? '#F9FAFB' : '#111827' },
  };

  const enabledAlertRows: { type: AlertType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { type: 'TEMPERATURE', label: 'Temperature out of range', icon: 'thermometer' },
    { type: 'HUMIDITY', label: 'Humidity out of range', icon: 'water' },
    { type: 'NOISE', label: 'Noise too high', icon: 'volume-high' },
    { type: 'BATTERY', label: 'Battery low', icon: 'battery-dead-outline' },
    { type: 'HEARTBEAT', label: 'Heartbeat missed', icon: 'pulse' },
    { type: 'ROOM_LIMIT', label: 'Occupancy too high', icon: 'people' },
    { type: 'PRESSURE', label: 'Pressure out of range', icon: 'speedometer' },
    { type: 'LIGHT', label: 'Light out of range', icon: 'bulb' },
  ];

  const displayedLog = useMemo(() => {
    return [...alertLog].sort((a, b) => b.createdAt - a.createdAt);
  }, [alertLog]);

  const a11yNodeName = selectedNodeName || 'selected node';

  return (
    <ScrollView style={dynamic.container} contentContainerStyle={{ paddingBottom: 24 }} accessibilityLabel="Alerts screen">
      {/* Header */}
      <View style={dynamic.header} accessible accessibilityRole="header" accessibilityLabel="Alerts header">
        <View style={{ flex: 1 }}>
          <Text style={dynamic.title} accessibilityRole="header">
            Alerts
          </Text>
          <Text style={dynamic.subtitle}>Warnings, history, and alert settings</Text>
        </View>

        <TouchableOpacity
          onPress={toggleDarkMode}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          accessibilityHint="Toggles theme to improve readability"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name={isDarkMode ? 'sunny' : 'moon'} size={22} color={isDarkMode ? '#FBBF24' : '#6B7280'} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={refreshAll}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Refresh alerts"
          accessibilityHint="Fetches latest node list and backend alerts"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="refresh" size={22} color={isDarkMode ? '#93C5FD' : '#2563EB'} />
        </TouchableOpacity>
      </View>

      {/* Node selector */}
      <View style={dynamic.selector} accessibilityLabel="Node selector">
        <Text style={dynamic.sectionLabel}>Select Node</Text>

        {isLoadingNodes ? (
          <View style={{ paddingVertical: 12 }}>
            <ActivityIndicator accessibilityLabel="Loading nodes" accessibilityRole="progressbar" />
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel="Scrollable list of nodes">
            {nodes.map((node) => {
              const id = safeNodeId(node);
              if (!id) return null;
              const name = node.friendlyName || node.name || id;
              const isSelected = selectedNode === id;

              return (
                <TouchableOpacity
                  key={id}
                  onPress={() => {
                    setSelectedNode(id);
                    log('NODE_TAP_SELECTED', id);
                  }}
                  style={[dynamic.nodeButton, isSelected && dynamic.nodeButtonActive]}
                  accessibilityRole="button"
                  accessibilityLabel={`Select node ${name}`}
                  accessibilityHint={isSelected ? 'Currently selected' : 'Loads alerts and history for this node'}
                  accessibilityState={{ selected: isSelected }}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={[dynamic.nodeButtonText, isSelected && dynamic.nodeButtonTextActive]}>{name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* Quick health card */}
      <View style={dynamic.card} accessible accessibilityLabel={`Node status for ${a11yNodeName}`}>
        <View style={styles.cardHeader}>
          <Ionicons name="information-circle-outline" size={22} color={isDarkMode ? '#60A5FA' : '#2563EB'} />
          <Text style={dynamic.cardTitle}>Node Status</Text>
        </View>

        <View style={styles.row}>
          <Text style={dynamic.smallText}>Node</Text>
          <Text style={dynamic.valueText}>{selectedNodeName}</Text>
        </View>

        <View style={styles.row}>
          <Text style={dynamic.smallText}>Last heartbeat</Text>
          <Text style={dynamic.valueText}>
            {selectedNodeObj?.lastHeartbeat ? new Date(selectedNodeObj.lastHeartbeat).toLocaleString() : 'N/A'}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={dynamic.smallText}>Last seen</Text>
          <Text style={dynamic.valueText}>{formatLastSeen(selectedNodeObj?.lastHeartbeat)}</Text>
        </View>
      </View>

      {/* Active alerts */}
      <View
        style={dynamic.card}
        accessibilityLabel={`Active alerts for ${a11yNodeName}`}
        accessibilityLiveRegion={Platform.OS === 'android' ? 'polite' : undefined}
      >
        <View style={styles.cardHeader}>
          <Ionicons name="warning-outline" size={22} color={isDarkMode ? '#FBBF24' : '#F59E0B'} />
          <Text style={dynamic.cardTitle}>Active Alerts</Text>
        </View>

        {isLoadingAlerts ? (
          <View style={{ paddingVertical: 14 }}>
            <ActivityIndicator accessibilityLabel="Loading alerts" accessibilityRole="progressbar" />
            <Text style={[styles.centerText, dynamic.smallText]}>Checking latest readings…</Text>
          </View>
        ) : activeAlerts.length === 0 ? (
          <Text style={dynamic.smallText}>No active alerts detected for this node.</Text>
        ) : (
          activeAlerts.map((a) => {
            const sev = badgeColors(a.severity, isDarkMode);

            const cardLabel = `${a.severity} ${a.type}. ${a.message}. Created at ${new Date(
              a.createdAt
            ).toLocaleTimeString()}.`;

            return (
              <View
                key={a.id}
                style={[styles.alertCard, { borderColor: sev.border }]}
                accessible
                accessibilityLabel={cardLabel}
              >
                <View style={styles.alertTopRow}>
                  <View style={[styles.badge, { backgroundColor: sev.bg, borderColor: sev.border }]}>
                    <Text style={[styles.badgeText, { color: sev.text }]}>{a.severity}</Text>
                  </View>
                  <Text style={[styles.alertType, dynamic.metaText]}>{a.type}</Text>
                  <Text style={[styles.alertTime, dynamic.metaText]}>{new Date(a.createdAt).toLocaleTimeString()}</Text>
                </View>

                <Text style={[styles.alertMessage, dynamic.bodyText]}>{a.message}</Text>

                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.smallButton, styles.primaryButton]}
                    onPress={() => acknowledgeAlert(a.id)}
                    accessibilityRole="button"
                    accessibilityLabel="Mark alert as attended"
                    accessibilityHint="Sends acknowledge to backend and clears alert on node"
                  >
                    <Text style={styles.smallButtonText}>Mark Attended</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.smallButton, styles.successButton]}
                    onPress={() => resolveAlert(a.id)}
                    accessibilityRole="button"
                    accessibilityLabel="Resolve alert"
                    accessibilityHint="Sends resolve to backend and clears alert on node"
                  >
                    <Text style={styles.smallButtonText}>Resolve</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* Alert log */}
      <View style={dynamic.card} accessibilityLabel={`Alert log for ${a11yNodeName}`}>
        <View style={styles.cardHeader}>
          <Ionicons name="list-outline" size={22} color={isDarkMode ? '#60A5FA' : '#2563EB'} />
          <Text style={dynamic.cardTitle}>Alert Log</Text>
        </View>

        {displayedLog.length === 0 ? (
          <Text style={dynamic.smallText}>No alert history stored for this node yet.</Text>
        ) : (
          displayedLog.slice(0, 40).map((a) => {
            const sev = badgeColors(a.severity, isDarkMode);
            const st = statusChip(a.status, isDarkMode);

            const rowLabel = `Logged alert. ${a.severity}. Status ${a.status}. ${a.type}. ${a.message}.`;

            return (
              <View
                key={a.id}
                style={[styles.logRow, { borderColor: isDarkMode ? '#374151' : '#E5E7EB' }]}
                accessible
                accessibilityLabel={rowLabel}
              >
                <View style={styles.logHeader}>
                  <View style={[styles.badge, { backgroundColor: sev.bg, borderColor: sev.border }]}>
                    <Text style={[styles.badgeText, { color: sev.text }]}>{a.severity}</Text>
                  </View>

                  <View style={[styles.badge, { backgroundColor: st.bg, borderColor: st.border }]}>
                    <Text style={[styles.badgeText, { color: st.text }]}>{a.status}</Text>
                  </View>

                  <Text style={[styles.logMeta, dynamic.metaText]}>{new Date(a.createdAt).toLocaleString()}</Text>
                </View>

                <Text style={[styles.logType, dynamic.metaText]}>{a.type}</Text>
                <Text style={[styles.logMessage, dynamic.bodyText]}>{a.message}</Text>

                <View style={styles.actionRow}>
                  <TouchableOpacity
                    disabled={a.status === 'RESOLVED'}
                    style={[
                      styles.smallButton,
                      styles.primaryButton,
                      { opacity: a.status === 'RESOLVED' ? 0.5 : 1 },
                    ]}
                    onPress={() => acknowledgeAlert(a.id)}
                    accessibilityRole="button"
                    accessibilityLabel="Mark log entry as attended"
                    accessibilityState={{ disabled: a.status === 'RESOLVED' }}
                  >
                    <Text style={styles.smallButtonText}>Attended</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    disabled={a.status === 'RESOLVED'}
                    style={[
                      styles.smallButton,
                      styles.successButton,
                      { opacity: a.status === 'RESOLVED' ? 0.5 : 1 },
                    ]}
                    onPress={() => resolveAlert(a.id)}
                    accessibilityRole="button"
                    accessibilityLabel="Mark log entry as resolved"
                    accessibilityState={{ disabled: a.status === 'RESOLVED' }}
                  >
                    <Text style={styles.smallButtonText}>Resolved</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* Settings */}
      <View style={dynamic.card} accessibilityLabel={`Alert settings for ${a11yNodeName}`}>
        <View style={styles.cardHeader}>
          <Ionicons name="options-outline" size={22} color={isDarkMode ? '#60A5FA' : '#2563EB'} />
          <Text style={dynamic.cardTitle}>Alert Settings</Text>
        </View>

        <Text style={dynamic.sectionLabel}>Enabled Alerts</Text>
        <View style={dynamic.divider} />

        {enabledAlertRows.map((row) => (
          <View key={row.type} style={styles.toggleRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <Ionicons name={row.icon} size={18} color={isDarkMode ? '#93C5FD' : '#2563EB'} />
              <Text style={[styles.toggleLabel, dynamic.bodyText]}>{row.label}</Text>
            </View>
            <Switch
              value={!!settings.enabled[row.type]}
              onValueChange={(v) =>
                setSettings((prev) => ({
                  ...prev,
                  enabled: { ...prev.enabled, [row.type]: v },
                }))
              }
              accessibilityLabel={`Toggle ${row.label}`}
              accessibilityHint="Enables or disables this alert rule"
            />
          </View>
        ))}

        <View style={{ marginTop: 18 }}>
          <Text style={dynamic.sectionLabel}>Critical Actions</Text>
          <View style={dynamic.divider} />

          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, dynamic.bodyText]}>Flash node on critical</Text>
            <Switch
              value={settings.actions.flashOnCritical}
              onValueChange={(v) => setSettings((p) => ({ ...p, actions: { ...p.actions, flashOnCritical: v } }))}
              accessibilityLabel="Toggle flash on critical"
            />
          </View>

          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, dynamic.bodyText]}>Sound node on critical</Text>
            <Switch
              value={settings.actions.soundOnCritical}
              onValueChange={(v) => setSettings((p) => ({ ...p, actions: { ...p.actions, soundOnCritical: v } }))}
              accessibilityLabel="Toggle sound on critical"
            />
          </View>

          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, dynamic.bodyText]}>Enable fan on critical</Text>
            <Switch
              value={settings.actions.fanOnCritical}
              onValueChange={(v) => setSettings((p) => ({ ...p, actions: { ...p.actions, fanOnCritical: v } }))}
              accessibilityLabel="Toggle fan on critical"
            />
          </View>

          <Text style={[styles.hint, dynamic.smallText]}>
            These toggles can be saved to the backend using “Save Settings to Server”.
          </Text>
        </View>

        <View style={{ marginTop: 18 }}>
          <Text style={dynamic.sectionLabel}>System Thresholds</Text>
          <View style={dynamic.divider} />

          <Text style={dynamic.inputLabel}>Heartbeat timeout (seconds)</Text>
          <TextInput
            value={String(settings.heartbeatTimeoutSeconds)}
            keyboardType="numeric"
            style={dynamic.input}
            onChangeText={(t) => {
              const n = clampNum(parseInt(t || '0', 10) || 0, 10, 3600);
              setSettings((p) => ({ ...p, heartbeatTimeoutSeconds: n }));
            }}
            accessibilityLabel="Heartbeat timeout in seconds"
            accessibilityHint="Controls how long without a heartbeat triggers an alert"
          />

          <Text style={dynamic.inputLabel}>Battery low threshold (%)</Text>
          <TextInput
            value={String(settings.batteryLowPercent)}
            keyboardType="numeric"
            style={dynamic.input}
            onChangeText={(t) => {
              const n = clampNum(parseInt(t || '0', 10) || 0, 0, 100);
              setSettings((p) => ({ ...p, batteryLowPercent: n }));
            }}
            accessibilityLabel="Battery low threshold percentage"
            accessibilityHint="Controls when battery low triggers an alert"
          />

          <Text style={dynamic.inputLabel}>Maximum people per room</Text>
          <TextInput
            value={String(settings.maxPeoplePerRoom)}
            keyboardType="numeric"
            style={dynamic.input}
            onChangeText={(t) => {
              const n = clampNum(parseInt(t || '0', 10) || 0, 0, 999);
              setSettings((p) => ({ ...p, maxPeoplePerRoom: n }));
            }}
            accessibilityLabel="Maximum people per room"
            accessibilityHint="Controls occupancy limit used by the backend ROOM_LIMIT alert"
          />
        </View>

        {/* Save settings to backend */}
        <TouchableOpacity
          onPress={postBackendSettings}
          style={[styles.saveServerButton]}
          accessibilityRole="button"
          accessibilityLabel="Save settings to server"
          accessibilityHint="Sends alert settings to backend so they persist and affect node alerting"
        >
          <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" />
          <Text style={styles.saveServerButtonText}>Save Settings to Server</Text>
        </TouchableOpacity>

        {/* Clear alerts */}
        <TouchableOpacity
          onPress={clearBackendAlerts}
          style={[styles.clearButton]}
          accessibilityRole="button"
          accessibilityLabel="Clear alerts"
          accessibilityHint="Clears backend alert list for this node"
        >
          <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
          <Text style={styles.clearButtonText}>Clear Alerts</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// Styles
const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    borderBottomWidth: 1,
  },
  title: { fontSize: 24, fontWeight: 'bold' },
  subtitle: { fontSize: 14, marginTop: 4 },

  iconButton: {
    padding: 10,
    marginLeft: 6,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  selector: { padding: 20, borderBottomWidth: 1 },
  sectionLabel: { fontSize: 14, fontWeight: '700', marginBottom: 10 },

  nodeButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 2,
    marginRight: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  nodeButtonActive: {},
  nodeButtonText: { fontSize: 14, fontWeight: '600' },
  nodeButtonTextActive: {},

  card: {
    margin: 20,
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  cardTitle: { fontSize: 18, fontWeight: '700' },
  smallText: { fontSize: 13 },

  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  valueText: { fontSize: 14, fontWeight: '700' },

  divider: { height: 1, width: '100%', marginTop: 6 },

  alertCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  alertTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alertType: { fontSize: 12, fontWeight: '800' },
  alertTime: { marginLeft: 'auto', fontSize: 12 },
  alertMessage: { marginTop: 8, fontSize: 14, fontWeight: '700' },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeText: { fontSize: 12, fontWeight: '800' },

  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  smallButton: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    minHeight: 44,
  },
  primaryButton: { backgroundColor: '#1D4ED8' },
  successButton: { backgroundColor: '#047857' },
  smallButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },

  hint: { marginTop: 8, fontSize: 12, lineHeight: 16 },

  logRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  logHeader: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  logMeta: { marginLeft: 'auto', fontSize: 12 },
  logType: { marginTop: 8, fontSize: 12, fontWeight: '900' },
  logMessage: { marginTop: 4, fontSize: 14, fontWeight: '700' },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  toggleLabel: { fontSize: 14, fontWeight: '600' },

  inputLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    minHeight: 44,
  },

  saveServerButton: {
    marginTop: 18,
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 44,
  },
  saveServerButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },

  clearButton: {
    marginTop: 12,
    backgroundColor: '#B91C1C',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 44,
  },
  clearButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },

  centerText: { textAlign: 'center', marginTop: 10 },
});