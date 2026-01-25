import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

const API_BASE_URL = 'https://backend.smartenvironment.tech/api/v1';
const API_ENDPOINTS = {
  NODES: '/nodes',
  NODE_CONFIG: '/node/config',
};

type NodeSummary = {
  id?: string;
  nodeId?: string;
  uuid?: string;
  friendlyName?: string;
  battery?: number;
  lastHeartbeat?: number;
  // other fields may exist
};

type NodeConfigResponse = {
  friendlyName?: string;
  // plus lots of config keys from nodeConfig map (e.g. wifi_ssid, mqtt_server, etc.)
  [key: string]: any;
};

const getAuthHeaders = () => ({
  'Content-Type': 'application/json',
  'API-KEY': '49643a60-0aff-4a88-8e65-30ea428df8ee',
});

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

function batteryColor(battery?: number): string {
  if (battery === undefined || battery === null) return '#6B7280';
  if (battery <= 20) return '#DC2626';
  if (battery <= 50) return '#F59E0B';
  return '#10B981';
}

export default function ConfigScreen() {
  const router = useRouter();

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [nodes, setNodes] = useState<NodeSummary[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const [nodeConfig, setNodeConfig] = useState<NodeConfigResponse | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [isLoadingNodes, setIsLoadingNodes] = useState(true);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  //Auth + Theme (same pattern as your Monitor screen)
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

  // Fetch nodes 
  const fetchNodes = async () => {
    setIsLoadingNodes(true);
    try {
      const res = await fetch(`${API_BASE_URL}${API_ENDPOINTS.NODES}`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Nodes fetch failed (${res.status}): ${t}`);
      }

      const data = await res.json();
      const list: NodeSummary[] = Array.isArray(data) ? data : (data.nodes || data.data || []);
      setNodes(list);

      if (!selectedNode && list.length > 0) {
        const first = safeNodeId(list[0]);
        if (first) setSelectedNode(first);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to fetch nodes');
    } finally {
      setIsLoadingNodes(false);
    }
  };

  useEffect(() => {
    fetchNodes();
  }, []);

  // Load node config when selectedNode changes 
  const fetchNodeConfig = async (nodeId: string) => {
    setIsLoadingConfig(true);
    setNodeConfig(null);
    setDraft({});
    try {
      const url = `${API_BASE_URL}${API_ENDPOINTS.NODE_CONFIG}?nodeId=${encodeURIComponent(nodeId)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Config fetch failed (${res.status}): ${t}`);
      }

      const json: NodeConfigResponse = await res.json();
      setNodeConfig(json);

      // Create an editable draft (string values)
      const nextDraft: Record<string, string> = {};
      Object.entries(json).forEach(([k, v]) => {
        if (v === null || v === undefined) return;
        nextDraft[k] = String(v);
      });

      setDraft(nextDraft);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to fetch node config');
    } finally {
      setIsLoadingConfig(false);
    }
  };

  useEffect(() => {
    if (selectedNode) fetchNodeConfig(selectedNode);
  }, [selectedNode]);

  // Find selected node summary (for health display)
  const selectedNodeObj = useMemo(() => {
    return nodes.find((n) => safeNodeId(n) === selectedNode) || null;
  }, [nodes, selectedNode]);

  // Save changes  
  const buildPatch = (): Record<string, string> => {
    if (!nodeConfig) return {};
    const patch: Record<string, string> = {};

    // Only send changed values (compared to nodeConfig)
    Object.keys(draft).forEach((key) => {
      const original = nodeConfig[key];
      const originalStr = original === null || original === undefined ? '' : String(original);
      const newStr = draft[key] ?? '';

      if (newStr !== originalStr) {
        patch[key] = newStr;
      }
    });

    return patch;
  };

  const onSave = async () => {
    if (!selectedNode) return;
    if (!nodeConfig) return;

    const patch = buildPatch();

    if (Object.keys(patch).length === 0) {
      Alert.alert('No changes', 'Nothing to update.');
      return;
    }

    setIsSaving(true);
    try {
      const url = `${API_BASE_URL}${API_ENDPOINTS.NODE_CONFIG}?nodeId=${encodeURIComponent(selectedNode)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(patch),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Save failed (${res.status}): ${t}`);
      }

      Alert.alert('Saved', 'Configuration updated and pushed to node.');
      // Refresh config + nodes list (to update friendlyName/health)
      await Promise.all([fetchNodeConfig(selectedNode), fetchNodes()]);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save config');
    } finally {
      setIsSaving(false);
    }
  };

  // UI helpers 
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

  // Pick a curated list of fields (instead of dumping everything)
  const FIELD_GROUPS: { title: string; fields: { key: string; label: string; secure?: boolean; keyboard?: any }[] }[] = [
    {
      title: 'Node Identity',
      fields: [
        { key: 'friendlyName', label: 'Friendly Name' },
        { key: 'node_id', label: 'Node ID (read-only)' },
      ],
    },
    {
      title: 'Wi-Fi',
      fields: [
        { key: 'wifi_ssid', label: 'WiFi SSID' },
        { key: 'wifi_password', label: 'WiFi Password', secure: true },
      ],
    },
    {
      title: 'MQTT',
      fields: [
        { key: 'mqtt_server', label: 'MQTT Server' },
        { key: 'mqtt_port', label: 'MQTT Port', keyboard: 'numeric' },
        { key: 'mqtt_client_id', label: 'MQTT Client ID' },
        { key: 'mqtt_username', label: 'MQTT Username' },
        { key: 'mqtt_password', label: 'MQTT Password', secure: true },
      ],
    },
    {
      title: 'Beacon',
      fields: [
        // IMPORTANT: backend special-cases these dotted keys for iBeacon fields
        { key: 'beacon.majorId', label: 'Beacon Major ID', keyboard: 'numeric' },
        { key: 'beacon.minorId', label: 'Beacon Minor ID', keyboard: 'numeric' },
      ],
    },
  ];

  return (
    <ScrollView style={dynamic.container}>
      {/* Header */}
      <View style={dynamic.header}>
        <View style={{ flex: 1 }}>
          <Text style={dynamic.title}>Admin</Text>
          <Text style={dynamic.subtitle}>Configure nodes + view system health</Text>
        </View>

        <TouchableOpacity onPress={toggleDarkMode} style={styles.iconButton}>
          <Ionicons name={isDarkMode ? 'sunny' : 'moon'} size={22} color={isDarkMode ? '#FBBF24' : '#6B7280'} />
        </TouchableOpacity>

        <TouchableOpacity onPress={fetchNodes} style={styles.iconButton}>
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
              const name = node.friendlyName || id;
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

      {/* Health card */}
      <View style={dynamic.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="pulse" size={22} color={isDarkMode ? '#60A5FA' : '#2563EB'} />
          <Text style={dynamic.cardTitle}>System Health</Text>
        </View>

        <View style={styles.healthRow}>
          <Text style={dynamic.smallText}>Battery</Text>
          <Text style={[styles.healthValue, { color: batteryColor(selectedNodeObj?.battery) }]}>
            {selectedNodeObj?.battery !== undefined && selectedNodeObj?.battery !== null
              ? `${selectedNodeObj.battery}%`
              : 'Unknown'}
          </Text>
        </View>

        <View style={styles.healthRow}>
          <Text style={dynamic.smallText}>Last heartbeat</Text>
          <Text style={styles.healthValue}>
            {selectedNodeObj?.lastHeartbeat ? new Date(selectedNodeObj.lastHeartbeat).toLocaleString() : 'N/A'}
          </Text>
        </View>

        <View style={styles.healthRow}>
          <Text style={dynamic.smallText}>Last seen</Text>
          <Text style={styles.healthValue}>{formatLastSeen(selectedNodeObj?.lastHeartbeat)}</Text>
        </View>
      </View>

      {/* Config editor */}
      <View style={dynamic.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="construct" size={22} color={isDarkMode ? '#60A5FA' : '#2563EB'} />
          <Text style={dynamic.cardTitle}>Node Configuration</Text>
        </View>

        {isLoadingConfig ? (
          <View style={{ paddingVertical: 20 }}>
            <ActivityIndicator />
            <Text style={[styles.centerText, dynamic.smallText]}>Loading configuration…</Text>
          </View>
        ) : !nodeConfig ? (
          <Text style={dynamic.smallText}>Select a node to view configuration.</Text>
        ) : (
          <>
            {FIELD_GROUPS.map((group) => (
              <View key={group.title} style={{ marginTop: 14 }}>
                <Text style={dynamic.sectionLabel}>{group.title}</Text>
                <View style={dynamic.divider} />

                {group.fields.map((f) => {
                  const isReadOnly = f.key === 'node_id';
                  const value = draft[f.key] ?? '';

                  return (
                    <View key={f.key} style={{ marginTop: 10 }}>
                      <Text style={dynamic.inputLabel}>{f.label}</Text>
                      <TextInput
                        value={value}
                        editable={!isReadOnly && !isSaving}
                        onChangeText={(t) => setDraft((prev) => ({ ...prev, [f.key]: t }))}
                        style={[
                          dynamic.input,
                          isReadOnly ? { opacity: 0.6 } : null,
                        ]}
                        secureTextEntry={!!f.secure}
                        keyboardType={f.keyboard || 'default'}
                        autoCapitalize="none"
                      />
                    </View>
                  );
                })}
              </View>
            ))}

            <TouchableOpacity
              onPress={onSave}
              disabled={isSaving}
              style={[styles.saveButton, isSaving ? { opacity: 0.7 } : null]}
            >
              <Ionicons name="save-outline" size={18} color="#FFFFFF" />
              <Text style={styles.saveButtonText}>{isSaving ? 'Saving…' : 'Save & Push to Node'}</Text>
            </TouchableOpacity>

            <Text style={[styles.helpText, dynamic.smallText]}>
              Saving updates MongoDB and triggers an MQTT push of the full config state to the node.
            </Text>
          </>
        )}
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

  healthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  healthValue: { fontSize: 14, fontWeight: '600' },

  inputLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },

  divider: { height: 1, width: '100%', marginTop: 6 },

  saveButton: {
    marginTop: 18,
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  saveButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },

  helpText: { marginTop: 10, fontSize: 12, lineHeight: 16 },

  centerText: { textAlign: 'center', marginTop: 10 },
});
