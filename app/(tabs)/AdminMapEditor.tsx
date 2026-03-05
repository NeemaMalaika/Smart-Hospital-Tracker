import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { API_BASE } from '../../config';

import { FloorPlanMap, Point, Room } from '@/components/FloorPlanMap';
import { useAuthenticatedAPI } from '../../hooks/useAuthenticatedAPI';


const ROOM_COLORS = [
  '#9ca3af',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#f59e0b',
  '#ec4899',
  '#06b6d4',
  '#ef4444',
];

const getBounds = (points: Point[]) => {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
};

export default function AdminMapEditor({ route }: any) {
  const router = useRouter();
  const { authenticatedFetch, isTokenLoaded } = useAuthenticatedAPI();
  
  const initialRooms = route?.params?.currentRooms || [];
  const [rooms, setRooms] = useState<Room[]>(initialRooms);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [pastedJson, setPastedJson] = useState('');
  const [floorInput, setFloorInput] = useState<string>('0');

  const handleLoadFromBackend = async () => {
    if (!isTokenLoaded) {
      console.warn("Auth token not ready");
      return;
    }

    setIsLoading(true);
    try {
      const response = await authenticatedFetch(`${API_BASE}/node/map?floor=${floorInput || 0}`, {
        method: 'GET',
      });

      if (response.ok) {
        let data = await response.json();
        
        if (typeof data === 'string') {
          try { data = JSON.parse(data); } catch (e) {}
        }
        if (data.data) data = data.data;

        const loadedRooms = (data && data.rooms && Array.isArray(data.rooms)) 
          ? data.rooms 
          : (Array.isArray(data) ? data : []);

        if (loadedRooms.length > 0) {
          setRooms(loadedRooms);
          setSelectedRoomId(null); 
          alert("Map loaded successfully from server."); 
        } else {
          alert("No map data found on server.");
        }
      } else {
        alert("Failed to fetch map data from server.");
      }
    } catch (error) {
      console.error("Load error:", error);
      alert("Network error while loading.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!isTokenLoaded) {
      alert("Authentication token not ready.");
      return;
    }

    setIsSaving(true);

    try {
      const payload = { rooms }; 
      const response = await authenticatedFetch(`${API_BASE}/node/map?floor=${floorInput || 0}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        console.log("Map saved successfully");
        if (route?.params?.onSave) {
          route.params.onSave(rooms);
        }
        alert("Map updated successfully.");
      } else {
        const errorText = await response.text();
        console.error("Save failed:", errorText);
        alert("Failed to save map.");
      }
    } catch (error) {
      console.error("Network error:", error);
      alert("Network error while saving.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleParseJson = () => {
    try {
      let data = JSON.parse(pastedJson);
      
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (e) {}
      }
      
      const loadedRooms = (data && data.rooms && Array.isArray(data.rooms)) 
        ? data.rooms 
        : (Array.isArray(data) ? data : []);

      if (loadedRooms.length > 0) {
        setRooms(loadedRooms);
        setSelectedRoomId(null);
        setModalVisible(false);
        setPastedJson('');
        alert("Map loaded from JSON input.");
      } else {
        alert("Invalid JSON format.");
      }
    } catch (error) {
      alert("Invalid JSON string.");
    }
  };

  const handleRoomChange = (updatedRoom: Room) => {
    setRooms(prev => prev.map(r => r.id === updatedRoom.id ? updatedRoom : r));
  };

  const handleAddRoom = () => {
    const allYs = rooms.flatMap(r => r.polygon.map(p => p.y));
    const startY = allYs.length > 0 ? Math.max(...allYs) + 2 : 2;

    const newRoom: Room = {
      id: `room-${Date.now()}`,
      name: 'New Room',
      color: '#9ca3af',
      polygon: [
        { x: 2, y: startY },
        { x: 6, y: startY },
        { x: 6, y: startY + 4 },
        { x: 2, y: startY + 4 },
      ],
    };
    setRooms([...rooms, newRoom]);
    setSelectedRoomId(newRoom.id);
  };

  const handleNewMap = () => {
    if (Platform.OS === 'web') {
      if (!confirm('Create a new empty map? This will delete all current rooms.')) {
        return;
      }
    }
    setRooms([]);
    setSelectedRoomId(null);
  };

  const handleDeleteRoom = () => {
    if (!selectedRoomId) return;
    if (Platform.OS === 'web') {
        if (confirm('Are you sure you want to delete this room?')) {
            setRooms(rooms.filter(r => r.id !== selectedRoomId));
            setSelectedRoomId(null);
        }
    } else {
        setRooms(rooms.filter(r => r.id !== selectedRoomId));
        setSelectedRoomId(null);
    }
  };

  const updateRoomDimensions = (field: 'x' | 'y' | 'w' | 'h', value: string) => {
    if (!selectedRoomId) return;
    const num = parseFloat(value);
    if (isNaN(num)) return;

    setRooms(prev => prev.map(r => {
      if (r.id !== selectedRoomId) return r;
      const bounds = getBounds(r.polygon);
      let { x, y, w, h } = bounds;

      if (field === 'x') x = num;
      if (field === 'y') y = num;
      if (field === 'w') w = Math.max(0.5, num);
      if (field === 'h') h = Math.max(0.5, num);

      return {
        ...r,
        polygon: [
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
        ]
      };
    }));
  };

  const selectedRoom = rooms.find(r => r.id === selectedRoomId);
  const selectedBounds = selectedRoom ? getBounds(selectedRoom.polygon) : null;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Map Editor</Text>
            <Text style={styles.headerSubtitle}>Customise floor plan</Text>
            <View style={{ marginTop: 6 }}>
              <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 2 }}>
                Floor
              </Text>
              <TextInput
                style={{
                  backgroundColor: '#F9FAFB',
                  borderWidth: 1,
                  borderColor: '#E5E7EB',
                  borderRadius: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  fontSize: 12,
                  width: 80,
                  color: '#111827'
                }}
                keyboardType="numeric"
                value={floorInput}
                onChangeText={setFloorInput}
                placeholder="0"
              />
            </View>
          </View>
        </View>
        
        <View style={styles.headerActions}>
          <TouchableOpacity 
            onPress={handleNewMap} 
            style={[styles.saveButton, { marginRight: 6, backgroundColor: '#EF4444' }]}
          >
            <Text style={styles.saveButtonText}>New Map</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => setModalVisible(true)} 
            style={[styles.saveButton, { marginRight: 6 }]}
          >
            <Text style={styles.saveButtonText}>Load from JSON</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={handleLoadFromBackend} 
            style={[styles.saveButton, { marginRight: 6 }]}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.saveButtonText}>Load from Server</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={handleSave} 
            style={[styles.saveButton, isSaving && { opacity: 0.7 }]}
            disabled={isSaving}
          >
            <Text style={styles.saveButtonText}>{isSaving ? "Saving..." : "Save"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Paste Map JSON</Text>
            <TextInput
              style={styles.modalInput}
              multiline
              placeholder='Paste JSON here (e.g. { "rooms": [...] })'
              value={pastedJson}
              onChangeText={setPastedJson}
              textAlignVertical="top"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.cancelBtn]} 
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalBtn, styles.confirmBtn]} 
                onPress={handleParseJson}
              >
                <Text style={styles.confirmBtnText}>Load Map</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.canvasContainer}>
        <FloorPlanMap 
          rooms={rooms}
          selectedRoomId={selectedRoomId}
          onRoomSelect={setSelectedRoomId}
          isDarkMode={false} 
          editable={true}    
          onRoomChange={handleRoomChange}
        />
      </View>
      <View style={styles.inspector}>
        {selectedRoom && selectedBounds ? (
          <View>
            <View style={styles.inspectorHeader}>
              <Text style={styles.inspectorTitle}>Edit Room</Text>
              <TouchableOpacity onPress={handleDeleteRoom}>
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Room Name</Text>
              <TextInput
                style={styles.input}
                value={selectedRoom.name}
                onChangeText={(text) => handleRoomChange({ ...selectedRoom, name: text })}
                placeholder="e.g. Pharmacy"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Room Color</Text>
              <View style={styles.colorRow}>
                {ROOM_COLORS.map((color) => {
                  const isActive = (selectedRoom.color || '#9ca3af') === color;
                  return (
                    <TouchableOpacity
                      key={color}
                      onPress={() => handleRoomChange({ ...selectedRoom, color: color })}
                      style={[
                        styles.colorCircle,
                        { backgroundColor: color },
                        isActive && styles.activeColorCircle
                      ]}
                    />
                  );
                })}
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>Start X (m)</Text>
                <TextInput style={styles.input} value={selectedBounds.x.toFixed(1)} onChangeText={(v) => updateRoomDimensions('x', v)} keyboardType="numeric" />
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>Start Y (m)</Text>
                <TextInput style={styles.input} value={selectedBounds.y.toFixed(1)} onChangeText={(v) => updateRoomDimensions('y', v)} keyboardType="numeric" />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>Width (m)</Text>
                <TextInput style={styles.input} value={selectedBounds.w.toFixed(1)} onChangeText={(v) => updateRoomDimensions('w', v)} keyboardType="numeric" />
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>Height (m)</Text>
                <TextInput style={styles.input} value={selectedBounds.h.toFixed(1)} onChangeText={(v) => updateRoomDimensions('h', v)} keyboardType="numeric" />
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.emptyInspector}>
            <Text style={styles.emptyText}>Select a room to edit properties. Hold Space and drag to move the view.</Text>
            <TouchableOpacity style={styles.addButton} onPress={handleAddRoom}>
              <Ionicons name="add" size={20} color="#FFF" />
              <Text style={styles.addButtonText}>Add New Room</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 20, 
    paddingBottom: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 20, 
    backgroundColor: '#FFFFFF', 
    borderBottomWidth: 1, 
    borderBottomColor: '#E5E7EB', 
    zIndex: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backButton: {
    marginRight: 12,
  },
  headerTitle: { 
    fontSize: 24, 
    fontWeight: 'bold', 
    color: '#111827' 
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  
  saveButton: { backgroundColor: '#3b82f6', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  saveButtonText: { color: '#FFF', fontWeight: '600', fontSize: 12 },

  canvasContainer: { flex: 1, backgroundColor: '#E5E5E5' },
  inspector: { backgroundColor: '#FFFFFF', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 10, minHeight: 340 },
  inspectorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  inspectorTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  inputGroup: { marginBottom: 12 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  col: { flex: 1 },
  label: { fontSize: 12, fontWeight: '600', color: '#6B7280', marginBottom: 4 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 10, fontSize: 14, color: '#111827' },
  emptyInspector: { alignItems: 'center', justifyContent: 'center', paddingVertical: 20 },
  emptyText: { color: '#6B7280', marginBottom: 16 },
  addButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#10B981', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, gap: 8 },
  addButtonText: { color: '#FFF', fontWeight: '600' },
  colorRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  colorCircle: { width: 32, height: 32, borderRadius: 16 },
  activeColorCircle: { borderWidth: 2, borderColor: '#111827' },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { width: '80%', backgroundColor: '#FFF', borderRadius: 12, padding: 20, maxHeight: '80%', elevation: 5, shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.25, shadowRadius: 4 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 15, color: '#111827' },
  modalInput: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 12, height: 200, textAlignVertical: 'top', marginBottom: 20 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  cancelBtn: { backgroundColor: '#F3F4F6' },
  cancelBtnText: { color: '#374151', fontWeight: '600' },
  confirmBtn: { backgroundColor: '#3b82f6' },
  confirmBtnText: { color: '#FFF', fontWeight: '600' },
});