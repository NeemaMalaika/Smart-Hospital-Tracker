import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

const getHeaders = () => ({
  'Content-Type': 'application/json',
  'API-KEY': '49643a60-0aff-4a88-8e65-30ea428df8ee',
});

/* ------------------ Types (MATCH BACKEND) ------------------ */

type AlertType =
  | 'TEMPERATURE'
  | 'HUMIDITY'
  | 'NOISE'
  | 'PRESSURE'
  | 'LIGHT'
  | 'BATTERY'
  | 'HEARTBEAT'
  | 'ROOM_LIMIT';

type AlertLevel = 'WARNING' | 'CRITICAL';

type BackendAlert = {
  alertId: string;
  alertType: AlertType;
  alertLevel: AlertLevel;
  alertedAt: number;
  acknowledged: boolean;
  resolved: boolean;
};

type AlertSettings = {
  // NOTE: backend uses enabledAlerts (List<AlertType>)
  enabledAlerts: AlertType[];

  flashOnCritical: boolean;
  soundOnCritical: boolean;
  fanOnCritical: boolean;

  maxPeopleAllowedInRoom: number;
  heartbeatTimeout: number; // backend uses long ms
  batteryLowThreshold: number; // backend uses long threshold
};

type NodeSummary = {
  id: string;
  friendlyName?: string;
  type?: string;
  lastHeartbeat?: number;
};

type AlertsMapResponse = Record<string, BackendAlert[]>;

/*  UI helpers  */

const ALL_ALERTS: { type: AlertType; label: string; icon: any }[] = [
  { type: 'TEMPERATURE', label: 'Temperature', icon: 'thermometer' },
  { type: 'HUMIDITY', label: 'Humidity', icon: 'water' },
  { type: 'NOISE', label: 'Noise', icon: 'volume-high' },
  { type: 'PRESSURE', label: 'Pressure', icon: 'speedometer' },
  { type: 'LIGHT', label: 'Light', icon: 'bulb' },
  { type: 'BATTERY', label: 'Battery low', icon: 'battery-dead-outline' },
  { type: 'HEARTBEAT', label: 'Heartbeat missed', icon: 'pulse' },
  { type: 'ROOM_LIMIT', label: 'Room occupancy limit', icon: 'people' },
];

function flattenAlertsMap(map: AlertsMapResponse | any): BackendAlert[] {
  if (!map || typeof map !== 'object') return [];
  const out: BackendAlert[] = [];
  for (const key of Object.keys(map)) {
    const arr = map[key];
    if (Array.isArray(arr)) {
      for (const a of arr) {
        // ensure alertType exists (backend gives it)
        out.push(a);
      }
    }
  }
  // newest first
  return out.sort((a, b) => (b.alertedAt || 0) - (a.alertedAt || 0));
}

export default function AlertsScreen() {
  const [nodes, setNodes] = useState<NodeSummary[]>([]);
  const [nodeId, setNodeId] = useState<string | null>(null);

  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const [alerts, setAlerts] = useState<BackendAlert[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const selectedNodeObj = useMemo(
    () => nodes.find((n) => n.id === nodeId) || null,
    [nodes, nodeId]
  );

  const selectedNodeName =
    selectedNodeObj?.friendlyName || selectedNodeObj?.id || 'No node selected';

  /* -------------------- Fetch Nodes + restore selection -------------------- */

  const fetchNodes = async (): Promise<NodeSummary[]> => {
    const res = await fetch(`${API_BASE_URL}/node/list`, {
      headers: getHeaders(),
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`node/list failed (${res.status}): ${t}`);
    }

    const data = await res.json();
    // backend seems to return an array directly
    const list: NodeSummary[] = Array.isArray(data) ? data : (data?.nodes ?? []);
    return list;
  };

  const ensureNodeSelected = async (fetchedNodes: NodeSummary[]) => {
    // 1) try AsyncStorage
    const stored = await AsyncStorage.getItem('selectedNodeId');

    // if stored exists and is in list, use it
    if (stored && fetchedNodes.some((n) => n.id === stored)) {
      setNodeId(stored);
      return;
    }

    // 2) else pick first node (prefer ROOM_NODE if exists)
    const roomNode =
      fetchedNodes.find((n) => n.type === 'ROOM_NODE') || fetchedNodes[0];

    if (roomNode?.id) {
      setNodeId(roomNode.id);
      await AsyncStorage.setItem('selectedNodeId', roomNode.id);
      return;
    }

    // 3) no nodes available
    setNodeId(null);
  };

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const list = await fetchNodes();
        setNodes(list);
        await ensureNodeSelected(list);
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Failed to load nodes');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* -------------------- Fetch Settings + Alerts for selected node -------------------- */

  const loadAlertData = async (targetNodeId: string) => {
    const [settingsRes, alertsRes] = await Promise.all([
      fetch(`${API_BASE_URL}/alerts/settings?nodeId=${encodeURIComponent(targetNodeId)}`, {
        headers: getHeaders(),
      }),
      fetch(`${API_BASE_URL}/alerts/list?nodeId=${encodeURIComponent(targetNodeId)}`, {
        headers: getHeaders(),
      }),
    ]);

    if (!settingsRes.ok) {
      const t = await settingsRes.text();
      throw new Error(`/alerts/settings failed (${settingsRes.status}): ${t}`);
    }
    if (!alertsRes.ok) {
      const t = await alertsRes.text();
      throw new Error(`/alerts/list failed (${alertsRes.status}): ${t}`);
    }

    // settings is a plain object (AlertSettings)
    const s: AlertSettings = await settingsRes.json();

    // alerts is a MAP (AlertType -> list)
    const rawAlerts = await alertsRes.json();
    const flat = flattenAlertsMap(rawAlerts);

    setSettings(s);
    setAlerts(flat);
  };

  useEffect(() => {
    if (!nodeId) {
      // stop spinner if no node is selected
      setSettings(null);
      setAlerts([]);
      return;
    }

    (async () => {
      try {
        setLoading(true);
        await loadAlertData(nodeId);
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Failed to load alert data');
      } finally {
        setLoading(false);
      }
    })();
  }, [nodeId]);

  const onSelectNode = async (id: string) => {
    setNodeId(id);
    await AsyncStorage.setItem('selectedNodeId', id);
  };

  const refresh = async () => {
    if (!nodeId) return;
    try {
      setRefreshing(true);
      // refresh nodes (names, etc.)
      const list = await fetchNodes();
      setNodes(list);

      // keep selection if still exists
      if (!list.some((n) => n.id === nodeId)) {
        await ensureNodeSelected(list);
        return;
      }

      await loadAlertData(nodeId);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to refresh');
    } finally {
      setRefreshing(false);
    }
  };

  /* -------------------- Actions -------------------- */

  const saveSettings = async () => {
    if (!settings || !nodeId) return;

    const res = await fetch(`${API_BASE_URL}/alerts/settings?nodeId=${encodeURIComponent(nodeId)}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(settings),
    });

    if (!res.ok) {
      const t = await res.text();
      Alert.alert('Error', `Failed to save settings (${res.status}): ${t}`);
      return;
    }

    Alert.alert('Saved', 'Alert settings updated');
    // optional: reload after save
    await refresh();
  };

  const resolveAlert = async (alertId: string) => {
    if (!nodeId) return;
    const res = await fetch(
      `${API_BASE_URL}/alerts/resolve?nodeId=${encodeURIComponent(nodeId)}&alertId=${encodeURIComponent(alertId)}`,
      { method: 'POST', headers: getHeaders() }
    );

    if (!res.ok) {
      const t = await res.text();
      Alert.alert('Error', `Resolve failed (${res.status}): ${t}`);
      return;
    }

    setAlerts((a) =>
      a.map((x) => (x.alertId === alertId ? { ...x, resolved: true } : x))
    );
  };

  const acknowledgeAlert = async (alertId: string) => {
    if (!nodeId) return;
    const res = await fetch(
      `${API_BASE_URL}/alerts/acknowledge?nodeId=${encodeURIComponent(nodeId)}&alertId=${encodeURIComponent(alertId)}`,
      { method: 'POST', headers: getHeaders() }
    );

    if (!res.ok) {
      const t = await res.text();
      Alert.alert('Error', `Acknowledge failed (${res.status}): ${t}`);
      return;
    }

    setAlerts((a) =>
      a.map((x) => (x.alertId === alertId ? { ...x, acknowledged: true } : x))
    );
  };

  /* -------------------- Render -------------------- */

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.muted}>Loading alerts…</Text>
      </View>
    );
  }

  if (!nodeId) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Alerts</Text>
        <Text style={styles.muted}>No nodes available. Check backend /node/list.</Text>
        <TouchableOpacity style={styles.save} onPress={refresh}>
          <Text style={styles.saveText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!settings) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Alerts</Text>
        <Text style={styles.muted}>Couldn’t load settings for node.</Text>
        <TouchableOpacity style={styles.save} onPress={refresh}>
          <Text style={styles.saveText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const active = alerts.filter((a) => !a.resolved);

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Alerts</Text>
        <TouchableOpacity
          onPress={refresh}
          style={[styles.iconButton, refreshing && { opacity: 0.6 }]}
          disabled={refreshing}
        >
          <Ionicons name="refresh" size={22} color="#2563EB" />
        </TouchableOpacity>
      </View>

      <Text style={styles.muted}>Selected node: {selectedNodeName}</Text>

      {/* Node selector */}
      <Text style={styles.section}>Select Node</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
        {nodes.map((n) => {
          const isSelected = n.id === nodeId;
          const label = n.friendlyName || n.id.slice(0, 8);
          return (
            <TouchableOpacity
              key={n.id}
              onPress={() => onSelectNode(n.id)}
              style={[
                styles.nodeChip,
                isSelected && styles.nodeChipActive,
              ]}
            >
              <Text style={[styles.nodeChipText, isSelected && styles.nodeChipTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Active Alerts */}
      <Text style={styles.section}>Active Alerts</Text>
      {active.length === 0 ? (
        <Text style={styles.muted}>No active alerts</Text>
      ) : (
        active.map((a) => (
          <View key={a.alertId} style={styles.alertCard}>
            <Text style={styles.alertTitle}>
              {a.alertType} · {a.alertLevel}
            </Text>
            <Text style={styles.muted}>{new Date(a.alertedAt).toLocaleString()}</Text>

            <View style={styles.row}>
              <TouchableOpacity
                style={styles.button}
                onPress={() => acknowledgeAlert(a.alertId)}
                disabled={a.acknowledged}
              >
                <Text style={styles.buttonText}>
                  {a.acknowledged ? 'Acknowledged' : 'Acknowledge'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.resolve]}
                onPress={() => resolveAlert(a.alertId)}
              >
                <Text style={styles.buttonText}>Resolve</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      {/* Settings */}
      <Text style={styles.section}>Alert Settings</Text>

      {ALL_ALERTS.map((a) => (
        <View key={a.type} style={styles.rowBetween}>
          <Text>{a.label}</Text>
          <Switch
            value={settings.enabledAlerts.includes(a.type)}
            onValueChange={(v) =>
              setSettings((s) =>
                s
                  ? {
                      ...s,
                      enabledAlerts: v
                        ? Array.from(new Set([...s.enabledAlerts, a.type]))
                        : s.enabledAlerts.filter((x) => x !== a.type),
                    }
                  : s
              )
            }
          />
        </View>
      ))}

      <Text style={styles.section}>Critical Actions</Text>

      {(['flashOnCritical', 'soundOnCritical', 'fanOnCritical'] as const).map((k) => (
        <View key={k} style={styles.rowBetween}>
          <Text>{k.replace('OnCritical', '')}</Text>
          <Switch
            value={settings[k]}
            onValueChange={(v) => setSettings((s) => (s ? { ...s, [k]: v } : s))}
          />
        </View>
      ))}

      <Text style={styles.section}>Limits</Text>

      <Text style={styles.muted}>Max people allowed</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        value={String(settings.maxPeopleAllowedInRoom)}
        onChangeText={(v) =>
          setSettings((s) => (s ? { ...s, maxPeopleAllowedInRoom: Number(v) || 0 } : s))
        }
        placeholder="Max people per room"
      />

      <Text style={styles.muted}>Heartbeat timeout (ms)</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        value={String(settings.heartbeatTimeout)}
        onChangeText={(v) =>
          setSettings((s) => (s ? { ...s, heartbeatTimeout: Number(v) || 0 } : s))
        }
        placeholder="Heartbeat timeout"
      />

      <Text style={styles.muted}>Battery low threshold</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        value={String(settings.batteryLowThreshold)}
        onChangeText={(v) =>
          setSettings((s) => (s ? { ...s, batteryLowThreshold: Number(v) || 0 } : s))
        }
        placeholder="Battery low threshold"
      />

      <TouchableOpacity style={styles.save} onPress={saveSettings}>
        <Text style={styles.saveText}>Save Settings</Text>
      </TouchableOpacity>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

/*  Styles */

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#F9FAFB' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { padding: 10 },

  title: { fontSize: 26, fontWeight: 'bold', marginBottom: 8 },
  section: { fontSize: 18, fontWeight: '700', marginTop: 24 },
  muted: { color: '#6B7280', marginTop: 6 },

  nodeChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    marginRight: 10,
  },
  nodeChipActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  nodeChipText: { color: '#374151', fontWeight: '700' },
  nodeChipTextActive: { color: '#2563EB' },

  alertCard: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    marginTop: 10,
  },
  alertTitle: { fontWeight: '800' },

  row: { flexDirection: 'row', gap: 10, marginTop: 10 },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },

  button: {
    flex: 1,
    backgroundColor: '#2563EB',
    padding: 10,
    borderRadius: 8,
  },
  resolve: { backgroundColor: '#059669' },
  buttonText: { color: '#fff', textAlign: 'center', fontWeight: '800' },

  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    backgroundColor: '#fff',
  },

  save: {
    backgroundColor: '#111827',
    padding: 14,
    borderRadius: 10,
    marginTop: 22,
  },
  saveText: { color: '#fff', textAlign: 'center', fontWeight: '900' },
});