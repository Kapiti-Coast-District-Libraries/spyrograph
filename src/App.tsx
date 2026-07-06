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
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Sliders,
  Plus,
  Minus,
  ExternalLink,
  Copy,
  Check,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SpiroParams } from './types';
import { generateSpiroPaths, generateGearSvgPath, generateShapeSvgPath, getRadiusFromTeeth, getSpiroPoint, getGearSystemState, getActualRingTeeth, getMinCurvatureRadius, PITCH, getGearPoints, getShapePoints, getSpiroTotalRotations, getRadiusModifier } from './lib/spiroMath';
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
    <div className="p-4 bg-slate-50/65 border border-slate-200/80 rounded-xl space-y-4 mt-4 select-none">
        <div className="flex justify-between items-center text-[9px] uppercase tracking-widest text-slate-500">
            <span className="flex items-center gap-2">
              <Wrench className="w-3 h-3 text-blue-600" /> 
              Profile Sculptor
            </span>
            <button 
              onClick={() => {
                onChange(Array(points.length).fill(1.0));
                onFinishChange();
              }}
              className="px-2 py-1 bg-slate-200/80 hover:bg-slate-300 rounded text-[8px] transition-colors text-slate-705 font-bold"
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
                <circle key={s} cx={center} cy={center} r={rBase * s} fill="none" stroke="rgba(0,0,0,0.04)" strokeWidth="0.5" />
              ))}
              
              {/* Virtual Teeth Preview */}
              <path d={teethData} fill="none" stroke="rgba(59,130,246,0.2)" strokeWidth="0.5" strokeDasharray="1 1" />
              
              {/* The Profile Line */}
              <path d={pathData} fill="rgba(59,130,246,0.04)" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              
              {/* Control Points */}
              {points.map((mod, i) => {
                  const angle = (i / points.length) * 2 * Math.PI;
                  const r = rBase * mod;
                  const x = center + r * Math.cos(angle);
                  const y = center + r * Math.sin(angle);
                  const isDragging = draggingIdx === i;
                  return (
                      <g key={i} className="group/node">
                        {isDragging && <line x1={center} y1={center} x2={x} y2={y} stroke="rgba(0,0,0,0.2)" strokeWidth="0.5" strokeDasharray="2 2" />}
                        
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
                            fill={isDragging ? "#fff" : "#2563eb"}
                            stroke="#1e3a8a" strokeWidth={isDragging ? 2 : 1}
                            className="pointer-events-none transition-all duration-150 group-hover/node:scale-125 group-hover/node:fill-white group-hover/node:filter group-hover/node:drop-shadow-[0_0_5px_rgba(59,130,246,0.8)]"
                        />
                        
                        {/* Index Indicator on hover */}
                        <text 
                          x={x + 10} y={y - 10} 
                          className="opacity-0 group-hover/node:opacity-100 fill-slate-500 text-[6px] font-mono pointer-events-none transition-opacity"
                        >
                          N{i}
                        </text>
                      </g>
                  );
              })}
          </svg>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-200/60">
          <div className="space-y-2">
            <div className="flex justify-between text-[8px] uppercase text-slate-500 font-mono">
              <span>Resolution</span>
              <span className="text-blue-600 font-bold">{points.length} nodes</span>
            </div>
            <div className="flex gap-1">
              {[4, 8, 16, 32].map(n => (
                <button
                  key={n}
                  onClick={() => {
                    onChange(Array(n).fill(1.0));
                    onFinishChange();
                  }}
                  className={`flex-1 py-1 text-[9px] rounded border transition-all ${points.length === n ? 'bg-blue-50 border-blue-200 text-blue-600 font-bold' : 'bg-slate-100/60 border-slate-200/40 text-slate-500'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-[8px] uppercase text-slate-500 font-mono">
              <span>Curve Tension</span>
              <span className="text-slate-800 font-bold">{(tension * 100).toFixed(0)}</span>
            </div>
            <input 
              type="range" min="0" max="1" step="0.05" 
              value={tension} 
              onChange={(e) => onTensionChange(parseFloat(e.target.value))}
              onPointerUp={onFinishChange}
              className="w-full accent-blue-600 h-1 bg-slate-200 rounded-full appearance-none cursor-pointer"
            />
          </div>
        </div>
    </div>
  );
}

export function getMaxScale(p: SpiroParams): number {
  const baseRingRadius = getRadiusFromTeeth(p.ringTeeth);
  let baseOuterBoundary = baseRingRadius + 20;

  if (p.hasExternalTeeth && p.externalTeeth) {
    const baseTargetOuterRadius = getRadiusFromTeeth(p.externalTeeth);
    baseOuterBoundary = baseTargetOuterRadius + 5;
  } else {
    const baseMargin = 30;
    const modMax = p.ringShape === 'custom' ? Math.max(...(p.customRingPoints || [1.0])) : (1 + (p.ringIntensity || 0) * 0.15);
    baseOuterBoundary = (baseRingRadius * modMax) + baseMargin + 10;
  }
  const baseEnvelope = baseOuterBoundary * 2;
  return Math.max(0.1, 455.0 / baseEnvelope);
}

export function getMaxHolePercent(p: SpiroParams): number {
  const activeGearTeeth = p.isMultiStage ? p.stageTwoTeeth : p.gearTeeth;
  const activeGearRadius = getRadiusFromTeeth(activeGearTeeth);
  
  const gearShape = p.isMultiStage ? 'circle' : p.gearShape;
  const shapeIntensity = p.isMultiStage ? 0 : p.shapeIntensity;
  
  // We want to find the maximum holeOffset % (from 0 to 100) such that 
  // a hole of radius 1.5mm centered at activeGearRadius * (offset/100) 
  // is fully contained within the root boundary of the gear.
  // The root boundary at angle theta is r_root(theta) = activeGearRadius * getRadiusModifier(gearShape, theta, shapeIntensity) - 1.65.
  
  const samples = 120; // angular samples around the gear
  
  for (let pct = 100; pct >= 1; pct--) {
    const d = activeGearRadius * (pct / 100);
    let safe = true;
    
    for (let i = 0; i < samples; i++) {
      const theta = (i / samples) * 2 * Math.PI;
      const mod = getRadiusModifier(gearShape, theta, shapeIntensity, p.customRingPoints, p.ringTension);
      const r_outer = activeGearRadius * mod;
      const r_root = r_outer - 1.65; // base of the teeth
      
      if (d + 1.5 >= r_root) {
        safe = false;
        break;
      }
    }
    
    if (safe) {
      return pct;
    }
  }
  
  return 1; // absolute minimum safeguard
}

export default function App() {
  const defaultParams: SpiroParams = {
    ringTeeth: 40,
    gearTeeth: 18,
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
    maxRotations: 200,
    isMultiStage: false,
    stageTwoTeeth: 12,
    stageOneInternalTeeth: 24,
    railOffset: 0,
    offsetX: 0,
    offsetY: 0,
    scale: 1.0
  };

  const [layers, setLayers] = useState<Layer[]>([
    {
      id: 'layer-1',
      name: 'Ring 1',
      params: { ...defaultParams },
      color: LAYER_COLORS[0],
      visible: true
    }
  ]);
  const [activeLayerIndex, setActiveLayerIndex] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Compute maximum ring dimension and pricing details for custom manufacturing
  const { maxRingDim, hasLargeRing, extraGearsCount, sizeCost, gearsCost, totalCost } = useMemo(() => {
    let maxDim = 0;
    layers.forEach(layer => {
      if (!layer.visible) return;
      const p = layer.params;
      const r = getRadiusFromTeeth(p.ringTeeth) * (p.scale || 1.0);
      const modMax = p.ringShape === 'custom' 
        ? (p.customRingPoints ? Math.max(...p.customRingPoints) : 1.0) 
        : (1 + (p.ringIntensity || 0) * 0.15);
      const margin = 30 * (p.scale || 1.0);
      const dim = (r * modMax + margin) * 2;
      if (dim > maxDim) {
        maxDim = dim;
      }
    });

    const hasLarge = maxDim > 200;
    
    // Total physical gears across visible layers
    const totalGears = layers
      .filter(l => l.visible)
      .reduce((acc, layer) => acc + 1 + (layer.params.isMultiStage ? 1 : 0), 0);
    const extraGears = Math.max(0, totalGears - 1);

    const sCost = hasLarge ? (4.00 + (maxDim - 200) * 0.02) : 0;
    const gCost = extraGears * 1.00;
    const tCost = sCost + gCost;

    return {
      maxRingDim: maxDim,
      hasLargeRing: hasLarge,
      extraGearsCount: extraGears,
      sizeCost: sCost,
      gearsCost: gCost,
      totalCost: tCost
    };
  }, [layers]);

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
  const maxHPercent = getMaxHolePercent(params);

  const currentTotalRotations = useMemo(() => {
    return getSpiroTotalRotations(params);
  }, [params]);

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
    const newLayers = layers.map((layer, idx) => {
      if (idx !== activeLayerIndex) return layer;
      
      const mergedParams = { ...layer.params, gearTeeth: safeTeeth };
      const maxHolePct = getMaxHolePercent(mergedParams);
      if (mergedParams.holeOffsets) {
        mergedParams.holeOffsets = mergedParams.holeOffsets.map(offset => Math.min(offset, maxHolePct));
      }
      return { ...layer, params: mergedParams };
    });
    pushToHistory(newLayers, activeLayerIndex);
    setLayers(newLayers);
  };

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [zoom, setZoom] = useState(5.0);
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

      const { resolution, holeOffsets } = layer.params;
      const totalRotations = getSpiroTotalRotations(layer.params);
      const maxTheta = totalRotations * 2 * Math.PI;
      const pointLimit = layer.params.isMultiStage ? 30000 : 12000;
      const step = Math.max(0.04 / resolution, maxTheta / pointLimit);

      return full.paths.map((fullPath, pIdx) => {
        const targetIndex = Math.floor(animationTheta / step);
        const sliced = fullPath.slice(0, targetIndex + 1);
        const currentPoint = getSpiroPoint(layer.params, holeOffsets[pIdx], animationTheta, pIdx);
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
        const maxT = currentTotalRotations * Math.PI * 2;
        if (next >= maxT) return maxT;
        return next;
      });
      frameId = requestAnimationFrame(animate);
    };
    
    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [isAnimating, animationSpeed, currentTotalRotations]);

  const updateParams = (newParamsPartial: Partial<SpiroParams>) => {
    const newLayers = layers.map((layer, idx) => {
      if (idx !== activeLayerIndex) return layer;
      
      const mergedParams = { ...layer.params, ...newParamsPartial };
      const maxAllowedScale = getMaxScale(mergedParams);
      if (mergedParams.scale > maxAllowedScale) {
        mergedParams.scale = maxAllowedScale;
      }
      
      // Keep hole offsets fully inside the root boundary of current active gear teeth
      const maxHolePct = getMaxHolePercent(mergedParams);
      if (mergedParams.holeOffsets) {
        mergedParams.holeOffsets = mergedParams.holeOffsets.map(offset => Math.min(offset, maxHolePct));
      }
      
      return { ...layer, params: mergedParams };
    });
    setLayers(newLayers);
  };

  const addLayer = (overrides?: Partial<SpiroParams>, name?: string) => {
    const newIdx = layers.length;
    const spacing = 40; // 40mm spacing between ring outer boundaries

    // Find the rightmost boundary of any existing ring
    let maxXEdge = 0;
    if (layers.length > 0) {
      const edges = layers.map(l => {
        const p = l.params;
        const ringRadius = getRadiusFromTeeth(p.ringTeeth) * (p.scale || 1.0);
        const modMax = p.ringShape === 'custom' 
          ? (p.customRingPoints ? Math.max(...p.customRingPoints) : 1.0) 
          : (1 + (p.ringIntensity || 1.0) * 0.15);
        const margin = 30 * (p.scale || 1.0);
        const outerRadius = (ringRadius * modMax) + margin;
        return (p.offsetX || 0) + outerRadius;
      });
      maxXEdge = Math.max(...edges);
    }

    // Prepare default and override params
    const baseParams = { ...defaultParams, ...overrides };

    // Calculate outer radius for the new ring to know how much to shift its center
    const newRingRadius = getRadiusFromTeeth(baseParams.ringTeeth) * (baseParams.scale || 1.0);
    const newModMax = baseParams.ringShape === 'custom' 
      ? (baseParams.customRingPoints ? Math.max(...baseParams.customRingPoints) : 1.0) 
      : (1 + (baseParams.ringIntensity || 1.0) * 0.15);
    const newMargin = 30 * (baseParams.scale || 1.0);
    const newOuterRadius = (newRingRadius * newModMax) + newMargin;

    // Shift new ring center to the right of the rightmost edge plus its own outer radius plus padding
    let computedOffsetX = 0;
    if (layers.length > 0) {
      computedOffsetX = maxXEdge + newOuterRadius + spacing;
    }

    const finalParams = {
      ...baseParams,
      offsetX: overrides?.offsetX !== undefined ? overrides.offsetX : computedOffsetX
    };

    const newLayer: Layer = {
      id: `layer-${Date.now()}-${newIdx}`,
      name: name || `Ring ${newIdx + 1}`,
      params: finalParams,
      color: LAYER_COLORS[newIdx % LAYER_COLORS.length],
      visible: true
    };
    const newLayers = [...layers, newLayer];
    pushToHistory(newLayers, newIdx);
    setLayers(newLayers);
    setActiveLayerIndex(newIdx);
    setPan({ x: -finalParams.offsetX, y: -finalParams.offsetY || 0 });
  };

  const addRollingGear = () => {
    const activeParams = layers[activeLayerIndex]?.params || defaultParams;
    const activeName = layers[activeLayerIndex]?.name || "Ring 1";
    
    // Choose a default distinct gear size
    let newGearTeeth = activeParams.gearTeeth + 4;
    if (newGearTeeth >= activeParams.ringTeeth) {
      newGearTeeth = Math.max(12, activeParams.ringTeeth - 6);
    }

    const gearParams: SpiroParams = {
      ...activeParams,
      gearTeeth: newGearTeeth,
      holeOffsets: [Math.min(50, getMaxHolePercent({ ...activeParams, gearTeeth: newGearTeeth }))],
      hiddenHoles: [false]
    };

    const newIdx = layers.length;
    const cleanName = activeName.includes(" - Gear") ? activeName.split(" - Gear")[0] : activeName;
    const gearName = `${cleanName} - Gear ${gearParams.gearTeeth}T`;

    const newLayer: Layer = {
      id: `layer-${Date.now()}-${newIdx}`,
      name: gearName,
      params: gearParams,
      color: LAYER_COLORS[newIdx % LAYER_COLORS.length],
      visible: true
    };

    const newLayers = [...layers, newLayer];
    pushToHistory(newLayers, newIdx);
    setLayers(newLayers);
    setActiveLayerIndex(newIdx);
    setPan({ x: -(gearParams.offsetX || 0), y: -(gearParams.offsetY || 0) });
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

  const handleRandomize = () => {
    const numLayers = Math.random() > 0.65 ? 2 : 1;
    const newLayers: Layer[] = [];
    
    // Choose common beautiful sizes for the base rings
    const commonRingTeeth = [60, 72, 80, 84, 96, 105, 120, 140, 144, 150, 160, 180, 200];
    const shapes: ('circle' | 'oval' | 'custom')[] = ['circle', 'oval', 'circle', 'circle', 'circle'];
    const gearShapes: ('circle' | 'flower' | 'triangle' | 'square' | 'oval' | 'egg')[] = ['circle', 'flower', 'triangle', 'square', 'oval', 'egg'];
    const flowTypes: ('hypotrochoid' | 'epitrochoid')[] = ['hypotrochoid', 'epitrochoid', 'hypotrochoid'];

    const spacing = 40;
    let currentXOffset = 0;

    for (let i = 0; i < numLayers; i++) {
      const ringShape = shapes[Math.floor(Math.random() * shapes.length)];
      const ringTeeth = commonRingTeeth[Math.floor(Math.random() * commonRingTeeth.length)];
      
      const r_ring = getRadiusFromTeeth(ringTeeth);
      const ringIntensity = ringShape !== 'circle' ? 0.2 + Math.random() * 0.6 : 1.0;
      const ringTension = 0.3 + Math.random() * 0.5;
      
      let customRingPoints = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
      if (ringShape === 'custom') {
        customRingPoints = customRingPoints.map(() => 0.8 + Math.random() * 0.4);
      }
      
      const modMax = ringShape === 'custom' 
        ? Math.max(...customRingPoints) 
        : (1 + (ringShape === 'circle' ? 0 : ringIntensity) * 0.15);
      const margin = 30;
      const outerRadius = (r_ring * modMax) + margin;
      
      if (i > 0) {
        const prevLayer = newLayers[i - 1];
        const prevParams = prevLayer.params;
        const prevR = getRadiusFromTeeth(prevParams.ringTeeth);
        const prevModMax = prevParams.ringShape === 'custom' 
          ? Math.max(...(prevParams.customRingPoints || [1.0])) 
          : (1 + (prevParams.ringShape === 'circle' ? 0 : prevParams.ringIntensity) * 0.15);
        const prevOuterRadius = (prevR * prevModMax) + margin;
        currentXOffset = (prevParams.offsetX || 0) + prevOuterRadius + outerRadius + spacing;
      }

      const minCurv = getMinCurvatureRadius(
        ringTeeth, 
        ringShape, 
        ringIntensity, 
        customRingPoints, 
        ringTension,
        1.0
      );
      const safeLimit = Math.floor((2 * Math.PI * (minCurv * 0.98)) / PITCH);
      const maxPossibleTeeth = Math.max(8, Math.min(ringTeeth - 4, safeLimit));
      
      let gearTeeth = 24;
      const candidates: number[] = [];
      const getGcd = (a: number, b: number): number => {
        let tempA = a;
        let tempB = b;
        while (tempB !== 0) {
          const t = tempB;
          tempB = tempA % tempB;
          tempA = t;
        }
        return tempA;
      };
      for (let t = 12; t <= maxPossibleTeeth; t += 2) {
        const divisor = getGcd(ringTeeth, t);
        if (divisor > 1 && divisor < t) {
          candidates.push(t);
        }
      }
      if (candidates.length > 0) {
        gearTeeth = candidates[Math.floor(Math.random() * candidates.length)];
      } else {
        gearTeeth = Math.floor(12 + Math.random() * (maxPossibleTeeth - 12));
      }
      if (gearTeeth < 8) gearTeeth = 8;
      if (gearTeeth >= ringTeeth) gearTeeth = Math.max(8, ringTeeth - 4);

      const type: 'hypotrochoid' | 'epitrochoid' = 'hypotrochoid';
      const gearShape = gearShapes[Math.floor(Math.random() * gearShapes.length)];
      const shapeIntensity = 0.2 + Math.random() * 1.0;
      
      const isMultiStage = Math.random() > 0.8;
      let stageTwoTeeth = 12;
      let stageOneInternalTeeth = 24;
      let railOffset = 0;
      if (isMultiStage) {
        stageOneInternalTeeth = Math.max(16, Math.floor(gearTeeth / 2) * 2);
        if (stageOneInternalTeeth >= gearTeeth) stageOneInternalTeeth = Math.max(8, gearTeeth - 6);
        stageTwoTeeth = Math.max(8, Math.floor(stageOneInternalTeeth / 2));
        railOffset = Number((Math.random() * 3).toFixed(1));
      }

      const numHoles = Math.floor(1 + Math.random() * 3);
      const tempParams = {
        ringTeeth,
        gearTeeth,
        holeOffsets: [50],
        rotation: 0,
        resolution: 1,
        type,
        gearShape,
        shapeIntensity,
        ringShape,
        ringIntensity,
        ringTension,
        customRingPoints,
        maxRotations: 30,
        isMultiStage,
        stageTwoTeeth,
        stageOneInternalTeeth,
        railOffset,
        scale: 1.0
      };
      const maxHolePct = getMaxHolePercent(tempParams);
      const holeOffsets: number[] = [];
      const hiddenHoles: boolean[] = [];
      
      for (let h = 0; h < numHoles; h++) {
        const fraction = (h + 1) / (numHoles + 1);
        const offsetVal = Math.max(5, Math.floor(maxHolePct * (fraction + (Math.random() * 0.15 - 0.075))));
        holeOffsets.push(offsetVal);
        hiddenHoles.push(false);
      }

      const maxRotations = 200;

      const p: SpiroParams = {
        ...tempParams,
        holeOffsets,
        hiddenHoles,
        maxRotations,
        offsetX: currentXOffset,
        offsetY: 0,
        scale: 1.0
      };

      const maxAllowedScale = getMaxScale(p);
      p.scale = Number(Math.min(1.2, maxAllowedScale * 0.85).toFixed(2));

      newLayers.push({
        id: `layer-rand-${Date.now()}-${i}`,
        name: `Ring ${i + 1}`,
        params: p,
        color: LAYER_COLORS[i % LAYER_COLORS.length],
        visible: true
      });
    }

    pushToHistory(newLayers, 0);
    setLayers(newLayers);
    setActiveLayerIndex(0);
    
    if (newLayers[0]) {
      setPan({ x: -newLayers[0].params.offsetX, y: -newLayers[0].params.offsetY || 0 });
    }
    setAnimationTheta(0);
  };

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
    setZoom(5.0);
    setPan({ x: 0, y: 0 });
    setAnimationTheta(0);
  };

  const handleWheel = (e: React.WheelEvent) => {
    const isZoomIn = e.deltaY < 0;
    const factor = 1.1;
    setZoom(prev => {
      const next = isZoomIn ? prev * factor : prev / factor;
      return Math.min(Math.max(1.25, next), 40.0);
    });
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
  const [showLaserModal, setShowLaserModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [submitterName, setSubmitterName] = useState(() => localStorage.getItem('spiroforge_sub_name') || '');
  const [submitterEmail, setSubmitterEmail] = useState(() => localStorage.getItem('spiroforge_sub_email') || '');
  const [submitterNotes, setSubmitterNotes] = useState(() => localStorage.getItem('spiroforge_sub_notes') || '');
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
    const seenRings = new Set<string>();
    
    layers.forEach((layer, index) => {
      const p = layer.params;
      const ringKey = JSON.stringify({
        ringTeeth: p.ringTeeth,
        ringShape: p.ringShape,
        ringIntensity: p.ringIntensity,
        customRingPoints: p.customRingPoints,
        ringTension: p.ringTension,
        scale: p.scale || 1.0,
        hasExternalTeeth: p.hasExternalTeeth,
        externalTeeth: p.externalTeeth
      });

      const cleanRingName = layer.name.includes(" - Gear") ? layer.name.split(" - Gear")[0] : layer.name;
      const ringFileName = `spiroforge-${cleanRingName.replace(/\s+/g, '-').toLowerCase()}-ring`;
      const gearFileName = `spiroforge-gear-${layer.name.replace(/\s+/g, '-').toLowerCase()}`;

      // 1. Export Ring Gear (Annulus)
      if (!seenRings.has(ringKey)) {
        seenRings.add(ringKey);
        const ringRadius = getRadiusFromTeeth(p.ringTeeth);
        const innerPoints = getGearPoints(p.ringTeeth, true, p.ringShape, p.ringIntensity, p.customRingPoints, p.ringTension, p.offsetX, p.offsetY, p.scale);
        
        let outerPoints;
        const margin = 20 * (p.scale || 1.0);
        outerPoints = getShapePoints(ringRadius, p.ringShape, p.ringIntensity, p.customRingPoints, p.ringTension, p.offsetX, p.offsetY, p.scale, margin);
        
        generateRingSTL(innerPoints, outerPoints, extrusionHeight, ringFileName);
      }

      // 2. Export Target Gear
      const gearPoints = getGearPoints(p.gearTeeth, false, p.gearShape, p.shapeIntensity, undefined, undefined, 0, 0, p.scale);
      const scaledGearRadius = getRadiusFromTeeth(p.gearTeeth) * (p.scale || 1.0);
      
      const holes = p.isMultiStage ? [] : p.holeOffsets.map((offset, hIdx) => {
        const holeAngle = hIdx * (30 * Math.PI / 180);
        return {
          x: scaledGearRadius * (offset / 100) * Math.cos(holeAngle),
          y: scaledGearRadius * (offset / 100) * Math.sin(holeAngle),
          r: 1.5,
          chamfer: 1.0
        };
      });

      generateSTL([{ points: gearPoints, height: extrusionHeight, holes }], `${gearFileName}-gear`);

      if (p.isMultiStage) {
        const scaledGear2Radius = getRadiusFromTeeth(p.stageTwoTeeth) * (p.scale || 1.0);
        const stage2Points = getGearPoints(p.stageTwoTeeth, false, 'circle', 1.0, undefined, undefined, 0, 0, p.scale);
        const stage2Holes = p.holeOffsets.map((offset, hIdx) => {
          const holeAngle = hIdx * (30 * Math.PI / 180);
          return {
            x: scaledGear2Radius * (offset / 100) * Math.cos(holeAngle),
            y: scaledGear2Radius * (offset / 100) * Math.sin(holeAngle),
            r: 1.5,
            chamfer: 1.0
          };
        });
        generateSTL([{ points: stage2Points, height: extrusionHeight, holes: stage2Holes }], `${gearFileName}-stage2`);
      }
    });

    setShowBedWarning(false);
  };

  const handleExportSTL = () => {
    // Check if any layer exceeds the bed size
    let anyExceeds = false;
    let maxFullSize = 0;
    
    layers.forEach(layer => {
      const p = layer.params;
      const ringRadius = getRadiusFromTeeth(p.ringTeeth) * (p.scale || 1.0);
      const modMax = p.ringShape === 'custom' ? Math.max(...(p.customRingPoints || [1.0])) : (1 + p.ringIntensity * 0.15);
      const outerBoundary = (ringRadius * modMax) + 20;
      const currentFullSize = outerBoundary * 2;
      if (currentFullSize > maxFullSize) {
        maxFullSize = currentFullSize;
      }
      if (currentFullSize > bedSize) {
        anyExceeds = true;
      }
    });
    
    if (anyExceeds) {
      setCurrentSize(maxFullSize);
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
      .map((l, lIdx) => {
        if (!layers[lIdx].visible) return [];
        return l.paths.filter((_, pIdx) => !layers[lIdx].params.hiddenHoles?.[pIdx]).flat();
      });
    
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
      return layerFull.paths.map((points, pIdx) => {
        if (layerParams.hiddenHoles?.[pIdx]) return '';
        const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x - minX + padding} ${p.y - minY + padding}`).join(' ');
        return `<path d="${pathData}" fill="none" stroke="${layers[lIdx].color}" stroke-width="0.8" />`;
      }).filter(Boolean).join('\n');
    }).join('\n');

    return `<svg width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${svgPaths}</svg>`;
  };

  const generatePartsSvg = () => {
    interface PackedItem {
      id: string;
      type: 'ring' | 'gear1' | 'gear2';
      layerIndex: number;
      layerName: string;
      scale: number;
      outerRadius: number;
      innerClearRadius?: number;
      localX: number;
      localY: number;
      globalX?: number;
      globalY?: number;
      children: PackedItem[];
      ringPath?: string;
      extRingPath?: string;
      gearPath?: string;
      gear1InternalPath?: string;
      gear2Path?: string;
      holeOffsets?: number[];
      hiddenHoles?: boolean[];
      railOffset?: number;
      isMultiStage?: boolean;
    }

    const rawRings: PackedItem[] = [];
    const rawGears: PackedItem[] = [];
    const seenRings = new Set<string>();

    layers.forEach((layer, lIdx) => {
      const p = layer.params;
      
      const ringKey = JSON.stringify({
        ringTeeth: p.ringTeeth,
        ringShape: p.ringShape,
        ringIntensity: p.ringIntensity,
        customRingPoints: p.customRingPoints,
        ringTension: p.ringTension,
        scale: p.scale || 1.0,
        hasExternalTeeth: p.hasExternalTeeth,
        externalTeeth: p.externalTeeth
      });

      const currentRingRadius = getRadiusFromTeeth(p.ringTeeth) * (p.scale || 1.0);
      
      if (!seenRings.has(ringKey)) {
        seenRings.add(ringKey);
        
        // Calculate outerBoundary & paths relative to origin (0,0)
        let outerBoundary = currentRingRadius + 20;
        let extRingPath = '';
        if (p.hasExternalTeeth && p.externalTeeth) {
          const targetOuterRadius = getRadiusFromTeeth(p.externalTeeth) * (p.scale || 1.0);
          const margin = targetOuterRadius - currentRingRadius;
          extRingPath = generateGearSvgPath(p.ringTeeth, false, p.ringShape, p.ringIntensity, p.customRingPoints, p.ringTension, 0, 0, p.scale, margin);
          outerBoundary = targetOuterRadius + 5;
        } else {
          const margin = 30 * (p.scale || 1.0);
          extRingPath = generateShapeSvgPath(getRadiusFromTeeth(p.ringTeeth), p.ringShape, p.ringIntensity, p.customRingPoints, p.ringTension, 0, 0, p.scale, margin);
          const modMax = p.ringShape === 'custom' ? Math.max(...(p.customRingPoints || [1.0])) : (1 + p.ringIntensity * 0.15);
          outerBoundary = (currentRingRadius * modMax) + margin + 10;
        }

        const ringPath = generateGearSvgPath(p.ringTeeth, true, p.ringShape, p.ringIntensity, p.customRingPoints, p.ringTension, 0, 0, p.scale);

        // Sample ring internal teeth geometry to find the actual minimum clearance inner radius
        const ringPoints = getGearPoints(p.ringTeeth, true, p.ringShape, p.ringIntensity, p.customRingPoints, p.ringTension, 0, 0, p.scale);
        const minR = ringPoints.reduce((min, pt) => {
          const dist = Math.sqrt(pt.x * pt.x + pt.y * pt.y);
          return Math.min(min, dist);
        }, Infinity);
        const innerClearRadius = Math.max(10, minR - 1.5); // 1.5mm safe spacing away from internal teeth

        rawRings.push({
          id: `ring-${layer.id}`,
          type: 'ring',
          layerIndex: lIdx,
          layerName: layer.name,
          scale: p.scale || 1.0,
          outerRadius: outerBoundary,
          innerClearRadius,
          localX: 0,
          localY: 0,
          children: [] as PackedItem[],
          ringPath,
          extRingPath
        });
      }

      // Gear 1
      const gearPoints = getGearPoints(p.gearTeeth, false, p.gearShape, p.shapeIntensity, undefined, undefined, 0, 0, p.scale);
      const maxGearR = gearPoints.reduce((max, pt) => {
        const dist = Math.sqrt(pt.x * pt.x + pt.y * pt.y);
        return Math.max(max, dist);
      }, 0);
      const gearPath = generateGearSvgPath(p.gearTeeth, false, p.gearShape, p.shapeIntensity, undefined, undefined, 0, 0, p.scale);
      const gear1InternalPath = p.isMultiStage ? generateGearSvgPath(p.stageOneInternalTeeth, true, 'circle', 1.0, undefined, undefined, 0, 0, p.scale) : '';

      rawGears.push({
        id: `g1-${layer.id}`,
        type: 'gear1',
        layerIndex: lIdx,
        layerName: layer.name,
        scale: p.scale || 1.0,
        outerRadius: maxGearR + 1.2, // 1.2mm safety buffer
        localX: 0,
        localY: 0,
        children: [] as PackedItem[],
        gearPath,
        gear1InternalPath,
        holeOffsets: p.holeOffsets,
        hiddenHoles: p.hiddenHoles,
        railOffset: p.railOffset,
        isMultiStage: p.isMultiStage
      });

      // Gear 2 (if multi-stage)
      if (p.isMultiStage) {
        const stage2Points = getGearPoints(p.stageTwoTeeth, false, 'circle', 1.0, undefined, undefined, 0, 0, p.scale);
        const maxGear2R = stage2Points.reduce((max, pt) => {
          const dist = Math.sqrt(pt.x * pt.x + pt.y * pt.y);
          return Math.max(max, dist);
        }, 0);
        const gear2Path = generateGearSvgPath(p.stageTwoTeeth, false, 'circle', 1.0, undefined, undefined, 0, 0, p.scale);
        
        rawGears.push({
          id: `g2-${layer.id}`,
          type: 'gear2',
          layerIndex: lIdx,
          layerName: layer.name,
          scale: p.scale || 1.0,
          outerRadius: maxGear2R + 1.2, // 1.2mm safety buffer
          localX: 0,
          localY: 0,
          children: [] as PackedItem[],
          gear2Path,
          holeOffsets: p.holeOffsets,
          hiddenHoles: p.hiddenHoles
        });
      }
    });

    // Nest smaller rings coaxially inside larger rings
    const sortedRings = [...rawRings].sort((a, b) => b.outerRadius - a.outerRadius);
    const rootRings: PackedItem[] = [];

    function tryNestRing(ring: PackedItem, parent: PackedItem): boolean {
      if (!parent.innerClearRadius) return false;
      
      const childRing = parent.children.find(c => c.type === 'ring');
      if (childRing) {
        return tryNestRing(ring, childRing);
      }

      if (ring.outerRadius + 3.0 <= parent.innerClearRadius) {
        ring.localX = 0;
        ring.localY = 0;
        parent.children.push(ring);
        return true;
      }
      return false;
    }

    for (const ring of sortedRings) {
      let nested = false;
      for (const rootRing of rootRings) {
        if (tryNestRing(ring, rootRing)) {
          nested = true;
          break;
        }
      }
      if (!nested) {
        rootRings.push(ring);
      }
    }

    // Collect innermost open ring holes (bins) where we will pack the gears
    const innermostRings: PackedItem[] = [];
    function findInnermost(node: PackedItem) {
      const childRing = node.children.find(c => c.type === 'ring');
      if (childRing) {
        findInnermost(childRing);
      } else {
        innermostRings.push(node);
      }
    }
    rootRings.forEach(findInnermost);

    // Pack gears inside innermost ring holes using highly optimized concentric polar placement
    const sortedGears = [...rawGears].sort((a, b) => b.outerRadius - a.outerRadius);
    const unplacedGears: PackedItem[] = [];

    function findCirclePlacement(r: number, Rbin: number, placed: PackedItem[]): { x: number; y: number } | null {
      const margin = 2.0; // mm minimum gap between items
      
      if (placed.length === 0) {
        if (r <= Rbin) return { x: 0, y: 0 };
        return null;
      }

      const rStep = 2.0; 
      for (let currentR = 0; currentR <= Rbin - r; currentR += rStep) {
        const circumference = 2 * Math.PI * currentR;
        const angleCount = currentR === 0 ? 1 : Math.max(8, Math.ceil(circumference / 6.0));
        
        for (let j = 0; j < angleCount; j++) {
          const angle = (j / angleCount) * 2 * Math.PI;
          const x = currentR * Math.cos(angle);
          const y = currentR * Math.sin(angle);

          if (Math.sqrt(x * x + y * y) + r > Rbin) continue;

          let overlap = false;
          for (const other of placed) {
            const dist = Math.sqrt((x - other.localX) ** 2 + (y - other.localY) ** 2);
            if (dist < r + other.outerRadius + margin) {
              overlap = true;
              break;
            }
          }

          if (!overlap) {
            return { x, y };
          }
        }
      }
      return null;
    }

    for (const gear of sortedGears) {
      let placed = false;
      for (const ring of innermostRings) {
        const pos = findCirclePlacement(gear.outerRadius, ring.innerClearRadius || 0, ring.children);
        if (pos) {
          gear.localX = pos.x;
          gear.localY = pos.y;
          ring.children.push(gear);
          placed = true;
          break;
        }
      }
      if (!placed) {
        unplacedGears.push(gear);
      }
    }

    const topLevelItems: PackedItem[] = [...rootRings, ...unplacedGears];

    // Compute grid/row coordinates for the top-level items on the laser bed
    let currentX = 0;
    let currentY = 0;
    let maxRowHeightInY = 0;
    const itemSpacing = 15; // 15mm gap between parts
    const maxRowWidth = Math.max(400, bedSize);

    function computeGlobalCoordinates(item: PackedItem, gX: number, gY: number) {
      item.globalX = gX;
      item.globalY = gY;
      item.children.forEach(child => {
        computeGlobalCoordinates(child, gX + child.localX, gY + child.localY);
      });
    }

    for (const item of topLevelItems) {
      const r = item.outerRadius;
      
      if (currentX + r > maxRowWidth - 20) {
        currentX = 0;
        currentY += maxRowHeightInY + itemSpacing;
        maxRowHeightInY = 0;
      }

      if (currentX === 0) {
        currentX += r + 10;
      } else {
        currentX += r + itemSpacing;
      }

      computeGlobalCoordinates(item, currentX, currentY + r + 10);

      currentX += r;
      maxRowHeightInY = Math.max(maxRowHeightInY, r * 2);
    }

    // Measure actual workspace size of the packed layout to fit the SVG viewport perfectly
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    function findExtents(item: PackedItem) {
      const r = item.outerRadius;
      if (item.globalX !== undefined && item.globalY !== undefined) {
        minX = Math.min(minX, item.globalX - r);
        maxX = Math.max(maxX, item.globalX + r);
        minY = Math.min(minY, item.globalY - r);
        maxY = Math.max(maxY, item.globalY + r);
      }
      item.children.forEach(findExtents);
    }
    topLevelItems.forEach(findExtents);

    if (minX === Infinity) {
      minX = 0;
      maxX = 200;
      minY = 0;
      maxY = 200;
    }

    const padding = 15;
    const totalWidth = (maxX - minX) + padding * 2;
    const totalHeight = (maxY - minY) + padding * 2;
    const viewBoxX = minX - padding;
    const viewBoxY = minY - padding;

    // Flatten nested structure to easily serialize SVG groups
    const flatItems: PackedItem[] = [];
    function flatten(item: PackedItem) {
      flatItems.push(item);
      item.children.forEach(flatten);
    }
    topLevelItems.forEach(flatten);

    const svgGroups = flatItems.map((item) => {
      const x = item.globalX || 0;
      const y = item.globalY || 0;

      if (item.type === 'ring') {
        const cleanName = item.layerName.includes(" - Gear") ? item.layerName.split(" - Gear")[0] : item.layerName;
        return `
        <!-- Ring Part: ${cleanName} -->
        <g transform="translate(${x}, ${y})">
          <path d="${item.ringPath} ${item.extRingPath}" fill="none" stroke="red" stroke-width="0.12" fill-rule="evenodd" stroke-linecap="round" stroke-linejoin="round" />
        </g>
        `;
      } else if (item.type === 'gear1') {
        const refTeeth = layers[item.layerIndex].params.gearTeeth;
        const targetRadius = getRadiusFromTeeth(refTeeth) * item.scale;
        
        const holePaths = !item.isMultiStage && item.holeOffsets ? item.holeOffsets.map((offset, hIdx) => {
          if (item.hiddenHoles?.[hIdx]) return '';
          const holeAngle = hIdx * (30 * Math.PI / 180);
          const holeX = targetRadius * (offset / 100) * Math.cos(holeAngle);
          const holeY = targetRadius * (offset / 100) * Math.sin(holeAngle);
          const holeR = 1.6;
          return `<path d="M ${holeX - holeR},${holeY} a ${holeR},${holeR} 0 1,0 ${holeR * 2},0 a ${holeR},${holeR} 0 1,0 -${holeR * 2},0" fill="none" stroke="red" stroke-width="0.25" stroke-linecap="round" stroke-linejoin="round" />`;
        }).join('\n') : '';

        return `
        <!-- Gear 1 Part: ${item.layerName} -->
        <g transform="translate(${x}, ${y})">
          <path d="${item.gearPath}" fill="none" stroke="red" stroke-width="0.12" fill-rule="evenodd" stroke-linecap="round" stroke-linejoin="round" />
          ${item.isMultiStage ? `
          <g transform="translate(${item.railOffset || 0}, 0)">
            <path d="${item.gear1InternalPath}" fill="none" stroke="red" stroke-width="0.12" stroke-linecap="round" stroke-linejoin="round" />
          </g>
          ` : ''}
          ${holePaths}
          <!-- Center Point Mark -->
          <line x1="-1.2" y1="0" x2="1.2" y2="0" stroke="blue" stroke-width="0.06" />
          <line x1="0" y1="-1.2" x2="0" y2="1.2" stroke="blue" stroke-width="0.06" />
        </g>
        `;
      } else {
        // Gear 2 (stage 2)
        const refTeeth = layers[item.layerIndex].params.stageTwoTeeth;
        const targetRadius = getRadiusFromTeeth(refTeeth) * item.scale;

        const holePaths = item.holeOffsets ? item.holeOffsets.map((offset, hIdx) => {
          if (item.hiddenHoles?.[hIdx]) return '';
          const holeAngle = hIdx * (30 * Math.PI / 180);
          const holeX = targetRadius * (offset / 100) * Math.cos(holeAngle);
          const holeY = targetRadius * (offset / 100) * Math.sin(holeAngle);
          const holeR = 1.6;
          return `<path d="M ${holeX - holeR},${holeY} a ${holeR},${holeR} 0 1,0 ${holeR * 2},0 a ${holeR},${holeR} 0 1,0 -${holeR * 2},0" fill="none" stroke="red" stroke-width="0.25" stroke-linecap="round" stroke-linejoin="round" />`;
        }).join('\n') : '';

        return `
        <!-- Gear 2 Part: ${item.layerName} -->
        <g transform="translate(${x}, ${y})">
          <path d="${item.gear2Path}" fill="none" stroke="red" stroke-width="0.12" fill-rule="evenodd" stroke-linecap="round" stroke-linejoin="round" />
          ${holePaths}
          <!-- Center Point Mark -->
          <line x1="-1.2" y1="0" x2="1.2" y2="0" stroke="blue" stroke-width="0.06" />
          <line x1="0" y1="-1.2" x2="0" y2="1.2" stroke="blue" stroke-width="0.06" />
        </g>
        `;
      }
    }).join('\n');

    return `
      <svg width="${totalWidth}mm" height="${totalHeight}mm" viewBox="${viewBoxX} ${viewBoxY} ${totalWidth} ${totalHeight}" xmlns="http://www.w3.org/2000/svg">
        <desc>Kapiti Libraries SpiroForge - Optimized High-Density Nested Laser Cut Template</desc>
        ${svgGroups}
      </svg>
    `.trim();
  };

  return (
    <div className="h-screen bg-slate-50 text-slate-700 font-sans flex flex-col overflow-hidden selection:bg-blue-600 selection:text-white">
      
      {/* Header */}
      <header className="h-16 border-b border-slate-200 flex items-center justify-between px-8 shrink-0 bg-white z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-blue-50 border border-blue-200 flex items-center justify-center animate-pulse">
            <Activity className="w-4 h-4 text-blue-600" />
          </div>
          <h1 className="text-lg font-light tracking-widest text-slate-800 uppercase">
            Kapiti Libraries <span className="font-bold text-blue-600">SpiroForge</span>
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200 mr-2 shadow-inner">
            <button 
              onClick={undo}
              disabled={history.length === 0}
              className="p-1.5 hover:bg-slate-200/60 rounded disabled:opacity-20 disabled:hover:bg-transparent transition-all active:scale-90"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4 text-slate-700" />
            </button>
            <button 
              onClick={redo}
              disabled={future.length === 0}
              className="p-1.5 hover:bg-slate-200/60 rounded disabled:opacity-20 disabled:hover:bg-transparent transition-all active:scale-90"
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 className="w-4 h-4 text-slate-700" />
            </button>
          </div>
              <div className="flex gap-2 items-center">
                <button 
                  onClick={() => setDimGears(!dimGears)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${dimGears ? 'bg-slate-100 border-slate-200 text-slate-400' : 'bg-blue-600 border-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.3)]'}`}
                >
                  {dimGears ? 'Brighten Gears' : 'Dim Gears'}
                </button>
                {/* Bed Size Setting */}
            <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 mr-2">
              <button 
                onClick={() => setShowPrinterBed(!showPrinterBed)}
                title={showPrinterBed ? "Hide printer bed guide" : "Show printer bed guide"}
                className={`p-1 rounded transition-colors ${showPrinterBed ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'}`}
              >
                <Maximize2 className="w-3 h-3" />
              </button>
              <span className="text-[8px] uppercase tracking-tighter text-slate-500">Bed</span>
              <input 
                type="number" 
                value={bedSize} 
                onChange={(e) => setBedSize(parseInt(e.target.value) || 220)}
                className="bg-transparent text-slate-800 w-8 text-center text-[10px] focus:outline-none focus:text-blue-600 font-mono font-bold"
              />
              <span className="text-[8px] text-slate-400">mm</span>
              <button 
                onClick={handleFitToBed}
                title="Scale to fit your printer bed"
                className="ml-1 p-1 hover:bg-blue-100 rounded-md transition-colors group"
              >
                <RefreshCw className="w-3 h-3 text-slate-500 group-hover:text-blue-600" />
              </button>
            </div>

            <button 
              onClick={() => {
                setShowLaserModal(true);
              }}
              className="px-4 py-2.5 bg-amber-500 text-slate-900 font-bold text-[10px] uppercase tracking-widest hover:bg-amber-600 transition-all hover:scale-[0.98] active:scale-95 shadow-lg shadow-amber-500/20 flex gap-2 items-center border border-amber-600/10"
              title="Load files directly into Kapiti Makerspace Laser Cutter website"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-900/80" /> Send to Staff
            </button>
            <button 
              onClick={() => downloadSvg('parts')}
              className="px-4 py-2.5 bg-blue-600 text-white font-bold text-[10px] uppercase tracking-widest hover:bg-blue-700 transition-all hover:scale-[0.98] active:scale-95 shadow-lg shadow-blue-500/20 flex gap-2 items-center"
            >
              <Download className="w-3.5 h-3.5 text-white/80" /> Laser Cutter (SVG)
            </button>
            <button 
              onClick={handleExportSTL}
              className="px-4 py-2.5 bg-slate-100 text-slate-700 font-bold text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all border border-slate-200 flex gap-2 items-center"
            >
              <Box className="w-3.5 h-3.5 text-blue-600" /> 3D Printer (STL)
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        
        {/* Sidebar */}
        <aside className="w-80 border-r border-slate-200 bg-white p-6 flex flex-col gap-8 shrink-0 overflow-y-auto custom-scrollbar">
          
          <section>
            <div className="flex flex-col gap-3 mb-6">
              <div className="flex justify-between items-center">
                <h2 className="text-[11px] uppercase tracking-widest text-blue-600 font-bold flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5" /> Ring Management
                </h2>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <button 
                  onClick={() => addLayer()}
                  className="text-[9px] uppercase font-bold text-center text-blue-600 bg-blue-50 py-1.5 rounded border border-blue-200/80 hover:bg-blue-100 transition-colors"
                  id="add-ring-btn"
                  title="Create a new physical ring shifted to the right"
                >
                  + Ring
                </button>
                <button 
                  onClick={addRollingGear}
                  className="text-[9px] uppercase font-bold text-center text-emerald-600 bg-emerald-50 py-1.5 rounded border border-emerald-200/80 hover:bg-emerald-100 transition-colors"
                  id="add-gear-btn"
                  title="Add another rolling gear to the currently active ring"
                >
                  + Gear
                </button>
                <button 
                  onClick={handleRandomize}
                  className="text-[9px] uppercase font-bold text-center text-purple-600 bg-purple-50 py-1.5 rounded border border-purple-200/80 hover:bg-purple-100 transition-colors flex items-center justify-center gap-1 shadow-sm"
                  id="randomize-btn"
                  title="Generate a completely random beautiful design"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" /> Random
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {layers.map((layer, idx) => (
                <div 
                  key={layer.id}
                  onClick={() => {
                    setActiveLayerIndex(idx);
                    setPan({ x: -layer.params.offsetX || 0, y: -layer.params.offsetY || 0 });
                  }}
                  className={`p-3 rounded-lg border flex items-center justify-between cursor-pointer transition-all ${activeLayerIndex === idx ? 'bg-blue-50 border-blue-200/80 shadow-sm' : 'bg-slate-50/50 border-slate-200/60 hover:bg-slate-50'}`}
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px]" 
                      style={{ backgroundColor: layer.color, boxShadow: `0 0 8px ${layer.color}44` }}
                    />
                    <span className={`text-[10px] uppercase tracking-widest ${activeLayerIndex === idx ? 'text-blue-900 font-bold' : 'text-slate-600'}`}>
                      {layer.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(idx); }}
                      className={`p-1 rounded transition-colors ${layer.visible ? 'text-slate-500 hover:text-slate-800' : 'text-slate-450 hover:text-slate-600'}`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    {layers.length > 1 && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); deleteLayer(idx); }}
                        className="p-1 text-red-500/60 hover:text-red-600 transition-colors"
                        title="Delete Ring"
                      >
                         <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-4 pt-4 border-t border-slate-100 flex gap-2">
              <button 
                onClick={clearOthers}
                className="flex-1 text-[9px] uppercase font-bold text-slate-500 hover:text-blue-600 transition-colors"
                title="Remove all rings except active"
              >
                Clear Others
              </button>
              <button 
                onClick={handleRefresh}
                className="flex-1 text-[9px] uppercase font-bold text-slate-500 hover:text-blue-600 transition-colors"
              >
                Reset View
              </button>
            </div>
          </section>

          {/* Core Configuration */}
          <section>
            <h2 className="text-[11px] uppercase tracking-widest text-blue-600 mb-6 font-bold flex items-center gap-2 pt-4 border-t border-slate-100">
              <Settings2 className="w-3.5 h-3.5" /> Core Configuration
            </h2>
            
            <div className="space-y-8">
              {/* Ring Teeth Slider */}
              <div className="space-y-4">
                <div className="flex justify-between text-[10px] uppercase tracking-wider">
                  <label className="text-slate-500">Nominal Ring Size</label>
                  <div className="flex gap-2 items-center">
                    <span className="text-blue-600 font-mono bg-blue-50 px-1.5 rounded border border-blue-100">
                      {(params.ringTeeth * 6 / Math.PI * (params.scale || 1.0)).toFixed(1)}mm Ø
                    </span>
                    {params.ringShape !== 'circle' && (
                      <span className="text-blue-600 font-mono bg-blue-50/70 px-1 rounded border border-blue-100" title="Actual teeth on sculpted perimeter">
                        {actualRingTeeth}T Actual
                      </span>
                    )}
                    <span className="text-slate-800 font-mono bg-slate-100 px-1.5 rounded">{params.ringTeeth}T Base</span>
                  </div>
                </div>
                <div className="relative h-1 w-full bg-slate-200 rounded-full group">
                  <input 
                    type="range" min="32" max="250" step="1" 
                    value={params.ringTeeth} 
                    onChange={(e) => updateParams({ ringTeeth: parseInt(e.target.value) })}
                    onPointerUp={saveHistory}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className="absolute top-0 left-0 h-full bg-blue-600 rounded-full" style={{ width: `${((params.ringTeeth - 32) / (250 - 32)) * 100}%` }}></div>
                  <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full border-2 border-blue-600 shadow-md shadow-blue-550/20" style={{ left: `calc(${((params.ringTeeth - 32) / (250 - 32)) * 100}% - 6px)` }}></div>
                </div>
                {params.ringShape !== 'circle' && (
                  <p className="text-[8px] text-slate-500 italic mt-1 bg-slate-50 p-2 border border-slate-100 rounded">
                    Sculpting adjusted the perimeter. Actual teeth count increased to maintain pitch.
                  </p>
                )}
              </div>

              {/* Gear Teeth Slider */}
              <div className="space-y-4">
                <div className="flex justify-between text-[10px] uppercase tracking-wider">
                  <div className="flex flex-col gap-0.5">
                    <label className="text-slate-500">Rolling Gear Teeth</label>
                    <span className="text-[8px] text-slate-400">Max safe: {safeGearTeethLimit}T</span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <span className="text-blue-600 font-mono bg-blue-50 px-1.5 rounded border border-blue-100">
                      {(params.gearTeeth * 6 / Math.PI * (params.scale || 1.0)).toFixed(1)}mm Ø
                    </span>
                    <span className={`font-mono bg-slate-100 px-1.5 rounded ${params.gearTeeth > safeGearTeethLimit ? 'text-red-600 font-bold' : 'text-slate-800'}`}>
                      {params.gearTeeth}T
                    </span>
                  </div>
                </div>
                <div className="relative h-1 w-full bg-slate-200 rounded-full group">
                  <input 
                    type="range" min="8" max={params.ringTeeth - 1} step="1" 
                    value={params.gearTeeth} 
                    onChange={(e) => updateParams({ gearTeeth: parseInt(e.target.value) })}
                    onPointerUp={saveHistory}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className="absolute top-0 left-0 h-full bg-blue-600 rounded-full" style={{ width: `${((params.gearTeeth - 8) / (params.ringTeeth - 9)) * 100}%` }}></div>
                  
                  {/* Safety Boundary Marker */}
                  <div className="absolute top-0 bottom-0 w-[1px] bg-red-400/60 z-0" style={{ left: `${((safeGearTeethLimit - 8) / (params.ringTeeth - 9)) * 100}%` }}></div>
                  
                  <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full border-2 border-blue-600 shadow-md shadow-blue-550/20" style={{ left: `calc(${((params.gearTeeth - 8) / (params.ringTeeth - 9)) * 100}% - 6px)` }}></div>
                </div>
              </div>

              {/* Hole Offsets Editor */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] uppercase tracking-wider text-slate-500">Pen Hole Distributions</label>
                  <button 
                    onClick={() => {
                      const newOffsets = [...params.holeOffsets, Math.min(50, maxHPercent)];
                      const newHolesVisibility = params.hiddenHoles ? [...params.hiddenHoles, false] : Array(params.holeOffsets.length).fill(false).concat(false);
                      const newLayers = layers.map((layer, idx) => 
                        idx === activeLayerIndex ? { ...layer, params: { ...layer.params, holeOffsets: newOffsets, hiddenHoles: newHolesVisibility } } : layer
                      );
                      pushToHistory(newLayers, activeLayerIndex);
                      setLayers(newLayers);
                    }}
                    className="text-[9px] uppercase font-bold text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    + Add Hole
                  </button>
                </div>
                
                <div className="space-y-4 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                  {params.holeOffsets.map((offset, idx) => {
                    const isHidden = params.hiddenHoles?.[idx] === true;
                    return (
                      <div key={idx} className="space-y-2 group">
                        <div className="flex justify-between text-[9px] font-mono">
                          <span className={`transition-colors ${isHidden ? 'text-slate-400 line-through' : 'text-slate-500'}`}>Hole #{idx + 1}</span>
                          <div className="flex items-center gap-2">
                            <span className={`font-bold transition-colors ${isHidden ? 'text-slate-400' : 'text-slate-800'}`}>{offset}%</span>
                            <button 
                              onClick={() => {
                                const newHolesVisibility = params.hiddenHoles ? [...params.hiddenHoles] : Array(params.holeOffsets.length).fill(false);
                                while (newHolesVisibility.length < params.holeOffsets.length) {
                                  newHolesVisibility.push(false);
                                }
                                newHolesVisibility[idx] = !newHolesVisibility[idx];
                                updateParams({ hiddenHoles: newHolesVisibility });
                                saveHistory();
                              }}
                              className="p-1 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded transition-all flex items-center justify-center border border-slate-200"
                              title={isHidden ? "Show Hole Display" : "Hide Hole Display"}
                            >
                              {isHidden ? <EyeOff className="w-3 h-3 text-slate-400" /> : <Eye className="w-3 h-3 text-blue-600" />}
                            </button>
                            {params.holeOffsets.length > 1 && (
                              <button 
                                onClick={() => {
                                  const newOffsets = [...params.holeOffsets];
                                  newOffsets.splice(idx, 1);
                                  const newHolesVisibility = params.hiddenHoles ? [...params.hiddenHoles] : Array(params.holeOffsets.length).fill(false);
                                  newHolesVisibility.splice(idx, 1);
                                  const newLayers = layers.map((layer, lIdx) => 
                                    lIdx === activeLayerIndex ? { ...layer, params: { ...layer.params, holeOffsets: newOffsets, hiddenHoles: newHolesVisibility } } : layer
                                  );
                                  pushToHistory(newLayers, activeLayerIndex);
                                  setLayers(newLayers);
                                }}
                                className="px-1.5 py-0.5 bg-red-50 hover:bg-red-100 text-red-500 hover:text-red-650 text-[8px] uppercase font-bold rounded transition-colors"
                              >
                                Del
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="relative h-1 w-full bg-slate-200 rounded-full">
                          <input 
                            type="range" min="0" max={maxHPercent} step="1" 
                            value={offset} 
                            disabled={isHidden}
                            onChange={(e) => {
                              const newOffsets = [...params.holeOffsets];
                              newOffsets[idx] = parseInt(e.target.value);
                              updateParams({ holeOffsets: newOffsets });
                            }}
                            onPointerUp={saveHistory}
                            className={`absolute inset-0 w-full h-full opacity-0 z-10 ${isHidden ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                          />
                          <div className={`absolute top-0 left-0 h-full rounded-full transition-colors ${isHidden ? 'bg-slate-300' : 'bg-blue-600'}`} style={{ width: `${(offset / maxHPercent) * 100}%` }}></div>
                          <div className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full border shadow-sm transition-colors ${isHidden ? 'border-slate-300' : 'border-blue-600/80'}`} style={{ left: `calc(${(offset / maxHPercent) * 100}% - 5px)` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Ring Profile Options */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] uppercase tracking-wider text-slate-550 font-semibold">Ring Profile Shape</label>
                  <button 
                    onClick={() => {
                      const btn = document.getElementById('refresh-mesh-btn');
                      if (btn) btn.classList.add('scale-95', 'opacity-50');
                      setTimeout(() => {
                        updateParams({ ...params });
                        if (btn) btn.classList.remove('scale-95', 'opacity-50');
                      }, 100);
                    }}
                    id="refresh-mesh-btn"
                    className="p-1 px-2 bg-slate-50 hover:bg-blue-50 border border-slate-200 rounded text-[8px] uppercase tracking-tighter text-slate-600 hover:text-blue-600 transition-all flex items-center gap-1 font-bold"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    Refresh Mesh
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-3 gap-2">
                    {(['circle', 'oval', 'custom'] as const).map(shape => (
                      <button 
                        key={shape}
                        onClick={() => {
                          updateParams({ ringShape: shape });
                          saveHistory();
                        }}
                        className={`py-2 px-1 border rounded text-[9px] uppercase tracking-widest font-bold transition-all ${params.ringShape === shape ? 'bg-blue-600 text-white border-blue-500 shadow-sm' : 'bg-slate-50/50 hover:bg-slate-50 border-slate-200/80 text-slate-600'}`}
                      >
                        {shape}
                      </button>
                    ))}
                  </div>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-100 rounded text-[9px] uppercase tracking-widest font-bold transition-all flex items-center justify-center gap-2 group"
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

                {params.ringShape === 'custom' && params.customRingPoints && (
                  <div className="mt-4 animate-in fade-in">
                    <RingBezierEditor 
                      points={params.customRingPoints} 
                      tension={params.ringTension}
                      teeth={actualRingTeeth}
                      onChange={(points) => updateParams({ customRingPoints: points })} 
                      onTensionChange={(t) => updateParams({ ringTension: t })}
                      onFinishChange={saveHistory}
                    />
                  </div>
                )}

                {params.ringShape !== 'circle' && params.ringShape !== 'custom' && (
                  <div className="space-y-3 pt-2">
                    <div className="flex justify-between text-[10px] uppercase font-mono">
                      <span className="text-slate-500">Ring Distortion</span>
                      <span className="text-slate-800 font-bold">{(params.ringIntensity * 100).toFixed(0)}%</span>
                    </div>
                    <div className="relative h-1 w-full bg-slate-200 rounded-full group">
                      <input 
                        type="range" min="0.1" max="1.5" step="0.1" 
                        value={params.ringIntensity} 
                        onChange={(e) => updateParams({ ringIntensity: parseFloat(e.target.value) })}
                        onPointerUp={saveHistory}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                      <div className="absolute top-0 left-0 h-full bg-blue-600 rounded-full" style={{ width: `${((params.ringIntensity - 0.1) / (1.5 - 0.1)) * 100}%` }}></div>
                      <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full border-2 border-blue-600 shadow-md shadow-blue-550/20" style={{ left: `calc(${((params.ringIntensity - 0.1) / (1.5 - 0.1)) * 100}% - 6px)` }}></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Gear Shapes */}
          <section>
            <h2 className="text-[11px] uppercase tracking-widest text-blue-600 mb-4 font-bold flex items-center gap-2 pt-4 border-t border-slate-100">
              <Layers className="w-3.5 h-3.5" /> Gear Shapes
            </h2>
            <div className="space-y-6">
              <div>
                <h3 className="text-[10px] uppercase tracking-widest text-slate-500 mb-3 font-semibold">Gear Shape</h3>
                <div className="grid grid-cols-3 gap-2">
                  {(['circle', 'flower', 'triangle', 'square', 'oval', 'egg'] as const).map(shape => (
                    <button 
                      key={shape}
                      onClick={() => {
                        updateParams({ gearShape: shape });
                        saveHistory();
                      }}
                      className={`py-2 px-1 border rounded text-[9px] uppercase tracking-widest font-bold transition-all ${params.gearShape === shape ? 'bg-blue-600 text-white border-blue-500 shadow-sm' : 'bg-slate-50/50 hover:bg-slate-50 border-slate-200/80 text-slate-600'}`}
                    >
                      {shape}
                    </button>
                  ))}
                </div>
              </div>

              {params.gearShape !== 'circle' && (
                <div className="space-y-3 pt-1">
                  <div className="flex justify-between text-[10px] uppercase font-mono">
                    <span className="text-slate-500">Gear Intensity</span>
                    <span className="text-slate-800 font-bold">{(params.shapeIntensity * 100).toFixed(0)}%</span>
                  </div>
                  <input 
                    type="range" min="0.1" max="2.0" step="0.1" 
                    value={params.shapeIntensity} 
                    onChange={(e) => updateParams({ shapeIntensity: parseFloat(e.target.value) })}
                    onPointerUp={saveHistory}
                    className="w-full accent-blue-600 h-1 bg-slate-200 rounded-full appearance-none cursor-pointer"
                  />
                </div>
              )}
            </div>
          </section>

          {/* Advanced Mode Toggle & Container */}
          <div className="pt-4 border-t border-slate-100">
            <button 
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex justify-between items-center py-2.5 px-3 bg-blue-50/40 hover:bg-blue-50 rounded-lg text-[10px] uppercase tracking-widest font-bold text-blue-600 hover:text-blue-700 transition-all border border-blue-100 shadow-sm"
              id="toggle-advanced-btn"
            >
              <span className="flex items-center gap-2 font-mono">
                <Sliders className="w-3.5 h-3.5" /> Advanced Settings
              </span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`} />
            </button>
            
            {showAdvanced && (
              <div className="mt-6 space-y-8 animate-in fade-in duration-200">
                {/* Transform Configuration */}
                <div className="space-y-6">
                  <h3 className="text-[10px] uppercase tracking-widest text-slate-550 font-bold flex items-center gap-2">
                    <Maximize2 className="w-3.5 h-3.5" /> Scaling & Placement
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between text-[10px] uppercase font-mono">
                      <span className="text-slate-500">Global Scale</span>
                      <span className="text-blue-600 font-bold">{(params.scale * 100).toFixed(0)}%</span>
                    </div>
                    <input 
                      type="range" min="0.1" max={Math.min(3.0, getMaxScale(params))} step="0.01" 
                      value={params.scale || 1.0} 
                      onChange={(e) => updateParams({ scale: parseFloat(e.target.value) || 1.0 })}
                      onPointerUp={saveHistory}
                      className="w-full accent-blue-600 h-1 bg-slate-200 rounded-full appearance-none cursor-pointer"
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between text-[10px] uppercase font-mono">
                      <span className="text-slate-500">Position X</span>
                      <input 
                        type="number" 
                        value={params.offsetX?.toFixed(1)} 
                        onChange={(e) => updateParams({ offsetX: parseFloat(e.target.value) || 0 })}
                        onBlur={saveHistory}
                        className="bg-transparent text-slate-800 w-14 text-right focus:outline-none"
                      />
                    </div>
                    <input 
                      type="range" min="-200" max="200" step="0.5" 
                      value={params.offsetX || 0} 
                      onChange={(e) => updateParams({ offsetX: parseFloat(e.target.value) })}
                      onPointerUp={saveHistory}
                      className="w-full accent-blue-600 h-1 bg-slate-200 rounded-full appearance-none cursor-pointer"
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between text-[10px] uppercase font-mono">
                      <span className="text-slate-500">Position Y</span>
                      <input 
                        type="number" 
                        value={params.offsetY?.toFixed(1)} 
                        onChange={(e) => updateParams({ offsetY: parseFloat(e.target.value) || 0 })}
                        onBlur={saveHistory}
                        className="bg-transparent text-slate-800 w-14 text-right focus:outline-none"
                      />
                    </div>
                    <input 
                      type="range" min="-200" max="200" step="0.5" 
                      value={params.offsetY || 0} 
                      onChange={(e) => updateParams({ offsetY: parseFloat(e.target.value) })}
                      onPointerUp={saveHistory}
                      className="w-full accent-blue-600 h-1 bg-slate-200 rounded-full appearance-none cursor-pointer"
                    />
                  </div>
                </div>

                {/* Corner Clearance info */}
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/60 space-y-2">
                  <div className="flex justify-between items-center text-[10px] uppercase font-mono">
                    <span className="text-slate-500 font-bold">Corner Clearance</span>
                    <span className={isGearTooLarge ? 'text-red-400 font-bold' : 'text-emerald-450 font-bold'}>
                      {isGearTooLarge ? 'Collision Risk' : 'Fits Corners'}
                    </span>
                  </div>
                  <div className="text-[9px] text-slate-500 leading-relaxed mb-2">
                    Tightest corner radius: <span className="text-slate-700 font-mono font-bold">{minCurvature.toFixed(1)}mm</span>
                  </div>
                  <button 
                    onClick={fitGearToCorners}
                    disabled={!isGearTooLarge && gearRadius > minCurvature * 0.8}
                    className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-605 rounded border border-slate-200 text-[9px] uppercase font-bold transition-all disabled:opacity-50"
                    id="fit-gear-btn"
                  >
                    Auto-Fit Gear to Corners
                  </button>
                </div>

                {/* Multi-Stage Mode */}
                <div className="p-3 bg-blue-50/40 border border-blue-100 rounded-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-blue-600 font-mono">Multi-Stage Mode</label>
                    <div 
                      onClick={() => {
                        updateParams({ isMultiStage: !params.isMultiStage });
                        saveHistory();
                      }}
                      className={`w-8 h-4 rounded-full p-0.5 cursor-pointer transition-colors ${params.isMultiStage ? 'bg-blue-600' : 'bg-slate-200'}`}
                    >
                      <div className={`w-3 h-3 bg-white rounded-full transition-transform ${params.isMultiStage ? 'translate-x-4' : 'translate-x-0'}`} />
                    </div>
                  </div>
                  
                  {params.isMultiStage && (
                    <div className="space-y-4 animate-in fade-in">
                      {/* Gear 2 Outer Teeth */}
                      <div className="space-y-2">
                        <div className="flex justify-between text-[10px] uppercase font-mono">
                          <span className="text-slate-400 text-[8px]">Gear 2 Size</span>
                          <span className="text-blue-600 font-bold">{params.stageTwoTeeth}T</span>
                        </div>
                        <input 
                          type="range" min="8" max={params.stageOneInternalTeeth - 4} step="1" 
                          value={params.stageTwoTeeth} 
                          onChange={(e) => updateParams({ stageTwoTeeth: parseInt(e.target.value) })}
                          onPointerUp={saveHistory}
                          className="w-full accent-blue-600 h-1 bg-slate-200 rounded-full appearance-none cursor-pointer"
                        />
                      </div>

                      {/* Gear 1 Internal Rail Teeth */}
                      <div className="space-y-2">
                        <div className="flex justify-between text-[10px] uppercase font-mono">
                          <span className="text-slate-400 text-[8px]">Gear 1 Rail</span>
                          <span className="text-blue-600 font-bold">{params.stageOneInternalTeeth}T</span>
                        </div>
                        <input 
                          type="range" min="32" max={params.gearTeeth - 4} step="1" 
                          value={params.stageOneInternalTeeth} 
                          onChange={(e) => updateParams({ stageOneInternalTeeth: parseInt(e.target.value) })}
                          onPointerUp={saveHistory}
                          className="w-full accent-blue-600 h-1 bg-slate-200 rounded-full appearance-none cursor-pointer"
                        />
                      </div>

                      {/* Rail Offset (Eccentricity) */}
                      <div className="space-y-2">
                        <div className="flex justify-between text-[10px] uppercase font-mono">
                          <span className="text-slate-400 text-[8px]">Rail Offset</span>
                          <span className="text-blue-600 font-bold">{params.railOffset.toFixed(1)}mm</span>
                        </div>
                        <input 
                           type="range" min="-20" max="20" step="0.5" 
                           value={params.railOffset} 
                           onChange={(e) => updateParams({ railOffset: parseFloat(e.target.value) })}
                           onPointerUp={saveHistory}
                           className="w-full accent-blue-600 h-1 bg-slate-200 rounded-full appearance-none cursor-pointer"
                        />
                      </div>

                      <p className="text-[8px] text-slate-500 italic leading-tight pt-2 border-t border-slate-100">
                        Adds a secondary orbital frequency. Gear 2 rolls inside Gear 1's adjustable rail.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <section className="pt-2">
             <button 
                onClick={handleRefresh}
                className="w-full py-3 border border-slate-200 rounded-lg text-[10px] uppercase tracking-[0.2em] bg-white hover:bg-slate-50 text-slate-700 hover:text-blue-600 font-bold shadow-sm transition-all flex items-center justify-center gap-2"
             >
                <RotateCcw className="w-3.5 h-3.5" /> Reset Simulation
             </button>
          </section>

          {/* Placeholder to maintain gap if needed, or just remove */}
        </aside>        {/* Content Area */}
        <section className="flex-1 flex flex-col bg-slate-50 p-6 lg:p-10 gap-6 overflow-hidden">
          
          {/* Simulation Top Bar */}
          <div className="flex items-center gap-8 bg-white border border-slate-200/80 rounded-2xl p-4 px-8 shadow-md shadow-slate-100/40">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setIsAnimating(!isAnimating)}
                className={`px-8 py-2 rounded-lg text-[10px] uppercase font-bold tracking-[0.2em] transition-all flex items-center gap-2 border ${isAnimating ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-500/15' : 'bg-slate-50 border border-slate-250 text-slate-705 hover:bg-slate-100'}`}
              >
                <Activity className={`w-3.5 h-3.5 ${isAnimating ? 'animate-pulse' : ''}`} /> 
                {isAnimating ? 'STOP' : 'SIMULATE'}
              </button>
              <button 
                onClick={() => setAnimationTheta(0)}
                className="p-2 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-all text-slate-500 hover:text-blue-600"
                title="Reset Animation"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 flex flex-col gap-2">
              <div className="flex justify-between text-[8px] uppercase tracking-widest font-mono text-slate-500">
                <span>Timeline Progress</span>
                <span className="text-blue-600 font-bold">{((animationTheta / (currentTotalRotations * Math.PI * 2)) * 100).toFixed(0)}%</span>
              </div>
              <input 
                type="range" min="0" max={currentTotalRotations * Math.PI * 2} step="0.01" 
                value={animationTheta} 
                onChange={(e) => {
                  setAnimationTheta(parseFloat(e.target.value));
                  if (isAnimating) setIsAnimating(false);
                }}
                className="w-full accent-blue-600 h-1 bg-slate-200 rounded-full appearance-none cursor-pointer"
              />
            </div>

            <div className="w-48 flex flex-col gap-2">
              <div className="flex justify-between text-[8px] uppercase tracking-widest font-mono text-slate-500">
                <span>Feed Speed</span>
                <span className="text-slate-800 font-bold">{animationSpeed.toFixed(1)}x</span>
              </div>
              <input 
                type="range" min="0.2" max="5" step="0.1" 
                value={animationSpeed} 
                onChange={(e) => setAnimationSpeed(parseFloat(e.target.value))}
                className="w-full accent-blue-600 h-1 bg-slate-200 rounded-full appearance-none cursor-pointer"
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
              className={`flex-1 bg-white rounded-2xl flex items-center justify-center relative overflow-hidden cursor-grab shadow-sm transition-all duration-300 ${isDragging ? 'cursor-grabbing' : ''} ${hasLargeRing ? 'border-4 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.25)]' : 'border border-slate-200/85'}`}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {/* Engineering Grid */}
              <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #3b82f6 0.5px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
              <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(59,130,246,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.15) 1px, transparent 1px)', backgroundSize: '120px 120px' }}></div>
              
              {/* UI Overlays */}
              <AnimatePresence>
                {hasLargeRing && (
                  <motion.div
                    initial={{ opacity: 0, x: -20, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -20, scale: 0.95 }}
                    className="absolute top-6 left-6 bg-white/95 backdrop-blur-md border border-red-200 rounded-xl p-4 shadow-xl max-w-[260px] z-20 flex flex-col gap-2 pointer-events-auto cursor-default text-left"
                  >
                    <div className="flex items-center gap-2 text-red-600">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span className="text-[9px] uppercase tracking-wider font-extrabold font-sans">Oversized Ring Fee</span>
                    </div>
                    
                    <div className="space-y-1.5 text-slate-700 font-sans text-[11px]">
                      <p className="leading-tight text-slate-600">
                        Rings over <span className="font-bold">200mm</span> are subject to extra production charges:
                      </p>
                      
                      <div className="border-t border-slate-100 my-1 pt-1.5 space-y-1">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Widest Point:</span>
                          <span className="font-mono font-semibold">{maxRingDim.toFixed(1)}mm</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Base surcharge:</span>
                          <span className="font-mono font-semibold">$4.00</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Size (2¢/mm):</span>
                          <span className="font-mono font-semibold">${((maxRingDim - 200) * 0.02).toFixed(2)}</span>
                        </div>
                        {extraGearsCount > 0 && (
                          <div className="flex justify-between text-blue-600 font-medium">
                            <span>Extra gears ({extraGearsCount}x):</span>
                            <span className="font-mono font-semibold">+${gearsCost.toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="border-t border-slate-200 pt-1.5 flex justify-between items-center">
                        <span className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">Total Cost:</span>
                        <span className="font-mono font-bold text-red-600 text-sm">${totalCost.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="text-[7px] text-slate-400 italic">
                      Prices are estimates.
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="absolute top-6 right-6 flex flex-col gap-2 z-10">
                <div className="px-3 py-1.5 bg-white/90 backdrop-blur-md rounded-lg border border-slate-200 text-[10px] font-mono text-slate-600 shadow-md flex items-center gap-2">
                  <span className="opacity-60 uppercase tracking-tighter mr-1">Zoom</span>
                  <button 
                    onClick={() => setZoom(prev => Math.max(1.25, prev / 1.15))}
                    disabled={zoom <= 1.251}
                    className="p-1 hover:bg-slate-100 rounded disabled:opacity-35 disabled:cursor-not-allowed transition-colors text-slate-600 flex items-center justify-center border border-slate-200"
                    title="Zoom Out"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="text-blue-600 font-bold min-w-[36px] text-center">
                    {zoom >= 5.0 
                      ? `${Math.round(((zoom / 5.0) - 1.0) * 100)}%` 
                      : `${Math.round(((zoom - 5.0) / 3.75) * 300)}%`
                    }
                  </span>
                  <button 
                    onClick={() => setZoom(prev => Math.min(40.0, prev * 1.15))}
                    disabled={zoom >= 39.99}
                    className="p-1 hover:bg-slate-100 rounded disabled:opacity-35 disabled:cursor-not-allowed transition-colors text-slate-600 flex items-center justify-center border border-slate-200"
                    title="Zoom In"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="absolute bottom-6 left-6 z-10 flex gap-4">
                <div className="px-3 py-1.5 bg-blue-50/50 backdrop-blur-md rounded-lg border border-blue-100 text-[9px] font-mono text-blue-850 shadow-sm flex flex-col">
                  <span className="text-[7px] uppercase tracking-widest text-slate-500 mb-0.5">Ring Assembly Dimension</span>
                  {(() => {
                    const r = getRadiusFromTeeth(params.ringTeeth) * (params.scale || 1.0);
                    const modMax = params.ringShape === 'custom' ? Math.max(...(params.customRingPoints || [1.0])) : (1 + (params.ringIntensity || 0) * 0.15);
                    const margin = 30 * (params.scale || 1.0);
                    const dim = (r * modMax + margin) * 2;
                    return <span className="text-slate-800 font-bold">{dim.toFixed(1)}mm × {dim.toFixed(1)}mm ({params.ringTeeth}T)</span>;
                  })()}
                </div>
                <div className="px-3 py-1.5 bg-blue-50/50 backdrop-blur-md rounded-lg border border-blue-100 text-[9px] font-mono text-blue-850 shadow-sm flex flex-col">
                  <span className="text-[7px] uppercase tracking-widest text-slate-500 mb-0.5">Rolling Gear Diameter</span>
                  {(() => {
                    const teeth = params.isMultiStage ? params.stageTwoTeeth : params.gearTeeth;
                    const diameter = teeth * 6 / Math.PI * (params.scale || 1.0);
                    return <span className="text-slate-800 font-bold">{diameter.toFixed(1)}mm Ø ({teeth}T)</span>;
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
                          stroke={isActive ? "rgba(15, 23, 42, 0.45)" : "rgba(15, 23, 42, 0.15)"} 
                          strokeWidth="1.0"
                        />
                      )}
                      
                      {memo.guideShape && (
                        <path 
                          d={memo.guideShape} 
                          fill="none" 
                          stroke={isActive ? "rgba(15, 23, 42, 0.25)" : "rgba(15, 23, 42, 0.08)"} 
                          strokeWidth="0.5"
                          strokeDasharray="2 2"
                        />
                      )}
                      
                      <path 
                        d={memo.ringGear} 
                        fill={isActive ? "rgba(15, 23, 42, 0.03)" : "transparent"} 
                        stroke={isActive ? "rgba(15, 23, 42, 0.65)" : "rgba(15, 23, 42, 0.22)"} 
                        strokeWidth="0.3"
                      />
                    </g>
                  );
                })}

                {/* Subtle Drawing Trace */}
                {layersPathStrings.map((layerPaths, lIdx) => (
                  layers[lIdx].visible && layerPaths.map((pathStr, pIdx) => {
                    if (layers[lIdx].params.hiddenHoles?.[pIdx]) return null;
                    return (
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
                    );
                  })
                ))}

                {/* Gear Hardware Rendering */}
                {layers.map((layer, lIdx) => {
                  if (!layer.visible) return null;
                  const isActive = lIdx === activeLayerIndex;
                  const gearSystem = getGearSystemState(layer.params, animationTheta);
                  const { gear1, gear2 } = gearSystem;

                  const g1_rot = gear1.rotation * (180 / Math.PI);
                  const baseOpacity = isActive ? 1.0 : 0.55;
                  const opacityMult = dimGears ? 0.3 * baseOpacity : baseOpacity;

                  return (
                    <g 
                      key={`gear-hardware-${layer.id}`}
                      transform={`translate(${gear1.center.x}, ${gear1.center.y}) rotate(${g1_rot})`}
                      opacity={opacityMult}
                    >
                      {/* Stage 1 Gear */}
                      <g filter="url(#glow)">
                        <path 
                          d={memoizedLayerPaths[lIdx]?.gear1Path} 
                          fill="rgba(245,158,11,0.15)" 
                          stroke="#f59e0b" 
                          strokeWidth="0.4"
                        />
                        {layer.params.isMultiStage && (
                          <g transform={`translate(${layer.params.railOffset}, 0)`}>
                            <path 
                              d={memoizedLayerPaths[lIdx]?.stage2Paths?.internal} 
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
                              d={memoizedLayerPaths[lIdx]?.stage2Paths?.gear2} 
                              fill="rgba(59,130,246,0.3)" 
                              stroke="#3b82f6" 
                              strokeWidth="0.4"
                            />
                            {layer.params.holeOffsets.map((offset, idx) => {
                              if (layer.params.hiddenHoles?.[idx]) return null;
                              const holeAngle = idx * (30 * Math.PI / 180);
                              const hx = r2 * (offset / 100) * Math.cos(holeAngle);
                              const hy = r2 * (offset / 100) * Math.sin(holeAngle);
                              return (
                                <circle 
                                  key={idx}
                                  cx={hx} 
                                  cy={hy} 
                                  r="1.5" 
                                  fill="#fff" 
                                  opacity="0.6"
                                />
                              );
                            })}
                          </g>
                        );
                      })() : (
                        layer.params.holeOffsets.map((offset, idx) => {
                          if (layer.params.hiddenHoles?.[idx]) return null;
                          const holeAngle = idx * (30 * Math.PI / 180);
                          const hx = gear1.radius * (offset / 100) * Math.cos(holeAngle);
                          const hy = gear1.radius * (offset / 100) * Math.sin(holeAngle);
                          return (
                            <circle 
                              key={idx}
                              cx={hx} 
                              cy={hy} 
                              r="1.5" 
                              fill="#fff" 
                              opacity="0.6"
                            />
                          );
                        })
                      )}
                    </g>
                  );
                })}

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
              className="relative w-full max-w-md bg-white border border-slate-300 rounded-2xl shadow-2xl overflow-hidden p-8"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-500" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 tracking-tight">Large Print Detected</h3>
                  <p className="text-slate-550 text-xs uppercase tracking-widest mt-1">Bed Conflict Clearance</p>
                </div>
              </div>

              <div className="space-y-4 mb-8">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 text-[10px] uppercase font-mono">Current Assembly Width</span>
                    <span className="text-slate-900 font-bold font-mono text-lg">{currentSize.toFixed(1)}mm</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 text-[10px] uppercase font-mono">Your Bed Capacity</span>
                    <span className="text-red-650 font-bold font-mono text-lg">{bedSize}mm</span>
                  </div>
                  <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-red-500 animate-pulse" 
                      style={{ width: `${Math.min(100, (currentSize / bedSize) * 100)}%` }}
                    />
                  </div>
                </div>
                <p className="text-slate-600 text-xs leading-relaxed">
                  The design is larger than your printer bed. We recommend scaling down to ensure a successful print. 
                  <span className="text-blue-600 font-semibold"> Scaling will update the teeth count and real-time preview.</span>
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <button 
                  onClick={() => {
                    handleFitToBed();
                  }}
                  className="w-full py-3 bg-blue-600 text-white font-bold text-sm uppercase tracking-widest rounded-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-md shadow-blue-500/10"
                >
                  <Maximize2 className="w-4 h-4" /> Scale to Fit Bed
                </button>
                <div className="flex gap-2">
                  <button 
                    onClick={performSTLExport}
                    className="flex-1 py-3 bg-slate-50 text-slate-700 font-bold text-xs uppercase tracking-widest rounded-lg hover:bg-slate-100 transition-all border border-slate-200"
                  >
                    Export Anyway
                  </button>
                  <button 
                    onClick={() => setShowBedWarning(false)}
                    className="flex-1 py-3 text-slate-500 font-bold text-xs uppercase tracking-widest rounded-lg hover:text-slate-800 hover:bg-slate-50 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showLaserModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLaserModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              className="relative w-full max-w-md bg-white border border-slate-300 rounded-2xl shadow-2xl overflow-hidden p-8 flex flex-col max-h-[85vh]"
            >
              <div className="flex items-center gap-4 mb-5 shrink-0">
                <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center">
                  <ExternalLink className="w-6 h-6 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 tracking-tight">Laser Driver Integration</h3>
                  <p className="text-amber-600 text-[9px] font-bold uppercase tracking-widest mt-0.5">Kāpiti Libraries Makerspace</p>
                </div>
              </div>

              <div className="space-y-4 mb-6 overflow-y-auto pr-1">
                <p className="text-slate-600 text-xs leading-relaxed">
                  Enter your contact details and optional instructions below to load your active vector layout directly into the Kāpiti Makerspace Laser Controller.
                </p>

                <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200/80 my-2">
                  <div className="text-[10px] font-bold text-slate-800 uppercase tracking-wider mb-1">Staff Submission Details</div>
                  
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label className="text-[8px] font-bold uppercase tracking-wider text-slate-500 block">Your Name</label>
                      <input 
                        type="text" 
                        value={submitterName}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSubmitterName(val);
                          localStorage.setItem('spiroforge_sub_name', val);
                        }}
                        placeholder="Kāpiti Maker"
                        className="w-full text-[11px] px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-400 font-sans"
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-[8px] font-bold uppercase tracking-wider text-slate-500 block">Your Email</label>
                      <input 
                        type="email" 
                        value={submitterEmail}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSubmitterEmail(val);
                          localStorage.setItem('spiroforge_sub_email', val);
                        }}
                        placeholder="maker@kapiti.org"
                        className="w-full text-[11px] px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-400 font-sans"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8px] font-bold uppercase tracking-wider text-slate-500 block">Instructions / Special Notes</label>
                    <textarea
                      value={submitterNotes}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSubmitterNotes(val);
                        localStorage.setItem('spiroforge_sub_notes', val);
                      }}
                      placeholder="e.g., Cut outer contours using 3mm MDF..."
                      rows={3}
                      className="w-full text-[11px] px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-400 font-sans resize-none"
                    />
                  </div>
                </div>

                <button 
                  onClick={() => {
                    const win = window.open('https://kapiti-makerspace-laser-driver.vercel.app/', '_blank');
                    if (win) {
                      const svgParts = generatePartsSvg();
                      const payload = {
                        type: 'kapiti-laser-import',
                        action: 'load-svg',
                        svg: svgParts,
                        filename: 'spiroforge-parts.svg',
                        fileName: 'spiroforge-parts.svg',
                        senderName: submitterName || 'SpiroForge User',
                        senderEmail: submitterEmail || '',
                        notes: submitterNotes || '',
                        svgString: svgParts,
                        data: svgParts
                      };
                      
                      // Send the payload repeatedly as the target app starts up and mounts its listeners
                      let attempts = 0;
                      const interval = setInterval(() => {
                        win.postMessage(payload, 'https://kapiti-makerspace-laser-driver.vercel.app');
                        attempts++;
                        if (attempts >= 10) {
                          clearInterval(interval);
                        }
                      }, 600);
                    } else {
                      alert('Popup blocked. Please check your browser’s pop-up blocker or click again after enabling popups.');
                    }
                  }}
                  className="w-full py-2.5 bg-amber-500 text-slate-900 hover:bg-amber-600 font-extrabold text-xs uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-2 shadow-md shadow-amber-500/10 hover:scale-[0.99] mt-2 animate-pulse"
                >
                  <ExternalLink className="w-4 h-4" /> Send Layout to Staff
                </button>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 shrink-0">
                <button 
                  onClick={() => setShowLaserModal(false)}
                  className="px-5 py-2 bg-slate-900 text-white hover:bg-slate-800 font-bold text-xs uppercase tracking-widest rounded-lg transition-all shadow-md shadow-slate-900/10"
                >
                  Close Window
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

