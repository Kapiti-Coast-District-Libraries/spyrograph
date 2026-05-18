
/**
 * Simple STL Exporter for Extruded 2D Paths
 */

interface Point2D {
  x: number;
  y: number;
}

interface Triangle {
  v1: [number, number, number];
  v2: [number, number, number];
  v3: [number, number, number];
}

interface Hole {
  x: number;
  y: number;
  r: number;
  chamfer?: number;
}

export function generateSTL(layers: { points: Point2D[], height: number, holes?: Hole[] }[], fileName: string): void {
  let stl = `solid ${fileName}\n`;

  layers.forEach(layer => {
    const { points, height, holes = [] } = layer;
    const n = points.length;
    if (n < 3) return;

    // Center point
    const cx = points.reduce((sum, p) => sum + p.x, 0) / n;
    const cy = points.reduce((sum, p) => sum + p.y, 0) / n;

    // For each segment of the outer loop
    for (let i = 0; i < n; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % n];

      // To handle holes reliably, we subdivide each radial sector into small quads
      // and only draw those that are not inside a hole.
      const radialSteps = 200; // High resolution for 3D printing
      for (let j = 0; j < radialSteps; j++) {
        const rStart = j / radialSteps;
        const rEnd = (j + 1) / radialSteps;

        // Points for this quad
        const q1s = { x: cx + (p1.x - cx) * rStart, y: cy + (p1.y - cy) * rStart };
        const q1e = { x: cx + (p1.x - cx) * rEnd, y: cy + (p1.y - cy) * rEnd };
        const q2s = { x: cx + (p2.x - cx) * rStart, y: cy + (p2.y - cy) * rStart };
        const q2e = { x: cx + (p2.x - cx) * rEnd, y: cy + (p2.y - cy) * rEnd };

        // Center of the quad to check against holes
        const midX = (q1s.x + q1e.x + q2s.x + q2e.x) / 4;
        const midY = (q1s.y + q1e.y + q2s.y + q2e.y) / 4;

        let inHoleTop = false;
        let inHoleBottom = false;

        for (const hole of holes) {
          const dx = midX - hole.x;
          const dy = midY - hole.y;
          const distSq = dx * dx + dy * dy;
          
          if (distSq < hole.r * hole.r) {
            inHoleBottom = true;
          }
          
          const topR = hole.r + (hole.chamfer || 0);
          if (distSq < topR * topR) {
            inHoleTop = true;
          }
        }

        if (!inHoleTop) {
          // Top Face (z=height)
          stl += writeFacet([q1s.x, q1s.y, height], [q1e.x, q1e.y, height], [q2e.x, q2e.y, height]);
          stl += writeFacet([q1s.x, q1s.y, height], [q2e.x, q2e.y, height], [q2s.x, q2s.y, height]);
        }

        if (!inHoleBottom) {
          // Bottom Face (z=0)
          stl += writeFacet([q1e.x, q1e.y, 0], [q1s.x, q1s.y, 0], [q2s.x, q2s.y, 0]);
          stl += writeFacet([q2e.x, q2e.y, 0], [q1e.x, q1e.y, 0], [q2s.x, q2s.y, 0]);
        }
      }

      // Sides of the gear loop
      stl += writeFacet([p1.x, p1.y, 0], [p2.x, p2.y, 0], [p1.x, p1.y, height]);
      stl += writeFacet([p2.x, p2.y, 0], [p2.x, p2.y, height], [p1.x, p1.y, height]);
    }

    // Walls for holes (with chamfer support)
    holes.forEach(hole => {
      const steps = 32;
      const chamferDepth = Math.min(height * 0.4, hole.chamfer || 0); 
      const zChamfer = height - chamferDepth;

      for (let i = 0; i < steps; i++) {
        const a1 = (i / steps) * 2 * Math.PI;
        const a2 = ((i + 1) / steps) * 2 * Math.PI;
        
        const cos1 = Math.cos(a1);
        const sin1 = Math.sin(a1);
        const cos2 = Math.cos(a2);
        const sin2 = Math.sin(a2);

        // Bottom radius point
        const hB1x = hole.x + cos1 * hole.r;
        const hB1y = hole.y + sin1 * hole.r;
        const hB2x = hole.x + cos2 * hole.r;
        const hB2y = hole.y + sin2 * hole.r;

        // Top radius point (expanded by chamfer)
        const rTop = hole.r + (hole.chamfer || 0);
        const hT1x = hole.x + cos1 * rTop;
        const hT1y = hole.y + sin1 * rTop;
        const hT2x = hole.x + cos2 * rTop;
        const hT2y = hole.y + sin2 * rTop;

        // Chamfer start point (internal cylinder starts to taper)
        const hC1x = hole.x + cos1 * hole.r;
        const hC1y = hole.y + sin1 * hole.r;
        const hC2x = hole.x + cos2 * hole.r;
        const hC2y = hole.y + sin2 * hole.r;

        // Piercing walls to ensure slicers perceive a hole even with slightly non-watertight face subdivision
        const zStart = -0.05;
        const zEnd = height + 0.05;

        if (chamferDepth > 0) {
          // Bottom to Chamfer Start (Normals pointing INWARDS towards center)
          stl += writeFacet([hB1x, hB1y, zStart], [hC1x, hC1y, zChamfer], [hB2x, hB2y, zStart]);
          stl += writeFacet([hB2x, hB2y, zStart], [hC1x, hC1y, zChamfer], [hC2x, hC2y, zChamfer]);

          // Chamfer Face (Normals pointing INWARDS and UP)
          stl += writeFacet([hC1x, hC1y, zChamfer], [hT1x, hT1y, zEnd], [hC2x, hC2y, zChamfer]);
          stl += writeFacet([hC2x, hC2y, zChamfer], [hT1x, hT1y, zEnd], [hT2x, hT2y, zEnd]);
        } else {
          // Simple cylinder (Normals pointing INWARDS)
          stl += writeFacet([hB1x, hB1y, zStart], [hB1x, hB1y, zEnd], [hB2x, hB2y, zStart]);
          stl += writeFacet([hB2x, hB2y, zStart], [hB1x, hB1y, zEnd], [hB2x, hB2y, zEnd]);
        }
      }
    });

  });

  stl += `endsolid ${fileName}\n`;

  const blob = new Blob([stl], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}.stl`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Specifically for Ring Gears (Annulus triangulation)
 */
export function generateRingSTL(innerPoints: Point2D[], outerPoints: Point2D[], height: number, fileName: string): void {
  let stl = `solid ${fileName}\n`;
  const n = innerPoints.length;
  const m = outerPoints.length;

  // We need to match loops. Since we generate them with steps, we can assume they are sampled similarly.
  // For simplicity, we interpolate if lengths differ, but here they usually match our 'steps' count.
  const steps = Math.max(n, m);

  const getPoint = (arr: Point2D[], i: number, total: number) => {
    const idx = Math.floor((i / total) * arr.length) % arr.length;
    return arr[idx];
  };

  for (let i = 0; i < steps; i++) {
    const i1 = getPoint(innerPoints, i, steps);
    const i2 = getPoint(innerPoints, i + 1, steps);
    const o1 = getPoint(outerPoints, i, steps);
    const o2 = getPoint(outerPoints, i + 1, steps);

    // Top Face (z=height) - Pointing UP
    stl += writeFacet([i1.x, i1.y, height], [i2.x, i2.y, height], [o1.x, o1.y, height]);
    stl += writeFacet([o1.x, o1.y, height], [i2.x, i2.y, height], [o2.x, o2.y, height]);

    // Bottom Face (z=0) - Pointing DOWN
    stl += writeFacet([i1.x, i1.y, 0], [o1.x, o1.y, 0], [i2.x, i2.y, 0]);
    stl += writeFacet([o1.x, o1.y, 0], [o2.x, o2.y, 0], [i2.x, i2.y, 0]);

    // Inner Sides (Pointing towards center)
    stl += writeFacet([i1.x, i1.y, 0], [i2.x, i2.y, 0], [i1.x, i1.y, height]);
    stl += writeFacet([i2.x, i2.y, 0], [i2.x, i2.y, height], [i1.x, i1.y, height]);

    // Outer Sides (Pointing away from center)
    stl += writeFacet([o1.x, o1.y, 0], [o2.x, o2.y, 0], [o1.x, o1.y, height]);
    stl += writeFacet([o2.x, o2.y, 0], [o2.x, o2.y, height], [o1.x, o1.y, height]);
  }

  stl += `endsolid ${fileName}\n`;
  const blob = new Blob([stl], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}.stl`;
  link.click();
  URL.revokeObjectURL(url);
}

function writeFacet(v1: number[], v2: number[], v3: number[]): string {
  // Simple normal calc (not strictly required for many slicers but good practice)
  const ux = v2[0] - v1[0], uy = v2[1] - v1[1], uz = v2[2] - v1[2];
  const vx = v3[0] - v1[0], vy = v3[1] - v1[1], vz = v3[2] - v1[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const mag = Math.sqrt(nx*nx + ny*ny + nz*nz);
  const n = mag > 0 ? [nx/mag, ny/mag, nz/mag] : [0, 0, 1];

  return `  facet normal ${n[0]} ${n[1]} ${n[2]}\n    outer loop\n      vertex ${v1[0]} ${v1[1]} ${v1[2]}\n      vertex ${v2[0]} ${v2[1]} ${v2[2]}\n      vertex ${v3[0]} ${v3[1]} ${v3[2]}\n    endloop\n  endfacet\n`;
}
