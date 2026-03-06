import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { API_BASE, API_KEY } from '../config';
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';

// ============================================================================
// TYPES
// ============================================================================
interface SummaryMetric {
  id: string;
  unit: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  apiKey: string;
  decimalPlaces: number;
  statusThresholds?: { min: number; max: number; critical: number };
}
interface Node {
  id?: string; nodeId?: string; uuid?: string;
  friendlyName?: string; name?: string; type?: string;
}
interface SensorData { [key: string]: number | null }
interface NodeInfo {
  nodeId: string;
  title: string;
  content: string;
  imageUrl?: string;
  enabled: boolean;
  lastUpdated: number;
  visibleMetrics?: string[];
}

// Node list:      /node/list           — needs API-KEY
// Sensor data:    /sensors/current     — PUBLIC, no auth required
// Info content:   /public-display/info — PUBLIC, no auth required
// ============================================================================
const SENSOR_POLL_MS = 30000;
const INFO_POLL_MS   = 60000;

const ALL_METRICS: SummaryMetric[] = [
  { id: 'temperature', unit: '°C',   icon: 'thermometer', color: '#EF4444', apiKey: 'temperature', decimalPlaces: 1, statusThresholds: { min: 18, max: 24, critical: 26 } },
  { id: 'humidity',    unit: '%',    icon: 'water',        color: '#3B82F6', apiKey: 'humidity',    decimalPlaces: 1, statusThresholds: { min: 30, max: 60, critical: 80 } },
  { id: 'light',       unit: ' lux', icon: 'sunny',        color: '#FBBF24', apiKey: 'light',       decimalPlaces: 0, statusThresholds: { min: 0,  max: 1000, critical: 2000 } },
  { id: 'noiseLevel',  unit: ' dB',  icon: 'volume-high',  color: '#F59E0B', apiKey: 'noiseLevel',  decimalPlaces: 1, statusThresholds: { min: 0,  max: 60,   critical: 85 } },
  { id: 'pressure',    unit: ' kPa', icon: 'speedometer',  color: '#8B5CF6', apiKey: 'pressure',    decimalPlaces: 2, statusThresholds: { min: 98, max: 102,  critical: 104 } },
  { id: 'iaq', unit: 'AQI', icon: 'cloud', color: '#F59E0B', apiKey: 'iaq',decimalPlaces: 0, statusThresholds: { min: 0, max: 100, critical: 150 }, },
];

const METRIC_LABELS: Record<string, string> = {
  temperature: 'Temperature', humidity: 'Humidity',    light: 'Light Level',
  noiseLevel: 'Noise Level',  pressure: 'Pressure',
};

// ============================================================================
// COMPONENT
// ============================================================================
export default function PublicView() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const isPhone  = width < 768;
  const isTablet = width >= 768 && width < 1280;

  const [nodes, setNodes]               = useState<Node[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [sensorData, setSensorData]     = useState<SensorData>({});
  const [nodeInfo, setNodeInfo]         = useState<NodeInfo | null>(null);
  const [infoLoading, setInfoLoading]   = useState(false);
  const [infoError, setInfoError]       = useState<string | null>(null);
  const [lastUpdated, setLastUpdated]   = useState(new Date());
  const [isLoading, setIsLoading]       = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [nodeSearchQuery, setNodeSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen]   = useState(false);

  const selectedNodeRef = useRef<string | null>(null);

  // Which metrics to show — admin can restrict via visibleMetrics, default = all
  const visibleMetrics =
    nodeInfo?.visibleMetrics && nodeInfo.visibleMetrics.length > 0
      ? ALL_METRICS.filter((m) => nodeInfo.visibleMetrics!.includes(m.id))
      : ALL_METRICS;

  // ── Fetch node list (API-KEY required) ───────────────────────────────────
  const fetchNodes = async () => {
    console.log('═══════════════════════════════════════');
    console.log('[PublicView] fetchNodes() called');
    console.log(`[PublicView] URL: GET ${API_BASE}/node/list`);
    console.log(`[PublicView] Headers: { API-KEY: ${API_KEY.slice(0, 8)}... }`);
    try {
      setIsLoading(true); setError(null);
      const res = await fetch(`${API_BASE}/node/list`, {
        headers: { 'API-KEY': API_KEY },
      });
      console.log(`[PublicView] /node/list → HTTP ${res.status} ${res.statusText}`);

      if (res.status === 401) {
        console.error('[PublicView] ❌ 401 UNAUTHORISED on /node/list — API_KEY may be wrong or expired');
        console.error(`[PublicView] API_KEY used: ${API_KEY}`);
        throw new Error('401 Unauthorised — check API_KEY constant');
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      console.log('[PublicView] /node/list raw response:', JSON.stringify(data).slice(0, 300));

      const raw: any[] = Array.isArray(data) ? data : (data.data || data.nodes || []);
      console.log(`[PublicView] Total nodes before filter: ${raw.length}`);

      const rooms: Node[] = raw.filter((n: any) => !n.type || n.type === 'ROOM_NODE');
      console.log(`[PublicView] Room nodes after filter: ${rooms.length}`, rooms.map(n => n.friendlyName || n.name || n.nodeId));

      setNodes(rooms);
      if (rooms.length > 0) {
        const firstId = rooms[0].nodeId || rooms[0].id || rooms[0].uuid || null;
        console.log(`[PublicView] Auto-selecting first node: ${firstId}`);
        selectedNodeRef.current = firstId;
        setSelectedNode(firstId);
      } else {
        console.warn('[PublicView] No room nodes found — check node type values:', raw.map((n: any) => n.type));
        setError('No locations available.');
      }
    } catch (e: any) {
      console.error('[PublicView] fetchNodes FAILED:', e?.message);
      setError('Could not load locations: ' + e?.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Fetch sensor data — PUBLIC, no auth ──────────────────────────────────
  const fetchSensorData = async (nodeIdOverride?: string) => {
    const nodeId = nodeIdOverride ?? selectedNodeRef.current;
    console.log('───────────────────────────────────────');
    console.log(`[PublicView] fetchSensorData() — nodeId: ${nodeId}`);

    if (!nodeId) {
      console.warn('[PublicView] fetchSensorData skipped — no nodeId');
      return;
    }

    const url = `${API_BASE}/sensors/current?nodeId=${nodeId}`;
    console.log(`[PublicView] URL: GET ${url}`);
    console.log('[PublicView] Headers: (none — public endpoint)');

    try {
      const res = await fetch(url, { headers: { 'API-KEY': API_KEY } });
      console.log(`[PublicView] /sensors/current → HTTP ${res.status} ${res.statusText}`);

      if (res.status === 204) {
        console.log('[PublicView] 204 No Content — no sensor readings for this node yet');
        setSensorData({}); setLastUpdated(new Date());
        return;
      }
      if (!res.ok) {
        console.warn(`[PublicView] /sensors/current non-ok: ${res.status}`);
        return;
      }

      const data = await res.json();
      console.log('[PublicView] /sensors/current raw:', JSON.stringify(data).slice(0, 300));
      processSensorResponse(data);
    } catch (e: any) {
      console.error('[PublicView] fetchSensorData FAILED:', e?.message);
    }
  };

  const processSensorResponse = (data: any) => {
    const processed: SensorData = {};
    ALL_METRICS.forEach((m) => {
      let raw = data[m.apiKey];
      if (raw == null) {
        console.log(`[PublicView]   ${m.id}: null/missing in response`);
        processed[m.id] = null;
        return;
      }
      if (m.apiKey === 'pressure') raw = Number(raw) / 1000; // Pa → kPa
      processed[m.id] = parseFloat(raw);
      console.log(`[PublicView]   ${m.id}: ${processed[m.id]}${m.unit}`);
    });
    console.log('[PublicView] Sensor data processed OK:', processed);
    setSensorData(processed);
    setLastUpdated(new Date());
  };

  // ── Fetch info panel ─────────────────────────────────────────────────────
  const fetchNodeInfo = async (nodeIdOverride?: string) => {
    const nodeId = nodeIdOverride ?? selectedNodeRef.current;
    console.log('───────────────────────────────────────');
    console.log(`[PublicView] fetchNodeInfo() — nodeId: ${nodeId}`);

    if (!nodeId) {
      console.warn('[PublicView] fetchNodeInfo skipped — no nodeId');
      return;
    }

    const url = `${API_BASE}/public-display/info?nodeId=${nodeId}`;
    console.log(`[PublicView] URL: GET ${url}`);
    console.log('[PublicView] Headers: (none — public endpoint)');

    setInfoLoading(true); setInfoError(null);
    try {
      const res = await fetch(url, { headers: { 'API-KEY': API_KEY } });
      console.log(`[PublicView] /public-display/info → HTTP ${res.status} ${res.statusText}`);

      if (res.status === 404) {
        console.log('[PublicView] 404 — no info entry for this node yet (expected)');
        setNodeInfo(null); setInfoError(null);
        return;
      }
      if (!res.ok) {
        console.warn(`[PublicView] /public-display/info non-ok: ${res.status}`);
        setNodeInfo(null);
        setInfoError(`Info unavailable (${res.status})`);
        return;
      }

      const data = await res.json();
      console.log('[PublicView] /public-display/info raw:', JSON.stringify(data).slice(0, 400));
      processInfoResponse(data);
    } catch (e: any) {
      console.error('[PublicView] fetchNodeInfo FAILED:', e?.message);
      setNodeInfo(null);
      setInfoError('Could not load location information');
    } finally {
      setInfoLoading(false);
    }
  };

  const processInfoResponse = (data: any) => {
    const info = data.data || data;
    if (info && info.title) {
      console.log(`[PublicView] Info loaded — title: "${info.title}" | visibleMetrics: ${JSON.stringify(info.visibleMetrics)}`);
      // Only update state if something actually changed — prevents glitch on every poll
      setNodeInfo(prev => {
        if (
          prev?.title === info.title &&
          prev?.content === info.content &&
          prev?.imageUrl === info.imageUrl &&
          prev?.lastUpdated === info.lastUpdated
        ) {
          return prev; // nothing changed, keep existing state, no re-render
        }
        return info;
      });
    } else {
      console.warn('[PublicView] Unexpected info shape:', JSON.stringify(data).slice(0, 200));
      setNodeInfo(null);
    }
  };

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    console.log('[PublicView] Component mounted — starting fetchNodes()');
    fetchNodes();
  }, []);

  useEffect(() => {
    if (!selectedNode) return;

    selectedNodeRef.current = selectedNode;
    console.log('═══════════════════════════════════════');
    console.log(`[PublicView] selectedNode changed → "${selectedNode}" — clearing stale data & fetching fresh`);

    setSensorData({}); setNodeInfo(null);

    fetchSensorData(selectedNode);
    fetchNodeInfo(selectedNode);

    const sensorTimer = setInterval(() => fetchSensorData(), SENSOR_POLL_MS);
    const infoTimer   = setInterval(() => fetchNodeInfo(),   INFO_POLL_MS);
    return () => {
      console.log(`[PublicView] Cleaning up timers for node "${selectedNode}"`);
      clearInterval(sensorTimer);
      clearInterval(infoTimer);
    };
  }, [selectedNode]);

  // ── Status helper ─────────────────────────────────────────────────────────
  const getStatus = (value: number | null | undefined, metric: SummaryMetric) => {
    if (value == null) return { label: 'No Data', color: '#6B7280', bgColor: '#F3F4F6' };
    if (!metric.statusThresholds) return { label: 'Normal', color: '#8f10b9ff', bgColor: '#e6d1faff' };
    const { min, max, critical } = metric.statusThresholds;
    if (metric.id === 'battery') {
      if (value <= critical) return { label: 'Critical', color: '#dc6626ff', bgColor: '#feeae2ff' };
      if (value <= min)      return { label: 'Low',      color: '#F59E0B',   bgColor: '#FEF3C7'   };
      return                        { label: 'Normal',   color: '#8f10b9ff', bgColor: '#e6d1faff' };
    }
    if (value > critical) return { label: 'Critical', color: '#dc6626ff', bgColor: '#feeae2ff' };
    if (value > max)      return { label: 'High',     color: '#F59E0B',   bgColor: '#FEF3C7'   };
    if (value < min)      return { label: 'Low',      color: '#3B82F6',   bgColor: '#DBEAFE'   };
    return                       { label: 'Normal',   color: '#8f10b9ff', bgColor: '#e6d1faff' };
  };

  const filteredNodes    = nodes.filter((n) =>
    (n.friendlyName || n.name || n.nodeId || n.id || '').toLowerCase().includes(nodeSearchQuery.toLowerCase())
  );
  const selectedNodeObj  = nodes.find((n) => (n.nodeId || n.id || n.uuid) === selectedNode);
  const selectedNodeName = selectedNodeObj?.friendlyName || selectedNodeObj?.name || selectedNode || '—';

  // ============================================================================
  // METRIC CARD
  // ============================================================================
  const MetricCard = ({ metric }: { metric: SummaryMetric }) => {
    const value  = sensorData[metric.id] ?? null;
    const status = getStatus(value, metric);
    const label  = METRIC_LABELS[metric.id] || metric.id;
    const displayValue =
      value != null
        ? metric.id === 'occupancy'
          ? `${Math.round(value)} ${value === 1 ? 'person' : 'people'}`
          : `${value.toFixed(metric.decimalPlaces)}${metric.unit}`
        : '—';

    // Phone — horizontal row layout
    if (isPhone) {
      return (
        <View style={[styles.card, styles.cardPhone, d.card]}>
          <View style={styles.cardPhoneLeft}>
            <View style={[styles.iconCircle, { backgroundColor: `${metric.color}22` }]}>
              <Ionicons name={metric.icon} size={22} color={metric.color} />
            </View>
            <Text style={[styles.cardTitle, d.cardTitle]} numberOfLines={1}>{label}</Text>
          </View>
          <View style={styles.cardPhoneRight}>
            <Text style={[styles.metricValuePhone, d.metricValuePhone]} numberOfLines={1} adjustsFontSizeToFit>
              {displayValue}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: status.bgColor, borderColor: status.color }]}>
              <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
            </View>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.card, d.card]}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconCircle, { backgroundColor: `${metric.color}22` }]}>
            <Ionicons name={metric.icon} size={24} color={metric.color} />
          </View>
          <Text style={[styles.cardTitle, d.cardTitle]}>{label}</Text>
        </View>
        <Text style={[styles.metricValue, d.metricValue]} numberOfLines={1} adjustsFontSizeToFit>
          {displayValue}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: status.bgColor, borderColor: status.color }]}>
          <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>
    );
  };

  // ============================================================================
  // INFO BOARD
  // ============================================================================
  const InfoBoard = () => (
    <View style={[styles.infoBoardWrapper, d.infoBoardWrapper]}>
      <View style={[styles.infoBoardHeader, d.infoBoardHeader]}>
        <Ionicons name="information-circle" size={20} color={isDark ? '#93C5FD' : '#3B82F6'} />
        <Text style={[styles.infoBoardHeading, d.infoBoardHeading]}>Location Information</Text>
        {infoLoading && <ActivityIndicator size="small" color={isDark ? '#93C5FD' : '#3B82F6'} style={{ marginLeft: 8 }} />}
      </View>

      {infoLoading && !nodeInfo ? (
        <View style={styles.infoBoardEmpty}>
          <ActivityIndicator color={isDark ? '#93C5FD' : '#3B82F6'} />
          <Text style={[styles.infoBoardEmptyText, d.infoBoardEmptyText]}>Loading…</Text>
        </View>
      ) : nodeInfo ? (
        <View style={styles.infoBoardContent}>
          <Text style={[styles.infoBoardTitle, d.infoBoardTitle]}>{nodeInfo.title}</Text>
          <View style={[styles.infoBoardDivider, d.infoBoardDivider]} />
          <Text style={[styles.infoBoardBody, d.infoBoardBody]}>{nodeInfo.content}</Text>
          {nodeInfo.imageUrl ? (
            <View style={styles.infoBoardImageContainer}>
              <Image
                source={{ uri: nodeInfo.imageUrl }}
                style={styles.infoBoardImage}
                resizeMode="cover"
              />
            </View>
          ) : null}
          <Text style={[styles.infoBoardTimestamp, d.infoBoardTimestamp]}>
            Last updated: {new Date(nodeInfo.lastUpdated).toLocaleString()}
          </Text>
        </View>
      ) : (
        <View style={styles.infoBoardEmpty}>
          <Ionicons name="document-text-outline" size={36} color={isDark ? '#4B5563' : '#D1D5DB'} />
          <Text style={[styles.infoBoardEmptyText, d.infoBoardEmptyText]}>
            {infoError || 'No information has been added for this location yet.'}
          </Text>
          <Text style={[styles.infoBoardEmptyHint, d.infoBoardEmptyHint]}>
            An admin can add details about this location from the Admin panel.
          </Text>
        </View>
      )}
    </View>
  );

  // ── Dark mode dynamic styles ──────────────────────────────────────────────
  const d = {
    container:             { backgroundColor: isDark ? '#111827' : '#F9FAFB' },
    header:                { backgroundColor: isDark ? '#1F2937' : '#FFFFFF', borderBottomColor: isDark ? '#374151' : '#E5E7EB' },
    headerTitle:           { color: isDark ? '#F9FAFB' : '#111827' },
    headerSubtitle:        { color: isDark ? '#9CA3AF' : '#6B7280' },
    backButton:            { color: isDark ? '#9CA3AF' : '#6B7280' },
    controlBar:            { backgroundColor: isDark ? '#1F2937' : '#FFFFFF', borderBottomColor: isDark ? '#374151' : '#E5E7EB' },
    searchInput:           { backgroundColor: isDark ? '#374151' : '#F3F4F6', color: isDark ? '#F9FAFB' : '#111827', borderColor: isDark ? '#4B5563' : '#D1D5DB' },
    dropdownMenu:          { backgroundColor: isDark ? '#1F2937' : '#FFFFFF', borderColor: isDark ? '#374151' : '#D1D5DB' },
    dropdownItem:          { borderBottomColor: isDark ? '#374151' : '#F3F4F6' },
    dropdownItemActive:    { backgroundColor: isDark ? '#1E3A8A' : '#EFF6FF' },
    dropdownItemText:      { color: isDark ? '#D1D5DB' : '#374151' },
    dropdownItemTextActive:{ color: isDark ? '#93C5FD' : '#2563EB' },
    card:                  { backgroundColor: isDark ? '#1F2937' : '#FFFFFF', borderColor: isDark ? '#374151' : '#E5E7EB' },
    cardTitle:             { color: isDark ? '#F9FAFB' : '#111827' },
    metricValue:           { color: isDark ? '#F9FAFB' : '#111827' },
    metricValuePhone:      { color: isDark ? '#F9FAFB' : '#111827' },
    infoBoardWrapper:      { backgroundColor: isDark ? '#1F2937' : '#FFFFFF', borderColor: isDark ? '#374151' : '#E5E7EB' },
    infoBoardHeader:       { backgroundColor: isDark ? '#1E3A8A' : '#EFF6FF', borderBottomColor: isDark ? '#1D4ED8' : '#DBEAFE' },
    infoBoardHeading:      { color: isDark ? '#93C5FD' : '#1D4ED8' },
    infoBoardTitle:        { color: isDark ? '#F9FAFB' : '#111827' },
    infoBoardDivider:      { backgroundColor: isDark ? '#374151' : '#E5E7EB' },
    infoBoardBody:         { color: isDark ? '#D1D5DB' : '#374151' },
    infoBoardTimestamp:    { color: isDark ? '#6B7280' : '#9CA3AF' },
    infoBoardEmptyText:    { color: isDark ? '#9CA3AF' : '#6B7280' },
    infoBoardEmptyHint:    { color: isDark ? '#6B7280' : '#9CA3AF' },
    loadingText:           { color: isDark ? '#9CA3AF' : '#6B7280' },
    footerText:            { color: isDark ? '#6B7280' : '#9CA3AF' },
  };

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <View style={[styles.container, d.container]}>
      {/* ── Header ── */}
      <View style={[styles.header, d.header]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={isDark ? '#9CA3AF' : '#6B7280'} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, d.headerTitle]}>Live Dashboard</Text>
          <Text style={[styles.headerSubtitle, d.headerSubtitle]}>Public view · read only</Text>
        </View>
      </View>

      {/* ── Node selector ── */}
      <View style={[styles.controlBar, d.controlBar]}>
        <View style={isPhone ? styles.nodeRowPhone : styles.nodeRowLaptop}>
          <View style={isPhone ? styles.searchContainerPhone : styles.searchContainerLaptop}>
            <Ionicons name="search" size={16} color={isDark ? '#6B7280' : '#9CA3AF'} style={styles.searchIcon} />
            <TextInput
              style={[styles.searchInput, d.searchInput]}
              placeholder="Search locations…"
              placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
              value={nodeSearchQuery}
              onChangeText={setNodeSearchQuery}
              onFocus={() => setIsDropdownOpen(true)}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
          {selectedNode && (
            <TouchableOpacity style={styles.selectedChip} onPress={() => setIsDropdownOpen(true)}>
              <Ionicons name="radio-button-on" size={13} color="#FFFFFF" />
              <Text style={styles.selectedChipText} numberOfLines={1}>{selectedNodeName}</Text>
            </TouchableOpacity>
          )}
        </View>

        {isDropdownOpen && filteredNodes.length > 0 && (
          <View style={[styles.dropdownMenu, d.dropdownMenu]}>
            <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {filteredNodes.map((n) => {
                const id  = n.nodeId || n.id || n.uuid;
                const nm  = n.friendlyName || n.name || id;
                const sel = selectedNode === id;
                return (
                  <TouchableOpacity key={id}
                    onPress={() => {
                      console.log(`[PublicView] User selected node: ${id} (${nm})`);
                      setSelectedNode(id || null);
                      setNodeSearchQuery('');
                      setIsDropdownOpen(false);
                    }}
                    style={[styles.dropdownItem, d.dropdownItem, sel && { ...styles.dropdownItemActive, ...d.dropdownItemActive }]}>
                    <Text style={[styles.dropdownItemText, d.dropdownItemText, sel && d.dropdownItemTextActive]}>{nm}</Text>
                    {sel && <Ionicons name="checkmark" size={16} color={isDark ? '#93C5FD' : '#2563EB'} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
      </View>

      {/* ── Main scroll area ── */}
      <ScrollView contentContainerStyle={[styles.scrollContent, d.container]}>

        {isLoading && nodes.length === 0 && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={isDark ? '#60A5FA' : '#2563EB'} />
            <Text style={[styles.loadingText, d.loadingText]}>Loading locations…</Text>
          </View>
        )}

        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={22} color="#DC2626" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={fetchNodes} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {selectedNode && !isLoading && (
          <>
            {isPhone ? (
              // ── Phone: stacked layout ──────────────────────────────────
              <>
                {visibleMetrics.length > 0 ? (
                  <View style={styles.gridPhone}>
                    {visibleMetrics.map((m) => <MetricCard key={m.id} metric={m} />)}
                  </View>
                ) : (
                  <View style={styles.centered}>
                    <Ionicons name="eye-off-outline" size={36} color="#9CA3AF" />
                    <Text style={styles.loadingText}>No sensor data configured for public view.</Text>
                  </View>
                )}
                <InfoBoard />
              </>
            ) : (
              // ── Tablet / Desktop: side-by-side layout ─────────────────
              <View style={styles.sideBySideContainer}>

                {/* Left column — sensor cards in a 2-col wrapping grid */}
                <View style={styles.leftColumn}>
                  {visibleMetrics.length > 0 ? (
                    <View style={styles.gridSideBySide}>
                      {visibleMetrics.map((m) => <MetricCard key={m.id} metric={m} />)}
                    </View>
                  ) : (
                    <View style={styles.centered}>
                      <Ionicons name="eye-off-outline" size={36} color="#9CA3AF" />
                      <Text style={styles.loadingText}>No sensor data configured for public view.</Text>
                    </View>
                  )}
                </View>

                {/* Right column — info board, fixed width */}
                <View style={isTablet ? styles.rightColumnTablet : styles.rightColumnDesktop}>
                  <InfoBoard />
                </View>

              </View>
            )}
          </>
        )}

        <View style={styles.footer}>
          <View style={styles.footerDot} />
          <Text style={[styles.footerText, d.footerText]}>
            Sensors update every 30s · Info updates every 60s · Last: {lastUpdated.toLocaleTimeString()}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#F9FAFB' },

  header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, paddingTop: Platform.OS === 'ios' ? 58 : 14, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backButton:     { padding: 6, marginRight: 8 },
  headerTitle:    { fontSize: 18, fontWeight: '700', color: '#111827' },
  headerSubtitle: { fontSize: 12, color: '#6B7280', marginTop: 1 },

  controlBar:            { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', zIndex: 1000, overflow: 'visible' },
  nodeRowPhone:          { flexDirection: 'column', gap: 8 },
  nodeRowLaptop:         { flexDirection: 'row', alignItems: 'center', gap: 12 },
  searchContainerPhone:  { position: 'relative', width: '100%' },
  searchContainerLaptop: { position: 'relative', flex: 1, maxWidth: 400 },
  searchIcon:            { position: 'absolute', left: 10, top: 10, zIndex: 1 },
  searchInput:           { paddingLeft: 34, paddingRight: 12, paddingVertical: 9, backgroundColor: '#F3F4F6', borderRadius: 8, borderWidth: 1, borderColor: '#D1D5DB', fontSize: 14, color: '#111827' },
  selectedChip:          { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#2563EB', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  selectedChipText:      { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },

  dropdownMenu:          { marginTop: 4, backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#D1D5DB', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 20, zIndex: 9999 },
  dropdownItem:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  dropdownItemActive:    { backgroundColor: '#EFF6FF' },
  dropdownItemText:      { fontSize: 14, color: '#374151' },
  dropdownItemTextActive:{ color: '#2563EB', fontWeight: '600' },

  scrollContent: { paddingBottom: 32 },

  // ── Side-by-side layout (tablet / desktop) ───────────────────────────────
  sideBySideContainer: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, gap: 16 },
  leftColumn:          { flex: 1 },
  rightColumnTablet:   { flex: 1 },
  rightColumnDesktop:  { flex: 1 },

  // ── Sensor grids ─────────────────────────────────────────────────────────
  gridPhone:      { padding: 12, gap: 12, flexDirection: 'column' },
  gridSideBySide: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignContent: 'stretch' },

  // ── Metric card ──────────────────────────────────────────────────────────
  // flex:1 + minWidth means 2 cards per row inside the left column
  card:          { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', padding: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2, alignItems: 'center', flexBasis: '47%', flexGrow: 1, maxWidth: '50%', minHeight: 140 },
  cardPhone:     { width: '100%', flexBasis: 'auto', flexGrow: 0, maxWidth: '100%', minHeight: 0, flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
  cardPhoneLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: 12 },
  cardPhoneRight:{ alignItems: 'flex-end', gap: 6, flexShrink: 0 },
  cardHeader:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, width: '100%' },
  iconCircle:    { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  cardTitle:     { fontSize: 14, fontWeight: '700', color: '#111827', flex: 1 },
  metricValue:   { fontSize: 28, fontWeight: 'bold', color: '#111827', textAlign: 'center', marginBottom: 10 },
  metricValuePhone: { fontSize: 20, fontWeight: 'bold', color: '#111827', textAlign: 'right' },
  statusBadge:   { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 14, borderWidth: 1 },
  statusText:    { fontSize: 11, fontWeight: '600' },

  // ── Info board ───────────────────────────────────────────────────────────
  infoBoardWrapper:       { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2, overflow: 'hidden', marginHorizontal: 12, marginTop: 8, marginBottom: 4 },
  infoBoardHeader:        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#EFF6FF', borderBottomWidth: 1, borderBottomColor: '#DBEAFE' },
  infoBoardHeading:       { fontSize: 15, fontWeight: '700', color: '#1D4ED8', flex: 1 },
  infoBoardContent:       { padding: 20 },
  infoBoardTitle:         { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 10 },
  infoBoardDivider:       { height: 1, backgroundColor: '#E5E7EB', marginBottom: 14 },
  infoBoardBody:          { fontSize: 14, color: '#374151', lineHeight: 22 },
  infoBoardImageContainer:{ alignItems: 'center', marginTop: 16 },
  infoBoardImage:         { width: '100%', maxWidth: 560, height: 320, maxHeight: 380, borderRadius: 10, alignSelf: 'center' },
  infoBoardTimestamp:     { fontSize: 11, color: '#9CA3AF', marginTop: 16, textAlign: 'right' },
  infoBoardEmpty:         { padding: 32, alignItems: 'center', gap: 10 },
  infoBoardEmptyText:     { fontSize: 14, color: '#6B7280', textAlign: 'center', fontWeight: '500' },
  infoBoardEmptyHint:     { fontSize: 12, color: '#9CA3AF', textAlign: 'center' },

  centered:    { padding: 40, alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: '#6B7280', textAlign: 'center' },
  errorBox:    { margin: 16, padding: 20, backgroundColor: '#FEE2E2', borderRadius: 12, borderWidth: 1, borderColor: '#DC2626', alignItems: 'center', gap: 8 },
  errorText:   { color: '#DC2626', fontSize: 14, textAlign: 'center' },
  retryButton: { paddingHorizontal: 20, paddingVertical: 8, backgroundColor: '#DC2626', borderRadius: 8 },
  retryText:   { color: '#FFFFFF', fontWeight: '600' },

  footer:    { flexDirection: 'row', alignItems: 'center', padding: 16, marginTop: 8, gap: 6 },
  footerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  footerText:{ fontSize: 11, color: '#9CA3AF' },
});