
export async function parseSvgPaths(svgText: string): Promise<string[]> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  
  // Select all common shape elements
  const shapes = doc.querySelectorAll('path, rect, circle, ellipse, polygon, polyline, line');
  
  if (shapes.length === 0) {
    throw new Error('No valid shape elements found in SVG');
  }

  const pathDatas: string[] = [];

  shapes.forEach(shape => {
    const tagName = shape.tagName.toLowerCase();
    let d = '';

    if (tagName === 'path') {
      d = shape.getAttribute('d') || '';
    } else if (tagName === 'rect') {
      const x = parseFloat(shape.getAttribute('x') || '0');
      const y = parseFloat(shape.getAttribute('y') || '0');
      const w = parseFloat(shape.getAttribute('width') || '0');
      const h = parseFloat(shape.getAttribute('height') || '0');
      d = `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
    } else if (tagName === 'circle') {
      const cx = parseFloat(shape.getAttribute('cx') || '0');
      const cy = parseFloat(shape.getAttribute('cy') || '0');
      const r = parseFloat(shape.getAttribute('r') || '0');
      d = `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
    } else if (tagName === 'ellipse') {
      const cx = parseFloat(shape.getAttribute('cx') || '0');
      const cy = parseFloat(shape.getAttribute('cy') || '0');
      const rx = parseFloat(shape.getAttribute('rx') || '0');
      const ry = parseFloat(shape.getAttribute('ry') || '0');
      d = `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
    } else if (tagName === 'polygon' || tagName === 'polyline') {
      const pointsStr = shape.getAttribute('points') || '';
      if (pointsStr) {
        // Normalize points string: replace commas with spaces, then split by whitespace
        const coords = pointsStr.trim().replace(/,/g, ' ').split(/\s+/);
        if (coords.length >= 2) {
          d = `M ${coords[0]} ${coords[1]}`;
          for (let i = 2; i < coords.length; i += 2) {
            d += ` L ${coords[i]} ${coords[i+1]}`;
          }
          if (tagName === 'polygon') {
            d += ' Z';
          }
        }
      }
    } else if (tagName === 'line') {
      const x1 = shape.getAttribute('x1') || '0';
      const y1 = shape.getAttribute('y1') || '0';
      const x2 = shape.getAttribute('x2') || '0';
      const y2 = shape.getAttribute('y2') || '0';
      d = `M ${x1} ${y1} L ${x2} ${y2}`;
    }

    if (d.trim()) {
      pathDatas.push(d);
    }
  });

  return pathDatas;
}

export function getPathsBoundingBox(pathDatas: string[]): { minX: number, maxX: number, minY: number, maxY: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  
  // Create a hidden SVG container in the DOM for accurate measurement
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.position = 'absolute';
  svg.style.width = '0';
  svg.style.height = '0';
  svg.style.visibility = 'hidden';
  document.body.appendChild(svg);

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  svg.appendChild(path);

  pathDatas.forEach(d => {
    path.setAttribute('d', d);
    try {
      const len = path.getTotalLength();
      if (len === 0) return;
      for (let i = 0; i <= 20; i++) {
        const p = path.getPointAtLength((i / 20) * len);
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
    } catch (e) { /* ignore */ }
  });

  document.body.removeChild(svg);
  return { minX, maxX, minY, maxY };
}

export function samplePathToModifiers(pathData: string, nodeCount: number): { modifiers: number[], centerX: number, centerY: number, avgRadius: number } {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.position = 'absolute';
  svg.style.width = '0';
  svg.style.height = '0';
  svg.style.visibility = 'hidden';
  document.body.appendChild(svg);

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathData);
  svg.appendChild(path);
  
  const totalLength = path.getTotalLength();
  if (totalLength === 0) {
    document.body.removeChild(svg);
    return { modifiers: Array(nodeCount).fill(1.0), centerX: 0, centerY: 0, avgRadius: 0 };
  }

  const samples = 1000;
  const points: { x: number; y: number; r: number; theta: number }[] = [];
  
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  for (let i = 0; i < samples; i++) {
    const p = path.getPointAtLength((i / samples) * totalLength);
    points.push({ x: p.x, y: p.y, r: 0, theta: 0 });
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  // Convert to polar relative to its OWN center for the shape modification
  points.forEach(p => {
    const dx = p.x - centerX;
    const dy = p.y - centerY;
    p.r = Math.sqrt(dx * dx + dy * dy);
    p.theta = Math.atan2(dy, dx);
    if (p.theta < 0) p.theta += 2 * Math.PI;
  });

  // Sort by theta
  points.sort((a, b) => a.theta - b.theta);

  // Remove duplicates at 0/2PI edge if any
  const uniquePoints = points.filter((p, i) => {
    if (i === 0) return true;
    return Math.abs(p.theta - points[i-1].theta) > 0.0001;
  });

  const resampled: number[] = [];
  const avgRadius = points.reduce((acc, p) => acc + p.r, 0) / points.length;

  for (let i = 0; i < nodeCount; i++) {
    const targetTheta = (i / nodeCount) * 2 * Math.PI;
    
    let nextIdx = uniquePoints.findIndex(p => p.theta >= targetTheta);
    if (nextIdx === -1) nextIdx = 0;
    
    const prevIdx = (nextIdx - 1 + uniquePoints.length) % uniquePoints.length;
    const p1 = uniquePoints[prevIdx];
    const p2 = uniquePoints[nextIdx];
    
    let t = 0;
    let span = p2.theta - p1.theta;
    if (span < 0) span += 2 * Math.PI;
    
    let dist = targetTheta - p1.theta;
    if (dist < 0) dist += 2 * Math.PI;
    
    if (span > 0) t = dist / span;
    
    const r = p1.r + (p2.r - p1.r) * t;
    resampled.push(r / avgRadius);
  }

  document.body.removeChild(svg);
  return { modifiers: resampled, centerX, centerY, avgRadius };
}
