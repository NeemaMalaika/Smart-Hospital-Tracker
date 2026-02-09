import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import { useAuthenticatedAPI } from '../../hooks/useAuthenticatedAPI';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

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
    if (!res.ok) throw new Error(await res.text());
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
        Alert.alert('Error', e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [isTokenLoaded]);

  /* ------------------ Fetch Alerts ------------------ */

  const loadAlertData = async (id: string) => {
    const [settingsRes, alertsRes] = await Promise.all([
      authenticatedFetch(`${API_BASE_URL}/alerts/settings?nodeId=${id}`),
      authenticatedFetch(`${API_BASE_URL}/alerts/list?nodeId=${id}`),
    ]);

    if (!settingsRes.ok || !alertsRes.ok) {
      throw new Error('Failed to load alert data');
    }

    setSettings(await settingsRes.json());
    setAlerts(flattenAlertsMap(await alertsRes.json()));
  };

  useEffect(() => {
    if (!nodeId || !isTokenLoaded) return;

    (async () => {
      try {
        setLoading(true);
        await loadAlertData(nodeId);
      } catch (e: any) {
        Alert.alert('Error', e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [nodeId, isTokenLoaded]);

  /* ------------------ Actions ------------------ */

  const saveSettings = async () => {
    if (!nodeId || !settings) return;

    const res = await authenticatedFetch(
      `${API_BASE_URL}/alerts/settings?nodeId=${nodeId}`,
      { method: 'POST', body: JSON.stringify(settings) }
    );

    if (!res.ok) {
      Alert.alert('Error', await res.text());
      return;
    }

    Alert.alert('Saved', 'Alert settings updated');
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
      <Text>Selected node: {selectedNodeObj?.friendlyName || nodeId}</Text>

      <Text style={styles.section}>Active Alerts</Text>
      {alerts.filter((a) => !a.resolved).map((a) => (
        <View key={a.alertId} style={styles.alertCard}>
          <Text>{a.alertType} · {a.alertLevel}</Text>
          <Text>{new Date(a.alertedAt).toLocaleString()}</Text>
        </View>
      ))}

      <Text style={styles.section}>Alert Settings</Text>
      {settings &&
        ALL_ALERTS.map((a) => (
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
                          ? [...s.enabledAlerts, a.type]
                          : s.enabledAlerts.filter((x) => x !== a.type),
                      }
                    : s
                )
              }
            />
          </View>
        ))}

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
  section: { marginTop: 20, fontWeight: '700' },
  alertCard: { padding: 12, backgroundColor: '#fff', marginTop: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  save: { marginTop: 20, backgroundColor: '#111827', padding: 14 },
  saveText: { color: '#fff', textAlign: 'center' },
});


