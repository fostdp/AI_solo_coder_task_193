class Thermodynamics {
  static R = 8.314;

  static H_SO2(Tl) {
    const T = Tl + 273.15;
    return Math.exp(13.98 - 1860 / T);
  }

  static K1_SO2(Tl) {
    const T = Tl + 273.15;
    return 1.3e-2 * Math.exp(1000 / Thermodynamics.R * (1 / T - 1 / 298.15));
  }

  static K2_SO2(Tl) {
    const T = Tl + 273.15;
    return 6.6e-8 * Math.exp(1500 / Thermodynamics.R * (1 / T - 1 / 298.15));
  }

  static enhancementFactor(pH, Tl) {
    const K1 = Thermodynamics.K1_SO2(Tl);
    const K2 = Thermodynamics.K2_SO2(Tl);
    const H_plus = Math.pow(10, -pH);
    return 1 + K1 / H_plus + K1 * K2 / (H_plus * H_plus);
  }

  static computeLayerPH(layerIdx, totalLayers, cumulAbsorbed, y_in, LGR, K1) {
    const C_SO2_liq = cumulAbsorbed * 1000 / LGR;
    const H_plus_SO2 = Math.sqrt(K1 * Math.max(C_SO2_liq, 1e-12) + 1e-14);

    const CaCO3_conc = 0.015 * LGR;
    const CaCO3_consumed = cumulAbsorbed * 500;
    const CaCO3_remaining = Math.max(0, CaCO3_conc - CaCO3_consumed);

    const CaCO3_neutralize = 2 * CaCO3_remaining;
    const H_plus_net = Math.max(1e-8, H_plus_SO2 - CaCO3_neutralize);
    let pH = -Math.log10(Math.max(1e-12, H_plus_net));

    const abs_ratio = cumulAbsorbed / y_in;
    const pH_fresh = 6.5;
    const pH_slope = 1.5 * abs_ratio * (10 / LGR);
    pH = pH_fresh - pH_slope;

    if (CaCO3_remaining > 0.1 * CaCO3_conc) {
      pH = Math.max(pH, 4.5 + 1.5 * (CaCO3_remaining / CaCO3_conc));
    }

    return Math.max(3.0, Math.min(7.0, pH));
  }
}

class DropletPopulation {
  constructor(meanDp_mm, spreadN) {
    this.meanDp = meanDp_mm || 2.5;
    this.spreadN = spreadN || 3.5;
    this._bins = null;
  }

  _gamma(z) {
    if (z === 0.5) return Math.sqrt(Math.PI);
    if (z === 1) return 1;
    if (z === 2) return 1;
    if (z === 3) return 2;
    let g = 1;
    for (let i = 2; i < z; i++) g *= i;
    return g;
  }

  _gammaFunc(z) {
    if (z < 0.5) return this._gamma(Math.round(z * 2) / 2) || 1;
    const n = Math.max(1, Math.floor(z));
    let g = 1;
    for (let i = 1; i < n; i++) g *= i;
    return g;
  }

  generateBins(nBins = 12) {
    if (this._bins && this._bins.length === nBins) return this._bins;

    const n = this.spreadN;
    const d_bar = this.meanDp;
    const dpMin = d_bar * 0.15;
    const dpMax = d_bar * 3.5;

    const bins = [];
    let totalWeight = 0;

    for (let i = 0; i < nBins; i++) {
      const lo = dpMin + (dpMax - dpMin) * i / nBins;
      const hi = dpMin + (dpMax - dpMin) * (i + 1) / nBins;
      const dp_mid = (lo + hi) / 2;

      const F_lo = 1 - Math.exp(-Math.pow(lo / d_bar, n));
      const F_hi = 1 - Math.exp(-Math.pow(hi / d_bar, n));
      const weight = F_hi - F_lo;

      bins.push({ dp: dp_mid, weight });
      totalWeight += weight;
    }

    for (const b of bins) {
      b.weight /= totalWeight;
    }

    this._bins = bins;
    return bins;
  }

  weightedSpecificArea(holdup = 0.08) {
    const bins = this.generateBins();
    let a = 0;
    for (const b of bins) {
      const dp_m = b.dp / 1000;
      a += b.weight * 6 * holdup / dp_m;
    }
    return a;
  }

  weightedMassTransferCoefficient(u_gas) {
    const D_g = 1.8e-5;
    const nu_g = 1.8e-5;
    const Sc = nu_g / D_g;

    const bins = this.generateBins();
    let k_g = 0;
    for (const b of bins) {
      const dp_m = b.dp / 1000;
      const Re = u_gas * dp_m / nu_g;
      const Sh = 2 + 0.6 * Math.sqrt(Re) * Math.pow(Sc, 1 / 3);
      k_g += b.weight * Sh * D_g / dp_m;
    }
    return k_g;
  }

  getSauterMeanDiameter() {
    const bins = this.generateBins();
    let sumVW = 0, sumSW = 0;
    for (const b of bins) {
      const d = b.dp;
      sumVW += b.weight * d * d * d;
      sumSW += b.weight * d * d;
    }
    return sumSW > 0 ? sumVW / sumSW : this.meanDp;
  }
}

class FloodingCriteria {
  static floodingVelocity(LGR) {
    const u_flood_max = 5.0;
    const u_flood = u_flood_max * Math.exp(-0.018 * LGR);
    return Math.max(1.2, u_flood);
  }

  static floodRatio(u_g, LGR) {
    const u_flood = FloodingCriteria.floodingVelocity(LGR);
    return u_g / u_flood;
  }

  static floodPenalty(flood_ratio) {
    if (flood_ratio > 0.85) {
      return Math.max(0.3, 1 - 0.7 * (flood_ratio - 0.85) / 0.15);
    }
    return 1.0;
  }

  static pressureDrop(LGR, u_g, tower_height, flood_ratio, rho_g, rho_l) {
    const holdup = 0.08 * (LGR / 10);
    const dP_dry = 0.5 * rho_g * u_g * u_g * 10;
    const dP_wet = dP_dry * (1 + 4 * holdup);

    let dP_flood = 0;
    if (flood_ratio > 0.9) {
      dP_flood = dP_wet * (flood_ratio - 0.9) * 10;
    }

    return (dP_wet + dP_flood) * tower_height / 100;
  }
}

class TowerProfileLayer {
  constructor({ layer, height, C_g, C_l, pH, enhancementFactor, KGa, transferRate, specificArea, k_gas, floodPenalty }) {
    this.layer = layer;
    this.height = height;
    this.C_g = C_g;
    this.C_l = C_l;
    this.pH = pH;
    this.enhancementFactor = enhancementFactor;
    this.KGa = KGa;
    this.transferRate = transferRate;
    this.specificArea = specificArea;
    this.k_gas = k_gas;
    this.floodPenalty = floodPenalty;
  }

  toJSON() {
    return {
      layer: this.layer,
      height: this.height,
      C_g: Math.round(this.C_g * 100) / 100,
      C_l: this.C_l,
      pH: Math.round(this.pH * 100) / 100,
      enhancementFactor: Math.round(this.enhancementFactor * 10) / 10,
      KGa: this.KGa,
      transferRate: this.transferRate,
      specificArea: Math.round(this.specificArea * 100) / 100
    };
  }
}

class TowerMassTransferFramework {
  constructor(params) {
    this.liquidGasRatio = params.liquidGasRatio;
    this.inletSO2 = params.inletSO2;
    this.gasTemp = params.gasTemp || 120;
    this.liquidTemp = params.liquidTemp || 25;
    this.dropletSize = params.dropletSize || 2.5;
    this.dpSpread = params.dpSpread || 3.5;

    this.N_layers = 20;
    this.tower_height = 15;
    this.tower_diameter = 8;
    this.tower_area = Math.PI * Math.pow(this.tower_diameter / 2, 2);
    this.dz = this.tower_height / this.N_layers;

    this.y_in = this.inletSO2 * 1e-6;

    const R_gas = 8.314;
    const T_gas = this.gasTemp + 273.15;
    const P_total = 101325;
    this.rho_g = P_total / (R_gas / 0.029 * T_gas);
    this.rho_l = 1000;
    this.mu_l = 0.001;
    this.u_g = 3.0;

    this.droplets = new DropletPopulation(this.dropletSize, this.dpSpread);
    this.flood_ratio = FloodingCriteria.floodRatio(this.u_g, this.liquidGasRatio);
    this.flood_penalty = FloodingCriteria.floodPenalty(this.flood_ratio);
    this.flooding = this.flood_ratio > 0.95;
    this.nearFlooding = this.flood_ratio > 0.8 && this.flood_ratio <= 0.95;

    this.a = this.droplets.weightedSpecificArea();
    this.k_g = this.droplets.weightedMassTransferCoefficient(this.u_g);
  }

  computeProfile() {
    const Tl = this.liquidTemp;
    const LGR = this.liquidGasRatio;
    const K1 = Thermodynamics.K1_SO2(Tl);
    const H_dim = Thermodynamics.H_SO2(Tl);

    let y = this.y_in;
    let cumul_SO2_absorbed = 0;

    const layers = [];

    for (let i = 0; i < this.N_layers; i++) {
      const pH = Thermodynamics.computeLayerPH(i, this.N_layers, cumul_SO2_absorbed, this.y_in, LGR, K1);

      const phi = Thermodynamics.enhancementFactor(pH, Tl);

      const base_KGa = this.k_g * this.a;
      const lg_factor = Math.sqrt(LGR / 10);
      const phi_factor = 1 + 0.12 * Math.log10(Math.max(1, phi));
      const calibration_factor = 0.004;
      const K_G_a = base_KGa * phi_factor * lg_factor * this.flood_penalty * calibration_factor;

      const prev_y = y;
      y = y * Math.exp(-K_G_a * this.dz);
      y = Math.max(0, y);

      const absorbed_this = prev_y - y;
      cumul_SO2_absorbed += absorbed_this;

      layers.push(new TowerProfileLayer({
        layer: i + 1,
        height: Math.round((i + 1) * this.dz * 100) / 100,
        C_g: y * 1e6,
        C_l: cumul_SO2_absorbed,
        pH: pH,
        enhancementFactor: phi,
        KGa: K_G_a,
        transferRate: K_G_a * y,
        specificArea: this.a,
        k_gas: this.k_g,
        floodPenalty: this.flood_penalty
      }));
    }

    const y_out = y;
    const outlet_ppm = y_out * 1e6;
    const efficiency = (1 - y_out / this.y_in) * 100;

    const pressureDrop = FloodingCriteria.pressureDrop(
      LGR, this.u_g, this.tower_height, this.flood_ratio, this.rho_g, this.rho_l
    );

    const final_pH = layers[layers.length - 1].pH;

    return {
      inletSO2: this.inletSO2,
      outletSO2: Math.round(outlet_ppm * 100) / 100,
      efficiency: Math.round(Math.max(0, efficiency) * 10000) / 10000,
      pH: Math.round(final_pH * 100) / 100,
      HenryConstant: Math.round(H_dim * 1e4) / 1e4,
      enhancementFactor: Math.round(layers[layers.length - 1].enhancementFactor * 10) / 10,
      dropletSize: this.dropletSize,
      dpSpread: this.dpSpread,
      sauterMeanDp: Math.round(this.droplets.getSauterMeanDiameter() * 1000) / 1000,
      specificArea: Math.round(this.a * 100) / 100,
      k_gas: this.k_g,
      floodRatio: Math.round(this.flood_ratio * 100) / 100,
      u_flood: Math.round(FloodingCriteria.floodingVelocity(LGR) * 100) / 100,
      flooding: this.flooding,
      nearFlooding: this.nearFlooding,
      pressureDrop: Math.round(pressureDrop * 10) / 10,
      layers: layers.map(l => l.toJSON())
    };
  }
}

class EfficiencyEvaluator {
  static evaluate(result) {
    const items = [];
    const eff = result.efficiency;
    const fr = result.floodRatio;
    const dp = result.dropletSize;
    const pH = result.pH;

    if (eff >= 95) items.push({ key: 'efficiency', grade: 'A', label: '脱硫效率', score: 100, detail: `效率${eff.toFixed(1)}% ≥ 95%` });
    else if (eff >= 90) items.push({ key: 'efficiency', grade: 'B', label: '脱硫效率', score: 85, detail: `效率${eff.toFixed(1)}% ∈ [90%,95%)` });
    else if (eff >= 80) items.push({ key: 'efficiency', grade: 'C', label: '脱硫效率', score: 65, detail: `效率${eff.toFixed(1)}% ∈ [80%,90%)` });
    else items.push({ key: 'efficiency', grade: 'D', label: '脱硫效率', score: 40, detail: `效率${eff.toFixed(1)}% < 80%` });

    if (fr <= 0.7) items.push({ key: 'flooding', grade: 'A', label: '液泛裕度', score: 100, detail: `液泛比${fr.toFixed(2)} ≤ 0.7，安全裕度充足` });
    else if (fr <= 0.85) items.push({ key: 'flooding', grade: 'B', label: '液泛裕度', score: 80, detail: `液泛比${fr.toFixed(2)} ∈ (0.7,0.85]，裕度一般` });
    else if (fr <= 0.95) items.push({ key: 'flooding', grade: 'C', label: '液泛裕度', score: 55, detail: `液泛比${fr.toFixed(2)} ∈ (0.85,0.95]，接近液泛` });
    else items.push({ key: 'flooding', grade: 'D', label: '液泛裕度', score: 20, detail: `液泛比${fr.toFixed(2)} > 0.95，已液泛` });

    if (dp >= 1.5 && dp <= 3.0) items.push({ key: 'droplet', grade: 'A', label: '粒径范围', score: 95, detail: `粒径${dp.toFixed(1)}mm ∈ [1.5,3.0]，工业最优` });
    else if (dp >= 0.5 && dp < 1.5) items.push({ key: 'droplet', grade: 'B', label: '粒径范围', score: 75, detail: `粒径${dp.toFixed(1)}mm < 1.5mm，能耗偏高` });
    else if (dp > 3.0 && dp <= 5.0) items.push({ key: 'droplet', grade: 'B', label: '粒径范围', score: 75, detail: `粒径${dp.toFixed(1)}mm > 3.0mm，效率偏低` });
    else items.push({ key: 'droplet', grade: 'C', label: '粒径范围', score: 50, detail: `粒径${dp.toFixed(1)}mm 超出合理范围` });

    if (pH >= 4.5 && pH <= 6.5) items.push({ key: 'pH', grade: 'A', label: '浆液pH', score: 90, detail: `pH=${pH.toFixed(2)} ∈ [4.5,6.5]，吸收+缓冲平衡` });
    else if (pH >= 3.5 && pH < 4.5) items.push({ key: 'pH', grade: 'B', label: '浆液pH', score: 70, detail: `pH=${pH.toFixed(2)} 偏低，CaCO₃消耗快` });
    else if (pH > 6.5) items.push({ key: 'pH', grade: 'B', label: '浆液pH', score: 70, detail: `pH=${pH.toFixed(2)} 偏高，可能碱过量` });
    else items.push({ key: 'pH', grade: 'D', label: '浆液pH', score: 30, detail: `pH=${pH.toFixed(2)} < 3.5，浆液酸化严重` });

    if (result.pressureDrop <= 2.0) items.push({ key: 'pressure', grade: 'A', label: '塔压降', score: 90, detail: `压降${result.pressureDrop.toFixed(1)}kPa ≤ 2.0` });
    else if (result.pressureDrop <= 5.0) items.push({ key: 'pressure', grade: 'B', label: '塔压降', score: 70, detail: `压降${result.pressureDrop.toFixed(1)}kPa ∈ (2,5]` });
    else items.push({ key: 'pressure', grade: 'C', label: '塔压降', score: 45, detail: `压降${result.pressureDrop.toFixed(1)}kPa > 5.0，能耗高` });

    const totalScore = items.reduce((s, i) => s + i.score, 0);
    const overallGrade = totalScore >= 450 ? 'A' : totalScore >= 370 ? 'B' : totalScore >= 280 ? 'C' : 'D';

    return { items, totalScore, overallGrade };
  }
}

class ParameterOptimizer {
  static optimize(baseParams, targetEfficiency = 95) {
    const lgrRange = [5, 8, 10, 12, 15, 20, 25, 30];
    const dpRange = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0];
    const candidates = [];

    for (const lgr of lgrRange) {
      for (const dp of dpRange) {
        const result = calculate({ ...baseParams, liquidGasRatio: lgr, dropletSize: dp });
        if (result.flooding) continue;
        const evalResult = EfficiencyEvaluator.evaluate(result);
        const effDelta = Math.abs(result.efficiency - targetEfficiency);
        candidates.push({ lgr, dp, ...result, evalResult, effDelta });
      }
    }

    candidates.sort((a, b) => {
      const aMeets = a.efficiency >= targetEfficiency ? 0 : 1;
      const bMeets = b.efficiency >= targetEfficiency ? 0 : 1;
      if (aMeets !== bMeets) return aMeets - bMeets;
      return (b.evalResult.totalScore - a.effDelta) - (a.evalResult.totalScore - a.effDelta);
    });

    const topN = candidates.slice(0, 5);
    const best = topN[0] || null;

    return { targetEfficiency, best, candidates: topN, totalScanned: lgrRange.length * dpRange.length };
  }

  static sweepLGR(baseParams, lgrMin = 3, lgrMax = 30, steps = 12) {
    const results = [];
    for (let i = 0; i < steps; i++) {
      const lgr = lgrMin + (lgrMax - lgrMin) * i / (steps - 1);
      const r = calculate({ ...baseParams, liquidGasRatio: Math.round(lgr * 10) / 10 });
      results.push({ lgr: Math.round(lgr * 10) / 10, efficiency: r.efficiency, outletSO2: r.outletSO2, floodRatio: r.floodRatio, pressureDrop: r.pressureDrop });
    }
    return results;
  }

  static sweepDp(baseParams, dpMin = 0.5, dpMax = 6, steps = 12) {
    const results = [];
    for (let i = 0; i < steps; i++) {
      const dp = dpMin + (dpMax - dpMin) * i / (steps - 1);
      const r = calculate({ ...baseParams, dropletSize: Math.round(dp * 10) / 10 });
      results.push({ dp: Math.round(dp * 10) / 10, efficiency: r.efficiency, outletSO2: r.outletSO2, specificArea: r.specificArea });
    }
    return results;
  }
}

function calculate(params) {
  const framework = new TowerMassTransferFramework(params);
  return framework.computeProfile();
}

module.exports = {
  Thermodynamics,
  DropletPopulation,
  FloodingCriteria,
  TowerProfileLayer,
  TowerMassTransferFramework,
  EfficiencyEvaluator,
  ParameterOptimizer,
  calculate,
  H_SO2: Thermodynamics.H_SO2,
  K1_SO2: Thermodynamics.K1_SO2,
  K2_SO2: Thermodynamics.K2_SO2,
  enhancementFactor: Thermodynamics.enhancementFactor,
  specificSurfaceArea: (dp_mm) => new DropletPopulation(dp_mm, 99).weightedSpecificArea(),
  massTransferCoefficient: (dp_mm, u_gas) => new DropletPopulation(dp_mm, 99).weightedMassTransferCoefficient(u_gas),
  calculateFlooding: (LGR) => FloodingCriteria.floodingVelocity(LGR)
};
