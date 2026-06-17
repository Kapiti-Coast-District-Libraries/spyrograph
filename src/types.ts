export interface SpiroParams {
  ringTeeth: number;
  gearTeeth: number;
  holeOffsets: number[]; // Array of percentages from gear center
  hiddenHoles?: boolean[]; // Array of visibilities for hole traces
  rotation: number;
  resolution: number;
  type: 'hypotrochoid' | 'epitrochoid';
  gearShape: 'circle' | 'flower' | 'triangle' | 'square' | 'oval' | 'egg';
  shapeIntensity: number; // 0 to 2
  ringShape: 'circle' | 'oval' | 'custom';
  ringIntensity: number; // 0 to 1
  ringTension: number; // 0 to 1
  customRingPoints?: number[]; // Array of modifiers (e.g. 1.0 = base radius)
  maxRotations: number;
  isMultiStage: boolean;
  stageTwoTeeth: number;
  stageOneInternalTeeth: number;
  railOffset: number; // Eccentricity of the internal rail center
  offsetX?: number;
  offsetY?: number;
  scale?: number;
  hasExternalTeeth?: boolean;
  externalTeeth?: number;
}

export interface GearPart {
  id: string;
  type: 'ring' | 'gear';
  teeth: number;
  outerDiameter: number; // mm
  innerDiameter?: number; // mm (for ring)
  holes?: { x: number; y: number; radius: number }[]; // for gear
}
