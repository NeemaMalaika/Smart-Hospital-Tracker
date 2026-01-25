import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Alert, 
  Platform, 
  Dimensions,
  ActivityIndicator 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const HospitalFloorPlan = () => {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [viewMode, setViewMode] = useState('current'); // 'current' | 'history'
  const [historyData, setHistoryData] = useState([]);
  const [roomTransition, setRoomTransition] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [currentLocations, setCurrentLocations] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [animatingNodes, setAnimatingNodes] = useState({});

  // ============================================================================
  // API CONFIGURATION
  // ============================================================================
  const API_BASE_URL = 'https://backend.smartenvironment.tech/api/v1';
  const API_KEY = '49643a60-0aff-4a88-8e65-30ea428df8ee';
  
  const getHeaders = () => ({
    'Content-Type': 'application/json',
    'API-KEY': API_KEY,
  });

  // ============================================================================
  // HOSPITAL ROOM CONFIGURATION
  // ============================================================================
  const rooms = [
    { id: 'room-101', name: 'Room 101', color: '#10b981', position: 'left', emoji: '🛏️' },
    { id: 'room-102', name: 'Room 102', color: '#3b82f6', position: 'left', emoji: '🛏️' },
    { id: 'room-103', name: 'Room 103', color: '#8b5cf6', position: 'left', emoji: '🛏️' },
    { id: 'room-201', name: 'Room 201', color: '#f59e0b', position: 'right', emoji: '🛏️' },
    { id: 'room-202', name: 'Room 202', color: '#ec4899', position: 'right', emoji: '🛏️' },
    { id: 'room-203', name: 'Room 203', color: '#06b6d4', position: 'right', emoji: '🛏️' },
  ];

  // ============================================================================
  // FETCH DATA ON MOUNT
  // ============================================================================
  useEffect(() => {
    fetchNodes();
  }, []);

  useEffect(() => {
    if (nodes.length > 0) {
      fetchAllCurrentLocations();
      const interval = setInterval(fetchAllCurrentLocations, 5000);
      return () => clearInterval(interval);
    }
  }, [nodes]);

  useEffect(() => {
    if (selectedNode && viewMode === 'history') {
      fetchLocationHistory(selectedNode);
    }
  }, [selectedNode, viewMode]);

  // ============================================================================
  // API FUNCTIONS
  // ============================================================================
  
  const fetchNodes = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE_URL}/nodes`, {
        method: 'GET',
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const nodesList = Array.isArray(data) ? data : (data.nodes || data.data || []);
      
      setNodes(nodesList);
      
      if (nodesList.length > 0 && !selectedNode) {
        const firstNodeId = nodesList[0].id || nodesList[0].nodeId || nodesList[0].uuid;
        setSelectedNode(firstNodeId);
      }
    } catch (error) {
      console.error('Error fetching nodes:', error);
      setError('Failed to fetch nodes from server');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAllCurrentLocations = async () => {
    try {
      const locations = {};
      
      await Promise.all(
        nodes.map(async (node) => {
          const nodeId = node.id || node.nodeId || node.uuid;
          
          try {
            const response = await fetch(
              `${API_BASE_URL}/location/current?nodeId=${nodeId}`,
              {
                method: 'GET',
                headers: getHeaders(),
              }
            );

            if (response.ok) {
              const data = await response.json();
              
              const oldLocation = currentLocations[nodeId]?.roomId;
              const newLocation = data.roomId || data.location || data.room;
              
              if (oldLocation && newLocation && oldLocation !== newLocation) {
                // Trigger animation
                setAnimatingNodes(prev => ({
                  ...prev,
                  [nodeId]: {
                    fromRoom: oldLocation,
                    toRoom: newLocation,
                    startTime: Date.now(),
                  }
                }));

                // Clear animation after it completes
                setTimeout(() => {
                  setAnimatingNodes(prev => {
                    const updated = { ...prev };
                    delete updated[nodeId];
                    return updated;
                  });
                }, 1000);

                setRoomTransition({
                  nodeId,
                  fromRoom: oldLocation,
                  toRoom: newLocation,
                  timestamp: new Date(),
                });
                setTimeout(() => setRoomTransition(null), 2000);
              }
              
              locations[nodeId] = {
                roomId: newLocation,
                timestamp: new Date(data.timestamp || Date.now()),
                active: true,
                rssi: data.rssi || data.wifi_rssi || -50,
              };
            }
          } catch (err) {
            console.error(`Error fetching location for ${nodeId}:`, err);
          }
        })
      );
      
      setCurrentLocations(locations);
    } catch (error) {
      console.error('Error fetching current locations:', error);
    }
  };

  const fetchLocationHistory = async (nodeId) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/location/history?nodeId=${nodeId}`,
        {
          method: 'GET',
          headers: getHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const historyArray = Array.isArray(data) ? data : (data.history || data.data || []);
      
      const processedHistory = historyArray.map(entry => ({
        timestamp: new Date(entry.timestamp || entry.created_at || entry.time),
        roomId: entry.roomId || entry.room || entry.location,
        roomName: rooms.find(r => r.id === (entry.roomId || entry.room))?.name || 'Unknown',
      }));
      
      setHistoryData(processedHistory);
    } catch (error) {
      console.error('Error fetching location history:', error);
      setHistoryData([]);
    }
  };

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================
  
  const getNodesInRoom = (roomId) => {
    return nodes.filter(node => {
      const nodeId = node.id || node.nodeId || node.uuid;
      const location = currentLocations[nodeId];
      return location && location.roomId === roomId;
    });
  };

  const isRoomActive = (roomId) => {
    return getNodesInRoom(roomId).length > 0;
  };

  const getNodeFriendlyName = (node) => {
    const nodeId = node.id || node.nodeId || node.uuid;
    return node.friendlyName || node.name || nodeId;
  };

  const getNodeConfig = (node) => {
    // All nodes are simply staff with 'S' badge
    return { 
      letter: 'S', 
      color: '#8b5cf6' // Purple
    };
  };

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
  };

  // ============================================================================
  // BEACON COMPONENT
  // ============================================================================
  
  const NodeBeacon = ({ node, size = 40 }) => {
    const config = getNodeConfig(node);
    const nodeId = node.id || node.nodeId || node.uuid;
    const isAnimating = animatingNodes[nodeId];
    
    return (
      <View style={[
        styles.beacon,
        { 
          width: size, 
          height: size, 
          backgroundColor: config.color,
          transform: isAnimating ? [{ scale: 1.2 }] : [{ scale: 1 }],
        }
      ]}>
        <Text style={[styles.beaconText, { fontSize: size * 0.5 }]}>
          {config.letter}
        </Text>
        {isAnimating && (
          <View style={[styles.beaconPulse, { 
            width: size * 1.5, 
            height: size * 1.5,
            borderColor: config.color,
          }]} />
        )}
      </View>
    );
  };

  // ============================================================================
  // ROOM CARD COMPONENT
  // ============================================================================
  
  const RoomCard = ({ room }) => {
    const isActive = isRoomActive(room.id);
    const nodesInRoom = getNodesInRoom(room.id);
    const isSelected = selectedRoom === room.id;
    
    return (
      <TouchableOpacity
        style={[
          styles.roomCard,
          { 
            backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF',
            borderColor: isSelected ? room.color : (isDarkMode ? '#374151' : '#E5E7EB'),
            borderWidth: isSelected ? 3 : 1,
          }
        ]}
        onPress={() => setSelectedRoom(room.id)}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel={`${room.name}, ${nodesInRoom.length} device${nodesInRoom.length !== 1 ? 's' : ''}`}
      >
        <View style={styles.roomCardHeader}>
          <Text style={[styles.roomEmoji, { fontSize: 32 }]}>{room.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.roomName, { color: room.color }]}>{room.name}</Text>
            <Text style={[styles.roomStatus, dynamicStyles.subtext]}>
              {nodesInRoom.length} device{nodesInRoom.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <View style={[styles.statusIndicator, { backgroundColor: isActive ? '#22c55e' : '#6b7280' }]} />
        </View>
        
        {/* Visual Beacons */}
        {nodesInRoom.length > 0 && (
          <View style={styles.beaconContainer}>
            {nodesInRoom.map((node) => {
              const nodeId = node.id || node.nodeId || node.uuid;
              
              return (
                <View key={nodeId} style={styles.beaconWrapper}>
                  <NodeBeacon node={node} size={36} />
                  <Text style={[styles.beaconLabel, dynamicStyles.text]} numberOfLines={1}>
                    {getNodeFriendlyName(node)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // ============================================================================
  // RENDER
  // ============================================================================
  
  return (
    <ScrollView style={dynamicStyles.container}>
      {/* HEADER */}
      <View style={dynamicStyles.header}>
        <View style={{ flex: 1 }}>
          <Text style={dynamicStyles.headerTitle}>Hospital Floor Plan</Text>
          <Text style={dynamicStyles.headerSubtitle}>
            Real-time patient and device tracking
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => setIsDarkMode(!isDarkMode)}
          style={styles.iconButton}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <Ionicons
            name={isDarkMode ? 'sunny' : 'moon'}
            size={24}
            color={isDarkMode ? '#FBBF24' : '#6B7280'}
          />
        </TouchableOpacity>
      </View>

      {/* VIEW MODE TOGGLE */}
      <View style={styles.toggleContainer}>
        <TouchableOpacity
          onPress={() => setViewMode('current')}
          style={[
            styles.toggleButton,
            viewMode === 'current' && styles.toggleButtonActive,
            { backgroundColor: viewMode === 'current' ? '#3b82f6' : (isDarkMode ? '#374151' : '#E5E7EB') }
          ]}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Switch to live view"
          accessibilityState={{ selected: viewMode === 'current' }}
        >
          <Ionicons name="pulse" size={18} color={viewMode === 'current' ? '#FFFFFF' : (isDarkMode ? '#9CA3AF' : '#6B7280')} />
          <Text style={[styles.toggleButtonText, { color: viewMode === 'current' ? '#FFFFFF' : (isDarkMode ? '#9CA3AF' : '#6B7280') }]}>
            Live View
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setViewMode('history')}
          style={[
            styles.toggleButton,
            viewMode === 'history' && styles.toggleButtonActive,
            { backgroundColor: viewMode === 'history' ? '#8b5cf6' : (isDarkMode ? '#374151' : '#E5E7EB') }
          ]}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Switch to history view"
          accessibilityState={{ selected: viewMode === 'history' }}
        >
          <Ionicons name="time" size={18} color={viewMode === 'history' ? '#FFFFFF' : (isDarkMode ? '#9CA3AF' : '#6B7280')} />
          <Text style={[styles.toggleButtonText, { color: viewMode === 'history' ? '#FFFFFF' : (isDarkMode ? '#9CA3AF' : '#6B7280') }]}>
            History
          </Text>
        </TouchableOpacity>
      </View>

      {/* NODE SELECTION */}
      <View style={[styles.section, dynamicStyles.card]}>
        <Text style={[styles.sectionLabel, dynamicStyles.text]}>Select Node</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {nodes.map((node) => {
            const nodeId = node.id || node.nodeId || node.uuid;
            const friendlyName = getNodeFriendlyName(node);
            const isSelected = selectedNode === nodeId;
            
            return (
              <TouchableOpacity
                key={nodeId}
                onPress={() => setSelectedNode(nodeId)}
                style={[
                  styles.nodeChip,
                  {
                    backgroundColor: isSelected ? '#3b82f6' : (isDarkMode ? '#374151' : '#F3F4F6'),
                    borderColor: isSelected ? '#3b82f6' : 'transparent',
                  }
                ]}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={friendlyName}
                accessibilityState={{ selected: isSelected }}
              >
                <Ionicons 
                  name="person" 
                  size={16} 
                  color={isSelected ? '#FFFFFF' : (isDarkMode ? '#9CA3AF' : '#6B7280')} 
                />
                <Text style={[styles.nodeChipText, { color: isSelected ? '#FFFFFF' : (isDarkMode ? '#9CA3AF' : '#6B7280') }]}>
                  {friendlyName}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* MOVEMENT ALERT */}
      {roomTransition && (
        <View style={[styles.alert, { backgroundColor: isDarkMode ? '#7c3aed20' : '#ede9fe' }]}>
          <Ionicons name="trending-up" size={20} color="#8b5cf6" />
          <Text style={[styles.alertText, dynamicStyles.text]}>
            Movement: {getNodeFriendlyName(nodes.find(n => (n.id || n.nodeId || n.uuid) === roomTransition.nodeId))} → {rooms.find((r) => r.id === roomTransition.toRoom)?.name}
          </Text>
        </View>
      )}

      {/* LOADING INDICATOR */}
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={[styles.loadingText, dynamicStyles.subtext]}>Loading floor plan data...</Text>
        </View>
      )}

      {/* ERROR MESSAGE */}
      {error && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={24} color="#DC2626" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={fetchNodes} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* FLOOR PLAN VISUAL */}
      <View style={[styles.section, dynamicStyles.card]}>
        <View style={styles.sectionHeader}>
          <Ionicons name="business" size={24} color="#3b82f6" />
          <Text style={[styles.sectionTitle, dynamicStyles.text]}>Floor Layout</Text>
        </View>

        <View style={styles.floorPlanContainer}>
          {/* LEFT SIDE ROOMS */}
          <View style={styles.roomColumn}>
            <Text style={[styles.columnLabel, dynamicStyles.subtext]}>← Left Wing</Text>
            {rooms.filter(r => r.position === 'left').map(room => (
              <RoomCard key={room.id} room={room} />
            ))}
          </View>

          {/* CORRIDOR */}
          <View style={[styles.corridor, { backgroundColor: isDarkMode ? '#374151' : '#E5E7EB' }]}>
            <Ionicons name="arrow-down" size={24} color={isDarkMode ? '#9CA3AF' : '#6B7280'} />
            <Text style={[styles.corridorText, dynamicStyles.subtext]}>CORRIDOR</Text>
            <Ionicons name="arrow-down" size={24} color={isDarkMode ? '#9CA3AF' : '#6B7280'} />
            <View style={styles.entrance}>
              <Ionicons name="door-open" size={20} color={isDarkMode ? '#9CA3AF' : '#6B7280'} />
              <Text style={[styles.entranceText, dynamicStyles.subtext]}>Entrance</Text>
            </View>
          </View>

          {/* RIGHT SIDE ROOMS */}
          <View style={styles.roomColumn}>
            <Text style={[styles.columnLabel, dynamicStyles.subtext]}>Right Wing →</Text>
            {rooms.filter(r => r.position === 'right').map(room => (
              <RoomCard key={room.id} room={room} />
            ))}
          </View>
        </View>
      </View>

      {/* ROOM DETAILS / HISTORY */}
      {viewMode === 'current' ? (
        selectedRoom && (
          <View style={[styles.section, dynamicStyles.card]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="information-circle" size={24} color="#10b981" />
              <Text style={[styles.sectionTitle, dynamicStyles.text]}>
                {rooms.find(r => r.id === selectedRoom)?.name} Details
              </Text>
            </View>

            {getNodesInRoom(selectedRoom).map((node) => {
              const nodeId = node.id || node.nodeId || node.uuid;
              const location = currentLocations[nodeId];
              const friendlyName = getNodeFriendlyName(node);
              const config = getNodeConfig(node);
              
              return (
                <View key={nodeId} style={[styles.detailCard, { backgroundColor: isDarkMode ? '#374151' : '#F9FAFB' }]}>
                  <View style={styles.detailRow}>
                    <NodeBeacon node={node} size={32} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.detailLabel, dynamicStyles.text]}>{friendlyName}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: location?.active ? '#22c55e' : '#6b7280' }]}>
                      <Text style={styles.statusBadgeText}>
                        {location?.active ? 'Active' : 'Inactive'}
                      </Text>
                    </View>
                  </View>
                  {location?.rssi && (
                    <View style={styles.detailRow}>
                      <Ionicons name="wifi" size={16} color={isDarkMode ? '#9CA3AF' : '#6B7280'} />
                      <Text style={[styles.detailText, dynamicStyles.subtext]}>
                        Signal: {location.rssi.toFixed(0)} dBm
                      </Text>
                    </View>
                  )}
                  {location?.timestamp && (
                    <View style={styles.detailRow}>
                      <Ionicons name="time" size={16} color={isDarkMode ? '#9CA3AF' : '#6B7280'} />
                      <Text style={[styles.detailText, dynamicStyles.subtext]}>
                        Updated: {location.timestamp.toLocaleTimeString()}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}

            {getNodesInRoom(selectedRoom).length === 0 && (
              <Text style={[styles.emptyText, dynamicStyles.subtext]}>No devices in this room</Text>
            )}
          </View>
        )
      ) : (
        selectedNode && (
          <View style={[styles.section, dynamicStyles.card]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="time" size={24} color="#8b5cf6" />
              <Text style={[styles.sectionTitle, dynamicStyles.text]}>Location History</Text>
            </View>

            <View style={styles.historyLegend}>
              {nodes.find(n => (n.id || n.nodeId || n.uuid) === selectedNode) && (
                <View style={styles.historyLegendItem}>
                  <NodeBeacon 
                    node={nodes.find(n => (n.id || n.nodeId || n.uuid) === selectedNode)} 
                    size={28} 
                  />
                  <Text style={[styles.historyLegendText, dynamicStyles.text]}>
                    {getNodeFriendlyName(nodes.find(n => (n.id || n.nodeId || n.uuid) === selectedNode))}
                  </Text>
                </View>
              )}
            </View>

            {historyData.length > 0 ? (
              historyData.map((entry, idx) => (
                <View key={idx} style={[styles.historyCard, { backgroundColor: isDarkMode ? '#374151' : '#F9FAFB' }]}>
                  <View style={styles.historyHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons 
                        name="location" 
                        size={16} 
                        color={rooms.find(r => r.id === entry.roomId)?.color || '#6b7280'} 
                      />
                      <Text style={[styles.historyRoom, dynamicStyles.text]}>{entry.roomName}</Text>
                    </View>
                    <Text style={[styles.historyTime, dynamicStyles.subtext]}>
                      {Math.floor(Math.abs(new Date() - entry.timestamp) / 3600000)}h ago
                    </Text>
                  </View>
                  <Text style={[styles.historyTimestamp, dynamicStyles.subtext]}>
                    {entry.timestamp.toLocaleString()}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={[styles.emptyText, dynamicStyles.subtext]}>No history data available</Text>
            )}
          </View>
        )
      )}

      {/* FOOTER */}
      <View style={[styles.footer, dynamicStyles.card]}>
        <View style={styles.footerRow}>
          <View style={styles.statusDot} />
          <Text style={[styles.footerText, dynamicStyles.subtext]}>System Active</Text>
        </View>
        <View style={styles.footerRow}>
          <Ionicons name="pulse" size={14} color={isDarkMode ? '#9CA3AF' : '#6B7280'} />
          <Text style={[styles.footerText, dynamicStyles.subtext]}>
            Active: {Object.values(currentLocations).filter(loc => loc.active).length}/{nodes.length}
          </Text>
        </View>
        <View style={styles.footerRow}>
          <Ionicons name="time" size={14} color={isDarkMode ? '#9CA3AF' : '#6B7280'} />
          <Text style={[styles.footerText, dynamicStyles.subtext]}>
            {new Date().toLocaleTimeString()}
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
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  iconButton: {
    padding: 8,
  },
  toggleContainer: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
  },
  toggleButtonActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    margin: 20,
    marginTop: 0,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  nodeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 2,
    gap: 6,
  },
  nodeChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  alert: {
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 2,
    borderColor: '#8b5cf6',
  },
  alertText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  errorContainer: {
    margin: 20,
    padding: 20,
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DC2626',
    alignItems: 'center',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#DC2626',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  floorPlanContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  roomColumn: {
    flex: 1,
    gap: 12,
  },
  columnLabel: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  corridor: {
    width: 80,
    alignItems: 'center',
    justifyContent: 'space-around',
    borderRadius: 8,
    paddingVertical: 20,
  },
  corridorText: {
    fontSize: 12,
    fontWeight: '700',
    transform: [{ rotate: '90deg' }],
    width: 100,
    textAlign: 'center',
  },
  entrance: {
    alignItems: 'center',
    gap: 4,
  },
  entranceText: {
    fontSize: 10,
    fontWeight: '600',
  },
  roomCard: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  roomCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  roomEmoji: {
    fontSize: 24,
  },
  roomName: {
    fontSize: 16,
    fontWeight: '700',
  },
  roomStatus: {
    fontSize: 12,
    marginTop: 2,
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  beacon: {
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  beaconText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  beaconPulse: {
    position: 'absolute',
    borderRadius: 50,
    borderWidth: 2,
    opacity: 0.6,
  },
  beaconContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    gap: 12,
  },
  beaconWrapper: {
    alignItems: 'center',
    gap: 4,
    maxWidth: 60,
  },
  beaconLabel: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  detailCard: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  detailLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  detailText: {
    fontSize: 13,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 14,
    paddingVertical: 20,
  },
  historyLegend: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderWidth: 1,
    borderColor: '#8b5cf6',
  },
  historyLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  historyLegendText: {
    fontSize: 14,
    fontWeight: '600',
  },
  historyCard: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  historyRoom: {
    fontSize: 14,
    fontWeight: '600',
  },
  historyTime: {
    fontSize: 11,
  },
  historyTimestamp: {
    fontSize: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
    marginBottom: 20,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  footerText: {
    fontSize: 12,
  },
});

export default HospitalFloorPlan;