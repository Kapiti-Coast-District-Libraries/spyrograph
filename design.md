# SpiroForge Design System & Brand Guidelines
**Owner**: Kāpiti Libraries
**Version**: 1.0.0
**Aesthetic Profile**: Modern High-Contrast Engineering System

This document outlines the visual identity, user interface patterns, mathematical constraints, and design tokens used in the SpiroForge ecosystem. Use this spec to align future applications with this clean, objective, high-contrast engineering aesthetic.

---

## 1. Design & Layout Philosophy

The interface acts as a **professional digital-fabrication workspace**, avoiding unnecessary "AI-slop", gradients, or simulated terminal layouts. It is structurally honest, relying on clean container boundaries, generous negative space, and clear focal nodes.

*   **Structure**: Single-view high-density workspace with clear lateral panels (left pane for geometry & stage controls, center pane for interactive layout/simulation, right pane for system & laser-bed rendering).
*   **Touch Targets**: Minimum `44px` interactive touch targets for mobile accessibility and physical kiosks.
*   **Micro-interactions**: Delightful state feedback with low latency. Elements use subtle hover transitions (`hover:scale-[1.02] duration-200`) and scale indicators.

---

## 2. Core Color Palette (Tailwind Tokens)

SpiroForge utilizes an eye-safe, high-contrast palette of cool slates, pure whites, and vibrant utility accents representing engineering blueprints and cutting beams.

| Name | Role / Usage | Tailwind Class | HEX Equivalent |
| :--- | :--- | :--- | :--- |
| **Canvas** | Primary app-wide background | `bg-slate-50/60` | `#F8FAFC` |
| **Pristine White** | Interactive workspace panels, card containers | `bg-white` | `#FFFFFF` |
| **Ink Dark** | Content headers, primary active titles, body text | `text-slate-900` | `#0F172A` |
| **Muted Slate** | Non-critical status, labels, metadata indicators | `text-slate-500` | `#64748B` |
| **Laser Red** | Laser-cut vector preview, active cutting paths | `stroke-red-600` | `#DC2626` |
| **Blueprint Blue** | Center-points, interactive bounds, system headers | `text-blue-600` / `bg-blue-50` | `#2563EB` |
| **Safety Border** | Subtle panel divides and structural guide lines | `border-slate-200/80` | `#E2E8F0` |

---

## 3. Typography Pairings

All type scales must use direct, readable fonts paired to convey technical precision:

*   **Primary Sans-Serif**: `Inter` (sans-serif)
    *   *Usage*: Settings inputs, navigation, main titles, buttons, structural text.
    *   *Styling*: `font-sans font-medium tracking-tight`
*   **Mono-Space Accents**: `JetBrains Mono` or `Fira Code`
    *   *Usage*: Teeth math calculations, coordinate tracking, scale displays, export details.
    *   *Styling*: `font-mono text-xs text-slate-500`

```css
/* Font Configuration (src/index.css) */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
@import "tailwindcss";

@theme {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
}
```

---

## 4. Mathematical Engineering Tokens (Vector Modeling)

If calculating planetary gear mechanisms or generating hardware cut layouts, you must implement the following physical constants:

*   **Standard Pitch (`PITCH`)**: `6.0` (Distance in millimeters between consecutive tooth hubs to enable flawless physical mesh compatibility).
*   **Tooth Height Coefficient**: `PITCH * 0.55` (~`3.3mm` depth representing standard spur-gear profiles).
*   **Radius to Tooth Calculation**:
    $$R = \frac{T \times \text{PITCH}}{2\pi}$$
    Where $T$ is the number of teeth.
*   **Clearance Gap**: Minimum `1.5mm` vector spacing must separate any concentric or nested components during high-density export layouts to prevent localized material melting on laser cutbeds.

---

## 5. Viewport Control Standards (Pan & Zoom)

Viewport controls translate smooth user input into persistent geometric scales:

*   **Minimum Zoom Limit**: `-300%` (Scale factor equivalent `1.25` for extreme wide-angle bed alignment).
*   **Default Viewing Scale**: `100%` (Scale factor `5.0` for 1:1 screen mapping).
*   **Maximum Zoom Limit**: `+700%` (Scale factor `40.0` for high-precision tooth inspections).
*   **Scale Representation mapping**:
    ```typescript
    const zoomPctText = zoom >= 5.0 
      ? `${Math.round(((zoom / 5.0) - 1.0) * 100)}%` 
      : `${Math.round(((zoom - 5.0) / 3.75) * 300)}%`;
    ```

---

## 6. Laser Cutting Optimization Guidelines

When exporting DXF or SVG templates, the platform enforces strict structural integrity rules:
1.  **Durable Multistage Assembly**: Dual core stages allow gears of different stage modules to mesh without friction.
2.  **Maximum Dense Packing**: Smaller gears must nest coaxially directly inside the physical ring gear openings to economize laser-cut sheet materials (saving over 60% raw stock).
3.  **Clean Vectors**: Exclude unnecessary labels, annotation guides, and text paths from vector cutting files to eliminate dual scoring and maintain a raw, high-precision edge.
4.  **Standard Kerf Offset Holes**: All peg shafts are sized with standardized radii (e.g. `1.6mm` holes for standard physical dowels or pegs).
