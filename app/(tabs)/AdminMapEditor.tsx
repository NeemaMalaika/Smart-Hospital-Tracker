import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

import { FloorPlanMap, Point, Room } from '@/components/FloorPlanMap';
import { useAuthenticatedAPI } from '../../hooks/useAuthenticatedAPI';
const API_BASE_URL = 'https://backend.smartenvironment.tech/api/v1';

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

export default function AdminMapEditor({ navigation, route }: any) {
  const { authenticatedFetch, isTokenLoaded } = useAuthenticatedAPI();
  const initialRooms = route?.params?.currentRooms || [];
  const [rooms, setRooms] = useState<Room[]>(initialRooms);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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

  const handleDeleteRoom = () => {
    if (!selectedRoomId) return;
    Alert.alert('Delete Room', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
          setRooms(rooms.filter(r => r.id !== selectedRoomId));
          setSelectedRoomId(null);
      }}
    ]);
  };

  const handleSave = async () => {
    if (!isTokenLoaded) {
      Alert.alert("Error", "Authentication token not ready.");
      return;
    }

    setIsSaving(true);

    try {
      const payload = { rooms }; 
      const response = await authenticatedFetch(`${API_BASE_URL}/node/map`, {
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
        
        if (navigation?.canGoBack()) {
          navigation.goBack();
        }
      } else {
        const errorText = await response.text();
        console.error("Save failed:", errorText);
      }
    } catch (error) {
      console.error("Network error:", error);
    } finally {
      setIsSaving(false);
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
        <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.iconButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Map Editor</Text>
        
        {/* 4. Update Button UI for Loading State */}
        <TouchableOpacity 
          onPress={handleSave} 
          style={[styles.saveButton, isSaving && { opacity: 0.7 }]}
          disabled={isSaving}
        >
          <Text style={styles.saveButtonText}>{isSaving ? "Saving..." : "Save"}</Text>
        </TouchableOpacity>
      </View>

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
            <Text style={styles.emptyText}>Select a room to edit properties</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 60 : 20, paddingBottom: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', zIndex: 10 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  iconButton: { padding: 8 },
  saveButton: { backgroundColor: '#3b82f6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  saveButtonText: { color: '#FFF', fontWeight: '600', fontSize: 14 },
  canvasContainer: { flex: 1, backgroundColor: '#E5E5E5' },
  inspector: { backgroundColor: '#FFFFFF', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 10, minHeight: 340 }, // Increased height for color picker
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
});