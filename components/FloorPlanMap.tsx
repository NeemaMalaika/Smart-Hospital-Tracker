import React, { useRef } from 'react';
import { Animated, Dimensions, Platform, StyleSheet } from 'react-native';
import {
  GestureHandlerRootView,
  PanGestureHandler,
  PanGestureHandlerStateChangeEvent,
  PinchGestureHandler,
  PinchGestureHandlerStateChangeEvent,
  State,
} from 'react-native-gesture-handler';
import Svg, { Circle, G, Polygon, Text as SvgText } from 'react-native-svg';

const { width } = Dimensions.get('window');

export interface Point {
  x: number;
  y: number;
}

export interface Room {
  id: string;
  name: string;
  polygon: Point[];
  color?: string;
}

interface FloorPlanMapProps {
  rooms: Room[];
  stats?: Record<string, number>;
  selectedRoomId?: string | null;
  onRoomSelect: (id: string) => void;
  isDarkMode: boolean;
}

const getCentroid = (points: Point[]) => {
  const total = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: total.x / points.length, y: total.y / points.length };
};

export const FloorPlanMap = ({ 
  rooms, 
  stats = {}, 
  selectedRoomId,
  onRoomSelect,
  isDarkMode 
}: FloorPlanMapProps) => {
  const baseScale = useRef(new Animated.Value(1)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const scale = Animated.multiply(baseScale, pinchScale);
  
  const baseTranslateX = useRef(new Animated.Value(0)).current;
  const baseTranslateY = useRef(new Animated.Value(0)).current;
  const panTranslateX = useRef(new Animated.Value(0)).current;
  const panTranslateY = useRef(new Animated.Value(0)).current;
  
  const translateX = Animated.add(baseTranslateX, panTranslateX);
  const translateY = Animated.add(baseTranslateY, panTranslateY);

  const onPinchEvent = Animated.event(
    [{ nativeEvent: { scale: pinchScale } }], 
    { useNativeDriver: false }
  );
  
  const onPanEvent = Animated.event(
    [{ nativeEvent: { translationX: panTranslateX, translationY: panTranslateY } }], 
    { useNativeDriver: false }
  );

  const onPinchStateChange = (event: PinchGestureHandlerStateChangeEvent) => {
    if (event.nativeEvent.state === State.END) {
      // @ts-ignore
      baseScale.setValue(baseScale._value * event.nativeEvent.scale);
      pinchScale.setValue(1);
    }
  };

  const onPanStateChange = (event: PanGestureHandlerStateChangeEvent) => {
    if (event.nativeEvent.state === State.END) {
      // @ts-ignore
      baseTranslateX.setValue(baseTranslateX._value + event.nativeEvent.translationX);
      // @ts-ignore
      baseTranslateY.setValue(baseTranslateY._value + event.nativeEvent.translationY);
      panTranslateX.setValue(0);
      panTranslateY.setValue(0);
    }
  };

  const handleWheel = (e: any) => {
    if (Platform.OS === 'web') {
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      // @ts-ignore
      const newScale = baseScale._value * zoomFactor;
      const clampedScale = Math.max(0.5, Math.min(newScale, 4));
      baseScale.setValue(clampedScale);
    }
  };

  const allPoints = rooms.flatMap(r => r.polygon);
  const maxX = allPoints.length > 0 ? Math.max(...allPoints.map(p => p.x)) + 2 : 100;
  const maxY = allPoints.length > 0 ? Math.max(...allPoints.map(p => p.y)) + 2 : 100;

  const colors = {
    bg: isDarkMode ? '#1F2937' : '#FFFFFF',
    roomFill: isDarkMode ? '#374151' : '#E3F2FD',
    roomStroke: isDarkMode ? '#4B5563' : '#FFFFFF',
    selectedFill: isDarkMode ? '#4B5563' : '#BBDEFB',
    text: isDarkMode ? '#F9FAFB' : '#000000',
  };

  return (
    <GestureHandlerRootView style={[styles.container, { backgroundColor: colors.bg }]}>
      <PanGestureHandler onGestureEvent={onPanEvent} onHandlerStateChange={onPanStateChange}>
        <Animated.View>
          <PinchGestureHandler onGestureEvent={onPinchEvent} onHandlerStateChange={onPinchStateChange}>
            <Animated.View 
              // @ts-ignore
              onWheel={handleWheel}
              style={{ transform: [{ translateX }, { translateY }, { scale }] }}
            >
              <Svg width={width} height={300} viewBox={`0 0 ${maxX} ${maxY}`}>
                <G>
                  {rooms.map((room) => {
                    const isSelected = selectedRoomId === room.id;
                    const count = stats[room.name] || 0; 
                    const centroid = getCentroid(room.polygon);
                    
                    return (
                      <G key={room.id} onPress={() => onRoomSelect(room.id)}>
                        <Polygon
                          points={room.polygon.map(p => `${p.x},${p.y}`).join(' ')}
                          // Keeps the fill color change when selected
                          fill={isSelected ? colors.selectedFill : (room.color || colors.roomFill)}
                          fillOpacity={0.6}
                          // UPDATE: Always use standard stroke and thin width
                          stroke={colors.roomStroke}
                          strokeWidth={0.1}
                        />
                        
                        <SvgText
                          x={centroid.x}
                          y={centroid.y - 0.5}
                          fill={colors.text}
                          fontSize={0.3}
                          fontWeight="bold"
                          textAnchor="middle"
                          pointerEvents="none"
                        >
                          {room.name}
                        </SvgText>

                        {count > 0 && (
                          <G pointerEvents="none">
                            <Circle cx={centroid.x} cy={centroid.y + 0.5} r="0.4" fill="#ef4444" />
                            <SvgText
                              x={centroid.x}
                              y={centroid.y + 0.65}
                              fill="white"
                              fontSize={0.25}
                              fontWeight="bold"
                              textAnchor="middle"
                            >
                              {count}
                            </SvgText>
                          </G>
                        )}
                      </G>
                    );
                  })}
                </G>
              </Svg>
            </Animated.View>
          </PinchGestureHandler>
        </Animated.View>
      </PanGestureHandler>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 300,
    overflow: 'hidden',
    borderRadius: 12,
  },
});