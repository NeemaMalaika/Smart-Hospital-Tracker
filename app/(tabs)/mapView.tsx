import { FloorPlanMap, Room } from '@/components/FloorPlanMap';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useAuthenticatedAPI } from '../../hooks/useAuthenticatedAPI';

const HospitalFloorPlan = ({ navigation }: any) => {
  const { isTokenLoaded, authenticatedFetch } = useAuthenticatedAPI();
  const { t } = useTranslation(); 
  const { width: windowWidth } = useWindowDimensions(); 
  const isPhone = windowWidth < 768;

  // ============================================================================
  // STATE 
  // ============================================================================
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState('current');
  const [historyData, setHistoryData] = useState([]);
  const [roomTransition, setRoomTransition] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [currentLocations, setCurrentLocations] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [animatingNodes, setAnimatingNodes] = useState({});
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isMapLoading, setIsMapLoading] = useState(true);
  const [selectedFloor, setSelectedFloor] = useState<number>(0);
  const [availableFloors, setAvailableFloors] = useState<number[]>([]);
  const [floorSearchQuery, setFloorSearchQuery] = useState<string>('');
  const [isFloorDropdownOpen, setIsFloorDropdownOpen] = useState<boolean>(false);

  // ── Search for staff ──────────────────────────────────
  const [staffSearchQuery, setStaffSearchQuery] = useState('');
  const [isStaffDropdownOpen, setIsStaffDropdownOpen] = useState(false);
  // ──────────────────────────────────────────────────────────────────

  const API_BASE_URL = 'https://backend.smartenvironment.tech/api/v1';

  // ============================================================================
  // LOAD MAP 
  // ============================================================================
  useEffect(() => {
    const fetchFloors = async () => {
      if (!isTokenLoaded) return;
      try {
        const response = await authenticatedFetch(`${API_BASE_URL}/node/map-floors`, { method: 'GET' });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        const floorsArray: number[] = Array.isArray(data) ? data : (data.data || []);
        setAvailableFloors(floorsArray);

        if (floorsArray.length > 0 && !floorsArray.includes(selectedFloor)) {
          setSelectedFloor(floorsArray[0]);
        }
      } catch (err) {
        console.error('Error fetching floors:', err);
      }
    };

    fetchFloors();
  }, [isTokenLoaded]);

  useEffect(() => {
    const loadMapData = async () => {
      if (!isTokenLoaded) return;
      try {
        setIsMapLoading(true);
        const response = await authenticatedFetch(`${API_BASE_URL}/node/map?floor=${selectedFloor}`, { method: 'GET' });
        if (response.ok) {
          let data = await response.json();
          if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { console.error('Could not parse map data string:', e); } }
          if (data.data && data.data.rooms) data = data.data;
          if (data && data.rooms && Array.isArray(data.rooms)) setRooms(data.rooms);
          else if (Array.isArray(data)) setRooms(data);
          else console.warn('Incorrect map data format:', JSON.stringify(data, null, 2));
        } else { console.warn(`Map fetch failed: ${response.status}`); }
      } catch (err) { console.error('Failed to load map json from backend', err); }
      finally { setIsMapLoading(false); }
    };
    loadMapData();
  }, [isTokenLoaded, selectedFloor]);

  // ============================================================================
  // FETCH NODES  
  // ============================================================================
  useEffect(() => { if (isTokenLoaded) fetchNodes(); }, [isTokenLoaded]);

  useEffect(() => {
    if (nodes.length > 0 && isTokenLoaded) {
      fetchAllCurrentLocations();
      const interval = setInterval(fetchAllCurrentLocations, 5000);
      return () => clearInterval(interval);
    }
  }, [nodes, isTokenLoaded]);

  useEffect(() => {
    if (selectedNode && viewMode === 'history' && isTokenLoaded) fetchLocationHistory(selectedNode);
  }, [selectedNode, viewMode, isTokenLoaded]);

  // ============================================================================
  // API FUNCTIONS
  // ============================================================================
  const fetchNodes = async () => {
    try {
      if (!isTokenLoaded) return;
      setIsLoading(true); setError(null);
      const response = await authenticatedFetch(`${API_BASE_URL}/node/list`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      const nodesList = Array.isArray(data) ? data : (data.nodes || data.data || []);
      const userNodes = nodesList.filter((node: any) => node.type === 'USER_NODE');
      setNodes(userNodes);
      if (userNodes.length > 0 && !selectedNode) {
        const firstNodeId = userNodes[0].id || userNodes[0].nodeId || userNodes[0].uuid;
        setSelectedNode(firstNodeId);
      }
    } catch (err) {
      console.error('Error fetching nodes:', err);
      setError(t('map.failedFetchNodes'));
    } finally { setIsLoading(false); }
  };

  const fetchAllCurrentLocations = async () => {
    if (!isTokenLoaded) return;
    try {
      const locations = {};
      await Promise.all(
        nodes.map(async (node: any) => {
          const nodeId = node.id || node.nodeId || node.uuid;
          try {
            const response = await authenticatedFetch(`${API_BASE_URL}/location/current?nodeId=${nodeId}`);
            if (response.status === 204) return;
            if (response.ok) {
              const data = await response.json();
              const oldLocation = currentLocations[nodeId]?.location;
              const newLocation = data.location;
              if (oldLocation && newLocation && oldLocation !== newLocation) {
                setAnimatingNodes((prev: any) => ({ ...prev, [nodeId]: { fromRoom: oldLocation, toRoom: newLocation, startTime: Date.now() } }));
                setTimeout(() => { setAnimatingNodes((prev: any) => { const updated = { ...prev }; delete updated[nodeId]; return updated; }); }, 1000);
                setRoomTransition({ nodeId, fromRoom: oldLocation, toRoom: newLocation, timestamp: new Date() });
                setTimeout(() => setRoomTransition(null), 2000);
              }
              locations[nodeId] = { location: newLocation, roomName: newLocation, timestamp: new Date(data.timestamp || Date.now()), active: true, rssi: data.rssi || data.wifi_rssi || -50 };
            }
          } catch (err) { console.error(`Error fetching location for ${nodeId}:`, err); }
        })
      );
      setCurrentLocations(locations);
    } catch (err) { console.error('Error fetching current locations:', err); }
  };

  const fetchLocationHistory = async (nodeId: any) => {
    try {
      if (!isTokenLoaded) return;
      const response = await authenticatedFetch(`${API_BASE_URL}/location/history?nodeId=${nodeId}`);
      if (response.status === 204) { setHistoryData([]); return; }
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      const historyArray = data.history || [];
      const processed: any[] = []; let lastLocation = null;
      historyArray.forEach((entry: any) => {
        if (entry.location !== lastLocation) { processed.push({ timestamp: new Date(entry.timestamp), location: entry.location, roomName: entry.location }); }
        lastLocation = entry.location;
      });
      setHistoryData(processed);
    } catch (err) { console.error('Error fetching location history:', err); setHistoryData([]); }
  };

  // ============================================================================
  // HELPER FUNCTIONS 
  // ============================================================================
  const getNodesInRoom = (roomName: string) =>
    nodes.filter((node: any) => {
      const nodeId = node.id || node.nodeId || node.uuid;
      const locationData = currentLocations[nodeId];
      const room = rooms.find((r) => r.name === roomName || r.id === roomName);
      return locationData && room && locationData.location === room.name;
    });

  const getNodeFriendlyName = (node: any) => {
    const nodeId = node.id || node.nodeId || node.uuid;
    return node.friendlyName || node.name || nodeId;
  };

  const getNodeConfig = (_node: any) => ({ letter: 'S', color: '#8b5cf6' });

  // ============================================================================
  // DYNAMIC STYLES 
  // ============================================================================
  const dynamicStyles = {
    container: { ...styles.container, backgroundColor: isDarkMode ? '#111827' : '#F9FAFB' },
    header: { ...styles.header, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderBottomColor: isDarkMode ? '#374151' : '#E5E7EB' },
    headerTitle: { ...styles.headerTitle, color: isDarkMode ? '#F9FAFB' : '#111827' },
    headerSubtitle: { ...styles.headerSubtitle, color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    card: { ...styles.card, backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF', borderColor: isDarkMode ? '#374151' : '#E5E7EB' },
    cardTitle: { ...styles.cardTitle, color: isDarkMode ? '#F9FAFB' : '#111827' },
    text: { color: isDarkMode ? '#F9FAFB' : '#111827' },
    subtext: { color: isDarkMode ? '#9CA3AF' : '#6B7280' },
    // Search bar
    searchInput: { ...styles.searchInput, backgroundColor: isDarkMode ? '#374151' : '#F3F4F6', color: isDarkMode ? '#F9FAFB' : '#111827', borderColor: isDarkMode ? '#4B5563' : '#D1D5DB' },
    dropdownMenu: { ...styles.dropdownMenu, backgroundColor: isDarkMode ? '#374151' : '#FFFFFF', borderColor: isDarkMode ? '#4B5563' : '#D1D5DB' },
    dropdownItem: { ...styles.dropdownItem, borderBottomColor: isDarkMode ? '#4B5563' : '#E5E7EB' },
    dropdownItemText: { ...styles.dropdownItemText, color: isDarkMode ? '#D1D5DB' : '#374151' },
    dropdownItemActive: { backgroundColor: isDarkMode ? '#1E3A8A' : '#EFF6FF' },
    selectedChip: { ...styles.selectedChip, backgroundColor: isDarkMode ? '#3B82F6' : '#2563EB' },
  };

  // ============================================================================
  // BEACON COMPONENT 
  // ============================================================================
  const NodeBeacon = ({ node, size = 40 }: any) => {
    const config = getNodeConfig(node);
    const nodeId = node.id || node.nodeId || node.uuid;
    const isAnimating = animatingNodes[nodeId];
    return (
      <View style={[styles.beacon, { width: size, height: size, backgroundColor: config.color, transform: isAnimating ? [{ scale: 1.2 }] : [{ scale: 1 }] }]}>
        <Text style={[styles.beaconText, { fontSize: size * 0.5 }]}>{config.letter}</Text>
        {isAnimating && <View style={[styles.beaconPulse, { width: size * 1.5, height: size * 1.5, borderColor: config.color }]} />}
      </View>
    );
  };

  // ============================================================================
  // RENDER
  // ============================================================================
  const roomStats = rooms.reduce((acc, room) => {
    acc[room.name] = getNodesInRoom(room.name).length;
    return acc;
  }, {} as Record<string, number>);

  const selectedNodeObj = nodes.find((n: any) => (n.id || n.nodeId || n.uuid) === selectedNode);
  const selectedNodeName = selectedNodeObj ? getNodeFriendlyName(selectedNodeObj) : t('common.unknown');

  // Filtered nodes for search
  const filteredNodes = nodes.filter((n: any) =>
    getNodeFriendlyName(n).toLowerCase().includes(staffSearchQuery.toLowerCase())
  );

  return (
    <ScrollView style={dynamicStyles.container}>
      {/* HEADER */}
      <View style={dynamicStyles.header}>
        <View style={{ flex: 1 }}>
          <Text style={dynamicStyles.headerTitle}>{t('map.title')}</Text>
          <Text style={dynamicStyles.headerSubtitle}>{t('map.subtitle')}</Text>
        </View>
        <TouchableOpacity onPress={() => setIsDarkMode(!isDarkMode)} style={styles.iconButton}>
          <Ionicons name={isDarkMode ? 'sunny' : 'moon'} size={24} color={isDarkMode ? '#FBBF24' : '#6B7280'} />
        </TouchableOpacity>
      </View>

      {/* VIEW MODE TOGGLE */}
      <View style={styles.toggleContainer}>
        <TouchableOpacity
          onPress={() => setViewMode('current')}
          style={[styles.toggleButton, { backgroundColor: viewMode === 'current' ? '#3b82f6' : (isDarkMode ? '#374151' : '#E5E7EB') }]}>
          <Ionicons name="pulse" size={18} color={viewMode === 'current' ? '#FFFFFF' : (isDarkMode ? '#9CA3AF' : '#6B7280')} />
          <Text style={[styles.toggleButtonText, { color: viewMode === 'current' ? '#FFFFFF' : (isDarkMode ? '#9CA3AF' : '#6B7280') }]}>{t('map.liveView')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setViewMode('history')}
          style={[styles.toggleButton, { backgroundColor: viewMode === 'history' ? '#8b5cf6' : (isDarkMode ? '#374151' : '#E5E7EB') }]}>
          <Ionicons name="time" size={18} color={viewMode === 'history' ? '#FFFFFF' : (isDarkMode ? '#9CA3AF' : '#6B7280')} />
          <Text style={[styles.toggleButtonText, { color: viewMode === 'history' ? '#FFFFFF' : (isDarkMode ? '#9CA3AF' : '#6B7280') }]}>{t('map.history')}</Text>
        </TouchableOpacity>
      </View>

      {/* ── STAFF SELECTOR with Search Bar ────────────────────── */}
      <View style={[styles.section, dynamicStyles.card, { zIndex: 1000, overflow: 'visible' }]}>
        <Text style={[styles.sectionLabel, dynamicStyles.text]}>{t('map.selectStaff')}</Text>

        <View style={isPhone ? styles.searchRowPhone : styles.searchRowLaptop}>
          {/* Search input */}
          <View style={isPhone ? styles.searchContainerPhone : styles.searchContainerLaptop}>
            <Ionicons name="search" size={18} color={isDarkMode ? '#9CA3AF' : '#6B7280'} style={styles.searchIcon} accessible={false} />
            <TextInput
              style={dynamicStyles.searchInput}
              placeholder={t('map.searchPlaceholder')}
              placeholderTextColor={isDarkMode ? '#6B7280' : '#9CA3AF'}
              value={staffSearchQuery}
              onChangeText={setStaffSearchQuery}
              onFocus={() => setIsStaffDropdownOpen(true)}
              accessibilityLabel="Search for staff members"
              accessibilityRole="search"
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
          </View>

          {/* Selected staff chip */}
          {selectedNode && selectedNodeObj && (
            <TouchableOpacity
              style={dynamicStyles.selectedChip}
              onPress={() => setIsStaffDropdownOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`Selected: ${selectedNodeName}`}>
              <Ionicons name="person" size={14} color="#FFFFFF" />
              <Text style={styles.selectedChipText} numberOfLines={1}>{selectedNodeName}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Dropdown */}
        {isStaffDropdownOpen && filteredNodes.length > 0 && (
          <View style={[dynamicStyles.dropdownMenu, styles.dropdownPositioned]} accessibilityRole="menu">
            <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {filteredNodes.map((node: any) => {
                const nodeId = node.id || node.nodeId || node.uuid;
                const name = getNodeFriendlyName(node);
                const isSelected = selectedNode === nodeId;
                return (
                  <TouchableOpacity key={nodeId}
                    onPress={() => { setSelectedNode(nodeId); setStaffSearchQuery(''); setIsStaffDropdownOpen(false); }}
                    style={[dynamicStyles.dropdownItem, isSelected && dynamicStyles.dropdownItemActive]}
                    accessibilityRole="menuitem"
                    accessibilityLabel={`Select ${name}`}
                    accessibilityState={{ selected: isSelected }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="person" size={16} color={isDarkMode ? '#9CA3AF' : '#6B7280'} />
                      <Text style={dynamicStyles.dropdownItemText}>{name}</Text>
                    </View>
                    {isSelected && <Ionicons name="checkmark" size={18} color={isDarkMode ? '#60A5FA' : '#2563EB'} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
      </View>
      {/* ─────────────────────────────────────────────────────────────── */}

      {/* MOVEMENT ALERT */}
      {roomTransition && (
        <View style={[styles.alert, { backgroundColor: isDarkMode ? '#7c3aed20' : '#ede9fe' }]}>
          <Ionicons name="trending-up" size={20} color="#8b5cf6" />
          <Text style={[styles.alertText, dynamicStyles.text]}>
            {t('map.movement')}: {getNodeFriendlyName(nodes.find((n: any) => (n.id || n.nodeId || n.uuid) === roomTransition.nodeId))} → {rooms.find((r) => r.name === roomTransition.toRoom)?.name}
          </Text>
        </View>
      )}

      {/* LOADING */}
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={[styles.loadingText, dynamicStyles.subtext]}>{t('map.loadingData')}</Text>
        </View>
      )}

      {/* ERROR */}
      {error && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={24} color="#DC2626" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={fetchNodes} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>{t('map.retry')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* FLOOR PLAN */}
      <View style={[styles.section, dynamicStyles.card]}>
        {/* FLOOR SELECTOR WITH SEARCH */}
        <View style={{ marginBottom: 12, zIndex: 1000 }}>
          <Text style={[styles.sectionLabel, dynamicStyles.text]}>
            Select Floor
          </Text>

          <View style={{ position: 'relative' }}>
            <Ionicons
              name="search"
              size={18}
              color={isDarkMode ? '#9CA3AF' : '#6B7280'}
              style={{ position: 'absolute', left: 10, top: 11, zIndex: 1 }}
              accessible={false}
            />

            <TextInput
              style={dynamicStyles.searchInput}
              placeholder="Search floors"
              placeholderTextColor={isDarkMode ? '#6B7280' : '#9CA3AF'}
              value={floorSearchQuery}
              onChangeText={setFloorSearchQuery}
              onFocus={() => setIsFloorDropdownOpen(true)}
              accessibilityLabel="Search for floors"
              accessibilityRole="search"
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
          </View>

          {isFloorDropdownOpen && availableFloors.length > 0 && (
            <View
              style={[dynamicStyles.dropdownMenu, { marginTop: 4 }]}
              accessibilityRole="menu"
            >
              <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
                {availableFloors
                  .filter((floor) =>
                    String(floor)
                      .toLowerCase()
                      .includes(floorSearchQuery.toLowerCase())
                  )
                  .map((floor) => {
                    const isSelected = floor === selectedFloor;
                    return (
                      <TouchableOpacity
                        key={floor}
                        onPress={() => {
                          setSelectedFloor(floor);
                          setFloorSearchQuery('');
                          setIsFloorDropdownOpen(false);
                        }}
                        style={[
                          dynamicStyles.dropdownItem,
                          isSelected && dynamicStyles.dropdownItemActive,
                        ]}
                        accessibilityRole="menuitem"
                        accessibilityLabel={`Select floor ${floor}`}
                        accessibilityState={{ selected: isSelected }}
                      >
                        <Text style={dynamicStyles.dropdownItemText}>
                          Floor {floor}
                        </Text>
                        {isSelected && (
                          <Ionicons
                            name="checkmark"
                            size={18}
                            color={isDarkMode ? '#60A5FA' : '#2563EB'}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
              </ScrollView>
            </View>
          )}
        </View>
        <View style={styles.sectionHeader}>
          <Ionicons name="map" size={24} color="#3b82f6" />
          <Text style={[styles.sectionTitle, dynamicStyles.text]}>{t('map.liveFloorPlan')}</Text>
        </View>
        {isMapLoading ? (
          <View style={{ height: 300, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={[dynamicStyles.subtext, { marginTop: 10 }]}>{t('map.loadingMap')}</Text>
          </View>
        ) : (
          <>
            <FloorPlanMap rooms={rooms} stats={roomStats} selectedRoomId={selectedRoom} onRoomSelect={setSelectedRoom} isDarkMode={isDarkMode} />
            <Text style={[styles.subtext, { textAlign: 'center', marginTop: 12, fontSize: 12 }]}>{t('map.pinchToZoom')}</Text>
          </>
        )}
      </View>

      {/* ROOM DETAILS / HISTORY */}
      {viewMode === 'current' ? (
        selectedRoom && (
          <View style={[styles.section, dynamicStyles.card]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="information-circle" size={24} color="#10b981" />
              <Text style={[styles.sectionTitle, dynamicStyles.text]}>
                {rooms.find((r) => r.id === selectedRoom)?.name} {t('map.details')}
              </Text>
            </View>
            {getNodesInRoom(rooms.find((r) => r.id === selectedRoom)?.name || '').map((node: any) => {
              const nodeId = node.id || node.nodeId || node.uuid;
              const location = currentLocations[nodeId];
              return (
                <View key={nodeId} style={[styles.detailCard, { backgroundColor: isDarkMode ? '#374151' : '#F9FAFB' }]}>
                  <View style={styles.detailRow}>
                    <NodeBeacon node={node} size={32} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.detailLabel, dynamicStyles.text]}>{getNodeFriendlyName(node)}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: location?.active ? '#22c55e' : '#6b7280' }]}>
                      <Text style={styles.statusBadgeText}>{location?.active ? t('map.active') : t('map.inactive')}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
            {getNodesInRoom(rooms.find((r) => r.id === selectedRoom)?.name || '').length === 0 && (
              <Text style={[styles.emptyText, dynamicStyles.subtext]}>{t('map.noDevicesInRoom')}</Text>
            )}
          </View>
        )
      ) : (
        selectedNode && (
          <View style={[styles.section, dynamicStyles.card]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="time" size={24} color="#8b5cf6" />
              <Text style={[styles.sectionTitle, dynamicStyles.text]}>{t('map.locationSummary')}</Text>
            </View>
            <View style={styles.historyLegend}>
              {selectedNodeObj && (
                <View style={styles.historyLegendItem}>
                  <NodeBeacon node={selectedNodeObj} size={28} />
                  <Text style={[styles.historyLegendText, dynamicStyles.text]}>{selectedNodeName}</Text>
                </View>
              )}
            </View>
            {historyData.length > 0 ? (
              historyData.map((entry: any, idx: number) => {
                const room = rooms.find((r) => r.name === entry.location);
                return (
                  <View key={idx} style={[styles.historyCard, { backgroundColor: isDarkMode ? '#374151' : '#F9FAFB' }]}>
                    <View style={styles.historyHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="location" size={16} color={room?.color || '#6b7280'} />
                        <Text style={[styles.historyRoom, dynamicStyles.text]}>{entry.roomName}</Text>
                      </View>
                      <Text style={[styles.historyTime, dynamicStyles.subtext]}>
                        {t('map.hoursAgo', { count: Math.floor(Math.abs(new Date().getTime() - entry.timestamp) / 3600000) })}
                      </Text>
                    </View>
                    <Text style={[styles.historyTimestamp, dynamicStyles.subtext]}>{entry.timestamp.toLocaleString()}</Text>
                  </View>
                );
              })
            ) : (
              <Text style={[styles.emptyText, dynamicStyles.subtext]}>{t('map.noHistoryData')}</Text>
            )}
          </View>
        )
      )}

      {/* FOOTER */}
      <View style={[styles.footer, dynamicStyles.card]}>
        <View style={styles.footerRow}>
          <View style={styles.statusDot} />
          <Text style={[styles.footerText, dynamicStyles.subtext]}>{t('map.systemActive')}</Text>
        </View>
        <View style={styles.footerRow}>
          <Ionicons name="pulse" size={14} color={isDarkMode ? '#9CA3AF' : '#6B7280'} />
          <Text style={[styles.footerText, dynamicStyles.subtext]}>
            {t('map.active')}: {Object.values(currentLocations).filter((loc: any) => loc.active).length}/{nodes.length}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 20, borderBottomWidth: 1 },
  headerTitle: { fontSize: 24, fontWeight: 'bold' },
  headerSubtitle: { fontSize: 14, marginTop: 4 },
  iconButton: { padding: 8 },

  toggleContainer: { flexDirection: 'row', padding: 20, gap: 12 },
  toggleButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, gap: 8 },
  toggleButtonText: { fontSize: 14, fontWeight: '600' },

  section: { margin: 20, marginTop: 0, padding: 16, borderRadius: 12, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3.84, elevation: 3 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  sectionLabel: { fontSize: 14, fontWeight: '600', marginBottom: 12 },

  // Search bar
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
  card: { backgroundColor: '#FFFFFF', borderColor: '#E5E7EB' },
  cardTitle: { fontSize: 18, fontWeight: '700' },

  alert: { marginHorizontal: 20, marginBottom: 20, padding: 16, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2, borderColor: '#8b5cf6' },
  alertText: { flex: 1, fontSize: 14, fontWeight: '600' },
  loadingContainer: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, fontSize: 14 },
  errorContainer: { margin: 20, padding: 20, backgroundColor: '#FEE2E2', borderRadius: 12, borderWidth: 1, borderColor: '#DC2626', alignItems: 'center' },
  errorText: { color: '#DC2626', fontSize: 14, marginTop: 8, textAlign: 'center' },
  retryButton: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#DC2626', borderRadius: 8 },
  retryButtonText: { color: '#FFFFFF', fontWeight: '600' },

  beacon: { borderRadius: 50, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 5 },
  beaconText: { color: '#FFFFFF', fontWeight: 'bold' },
  beaconPulse: { position: 'absolute', borderRadius: 50, borderWidth: 2, opacity: 0.6 },

  detailCard: { padding: 12, borderRadius: 8, marginBottom: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  detailLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  emptyText: { textAlign: 'center', fontSize: 14, paddingVertical: 20 },

  historyLegend: { marginBottom: 16, padding: 12, borderRadius: 8, backgroundColor: 'rgba(139, 92, 246, 0.1)', borderWidth: 1, borderColor: '#8b5cf6' },
  historyLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  historyLegendText: { fontSize: 14, fontWeight: '600' },
  historyCard: { padding: 12, borderRadius: 8, marginBottom: 12 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  historyRoom: { fontSize: 14, fontWeight: '600' },
  historyTime: { fontSize: 11 },
  historyTimestamp: { fontSize: 12 },
  subtext: { fontSize: 12 },

  footer: { flexDirection: 'row', justifyContent: 'space-around', padding: 16, marginBottom: 20 },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e' },
  footerText: { fontSize: 12 },
});

export default HospitalFloorPlan;