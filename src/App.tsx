/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { 
  Download, 
  Settings2, 
  Layers, 
  Eye, 
  RotateCcw, 
  Maximize2,
  FileCode,
  Info,
  Wrench,
  Activity,
  RefreshCw,
  Upload,
  Trash2,
  EyeOff,
  Undo2,
  Redo2,
  Box,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SpiroParams } from './types';
import { generateSpiroPaths, generateGearSvgPath, generateShapeSvgPath, getRadiusFromTeeth, getSpiroPoint, getGearSystemState, getActualRingTeeth, getMinCurvatureRadius, PITCH, getGearPoints, getShapePoints } from './lib/spiroMath';
import { parseSvgPaths, samplePathToModifiers, getPathsBoundingBox } from './lib/svgUtils';
import { generateSTL, generateRingSTL } from './lib/stlUtils';

interface Layer {
  id: string;
  name: string;
  params: SpiroParams;
  color: string;
  visible: boolean;
}

const LAYER_COLORS = [
  '#f59e0b', // Amber
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#ef4444', // Red
  '#8b5cf6', // Violet
  '#ec4899', // Pink
];

// Profile interpolation helper for local UI preview
function interpolateCustomSimple(angle: number, points: number[], tension: number = 0.5): number {
  const n = points.length;
  const a = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const step = (2 * Math.PI) / n;
  const f_idx = a / step;
  const idx = Math.floor(f_idx);
  const t = f_idx - idx;
  const i0 = (idx - 1 + n) % n;
  const i1 = idx % n;
  const i2 = (idx + 1) % n;
  const i3 = (idx + 2) % n;
  const p0 = points[i0], p1 = points[i1], p2 = points[i2], p3 = points[i3];
  
  const s = tension;
  return (
    p1 + 
    t * (s * (p2 - p0)) + 
    t * t * (2 * s * p0 + (s - 3) * p1 + (3 - 2 * s) * p2 - s * p3) + 
    t * t * t * (-s * p0 + (2 - s) * p1 + (s - 2) * p2 + s * p3)
  );
}

function RingBezierEditor({ points, tension, teeth, onChange, onTensionChange, onFinishChange }: { points: number[], tension: number, teeth: number, onChange: (p: number[]) => void, onTensionChange: (t: number) => void, onFinishChange: () => void }) {
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const size = 180;
  const rBase = size * 0.3;
  const center = size / 2;

  const handlePointerDown = (idx: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    setDraggingIdx(idx);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (draggingIdx === null || !svgRef.current) return;
    
    // Prevent scrolling while dragging on touch
    if (e.pointerType === 'touch') {
      (e.target as HTMLElement).style.touchAction = 'none';
    }

    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - center;
    const y = e.clientY - rect.top - center;
    const dist = Math.sqrt(x * x + y * y);
    
    // Smooth the distance slightly or clamp
    const mod = Math.min(Math.max(0.1, dist / rBase), 2.2);
    const newPoints = [...points];
    newPoints[draggingIdx] = mod;
    onChange(newPoints);
  };

  const handlePointerUp = () => {
    if (draggingIdx !== null) onFinishChange();
    setDraggingIdx(null);
  };

  const pathData = useMemo(() => {
    const segments = 240;
    const p = [];
    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * 2 * Math.PI;
        const mod = interpolateCustomSimple(angle, points, tension);
        const r = rBase * mod;
        p.push(`${i === 0 ? 'M' : 'L'} ${center + r * Math.cos(angle)} ${center + r * Math.sin(angle)}`);
    }
    return p.join(' ');
  }, [points, tension, rBase, center]);

  const teethData = useMemo(() => {
    const p = [];
    const toothCount = teeth;
    const toothHeight = 4;
    for (let i = 0; i <= toothCount * 2; i++) {
        const angle = (i / (toothCount * 2)) * 2 * Math.PI;
        const isOut = i % 2 === 0;
        const mod = interpolateCustomSimple(angle, points, tension);
        const r = rBase * mod + (isOut ? toothHeight/2 : -toothHeight/2);
        p.push(`${i === 0 ? 'M' : 'L'} ${center + r * Math.cos(angle)} ${center + r * Math.sin(angle)}`);
    }
    return p.join(' ');
  }, [points, tension, teeth, rBase, center]);

  return (
    <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-4 mt-4 select-none">
        <div className="flex justify-between items-center text-[9px] uppercase tracking-widest text-slate-500">
            <span className="flex items-center gap-2">
              <Wrench className="w-3 h-3 text-amber-500" /> 
              Profile Sculptor
            </span>
            <button 
              onClick={() => {
                onChange(Array(points.length).fill(1.0));
                onFinishChange();
              }}
              className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-[8px] transition-colors"
            >
              Reset
            </button>
        </div>

        <div className="relative flex justify-center py-2">
          <svg 
              ref={svgRef}
              viewBox={`0 0 ${size} ${size}`} 
              className="w-full max-w-[200px] aspect-square touch-none cursor-crosshair"
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
          >
              {/* Scale Background */}
              {[0.5, 1.0, 1.5, 2.0].map(s => (
                <circle key={s} cx={center} cy={center} r={rBase * s} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
              ))}
              
              {/* Virtual Teeth Preview */}
              <path d={teethData} fill="none" stroke="rgba(245,158,11,0.2)" strokeWidth="0.5" strokeDasharray="1 1" />
              
              {/* The Profile Line */}
              <path d={pathData} fill="rgba(245,158,11,0.05)" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              
              {/* Control Points */}
              {points.map((mod, i) => {
                  const angle = (i / points.length) * 2 * Math.PI;
                  const r = rBase * mod;
                  const x = center + r * Math.cos(angle);
                  const y = center + r * Math.sin(angle);
                  const isDragging = draggingIdx === i;
                  return (
                      <g key={i} className="group/node">
                        {isDragging && <line x1={center} y1={center} x2={x} y2={y} stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" strokeDasharray="2 2" />}
                        
                        {/* Larger hit area for easier selection */}
                        <circle 
                            cx={x} cy={y} r={14}
                            fill="transparent"
                            className="cursor-pointer"
                            onPointerDown={handlePointerDown(i)}
                        />

                        {/* Visible node */}
                        <circle 
                            cx={x} cy={y} r={isDragging ? 8 : 5}
                            fill={isDragging ? "#fff" : "#f59e0b"}
                            stroke="#000" strokeWidth={isDragging ? 2 : 1}
                            className="pointer-events-none transition-all duration-150 group-hover/node:scale-125 group-hover/node:fill-white group-hover/node:filter group-hover/node:drop-shadow-[0_0_5px_rgba(245,158,11,0.8)]"
                        />
                        
                        {/* Index Indicator on hover */}
                        <text 
                          x={x + 10} y={y - 10} 
                          className="opacity-0 group-hover/node:opacity-100 fill-slate-400 text-[6px] font-mono pointer-events-none transition-opacity"
                        >
                          N{i}
                        </text>
                      </g>
                  );
              })}
          </svg>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
          <div className="space-y-2">
            <div className="flex justify-between text-[8px] uppercase text-slate-500 font-mono">
              <span>Resolution</span>
              <span className="text-amber-500">{points.length} nodes</span>
            </div>
            <div className="flex gap-1">
              {[4, 8, 16, 32].map(n => (
                <button
                  key={n}
                  onClick={() => {
                    onChange(Array(n).fill(1.0));
                    onFinishChange();
                  }}
                  className={`flex-1 py-1 text-[9px] rounded border transition-all ${points.length === n ? 'bg-amber-500/20 border-amber-500/40 text-amber-500' : 'bg-white/5 border-white/5 text-slate-500'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-[8px] uppercase text-slate-500 font-mono">
              <span>Curve Tension</span>
              <span className="text-white">{(tension * 100).toFixed(0)}</span>
            </div>
            <input 
              type="range" min="0" max="1" step="0.05" 
              value={tension} 
              onChange={(e) => onTensionChange(parseFloat(e.target.value))}
              onPointerUp={onFinishChange}
              className="w-full accent-amber-500 h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
            />
          </div>
        </div>
    </div>
  );
}

export default function App() {
  const defaultParams: SpiroParams = {
    ringTeeth: 180,
    gearTeeth: 80,
    holeOffsets: [60],
    rotation: 0,
    resolution: 1,
    type: 'hypotrochoid',
    gearShape: 'circle',
    shapeIntensity: 1.0,
    ringShape: 'circle',
    ringIntensity: 1.0,
    ringTension: 0.5,
    customRingPoints: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
    maxRotations: 30,
    isMultiStage: false,
    stageTwoTeeth: 32,
    stageOneInternalTeeth: 52,
    railOffset: 0,
    offsetX: 0,
    offsetY: 0,
    scale: 1.0
  };

  const [layers, setLayers] = useState<Layer[]>([
    {
      id: 'layer-1',
      name: 'Primary Set',
      params: { ...defaultParams },
      color: LAYER_COLORS[0],
      visible: true
    }
  ]);
  const [activeLayerIndex, setActiveLayerIndex] = useState(0);

  // Undo/Redo state
  const [history, setHistory] = useState<{ layers: Layer[], activeIndex: number }[]>([]);
  const [future, setFuture] = useState<{ layers: Layer[], activeIndex: number }[]>([]);
  const lastSavedState = useRef<{ layers: Layer[], activeIndex: number }>({ layers, activeIndex: activeLayerIndex });

  const pushToHistory = useCallback((newLayers: Layer[], newIndex: number) => {
    // Only push if there's an actual change since last save
    const current = lastSavedState.current;
    if (JSON.stringify(newLayers) === JSON.stringify(current.layers) && newIndex === current.activeIndex) return;
    
    setHistory(prev => {
      const nextHistory = [...prev.slice(-49), { layers: current.layers, activeIndex: current.activeIndex }];
      return nextHistory;
    });
    setFuture([]);
    lastSavedState.current = { layers: newLayers, activeIndex: newIndex };
  }, []);

  const saveHistory = useCallback(() => {
    pushToHistory(layers, activeLayerIndex);
  }, [layers, activeLayerIndex, pushToHistory]);

  const undo = useCallback(() => {
    setHistory(prevHistory => {
      if (prevHistory.length === 0) return prevHistory;
      
      const prev = prevHistory[prevHistory.length - 1];
      const nextHistory = prevHistory.slice(0, -1);
      
      setFuture(f => [{ layers, activeIndex: activeLayerIndex }, ...f]);
      setLayers(prev.layers);
      setActiveLayerIndex(prev.activeIndex);
      lastSavedState.current = prev;
      
      return nextHistory;
    });
  }, [layers, activeLayerIndex]);

  const redo = useCallback(() => {
    setFuture(prevFuture => {
      if (prevFuture.length === 0) return prevFuture;
      
      const next = prevFuture[0];
      const nextFuture = prevFuture.slice(1);
      
      setHistory(h => [...h, { layers, activeIndex: activeLayerIndex }]);
      setLayers(next.layers);
      setActiveLayerIndex(next.activeIndex);
      lastSavedState.current = next;
      
      return nextFuture;
    });
  }, [layers, activeLayerIndex]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'z')) {
        if (e.shiftKey) {
          e.preventDefault();
          redo();
        } else {
          e.preventDefault();
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const params = layers[activeLayerIndex]?.params || defaultParams;

  const minCurvature = useMemo(() => {
    return getMinCurvatureRadius(
      params.ringTeeth, 
      params.ringShape, 
      params.ringIntensity, 
      params.customRingPoints, 
      params.ringTension,
      params.scale
    );
  }, [params.ringTeeth, params.ringShape, params.ringIntensity, params.customRingPoints, params.ringTension, params.scale]);

  const gearRadius = getRadiusFromTeeth(params.gearTeeth);
  const safeGearTeethLimit = useMemo(() => {
    const limit = Math.floor((2 * Math.PI * (minCurvature * 0.98)) / PITCH);
    return Math.max(8, Math.min(params.ringTeeth - 4, limit));
  }, [minCurvature, params.ringTeeth]);
  
  const isGearTooLarge = gearRadius > minCurvature * 1.02; // Tight margin

  const fitGearToCorners = () => {
    const targetTeeth = Math.floor((2 * Math.PI * (minCurvature * 0.95)) / PITCH);
    // Use the ringTeeth of the active layer as a bound
    const safeTeeth = Math.max(8, Math.min(params.ringTeeth - 4, targetTeeth));
    const newLayers = layers.map((layer, idx) => 
      idx === activeLayerIndex 
        ? { ...layer, params: { ...layer.params, gearTeeth: safeTeeth } }
        : layer
    );
    pushToHistory(newLayers, activeLayerIndex);
    setLayers(newLayers);
  };

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const [isAnimating, setIsAnimating] = useState(false);
  const [animationTheta, setAnimationTheta] = useState(0);
  const [animationSpeed, setAnimationSpeed] = useState(1); // multiplier
  const [dimGears, setDimGears] = useState(false);

  const memoizedLayerPaths = useMemo(() => {
    return layers.map((layer) => {
      if (!layer.visible) return null;
      const p = layer.params;
      
      const externalRing = null;
        
      const guideShape = generateShapeSvgPath(getRadiusFromTeeth(p.ringTeeth), p.ringShape, p.ringIntensity, p.customRingPoints, p.ringTension, p.offsetX, p.offsetY, p.scale, 30 * (p.scale || 1.0));
        
      const ringGear = generateGearSvgPath(p.ringTeeth, true, p.ringShape, p.ringIntensity, p.customRingPoints, p.ringTension, p.offsetX, p.offsetY, p.scale);
      
      const gear1Path = generateGearSvgPath(p.gearTeeth, false, p.gearShape, p.shapeIntensity);
      
      const stage2Paths = p.isMultiStage ? {
        gear2: generateGearSvgPath(p.stageTwoTeeth, false),
        internal: generateGearSvgPath(p.stageOneInternalTeeth, true)
      } : null;

      return {
        id: layer.id,
        externalRing,
        guideShape,
        ringGear,
        gear1Path,
        stage2Paths
      };
    });
  }, [layers]);

  const layersFullPaths = useMemo(() => {
    return layers.map(layer => ({
      id: layer.id,
      paths: generateSpiroPaths(layer.params),
      actualRingTeeth: getActualRingTeeth(layer.params)
    }));
  }, [layers]);

  const layersLivePaths = useMemo(() => {
    return layers.map((layer, lIdx) => {
      const full = layersFullPaths[lIdx];
      if (animationTheta === 0) return layer.params.holeOffsets.map(() => []);

      const { maxRotations, resolution, holeOffsets } = layer.params;
      const maxTheta = maxRotations * 2 * Math.PI;
      const pointLimit = layer.params.isMultiStage ? 30000 : 12000;
      const step = Math.max(0.04 / resolution, maxTheta / pointLimit);

      return full.paths.map((fullPath, pIdx) => {
        const targetIndex = Math.floor(animationTheta / step);
        const sliced = fullPath.slice(0, targetIndex + 1);
        const currentPoint = getSpiroPoint(layer.params, holeOffsets[pIdx], animationTheta);
        return [...sliced, currentPoint];
      });
    });
  }, [layers, layersFullPaths, animationTheta]);

  const layersPathStrings = useMemo(() => {
    return layersLivePaths.map((layerPaths, lIdx) => {
      return layerPaths.map(path => path.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' '));
    });
  }, [layersLivePaths]);

  const actualRingTeeth = layersFullPaths[activeLayerIndex]?.actualRingTeeth || 144;

  const tailSpiroPaths = useMemo(() => {
    return [];
  }, []);
  
  const ringRadius = getRadiusFromTeeth(params.ringTeeth);
  
  // Animation loop
  React.useEffect(() => {
    if (!isAnimating) return;
    
    let frameId: number;
    const baseSpeed = 0.05; 
    
    const animate = () => {
      setAnimationTheta(t => {
        const next = t + (baseSpeed * animationSpeed);
        // Loop or clamp? Let's cap it at the end of the calculated path
        const maxT = params.maxRotations * Math.PI * 2;
        if (next >= maxT) return maxT;
        return next;
      });
      frameId = requestAnimationFrame(animate);
    };
    
    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [isAnimating, animationSpeed, params.maxRotations]);

  const updateParams = (newParamsPartial: Partial<SpiroParams>) => {
    const newLayers = layers.map((layer, idx) => 
      idx === activeLayerIndex 
        ? { ...layer, params: { ...layer.params, ...newParamsPartial } }
        : layer
    );
    setLayers(newLayers);
  };

  const addLayer = (overrides?: Partial<SpiroParams>, name?: string) => {
    const newIdx = layers.length;
    const newLayer: Layer = {
      id: `layer-${Date.now()}-${newIdx}`,
      name: name || `Set ${newIdx + 1}`,
      params: { ...defaultParams, ...overrides },
      color: LAYER_COLORS[newIdx % LAYER_COLORS.length],
      visible: true
    };
    const newLayers = [...layers, newLayer];
    pushToHistory(newLayers, newIdx);
    setLayers(newLayers);
    setActiveLayerIndex(newIdx);
  };

  const deleteLayer = (index: number) => {
    if (layers.length <= 1) return;
    const newLayers = layers.filter((_, i) => i !== index);
    const newActiveIndex = activeLayerIndex >= index ? Math.max(0, activeLayerIndex - 1) : activeLayerIndex;
    pushToHistory(newLayers, newActiveIndex);
    setLayers(newLayers);
    setActiveLayerIndex(newActiveIndex);
  };

  const toggleLayerVisibility = (index: number) => {
    const newLayers = layers.map((layer, i) => 
      i === index ? { ...layer, visible: !layer.visible } : layer
    );
    pushToHistory(newLayers, activeLayerIndex);
    setLayers(newLayers);
  };

  const clearOthers = () => {
    const newLayers = [layers[activeLayerIndex]];
    pushToHistory(newLayers, 0);
    setLayers(newLayers);
    setActiveLayerIndex(0);
  };

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setAnimationTheta(0);
  };

  const handleWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY * -0.001;
    setZoom(prev => Math.min(Math.max(0.5, prev + delta), 5));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = (e.clientX - dragStart.x);
    const dy = (e.clientY - dragStart.y);
    setPan(prev => ({
      x: prev.x + dx / zoom,
      y: prev.y + dy / zoom
    }));
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    try {
      const allPathDatas = await parseSvgPaths(text);
      const pathDatas = allPathDatas.filter(d => d.length > 5);

      if (pathDatas.length === 0) {
        alert('No valid shapes found in SVG.');
        return;
      }
      
      const bbox = getPathsBoundingBox(pathDatas);
      
      if (!isFinite(bbox.minX)) {
        alert('Could not measure SVG dimensions. Please check file format.');
        return;
      }

      const globalCenterX = (bbox.minX + bbox.maxX) / 2;
      const globalCenterY = (bbox.minY + bbox.maxY) / 2;
      const totalWidth = bbox.maxX - bbox.minX;
      const totalHeight = bbox.maxY - bbox.minY;
      const maxDim = Math.max(totalWidth, totalHeight);
      
      const targetDim = 280; 
      const importScale = maxDim > 0 ? targetDim / maxDim : 1;

      const MAX_IMPORT = 12;
      const toImport = pathDatas.slice(0, MAX_IMPORT);
      
      const newLayers: Layer[] = toImport.map((pathData, i) => {
        const { modifiers, centerX, centerY, avgRadius } = samplePathToModifiers(pathData, 32);
        
        const targetRadius = avgRadius * importScale;
        const calculatedTeeth = Math.round((2 * Math.PI * targetRadius) / PITCH);
        const ringTeeth = Math.max(32, Math.min(600, calculatedTeeth));

        return {
          id: `imported-layer-${Date.now()}-${i}`,
          name: `Shape ${i + 1}`,
          params: { 
            ...defaultParams,
            ringTeeth: ringTeeth,
            customRingPoints: modifiers,
            ringShape: 'custom',
            offsetX: (centerX - globalCenterX) * importScale,
            offsetY: (centerY - globalCenterY) * importScale,
            scale: 1.0 // importScale is already baked into teeth and offsets
          },
          color: LAYER_COLORS[(layers.length + i) % LAYER_COLORS.length],
          visible: true
        };
      });

      if (pathDatas.length === 1 && layers.length === 1 && layers[0].params.customRingPoints?.every(p => p === 1.0)) {
        pushToHistory([newLayers[0]], 0);
        setLayers([newLayers[0]]);
        setActiveLayerIndex(0);
      } else {
        const startIdx = layers.length;
        const combined = [...layers, ...newLayers];
        pushToHistory(combined, startIdx);
        setLayers(combined);
        setActiveLayerIndex(startIdx);
      }

      if (pathDatas.length > MAX_IMPORT) {
        alert(`Imported the first ${MAX_IMPORT} shapes.`);
      }
    } catch (err) {
      console.error('Failed to parse SVG:', err);
      alert('Could not extract valid paths from the SVG.');
    }
  };

  // Math for the symmetry label
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
  const symmetryPoints = useMemo(() => {
    const common = gcd(params.ringTeeth, params.gearTeeth);
    return params.ringTeeth / common;
  }, [params.ringTeeth, params.gearTeeth]);

  const [showBedWarning, setShowBedWarning] = useState(false);
  const [showPrinterBed, setShowPrinterBed] = useState(false);
  const [currentSize, setCurrentSize] = useState(0);
  const [bedSize, setBedSize] = useState(220); // Default common printer bed 220mm

  const handleFitToBed = useCallback(() => {
    // Calculate current width of the whole assembly
    const ringRadius = getRadiusFromTeeth(params.ringTeeth) * (params.scale || 1.0);
    const modMax = params.ringShape === 'custom' ? Math.max(...(params.customRingPoints || [1.0])) : (1 + params.ringIntensity * 0.15);
    const margin = 20;
    const outerBoundary = (ringRadius * modMax) + margin;
    
    const currentFullSize = outerBoundary * 2;
    setCurrentSize(currentFullSize);

    // Solve for ringRadius: (ringRadius * modMax + margin) * 2 = bedSize - safetyMargin
    const safetyMargin = 10;
    const targetOuterBoundary = (bedSize - safetyMargin) / 2;
    const targetInternalRadius = Math.max(10, targetOuterBoundary - margin);
    const targetRingRadius = targetInternalRadius / modMax;
    
    const targetTeeth = Math.round((2 * Math.PI * (targetRingRadius / (params.scale || 1.0))) / PITCH);
    
    const newTeeth = Math.max(32, Math.min(600, targetTeeth));
    const ratio = newTeeth / params.ringTeeth;
    const newGearTeeth = Math.max(8, Math.round(params.gearTeeth * ratio));

    updateParams({ 
      ringTeeth: newTeeth, 
      gearTeeth: newGearTeeth
    });
    saveHistory();
    setShowBedWarning(false);
    return currentFullSize;
  }, [params, bedSize, updateParams, saveHistory]);

  const performSTLExport = () => {
    const extrusionHeight = 2; // 2mm extrusion
    const fileName = `spiroforge-3d-layer-${activeLayerIndex + 1}`;
    const p = layers[activeLayerIndex].params;

    // 1. Export Ring Gear (Annulus)
    const ringRadius = getRadiusFromTeeth(p.ringTeeth);
    const innerPoints = getGearPoints(p.ringTeeth, true, p.ringShape, p.ringIntensity, p.customRingPoints, p.ringTension, p.offsetX, p.offsetY, p.scale);
    
    let outerPoints;
    const margin = 20 * (p.scale || 1.0);
    outerPoints = getShapePoints(ringRadius, p.ringShape, p.ringIntensity, p.customRingPoints, p.ringTension, p.offsetX, p.offsetY, p.scale, margin);
    
    generateRingSTL(innerPoints, outerPoints, extrusionHeight, `${fileName}-ring`);

    // 2. Export Target Gear
    const gearPoints = getGearPoints(p.gearTeeth, false, p.gearShape, p.shapeIntensity, undefined, undefined, 0, 0, p.scale);
    const scaledGearRadius = getRadiusFromTeeth(p.gearTeeth) * (p.scale || 1.0);
    
    const holes = p.isMultiStage ? [] : p.holeOffsets.map(offset => ({
      x: scaledGearRadius * (offset / 100),
      y: 0,
      r: 1.5,
      chamfer: 1.0
    }));

    generateSTL([{ points: gearPoints, height: extrusionHeight, holes }], `${fileName}-gear`);

    if (p.isMultiStage) {
      const scaledGear2Radius = getRadiusFromTeeth(p.stageTwoTeeth) * (p.scale || 1.0);
      const stage2Points = getGearPoints(p.stageTwoTeeth, false, 'circle', 1.0, undefined, undefined, 0, 0, p.scale);
      const stage2Holes = p.holeOffsets.map(offset => ({
        x: scaledGear2Radius * (offset / 100),
        y: 0,
        r: 1.5,
        chamfer: 1.0
      }));
      generateSTL([{ points: stage2Points, height: extrusionHeight, holes: stage2Holes }], `${fileName}-stage2`);
    }
    setShowBedWarning(false);
  };

  const handleExportSTL = () => {
    // Check size but don't force resize anymore
    const ringRadius = getRadiusFromTeeth(params.ringTeeth) * (params.scale || 1.0);
    const modMax = params.ringShape === 'custom' ? Math.max(...(params.customRingPoints || [1.0])) : (1 + params.ringIntensity * 0.15);
    const outerBoundary = (ringRadius * modMax) + 20;
    const currentFullSize = outerBoundary * 2;
    
    if (currentFullSize > bedSize) {
      setCurrentSize(currentFullSize);
      setShowBedWarning(true);
    } else {
      performSTLExport();
    }
  };

  const downloadSvg = (mode: 'drawing' | 'parts') => {
    const svgContent = mode === 'drawing' ? generateDrawingSvg() : generatePartsSvg();
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `spiroforge-${mode}-${Date.now()}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const generateDrawingSvg = () => {
    const allLayersPoints = layersFullPaths
      .filter((_, i) => layers[i].visible)
      .map(l => l.paths.flat());
    
    const combinedPoints = allLayersPoints.flat();
    if (combinedPoints.length === 0) return '';
    
    // We must consider ring shapes too if we want a complete view, 
    // but drawing paths are usually the main result.
    const minX = Math.min(...combinedPoints.map(p => p.x));
    const maxX = Math.max(...combinedPoints.map(p => p.x));
    const minY = Math.min(...combinedPoints.map(p => p.y));
    const maxY = Math.max(...combinedPoints.map(p => p.y));
    const padding = 10;
    const width = Math.max(10, maxX - minX + padding * 2);
    const height = Math.max(10, maxY - minY + padding * 2);
    
    const svgPaths = layersFullPaths.map((layerFull, lIdx) => {
      if (!layers[lIdx].visible) return '';
      const layerParams = layers[lIdx].params;
      return layerFull.paths.map(points => {
        const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x - minX + padding} ${p.y - minY + padding}`).join(' ');
        return `<path d="${pathData}" fill="none" stroke="${layers[lIdx].color}" stroke-width="0.8" />`;
      }).join('\n');
    }).join('\n');

    return `<svg width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${svgPaths}</svg>`;
  };

  const generatePartsSvg = () => {
    const ringPath = generateGearSvgPath(params.ringTeeth, true, params.ringShape, params.ringIntensity, params.customRingPoints, params.ringTension, params.offsetX, params.offsetY, params.scale);
    const gearPath = generateGearSvgPath(params.gearTeeth, false, params.gearShape, params.shapeIntensity);
    const gear2Path = params.isMultiStage ? generateGearSvgPath(params.stageTwoTeeth, false) : '';
    const gear1InternalPath = params.isMultiStage ? generateGearSvgPath(params.stageOneInternalTeeth, true) : '';
    
    let extRingPath = '';
    const currentRingRadius = getRadiusFromTeeth(params.ringTeeth) * (params.scale || 1.0);
    let outerBoundary = currentRingRadius + 20;

    if (params.hasExternalTeeth && params.externalTeeth) {
      const targetOuterRadius = getRadiusFromTeeth(params.externalTeeth) * (params.scale || 1.0);
      const margin = targetOuterRadius - currentRingRadius;
      extRingPath = generateGearSvgPath(params.ringTeeth, false, params.ringShape, params.ringIntensity, params.customRingPoints, params.ringTension, params.offsetX, params.offsetY, params.scale, margin);
      outerBoundary = targetOuterRadius + 5;
    } else {
      // Use a smooth 30mm offset for the outer cut when no external teeth are requested
      const margin = 30 * (params.scale || 1.0);
      extRingPath = generateShapeSvgPath(getRadiusFromTeeth(params.ringTeeth), params.ringShape, params.ringIntensity, params.customRingPoints, params.ringTension, params.offsetX, params.offsetY, params.scale, margin);
      
      // Calculate a safe viewBox boundary based on the max possible extent
      const modMax = params.ringShape === 'custom' ? Math.max(...(params.customRingPoints || [1.0])) : (1 + params.ringIntensity * 0.15);
      outerBoundary = (currentRingRadius * modMax) + margin + 10;
    }

    const spacing = 50;
    const gear2Radius = params.isMultiStage ? getRadiusFromTeeth(params.stageTwoTeeth) : 0;
    const totalWidth = outerBoundary * 2 + spacing + gearRadius * 3 + (params.isMultiStage ? spacing + gear2Radius * 2 : 0);
    const totalHeight = Math.max(outerBoundary * 2, gearRadius * 3) + 40;
    
    const viewBoxX = -outerBoundary - 20;
    const viewBoxY = -Math.max(outerBoundary, gearRadius * 1.5) - 20;
    
    const holePaths = params.holeOffsets.map(offset => {
      const targetRadius = params.isMultiStage ? gear2Radius : gearRadius;
      const holeX = targetRadius * (offset / 100);
      const holeR = 1.6;
      return `<path d="M ${holeX - holeR},0 a ${holeR},${holeR} 0 1,0 ${holeR * 2},0 a ${holeR},${holeR} 0 1,0 -${holeR * 2},0" fill="none" stroke="red" stroke-width="0.25" stroke-linecap="round" stroke-linejoin="round" />`;
    }).join('\n');
    
    return `
      <svg width="${totalWidth + 20}mm" height="${totalHeight + 20}mm" viewBox="${viewBoxX} ${viewBoxY} ${totalWidth + 20} ${totalHeight + 20}" xmlns="http://www.w3.org/2000/svg">
        <desc>Kapiti Libraries SpiroForge - Laser Cut Template</desc>
        <!-- Ring System -->
        <path d="${ringPath} ${extRingPath}" fill="none" stroke="red" stroke-width="0.12" fill-rule="evenodd" stroke-linecap="round" stroke-linejoin="round" />
        
        <!-- Gear 1 Section -->
        <g transform="translate(${outerBoundary + gearRadius + spacing}, 0)">
          <path d="${gearPath}" fill="none" stroke="red" stroke-width="0.12" fill-rule="evenodd" stroke-linecap="round" stroke-linejoin="round" />
          <g transform="translate(${params.railOffset}, 0)">
            <path d="${gear1InternalPath}" fill="none" stroke="red" stroke-width="0.12" stroke-linecap="round" stroke-linejoin="round" />
          </g>
          ${!params.isMultiStage ? holePaths : ''}
          <!-- Center Point Mark -->
          <line x1="-1" y1="0" x2="1" y2="0" stroke="blue" stroke-width="0.05" />
          <line x1="0" y1="-1" x2="0" y2="1" stroke="blue" stroke-width="0.05" />
        </g>

        ${params.isMultiStage ? `
        <!-- Gear 2 Section -->
        <g transform="translate(${outerBoundary + gearRadius * 2 + spacing * 2 + gear2Radius}, 0)">
          <path d="${gear2Path}" fill="none" stroke="red" stroke-width="0.12" stroke-linecap="round" stroke-linejoin="round" />
          ${holePaths}
          <!-- Center Point Mark -->
          <line x1="-1" y1="0" x2="1" y2="0" stroke="blue" stroke-width="0.05" />
          <line x1="0" y1="-1" x2="0" y2="1" stroke="blue" stroke-width="0.05" />
        </g>` : ''}
      </svg>
    `.trim();
  };

  return (
    <div className="h-screen bg-[#0a0a0b] text-slate-300 font-sans flex flex-col overflow-hidden selection:bg-amber-500 selection:text-black">
      
      {/* Header */}
      <header className="h-16 border-b border-white/10 flex items-center justify-between px-8 shrink-0 bg-[#0a0a0b] z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-amber-500/20 border border-amber-500/50 flex items-center justify-center">
            <Activity className="w-4 h-4 text-amber-500 animate-pulse" />
          </div>
          <h1 className="text-lg font-light tracking-widest text-white uppercase">
            Kapiti Libraries <span className="font-bold text-amber-500">SpiroForge</span>
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-white/5 rounded-lg p-0.5 border border-white/10 mr-2 shadow-inner">
            <button 
              onClick={undo}
              disabled={history.length === 0}
              className="p-1.5 hover:bg-white/10 rounded disabled:opacity-20 disabled:hover:bg-transparent transition-all active:scale-90"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4 text-white" />
            </button>
            <button 
              onClick={redo}
              disabled={future.length === 0}
              className="p-1.5 hover:bg-white/10 rounded disabled:opacity-20 disabled:hover:bg-transparent transition-all active:scale-90"
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 className="w-4 h-4 text-white" />
            </button>
          </div>
              <div className="flex gap-2 items-center">
                <button 
                  onClick={() => setDimGears(!dimGears)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${dimGears ? 'bg-white/5 border-white/10 text-slate-500' : 'bg-amber-500 border-amber-400 text-black shadow-[0_0_15px_rgba(245,158,11,0.3)]'}`}
                >
                  {dimGears ? 'Brighten Gears' : 'Dim Gears'}
                </button>
                {/* Bed Size Setting */}
            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-2 py-1 mr-2">
              <button 
                onClick={() => setShowPrinterBed(!showPrinterBed)}
                title={showPrinterBed ? "Hide printer bed guide" : "Show printer bed guide"}
                className={`p-1 rounded transition-colors ${showPrinterBed ? 'bg-amber-500 text-black' : 'text-slate-500 hover:text-white hover:bg-white/10'}`}
              >
                <Maximize2 className="w-3 h-3" />
              </button>
              <span className="text-[8px] uppercase tracking-tighter text-slate-500">Bed</span>
              <input 
                type="number" 
                value={bedSize} 
                onChange={(e) => setBedSize(parseInt(e.target.value) || 220)}
                className="bg-transparent text-white w-8 text-center text-[10px] focus:outline-none focus:text-amber-500 font-mono"
              />
              <span className="text-[8px] text-slate-600">mm</span>
              <button 
                onClick={handleFitToBed}
                title="Scale to fit your printer bed"
                className="ml-1 p-1 hover:bg-amber-500/20 rounded-md transition-colors group"
              >
                <RefreshCw className="w-3 h-3 text-slate-400 group-hover:text-amber-500" />
              </button>
            </div>

            <button 
              onClick={() => downloadSvg('parts')}
              className="px-4 py-2.5 bg-amber-500 text-black font-bold text-[10px] uppercase tracking-widest hover:bg-amber-400 transition-all hover:scale-[0.98] active:scale-95 shadow-lg shadow-amber-500/20 flex gap-2 items-center"
            >
              <Download className="w-3.5 h-3.5 text-black/60" /> Laser Cutter (SVG)
            </button>
            <button 
              onClick={handleExportSTL}
              className="px-4 py-2.5 bg-white/5 text-white font-bold text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all border border-white/10 flex gap-2 items-center"
            >
              <Box className="w-3.5 h-3.5 text-amber-500" /> 3D Printer (STL)
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        
        {/* Sidebar */}
        <aside className="w-80 border-r border-white/10 bg-[#0c0c0e] p-6 flex flex-col gap-8 shrink-0 overflow-y-auto custom-scrollbar">
          
          <section>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-[11px] uppercase tracking-widest text-amber-500/80 font-bold flex items-center gap-2">
                <Layers className="w-3.5 h-3.5" /> Layer Management
              </h2>
              <button 
                onClick={() => addLayer()}
                className="text-[9px] uppercase font-bold text-amber-500 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20 hover:bg-amber-500/20"
              >
                + New
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {layers.map((layer, idx) => (
                <div 
                  key={layer.id}
                  onClick={() => setActiveLayerIndex(idx)}
                  className={`p-3 rounded-lg border flex items-center justify-between cursor-pointer transition-all ${activeLayerIndex === idx ? 'bg-white/10 border-white/20' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px]" 
                      style={{ backgroundColor: layer.color, boxShadow: `0 0 8px ${layer.color}66` }}
                    />
                    <span className={`text-[10px] uppercase tracking-widest ${activeLayerIndex === idx ? 'text-white' : 'text-slate-500'}`}>
                      {layer.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(idx); }}
                      className={`p-1 rounded transition-colors ${layer.visible ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-400'}`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    {layers.length > 1 && (
                      <button 
                         onClick={(e) => { e.stopPropagation(); deleteLayer(idx); }}
                         className="p-1 text-red-500/50 hover:text-red-500 transition-colors"
                         title="Delete Layer"
                      >
                         <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-4 pt-4 border-t border-white/5 flex gap-2">
              <button 
                onClick={clearOthers}
                className="flex-1 text-[9px] uppercase font-bold text-slate-500 hover:text-white transition-colors"
                title="Remove all layers except active"
              >
                Clear Others
              </button>
              <button 
                onClick={handleRefresh}
                className="flex-1 text-[9px] uppercase font-bold text-slate-500 hover:text-white transition-colors"
              >
                Reset View
              </button>
            </div>
          </section>

          <section>
            <h2 className="text-[11px] uppercase tracking-widest text-amber-500/80 mb-6 font-bold flex items-center gap-2 pt-4 border-t border-white/5">
              <Maximize2 className="w-3.5 h-3.5" /> Transform Configuration
            </h2>
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between text-[10px] uppercase font-mono">
                  <span className="text-slate-400">Global Scale</span>
                  <span className="text-amber-500">{(params.scale * 100).toFixed(0)}%</span>
                </div>
                <input 
                  type="range" min="0.1" max="3.0" step="0.05" 
                  value={params.scale || 1.0} 
                  onChange={(e) => updateParams({ scale: parseFloat(e.target.value) || 1.0 })}
                  onPointerUp={saveHistory}
                  className="w-full accent-amber-500 h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                />
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-[10px] uppercase font-mono">
                  <span className="text-slate-400">Position X</span>
                  <input 
                    type="number" 
                    value={params.offsetX?.toFixed(1)} 
                    onChange={(e) => updateParams({ offsetX: parseFloat(e.target.value) || 0 })}
                    onBlur={saveHistory}
                    className="bg-transparent text-white w-14 text-right focus:outline-none"
                  />
                </div>
                <input 
                  type="range" min="-200" max="200" step="0.5" 
                  value={params.offsetX || 0} 
                  onChange={(e) => updateParams({ offsetX: parseFloat(e.target.value) })}
                  onPointerUp={saveHistory}
                  className="w-full accent-amber-500 h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                />
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-[10px] uppercase font-mono">
                  <span className="text-slate-400">Position Y</span>
                  <input 
                    type="number" 
                    value={params.offsetY?.toFixed(1)} 
                    onChange={(e) => updateParams({ offsetY: parseFloat(e.target.value) || 0 })}
                    onBlur={saveHistory}
                    className="bg-transparent text-white w-14 text-right focus:outline-none"
                  />
                </div>
                <input 
                  type="range" min="-200" max="200" step="0.5" 
                  value={params.offsetY || 0} 
                  onChange={(e) => updateParams({ offsetY: parseFloat(e.target.value) })}
                  onPointerUp={saveHistory}
                  className="w-full accent-amber-500 h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                />
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-[11px] uppercase tracking-widest text-amber-500/80 mb-6 font-bold flex items-center gap-2 pt-4 border-t border-white/5">
              <Settings2 className="w-3.5 h-3.5" /> Core Configuration
            </h2>
            
            <div className="space-y-8">
              {/* Ring Teeth Slider */}
              <div className="space-y-4">
                <div className="flex justify-between text-[10px] uppercase tracking-wider">
                  <label className="text-slate-400">Nominal Ring Size</label>
                  <div className="flex gap-2 items-center">
                    <span className="text-amber-500/80 font-mono bg-amber-500/5 px-1.5 rounded border border-amber-500/10">
                      {(params.ringTeeth * 6 / Math.PI * (params.scale || 1.0)).toFixed(1)}mm Ø
                    </span>
                    {params.ringShape !== 'circle' && (
                      <span className="text-amber-500 font-mono bg-amber-500/10 px-1 rounded border border-amber-500/20" title="Actual teeth on sculpted perimeter">
                        {actualRingTeeth}T Actual
                      </span>
                    )}
                    <span className="text-white font-mono bg-white/5 px-1.5 rounded">{params.ringTeeth}T Base</span>
                  </div>
                </div>
                <div className="relative h-1 w-full bg-white/10 rounded-full group">
                  <input 
                    type="range" min="32" max="250" step="1" 
                    value={params.ringTeeth} 
                    onChange={(e) => updateParams({ ringTeeth: parseInt(e.target.value) })}
                    onPointerUp={saveHistory}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className="absolute top-0 left-0 h-full bg-amber-500 rounded-full" style={{ width: `${((params.ringTeeth - 32) / (250 - 32)) * 100}%` }}></div>
                  <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full border-2 border-amber-500 shadow-lg shadow-amber-500/50" style={{ left: `calc(${((params.ringTeeth - 32) / (250 - 32)) * 100}% - 6px)` }}></div>
                </div>
                {params.ringShape !== 'circle' && (
                  <p className="text-[8px] text-slate-500 italic mt-1 bg-white/5 p-1 rounded">
                    Sculpting adjusted the perimeter. Actual teeth count increased to maintain pitch.
                  </p>
                )}
              </div>

              <div className="p-3 rounded-lg bg-white/5 border border-white/5 space-y-2">
                <div className="flex justify-between items-center text-[10px] uppercase font-mono">
                  <span className="text-slate-400">Corner Clearance</span>
                  <span className={isGearTooLarge ? 'text-red-400 font-bold' : 'text-emerald-400'}>
                    {isGearTooLarge ? 'Collision Risk' : 'Fits Corners'}
                  </span>
                </div>
                <div className="text-[9px] text-slate-500 leading-relaxed mb-2">
                  Tightest corner radius: <span className="text-slate-300 font-mono">{minCurvature.toFixed(1)}mm</span>
                </div>
                <button 
                  onClick={fitGearToCorners}
                  disabled={!isGearTooLarge && gearRadius > minCurvature * 0.8}
                  className="w-full py-2 bg-white/5 hover:bg-white/10 text-white rounded border border-white/10 text-[9px] uppercase font-bold transition-all disabled:opacity-50"
                  id="fit-gear-btn"
                >
                  Auto-Fit Gear to Corners
                </button>
              </div>

              {/* Gear Teeth Slider */}
              <div className="space-y-4">
                <div className="flex justify-between text-[10px] uppercase tracking-wider">
                  <div className="flex flex-col gap-0.5">
                    <label className="text-slate-400">Rolling Gear Teeth</label>
                    <span className="text-[8px] text-slate-500">Max safe: {safeGearTeethLimit}T</span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <span className="text-amber-500/80 font-mono bg-amber-500/5 px-1.5 rounded border border-amber-500/10">
                      {(params.gearTeeth * 6 / Math.PI * (params.scale || 1.0)).toFixed(1)}mm Ø
                    </span>
                    <span className={`font-mono bg-white/5 px-1.5 rounded ${params.gearTeeth > safeGearTeethLimit ? 'text-red-400' : 'text-white'}`}>
                      {params.gearTeeth}T
                    </span>
                  </div>
                </div>
                <div className="relative h-1 w-full bg-white/10 rounded-full group">
                  <input 
                    type="range" min="8" max={params.ringTeeth - 1} step="1" 
                    value={params.gearTeeth} 
                    onChange={(e) => updateParams({ gearTeeth: parseInt(e.target.value) })}
                    onPointerUp={saveHistory}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className="absolute top-0 left-0 h-full bg-amber-500 rounded-full" style={{ width: `${((params.gearTeeth - 8) / (params.ringTeeth - 9)) * 100}%` }}></div>
                  
                  {/* Safety Boundary Marker */}
                  <div className="absolute top-0 bottom-0 w-[1px] bg-red-500/40 z-0" style={{ left: `${((safeGearTeethLimit - 8) / (params.ringTeeth - 9)) * 100}%` }}></div>
                  
                  <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full border-2 border-amber-500 shadow-lg shadow-amber-500/50" style={{ left: `calc(${((params.gearTeeth - 8) / (params.ringTeeth - 9)) * 100}% - 6px)` }}></div>
                </div>
              </div>

              {/* Hole Offsets Editor */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] uppercase tracking-wider text-slate-400">Pen Hole Distributions</label>
                  <button 
                    onClick={() => {
                      const newOffsets = [...params.holeOffsets, 50];
                      const newLayers = layers.map((layer, idx) => 
                        idx === activeLayerIndex ? { ...layer, params: { ...layer.params, holeOffsets: newOffsets } } : layer
                      );
                      pushToHistory(newLayers, activeLayerIndex);
                      setLayers(newLayers);
                    }}
                    className="text-[9px] uppercase font-bold text-amber-500 hover:text-amber-400 transition-colors"
                  >
                    + Add Hole
                  </button>
                </div>
                
                <div className="space-y-4 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                  {params.holeOffsets.map((offset, idx) => (
                    <div key={idx} className="space-y-2 group">
                      <div className="flex justify-between text-[9px] font-mono">
                        <span className="text-slate-500">Hole #{idx + 1}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-white">{offset}%</span>
                          {params.holeOffsets.length > 1 && (
                            <button 
                              onClick={() => {
                                const newOffsets = [...params.holeOffsets];
                                newOffsets.splice(idx, 1);
                                const newLayers = layers.map((layer, lIdx) => 
                                  lIdx === activeLayerIndex ? { ...layer, params: { ...layer.params, holeOffsets: newOffsets } } : layer
                                );
                                pushToHistory(newLayers, activeLayerIndex);
                                setLayers(newLayers);
                              }}
                              className="text-red-500/50 hover:text-red-500 text-[8px] uppercase tracking-tighter"
                            >
                              Del
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="relative h-1 w-full bg-white/10 rounded-full">
                        <input 
                          type="range" min="0" max="150" step="1" 
                          value={offset} 
                          onChange={(e) => {
                            const newOffsets = [...params.holeOffsets];
                            newOffsets[idx] = parseInt(e.target.value);
                            updateParams({ holeOffsets: newOffsets });
                          }}
                          onPointerUp={saveHistory}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <div className="absolute top-0 left-0 h-full bg-amber-500 rounded-full" style={{ width: `${(offset / 150) * 100}%` }}></div>
                        <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full border border-amber-500" style={{ left: `calc(${(offset / 150) * 100}% - 5px)` }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Path Completion Slider */}
              <div className="space-y-4">
                <div className="flex justify-between text-[10px] uppercase tracking-wider">
                  <label className="text-slate-400">Path Completion (Rotations)</label>
                  <span className="text-white font-mono bg-white/5 px-1.5 rounded">{params.maxRotations}</span>
                </div>
                <div className="relative h-1 w-full bg-white/10 rounded-full group">
                  <input 
                    type="range" min="1" max="100" step="1" 
                    value={params.maxRotations} 
                    onChange={(e) => updateParams({ maxRotations: parseInt(e.target.value) })}
                    onPointerUp={saveHistory}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className="absolute top-0 left-0 h-full bg-amber-500 rounded-full" style={{ width: `${(params.maxRotations / 100) * 100}%` }}></div>
                  <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full border-2 border-amber-500 shadow-lg shadow-amber-500/50" style={{ left: `calc(${(params.maxRotations / 100) * 100}% - 6px)` }}></div>
                </div>
              </div>
            </div>
          </section>

          {/* Simulation System removed from sidebar */}

          <section>
            <h2 className="text-[11px] uppercase tracking-widest text-amber-500/80 mb-4 font-bold flex items-center gap-2 pt-4 border-t border-white/5">
              <Layers className="w-3.5 h-3.5" /> Gear & Path Type
            </h2>
            <div className="space-y-6">
               <div>
                  <h3 className="text-[10px] uppercase tracking-widest text-slate-500 mb-3">Geometric Flow</h3>
                  <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-2">
                      {(['hypotrochoid', 'epitrochoid'] as const).map(type => (
                        <button 
                          key={type}
                          onClick={() => {
                            updateParams({ type });
                            saveHistory();
                          }}
                          className={`py-2 px-3 border border-white/5 rounded text-[9px] uppercase tracking-widest font-bold transition-all relative group ${params.type === type ? 'bg-amber-500 text-black border-amber-500' : 'bg-white/5 hover:bg-white/10'}`}
                        >
                          {type === 'hypotrochoid' ? 'Internal' : 'External'}
                        </button>
                      ))}
                    </div>
                  </div>
              </div>

              <div>
                <h3 className="text-[10px] uppercase tracking-widest text-slate-500 mb-3">Gear Shape</h3>
                <div className="grid grid-cols-3 gap-2">
                  {(['circle', 'flower', 'triangle', 'square', 'oval', 'egg'] as const).map(shape => (
                    <button 
                      key={shape}
                      onClick={() => {
                        updateParams({ gearShape: shape });
                        saveHistory();
                      }}
                      className={`py-2 px-1 border border-white/5 rounded text-[9px] uppercase tracking-widest font-bold transition-all ${params.gearShape === shape ? 'bg-white text-black border-white' : 'bg-white/5 hover:bg-white/10'}`}
                    >
                      {shape}
                    </button>
                  ))}
                </div>
              </div>

              {params.gearShape !== 'circle' && (
                <div className="space-y-3 pt-1">
                  <div className="flex justify-between text-[10px] uppercase font-mono">
                    <span className="text-slate-400">Gear Intensity</span>
                    <span className="text-white">{(params.shapeIntensity * 100).toFixed(0)}%</span>
                  </div>
                  <input 
                    type="range" min="0.1" max="2.0" step="0.1" 
                    value={params.shapeIntensity} 
                    onChange={(e) => updateParams({ shapeIntensity: parseFloat(e.target.value) })}
                    onPointerUp={saveHistory}
                    className="w-full accent-white h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                  />
                </div>
              )}

              <div className="pt-2 p-3 bg-amber-500/5 border border-amber-500/10 rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-amber-500/80">Multi-Stage Mode</label>
                  <div 
                    onClick={() => {
                      updateParams({ isMultiStage: !params.isMultiStage });
                      saveHistory();
                    }}
                    className={`w-8 h-4 rounded-full p-0.5 cursor-pointer transition-colors ${params.isMultiStage ? 'bg-amber-500' : 'bg-white/10'}`}
                  >
                    <div className={`w-3 h-3 bg-white rounded-full transition-transform ${params.isMultiStage ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                </div>
                
                {params.isMultiStage && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                    {/* Gear 2 Outer Teeth */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] uppercase font-mono">
                        <span className="text-slate-400 text-[8px]">Gear 2 Size</span>
                        <span className="text-amber-500">{params.stageTwoTeeth}T</span>
                      </div>
                      <input 
                        type="range" min="8" max={params.stageOneInternalTeeth - 4} step="1" 
                        value={params.stageTwoTeeth} 
                        onChange={(e) => updateParams({ stageTwoTeeth: parseInt(e.target.value) })}
                        onPointerUp={saveHistory}
                        className="w-full accent-amber-500 h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                      />
                    </div>

                    {/* Gear 1 Internal Rail Teeth */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] uppercase font-mono">
                        <span className="text-slate-400 text-[8px]">Gear 1 Rail</span>
                        <span className="text-amber-500">{params.stageOneInternalTeeth}T</span>
                      </div>
                      <input 
                        type="range" min="32" max={params.gearTeeth - 4} step="1" 
                        value={params.stageOneInternalTeeth} 
                        onChange={(e) => updateParams({ stageOneInternalTeeth: parseInt(e.target.value) })}
                        onPointerUp={saveHistory}
                        className="w-full accent-amber-500 h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                      />
                    </div>

                    {/* Rail Offset (Eccentricity) */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] uppercase font-mono">
                        <span className="text-slate-400 text-[8px]">Rail Offset</span>
                        <span className="text-amber-500">{params.railOffset.toFixed(1)}mm</span>
                      </div>
                      <input 
                         type="range" min="-20" max="20" step="0.5" 
                         value={params.railOffset} 
                         onChange={(e) => updateParams({ railOffset: parseFloat(e.target.value) })}
                         onPointerUp={saveHistory}
                         className="w-full accent-white h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                      />
                    </div>

                    <p className="text-[8px] text-slate-500 italic leading-tight pt-2 border-t border-white/5">
                      Adds a secondary orbital frequency. Gear 2 rolls inside Gear 1's adjustable rail.
                    </p>
                  </div>
                )}
              </div>

              <div>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-[10px] uppercase tracking-widest text-slate-500">Ring Profile</h3>
                  <button 
                    onClick={() => {
                      // Small vibration or visual feedback
                      const btn = document.getElementById('refresh-mesh-btn');
                      if (btn) btn.classList.add('scale-95', 'opacity-50');
                      setTimeout(() => {
                        updateParams({ ...params }); // Trigger re-render/logic update
                        if (btn) btn.classList.remove('scale-95', 'opacity-50');
                      }, 100);
                    }}
                    id="refresh-mesh-btn"
                    className="p-1 px-2 bg-white/5 hover:bg-amber-500/20 border border-white/10 rounded text-[8px] uppercase tracking-tighter text-slate-400 hover:text-amber-500 transition-all flex items-center gap-1"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    Refresh Mesh
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    {(['circle', 'oval', 'distorted', 'custom'] as const).map(shape => (
                      <button 
                        key={shape}
                        onClick={() => {
                          updateParams({ ringShape: shape });
                          saveHistory();
                        }}
                        className={`py-2 px-1 border border-white/5 rounded text-[9px] uppercase tracking-widest font-bold transition-all ${params.ringShape === shape ? 'bg-white/20 text-white border-white/40' : 'bg-white/5 hover:bg-white/10'}`}
                      >
                        {shape}
                      </button>
                    ))}
                  </div>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded text-[9px] uppercase tracking-widest font-bold transition-all flex items-center justify-center gap-2 group"
                  >
                    <Upload className="w-3.5 h-3.5 group-hover:-translate-y-0.5 transition-transform" />
                    Import SVG Profile
                  </button>
                  <input 
                    ref={fileInputRef}
                    type="file" 
                    accept=".svg" 
                    className="hidden" 
                    onChange={handleFileUpload}
                  />
                </div>
              </div>

              {params.ringShape === 'custom' && params.customRingPoints && (
                <RingBezierEditor 
                  points={params.customRingPoints} 
                  tension={params.ringTension}
                  teeth={actualRingTeeth}
                  onChange={(points) => updateParams({ customRingPoints: points })} 
                  onTensionChange={(t) => updateParams({ ringTension: t })}
                  onFinishChange={saveHistory}
                />
              )}

              {params.ringShape !== 'circle' && params.ringShape !== 'custom' && (
                <div className="space-y-3 pt-1">
                  <div className="flex justify-between text-[10px] uppercase font-mono">
                    <span className="text-slate-400">Ring Distortion</span>
                    <span className="text-white">{(params.ringIntensity * 100).toFixed(0)}%</span>
                  </div>
                  <input 
                    type="range" min="0.1" max="1.5" step="0.1" 
                    value={params.ringIntensity} 
                    onChange={(e) => updateParams({ ringIntensity: parseFloat(e.target.value) })}
                    onPointerUp={saveHistory}
                    className="w-full accent-white h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                  />
                </div>
              )}
            </div>
          </section>

          <section className="pt-2">
             <button 
                onClick={handleRefresh}
                className="w-full py-3 border border-white/10 rounded text-[10px] uppercase tracking-[0.2em] hover:bg-white/5 transition-colors flex items-center justify-center gap-2"
             >
                <RotateCcw className="w-3.5 h-3.5" /> Reset Simulation
             </button>
          </section>

          {/* Placeholder to maintain gap if needed, or just remove */}
        </aside>        {/* Content Area */}
        <section className="flex-1 flex flex-col bg-[#050505] p-6 lg:p-10 gap-6 overflow-hidden">
          
          {/* Simulation Top Bar */}
          <div className="flex items-center gap-8 bg-black/40 border border-white/5 rounded-2xl p-4 px-8 shadow-2xl backdrop-blur-md">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setIsAnimating(!isAnimating)}
                className={`px-8 py-2 rounded-lg text-[10px] uppercase font-bold tracking-[0.2em] transition-all flex items-center gap-2 border ${isAnimating ? 'bg-amber-500 text-black border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.3)]' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
              >
                <Activity className={`w-3.5 h-3.5 ${isAnimating ? 'animate-pulse' : ''}`} /> 
                {isAnimating ? 'STOP' : 'SIMULATE'}
              </button>
              <button 
                onClick={() => setAnimationTheta(0)}
                className="p-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-all text-slate-400 hover:text-white"
                title="Reset Animation"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 flex flex-col gap-2">
              <div className="flex justify-between text-[8px] uppercase tracking-widest font-mono text-slate-500">
                <span>Timeline Progress</span>
                <span className="text-amber-500">{((animationTheta / (params.maxRotations * Math.PI * 2)) * 100).toFixed(0)}%</span>
              </div>
              <input 
                type="range" min="0" max={params.maxRotations * Math.PI * 2} step="0.01" 
                value={animationTheta} 
                onChange={(e) => {
                  setAnimationTheta(parseFloat(e.target.value));
                  if (isAnimating) setIsAnimating(false);
                }}
                className="w-full accent-amber-500 h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
              />
            </div>

            <div className="w-48 flex flex-col gap-2">
              <div className="flex justify-between text-[8px] uppercase tracking-widest font-mono text-slate-500">
                <span>Feed Speed</span>
                <span className="text-white">{animationSpeed.toFixed(1)}x</span>
              </div>
              <input 
                type="range" min="0.2" max="5" step="0.1" 
                value={animationSpeed} 
                onChange={(e) => setAnimationSpeed(parseFloat(e.target.value))}
                className="w-full accent-white h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
              />
            </div>
          </div>
          
          {/* Main Simulation Viewport */}
          <div className="flex-1 flex flex-col gap-4 relative min-h-0">
            <div className="flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
              </div>
            </div>
            
            <div 
              className={`flex-1 bg-[#020203] border border-white/10 rounded-2xl flex items-center justify-center relative overflow-hidden cursor-grab shadow-2xl ${isDragging ? 'cursor-grabbing' : ''}`}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {/* Engineering Grid */}
              <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #f59e0b 0.5px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
              <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(245,158,11,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(245,158,11,0.2) 1px, transparent 1px)', backgroundSize: '120px 120px' }}></div>
              
              {/* UI Overlays */}
              <div className="absolute top-6 right-6 flex flex-col gap-2 z-10">
                <div className="px-3 py-1.5 bg-black/60 backdrop-blur-xl rounded-lg border border-white/10 text-[10px] font-mono text-white/70 shadow-2xl flex items-center gap-3">
                  <span className="opacity-40 uppercase tracking-tighter">Zoom</span>
                  <span className="text-amber-500">{(zoom * 100).toFixed(0)}%</span>
                </div>
              </div>

              <div className="absolute bottom-6 left-6 z-10 flex gap-4">
                <div className="px-3 py-1.5 bg-amber-500/10 backdrop-blur-xl rounded-lg border border-amber-500/20 text-[9px] font-mono text-amber-500/80 shadow-2xl flex flex-col">
                  <span className="text-[7px] uppercase tracking-widest opacity-50 mb-0.5">Ring Assembly Dimension</span>
                  {(() => {
                    const r = getRadiusFromTeeth(params.ringTeeth) * (params.scale || 1.0);
                    const modMax = params.ringShape === 'custom' ? Math.max(...(params.customRingPoints || [1.0])) : (1 + (params.ringIntensity || 0) * 0.15);
                    const margin = 30 * (params.scale || 1.0);
                    const dim = (r * modMax + margin) * 2;
                    return `${dim.toFixed(1)}mm × ${dim.toFixed(1)}mm (${params.ringTeeth}T)`;
                  })()}
                </div>
                <div className="px-3 py-1.5 bg-amber-500/10 backdrop-blur-xl rounded-lg border border-amber-500/20 text-[9px] font-mono text-amber-500/80 shadow-2xl flex flex-col">
                  <span className="text-[7px] uppercase tracking-widest opacity-50 mb-0.5">Rolling Gear Diameter</span>
                  {(() => {
                    const teeth = params.isMultiStage ? params.stageTwoTeeth : params.gearTeeth;
                    const diameter = teeth * 6 / Math.PI * (params.scale || 1.0);
                    return `${diameter.toFixed(1)}mm Ø (${teeth}T)`;
                  })()}
                </div>
              </div>
              
              <svg 
                viewBox="-400 -400 800 800" 
                className="w-full h-full transition-transform duration-75 ease-out"
                style={{ transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)` }}
              >
                <defs>
                  <filter id="burn-glow">
                    <feGaussianBlur stdDeviation="1.5" result="blur"/>
                    <feComposite in="SourceGraphic" in2="blur" operator="over"/>
                  </filter>
                  <filter id="tip-glow">
                    <feGaussianBlur stdDeviation="3" result="blur"/>
                    <feMerge>
                      <feMergeNode in="blur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                  <radialGradient id="tip-grad">
                    <stop offset="0%" stopColor="#fff" />
                    <stop offset="100%" stopColor="#f59e0b" />
                  </radialGradient>
                  {/* Reuse old glow if needed */}
                  <filter id="glow">
                    <feGaussianBlur stdDeviation="1.5" result="blur"/>
                    <feMerge>
                      <feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                </defs>

                {/* Printer Bed Representation */}
                {showPrinterBed && (
                  <rect
                    x={-bedSize / 2}
                    y={-bedSize / 2}
                    width={bedSize}
                    height={bedSize}
                    fill="rgba(59, 130, 246, 0.05)"
                    stroke="rgba(59, 130, 246, 0.2)"
                    strokeWidth="0.5"
                    strokeDasharray="4 4"
                    rx="2"
                  />
                )}

                {/* Blueprint / Mechanical Structure */}
                {layers.map((layer, lIdx) => {
                  const memo = memoizedLayerPaths[lIdx];
                  if (!layer.visible || !memo) return null;
                  
                  const isActive = lIdx === activeLayerIndex;
                  const opacityMult = dimGears ? 0.2 : 1.0;

                  return (
                    <g key={`rings-${layer.id}`} opacity={opacityMult}>
                      {memo.externalRing && (
                        <path 
                          d={memo.externalRing} 
                          fill="none" 
                          stroke={isActive ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.1)"} 
                          strokeWidth="1.0"
                        />
                      )}
                      
                      {memo.guideShape && (
                        <path 
                          d={memo.guideShape} 
                          fill="none" 
                          stroke={isActive ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.05)"} 
                          strokeWidth="0.5"
                          strokeDasharray="2 2"
                        />
                      )}
                      
                      <path 
                        d={memo.ringGear} 
                        fill={isActive ? "rgba(255,255,255,0.05)" : "transparent"} 
                        stroke={isActive ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.2)"} 
                        strokeWidth="0.3"
                      />
                    </g>
                  );
                })}

                {/* Subtle Drawing Trace */}
                {layersPathStrings.map((layerPaths, lIdx) => (
                  layers[lIdx].visible && layerPaths.map((pathStr, pIdx) => (
                    <path 
                      key={`trace-${lIdx}-${pIdx}-${refreshKey}`}
                      d={pathStr}
                      fill="none"
                      stroke={layers[lIdx].color}
                      strokeWidth={activeLayerIndex === lIdx ? "0.6" : "0.3"}
                      opacity={activeLayerIndex === lIdx ? "1" : "0.4"}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="transition-all duration-300"
                    />
                  ))
                ))}

                {/* Gear Hardware Rendering */}
                {(() => {
                  const gearSystem = getGearSystemState(params, animationTheta);
                  const { gear1, gear2 } = gearSystem;

                  const g1_rot = gear1.rotation * (180 / Math.PI);

                  return (
                    <g 
                      transform={`translate(${gear1.center.x}, ${gear1.center.y}) rotate(${g1_rot})`}
                      opacity={dimGears ? 0.3 : 1.0}
                    >
                      {/* Stage 1 Gear */}
                      <g filter="url(#glow)">
                        <path 
                          d={memoizedLayerPaths[activeLayerIndex]?.gear1Path} 
                          fill="rgba(245,158,11,0.15)" 
                          stroke="#f59e0b" 
                          strokeWidth="0.4"
                        />
                        {params.isMultiStage && (
                          <g transform={`translate(${params.railOffset}, 0)`}>
                            <path 
                              d={memoizedLayerPaths[activeLayerIndex]?.stage2Paths?.internal} 
                              fill="none" 
                              stroke="#f59e0b" 
                              strokeWidth="0.2"
                              strokeDasharray="1 1"
                            />
                          </g>
                        )}
                      </g>
                      
                      {gear2 ? (() => {
                        const r2 = gear2.radius;
                        const dx = gear2.center.x - gear1.center.x;
                        const dy = gear2.center.y - gear1.center.y;
                        
                        const cos1 = Math.cos(-gear1.rotation);
                        const sin1 = Math.sin(-gear1.rotation);
                        
                        const local_g2_x = dx * cos1 - dy * sin1;
                        const local_g2_y = dx * sin1 + dy * cos1;
                        
                        const g2_rot_rel = (gear2.rotation - gear1.rotation) * (180 / Math.PI);

                        return (
                          <g transform={`translate(${local_g2_x}, ${local_g2_y}) rotate(${g2_rot_rel})`}>
                            <path 
                              d={memoizedLayerPaths[activeLayerIndex]?.stage2Paths?.gear2} 
                              fill="rgba(59,130,246,0.3)" 
                              stroke="#3b82f6" 
                              strokeWidth="0.4"
                            />
                            {params.holeOffsets.map((offset, idx) => (
                              <circle 
                                key={idx}
                                cx={r2 * (offset/100)} 
                                cy="0" 
                                r="1.5" 
                                fill="#fff" 
                                opacity="0.6"
                              />
                            ))}
                          </g>
                        );
                      })() : (
                        params.holeOffsets.map((offset, idx) => (
                          <circle 
                            key={idx}
                            cx={gear1.radius * (offset/100)} 
                            cy="0" 
                            r="1.5" 
                            fill="#fff" 
                            opacity="0.6"
                          />
                        ))
                      )}
                    </g>
                  );
                })()}

              </svg>
            </div>
          </div>

          {/* Export Queue Section removed for more simulation space */}
          <div className="shrink-0 flex gap-6">
            {/* Placeholder to maintain gap if needed, or just remove */}
          </div>
        </section>
      </main>

      {/* Bed Size Warning Modal */}
      <AnimatePresence>
        {showBedWarning && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowBedWarning(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              className="relative w-full max-w-md bg-slate-900 border border-amber-500/30 rounded-2xl shadow-2xl overflow-hidden p-8"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white tracking-tight">Large Print Detected</h3>
                  <p className="text-slate-400 text-xs uppercase tracking-widest mt-1">Bed Conflict Clearance</p>
                </div>
              </div>

              <div className="space-y-4 mb-8">
                <div className="p-4 bg-white/5 rounded-xl border border-white/5 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 text-[10px] uppercase font-mono">Current Assembly Width</span>
                    <span className="text-white font-mono text-lg">{currentSize.toFixed(1)}mm</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 text-[10px] uppercase font-mono">Your Bed Capacity</span>
                    <span className="text-amber-500 font-mono text-lg">{bedSize}mm</span>
                  </div>
                  <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-red-500" 
                      style={{ width: `${Math.min(100, (currentSize / bedSize) * 100)}%` }}
                    />
                  </div>
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">
                  The design is larger than your printer bed. We recommend scaling down to ensure a successful print. 
                  <span className="text-amber-500"> Scaling will update the teeth count and real-time preview.</span>
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <button 
                  onClick={() => {
                    handleFitToBed();
                  }}
                  className="w-full py-3 bg-amber-500 text-black font-bold text-sm uppercase tracking-widest rounded-lg hover:bg-amber-400 transition-all flex items-center justify-center gap-2"
                >
                  <Maximize2 className="w-4 h-4" /> Scale to Fit Bed
                </button>
                <div className="flex gap-2">
                  <button 
                    onClick={performSTLExport}
                    className="flex-1 py-3 bg-white/5 text-slate-400 font-bold text-xs uppercase tracking-widest rounded-lg hover:bg-white/10 transition-all border border-white/10"
                  >
                    Export Anyway
                  </button>
                  <button 
                    onClick={() => setShowBedWarning(false)}
                    className="flex-1 py-3 text-slate-500 font-bold text-xs uppercase tracking-widest rounded-lg hover:text-white transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

