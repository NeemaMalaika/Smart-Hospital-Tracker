import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
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
  CURRENT_SENSORS: '/sensors/current',
  THRESHOLDS: '/sensors/thresholds',
};

const getAuthHeaders = () => ({
  'Content-Type': 'application/json',
  'API-KEY': '49643a60-0aff-4a88-8e65-30ea428df8ee',
});

type NodeSummary = {
  id?: string;
  nodeId?: string;
  uuid?: string;
  friendlyName?: string;
  name?: string;
  type?: string;
  battery?: number;
  lastHeartbeat?: number;
};

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
  | 'OCCUPANCY_HIGH';

type AlertLogItem = {
  id: string;
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
};

type ThresholdResponse = {
  thresholds?: Record<string, SensorThreshold>;
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

function badgeColors(severity: Severity, isDark: boolean) {
  if (severity === 'CRITICAL') {
    return {
      bg: isDark ? '#913316ff' : '#feeae2ff',
      text: isDark ? '#f89571ff' : '#dc6626ff',
      border: isDark ? '#f89571ff' : '#dc6626ff',
    };
  }
  return {
    bg: isDark ? '#78350F' : '#FEF3C7',
    text: isDark ? '#FBBF24' : '#F59E0B',
    border: isDark ? '#FBBF24' : '#F59E0B',
  };
}

function statusChip(status: AlertStatus, isDark: boolean) {
  if (status === 'RESOLVED') {
    return {
      bg: isDark ? '#064E3B' : '#D1FAE5',
      text: isDark ? '#34D399' : '#059669',
      border: isDark ? '#10B981' : '#059669',
    };
  }
  if (status === 'ATTENDED') {
    return {
      bg: isDark ? '#1E3A8A' : '#DBEAFE',
      text: isDark ? '#93C5FD' : '#2563EB',
      border: isDark ? '#60A5FA' : '#2563EB',
    };
  }
  return {
    bg: isDark ? '#374151' : '#F3F4F6',
    text: isDark ? '#D1D5DB' : '#6B7280',
    border: isDark ? '#4B5563' : '#D1D5DB',
  };
}

function makeId() {
  return `alert_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function clampNum(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export default function AlertsScreen() {
  const router = useRouter();

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [nodes, setNodes] = useState<NodeSummary[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [isLoadingNodes, setIsLoadingNodes] = useState(true);
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(false);
  const [settings, setSettings] = useState<AlertSettings>(DEFAULT_SETTINGS);
  const [alertLog, setAlertLog] = useState<AlertLogItem[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<AlertLogItem[]>([]);
  const [currentSensors, setCurrentSensors] = useState<CurrentSensorsResponse | null>(null);
  const [thresholds, setThresholds] = useState<Record<string, SensorThreshold>>({});

  // -------------------- Auth + Theme --------------------
  useEffect(() => {
    (async () => {
      try {
        const isAuth = await AsyncStorage.getItem('isAuthenticated');
        if (!isAuth) router.replace('/login');
      } catch {
        router.replace('/login');
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const savedTheme = await AsyncStorage.getItem('isDarkMode');
        if (savedTheme !== null) setIsDarkMode(savedTheme === 'true');
      } catch {}
    })();
  }, []);

  const toggleDarkMode = async () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    try {
      await AsyncStorage.setItem('isDarkMode', String(newMode));
    } catch {}
  };

  // -------------------- Node Fetch --------------------
  const fetchNodes = async () => {
    setIsLoadingNodes(true);
    try {
      const res = await fetch(`${API_BASE_URL}${API_ENDPOINTS.NODES}`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(`Failed to fetch nodes: ${res.statusText}`);
      const data = await res.json();
      const list: NodeSummary[] = Array.isArray(data) ? data : data.nodes || [];
      setNodes(list);

      if (!selectedNode && list.length > 0) {
        const first = safeNodeId(list[0]);
        if (first) setSelectedNode(first);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not fetch nodes');
    } finally {
      setIsLoadingNodes(false);
    }
  };
  useEffect(() => { fetchNodes(); }, []);

  const selectedNodeObj = useMemo(() => nodes.find((n) => safeNodeId(n) === selectedNode) || null, [nodes, selectedNode]);
  const selectedNodeName = selectedNodeObj?.friendlyName || selectedNodeObj?.name || selectedNode || 'Unknown Node';

  // -------------------- Storage Keys --------------------
  const storageKeys = useMemo(() => {
    if (!selectedNode) return { settingsKey: null, logKey: null, lastHashKey: null };
    return {
      settingsKey: `alertSettings:${selectedNode}`,
      logKey: `alertLog:${selectedNode}`,
      lastHashKey: `alertLastHash:${selectedNode}`,
    };
  }, [selectedNode]);

  const loadStored = async () => {
    if (!selectedNode || !storageKeys.settingsKey || !storageKeys.logKey) return;
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
      } else setSettings(DEFAULT_SETTINGS);

      if (lRaw) {
        const parsedLog: AlertLogItem[] = JSON.parse(lRaw);
        setAlertLog(Array.isArray(parsedLog) ? parsedLog : []);
      } else setAlertLog([]);
    } catch {
      setSettings(DEFAULT_SETTINGS);
      setAlertLog([]);
    }
  };
  useEffect(() => { if (selectedNode) loadStored(); }, [selectedNode]);

  const persistSettings = async (next: AlertSettings) => { if (storageKeys.settingsKey) await AsyncStorage.setItem(storageKeys.settingsKey, JSON.stringify(next)); };
  const persistLog = async (nextLog: AlertLogItem[]) => { if (storageKeys.logKey) await AsyncStorage.setItem(storageKeys.logKey, JSON.stringify(nextLog)); };

  // -------------------- Fetch Sensors + Thresholds --------------------
  const fetchCurrentAndThresholds = async () => {
    if (!selectedNode) return;
    try {
      const [currentRes, thresholdRes] = await Promise.all([
        fetch(`${API_BASE_URL}${API_ENDPOINTS.CURRENT_SENSORS}?nodeId=${encodeURIComponent(selectedNode)}`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}${API_ENDPOINTS.THRESHOLDS}?nodeId=${encodeURIComponent(selectedNode)}`, { headers: getAuthHeaders() }),
      ]);

      if (currentRes.status === 204) setCurrentSensors(null);
      else if (currentRes.ok) setCurrentSensors(await currentRes.json());

      if (thresholdRes.ok) {
        const parsed: ThresholdResponse = JSON.parse(await thresholdRes.text());
        setThresholds(parsed.thresholds || {});
      }
    } catch {}
  };

  // -------------------- Compute Active Alerts --------------------
  const computeAlerts = async () => {
    if (!selectedNode) return;
    const now = Date.now();
    const nextActive: AlertLogItem[] = [];

    // Heartbeat missed
    const lastHeartbeat = selectedNodeObj?.lastHeartbeat;
    if (settings.enabled.HEARTBEAT_MISSED && lastHeartbeat) {
      const diffSec = (now - lastHeartbeat) / 1000;
      if (diffSec > settings.heartbeatTimeoutSeconds) {
        nextActive.push({
          id: makeId(),
          nodeId: selectedNode,
          nodeName: selectedNodeName,
          type: 'HEARTBEAT_MISSED',
          severity: 'CRITICAL',
          status: 'ACTIVE',
          message: `No heartbeat for ${Math.floor(diffSec)}s (timeout ${settings.heartbeatTimeoutSeconds}s)`,
          value: Math.floor(diffSec),
          createdAt: now,
        });
      }
    }

    // Battery low
    const battery = selectedNodeObj?.battery;
    if (settings.enabled.BATTERY_LOW && typeof battery === 'number') {
      nextActive.push({
        id: makeId(),
        nodeId: selectedNode,
        nodeName: selectedNodeName,
        type: 'BATTERY_LOW',
        severity: battery <= Math.max(5, Math.floor(settings.batteryLowPercent / 2)) ? 'CRITICAL' : 'WARNING',
        status: 'ACTIVE',
        message: `Battery low: ${battery}% (threshold ${settings.batteryLowPercent}%)`,
        value: battery,
        createdAt: now,
      });
    }

    // Sensor thresholds
    const checkNumeric = (type: AlertType, key: string, label: string) => {
      if (!currentSensors || !thresholds[key]) return;
      const value = parseFloat(currentSensors[key]);
      if (Number.isNaN(value)) return;
      const t = thresholds[key];
      if (value > t.critical) nextActive.push({ id: makeId(), nodeId: selectedNode, nodeName: selectedNodeName, type, severity: 'CRITICAL', status: 'ACTIVE', message: `${label} critical: ${value} (critical > ${t.critical})`, value, createdAt: now });
      else if (value > t.max) nextActive.push({ id: makeId(), nodeId: selectedNode, nodeName: selectedNodeName, type, severity: 'WARNING', status: 'ACTIVE', message: `${label} high: ${value} (max ${t.max})`, value, createdAt: now });
      else if (value < t.min) nextActive.push({ id: makeId(), nodeId: selectedNode, nodeName: selectedNodeName, type, severity: 'WARNING', status: 'ACTIVE', message: `${label} low: ${value} (min ${t.min})`, value, createdAt: now });
    };

    if (settings.enabled.TEMPERATURE) checkNumeric('TEMPERATURE', 'temperature', 'Temperature');
    if (settings.enabled.HUMIDITY) checkNumeric('HUMIDITY', 'humidity', 'Humidity');
    if (settings.enabled.PRESSURE) checkNumeric('PRESSURE', 'pressure', 'Pressure');
    if (settings.enabled.NOISE) checkNumeric('NOISE', 'noiseLevel', 'Noise level');
    if (settings.enabled.LIGHT) (['lightClear', 'lightRed', 'lightGreen', 'lightBlue'] as const).forEach((k) => checkNumeric('LIGHT', k, `Light (${k.replace('light', '') || 'Clear'})`));

    setActiveAlerts(nextActive);

    // Update log
    if (!storageKeys.lastHashKey) return;
    const hash = nextActive.map((a) => `${a.type}:${a.severity}:${a.message}`).sort().join('|');
    const lastHash = await AsyncStorage.getItem(storageKeys.lastHashKey);
    if (hash && hash !== lastHash) {
      await AsyncStorage.setItem(storageKeys.lastHashKey, hash);
      const merged = [...nextActive, ...alertLog].slice(0, 200);
      setAlertLog(merged);
      await persistLog(merged);
    }
  };

  const refreshAll = async () => {
    if (!selectedNode) return;
    setIsLoadingAlerts(true);
    try {
      await fetchNodes();
      await fetchCurrentAndThresholds();
      await computeAlerts();
    } finally { setIsLoadingAlerts(false); }
  };

  useEffect(() => { if (selectedNode) refreshAll(); }, [selectedNode]);
  useEffect(() => { if (selectedNode) { computeAlerts(); persistSettings(settings); } }, [settings]);

  const updateAlertStatus = async (alertId: string, status: AlertStatus) => {
    const next = alertLog.map((a) => (a.id === alertId ? { ...a, status } : a));
    setAlertLog(next);
    await persistLog(next);
  };

  // -------------------- UI dynamic styles --------------------
  const dynamic = {
    container: { ...styles.container, backgroundColor: isDarkMode ? '#111827' : '#F9FAFB' },
    header: { ...styles.header, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderBottomColor: isDarkMode ? '#374151' : '#E5E7EB' },
    title: { ...styles.title, color: isDarkMode ? '#F9FAFB' : '#111827' },
    subtitle: { ...styles.subtitle, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    sectionLabel: { ...styles.sectionLabel, color: isDarkMode ? '#D1D5DB' : '#374151' },
    selector: { ...styles.selector, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderBottomColor: isDarkMode ? '#374151' : '#E5E7EB' },
    nodeButton: { ...styles.nodeButton, backgroundColor: isDarkMode ? '#374151' : '#FFFFFF', borderColor: isDarkMode ? '#4B5563' : '#D1D5DB' },
    nodeButtonActive: { ...styles.nodeButtonActive, backgroundColor: isDarkMode ? '#1E3A8A' : '#EFF6FF', borderColor: isDarkMode ? '#3B82F6' : '#2563EB' },
    nodeButtonText: { ...styles.nodeButtonText, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    nodeButtonTextActive: { ...styles.nodeButtonTextActive, color: isDarkMode ? '#93C5FD' : '#2563EB' },
    card: { ...styles.card, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderColor: isDarkMode ? '#374151' : '#E5E7EB' },
    cardTitle: { ...styles.cardTitle, color: isDarkMode ? '#F9FAFB' : '#111827' },
    smallText: { ...styles.smallText, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    input: { ...styles.input, backgroundColor: isDarkMode ? '#111827' : '#FFFFFF', borderColor: isDarkMode ? '#374151' : '#D1D5DB', color: isDarkMode ? '#F9FAFB' : '#111827' },
    inputLabel: { ...styles.inputLabel, color: isDarkMode ? '#D1D5DB' : '#374151' },
    divider: { ...styles.divider, backgroundColor: isDarkMode ? '#374151' : '#E5E7EB' },
  };

  // -------------------- Render helpers --------------------
  const enabledAlertRows: { type: AlertType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { type: 'TEMPERATURE', label: 'Temperature out of range', icon: 'thermometer' },
    { type: 'HUMIDITY', label: 'Humidity out of range', icon: 'water' },
    { type: 'NOISE', label: 'Noise too high', icon: 'volume-high' },
    { type: 'BATTERY_LOW', label: 'Battery low', icon: 'battery-dead-outline' },
    { type: 'HEARTBEAT_MISSED', label: 'Heartbeat missed', icon: 'pulse' },
    { type: 'OCCUPANCY_HIGH', label: 'Occupancy too high', icon: 'people' },
    { type: 'PRESSURE', label: 'Pressure out of range', icon: 'speedometer' },
    { type: 'LIGHT', label: 'Light out of range', icon: 'bulb' },
  ];

  const displayedLog = useMemo(() => {
    // newest first
    return [...alertLog].sort((a, b) => b.createdAt - a.createdAt);
  }, [alertLog]);

  return (
    <ScrollView style={dynamic.container}>
      {/* Header */}
      <View style={dynamic.header}>
        <View style={{ flex: 1 }}>
          <Text style={dynamic.title}>Alerts</Text>
          <Text style={dynamic.subtitle}>Warnings, history, and alert settings</Text>
        </View>

        <TouchableOpacity onPress={toggleDarkMode} style={styles.iconButton}>
          <Ionicons name={isDarkMode ? 'sunny' : 'moon'} size={22} color={isDarkMode ? '#FBBF24' : '#6B7280'} />
        </TouchableOpacity>

        <TouchableOpacity onPress={refreshAll} style={styles.iconButton}>
          <Ionicons name="refresh" size={22} color={isDarkMode ? '#93C5FD' : '#2563EB'} />
        </TouchableOpacity>
      </View>

      {/* Node selector */}
      <View style={dynamic.selector}>
        <Text style={dynamic.sectionLabel}>Select Node</Text>

        {isLoadingNodes ? (
          <View style={{ paddingVertical: 12 }}>
            <ActivityIndicator />
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {nodes.map((node) => {
              const id = safeNodeId(node);
              if (!id) return null;
              const name = node.friendlyName || node.name || id;
              const isSelected = selectedNode === id;

              return (
                <TouchableOpacity
                  key={id}
                  onPress={() => setSelectedNode(id)}
                  style={[dynamic.nodeButton, isSelected && dynamic.nodeButtonActive]}
                >
                  <Text style={[dynamic.nodeButtonText, isSelected && dynamic.nodeButtonTextActive]}>
                    {name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* Quick health card */}
      <View style={dynamic.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="information-circle-outline" size={22} color={isDarkMode ? '#60A5FA' : '#2563EB'} />
          <Text style={dynamic.cardTitle}>Node Status</Text>
        </View>

        <View style={styles.row}>
          <Text style={dynamic.smallText}>Node</Text>
          <Text style={styles.valueText}>{selectedNodeName}</Text>
        </View>

        <View style={styles.row}>
          <Text style={dynamic.smallText}>Last heartbeat</Text>
          <Text style={styles.valueText}>
            {selectedNodeObj?.lastHeartbeat ? new Date(selectedNodeObj.lastHeartbeat).toLocaleString() : 'N/A'}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={dynamic.smallText}>Last seen</Text>
          <Text style={styles.valueText}>{formatLastSeen(selectedNodeObj?.lastHeartbeat)}</Text>
        </View>
      </View>

      {/* Active alerts */}
      <View style={dynamic.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="warning-outline" size={22} color={isDarkMode ? '#FBBF24' : '#F59E0B'} />
          <Text style={dynamic.cardTitle}>Active Alerts</Text>
        </View>

        {isLoadingAlerts ? (
          <View style={{ paddingVertical: 14 }}>
            <ActivityIndicator />
            <Text style={[styles.centerText, dynamic.smallText]}>Checking latest readings…</Text>
          </View>
        ) : activeAlerts.length === 0 ? (
          <Text style={dynamic.smallText}>No active alerts detected for this node.</Text>
        ) : (
          activeAlerts.map((a) => {
            const sev = badgeColors(a.severity, isDarkMode);
            return (
              <View key={a.id} style={[styles.alertCard, { borderColor: sev.border }]}>
                <View style={styles.alertTopRow}>
                  <View style={[styles.badge, { backgroundColor: sev.bg, borderColor: sev.border }]}>
                    <Text style={[styles.badgeText, { color: sev.text }]}>{a.severity}</Text>
                  </View>
                  <Text style={styles.alertType}>{a.type}</Text>
                  <Text style={styles.alertTime}>{new Date(a.createdAt).toLocaleTimeString()}</Text>
                </View>
                <Text style={styles.alertMessage}>{a.message}</Text>

                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.smallButton, { backgroundColor: '#2563EB' }]}
                    onPress={() => {
                      // Mark the latest matching item in log as attended (if exists)
                      const match = displayedLog.find((x) => x.type === a.type && x.message === a.message);
                      if (match) updateAlertStatus(match.id, 'ATTENDED');
                    }}
                  >
                    <Text style={styles.smallButtonText}>Mark Attended</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.smallButton, { backgroundColor: '#059669' }]}
                    onPress={() => {
                      const match = displayedLog.find((x) => x.type === a.type && x.message === a.message);
                      if (match) updateAlertStatus(match.id, 'RESOLVED');
                    }}
                  >
                    <Text style={styles.smallButtonText}>Resolve</Text>
                  </TouchableOpacity>
                </View>

                {a.severity === 'CRITICAL' && (
                  <Text style={[styles.hint, dynamic.smallText]}>
                    Critical actions enabled: {settings.actions.flashOnCritical ? 'Flash ' : ''}
                    {settings.actions.soundOnCritical ? 'Sound ' : ''}
                    {settings.actions.fanOnCritical ? 'Fan ' : ''}
                    {!settings.actions.flashOnCritical && !settings.actions.soundOnCritical && !settings.actions.fanOnCritical ? 'None' : ''}
                  </Text>
                )}
              </View>
            );
          })
        )}
      </View>

      {/* Alert log */}
      <View style={dynamic.card}>
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
            return (
              <View key={a.id} style={[styles.logRow, { borderColor: isDarkMode ? '#374151' : '#E5E7EB' }]}>
                <View style={styles.logHeader}>
                  <View style={[styles.badge, { backgroundColor: sev.bg, borderColor: sev.border }]}>
                    <Text style={[styles.badgeText, { color: sev.text }]}>{a.severity}</Text>
                  </View>

                  <View style={[styles.badge, { backgroundColor: st.bg, borderColor: st.border }]}>
                    <Text style={[styles.badgeText, { color: st.text }]}>{a.status}</Text>
                  </View>

                  <Text style={styles.logMeta}>{new Date(a.createdAt).toLocaleString()}</Text>
                </View>

                <Text style={styles.logType}>{a.type}</Text>
                <Text style={styles.logMessage}>{a.message}</Text>

                <View style={styles.actionRow}>
                  <TouchableOpacity
                    disabled={a.status === 'RESOLVED'}
                    style={[styles.smallButton, { backgroundColor: '#2563EB', opacity: a.status === 'RESOLVED' ? 0.5 : 1 }]}
                    onPress={() => updateAlertStatus(a.id, 'ATTENDED')}
                  >
                    <Text style={styles.smallButtonText}>Attended</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    disabled={a.status === 'RESOLVED'}
                    style={[styles.smallButton, { backgroundColor: '#059669', opacity: a.status === 'RESOLVED' ? 0.5 : 1 }]}
                    onPress={() => updateAlertStatus(a.id, 'RESOLVED')}
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
      <View style={dynamic.card}>
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
              <Text style={[styles.toggleLabel, { color: isDarkMode ? '#F9FAFB' : '#111827' }]}>{row.label}</Text>
            </View>
            <Switch
              value={!!settings.enabled[row.type]}
              onValueChange={(v) =>
                setSettings((prev) => ({
                  ...prev,
                  enabled: { ...prev.enabled, [row.type]: v },
                }))
              }
            />
          </View>
        ))}

        <View style={{ marginTop: 18 }}>
          <Text style={dynamic.sectionLabel}>Critical Actions</Text>
          <View style={dynamic.divider} />

          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { color: isDarkMode ? '#F9FAFB' : '#111827' }]}>Flash node on critical</Text>
            <Switch
              value={settings.actions.flashOnCritical}
              onValueChange={(v) => setSettings((p) => ({ ...p, actions: { ...p.actions, flashOnCritical: v } }))}
            />
          </View>

          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { color: isDarkMode ? '#F9FAFB' : '#111827' }]}>Sound node on critical</Text>
            <Switch
              value={settings.actions.soundOnCritical}
              onValueChange={(v) => setSettings((p) => ({ ...p, actions: { ...p.actions, soundOnCritical: v } }))}
            />
          </View>

          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { color: isDarkMode ? '#F9FAFB' : '#111827' }]}>Enable fan on critical</Text>
            <Switch
              value={settings.actions.fanOnCritical}
              onValueChange={(v) => setSettings((p) => ({ ...p, actions: { ...p.actions, fanOnCritical: v } }))}
            />
          </View>

          <Text style={[styles.hint, dynamic.smallText]}>
            These toggles are ready for backend integration (e.g., pushing actions to the node on critical conditions).
          </Text>
        </View>

        <View style={{ marginTop: 18 }}>
          <Text style={dynamic.sectionLabel}>Room Limits</Text>
          <View style={dynamic.divider} />

          <Text style={dynamic.inputLabel}>Maximum people per room</Text>
          <TextInput
            value={String(settings.maxPeoplePerRoom)}
            keyboardType="numeric"
            style={dynamic.input}
            onChangeText={(t) => {
              const n = clampNum(parseInt(t || '0', 10) || 0, 0, 999);
              setSettings((p) => ({ ...p, maxPeoplePerRoom: n }));
            }}
          />

          <Text style={[styles.hint, dynamic.smallText]}>
            Occupancy alert will activate once backend provides occupancy readings (or once you confirm the sensor key).
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
          />
        </View>

        <TouchableOpacity
          onPress={async () => {
            if (!selectedNode) return;
            setAlertLog([]);
            setActiveAlerts([]);
            try {
              if (storageKeys.logKey) await AsyncStorage.removeItem(storageKeys.logKey);
              if (storageKeys.lastHashKey) await AsyncStorage.removeItem(storageKeys.lastHashKey);
            } catch {}
            Alert.alert('Cleared', 'Alert log cleared for this node.');
          }}
          style={[styles.clearButton]}
        >
          <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
          <Text style={styles.clearButtonText}>Clear Alert Log</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

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

  iconButton: { padding: 8, marginLeft: 6 },

  selector: { padding: 20, borderBottomWidth: 1 },
  sectionLabel: { fontSize: 14, fontWeight: '700', marginBottom: 10 },

  nodeButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
    marginRight: 12,
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
  valueText: { fontSize: 14, fontWeight: '600' },

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
  alertType: { fontSize: 12, fontWeight: '800', color: '#6B7280' },
  alertTime: { marginLeft: 'auto', fontSize: 12, color: '#6B7280' },
  alertMessage: { marginTop: 8, fontSize: 14, fontWeight: '600', color: '#111827' },

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
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  smallButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },

  hint: { marginTop: 8, fontSize: 12, lineHeight: 16 },

  logRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  logHeader: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  logMeta: { marginLeft: 'auto', fontSize: 12, color: '#6B7280' },
  logType: { marginTop: 8, fontSize: 12, fontWeight: '900', color: '#6B7280' },
  logMessage: { marginTop: 4, fontSize: 14, fontWeight: '600', color: '#111827' },

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
    paddingVertical: 10,
    fontSize: 14,
  },

  clearButton: {
    marginTop: 18,
    backgroundColor: '#DC2626',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  clearButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },

  centerText: { textAlign: 'center', marginTop: 10 },
});


