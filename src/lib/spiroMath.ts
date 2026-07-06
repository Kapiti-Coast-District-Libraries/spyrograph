import { SpiroParams } from '../types';

export const PITCH = 6; // mm between teeth

export function getRadiusFromTeeth(teeth: number): number {
  return (teeth * PITCH) / (2 * Math.PI);
}

// Arc Length Utilities for Irregular Shapes
// We sample the perimeter to get accurate mapping from angle to distance
function getRingShapePoint(theta: number, rBase: number, shape: string | undefined, intensity: number, customPoints?: number[], tension?: number, offsetX: number = 0, offsetY: number = 0, scale: number = 1.0, margin: number = 0): { x: number; y: number } {
  const mod = getRadiusModifier(shape, theta, intensity, customPoints, tension);
  const r = rBase * mod * scale;
  const p = { x: r * Math.cos(theta) + offsetX, y: r * Math.sin(theta) + offsetY };
  
  if (margin === 0) return p;
  
  // To offset, we need the normal at the BASE shape
  const n = getNormalAtTheta(theta, rBase, shape, intensity, customPoints, tension);
  // normal points INWARD. To go OUTWARD, we subtract.
  return {
    x: p.x - n.x * margin,
    y: p.y - n.y * margin
  };
}

interface ArcLengthMap {
  totalLength: number;
  samples: number[];
}

const arcLengthCache = new Map<string, ArcLengthMap>();

function getArcLengthMap(rBase: number, shape: string | undefined, intensity: number, customPoints?: number[], tension?: number, margin: number = 0): ArcLengthMap {
  const customKey = customPoints ? customPoints.join(',') : 'no-custom';
  const key = `${rBase}-${shape}-${intensity}-${customKey}-${tension}-${margin}`;
  if (arcLengthCache.has(key)) return arcLengthCache.get(key)!;

  const steps = 4000; // Increased resolution for better quality
  const samples = new Array(steps + 1);
  samples[0] = 0;
  let currentLength = 0;
  let prevPoint = getRingShapePoint(0, rBase, shape, intensity, customPoints, tension, 0, 0, 1.0, margin);

  for (let i = 1; i <= steps; i++) {
    const theta = (i / steps) * 2 * Math.PI;
    const point = getRingShapePoint(theta, rBase, shape, intensity, customPoints, tension, 0, 0, 1.0, margin);
    const dist = Math.sqrt(Math.pow(point.x - prevPoint.x, 2) + Math.pow(point.y - prevPoint.y, 2));
    currentLength += dist;
    samples[i] = currentLength;
    prevPoint = point;
  }

  const map = { totalLength: currentLength, samples };
  arcLengthCache.set(key, map);
  return map;
}

function getArcLengthAtTheta(theta: number, rBase: number, shape: string | undefined, intensity: number, customPoints?: number[], tension?: number, margin: number = 0): number {
  const map = getArcLengthMap(rBase, shape, intensity, customPoints, tension, margin);
  const normalizedTheta = ((theta % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
  const fullRotations = Math.floor(theta / (2 * Math.PI));
  
  const step = normalizedTheta / (2 * Math.PI) * (map.samples.length - 1);
  const idx = Math.floor(step);
  const frac = step - idx;
  
  const l1 = map.samples[idx];
  const l2 = map.samples[idx + 1] || map.totalLength;
  const localLength = l1 + (l2 - l1) * frac;
  
  return fullRotations * map.totalLength + localLength;
}

function getThetaAtArcLength(s: number, rBase: number, shape: string | undefined, intensity: number, customPoints?: number[], tension?: number, margin: number = 0): number {
  const map = getArcLengthMap(rBase, shape, intensity, customPoints, tension, margin);
  const fullRotations = Math.floor(s / map.totalLength);
  const targetS = s % map.totalLength;
  
  // Binary search for index
  let low = 0;
  let high = map.samples.length - 1;
  while (low < high - 1) {
    const mid = Math.floor((low + high) / 2);
    if (map.samples[mid] < targetS) low = mid;
    else high = mid;
  }
  
  const s1 = map.samples[low];
  const s2 = map.samples[high];
  const frac = (targetS - s1) / (s2 - s1);
  const normalizedTheta = ((low + frac) / (map.samples.length - 1)) * 2 * Math.PI;
  
  return fullRotations * 2 * Math.PI + normalizedTheta;
}

export interface GearState {
  center: { x: number; y: number };
  rotation: number; // in radians
  radius: number;
}

export function getActualRingTeeth(params: SpiroParams): number {
  const { ringTeeth, ringShape, ringIntensity, customRingPoints, ringTension, scale = 1.0 } = params;
  const effectiveRingTeeth = ringTeeth;
  const R_base = getRadiusFromTeeth(effectiveRingTeeth);
  const ringMap = getArcLengthMap(R_base, ringShape, ringIntensity, customRingPoints, ringTension);
  return Math.round(ringMap.totalLength * scale / PITCH);
}

export function getGearSystemState(params: SpiroParams, theta: number): { gear1: GearState; gear2?: GearState } {
  const { 
    ringTeeth, 
    gearTeeth, 
    type, 
    gearShape, 
    ringShape,
    ringIntensity = 0,
    shapeIntensity = 1.0,
    isMultiStage = false,
    stageTwoTeeth = 32,
    stageOneInternalTeeth = 52,
    railOffset = 0,
    offsetX = 0,
    offsetY = 0,
    scale = 1.0
  } = params;

  const effectiveRingTeeth = ringTeeth;
  const effectiveType = type;

  const R_base = getRadiusFromTeeth(effectiveRingTeeth); // Don't scale here, let getRingShapePoint handle it
  const r1Base = getRadiusFromTeeth(gearTeeth);

  // 0. Calculate actual teeth on the distorted ring perimeter to maintain pitch
  const ringMap = getArcLengthMap(R_base, ringShape, ringIntensity, params.customRingPoints, params.ringTension);
  const actualRingTeeth = getActualRingTeeth(params);

  // 1. Arc length traversed on the ring perimeter (scaled)
  const arcLengthTraversed = getArcLengthAtTheta(theta, R_base, ringShape, ringIntensity, params.customRingPoints, params.ringTension) * scale;
  
  // 2. Find the rotation of the gear required to match that arc length
  const gearPhi = getThetaAtArcLength(arcLengthTraversed, r1Base, gearShape, shapeIntensity);
  
  // 3. For the no-slip condition, compute gear rotation relative to global coordinates first
  const pRing = getRingShapePoint(theta, R_base, ringShape, ringIntensity, params.customRingPoints, params.ringTension, offsetX, offsetY, scale);
  const normalRing = getNormalAtTheta(theta, R_base, ringShape, ringIntensity, params.customRingPoints, params.ringTension);
  
  const alpha = Math.atan2(normalRing.y, normalRing.x);
  let g1_rotation = 0;
  if (effectiveType === 'hypotrochoid') {
    // angle of (pRing - g1_center) is alpha + PI
    g1_rotation = (alpha + Math.PI) - gearPhi;
  } else {
    // angle of (pRing - g1_center) is alpha
    g1_rotation = alpha - gearPhi;
  }

  // 4. Compute correct physical gear center distance (d_center) to prevent any part of the gear from penetrating the ring.
  // We sample 48 angles around the gear's perimeter to find the maximum required clearance.
  let d_center = r1Base;
  if (gearShape !== 'circle' && shapeIntensity > 0) {
    let maxProj = -Infinity;
    const samples = 48;
    for (let i = 0; i < samples; i++) {
      const phi = (i / samples) * 2 * Math.PI;
      const r_phi = r1Base * getRadiusModifier(gearShape, phi, shapeIntensity);
      
      // Vector from gear center to this perimeter point in global coordinates
      const angle_global = g1_rotation + phi;
      const rx = r_phi * Math.cos(angle_global);
      const ry = r_phi * Math.sin(angle_global);
      
      // Project onto normalRing
      const proj = rx * normalRing.x + ry * normalRing.y;
      
      if (effectiveType === 'hypotrochoid') {
        // Gear inside: ensure the gear boundary lies within the ring perimeter (max of -proj)
        if (-proj > maxProj) {
          maxProj = -proj;
        }
      } else {
        // Gear outside: ensure the gear boundary lies outside the ring perimeter (max of proj)
        if (proj > maxProj) {
          maxProj = proj;
        }
      }
    }
    d_center = maxProj;
  }

  // 5. Place the gear center along the ring's normal using our physical non-penetrating distance
  let g1_center;
  if (effectiveType === 'hypotrochoid') {
    // Gear inside: offset inward along normalRing
    g1_center = {
      x: pRing.x + normalRing.x * d_center,
      y: pRing.y + normalRing.y * d_center
    };
  } else {
    // Gear outside: offset outward (opposite of normalRing)
    g1_center = {
      x: pRing.x - normalRing.x * d_center,
      y: pRing.y - normalRing.y * d_center
    };
  }

  const state: { gear1: GearState; gear2?: GearState } = {
    gear1: {
      center: g1_center,
      rotation: g1_rotation,
      radius: r1Base // We keep r1Base as the "reference" radius for hole offsets
    }
  };

  if (isMultiStage) {
    const r2 = getRadiusFromTeeth(stageTwoTeeth);
    const r1_in = getRadiusFromTeeth(stageOneInternalTeeth);
    const rc2 = (r1_in - r2); 

    const internal_ratio = (stageOneInternalTeeth - stageTwoTeeth) / stageTwoTeeth;
    
    // Relative rotation of Gear 2 inside Gear 1
    const actualRingTeeth = getActualRingTeeth(params);
    const f_g1_rot_approx = effectiveType === 'hypotrochoid' 
      ? (actualRingTeeth / gearTeeth) 
      : -(actualRingTeeth / gearTeeth);
      
    const f_g2_roll_rel = internal_ratio * f_g1_rot_approx;

    const local_angle = f_g2_roll_rel * theta;
    const x_local = railOffset + rc2 * Math.cos(local_angle);
    const y_local = rc2 * Math.sin(local_angle);

    const g2_center = {
      x: g1_center.x + (x_local * Math.cos(g1_rotation) - y_local * Math.sin(g1_rotation)),
      y: g1_center.y + (x_local * Math.sin(g1_rotation) + y_local * Math.cos(g1_rotation))
    };

    const g2_rotation = g1_rotation - (internal_ratio * local_angle);

    state.gear2 = {
      center: g2_center,
      rotation: g2_rotation,
      radius: r2
    };
  }

  return state;
}

export function getSpiroPoint(params: SpiroParams, holeOffset: number, theta: number, holeIndex: number = 0): { x: number; y: number } {
  const state = getGearSystemState(params, theta);
  const activeGear = state.gear2 || state.gear1;
  const holeAngle = holeIndex * (30 * Math.PI / 180);
  const d = activeGear.radius * (holeOffset / 100);

  return {
    x: activeGear.center.x + d * Math.cos(activeGear.rotation + holeAngle),
    y: activeGear.center.y + d * Math.sin(activeGear.rotation + holeAngle)
  };
}

export function getSpiroTotalRotations(params: SpiroParams): number {
  const { 
    ringTeeth, 
    gearTeeth, 
    maxRotations = 200,
    isMultiStage = false,
  } = params;
  
  const effectiveRingTeeth = ringTeeth;
  const R_base = getRadiusFromTeeth(effectiveRingTeeth);
  const ringMap = getArcLengthMap(R_base, params.ringShape, params.ringIntensity, params.customRingPoints, params.ringTension);
  const actualRingTeeth = Math.round(ringMap.totalLength * (params.scale || 1.0) / PITCH);
  
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
  const lcm = (a: number, b: number): number => Math.abs(a * b) / gcd(a, b);
  
  let autoRotations = lcm(actualRingTeeth, gearTeeth) / actualRingTeeth;
  if (isMultiStage) {
    const l12 = lcm(gearTeeth, params.stageTwoTeeth);
    autoRotations = lcm(effectiveRingTeeth, l12) / effectiveRingTeeth;
  }
  
  return Math.min(autoRotations, maxRotations);
}

function calculatePoints(params: SpiroParams, holeOffset: number, holeIndex: number): { x: number; y: number }[] {
  const { 
    resolution, 
    isMultiStage = false,
  } = params;
  
  const totalRotations = getSpiroTotalRotations(params); 
  const maxTheta = totalRotations * 2 * Math.PI;
  const pointLimit = isMultiStage ? 30000 : 12000; 
  const step = Math.max(0.04 / resolution, maxTheta / pointLimit);

  const points: { x: number; y: number }[] = [];
  
  for (let theta = 0; theta <= maxTheta; theta += step) {
    const point = getSpiroPoint(params, holeOffset, theta, holeIndex);
    if (!isNaN(point.x) && !isNaN(point.y)) {
      points.push(point);
    }
    if (points.length > pointLimit) break;
  }

  return points;
}


export function generateSpiroPaths(params: SpiroParams): { x: number; y: number }[][] {
  return params.holeOffsets.map((offset, idx) => calculatePoints(params, offset, idx));
}

function interpolateCustom(angle: number, points: number[], tension: number = 0.5): number {
  if (!points || points.length === 0) return 1.0;
  
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
  
  // Custom tension factor (0 to 1 mapping to standard spline coefficients)
  // 0.5 is standard Catmull-Rom
  const s = tension; 
  
  return (
    p1 + 
    t * (s * (p2 - p0)) + 
    t * t * (2 * s * p0 + (s - 3) * p1 + (3 - 2 * s) * p2 - s * p3) + 
    t * t * t * (-s * p0 + (2 - s) * p1 + (s - 2) * p2 + s * p3)
  );
}

export function getRadiusModifier(shape: string | undefined, angle: number, intensity: number, customPoints?: number[], tension?: number): number {
  if (shape === 'custom' && customPoints && customPoints.length > 0) {
    return interpolateCustom(angle, customPoints, tension);
  }
  if (!shape || shape === 'circle') return 1.0;
  const effect = intensity * 0.15;
  switch (shape) {
    case 'flower': return 1.0 + effect * Math.sin(5 * angle);
    case 'triangle': return 1.0 + effect * (Math.abs(Math.sin(1.5 * angle)) - 0.5);
    case 'square': return 1.0 + effect * (Math.abs(Math.sin(2 * angle)) - 0.5);
    case 'oval': return 1.0 + effect * Math.cos(2 * angle);
    case 'egg': return 1.0 + effect * (Math.cos(angle) * 0.4 + Math.cos(2 * angle) * 0.6);
    case 'distorted': {
      return 1.0 + effect * (
        Math.sin(3 * angle) * 0.5 + 
        Math.cos(7 * angle) * 0.3 + 
        Math.sin(11 * angle) * 0.2
      );
    }
    default: return 1.0;
  }
}

function getNormalAtTheta(theta: number, rBase: number, shape: string | undefined, intensity: number, customPoints?: number[], tension?: number): { x: number; y: number } {
  const eps = 0.005;
  const p1 = getRingShapePoint(theta - eps, rBase, shape, intensity, customPoints, tension);
  const p2 = getRingShapePoint(theta + eps, rBase, shape, intensity, customPoints, tension);
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  // Tangent is (dx, dy). Normal points "inwards" for CCW shapes (rotates tangent 90deg CCW)
  return { x: -dy / len, y: dx / len };
}

export function getMinCurvatureRadius(rBase: number, shape: string = 'circle', intensity: number = 1.0, customPoints?: number[], tension?: number, scale: number = 1.0): number {
  if (shape === 'circle' && (!customPoints || customPoints.length === 0)) return rBase * scale;

  const samples = 200;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < samples; i++) {
    const theta = (i / samples) * 2 * Math.PI;
    points.push(getRingShapePoint(theta, rBase, shape, intensity, customPoints, tension, 0, 0, scale));
  }

  let minR = Infinity;

  // Use 3-point circumradius or derivative approximation for curvature
  for (let i = 0; i < samples; i++) {
    const pPrev = points[(i - 1 + samples) % samples];
    const pCurr = points[i];
    const pNext = points[(i + 1) % samples];

    // Menger curvature approximation: 4 * area / (a*b*c)
    const a = Math.sqrt((pCurr.x - pPrev.x)**2 + (pCurr.y - pPrev.y)**2);
    const b = Math.sqrt((pNext.x - pCurr.x)**2 + (pNext.y - pCurr.y)**2);
    const c = Math.sqrt((pNext.x - pPrev.x)**2 + (pNext.y - pPrev.y)**2);
    
    const s = (a + b + c) / 2;
    const area = Math.sqrt(Math.max(0, s * (s - a) * (s - b) * (s - c)));
    
    if (area > 0.0001) {
      const r_at_point = (a * b * c) / (4 * area);
      
      // We are looking for the radius of curvature. 
      // If the path is convex, R is positive. If concave (from gear perspective), it's the limit.
      // For internal gears, we care about the "inner" radius of curvature.
      minR = Math.min(minR, r_at_point);
    }
  }

  return minR;
}

export function getGearPoints(teeth: number, isInternal: boolean, shape: string = 'circle', intensity: number = 1.0, customPoints?: number[], tension?: number, offsetX: number = 0, offsetY: number = 0, scale: number = 1.0, margin: number = 0): { x: number; y: number }[] {
  const rBase = getRadiusFromTeeth(teeth);
  const toothHeight = PITCH * 0.55; 
  const map = getArcLengthMap(rBase, shape, intensity, customPoints, tension, margin);
  const totalS = map.totalLength * scale;
  const actualTeeth = Math.round(totalS / PITCH);
  const sPerSegment = (map.totalLength) / (actualTeeth * 4); 
  
  const points: { x: number; y: number }[] = [];
  const segments = actualTeeth * 4; 
  
  for (let i = 0; i < segments; i++) {
    const s = i * sPerSegment;
    const theta = getThetaAtArcLength(s, rBase, shape, intensity, customPoints, tension, margin);
    const toothPart = i % 4;
    const pBase = getRingShapePoint(theta, rBase, shape, intensity, customPoints, tension, offsetX, offsetY, scale, margin);
    const normal = getNormalAtTheta(theta, rBase, shape, intensity, customPoints, tension);
    
    let gearOffset = 0;
    if (isInternal) {
      gearOffset = (toothPart === 1 || toothPart === 2) ? -toothHeight/2 : toothHeight/2;
    } else {
      gearOffset = (toothPart === 1 || toothPart === 2) ? toothHeight/2 : -toothHeight/2;
    }
    
    points.push({
      x: pBase.x + normal.x * gearOffset,
      y: pBase.y + normal.y * gearOffset
    });
  }
  return points;
}

export function getShapePoints(rBase: number, shape: string = 'circle', intensity: number = 1.0, customPoints?: number[], tension?: number, offsetX: number = 0, offsetY: number = 0, scale: number = 1.0, margin: number = 0): { x: number; y: number }[] {
  const steps = 400; 
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < steps; i++) {
    const theta = (i / steps) * 2 * Math.PI;
    points.push(getRingShapePoint(theta, rBase, shape, intensity, customPoints, tension, offsetX, offsetY, scale, margin));
  }
  return points;
}

export function generateGearSvgPath(teeth: number, isInternal: boolean, shape: string = 'circle', intensity: number = 1.0, customPoints?: number[], tension?: number, offsetX: number = 0, offsetY: number = 0, scale: number = 1.0, margin: number = 0): string {
  const points = getGearPoints(teeth, isInternal, shape, intensity, customPoints, tension, offsetX, offsetY, scale, margin);
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
}

export function generateShapeSvgPath(rBase: number, shape: string = 'circle', intensity: number = 1.0, customPoints?: number[], tension?: number, offsetX: number = 0, offsetY: number = 0, scale: number = 1.0, margin: number = 0): string {
  const points = getShapePoints(rBase, shape, intensity, customPoints, tension, offsetX, offsetY, scale, margin);
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
}

