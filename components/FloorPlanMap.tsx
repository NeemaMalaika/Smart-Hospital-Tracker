import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Platform, StyleSheet } from 'react-native';
import {
  GestureHandlerRootView,
  PanGestureHandler,
  PanGestureHandlerStateChangeEvent,
  PinchGestureHandler,
  PinchGestureHandlerStateChangeEvent,
  State,
} from 'react-native-gesture-handler';
import Svg, { Circle, G, Polygon, Rect, Text as SvgText } from 'react-native-svg';

const { width: windowWidth, height: windowHeight } = Dimensions.get('window');
const PIXELS_PER_METER = 20;

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
  onRoomSelect: (id: string | null) => void;
  isDarkMode: boolean;
  editable?: boolean;
  onRoomChange?: (updatedRoom: Room) => void;
}

const getCentroid = (points: Point[]) => {
  if (points.length === 0) return { x: 0, y: 0 };
  const total = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: total.x / points.length, y: total.y / points.length };
};

const getBounds = (points: Point[]) => {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
};

const movePolygon = (points: Point[], dx: number, dy: number): Point[] => {
  return points.map(p => ({ x: p.x + dx, y: p.y + dy }));
};

const resizePolygon = (points: Point[], dx: number, dy: number): Point[] => {
  const bounds = getBounds(points);
  const newW = Math.max(1, bounds.w + dx);
  const newH = Math.max(1, bounds.h + dy);
  return [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + newW, y: bounds.y },
    { x: bounds.x + newW, y: bounds.y + newH },
    { x: bounds.x, y: bounds.y + newH },
  ];
};

export const FloorPlanMap = ({ 
  rooms, 
  stats = {}, 
  selectedRoomId,
  onRoomSelect,
  isDarkMode,
  editable = false,
  onRoomChange
}: FloorPlanMapProps) => {
  const [spaceHeld, setSpaceHeld] = useState(false);
  const baseScale = useRef(new Animated.Value(1)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const scale = Animated.multiply(baseScale, pinchScale);
  const baseTranslateX = useRef(new Animated.Value(0)).current;
  const baseTranslateY = useRef(new Animated.Value(0)).current;
  const panTranslateX = useRef(new Animated.Value(0)).current;
  const panTranslateY = useRef(new Animated.Value(0)).current;
  const translateX = Animated.add(baseTranslateX, panTranslateX);
  const translateY = Animated.add(baseTranslateY, panTranslateY);

  const roomDragLast = useRef<{ x: number; y: number } | null>(null);
  const resizeDragLast = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || !editable) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) setSpaceHeld(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [editable]);

  const onPinchEvent = Animated.event([{ nativeEvent: { scale: pinchScale } }], { useNativeDriver: false });
  const onPanEvent = Animated.event([{ nativeEvent: { translationX: panTranslateX, translationY: panTranslateY } }], { useNativeDriver: false });

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
      baseScale.setValue(Math.max(0.5, Math.min(newScale, 4)));
    }
  };

  const allPoints = rooms.flatMap(r => r.polygon);
  const minX = allPoints.length > 0 ? Math.min(...allPoints.map(p => p.x)) - 5 : 0;
  const minY = allPoints.length > 0 ? Math.min(...allPoints.map(p => p.y)) - 5 : 0;
  const maxX = allPoints.length > 0 ? Math.max(...allPoints.map(p => p.x)) + 5 : 20;
  const maxY = allPoints.length > 0 ? Math.max(...allPoints.map(p => p.y)) + 5 : 20;
  const contentWidth = maxX - minX;
  const contentHeight = maxY - minY;
  const svgWidth = editable 
    ? Math.max(windowWidth, contentWidth * PIXELS_PER_METER) 
    : windowWidth; 
    
  const svgHeight = editable
    ? Math.max(300, contentHeight * PIXELS_PER_METER)
    : 300;

  const colors = {
    bg: isDarkMode ? '#1F2937' : '#FFFFFF',
    roomFill: isDarkMode ? '#374151' : '#E3F2FD',
    roomStroke: isDarkMode ? '#4B5563' : '#FFFFFF',
    selectedFill: isDarkMode ? '#4B5563' : '#DBEAFE',
    selectedStroke: '#3b82f6', 
    text: isDarkMode ? '#F9FAFB' : '#000000',
  };

  const cursorStyle = Platform.OS === 'web' && editable ? { cursor: spaceHeld ? 'grab' : 'default' } as any : {};

  return (
    <GestureHandlerRootView style={[styles.container, { backgroundColor: colors.bg }, cursorStyle]}>
      <PanGestureHandler 
        onGestureEvent={onPanEvent} 
        onHandlerStateChange={onPanStateChange}
        enabled={editable ? spaceHeld : true}
      >
        <Animated.View style={{ flex: 1 }}>
          <PinchGestureHandler onGestureEvent={onPinchEvent} onHandlerStateChange={onPinchStateChange}>
            <Animated.View 
              // @ts-ignore
              onWheel={handleWheel}
              style={{ flex: 1, transform: [{ translateX }, { translateY }, { scale }] }}
            >
              <Svg 
                width={svgWidth} 
                height={svgHeight} 
                viewBox={`${minX} ${minY} ${contentWidth} ${contentHeight}`}
              >
                <G>
                  {editable && (
                    <Rect 
                      x={minX - 100} 
                      y={minY - 100} 
                      width={contentWidth + 200} 
                      height={contentHeight + 200} 
                      fill="transparent" 
                      onPress={() => onRoomSelect(null)}
                    />
                  )}

                  {rooms.map((room) => {
                    const isSelected = selectedRoomId === room.id;
                    const count = stats[room.name] || 0; 
                    const centroid = getCentroid(room.polygon);
                    
                    return (
                      <G key={room.id} onPress={() => onRoomSelect(room.id)}>
                        <PanGestureHandler
                          enabled={editable && isSelected && !spaceHeld}
                          onGestureEvent={(e) => {
                            if (!onRoomChange) return;
                            const { translationX, translationY } = e.nativeEvent;
                            if (!roomDragLast.current) {
                              roomDragLast.current = { x: translationX, y: translationY };
                              return;
                            }
                            // Convert pixels to meters
                            const dx = (translationX - roomDragLast.current.x) / PIXELS_PER_METER;
                            const dy = (translationY - roomDragLast.current.y) / PIXELS_PER_METER;
                            roomDragLast.current = { x: translationX, y: translationY };
                            
                            onRoomChange({ ...room, polygon: movePolygon(room.polygon, dx, dy) });
                          }}
                          onHandlerStateChange={(e) => {
                            if (e.nativeEvent.state === State.BEGAN) {
                               onRoomSelect(room.id);
                               roomDragLast.current = null;
                            } else if (e.nativeEvent.state === State.END) {
                               roomDragLast.current = null;
                            }
                          }}
                        >
                          <Polygon
                            points={room.polygon.map(p => `${p.x},${p.y}`).join(' ')}
                            fill={isSelected ? colors.selectedFill : (room.color || colors.roomFill)}
                            fillOpacity={0.6}
                            stroke={colors.roomStroke}
                            strokeWidth={0.1}
                            strokeDasharray={editable && isSelected ? "1, 0.5" : undefined}
                          />
                        </PanGestureHandler>
                        
                        <SvgText
                          x={centroid.x}
                          y={centroid.y - (editable ? 0 : 0.5)}
                          fill={colors.text}
                          fontSize={0.3}
                          fontWeight="bold"
                          textAnchor="middle"
                          pointerEvents="none"
                        >
                          {room.name}
                        </SvgText>

                        {!editable && count > 0 && (
                          <G pointerEvents="none">
                            <Circle cx={centroid.x} cy={centroid.y + 0.5} r="0.4" fill="#ef4444" />
                            <SvgText
                              x={centroid.x} y={centroid.y + 0.65}
                              fill="white" fontSize={0.25} fontWeight="bold" textAnchor="middle"
                            >
                              {count}
                            </SvgText>
                          </G>
                        )}

                        {editable && isSelected && (() => {
                           const bounds = getBounds(room.polygon);
                           const cx = bounds.x + bounds.w;
                           const cy = bounds.y + bounds.h;
                           return (
                             <PanGestureHandler
                              enabled={!spaceHeld}
                              onGestureEvent={(e) => {
                                if (!onRoomChange) return;
                                const { translationX, translationY } = e.nativeEvent;
                                if (!resizeDragLast.current) {
                                  resizeDragLast.current = { x: translationX, y: translationY };
                                  return;
                                }
                                const dx = (translationX - resizeDragLast.current.x) / PIXELS_PER_METER;
                                const dy = (translationY - resizeDragLast.current.y) / PIXELS_PER_METER;
                                resizeDragLast.current = { x: translationX, y: translationY };

                                onRoomChange({ ...room, polygon: resizePolygon(room.polygon, dx, dy) });
                              }}
                              onHandlerStateChange={(e) => {
                                if (e.nativeEvent.state === State.END || e.nativeEvent.state === State.CANCELLED) {
                                  resizeDragLast.current = null;
                                }
                              }}
                             >
                               <Circle cx={cx} cy={cy} r={0.4} fill="#3b82f6" stroke="#fff" strokeWidth={0.1} />
                             </PanGestureHandler>
                           );
                        })()}
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
    flex: 1,
    overflow: 'hidden',
    borderRadius: 12,
  },
});