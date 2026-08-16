/**
 * Zeitkurven.
 *
 * Damit `ease` in der .motif-Datei kein dekorativer Eintrag ist: was hier steht,
 * wirkt sofort auf die Wiedergabe. Ein Parameter, der in der Datei steht und
 * nichts tut, ist schlimmer als keiner.
 *
 * GSAP uebernimmt spaeter die Zeitachse (Timeline, Stagger, Scrub). Diese Kurven
 * bleiben trotzdem gueltig — sie sind dieselbe Mathematik.
 */

export type EaseFn = (t: number) => number;

/** Kubische Bezier-Kurve wie CSS `cubic-bezier`, numerisch geloest. */
function cubicBezier(x1: number, y1: number, x2: number, y2: number): EaseFn {
  const curveX = (t: number) =>
    3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
  const curveY = (t: number) =>
    3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;

  return (x: number) => {
    // Bisektion statt Newton: robuster bei extremen Kontrollpunkten, und bei
    // 20 Schritten pro Frame spielt die Geschwindigkeit keine Rolle.
    let low = 0;
    let high = 1;
    for (let i = 0; i < 20; i++) {
      const mid = (low + high) / 2;
      if (curveX(mid) < x) low = mid;
      else high = mid;
    }
    return curveY((low + high) / 2);
  };
}

/** Gedaempfte Schwingung, auf 0..1 normiert. Ueberschwingt bewusst. */
function spring(stiffness = 180, damping = 14): EaseFn {
  return (t: number) => {
    if (t >= 1) return 1;
    const omega = Math.sqrt(stiffness);
    const zeta = damping / (2 * Math.sqrt(stiffness));
    if (zeta >= 1) return 1 - Math.exp(-omega * t) * (1 + omega * t);
    const omegaD = omega * Math.sqrt(1 - zeta * zeta);
    return (
      1 -
      Math.exp(-zeta * omega * t) *
        (Math.cos(omegaD * t) + ((zeta * omega) / omegaD) * Math.sin(omegaD * t))
    );
  };
}

export const EASES: Record<string, EaseFn> = {
  linear: (t) => t,
  smooth: cubicBezier(0.4, 0, 0.2, 1),
  out_expo: cubicBezier(0.16, 1, 0.3, 1),
  in_out: cubicBezier(0.65, 0, 0.35, 1),
  overshoot: cubicBezier(0.34, 1.56, 0.64, 1),
  spring: spring(),
};

export const EASE_NAMES = Object.keys(EASES);

export function easeByName(name: string): EaseFn {
  return EASES[name] ?? EASES.linear;
}
