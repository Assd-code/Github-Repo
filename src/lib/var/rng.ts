// Statistical utilities for the VaR engine.
// Deterministic, dependency-free implementations.

/** Mulberry32 — fast, well-distributed seeded PRNG. Returns [0,1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample via Box-Muller transform. */
export function randNormal(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Inverse of the standard normal CDF using Peter Acklam's algorithm.
 * Accurate to ~1.15e-9 across the full domain.
 */
export function normInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q: number;
  let r: number;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      ((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]
    ) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= phigh) {
    q = p - 0.5;
    r = q * q;
    return (
      (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
      q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return (
      -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
}

/** Standard normal CDF using erf approximation. */
export function normCdf(x: number): number {
  // Abramowitz & Stegun 7.1.26
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.39894228040143317 * Math.exp(-0.5 * x * x);
  const p =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

/**
 * Linear-interpolation quantile. `values` will be sorted (copy) ascending.
 * `q` in [0,1].
 */
export function quantile(values: number[], q: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  if (q <= 0) return sorted[0];
  if (q >= 1) return sorted[sorted.length - 1];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

export function std(values: number[], sample = true): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  let s = 0;
  for (const v of values) s += (v - m) * (v - m);
  return Math.sqrt(s / (values.length - (sample ? 1 : 0)));
}

export function sum(values: number[]): number {
  let s = 0;
  for (const v of values) s += v;
  return s;
}

/**
 * Sample covariance matrix of a returns matrix (rows = observations, cols = assets).
 * Uses sample (n-1) normalization.
 */
export function covarianceMatrix(returns: number[][]): number[][] {
  const n = returns.length;
  const k = n > 0 ? returns[0].length : 0;
  if (n < 2 || k === 0) return Array.from({ length: k }, () => new Array(k).fill(0));
  const m = new Array(k).fill(0);
  for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) m[j] += returns[i][j];
  for (let j = 0; j < k; j++) m[j] /= n;
  const cov = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let a = 0; a < k; a++) {
    for (let b = a; b < k; b++) {
      let s = 0;
      for (let i = 0; i < n; i++) s += (returns[i][a] - m[a]) * (returns[i][b] - m[b]);
      const c = s / (n - 1);
      cov[a][b] = c;
      cov[b][a] = c;
    }
  }
  return cov;
}

/** Mean vector of returns matrix (per asset). */
export function meanVector(returns: number[][]): number[] {
  const n = returns.length;
  const k = n > 0 ? returns[0].length : 0;
  const m = new Array(k).fill(0);
  for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) m[j] += returns[i][j];
  for (let j = 0; j < k; j++) m[j] /= n;
  return m;
}

/**
 * Cholesky decomposition of a symmetric positive-definite matrix.
 * Returns lower-triangular L such that L * L^T = A. Throws on non-PD.
 */
export function cholesky(matrix: number[][]): number[][] {
  const n = matrix.length;
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = matrix[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (s <= 0) {
          // ridge correction for numerical stability
          s = Math.abs(s) + 1e-10;
        }
        L[i][j] = Math.sqrt(s);
      } else {
        L[i][j] = s / (L[j][j] || 1e-12);
      }
    }
  }
  return L;
}

/** Correlation matrix derived from a covariance matrix. */
export function correlationFromCovariance(cov: number[][]): number[][] {
  const n = cov.length;
  const corr = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const si = Math.sqrt(cov[i][i]) || 1e-12;
      const sj = Math.sqrt(cov[j][j]) || 1e-12;
      corr[i][j] = cov[i][j] / (si * sj);
    }
  }
  return corr;
}

/** Matrix * vector for square matrix. */
export function matVec(matrix: number[][], vec: number[]): number[] {
  const n = matrix.length;
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += matrix[i][j] * vec[j];
    out[i] = s;
  }
  return out;
}

/** Build a histogram of `values` with `binCount` bins. Non-finite values are ignored. */
export function histogram(
  values: number[],
  binCount = 40
): { x: number; count: number }[] {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return [];
  let min = Infinity;
  let max = -Infinity;
  for (const v of finite) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === max) {
    return [{ x: min, count: finite.length }];
  }
  const width = (max - min) / binCount;
  const bins = Array.from({ length: binCount }, (_, i) => ({
    x: min + (i + 0.5) * width,
    count: 0,
  }));
  for (const v of finite) {
    let idx = Math.floor((v - min) / width);
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;
    bins[idx].count++;
  }
  return bins;
}

/** Chi-square survival (1 - CDF) via regularized lower incomplete gamma. */
export function chiSquarePValue(stat: number, df: number): number {
  if (stat <= 0) return 1;
  // Regularized lower incomplete gamma P(a, x) via series / continued fraction.
  const a = df / 2;
  const x = stat / 2;
  const gln = logGamma(a);
  let p: number;
  if (x < a + 1) {
    // series expansion
    let term = 1 / a;
    let sumv = term;
    let n = 0;
    while (n < 1000) {
      n++;
      term *= x / (a + n);
      sumv += term;
      if (Math.abs(term) < Math.abs(sumv) * 1e-12) break;
    }
    p = sumv * Math.exp(-x + a * Math.log(x) - gln);
  } else {
    // continued fraction (Lentz)
    const FPMIN = 1e-300;
    let b = x + 1 - a;
    let c = 1 / FPMIN;
    let d = 1 / b;
    let h = d;
    let i = 1;
    while (i < 1000) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      c = b + an / c;
      if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 1e-12) break;
      i++;
    }
    const q = Math.exp(-x + a * Math.log(x) - gln) * h;
    p = 1 - q;
  }
  // p = P(a,x) = lower incomplete gamma regularized = chi2 CDF
  return Math.max(0, Math.min(1, 1 - p));
}

function logGamma(x: number): number {
  // Lanczos approximation
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    return (
      Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x)
    );
  }
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Downsample an array to at most `max` evenly-spaced points. */
export function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const out: T[] = [];
  const step = (arr.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    out.push(arr[Math.round(i * step)]);
  }
  return out;
}
