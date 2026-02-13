import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuthenticatedAPI } from '../../hooks/useAuthenticatedAPI';
import ApiService from '../../services/api';

const API_BASE_URL = 'https://backend.smartenvironment.tech/api/v1';
const API_ENDPOINTS = {
  NODES: '/node/list',
  NODE_CONFIG: '/node/config',
};

type NodeSummary = {
  id?: string;
  nodeId?: string;
  uuid?: string;
  friendlyName?: string;
  battery?: number;
  lastHeartbeat?: number;
};

type NodeConfigResponse = {
  friendlyName?: string;
  [key: string]: any;
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

function batteryColor(battery?: number): string {
  if (battery === undefined || battery === null) return '#6B7280';
  if (battery <= 20) return '#DC2626';
  if (battery <= 50) return '#F59E0B';
  return '#10B981';
}

export default function ConfigScreen() {
  const router = useRouter();
  const { isTokenLoaded, authenticatedFetch } = useAuthenticatedAPI();

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [nodes, setNodes] = useState<NodeSummary[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const [nodeConfig, setNodeConfig] = useState<NodeConfigResponse | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [isLoadingNodes, setIsLoadingNodes] = useState(true);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // ── Create Admin Modal state ──────────────────────────────────────
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newConfirmPassword, setNewConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showNewConfirmPassword, setShowNewConfirmPassword] = useState(false);
  const [isCreatingAdmin, setIsCreatingAdmin] = useState(false);

  const resetCreateAdminForm = () => {
    setNewUsername('');
    setNewEmail('');
    setNewPassword('');
    setNewConfirmPassword('');
    setShowNewPassword(false);
    setShowNewConfirmPassword(false);
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleCreateAdmin = async () => {
    if (!newUsername.trim() || !newPassword.trim() || !newConfirmPassword.trim()) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }
    if (newUsername.trim().length < 3) {
      Alert.alert('Error', 'Username must be at least 3 characters');
      return;
    }
    if (newEmail.trim() && !validateEmail(newEmail)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }
    if (newPassword !== newConfirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setIsCreatingAdmin(true);
    try {
      const response = await ApiService.createAccount({
        username: newUsername.trim(),
        password: newPassword,
        email: newEmail.trim() || undefined,
      });

      if (response.success) {
        Alert.alert(
          'Admin Created',
          `Account for "${newUsername.trim()}" was created successfully.`,
          [{ text: 'OK', onPress: () => { setShowCreateAdmin(false); resetCreateAdminForm(); } }]
        );
      } else {
        Alert.alert('Failed', response.message || 'Could not create admin account');
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
      console.error('Create admin error:', error);
    } finally {
      setIsCreatingAdmin(false);
    }
  };
  // ─────────────────────────────────────────────────────────────────

  // Auth guard
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
      } catch { }
    })();
  }, []);

  const toggleDarkMode = async () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    try {
      await AsyncStorage.setItem('isDarkMode', String(newMode));
    } catch { }
  };

  // Fetch nodes
  const fetchNodes = async () => {
    if (!isTokenLoaded) return;

    setIsLoadingNodes(true);
    try {
      const res = await authenticatedFetch(
        `${API_BASE_URL}${API_ENDPOINTS.NODES}`
      );

      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Nodes fetch failed (${res.status}): ${t}`);
      }

      const data = await res.json();
      const rawList: NodeSummary[] = Array.isArray(data)
        ? data
        : data.nodes || data.data || [];

      const list: NodeSummary[] = rawList.map((node: any) => ({
        id: node.id,
        nodeId: node.nodeId,
        uuid: node.uuid,
        friendlyName: node.friendlyName,
        lastHeartbeat: node.lastHeartbeat,
        battery: node.alertMetadata?.battery === -1 ? null : node.alertMetadata?.battery,
      }));

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
  }, [isTokenLoaded]);

  // Load node config
  const fetchNodeConfig = async (nodeId: string) => {
    if (!isTokenLoaded) return;

    setIsLoadingConfig(true);
    setNodeConfig(null);
    setDraft({});

    try {
      const url = `${API_BASE_URL}${API_ENDPOINTS.NODE_CONFIG}?nodeId=${encodeURIComponent(nodeId)}`;
      const res = await authenticatedFetch(url);

      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Config fetch failed (${res.status}): ${t}`);
      }

      const json: NodeConfigResponse = await res.json();
      setNodeConfig(json);

      const nextDraft: Record<string, string> = {};
      Object.entries(json).forEach(([k, v]) => {
        if (v !== null && v !== undefined) {
          nextDraft[k] = String(v);
        }
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
  }, [selectedNode, isTokenLoaded]);

  const selectedNodeObj = useMemo(() => {
    return nodes.find((n) => safeNodeId(n) === selectedNode) || null;
  }, [nodes, selectedNode]);

  const buildPatch = (): Record<string, string> => {
    if (!nodeConfig) return {};
    const patch: Record<string, string> = {};

    Object.keys(draft).forEach((key) => {
      const original = nodeConfig[key];
      const originalStr = original === null || original === undefined ? '' : String(original);
      const newStr = draft[key] ?? '';
      if (newStr !== originalStr) patch[key] = newStr;
    });

    return patch;
  };

  const onSave = async () => {
    if (!selectedNode || !nodeConfig || !isTokenLoaded) return;

    const patch = buildPatch();

    if (Object.keys(patch).length === 0) {
      Alert.alert('No changes', 'Nothing to update.');
      return;
    }

    setIsSaving(true);
    try {
      const url = `${API_BASE_URL}${API_ENDPOINTS.NODE_CONFIG}?nodeId=${encodeURIComponent(selectedNode)}`;
      const res = await authenticatedFetch(url, {
        method: 'POST',
        body: JSON.stringify(patch),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Save failed (${res.status}): ${t}`);
      }

      Alert.alert('Saved', 'Configuration updated and pushed to node.');
      await Promise.all([fetchNodeConfig(selectedNode), fetchNodes()]);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save config');
    } finally {
      setIsSaving(false);
    }
  };

  // ---------- Dynamic theme styles ----------

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
    // Modal-specific
    modalOverlay: { ...styles.modalOverlay },
    modalContainer: { ...styles.modalContainer, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF' },
    modalTitle: { ...styles.modalTitle, color: isDarkMode ? '#F9FAFB' : '#111827' },
    modalSubtitle: { ...styles.modalSubtitle, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    modalInput: { ...styles.modalInput, backgroundColor: isDarkMode ? '#111827' : '#F9FAFB', borderColor: isDarkMode ? '#374151' : '#D1D5DB', color: isDarkMode ? '#F9FAFB' : '#111827' },
    modalLabel: { ...styles.modalLabel, color: isDarkMode ? '#D1D5DB' : '#374151' },
    modalPasswordContainer: { ...styles.modalPasswordContainer, backgroundColor: isDarkMode ? '#111827' : '#F9FAFB', borderColor: isDarkMode ? '#374151' : '#D1D5DB' },
    modalPasswordInput: { ...styles.modalPasswordInput, color: isDarkMode ? '#F9FAFB' : '#111827' },
    modalDivider: { ...styles.modalDivider, backgroundColor: isDarkMode ? '#374151' : '#E5E7EB' },
  };

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
        { key: 'mqtt_username', label: 'MQTT Username' },
        { key: 'mqtt_password', label: 'MQTT Password', secure: true },
      ],
    },
    {
      title: 'Beacon',
      fields: [
        { key: 'beacon_majorId', label: 'Beacon Major ID', keyboard: 'numeric' },
        { key: 'beacon_minorId', label: 'Beacon Minor ID', keyboard: 'numeric' },
      ],
    },
  ];

  return (
    <>
      <ScrollView style={dynamic.container}>
        {/* Header */}
        <View style={dynamic.header}>
          <View style={{ flex: 1 }}>
            <Text style={dynamic.title}>Admin</Text>
            <Text style={dynamic.subtitle}>Configure nodes + view system health</Text>
          </View>

          {/* Create Admin Account Button */}
          <TouchableOpacity
            onPress={() => setShowCreateAdmin(true)}
            style={styles.iconButton}
          >
            <Ionicons name="person-add-outline" size={22} color={isDarkMode ? '#34D399' : '#059669'} />
          </TouchableOpacity>

          {/* Map Editor Button */}
          <TouchableOpacity
            onPress={() => router.push('/AdminMapEditor')}
            style={styles.iconButton}
          >
            <Ionicons name="map-outline" size={22} color={isDarkMode ? '#FBBF24' : '#6B7280'} />
          </TouchableOpacity>

          <TouchableOpacity onPress={toggleDarkMode} style={styles.iconButton}>
            <Ionicons name={isDarkMode ? 'sunny' : 'moon'} size={22} color={isDarkMode ? '#FBBF24' : '#6B7280'} />
          </TouchableOpacity>

          <TouchableOpacity onPress={fetchNodes} style={styles.iconButton}>
            <Ionicons name="refresh" size={22} color={isDarkMode ? '#93C5FD' : '#2563EB'} />
          </TouchableOpacity>

          {/* Logout Button */}
          <TouchableOpacity
            onPress={() => {
              Alert.alert(
                'Logout',
                'Are you sure you want to logout?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Logout',
                    style: 'destructive',
                    onPress: async () => {
                      await ApiService.logout();
                      router.replace('/(tabs)/login');
                    },
                  },
                ]
              );
            }}
            style={styles.iconButton}
          >
            <Ionicons name="log-out-outline" size={22} color={isDarkMode ? '#F87171' : '#DC2626'} />
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
                          style={[dynamic.input, isReadOnly ? { opacity: 0.6 } : null]}
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

      {/* ── Create Admin Account Modal ───────────────────────────────── */}
      <Modal
        visible={showCreateAdmin}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          if (!isCreatingAdmin) {
            setShowCreateAdmin(false);
            resetCreateAdminForm();
          }
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={dynamic.modalContainer}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <View style={styles.modalIconCircle}>
                  <Ionicons name="person-add" size={22} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={dynamic.modalTitle}>Create Admin Account</Text>
                  <Text style={dynamic.modalSubtitle}>Grant system access to a new administrator</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => {
                  if (!isCreatingAdmin) {
                    setShowCreateAdmin(false);
                    resetCreateAdminForm();
                  }
                }}
                disabled={isCreatingAdmin}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={22} color={isDarkMode ? '#9CA3AF' : '#6B7280'} />
              </TouchableOpacity>
            </View>

            <View style={dynamic.modalDivider} />

            {/* Modal Form */}
            <ScrollView
              style={styles.modalScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Security notice */}
              <View style={styles.securityBanner}>
                <Ionicons name="shield-checkmark" size={14} color="#059669" />
                <Text style={styles.securityBannerText}>
                  Account creation is restricted to admins only
                </Text>
              </View>

              {/* Username */}
              <View style={styles.modalFieldContainer}>
                <Text style={dynamic.modalLabel}>Username *</Text>
                <TextInput
                  style={dynamic.modalInput}
                  value={newUsername}
                  onChangeText={setNewUsername}
                  placeholder="Choose a username"
                  placeholderTextColor={isDarkMode ? '#4B5563' : '#9CA3AF'}
                  autoCapitalize="none"
                  editable={!isCreatingAdmin}
                  autoCorrect={false}
                />
              </View>

              {/* Email */}
              <View style={styles.modalFieldContainer}>
                <Text style={dynamic.modalLabel}>Email (Optional)</Text>
                <TextInput
                  style={dynamic.modalInput}
                  value={newEmail}
                  onChangeText={setNewEmail}
                  placeholder="admin@example.com"
                  placeholderTextColor={isDarkMode ? '#4B5563' : '#9CA3AF'}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  editable={!isCreatingAdmin}
                  autoCorrect={false}
                />
              </View>

              {/* Password */}
              <View style={styles.modalFieldContainer}>
                <Text style={dynamic.modalLabel}>Password *</Text>
                <View style={dynamic.modalPasswordContainer}>
                  <TextInput
                    style={dynamic.modalPasswordInput}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="Min. 8 characters"
                    placeholderTextColor={isDarkMode ? '#4B5563' : '#9CA3AF'}
                    secureTextEntry={!showNewPassword}
                    autoCapitalize="none"
                    editable={!isCreatingAdmin}
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    onPress={() => setShowNewPassword(!showNewPassword)}
                    style={styles.eyeButton}
                    disabled={isCreatingAdmin}
                  >
                    <Ionicons
                      name={showNewPassword ? 'eye-off' : 'eye'}
                      size={20}
                      color={isDarkMode ? '#6B7280' : '#9CA3AF'}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confirm Password */}
              <View style={styles.modalFieldContainer}>
                <Text style={dynamic.modalLabel}>Confirm Password *</Text>
                <View style={dynamic.modalPasswordContainer}>
                  <TextInput
                    style={dynamic.modalPasswordInput}
                    value={newConfirmPassword}
                    onChangeText={setNewConfirmPassword}
                    placeholder="Re-enter password"
                    placeholderTextColor={isDarkMode ? '#4B5563' : '#9CA3AF'}
                    secureTextEntry={!showNewConfirmPassword}
                    autoCapitalize="none"
                    editable={!isCreatingAdmin}
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    onPress={() => setShowNewConfirmPassword(!showNewConfirmPassword)}
                    style={styles.eyeButton}
                    disabled={isCreatingAdmin}
                  >
                    <Ionicons
                      name={showNewConfirmPassword ? 'eye-off' : 'eye'}
                      size={20}
                      color={isDarkMode ? '#6B7280' : '#9CA3AF'}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setShowCreateAdmin(false);
                    resetCreateAdminForm();
                  }}
                  disabled={isCreatingAdmin}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.createButton,
                    (isCreatingAdmin || !newUsername || !newPassword || !newConfirmPassword) &&
                      styles.createButtonDisabled,
                  ]}
                  onPress={handleCreateAdmin}
                  disabled={isCreatingAdmin || !newUsername || !newPassword || !newConfirmPassword}
                >
                  {isCreatingAdmin ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Ionicons name="person-add-outline" size={16} color="#FFFFFF" />
                      <Text style={styles.createButtonText}>Create Admin</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
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

  // ── Modal styles ───────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  modalIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#059669',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  modalCloseButton: {
    padding: 6,
    marginLeft: 8,
  },
  modalDivider: {
    height: 1,
    width: '100%',
  },
  modalScroll: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  securityBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#6EE7B7',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
  },
  securityBannerText: {
    fontSize: 12,
    color: '#065F46',
    fontWeight: '500',
  },
  modalFieldContainer: {
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
  },
  modalPasswordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
  },
  modalPasswordInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
  },
  eyeButton: {
    padding: 12,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  createButton: {
    flex: 2,
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
  },
  createButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  createButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});