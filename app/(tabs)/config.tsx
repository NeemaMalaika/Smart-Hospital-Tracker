import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  useWindowDimensions,
} from 'react-native';
import { changeLanguage, SupportedLanguage } from '../../i18n';
import { useAuthenticatedAPI } from '../../hooks/useAuthenticatedAPI';
import ApiService from '../../services/api';
import Toast from '../../components/toast';

const API_BASE_URL = 'https://backend.smartenvironment.tech/api/v1';
const API_ENDPOINTS = { NODES: '/node/list', NODE_CONFIG: '/node/config' };

type NodeSummary = { id?: string; nodeId?: string; uuid?: string; friendlyName?: string; battery?: number; lastHeartbeat?: number };
type NodeConfigResponse = { friendlyName?: string; [key: string]: any };

function safeNodeId(n: NodeSummary): string | null { return (n.id || n.nodeId || n.uuid || null) as string | null; }

function formatLastSeen(lastHeartbeat?: number, t?: any): string {
  if (!lastHeartbeat) return t ? t('admin.noHeartbeat') : 'No heartbeat yet';
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

function batteryColor(battery?: number): string {
  if (battery === undefined || battery === null) return '#6B7280';
  if (battery <= 20) return '#DC2626';
  if (battery <= 50) return '#F59E0B';
  return '#10B981';
}

export default function ConfigScreen() {
  const router = useRouter();
  const { isTokenLoaded, authenticatedFetch } = useAuthenticatedAPI();
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions(); 
  const isPhone = windowWidth < 768;                    

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [nodes, setNodes] = useState<NodeSummary[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [nodeConfig, setNodeConfig] = useState<NodeConfigResponse | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [isLoadingNodes, setIsLoadingNodes] = useState(true);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  //search / dropdown
  const [nodeSearchQuery, setNodeSearchQuery] = useState('');
  const [isNodeDropdownOpen, setIsNodeDropdownOpen] = useState(false);

  // Language picker
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const LANGUAGES: { code: SupportedLanguage; label: string }[] = [
    { code: 'en', label: t('admin.language.en') },
    { code: 'fr', label: t('admin.language.fr') },
    { code: 'es', label: t('admin.language.es') },
  ];
  const handleChangeLanguage = async (lang: SupportedLanguage) => { await changeLanguage(lang); setShowLanguagePicker(false); };

  // Create Admin modal
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newConfirmPassword, setNewConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showNewConfirmPassword, setShowNewConfirmPassword] = useState(false);
  const [isCreatingAdmin, setIsCreatingAdmin] = useState(false);

  // Toast state
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');

  const resetCreateAdminForm = () => { setNewUsername(''); setNewEmail(''); setNewPassword(''); setNewConfirmPassword(''); setShowNewPassword(false); setShowNewConfirmPassword(false); };
  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleCreateAdmin = async () => {
    if (!newUsername.trim() || !newPassword.trim() || !newConfirmPassword.trim()) { 
      setToastMessage(t('admin.createAdmin.validation.fillRequired'));
      setToastType('error');
      setShowToast(true);
      return; 
    }
    if (newUsername.trim().length < 3) { 
      setToastMessage(t('admin.createAdmin.validation.usernameMinLength'));
      setToastType('error');
      setShowToast(true);
      return; 
    }
    if (newEmail.trim() && !validateEmail(newEmail)) { 
      setToastMessage(t('admin.createAdmin.validation.invalidEmail'));
      setToastType('error');
      setShowToast(true);
      return; 
    }
    if (newPassword.length < 8) { 
      setToastMessage(t('admin.createAdmin.validation.passwordMinLength'));
      setToastType('error');
      setShowToast(true);
      return; 
    }
    if (newPassword !== newConfirmPassword) { 
      setToastMessage(t('admin.createAdmin.validation.passwordsMismatch'));
      setToastType('error');
      setShowToast(true);
      return; 
    }
    setIsCreatingAdmin(true);
    try {
      const response = await ApiService.createAccount({ 
        username: newUsername.trim(), 
        password: newPassword, 
        email: newEmail.trim() || undefined 
      });
      if (response.success) {
        setToastMessage(t('admin.createAdmin.successMessage', { username: newUsername.trim() }));
        setToastType('success');
        setShowToast(true);
        setShowCreateAdmin(false);
        resetCreateAdminForm();
      } else {
        // Check if session expired
        if (response.message?.includes('log in again') || response.message?.includes('expired')) {
          setToastMessage(response.message);
          setToastType('error');
          setShowToast(true);
          setShowCreateAdmin(false);
          // Redirect to login after a short delay
          setTimeout(() => {
            router.replace('/login');
          }, 2000);
        } else {
          setToastMessage(response.message || t('admin.createAdmin.failedDefault'));
          setToastType('error');
          setShowToast(true);
        }
      }
    } catch (error) {
      setToastMessage(t('admin.createAdmin.unexpectedError'));
      setToastType('error');
      setShowToast(true);
    } finally { setIsCreatingAdmin(false); }
  };

  // Auth guard + theme
  useEffect(() => {
    (async () => { try { const isAuth = await AsyncStorage.getItem('isAuthenticated'); if (!isAuth) router.replace('/login'); } catch { router.replace('/login'); } })();
  }, []);
  useEffect(() => {
    (async () => { try { const s = await AsyncStorage.getItem('isDarkMode'); if (s !== null) setIsDarkMode(s === 'true'); } catch { } })();
  }, []);
  const toggleDarkMode = async () => { const n = !isDarkMode; setIsDarkMode(n); try { await AsyncStorage.setItem('isDarkMode', String(n)); } catch { } };

  // Fetch nodes
  const fetchNodes = async () => {
    if (!isTokenLoaded) return;
    setIsLoadingNodes(true);
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}${API_ENDPOINTS.NODES}`);
      if (!res.ok) { const t2 = await res.text(); throw new Error(`Nodes fetch failed (${res.status}): ${t2}`); }
      const data = await res.json();
      const rawList: NodeSummary[] = Array.isArray(data) ? data : data.nodes || data.data || [];
      const list: NodeSummary[] = rawList.map((node: any) => ({
        id: node.id, nodeId: node.nodeId, uuid: node.uuid, friendlyName: node.friendlyName,
        lastHeartbeat: node.lastHeartbeat,
        battery: node.alertMetadata?.battery === -1 ? null : node.alertMetadata?.battery,
      }));
      setNodes(list);
      if (!selectedNode && list.length > 0) { const first = safeNodeId(list[0]); if (first) setSelectedNode(first); }
    } catch (e: any) { Alert.alert(t('common.error', 'Error'), e?.message || t('admin.errors.nodesFetchFailed')); }
    finally { setIsLoadingNodes(false); }
  };
  useEffect(() => { fetchNodes(); }, [isTokenLoaded]);

  // Fetch node config
  const fetchNodeConfig = async (nodeId: string) => {
    if (!isTokenLoaded) return;
    setIsLoadingConfig(true); setNodeConfig(null); setDraft({});
    try {
      const url = `${API_BASE_URL}${API_ENDPOINTS.NODE_CONFIG}?nodeId=${encodeURIComponent(nodeId)}`;
      const res = await authenticatedFetch(url);
      if (!res.ok) { const t2 = await res.text(); throw new Error(`Config fetch failed (${res.status}): ${t2}`); }
      const json: NodeConfigResponse = await res.json();
      setNodeConfig(json);
      const nextDraft: Record<string, string> = {};
      Object.entries(json).forEach(([k, v]) => { if (v !== null && v !== undefined) nextDraft[k] = String(v); });
      setDraft(nextDraft);
    } catch (e: any) { Alert.alert(t('common.error', 'Error'), e?.message || t('admin.errors.configFetchFailed')); }
    finally { setIsLoadingConfig(false); }
  };
  useEffect(() => { if (selectedNode) fetchNodeConfig(selectedNode); }, [selectedNode, isTokenLoaded]);

  const selectedNodeObj = useMemo(() => nodes.find((n) => safeNodeId(n) === selectedNode) || null, [nodes, selectedNode]);
  const selectedNodeName = selectedNodeObj?.friendlyName || selectedNode || '';

  // Filtered nodes for search dropdown
  const filteredNodes = useMemo(() =>
    nodes.filter((n) => (n.friendlyName || safeNodeId(n) || '').toLowerCase().includes(nodeSearchQuery.toLowerCase())),
    [nodes, nodeSearchQuery]
  );

  // Save / patch
  const buildPatch = (): Record<string, string> => {
    if (!nodeConfig) return {};
    const patch: Record<string, string> = {};
    Object.keys(draft).forEach((key) => {
      const original = nodeConfig[key];
      const originalStr = original === null || original === undefined ? '' : String(original);
      if ((draft[key] ?? '') !== originalStr) patch[key] = draft[key] ?? '';
    });
    return patch;
  };

  const onSave = async () => {
    if (!selectedNode || !nodeConfig || !isTokenLoaded) return;
    const patch = buildPatch();
    if (Object.keys(patch).length === 0) { Alert.alert(t('common.noData', 'No changes'), t('admin.noChanges')); return; }
    setIsSaving(true);
    try {
      const url = `${API_BASE_URL}${API_ENDPOINTS.NODE_CONFIG}?nodeId=${encodeURIComponent(selectedNode)}`;
      const res = await authenticatedFetch(url, { method: 'POST', body: JSON.stringify(patch) });
      if (!res.ok) { const t2 = await res.text(); throw new Error(`Save failed (${res.status}): ${t2}`); }
      Alert.alert(t('common.save', 'Saved'), t('admin.configSaved'));
      await Promise.all([fetchNodeConfig(selectedNode), fetchNodes()]);
    } catch (e: any) { Alert.alert(t('common.error', 'Error'), e?.message || t('admin.errors.saveFailed')); }
    finally { setIsSaving(false); }
  };

  // Dynamic theme styles
  const dynamic = {
    container: { ...styles.container, backgroundColor: isDarkMode ? '#111827' : '#F9FAFB' },
    header: { ...styles.header, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderBottomColor: isDarkMode ? '#374151' : '#E5E7EB' },
    title: { ...styles.title, color: isDarkMode ? '#F9FAFB' : '#111827' },
    subtitle: { ...styles.subtitle, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    sectionLabel: { ...styles.sectionLabel, color: isDarkMode ? '#D1D5DB' : '#374151' },
    selector: { ...styles.selector, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderBottomColor: isDarkMode ? '#374151' : '#E5E7EB' },
    card: { ...styles.card, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderColor: isDarkMode ? '#374151' : '#E5E7EB' },
    cardTitle: { ...styles.cardTitle, color: isDarkMode ? '#F9FAFB' : '#111827' },
    smallText: { ...styles.smallText, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    input: { ...styles.input, backgroundColor: isDarkMode ? '#111827' : '#FFFFFF', borderColor: isDarkMode ? '#374151' : '#D1D5DB', color: isDarkMode ? '#F9FAFB' : '#111827' },
    inputLabel: { ...styles.inputLabel, color: isDarkMode ? '#D1D5DB' : '#374151' },
    divider: { ...styles.divider, backgroundColor: isDarkMode ? '#374151' : '#E5E7EB' },
    // Search
    searchInput: { ...styles.searchInput, backgroundColor: isDarkMode ? '#374151' : '#F3F4F6', color: isDarkMode ? '#F9FAFB' : '#111827', borderColor: isDarkMode ? '#4B5563' : '#D1D5DB' },
    dropdownMenu: { ...styles.dropdownMenu, backgroundColor: isDarkMode ? '#374151' : '#FFFFFF', borderColor: isDarkMode ? '#4B5563' : '#D1D5DB' },
    dropdownItem: { ...styles.dropdownItem, borderBottomColor: isDarkMode ? '#4B5563' : '#E5E7EB' },
    dropdownItemText: { ...styles.dropdownItemText, color: isDarkMode ? '#D1D5DB' : '#374151' },
    dropdownItemActive: { backgroundColor: isDarkMode ? '#1E3A8A' : '#EFF6FF' },
    selectedChip: { ...styles.selectedChip, backgroundColor: isDarkMode ? '#3B82F6' : '#2563EB' },
    // Modals
    modalContainer: { ...styles.modalContainer, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF' },
    modalTitle: { ...styles.modalTitle, color: isDarkMode ? '#F9FAFB' : '#111827' },
    modalSubtitle: { ...styles.modalSubtitle, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    modalInput: { ...styles.modalInput, backgroundColor: isDarkMode ? '#111827' : '#F9FAFB', borderColor: isDarkMode ? '#374151' : '#D1D5DB', color: isDarkMode ? '#F9FAFB' : '#111827' },
    modalLabel: { ...styles.modalLabel, color: isDarkMode ? '#D1D5DB' : '#374151' },
    modalPasswordContainer: { ...styles.modalPasswordContainer, backgroundColor: isDarkMode ? '#111827' : '#F9FAFB', borderColor: isDarkMode ? '#374151' : '#D1D5DB' },
    modalPasswordInput: { ...styles.modalPasswordInput, color: isDarkMode ? '#F9FAFB' : '#111827' },
    modalDivider: { ...styles.modalDivider, backgroundColor: isDarkMode ? '#374151' : '#E5E7EB' },
    langButton: { ...styles.langButton, backgroundColor: isDarkMode ? '#374151' : '#F3F4F6', borderColor: isDarkMode ? '#4B5563' : '#D1D5DB' },
    langPickerTitle: { ...styles.langPickerTitle, color: isDarkMode ? '#F9FAFB' : '#111827' },
  };

  const FIELD_GROUPS = [
    { title: t('admin.fieldGroups.nodeIdentity'), fields: [{ key: 'friendlyName', label: t('admin.fields.friendlyName') }, { key: 'node_id', label: t('admin.fields.nodeId') }] },
    { title: t('admin.fieldGroups.wifi'), fields: [{ key: 'wifi_ssid', label: t('admin.fields.wifiSsid') }, { key: 'wifi_password', label: t('admin.fields.wifiPassword'), secure: true }] },
    { title: t('admin.fieldGroups.mqtt'), fields: [{ key: 'mqtt_server', label: t('admin.fields.mqttServer') }, { key: 'mqtt_port', label: t('admin.fields.mqttPort'), keyboard: 'numeric' }, { key: 'mqtt_username', label: t('admin.fields.mqttUsername') }, { key: 'mqtt_password', label: t('admin.fields.mqttPassword'), secure: true }] },
    { title: t('admin.fieldGroups.beacon'), fields: [{ key: 'beacon_majorId', label: t('admin.fields.beaconMajorId'), keyboard: 'numeric' }, { key: 'beacon_minorId', label: t('admin.fields.beaconMinorId'), keyboard: 'numeric' }] },
  ];

  return (
    <>
      {/* Toast notification */}
      <Toast
        visible={showToast}
        message={toastMessage}
        type={toastType}
        onHide={() => setShowToast(false)}
      />

      <ScrollView style={dynamic.container}>
        {/* Header */}
        <View style={dynamic.header}>
          <View style={{ flex: 1 }}>
            <Text style={dynamic.title}>{t('admin.title')}</Text>
            <Text style={dynamic.subtitle}>{t('admin.subtitle')}</Text>
          </View>
          <TouchableOpacity onPress={() => setShowLanguagePicker(true)} style={styles.iconButton}>
            <Ionicons name="language-outline" size={22} color={isDarkMode ? '#A78BFA' : '#7C3AED'} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowCreateAdmin(true)} style={styles.iconButton}>
            <Ionicons name="person-add-outline" size={22} color={isDarkMode ? '#34D399' : '#059669'} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/AdminMapEditor')} style={styles.iconButton}>
            <Ionicons name="map-outline" size={22} color={isDarkMode ? '#FBBF24' : '#6B7280'} />
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleDarkMode} style={styles.iconButton}>
            <Ionicons name={isDarkMode ? 'sunny' : 'moon'} size={22} color={isDarkMode ? '#FBBF24' : '#6B7280'} />
          </TouchableOpacity>
          <TouchableOpacity onPress={fetchNodes} style={styles.iconButton}>
            <Ionicons name="refresh" size={22} color={isDarkMode ? '#93C5FD' : '#2563EB'} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => Alert.alert(t('admin.logout'), t('admin.logoutConfirm'), [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('admin.logout'), style: 'destructive', onPress: async () => { await ApiService.logout(); router.replace('/(tabs)/login'); } },
            ])}
            style={styles.iconButton}>
            <Ionicons name="log-out-outline" size={22} color={isDarkMode ? '#F87171' : '#DC2626'} />
          </TouchableOpacity>
        </View>

        {/* ── Node selector with search bar ─────────────────────────── */}
        <View style={[dynamic.selector, { zIndex: 1000, overflow: 'visible' }]}>
          <Text style={dynamic.sectionLabel}>{t('admin.selectNode')}</Text>

          {isLoadingNodes ? (
            <View style={{ paddingVertical: 12 }}><ActivityIndicator /></View>
          ) : (
            <View style={isPhone ? styles.searchRowPhone : styles.searchRowLaptop}>
              {/* Search input */}
              <View style={isPhone ? styles.searchContainerPhone : styles.searchContainerLaptop}>
                <Ionicons name="search" size={18} color={isDarkMode ? '#9CA3AF' : '#6B7280'} style={styles.searchIcon} accessible={false} />
                <TextInput
                  style={dynamic.searchInput}
                  placeholder={t('summary.searchPlaceholder')}
                  placeholderTextColor={isDarkMode ? '#6B7280' : '#9CA3AF'}
                  value={nodeSearchQuery}
                  onChangeText={setNodeSearchQuery}
                  onFocus={() => setIsNodeDropdownOpen(true)}
                  accessibilityLabel="Search for nodes"
                  accessibilityRole="search"
                  autoCorrect={false}
                  autoCapitalize="none"
                  returnKeyType="search"
                />
              </View>

              {/* Selected node chip */}
              {selectedNode && (
                <TouchableOpacity
                  style={dynamic.selectedChip}
                  onPress={() => setIsNodeDropdownOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`Selected node: ${selectedNodeName}`}>
                  <Ionicons name="radio-button-on" size={14} color="#FFFFFF" />
                  <Text style={styles.selectedChipText} numberOfLines={1}>{selectedNodeName}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Dropdown */}
          {isNodeDropdownOpen && filteredNodes.length > 0 && (
            <View style={[dynamic.dropdownMenu, styles.dropdownPositioned]} accessibilityRole="menu">
              <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {filteredNodes.map((node) => {
                  const id = safeNodeId(node); if (!id) return null;
                  const name = node.friendlyName || id;
                  const isSelected = selectedNode === id;
                  return (
                    <TouchableOpacity key={id}
                      onPress={() => { setSelectedNode(id); setNodeSearchQuery(''); setIsNodeDropdownOpen(false); }}
                      style={[dynamic.dropdownItem, isSelected && dynamic.dropdownItemActive]}
                      accessibilityRole="menuitem"
                      accessibilityLabel={`Select node ${name}`}
                      accessibilityState={{ selected: isSelected }}>
                      <Text style={dynamic.dropdownItemText}>{name}</Text>
                      {isSelected && <Ionicons name="checkmark" size={18} color={isDarkMode ? '#60A5FA' : '#2563EB'} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>
        {/* ─────────────────────────────────────────────────────────── */}

        {/* Health card */}
        <View style={dynamic.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="pulse" size={22} color={isDarkMode ? '#60A5FA' : '#2563EB'} />
            <Text style={dynamic.cardTitle}>{t('admin.systemHealth')}</Text>
          </View>
          <View style={styles.healthRow}>
            <Text style={dynamic.smallText}>{t('admin.battery')}</Text>
            <Text style={[styles.healthValue, { color: batteryColor(selectedNodeObj?.battery) }]}>
              {selectedNodeObj?.battery !== undefined && selectedNodeObj?.battery !== null ? `${selectedNodeObj.battery}%` : t('common.unknown')}
            </Text>
          </View>
          <View style={styles.healthRow}>
            <Text style={dynamic.smallText}>{t('admin.lastHeartbeat')}</Text>
            <Text style={styles.healthValue}>{selectedNodeObj?.lastHeartbeat ? new Date(selectedNodeObj.lastHeartbeat).toLocaleString() : 'N/A'}</Text>
          </View>
          <View style={styles.healthRow}>
            <Text style={dynamic.smallText}>{t('admin.lastSeen')}</Text>
            <Text style={styles.healthValue}>{formatLastSeen(selectedNodeObj?.lastHeartbeat, t)}</Text>
          </View>
        </View>

        {/* Config editor */}
        <View style={dynamic.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="construct" size={22} color={isDarkMode ? '#60A5FA' : '#2563EB'} />
            <Text style={dynamic.cardTitle}>{t('admin.nodeConfiguration')}</Text>
          </View>
          {isLoadingConfig ? (
            <View style={{ paddingVertical: 20 }}>
              <ActivityIndicator />
              <Text style={[styles.centerText, dynamic.smallText]}>{t('admin.loadingConfiguration')}</Text>
            </View>
          ) : !nodeConfig ? (
            <Text style={dynamic.smallText}>{t('admin.selectNodeToView')}</Text>
          ) : (
            <>
              {FIELD_GROUPS.map((group) => (
                <View key={group.title} style={{ marginTop: 14 }}>
                  <Text style={dynamic.sectionLabel}>{group.title}</Text>
                  <View style={dynamic.divider} />
                  {group.fields.map((f: any) => {
                    const isReadOnly = f.key === 'node_id';
                    const value = draft[f.key] ?? '';
                    return (
                      <View key={f.key} style={{ marginTop: 10 }}>
                        <Text style={dynamic.inputLabel}>{f.label}</Text>
                        <TextInput value={value} editable={!isReadOnly && !isSaving}
                          onChangeText={(txt) => setDraft((prev) => ({ ...prev, [f.key]: txt }))}
                          style={[dynamic.input, isReadOnly ? { opacity: 0.6 } : null]}
                          secureTextEntry={!!f.secure} keyboardType={f.keyboard || 'default'} autoCapitalize="none" />
                      </View>
                    );
                  })}
                </View>
              ))}
              <TouchableOpacity onPress={onSave} disabled={isSaving} style={[styles.saveButton, isSaving ? { opacity: 0.7 } : null]}>
                <Ionicons name="save-outline" size={18} color="#FFFFFF" />
                <Text style={styles.saveButtonText}>{isSaving ? t('admin.saving') : t('admin.saveAndPush')}</Text>
              </TouchableOpacity>
              <Text style={[styles.helpText, dynamic.smallText]}>{t('admin.savingHelp')}</Text>
            </>
          )}
        </View>
      </ScrollView>

      {/* Language Picker Modal */}
      <Modal visible={showLanguagePicker} animationType="slide" transparent onRequestClose={() => setShowLanguagePicker(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowLanguagePicker(false)}>
          <View style={[dynamic.modalContainer, styles.langPickerContainer]}>
            <Text style={dynamic.langPickerTitle}>{t('admin.language.selectTitle')}</Text>
            <View style={dynamic.modalDivider} />
            {LANGUAGES.map((lang) => (
              <TouchableOpacity key={lang.code} onPress={() => handleChangeLanguage(lang.code)} style={[dynamic.langButton, { marginBottom: 10 }]}>
                <Text style={{ fontSize: 15, fontWeight: '500', color: isDarkMode ? '#D1D5DB' : '#374151' }}>{lang.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setShowLanguagePicker(false)} style={[styles.saveButton, { marginTop: 12 }]}>
              <Text style={styles.saveButtonText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Create Admin Modal */}
      <Modal visible={showCreateAdmin} animationType="slide" transparent
        onRequestClose={() => { if (!isCreatingAdmin) { setShowCreateAdmin(false); resetCreateAdminForm(); } }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={dynamic.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <View style={styles.modalIconCircle}>
                  <Ionicons name="person-add" size={22} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={dynamic.modalTitle}>{t('admin.createAdmin.title')}</Text>
                  <Text style={dynamic.modalSubtitle}>{t('admin.createAdmin.subtitle')}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => { if (!isCreatingAdmin) { setShowCreateAdmin(false); resetCreateAdminForm(); } }} disabled={isCreatingAdmin} style={styles.modalCloseButton}>
                <Ionicons name="close" size={22} color={isDarkMode ? '#9CA3AF' : '#6B7280'} />
              </TouchableOpacity>
            </View>

            <View style={dynamic.modalDivider} />

            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.securityBanner}>
                <Ionicons name="shield-checkmark" size={14} color="#059669" />
                <Text style={styles.securityBannerText}>{t('admin.createAdmin.securityNotice')}</Text>
              </View>

              <View style={styles.modalFieldContainer}>
                <Text style={dynamic.modalLabel}>{t('admin.createAdmin.usernameLabel')}</Text>
                <TextInput style={dynamic.modalInput} value={newUsername} onChangeText={setNewUsername}
                  placeholder={t('admin.createAdmin.usernamePlaceholder')} placeholderTextColor={isDarkMode ? '#4B5563' : '#9CA3AF'}
                  autoCapitalize="none" editable={!isCreatingAdmin} autoCorrect={false} />
              </View>
              <View style={styles.modalFieldContainer}>
                <Text style={dynamic.modalLabel}>{t('admin.createAdmin.emailLabel')}</Text>
                <TextInput style={dynamic.modalInput} value={newEmail} onChangeText={setNewEmail}
                  placeholder={t('admin.createAdmin.emailPlaceholder')} placeholderTextColor={isDarkMode ? '#4B5563' : '#9CA3AF'}
                  keyboardType="email-address" autoCapitalize="none" editable={!isCreatingAdmin} autoCorrect={false} />
              </View>
              <View style={styles.modalFieldContainer}>
                <Text style={dynamic.modalLabel}>{t('admin.createAdmin.passwordLabel')}</Text>
                <View style={dynamic.modalPasswordContainer}>
                  <TextInput style={dynamic.modalPasswordInput} value={newPassword} onChangeText={setNewPassword}
                    placeholder={t('admin.createAdmin.passwordPlaceholder')} placeholderTextColor={isDarkMode ? '#4B5563' : '#9CA3AF'}
                    secureTextEntry={!showNewPassword} autoCapitalize="none" editable={!isCreatingAdmin} autoCorrect={false} />
                  <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)} style={styles.eyeButton} disabled={isCreatingAdmin}>
                    <Ionicons name={showNewPassword ? 'eye-off' : 'eye'} size={20} color={isDarkMode ? '#6B7280' : '#9CA3AF'} />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.modalFieldContainer}>
                <Text style={dynamic.modalLabel}>{t('admin.createAdmin.confirmPasswordLabel')}</Text>
                <View style={dynamic.modalPasswordContainer}>
                  <TextInput style={dynamic.modalPasswordInput} value={newConfirmPassword} onChangeText={setNewConfirmPassword}
                    placeholder={t('admin.createAdmin.confirmPasswordPlaceholder')} placeholderTextColor={isDarkMode ? '#4B5563' : '#9CA3AF'}
                    secureTextEntry={!showNewConfirmPassword} autoCapitalize="none" editable={!isCreatingAdmin} autoCorrect={false} />
                  <TouchableOpacity onPress={() => setShowNewConfirmPassword(!showNewConfirmPassword)} style={styles.eyeButton} disabled={isCreatingAdmin}>
                    <Ionicons name={showNewConfirmPassword ? 'eye-off' : 'eye'} size={20} color={isDarkMode ? '#6B7280' : '#9CA3AF'} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelButton} onPress={() => { setShowCreateAdmin(false); resetCreateAdminForm(); }} disabled={isCreatingAdmin}>
                  <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.createButton, (isCreatingAdmin || !newUsername || !newPassword || !newConfirmPassword) && styles.createButtonDisabled]}
                  onPress={handleCreateAdmin} disabled={isCreatingAdmin || !newUsername || !newPassword || !newConfirmPassword}>
                  {isCreatingAdmin ? <ActivityIndicator color="#FFFFFF" size="small" /> : (
                    <>
                      <Ionicons name="person-add-outline" size={16} color="#FFFFFF" />
                      <Text style={styles.createButtonText}>{t('admin.createAdmin.createButton')}</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 20, borderBottomWidth: 1 },
  title: { fontSize: 24, fontWeight: 'bold' },
  subtitle: { fontSize: 14, marginTop: 4 },
  iconButton: { padding: 8, marginLeft: 6 },

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
  healthRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  healthValue: { fontSize: 14, fontWeight: '600' },
  inputLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  divider: { height: 1, width: '100%', marginTop: 6 },
  saveButton: { marginTop: 18, backgroundColor: '#2563EB', paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  saveButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  helpText: { marginTop: 10, fontSize: 12, lineHeight: 16 },
  centerText: { textAlign: 'center', marginTop: 10 },

  langPickerContainer: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 34 : 24 },
  langPickerTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  langButton: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContainer: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: Platform.OS === 'ios' ? 34 : 20, maxHeight: '90%', shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 10 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  modalIconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#059669', justifyContent: 'center', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalSubtitle: { fontSize: 12, marginTop: 2 },
  modalCloseButton: { padding: 6, marginLeft: 8 },
  modalDivider: { height: 1, width: '100%' },
  modalScroll: { paddingHorizontal: 20, paddingTop: 16 },
  securityBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#6EE7B7', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 16 },
  securityBannerText: { fontSize: 12, color: '#065F46', fontWeight: '500' },
  modalFieldContainer: { marginBottom: 16 },
  modalLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  modalInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 },
  modalPasswordContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10 },
  modalPasswordInput: { flex: 1, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 },
  eyeButton: { padding: 12 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 4, marginBottom: 8 },
  cancelButton: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#D1D5DB' },
  cancelButtonText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  createButton: { flex: 2, flexDirection: 'row', gap: 8, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#059669' },
  createButtonDisabled: { backgroundColor: '#9CA3AF' },
  createButtonText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});