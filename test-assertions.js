const { calculate } = require('./fgd-calc');
const http = require('http');

const BASE = 'http://localhost:3080';

let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;
const failures = [];

function assert(condition, label, detail) {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`  ✓ ${label}`);
  } else {
    failedAssertions++;
    const msg = detail || '';
    console.log(`  ✗ ${label}${msg ? ' — ' + msg : ''}`);
    failures.push({ label, detail: msg });
  }
}

function assertGT(a, b, label, detail) {
  totalAssertions++;
  if (a > b) {
    passedAssertions++;
    console.log(`  ✓ ${label} (${a.toFixed(2)} > ${b.toFixed(2)})`);
  } else {
    failedAssertions++;
    const msg = detail || `实际值 ${a.toFixed(2)} 未大于 ${b.toFixed(2)}`;
    console.log(`  ✗ ${label} — ${msg}`);
    failures.push({ label, detail: msg });
  }
}

function assertGTE(a, b, label, detail) {
  totalAssertions++;
  if (a >= b) {
    passedAssertions++;
    console.log(`  ✓ ${label} (${a.toFixed(2)} >= ${b.toFixed(2)})`);
  } else {
    failedAssertions++;
    const msg = detail || `实际值 ${a.toFixed(2)} 未达到 ${b.toFixed(2)}`;
    console.log(`  ✗ ${label} — ${msg}`);
    failures.push({ label, detail: msg });
  }
}

function assertLT(a, b, label, detail) {
  totalAssertions++;
  if (a < b) {
    passedAssertions++;
    console.log(`  ✓ ${label} (${a.toFixed(2)} < ${b.toFixed(2)})`);
  } else {
    failedAssertions++;
    const msg = detail || `实际值 ${a.toFixed(2)} 未小于 ${b.toFixed(2)}`;
    console.log(`  ✗ ${label} — ${msg}`);
    failures.push({ label, detail: msg });
  }
}

function assertLTE(a, b, label, detail) {
  totalAssertions++;
  if (a <= b) {
    passedAssertions++;
    console.log(`  ✓ ${label} (${a.toFixed(2)} <= ${b.toFixed(2)})`);
  } else {
    failedAssertions++;
    const msg = detail || `实际值 ${a.toFixed(2)} 未小于等于 ${b.toFixed(2)}`;
    console.log(`  ✗ ${label} — ${msg}`);
    failures.push({ label, detail: msg });
  }
}

function assertApproxEqual(a, b, eps, label) {
  totalAssertions++;
  if (Math.abs(a - b) <= eps) {
    passedAssertions++;
    console.log(`  ✓ ${label} (${a.toFixed(4)} ≈ ${b.toFixed(4)}, ε=${eps})`);
  } else {
    failedAssertions++;
    const msg = `差值 ${Math.abs(a - b).toFixed(6)} 超出容差 ${eps}`;
    console.log(`  ✗ ${label} — ${msg}`);
    failures.push({ label, detail: msg });
  }
}

function postJSON(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(path, BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    const req = http.request(opts, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); }
        catch (e) { reject(new Error('Parse error: ' + buf.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getJSON(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    http.get(url, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); }
        catch (e) { reject(new Error('Parse error: ' + buf.slice(0, 200))); }
      });
    }).on('error', reject);
  });
}

function deleteJSON(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = { hostname: url.hostname, port: url.port, path: url.pathname, method: 'DELETE' };
    const req = http.request(opts, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve({}); } });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runAll() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║          烟气脱硫喷淋塔模拟 — 三项核心断言测试                   ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  const baseParams = {
    liquidGasRatio: 10,
    inletSO2: 2000,
    gasTemp: 120,
    liquidTemp: 25
  };

  /* ================================================================
   *  测试1：液滴粒径从 0.5→3 mm 变化时，脱硫效率应随粒径减小而提升
   * ================================================================ */
  console.log('━━━ 测试1：液滴粒径 0.5→3 mm，效率应随粒径减小而单调提升 ━━━\n');

  const dpValues = [3.0, 2.5, 2.0, 1.5, 1.0, 0.5];
  const dpResults = dpValues.map(dp => {
    const r = calculate({ ...baseParams, dropletSize: dp });
    return { dp, efficiency: r.efficiency, outletSO2: r.outletSO2, specificArea: r.specificArea, k_gas: r.k_gas, layers: r.layers };
  });

  console.log('  粒径扫描结果:');
  dpResults.forEach(r => {
    console.log(`    dp=${r.dp}mm → 效率 ${r.efficiency.toFixed(2)}%, 出口SO₂ ${r.outletSO2.toFixed(1)} ppm, 比表面积 ${r.specificArea.toFixed(1)} m²/m³, k_g ${r.k_gas.toFixed(6)} m/s`);
  });
  console.log('');

  console.log('  断言 1.1：每个粒径点的效率都应 > 0');
  dpResults.forEach(r => {
    assertGT(r.efficiency, 0, `dp=${r.dp}mm efficiency=${r.efficiency.toFixed(2)}% > 0`);
  });

  console.log('\n  断言 1.2：粒径从大变小，效率应严格递增（单调性）');
  for (let i = 1; i < dpResults.length; i++) {
    const prev = dpResults[i - 1];
    const curr = dpResults[i];
    assertGT(
      curr.efficiency, prev.efficiency,
      `eff(dp=${curr.dp}mm) > eff(dp=${prev.dp}mm)`,
      `eff(${curr.dp})=${curr.efficiency.toFixed(2)}% 未大于 eff(${prev.dp})=${prev.efficiency.toFixed(2)}%`
    );
  }

  console.log('\n  断言 1.3：粒径从大变小，出口SO₂应严格递减');
  for (let i = 1; i < dpResults.length; i++) {
    const prev = dpResults[i - 1];
    const curr = dpResults[i];
    assertLT(
      curr.outletSO2, prev.outletSO2,
      `outlet(dp=${curr.dp}mm) < outlet(dp=${prev.dp}mm)`,
      `outlet(${curr.dp})=${curr.outletSO2.toFixed(1)} 未小于 outlet(${prev.dp})=${prev.outletSO2.toFixed(1)}`
    );
  }

  console.log('\n  断言 1.4：比表面积随粒径减小而增大');
  for (let i = 1; i < dpResults.length; i++) {
    const prev = dpResults[i - 1];
    const curr = dpResults[i];
    assertGT(
      curr.specificArea, prev.specificArea,
      `a(dp=${curr.dp}mm) > a(dp=${prev.dp}mm)`,
      `a(${curr.dp})=${curr.specificArea.toFixed(1)} 未大于 a(${prev.dp})=${prev.specificArea.toFixed(1)}`
    );
  }

  console.log('\n  断言 1.5：最小粒径(0.5mm)与最大粒径(3mm)效率差应显著(≥3个百分点)');
  const effDelta = dpResults[dpResults.length - 1].efficiency - dpResults[0].efficiency;
  assertGTE(effDelta, 3, `eff(0.5mm)-eff(3mm)=${effDelta.toFixed(2)}pp ≥ 3`,
    `效率差仅 ${effDelta.toFixed(2)} 个百分点，粒径影响不够显著`);

  console.log('\n  断言 1.6：比表面积应与粒径成反比关系验证 a∝1/dp');
  for (let i = 1; i < dpResults.length; i++) {
    const prev = dpResults[i - 1];
    const curr = dpResults[i];
    const ratio_a = curr.specificArea / prev.specificArea;
    const ratio_dp = prev.dp / curr.dp;
    assertApproxEqual(ratio_a, ratio_dp, 0.05,
      `a(${curr.dp})/a(${prev.dp}) ≈ dp(${prev.dp})/dp(${curr.dp}) → ${ratio_a.toFixed(4)} ≈ ${ratio_dp.toFixed(4)}`);
  }

  /* ================================================================
   *  测试2：液气比从 5→20 L/m³ 变化时，出口SO₂浓度应下降
   * ================================================================ */
  console.log('\n━━━ 测试2：液气比 5→20 L/m³，出口SO₂应随液气比增大而下降 ━━━\n');

  const lgrValues = [5, 8, 10, 12, 15, 20];
  const lgrResults = lgrValues.map(lgr => {
    const r = calculate({ ...baseParams, liquidGasRatio: lgr, dropletSize: 2.5 });
    return { lgr, efficiency: r.efficiency, outletSO2: r.outletSO2, pH: r.pH, floodRatio: r.floodRatio, pressureDrop: r.pressureDrop, layers: r.layers };
  });

  console.log('  液气比扫描结果:');
  lgrResults.forEach(r => {
    console.log(`    LGR=${r.lgr} L/m³ → 出口SO₂ ${r.outletSO2.toFixed(1)} ppm, 效率 ${r.efficiency.toFixed(2)}%, pH ${r.pH.toFixed(2)}, 液泛比 ${r.floodRatio.toFixed(2)}`);
  });
  console.log('');

  console.log('  断言 2.1：每个液气比点的出口SO₂都应 < 入口SO₂(2000ppm)');
  lgrResults.forEach(r => {
    assertLT(r.outletSO2, 2000, `LGR=${r.lgr}: outlet(${r.outletSO2.toFixed(1)}) < 2000ppm`,
      `出口SO₂ ${r.outletSO2.toFixed(1)} 未小于入口 2000ppm`);
  });

  console.log('\n  断言 2.2：液气比从小到大，出口SO₂应单调递减');
  for (let i = 1; i < lgrResults.length; i++) {
    const prev = lgrResults[i - 1];
    const curr = lgrResults[i];
    assertLTE(
      curr.outletSO2, prev.outletSO2,
      `LGR=${curr.lgr}: outlet(${curr.outletSO2.toFixed(1)}) ≤ LGR=${prev.lgr}: outlet(${prev.outletSO2.toFixed(1)})`,
      `LGR=${curr.lgr}出口 ${curr.outletSO2.toFixed(1)}ppm 未低于 LGR=${prev.lgr}出口 ${prev.outletSO2.toFixed(1)}ppm`
    );
  }

  console.log('\n  断言 2.3：液气比从小到大，效率应单调递增');
  for (let i = 1; i < lgrResults.length; i++) {
    const prev = lgrResults[i - 1];
    const curr = lgrResults[i];
    assertGTE(
      curr.efficiency, prev.efficiency,
      `LGR=${curr.lgr}: eff(${curr.efficiency.toFixed(2)}%) ≥ LGR=${prev.lgr}: eff(${prev.efficiency.toFixed(2)}%)`,
      `LGR=${curr.lgr}效率 ${curr.efficiency.toFixed(2)}% 未高于 LGR=${prev.lgr}效率 ${prev.efficiency.toFixed(2)}%`
    );
  }

  console.log('\n  断言 2.4：LGR=20 vs LGR=5 出口SO₂降幅应显著(出口浓度下降≥30%)');
  const so2_at_5 = lgrResults.find(r => r.lgr === 5).outletSO2;
  const so2_at_20 = lgrResults.find(r => r.lgr === 20).outletSO2;
  const so2_reduction_pct = ((so2_at_5 - so2_at_20) / so2_at_5) * 100;
  assertGTE(so2_reduction_pct, 30,
    `SO₂降幅 ${(so2_reduction_pct).toFixed(1)}% ≥ 30%`,
    `SO₂降幅仅 ${so2_reduction_pct.toFixed(1)}%，液气比影响不够显著`);

  console.log('\n  断言 2.5：LGR=20 出口SO₂应明显低于 LGR=5');
  assertLT(so2_at_20, so2_at_5,
    `LGR=20出口(${so2_at_20.toFixed(1)}) < LGR=5出口(${so2_at_5.toFixed(1)})`,
    `LGR=20出口 ${so2_at_20.toFixed(1)}ppm 未低于 LGR=5出口 ${so2_at_5.toFixed(1)}ppm`);

  /* ================================================================
   *  测试3：后端效率快照已增加沿塔浓度剖面数值
   * ================================================================ */
  console.log('\n━━━ 测试3：后端快照 layer_data 包含沿塔浓度剖面数值 ━━━\n');

  await deleteJSON('/api/snapshots');

  console.log('  3-A：通过 POST /api/simulate 提交一次模拟，检查返回数据\n');

  const simBody = { liquidGasRatio: 10, inletSO2: 2000, gasTemp: 120, liquidTemp: 25, dropletSize: 2.5 };
  let simRes;
  try {
    simRes = await postJSON('/api/simulate', simBody);
  } catch (e) {
    console.log(`  ✗ 无法连接服务器 (${e.message})，跳过HTTP测试`);
    simRes = null;
  }

  if (simRes) {
    console.log(`  模拟返回: 效率=${simRes.efficiency}%, 出口SO₂=${simRes.outletSO2}ppm\n`);

    console.log('  断言 3.1：返回结果包含 layers 数组');
    assert(Array.isArray(simRes.layers), 'simRes.layers 是数组',
      `实际类型: ${typeof simRes.layers}`);

    if (Array.isArray(simRes.layers)) {
      console.log('\n  断言 3.2：layers 数组长度为 20（20层沿塔剖面）');
      assert(simRes.layers.length === 20, `layers.length === 20`,
        `实际长度: ${simRes.layers.length}`);

      console.log('\n  断言 3.3：每层数据包含 C_g（气相浓度）、pH、transferRate、KGa 字段');
      const requiredFields = ['layer', 'height', 'C_g', 'pH', 'transferRate', 'KGa'];
      const firstLayer = simRes.layers[0];
      requiredFields.forEach(field => {
        assert(firstLayer[field] !== undefined && firstLayer[field] !== null,
          `layers[0].${field} 存在`,
          `layers[0] 中缺少 ${field} 字段`);
      });

      console.log('\n  断言 3.4：C_g 沿塔从底部到顶部递减（SO₂被逐步吸收）');
      let cgMonotonic = true;
      let cgFailDetail = '';
      for (let i = 1; i < simRes.layers.length; i++) {
        if (simRes.layers[i].C_g > simRes.layers[i - 1].C_g + 0.01) {
          cgMonotonic = false;
          cgFailDetail = `层${i} C_g=${simRes.layers[i].C_g.toFixed(2)} > 层${i - 1} C_g=${simRes.layers[i - 1].C_g.toFixed(2)}`;
          break;
        }
      }
      assert(cgMonotonic, 'C_g 沿塔单调递减', cgFailDetail);

      console.log('\n  断言 3.5：height 字段从0.75递增到15（15m塔高/20层）');
      assertGTE(simRes.layers[0].height, 0.5, `首层高度 ${simRes.layers[0].height} ≥ 0.5m`);
      const lastLayer = simRes.layers[simRes.layers.length - 1];
      assertApproxEqual(lastLayer.height, 15.0, 0.1, `末层高度 ≈ 15m (实际 ${lastLayer.height})`);

      console.log('\n  断言 3.6：C_g 值为数值类型，不是图像/字符串');
      simRes.layers.forEach((layer, idx) => {
        assert(typeof layer.C_g === 'number' && isFinite(layer.C_g),
          `layers[${idx}].C_g 为有限数值`,
          `类型=${typeof layer.C_g}, 值=${layer.C_g}`);
      });

      console.log('\n  断言 3.7：C_g 首层值接近入口浓度(2000ppm)');
      assertApproxEqual(simRes.layers[0].C_g, 2000, 500,
        `首层C_g=${simRes.layers[0].C_g.toFixed(1)} 应接近2000ppm`);

      console.log('\n  断言 3.8：C_g 末层值明显小于首层');
      assertLT(lastLayer.C_g, simRes.layers[0].C_g,
        `末层C_g(${lastLayer.C_g.toFixed(1)}) < 首层C_g(${simRes.layers[0].C_g.toFixed(1)})`,
        `末层C_g(${lastLayer.C_g.toFixed(1)}) 未小于首层(${simRes.layers[0].C_g.toFixed(1)})`);
    }

    console.log('\n  3-B：通过 GET /api/snapshots/:id 验证存储的沿塔剖面数据\n');

    console.log('  断言 3.9：GET /api/snapshots 返回至少1条快照');
    let snapshots;
    try {
      snapshots = await getJSON('/api/snapshots');
    } catch (e) {
      snapshots = [];
    }
    assert(snapshots.length >= 1, `快照数 ≥ 1`, `实际快照数: ${snapshots.length}`);

    if (snapshots.length >= 1) {
      const snap = snapshots[0];

      console.log('\n  断言 3.10：快照包含 layer_data 字段');
      assert(snap.layer_data !== undefined && snap.layer_data !== null,
        'snap.layer_data 存在',
        `layer_data=${snap.layer_data}`);

      console.log('\n  断言 3.11：layer_data 是数组（已从JSON解析）');
      assert(Array.isArray(snap.layer_data), 'snap.layer_data 是数组',
        `实际类型: ${typeof snap.layer_data}`);

      if (Array.isArray(snap.layer_data)) {
        console.log('\n  断言 3.12：layer_data 长度为20');
        assert(snap.layer_data.length === 20, `layer_data.length === 20`,
          `实际长度: ${snap.layer_data.length}`);

        console.log('\n  断言 3.13：layer_data 每层包含 C_g 数值字段');
        const hasAllCg = snap.layer_data.every((l, i) => {
          const ok = typeof l.C_g === 'number' && isFinite(l.C_g);
          if (!ok) console.log(`    → 层${i}: C_g=${l.C_g}, type=${typeof l.C_g}`);
          return ok;
        });
        assert(hasAllCg, '所有层 C_g 为有限数值', '部分层 C_g 不是有效数值');

        console.log('\n  断言 3.14：layer_data 每层包含 pH 数值字段');
        const hasAllPH = snap.layer_data.every((l, i) => {
          const ok = typeof l.pH === 'number' && isFinite(l.pH);
          if (!ok) console.log(`    → 层${i}: pH=${l.pH}, type=${typeof l.pH}`);
          return ok;
        });
        assert(hasAllPH, '所有层 pH 为有限数值', '部分层 pH 不是有效数值');

        console.log('\n  断言 3.15：layer_data 每层包含 transferRate 数值字段');
        const hasAllTR = snap.layer_data.every((l, i) => {
          const ok = typeof l.transferRate === 'number' && isFinite(l.transferRate);
          if (!ok) console.log(`    → 层${i}: transferRate=${l.transferRate}, type=${typeof l.transferRate}`);
          return ok;
        });
        assert(hasAllTR, '所有层 transferRate 为有限数值', '部分层 transferRate 不是有效数值');

        console.log('\n  断言 3.16：layer_data 每层包含 KGa 数值字段');
        const hasAllKGa = snap.layer_data.every((l, i) => {
          const ok = typeof l.KGa === 'number' && isFinite(l.KGa);
          if (!ok) console.log(`    → 层${i}: KGa=${l.KGa}, type=${typeof l.KGa}`);
          return ok;
        });
        assert(hasAllKGa, '所有层 KGa 为有限数值', '部分层 KGa 不是有效数值');
      }

      console.log('\n  断言 3.17：快照包含 droplet_size 字段');
      assert(snap.droplet_size !== undefined && snap.droplet_size !== null,
        `snap.droplet_size 存在 (值=${snap.droplet_size})`,
        `droplet_size 字段缺失`);

      console.log('\n  断言 3.18：快照包含 flood_ratio 字段');
      assert(snap.flood_ratio !== undefined && snap.flood_ratio !== null,
        `snap.flood_ratio 存在 (值=${snap.flood_ratio})`,
        `flood_ratio 字段缺失`);

      console.log('\n  断言 3.19：通过 GET /api/snapshots/:id 获取单条快照详情');
      let detail;
      try {
        detail = await getJSON(`/api/snapshots/${snap.id}`);
      } catch (e) {
        detail = null;
      }
      assert(detail !== null && detail.id === snap.id,
        `GET /api/snapshots/${snap.id} 返回正确记录`,
        `返回数据: ${JSON.stringify(detail).slice(0, 100)}`);

      if (detail && Array.isArray(detail.layer_data)) {
        console.log('\n  断言 3.20：单条快照的 layer_data 与模拟返回的 layers 结构一致');
        const simFields = ['layer', 'height', 'C_g', 'pH', 'transferRate', 'KGa'].sort();
        const snapFields = Object.keys(detail.layer_data[0] || {}).sort();
        const fieldsMatch = simFields.every(f => snapFields.includes(f));
        assert(fieldsMatch, '快照 layer_data 字段与模拟返回一致',
          `模拟字段: ${simFields.join(',')}, 快照字段: ${snapFields.join(',')}`);
      }
    }
  }

  /* ================================================================
   *  汇总
   * ================================================================ */
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('  汇总：总断言 %d | 通过 %d | 失败 %d', totalAssertions, passedAssertions, failedAssertions);
  console.log('══════════════════════════════════════════════════════════════════');

  if (failures.length > 0) {
    console.log('\n  ✗ 失败用例明细:');
    console.log('  ┌────────────────────────────────────────────────────────────────┐');
    failures.forEach((f, i) => {
      console.log(`  │ ${i + 1}. ${f.label}`);
      if (f.detail) console.log(`  │    → ${f.detail}`);
    });
    console.log('  └────────────────────────────────────────────────────────────────┘');
  } else {
    console.log('\n  ✓ 全部断言通过，无失败用例。');
  }

  const exitCode = failedAssertions > 0 ? 1 : 0;
  process.exit(exitCode);
}

runAll().catch(e => {
  console.error('测试执行异常:', e);
  process.exit(2);
});
