import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuthenticatedAPI } from '../../hooks/useAuthenticatedAPI';

const API_BASE_URL = 'https://backend.smartenvironment.tech/api/v1';

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
  enabledAlerts: AlertType[];
  flashOnCritical: boolean;
  soundOnCritical: boolean;
  fanOnCritical: boolean;
  maxPeopleAllowedInRoom: number;
  heartbeatTimeout: number;
  batteryLowThreshold: number;
};

type NodeSummary = {
  id: string;
  friendlyName?: string;
  type?: string;
};

type AlertsMapResponse = Record<string, BackendAlert[]>;

/* ------------------ Helpers ------------------ */

const ALL_ALERTS = [
  { type: 'TEMPERATURE', label: 'Temperature', icon: 'thermometer' },
  { type: 'HUMIDITY', label: 'Humidity', icon: 'water' },
  { type: 'NOISE', label: 'Noise', icon: 'volume-high' },
  { type: 'PRESSURE', label: 'Pressure', icon: 'speedometer' },
  { type: 'LIGHT', label: 'Light', icon: 'bulb' },
  { type: 'BATTERY', label: 'Battery low', icon: 'battery-dead-outline' },
  { type: 'HEARTBEAT', label: 'Heartbeat missed', icon: 'pulse' },
  { type: 'ROOM_LIMIT', label: 'Room occupancy limit', icon: 'people' },
] as const;

function flattenAlertsMap(map: AlertsMapResponse): BackendAlert[] {
  return Object.values(map || {})
    .flat()
    .sort((a, b) => b.alertedAt - a.alertedAt);
}

/* ------------------ Screen ------------------ */

export default function AlertsScreen() {
  const { isTokenLoaded, authenticatedFetch } = useAuthenticatedAPI();

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

  /* ------------------ Fetch Nodes ------------------ */

  const fetchNodes = async (): Promise<NodeSummary[]> => {
    const res = await authenticatedFetch(`${API_BASE_URL}/node/list`);
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Node list failed (${res.status}): ${t}`);
    }
    const data = await res.json();
    return Array.isArray(data) ? data : data.nodes ?? [];
  };

  const ensureNodeSelected = async (list: NodeSummary[]) => {
    const stored = await AsyncStorage.getItem('selectedNodeId');

    if (stored && list.some((n) => n.id === stored)) {
      setNodeId(stored);
      return;
    }

    if (list[0]) {
      setNodeId(list[0].id);
      await AsyncStorage.setItem('selectedNodeId', list[0].id);
    }
  };

  useEffect(() => {
    if (!isTokenLoaded) return;

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
  }, [isTokenLoaded]);

  /* ------------------ Fetch Alerts ------------------ */

  const loadAlertData = async (id: string) => {
    const [settingsRes, alertsRes] = await Promise.all([
      authenticatedFetch(`${API_BASE_URL}/alerts/settings?nodeId=${encodeURIComponent(id)}`),
      authenticatedFetch(`${API_BASE_URL}/alerts/list?nodeId=${encodeURIComponent(id)}`),
    ]);

    if (!settingsRes.ok) {
      throw new Error(await settingsRes.text());
    }
    if (!alertsRes.ok) {
      throw new Error(await alertsRes.text());
    }

    const settingsJson: AlertSettings = await settingsRes.json();
    const alertsJson: AlertsMapResponse = await alertsRes.json();

    setSettings(settingsJson);
    setAlerts(flattenAlertsMap(alertsJson));
  };

  useEffect(() => {
    if (!nodeId || !isTokenLoaded) return;

    (async () => {
      try {
        setLoading(true);
        await loadAlertData(nodeId);
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Failed to load alerts');
      } finally {
        setLoading(false);
      }
    })();
  }, [nodeId, isTokenLoaded]);

  /* ------------------ Actions ------------------ */

  const saveSettings = async () => {
    if (!nodeId || !settings) return;

    try {
      const res = await authenticatedFetch(
        `${API_BASE_URL}/alerts/settings?nodeId=${encodeURIComponent(nodeId)}`,
        {
          method: 'POST',
          body: JSON.stringify(settings),
        }
      );

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t);
      }

      Alert.alert('Saved', 'Alert settings updated');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save settings');
    }
  };

  /* ------------------ Render ------------------ */

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text>Loading alerts…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Alerts</Text>
      <Text style={styles.subtitle}>
        Selected node: {selectedNodeObj?.friendlyName || nodeId}
      </Text>

      <Text style={styles.section}>Active Alerts</Text>
      {alerts.filter((a) => !a.resolved).length === 0 && (
        <Text style={styles.muted}>No active alerts 🎉</Text>
      )}

      {alerts
        .filter((a) => !a.resolved)
        .map((a) => (
          <View key={a.alertId} style={styles.alertCard}>
            <View style={styles.alertHeader}>
              <Ionicons name="alert-circle" size={18} color="#DC2626" />
              <Text style={styles.alertTitle}>
                {a.alertType} · {a.alertLevel}
              </Text>
            </View>
            <Text style={styles.alertTime}>
              {new Date(a.alertedAt).toLocaleString()}
            </Text>
          </View>
        ))}

      <Text style={styles.section}>Alert Settings</Text>

      {settings &&
        ALL_ALERTS.map((a) => {
          const enabled = settings.enabledAlerts.includes(a.type);

          return (
            <View key={a.type} style={styles.rowBetween}>
              <View style={styles.rowLeft}>
                <Ionicons name={a.icon as any} size={18} color="#374151" />
                <Text style={styles.rowLabel}>{a.label}</Text>
              </View>

              <Switch
                value={enabled}
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
          );
        })}

      <TouchableOpacity style={styles.save} onPress={saveSettings}>
        <Text style={styles.saveText}>Save Settings</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

/* ------------------ Styles ------------------ */

const styles = StyleSheet.create({
  container: { padding: 20 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  title: { fontSize: 24, fontWeight: 'bold' },
  subtitle: { marginTop: 4, color: '#6B7280' },

  section: { marginTop: 24, fontWeight: '700', fontSize: 16 },
  muted: { marginTop: 8, color: '#6B7280' },

  alertCard: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    marginTop: 10,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  alertHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  alertTitle: { fontWeight: '700' },
  alertTime: { marginTop: 4, color: '#6B7280', fontSize: 12 },

  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowLabel: { fontSize: 14 },

  save: {
    marginTop: 30,
    backgroundColor: '#111827',
    paddingVertical: 14,
    borderRadius: 10,
  },
  saveText: {
    color: '#FFFFFF',
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 14,
  },
});

