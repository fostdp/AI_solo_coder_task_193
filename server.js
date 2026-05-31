const express = require('express');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const { calculate: FGDCalculate, EfficiencyEvaluator, ParameterOptimizer } = require('./fgd-calc');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let db = null;
const DB_PATH = path.join(__dirname, 'data', 'fgd.db');

async function initDB() {
  const SQL = await initSqlJs();
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      liquid_gas_ratio REAL NOT NULL,
      inlet_so2 REAL NOT NULL,
      outlet_so2 REAL,
      efficiency REAL,
      ph_value REAL,
      gas_temp REAL DEFAULT 120,
      liquid_temp REAL DEFAULT 25,
      droplet_size REAL DEFAULT 2.5,
      specific_area REAL,
      k_gas REAL,
      flood_ratio REAL,
      pressure_drop REAL,
      layer_data TEXT,
      created_at DATETIME DEFAULT (datetime('now','localtime'))
    )
  `);

  const tableCols = db.exec("PRAGMA table_info(snapshots)");
  if (tableCols.length > 0) {
    const cols = tableCols[0].values.map(c => c[1]);
    if (!cols.includes('droplet_size')) {
      db.run("ALTER TABLE snapshots ADD COLUMN droplet_size REAL DEFAULT 2.5");
    }
    if (!cols.includes('specific_area')) {
      db.run("ALTER TABLE snapshots ADD COLUMN specific_area REAL");
    }
    if (!cols.includes('k_gas')) {
      db.run("ALTER TABLE snapshots ADD COLUMN k_gas REAL");
    }
    if (!cols.includes('flood_ratio')) {
      db.run("ALTER TABLE snapshots ADD COLUMN flood_ratio REAL");
    }
    if (!cols.includes('pressure_drop')) {
      db.run("ALTER TABLE snapshots ADD COLUMN pressure_drop REAL");
    }
    if (!cols.includes('layer_data')) {
      db.run("ALTER TABLE snapshots ADD COLUMN layer_data TEXT");
    }
    if (!cols.includes('dp_spread')) {
      db.run("ALTER TABLE snapshots ADD COLUMN dp_spread REAL DEFAULT 3.5");
    }
    if (!cols.includes('sauter_mean_dp')) {
      db.run("ALTER TABLE snapshots ADD COLUMN sauter_mean_dp REAL");
    }
  }

  saveDB();
}

function saveDB() {
  const data = db.export();
  const buf = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buf);
}

app.post('/api/simulate', (req, res) => {
  const { liquidGasRatio, inletSO2, gasTemp, liquidTemp, dropletSize } = req.body;
  const LGR = parseFloat(liquidGasRatio) || 10;
  const C_in = parseFloat(inletSO2) || 2000;
  const Tg = parseFloat(gasTemp) || 120;
  const Tl = parseFloat(liquidTemp) || 25;
  const dp = parseFloat(dropletSize) || 2.5;
  const dpSpread = parseFloat(req.body.dpSpread) || 3.5;

  const result = FGDCalculate({ 
    liquidGasRatio: LGR, 
    inletSO2: C_in, 
    gasTemp: Tg, 
    liquidTemp: Tl,
    dropletSize: dp,
    dpSpread: dpSpread
  });

  const layerJson = JSON.stringify(result.layers);

  db.run(
    `INSERT INTO snapshots (
      liquid_gas_ratio, 
      inlet_so2, 
      outlet_so2, 
      efficiency, 
      ph_value, 
      gas_temp, 
      liquid_temp,
      droplet_size,
      specific_area,
      k_gas,
      flood_ratio,
      pressure_drop,
      layer_data,
      dp_spread,
      sauter_mean_dp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      LGR, 
      C_in, 
      result.outletSO2, 
      result.efficiency, 
      result.pH, 
      Tg, 
      Tl,
      dp,
      result.specificArea,
      result.k_gas,
      result.floodRatio,
      result.pressureDrop,
      layerJson,
      dpSpread,
      result.sauterMeanDp
    ]
  );
  saveDB();

  res.json(result);
});

app.get('/api/snapshots', (req, res) => {
  const rows = [];
  const stmt = db.prepare('SELECT * FROM snapshots ORDER BY id DESC LIMIT 50');
  while (stmt.step()) {
    const obj = stmt.getAsObject();
    if (obj.layer_data) {
      try {
        obj.layer_data = JSON.parse(obj.layer_data);
      } catch (e) {
        obj.layer_data = null;
      }
    }
    rows.push(obj);
  }
  stmt.free();
  res.json(rows);
});

app.get('/api/snapshots/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const stmt = db.prepare('SELECT * FROM snapshots WHERE id = ?');
  stmt.bind([id]);
  if (stmt.step()) {
    const obj = stmt.getAsObject();
    if (obj.layer_data) {
      try {
        obj.layer_data = JSON.parse(obj.layer_data);
      } catch (e) {
        obj.layer_data = null;
      }
    }
    stmt.free();
    res.json(obj);
  } else {
    stmt.free();
    res.status(404).json({ error: 'not found' });
  }
});

app.post('/api/evaluate', (req, res) => {
  const result = FGDCalculate(req.body);
  const evaluation = EfficiencyEvaluator.evaluate(result);
  res.json({ result: { efficiency: result.efficiency, outletSO2: result.outletSO2, pH: result.pH, floodRatio: result.floodRatio, dropletSize: result.dropletSize, pressureDrop: result.pressureDrop }, evaluation });
});

app.post('/api/optimize', (req, res) => {
  const { targetEfficiency, ...baseParams } = req.body;
  const target = parseFloat(targetEfficiency) || 95;
  const optimization = ParameterOptimizer.optimize(baseParams, target);
  res.json(optimization);
});

app.post('/api/sweep/lgr', (req, res) => {
  const { lgrMin, lgrMax, steps, ...baseParams } = req.body;
  const results = ParameterOptimizer.sweepLGR(baseParams, parseFloat(lgrMin) || 3, parseFloat(lgrMax) || 30, parseInt(steps) || 12);
  res.json(results);
});

app.post('/api/sweep/dp', (req, res) => {
  const { dpMin, dpMax, steps, ...baseParams } = req.body;
  const results = ParameterOptimizer.sweepDp(baseParams, parseFloat(dpMin) || 0.5, parseFloat(dpMax) || 6, parseInt(steps) || 12);
  res.json(results);
});

app.delete('/api/snapshots', (req, res) => {
  db.run('DELETE FROM snapshots');
  saveDB();
  res.json({ ok: true });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = 3080;
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`FGD Spray Tower Sim running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('DB init error:', err);
});
