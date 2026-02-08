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
  enabledAlerts: AlertType[];
  flashOnCritical: boolean;
  soundOnCritical: boolean;
  fanOnCritical: boolean;
  maxPeopleAllowedInRoom: number;
  heartbeatTimeout: number;
  batteryLowThreshold: number;
};

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

/*  Screen  */

export default function AlertsScreen() {
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const [alerts, setAlerts] = useState<BackendAlert[]>([]);
  const [loading, setLoading] = useState(true);

  /*  Fetch node (reuse existing storage)  */
  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem('selectedNodeId');
      if (stored) setNodeId(stored);
    })();
  }, []);

  /*  Fetch data  */
  useEffect(() => {
    if (!nodeId) return;

    const load = async () => {
      try {
        setLoading(true);

        const [settingsRes, alertsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/alerts/settings?nodeId=${nodeId}`, {
            headers: getHeaders(),
          }),
          fetch(`${API_BASE_URL}/alerts/list?nodeId=${nodeId}`, {
            headers: getHeaders(),
          }),
        ]);

        if (!settingsRes.ok || !alertsRes.ok) {
          throw new Error('Failed to load alert data');
        }

        setSettings(await settingsRes.json());
        setAlerts(await alertsRes.json());
      } catch (e: any) {
        Alert.alert('Error', e.message || 'Failed to load alerts');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [nodeId]);

  /*  Actions  */

  const saveSettings = async () => {
    if (!settings || !nodeId) return;

    await fetch(`${API_BASE_URL}/alerts/settings?nodeId=${nodeId}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(settings),
    });

    Alert.alert('Saved', 'Alert settings updated');
  };

  const resolveAlert = async (alertId: string) => {
    await fetch(
      `${API_BASE_URL}/alerts/resolve?nodeId=${nodeId}&alertId=${alertId}`,
      { method: 'POST', headers: getHeaders() }
    );
    setAlerts((a) => a.map((x) => (x.alertId === alertId ? { ...x, resolved: true } : x)));
  };

  const acknowledgeAlert = async (alertId: string) => {
    await fetch(
      `${API_BASE_URL}/alerts/acknowledge?nodeId=${nodeId}&alertId=${alertId}`,
      { method: 'POST', headers: getHeaders() }
    );
    setAlerts((a) => a.map((x) => (x.alertId === alertId ? { ...x, acknowledged: true } : x)));
  };

  /*  Render  */

  if (loading || !settings) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Alerts</Text>

      {/*  Active Alerts  */}
      <Text style={styles.section}>Active Alerts</Text>
      {alerts.filter((a) => !a.resolved).length === 0 && (
        <Text style={styles.muted}>No active alerts</Text>
      )}

      {alerts
        .filter((a) => !a.resolved)
        .map((a) => (
          <View key={a.alertId} style={styles.alertCard}>
            <Text style={styles.alertTitle}>
              {a.alertType} · {a.alertLevel}
            </Text>
            <Text style={styles.muted}>
              {new Date(a.alertedAt).toLocaleString()}
            </Text>

            <View style={styles.row}>
              <TouchableOpacity
                style={styles.button}
                onPress={() => acknowledgeAlert(a.alertId)}
              >
                <Text style={styles.buttonText}>Acknowledge</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.resolve]}
                onPress={() => resolveAlert(a.alertId)}
              >
                <Text style={styles.buttonText}>Resolve</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

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
                        ? [...s.enabledAlerts, a.type]
                        : s.enabledAlerts.filter((x) => x !== a.type),
                    }
                  : s
              )
            }
          />
        </View>
      ))}

      <Text style={styles.section}>Critical Actions</Text>

      {(['flashOnCritical', 'soundOnCritical', 'fanOnCritical'] as const).map(
        (k) => (
          <View key={k} style={styles.rowBetween}>
            <Text>{k.replace('OnCritical', '')}</Text>
            <Switch
              value={settings[k]}
              onValueChange={(v) =>
                setSettings((s) => (s ? { ...s, [k]: v } : s))
              }
            />
          </View>
        )
      )}

      <Text style={styles.section}>Limits</Text>

      <TextInput
        style={styles.input}
        keyboardType="numeric"
        value={String(settings.maxPeopleAllowedInRoom)}
        onChangeText={(v) =>
          setSettings((s) =>
            s ? { ...s, maxPeopleAllowedInRoom: Number(v) } : s
          )
        }
        placeholder="Max people per room"
      />

      <TouchableOpacity style={styles.save} onPress={saveSettings}>
        <Text style={styles.saveText}>Save Settings</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

/*  Styles */

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#F9FAFB' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 26, fontWeight: 'bold', marginBottom: 16 },
  section: { fontSize: 18, fontWeight: '700', marginTop: 24 },
  muted: { color: '#6B7280', marginTop: 6 },

  alertCard: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    marginTop: 10,
  },
  alertTitle: { fontWeight: '700' },

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
  buttonText: { color: '#fff', textAlign: 'center', fontWeight: '700' },

  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },

  save: {
    backgroundColor: '#111827',
    padding: 14,
    borderRadius: 10,
    marginTop: 30,
  },
  saveText: { color: '#fff', textAlign: 'center', fontWeight: '800' },
});