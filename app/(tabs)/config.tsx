import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API_BASE, API_KEY } from '../../config';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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
import { changeLanguage, SupportedLanguage } from '../../i18n';
import { useAuthenticatedAPI } from '../../hooks/useAuthenticatedAPI';
import ApiService from '../../services/api';
import Toast from '../../components/toast';

const API_ENDPOINTS = { NODES: '/node/list', NODE_CONFIG: '/node/config', NODE_INFO: '/public-display/info' };

// ── Types ──────────────────────────────────────────────────────────────────────
type NodeSummary = { id?: string; nodeId?: string; uuid?: string; friendlyName?: string; battery?: number; lastHeartbeat?: number };
type NodeConfigResponse = { friendlyName?: string; [key: string]: any };
interface NodeInfo {
  nodeId: string; title: string; content: string;
  imageUrl?: string; enabled: boolean; lastUpdated: number;
  visibleMetrics?: string[];
}

// Metric definitions used by the visible-metrics selector
const INFO_METRICS = [
  { id: 'temperature', name: 'Temperature', icon: 'thermometer' as const,  color: '#EF4444' },
  { id: 'humidity',    name: 'Humidity',    icon: 'water' as const,         color: '#3B82F6' },
  { id: 'light',       name: 'Light Level', icon: 'sunny' as const,         color: '#FBBF24' },
  { id: 'noiseLevel',  name: 'Noise Level', icon: 'volume-high' as const,   color: '#F59E0B' },
  { id: 'pressure',    name: 'Pressure',    icon: 'speedometer' as const,   color: '#8B5CF6' },
];

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
  return t ? t('common.daysAgo', { count: Math.floor(hrs / 24) }) : `${Math.floor(hrs / 24)}d ago`;
}

function batteryColor(battery?: number): string {
  if (battery === undefined || battery === null) return '#6B7280';
  if (battery <= 20) return '#DC2626';
  if (battery <= 50) return '#F59E0B';
  return '#10B981';
}

// ============================================================================
// COMPONENT
// ============================================================================
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

  // Search / dropdown
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

  // ── Public Information Board state ─────────────────────────────────────────
  const [nodeInfo, setNodeInfo]                   = useState<NodeInfo | null>(null);
  const [isLoadingInfo, setIsLoadingInfo]         = useState(false);
  const [isSavingInfo, setIsSavingInfo]           = useState(false);
  const [infoDirty, setInfoDirty]                 = useState(false);
  // Form fields (kept in sync with nodeInfo when a node is selected)
  const [infoTitle, setInfoTitle]                 = useState('');
  const [infoContent, setInfoContent]             = useState('');
  const [infoImageUrl, setInfoImageUrl]           = useState('');
  const [infoEnabled, setInfoEnabled]             = useState(true);
  const [infoVisibleMetrics, setInfoVisibleMetrics] = useState<string[]>(INFO_METRICS.map((m) => m.id));

  // Toast
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');

  const showMsg = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage(msg); setToastType(type); setShowToast(true);
  };

  const resetCreateAdminForm = () => { setNewUsername(''); setNewEmail(''); setNewPassword(''); setNewConfirmPassword(''); setShowNewPassword(false); setShowNewConfirmPassword(false); };
  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleCreateAdmin = async () => {
    if (!newUsername.trim() || !newPassword.trim() || !newConfirmPassword.trim()) { showMsg(t('admin.createAdmin.validation.fillRequired'), 'error'); return; }
    if (newUsername.trim().length < 3) { showMsg(t('admin.createAdmin.validation.usernameMinLength'), 'error'); return; }
    if (newEmail.trim() && !validateEmail(newEmail)) { showMsg(t('admin.createAdmin.validation.invalidEmail'), 'error'); return; }
    if (newPassword.length < 8) { showMsg(t('admin.createAdmin.validation.passwordMinLength'), 'error'); return; }
    if (newPassword !== newConfirmPassword) { showMsg(t('admin.createAdmin.validation.passwordsMismatch'), 'error'); return; }
    setIsCreatingAdmin(true);
    try {
      const response = await ApiService.createAccount({ username: newUsername.trim(), password: newPassword, email: newEmail.trim() || undefined });
      if (response.success) {
        showMsg(t('admin.createAdmin.successMessage', { username: newUsername.trim() }), 'success');
        setShowCreateAdmin(false); resetCreateAdminForm();
      } else {
        if (response.message?.includes('log in again') || response.message?.includes('expired')) {
          showMsg(response.message, 'error'); setShowCreateAdmin(false);
          setTimeout(() => router.replace('/login'), 2000);
        } else {
          showMsg(response.message || t('admin.createAdmin.failedDefault'), 'error');
        }
      }
    } catch { showMsg(t('admin.createAdmin.unexpectedError'), 'error'); }
    finally { setIsCreatingAdmin(false); }
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
      const res = await authenticatedFetch(`${API_BASE}${API_ENDPOINTS.NODES}`);
      if (!res.ok) throw new Error(`Nodes fetch failed (${res.status})`);
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
      const url = `${API_BASE}${API_ENDPOINTS.NODE_CONFIG}?nodeId=${encodeURIComponent(nodeId)}`;
      const res = await authenticatedFetch(url);
      if (!res.ok) throw new Error(`Config fetch failed (${res.status})`);
      const json: NodeConfigResponse = await res.json();
      setNodeConfig(json);
      const nextDraft: Record<string, string> = {};
      Object.entries(json).forEach(([k, v]) => { if (v !== null && v !== undefined) nextDraft[k] = String(v); });
      setDraft(nextDraft);
    } catch (e: any) { Alert.alert(t('common.error', 'Error'), e?.message || t('admin.errors.configFetchFailed')); }
    finally { setIsLoadingConfig(false); }
  };

  // ── Fetch node info (admin authenticated) ─────────────────────────────────
  const fetchNodeInfo = async (nodeId: string) => {
    setIsLoadingInfo(true); setNodeInfo(null); setInfoDirty(false);
    console.log('[Config] fetchNodeInfo → GET /public-display/info?nodeId=', nodeId);
    try {
      const res = await authenticatedFetch(`${API_BASE}${API_ENDPOINTS.NODE_INFO}?nodeId=${encodeURIComponent(nodeId)}`);
      console.log('[Config] info status:', res.status);
      if (res.status === 404) {
        // No info yet — prefill blank form
        setNodeInfo(null);
        resetInfoForm(null);
        return;
      }
      if (!res.ok) { console.warn('[Config] info fetch error', res.status); resetInfoForm(null); return; }
      const data = await res.json();
      const info: NodeInfo = data.data || data;
      console.log('[Config] info loaded:', info.title);
      setNodeInfo(info);
      resetInfoForm(info);
    } catch (e: any) {
      console.error('[Config] fetchNodeInfo error:', e?.message);
      resetInfoForm(null);
    } finally { setIsLoadingInfo(false); }
  };

  const resetInfoForm = (info: NodeInfo | null) => {
    setInfoTitle(info?.title ?? '');
    setInfoContent(info?.content ?? '');
    setInfoImageUrl(info?.imageUrl ?? '');
    setInfoEnabled(info?.enabled ?? true);
    setInfoVisibleMetrics(
      info?.visibleMetrics && info.visibleMetrics.length > 0
        ? info.visibleMetrics
        : INFO_METRICS.map((m) => m.id)
    );
    setInfoDirty(false);
  };

  // ── Save info (POST with auth) ─────────────────────────────────────────────
  const saveNodeInfo = async () => {
    if (!selectedNode) return;
    if (!infoTitle.trim() || !infoContent.trim()) { showMsg('Title and content are required', 'error'); return; }
    
    const debugToken = await AsyncStorage.getItem('sessionToken');
    console.log('[Config] saveNodeInfo token check:', debugToken ? `${debugToken.substring(0, 20)}...` : '❌ NULL');

    setIsSavingInfo(true);
    const body = {
      nodeId: selectedNode,
      title: infoTitle.trim(),
      content: infoContent.trim(),
      imageUrl: infoImageUrl.trim() || undefined,
      enabled: infoEnabled,
      visibleMetrics: infoVisibleMetrics,
    };
    console.log('[Config] saveNodeInfo body:', JSON.stringify(body));
    try {
      const res = await authenticatedFetch(`${API_BASE}${API_ENDPOINTS.NODE_INFO}?nodeId=${encodeURIComponent(selectedNode)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      console.log('[Config] save info status:', res.status);
      // Always read the full body so we can see what backend actually says
      const rawText = await res.text().catch(() => '(unreadable)');
      console.log('[Config] save info response body:', rawText);
      if (res.ok) {
        showMsg('Public information saved successfully', 'success');
        fetchNodeInfo(selectedNode);
      } else {
        let errMsg = 'Save failed (' + res.status + ')';
        try { errMsg = JSON.parse(rawText).message || errMsg; } catch {}
        showMsg(errMsg, 'error');
      }
    } catch (e: any) {
      // Fires on network errors, CORS preflight blocks, etc.
      console.error('[Config] saveNodeInfo network error:', e?.message, e);
      showMsg('Network error: ' + (e?.message || 'Could not reach server'), 'error');
    } finally { setIsSavingInfo(false); }
  };

  // ── Delete info (DELETE with auth) ────────────────────────────────────────
  const deleteNodeInfo = () => {
    if (!selectedNode || !nodeInfo) return;
    Alert.alert(
      'Delete Public Information',
      `Remove all public information for "${nodeInfo.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            console.log('[Config] deleteNodeInfo → DELETE /public-display/info?nodeId=', selectedNode);
            try {
              const res = await authenticatedFetch(
                `${API_BASE}${API_ENDPOINTS.NODE_INFO}?nodeId=${encodeURIComponent(selectedNode)}`,
                { method: 'DELETE' }
              );
              console.log('[Config] delete info status:', res.status);
              if (res.ok) {
                showMsg('Public information deleted', 'success');
                setNodeInfo(null); resetInfoForm(null);
              } else {
                showMsg('Failed to delete information', 'error');
              }
            } catch (e: any) {
              console.error('[Config] deleteNodeInfo error:', e?.message);
              showMsg('Failed to delete information', 'error');
            }
          },
        },
      ]
    );
  };

  // ── Toggle a visible metric ────────────────────────────────────────────────
  const toggleInfoMetric = (id: string) => {
    setInfoVisibleMetrics((prev) => prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]);
    setInfoDirty(true);
  };

  // Wire up node selection
  useEffect(() => {
    if (selectedNode) {
      fetchNodeConfig(selectedNode);
      fetchNodeInfo(selectedNode);
    }
  }, [selectedNode, isTokenLoaded]);

  const selectedNodeObj  = useMemo(() => nodes.find((n) => safeNodeId(n) === selectedNode) || null, [nodes, selectedNode]);
  const selectedNodeName = selectedNodeObj?.friendlyName || selectedNode || '';

  const filteredNodes = useMemo(() =>
    nodes.filter((n) => (n.friendlyName || safeNodeId(n) || '').toLowerCase().includes(nodeSearchQuery.toLowerCase())),
    [nodes, nodeSearchQuery]
  );

  // Save / patch node config
  const buildPatch = (): Record<string, string> => {
    if (!nodeConfig) return {};
    const patch: Record<string, string> = {};
    Object.keys(draft).forEach((key) => {
      const original    = nodeConfig[key];
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
      const url = `${API_BASE}${API_ENDPOINTS.NODE_CONFIG}?nodeId=${encodeURIComponent(selectedNode)}`;
      const res = await authenticatedFetch(url, { method: 'POST', body: JSON.stringify(patch) });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      Alert.alert(t('common.save', 'Saved'), t('admin.configSaved'));
      await Promise.all([fetchNodeConfig(selectedNode), fetchNodes()]);
    } catch (e: any) { Alert.alert(t('common.error', 'Error'), e?.message || t('admin.errors.saveFailed')); }
    finally { setIsSaving(false); }
  };

  // ── Dynamic theme styles ───────────────────────────────────────────────────
  const dynamic = {
    container:              { ...styles.container, backgroundColor: isDarkMode ? '#111827' : '#F9FAFB' },
    header:                 { ...styles.header, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderBottomColor: isDarkMode ? '#374151' : '#E5E7EB' },
    title:                  { ...styles.title, color: isDarkMode ? '#F9FAFB' : '#111827' },
    subtitle:               { ...styles.subtitle, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    sectionLabel:           { ...styles.sectionLabel, color: isDarkMode ? '#D1D5DB' : '#374151' },
    selector:               { ...styles.selector, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderBottomColor: isDarkMode ? '#374151' : '#E5E7EB' },
    card:                   { ...styles.card, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderColor: isDarkMode ? '#374151' : '#E5E7EB' },
    cardTitle:              { ...styles.cardTitle, color: isDarkMode ? '#F9FAFB' : '#111827' },
    smallText:              { ...styles.smallText, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    input:                  { ...styles.input, backgroundColor: isDarkMode ? '#111827' : '#FFFFFF', borderColor: isDarkMode ? '#374151' : '#D1D5DB', color: isDarkMode ? '#F9FAFB' : '#111827' },
    textArea:               { ...styles.textArea, backgroundColor: isDarkMode ? '#111827' : '#FFFFFF', borderColor: isDarkMode ? '#374151' : '#D1D5DB', color: isDarkMode ? '#F9FAFB' : '#111827' },
    inputLabel:             { ...styles.inputLabel, color: isDarkMode ? '#D1D5DB' : '#374151' },
    divider:                { ...styles.divider, backgroundColor: isDarkMode ? '#374151' : '#E5E7EB' },
    searchInput:            { ...styles.searchInput, backgroundColor: isDarkMode ? '#374151' : '#F3F4F6', color: isDarkMode ? '#F9FAFB' : '#111827', borderColor: isDarkMode ? '#4B5563' : '#D1D5DB' },
    dropdownMenu:           { ...styles.dropdownMenu, backgroundColor: isDarkMode ? '#374151' : '#FFFFFF', borderColor: isDarkMode ? '#4B5563' : '#D1D5DB' },
    dropdownItem:           { ...styles.dropdownItem, borderBottomColor: isDarkMode ? '#4B5563' : '#E5E7EB' },
    dropdownItemText:       { ...styles.dropdownItemText, color: isDarkMode ? '#D1D5DB' : '#374151' },
    dropdownItemActive:     { backgroundColor: isDarkMode ? '#1E3A8A' : '#EFF6FF' },
    selectedChip:           { ...styles.selectedChip, backgroundColor: isDarkMode ? '#3B82F6' : '#2563EB' },
    modalContainer:         { ...styles.modalContainer, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF' },
    modalTitle:             { ...styles.modalTitle, color: isDarkMode ? '#F9FAFB' : '#111827' },
    modalSubtitle:          { ...styles.modalSubtitle, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    modalInput:             { ...styles.modalInput, backgroundColor: isDarkMode ? '#111827' : '#F9FAFB', borderColor: isDarkMode ? '#374151' : '#D1D5DB', color: isDarkMode ? '#F9FAFB' : '#111827' },
    modalLabel:             { ...styles.modalLabel, color: isDarkMode ? '#D1D5DB' : '#374151' },
    modalPasswordContainer: { ...styles.modalPasswordContainer, backgroundColor: isDarkMode ? '#111827' : '#F9FAFB', borderColor: isDarkMode ? '#374151' : '#D1D5DB' },
    modalPasswordInput:     { ...styles.modalPasswordInput, color: isDarkMode ? '#F9FAFB' : '#111827' },
    modalDivider:           { ...styles.modalDivider, backgroundColor: isDarkMode ? '#374151' : '#E5E7EB' },
    langButton:             { ...styles.langButton, backgroundColor: isDarkMode ? '#374151' : '#F3F4F6', borderColor: isDarkMode ? '#4B5563' : '#D1D5DB' },
    langPickerTitle:        { ...styles.langPickerTitle, color: isDarkMode ? '#F9FAFB' : '#111827' },
    infoCardHeader:         { ...styles.infoCardHeader, backgroundColor: isDarkMode ? '#1E3A5F' : '#EFF6FF', borderBottomColor: isDarkMode ? '#374151' : '#DBEAFE' },
    infoCardHeading:        { fontSize: 18, fontWeight: '700' as const, color: isDarkMode ? '#93C5FD' : '#1D4ED8' },
    metricRow:              { ...styles.metricRow, borderBottomColor: isDarkMode ? '#374151' : '#F3F4F6' },
    metricRowText:          { fontSize: 14, color: isDarkMode ? '#D1D5DB' : '#374151' },
  };

  const FIELD_GROUPS = [
    { title: t('admin.fieldGroups.nodeIdentity'), fields: [{ key: 'friendlyName', label: t('admin.fields.friendlyName') }, { key: 'node_id', label: t('admin.fields.nodeId') }] },
    { title: t('admin.fieldGroups.wifi'), fields: [{ key: 'wifi_ssid', label: t('admin.fields.wifiSsid') }, { key: 'wifi_password', label: t('admin.fields.wifiPassword'), secure: true }] },
    { title: t('admin.fieldGroups.mqtt'), fields: [{ key: 'mqtt_server', label: t('admin.fields.mqttServer') }, { key: 'mqtt_port', label: t('admin.fields.mqttPort'), keyboard: 'numeric' }, { key: 'mqtt_username', label: t('admin.fields.mqttUsername') }, { key: 'mqtt_password', label: t('admin.fields.mqttPassword'), secure: true }] },
    { title: t('admin.fieldGroups.beacon'), fields: [{ key: 'beacon_majorId', label: t('admin.fields.beaconMajorId'), keyboard: 'numeric' }, { key: 'beacon_minorId', label: t('admin.fields.beaconMinorId'), keyboard: 'numeric' }] },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <Toast visible={showToast} message={toastMessage} type={toastType} onHide={() => setShowToast(false)} />

      <ScrollView style={dynamic.container}>
        {/* ── Header ── */}
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

        {/* ── Node selector ── */}
        <View style={[dynamic.selector, { zIndex: 1000, overflow: 'visible' }]}>
          <Text style={dynamic.sectionLabel}>{t('admin.selectNode')}</Text>
          {isLoadingNodes ? (
            <View style={{ paddingVertical: 12 }}><ActivityIndicator /></View>
          ) : (
            <View style={isPhone ? styles.searchRowPhone : styles.searchRowLaptop}>
              <View style={isPhone ? styles.searchContainerPhone : styles.searchContainerLaptop}>
                <Ionicons name="search" size={18} color={isDarkMode ? '#9CA3AF' : '#6B7280'} style={styles.searchIcon} />
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
          {isNodeDropdownOpen && filteredNodes.length > 0 && (
            <View style={[dynamic.dropdownMenu, styles.dropdownPositioned]} accessibilityRole="menu">
              <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {filteredNodes.map((node) => {
                  const id = safeNodeId(node); if (!id) return null;
                  const name = node.friendlyName || id;
                  const isSel = selectedNode === id;
                  return (
                    <TouchableOpacity key={id}
                      onPress={() => { setSelectedNode(id); setNodeSearchQuery(''); setIsNodeDropdownOpen(false); }}
                      style={[dynamic.dropdownItem, isSel && dynamic.dropdownItemActive]}
                      accessibilityRole="menuitem"
                      accessibilityLabel={`Select node ${name}`}
                      accessibilityState={{ selected: isSel }}>
                      <Text style={dynamic.dropdownItemText}>{name}</Text>
                      {isSel && <Ionicons name="checkmark" size={18} color={isDarkMode ? '#60A5FA' : '#2563EB'} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>

        {/* ── System health ── */}
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

        {/* ── Node config editor ── */}
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
                    return (
                      <View key={f.key} style={{ marginTop: 10 }}>
                        <Text style={dynamic.inputLabel}>{f.label}</Text>
                        <TextInput
                          value={draft[f.key] ?? ''} editable={!isReadOnly && !isSaving}
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

        {/* ══════════════════════════════════════════════════════════════════════
            PUBLIC INFORMATION BOARD
            Admin writes the info that appears on the public dashboard.
        ══════════════════════════════════════════════════════════════════════ */}
        <View style={[dynamic.card, { padding: 0, overflow: 'hidden' }]}>
          {/* Card header */}
          <View style={dynamic.infoCardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <Ionicons name="newspaper-outline" size={22} color={isDarkMode ? '#93C5FD' : '#1D4ED8'} />
              <Text style={dynamic.infoCardHeading}>Public Information Board</Text>
            </View>
            {nodeInfo && (
              <View style={[styles.infoBadge, { backgroundColor: infoEnabled ? '#D1FAE5' : '#F3F4F6' }]}>
                <View style={[styles.infoBadgeDot, { backgroundColor: infoEnabled ? '#10B981' : '#9CA3AF' }]} />
                <Text style={[styles.infoBadgeText, { color: infoEnabled ? '#065F46' : '#6B7280' }]}>
                  {infoEnabled ? 'Published' : 'Hidden'}
                </Text>
              </View>
            )}
          </View>

          <View style={{ padding: 16 }}>
            {isLoadingInfo ? (
              <View style={styles.infoLoadingRow}>
                <ActivityIndicator size="small" color="#3B82F6" />
                <Text style={dynamic.smallText}>Loading public info…</Text>
              </View>
            ) : (
              <>
                {/* Status banner when no info exists yet */}
                {!nodeInfo && (
                  <View style={styles.infoEmptyBanner}>
                    <Ionicons name="information-circle-outline" size={18} color="#6B7280" />
                    <Text style={[dynamic.smallText, { flex: 1 }]}>
                      No public information set for this location yet. Fill in the form below and press Save to publish it.
                    </Text>
                  </View>
                )}

                {/* Title */}
                <View style={styles.infoField}>
                  <Text style={dynamic.inputLabel}>Title *</Text>
                  <TextInput
                    style={dynamic.input}
                    value={infoTitle}
                    onChangeText={(v) => { setInfoTitle(v); setInfoDirty(true); }}
                    placeholder="e.g. Lion Enclosure — African Savanna Habitat"
                    placeholderTextColor={isDarkMode ? '#4B5563' : '#9CA3AF'}
                    editable={!isSavingInfo}
                  />
                </View>

                {/* Content */}
                <View style={styles.infoField}>
                  <Text style={dynamic.inputLabel}>Information *</Text>
                  <TextInput
                    style={dynamic.textArea}
                    value={infoContent}
                    onChangeText={(v) => { setInfoContent(v); setInfoDirty(true); }}
                    placeholder="Write details visible to the public, e.g. 'This enclosure is kept at 30°C to mimic natural savanna conditions.'"
                    placeholderTextColor={isDarkMode ? '#4B5563' : '#9CA3AF'}
                    multiline
                    numberOfLines={6}
                    textAlignVertical="top"
                    editable={!isSavingInfo}
                  />
                  <Text style={[dynamic.smallText, { marginTop: 4, fontSize: 11 }]}>{infoContent.length} / 10,000 characters</Text>
                </View>

                {/* Image URL */}
                <View style={styles.infoField}>
                  <Text style={dynamic.inputLabel}>Image URL (optional)</Text>
                  <TextInput
                    style={dynamic.input}
                    value={infoImageUrl}
                    onChangeText={(v) => { setInfoImageUrl(v); setInfoDirty(true); }}
                    placeholder="https://example.com/lion.jpg"
                    placeholderTextColor={isDarkMode ? '#4B5563' : '#9CA3AF'}
                    autoCapitalize="none"
                    editable={!isSavingInfo}
                  />
                </View>

                {/* Enabled toggle */}
                <View style={styles.infoToggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={dynamic.inputLabel}>Visible to public</Text>
                    <Text style={[dynamic.smallText, { fontSize: 12 }]}>
                      When off, the info board is hidden on the public dashboard.
                    </Text>
                  </View>
                  <Switch
                    value={infoEnabled}
                    onValueChange={(v) => { setInfoEnabled(v); setInfoDirty(true); }}
                    trackColor={{ false: '#D1D5DB', true: '#3B82F6' }}
                    thumbColor="#FFFFFF"
                    disabled={isSavingInfo}
                  />
                </View>

                {/* Visible metrics selector */}
                <View style={styles.infoField}>
                  <Text style={dynamic.inputLabel}>Public Sensor Display</Text>
                  <Text style={[dynamic.smallText, { marginBottom: 10, fontSize: 12 }]}>
                    Choose which sensors are shown to the public for this location.
                  </Text>
                  <View style={[styles.metricsGrid, { borderColor: isDarkMode ? '#374151' : '#E5E7EB' }]}>
                    {INFO_METRICS.map((metric) => {
                      const isOn = infoVisibleMetrics.includes(metric.id);
                      return (
                        <TouchableOpacity
                          key={metric.id}
                          onPress={() => toggleInfoMetric(metric.id)}
                          disabled={isSavingInfo}
                          style={[
                            styles.metricChip,
                            {
                              backgroundColor: isOn ? `${metric.color}18` : (isDarkMode ? '#374151' : '#F9FAFB'),
                              borderColor: isOn ? metric.color : (isDarkMode ? '#4B5563' : '#E5E7EB'),
                            },
                          ]}
                        >
                          <Ionicons
                            name={metric.icon}
                            size={16}
                            color={isOn ? metric.color : (isDarkMode ? '#6B7280' : '#9CA3AF')}
                          />
                          <Text style={{ fontSize: 12, fontWeight: '600', color: isOn ? metric.color : (isDarkMode ? '#6B7280' : '#9CA3AF') }}>
                            {metric.name}
                          </Text>
                          {isOn && <Ionicons name="checkmark-circle" size={14} color={metric.color} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <TouchableOpacity
                    onPress={() => { setInfoVisibleMetrics(INFO_METRICS.map((m) => m.id)); setInfoDirty(true); }}
                    style={styles.selectAllBtn}
                  >
                    <Text style={styles.selectAllBtnText}>Select All</Text>
                  </TouchableOpacity>
                </View>

                {/* Action buttons */}
                <View style={styles.infoActions}>
                  {nodeInfo && (
                    <TouchableOpacity onPress={deleteNodeInfo} disabled={isSavingInfo} style={styles.deleteInfoBtn}>
                      <Ionicons name="trash-outline" size={16} color="#FFFFFF" />
                      <Text style={styles.deleteInfoBtnText}>Delete</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={saveNodeInfo}
                    disabled={isSavingInfo || !infoTitle.trim() || !infoContent.trim()}
                    style={[
                      styles.saveInfoBtn,
                      (isSavingInfo || !infoTitle.trim() || !infoContent.trim()) && styles.saveInfoBtnDisabled,
                      infoDirty && infoTitle.trim() && infoContent.trim() && { backgroundColor: '#2563EB' },
                    ]}
                  >
                    {isSavingInfo
                      ? <ActivityIndicator color="#FFFFFF" size="small" />
                      : (
                        <>
                          <Ionicons name="cloud-upload-outline" size={16} color="#FFFFFF" />
                          <Text style={styles.saveInfoBtnText}>{nodeInfo ? 'Update & Publish' : 'Save & Publish'}</Text>
                        </>
                      )
                    }
                  </TouchableOpacity>
                </View>

                {nodeInfo && (
                  <Text style={[dynamic.smallText, { fontSize: 11, textAlign: 'right', marginTop: 6 }]}>
                    Last published: {new Date(nodeInfo.lastUpdated).toLocaleString()}
                  </Text>
                )}
              </>
            )}
          </View>
        </View>

        {/* Bottom padding */}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Language Picker Modal ── */}
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

      {/* ── Create Admin Modal ── */}
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

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  container:  { flex: 1 },
  header:     { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 20, borderBottomWidth: 1 },
  title:      { fontSize: 24, fontWeight: 'bold' },
  subtitle:   { fontSize: 14, marginTop: 4 },
  iconButton: { padding: 8, marginLeft: 6 },

  selector:             { padding: 20, borderBottomWidth: 1 },
  sectionLabel:         { fontSize: 14, fontWeight: '700', marginBottom: 10 },
  searchRowPhone:       { flexDirection: 'column', gap: 10 },
  searchRowLaptop:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  searchContainerPhone: { position: 'relative', width: '100%' },
  searchContainerLaptop:{ position: 'relative', flex: 1, maxWidth: 400 },
  searchIcon:           { position: 'absolute', left: 10, top: 11, zIndex: 1 },
  searchInput:          { paddingLeft: 36, paddingRight: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, fontSize: 14 },
  selectedChip:         { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  selectedChipText:     { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  dropdownMenu:         { borderRadius: 8, borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 20 },
  dropdownPositioned:   { marginTop: 4, zIndex: 9999 },
  dropdownItem:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1 },
  dropdownItemText:     { fontSize: 14 },

  card:        { margin: 20, marginTop: 10, borderRadius: 12, borderWidth: 1, padding: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  cardHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  cardTitle:   { fontSize: 18, fontWeight: '700' },
  smallText:   { fontSize: 13 },
  healthRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  healthValue: { fontSize: 14, fontWeight: '600' },
  inputLabel:  { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input:       { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  textArea:    { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 140 },
  divider:     { height: 1, width: '100%', marginTop: 6 },
  saveButton:  { marginTop: 18, backgroundColor: '#2563EB', paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  saveButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  helpText:    { marginTop: 10, fontSize: 12, lineHeight: 16 },
  centerText:  { textAlign: 'center', marginTop: 10 },

  // ── Public info card ───────────────────────────────────────────────────────
  infoCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  infoBadge:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  infoBadgeDot:   { width: 7, height: 7, borderRadius: 4 },
  infoBadgeText:  { fontSize: 12, fontWeight: '600' },

  infoLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 20 },
  infoEmptyBanner:{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 12, marginBottom: 16 },
  infoField:      { marginBottom: 16 },
  infoToggleRow:  { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },

  metricsGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, borderRadius: 10, marginBottom: 4 },
  metricChip:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5 },
  metricRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1 },

  selectAllBtn:     { alignSelf: 'flex-end', marginTop: 6 },
  selectAllBtnText: { fontSize: 12, color: '#3B82F6', fontWeight: '600' },

  infoActions:        { flexDirection: 'row', gap: 10, marginTop: 8 },
  deleteInfoBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#DC2626', paddingVertical: 12, borderRadius: 10 },
  deleteInfoBtnText:  { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  saveInfoBtn:        { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#3B82F6', paddingVertical: 12, borderRadius: 10 },
  saveInfoBtnDisabled:{ backgroundColor: '#9CA3AF' },
  saveInfoBtnText:    { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },

  // ── Modals ─────────────────────────────────────────────────────────────────
  langPickerContainer:    { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 34 : 24 },
  langPickerTitle:        { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  langButton:             { borderRadius: 10, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14 },
  modalOverlay:           { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContainer:         { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: Platform.OS === 'ios' ? 34 : 20, maxHeight: '90%', shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 10 },
  modalHeader:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  modalTitleRow:          { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  modalIconCircle:        { width: 44, height: 44, borderRadius: 22, backgroundColor: '#059669', justifyContent: 'center', alignItems: 'center' },
  modalTitle:             { fontSize: 18, fontWeight: '700' },
  modalSubtitle:          { fontSize: 12, marginTop: 2 },
  modalCloseButton:       { padding: 6, marginLeft: 8 },
  modalDivider:           { height: 1, width: '100%' },
  modalScroll:            { paddingHorizontal: 20, paddingTop: 16 },
  securityBanner:         { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#6EE7B7', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 16 },
  securityBannerText:     { fontSize: 12, color: '#065F46', fontWeight: '500' },
  modalFieldContainer:    { marginBottom: 16 },
  modalLabel:             { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  modalInput:             { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 },
  modalPasswordContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10 },
  modalPasswordInput:     { flex: 1, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 },
  eyeButton:              { padding: 12 },
  modalActions:           { flexDirection: 'row', gap: 12, marginTop: 4, marginBottom: 8 },
  cancelButton:           { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#D1D5DB' },
  cancelButtonText:       { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  createButton:           { flex: 2, flexDirection: 'row', gap: 8, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#059669' },
  createButtonDisabled:   { backgroundColor: '#9CA3AF' },
  createButtonText:       { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});