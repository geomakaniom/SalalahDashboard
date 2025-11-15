// ---------- CONFIG ----------
const MAP_CENTER = [54.115, 17.019];
const MAP_ZOOM   = 12;

// Asset layers to show on LEFT map.
// Each item: { id, file, type: 'fill'|'line'|'circle', paint: {...} }
const ASSET_FILES = [
  { id: 'street', file: 'street.geojson', type: 'line',
    paint: { 'line-color': '#2f4858', 'line-width': 1 } },

  { id: 'LightPoles', file: 'LightPoles.geojson', type: 'circle',
    paint: { 'circle-radius': 3, 'circle-color': '#6a9fb5' } },

  { id: 'Manholes', file: 'Manholes.geojson', type: 'circle',
    paint: { 'circle-radius': 3, 'circle-color': '#b56576' } },

  { id: 'OTC', file: 'OTC.geojson', type: 'fill',
    paint: { 'fill-color': '#ffd166', 'fill-opacity': 0.35 } },

  { id: 'BusStops', file: 'BusStops.geojson', type: 'circle',
    paint: { 'circle-radius': 3, 'circle-color': '#118ab2' } },

  { id: 'ParkingLot', file: 'ParkingLot.geojson', type: 'fill',
    paint: { 'fill-color': '#8ecae6', 'fill-opacity': 0.35 } },

  { id: 'Roundabout', file: 'Roundabout.geojson', type: 'line',
    paint: { 'line-color': '#8d99ae', 'line-width': 1.5 } },

  { id: 'Bridges', file: 'Bridges.geojson', type: 'line',
    paint: { 'line-color': '#5e548e', 'line-width': 2 } },

  { id: 'Travel_Agencies', file: 'Travel_Agencies.geojson', type: 'circle',
    paint: { 'circle-radius': 3, 'circle-color': '#06d6a0' } },

  { id: 'GasStation', file: 'GasStation.geojson', type: 'circle',
    paint: { 'circle-radius': 3, 'circle-color': '#ef476f' } },

  { id: 'Service_Stations', file: 'Service_Stations.geojson', type: 'circle',
    paint: { 'circle-radius': 3, 'circle-color': '#8338ec' } },

  { id: 'College', file: 'College.geojson', type: 'fill',
    paint: { 'fill-color': '#a0c4ff', 'fill-opacity': 0.35 } },

  { id: 'Nursery', file: 'Nursery.geojson', type: 'fill',
    paint: { 'fill-color': '#caffbf', 'fill-opacity': 0.35 } },

  { id: 'Schools', file: 'Schools.geojson', type: 'fill',
    paint: { 'fill-color': '#ffd6a5', 'fill-opacity': 0.35 } },
];

// Coverage files (RIGHT mini-map only)
const PROCESSED_FILE = 'Processed.geojson';
const REMAINING_FILE = 'Remaining.geojson';

// Coverage colors
const PROCESSED_COLOR = '#71b084';
const REMAINING_COLOR = '#bca3c2';
const OUTLINE_COLOR   = '#3a3a3a';

// ---------- BASE STYLE ----------
function osmRasterStyle() {
  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors'
      }
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
  };
}

// ---------- HELPERS ----------
async function fetchJSON(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

// Try Data/ first then data/ (case-safe on GitHub Pages)
async function loadFile(file) {
  try { return await fetchJSON(`Data/${file}`); }
  catch (e1) {
    try { return await fetchJSON(`data/${file}`); }
    catch (e2) {
      console.error(`Missing file in both paths: Data/${file} and data/${file}`);
      throw e2;
    }
  }
}

function isFC(gj) {
  return gj && gj.type === 'FeatureCollection' && Array.isArray(gj.features);
}

function boundsOfFC(gj) {
  if (!isFC(gj) || gj.features.length === 0) return null;
  let minX =  Infinity, minY =  Infinity, maxX = -Infinity, maxY = -Infinity;

  const upd = ([x, y]) => { if (x<minX) minX=x; if (y<minY) minY=y; if (x>maxX) maxX=x; if (y>maxY) maxY=y; };
  const walk = (c) => (typeof c[0] === 'number') ? upd(c) : c.forEach(walk);

  gj.features.forEach(f => {
    const g = f.geometry;
    if (!g) return;
    if (g.type === 'Point') upd(g.coordinates);
    else walk(g.coordinates);
  });
  return [[minX, minY], [maxX, maxY]];
}

// ---------- MAPS ----------
const map = new maplibregl.Map({
  container: 'map',
  style: osmRasterStyle(),
  center: MAP_CENTER,
  zoom: MAP_ZOOM
});

const miniMap = new maplibregl.Map({
  container: 'coverageMap',
  style: osmRasterStyle(),
  center: MAP_CENTER,
  zoom: MAP_ZOOM
});

// ---------- HARD BLOCK: NO COVERAGE ON LEFT MAP ----------
function nukeCoverageOnMain() {
  const style = map.getStyle();
  if (!style || !style.layers) return;

  // Remove any layer that mentions processed/remaining (case-insensitive)
  style.layers
    .map(l => l.id)
    .filter(id => /processed|remaining/i.test(id))
    .forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });

  // Remove common source ids
  ['processed','remaining','processed_src','remaining_src']
    .forEach(s => { if (map.getSource(s)) map.removeSource(s); });
}
map.on('load', nukeCoverageOnMain);
['styledata','sourcedata','idle'].forEach(evt => map.on(evt, nukeCoverageOnMain));
// Sweep a few seconds after load in case anything tries to re-add
const _nukeTimer = setInterval(nukeCoverageOnMain, 1000);
setTimeout(() => clearInterval(_nukeTimer), 8000);

// ---------- LEFT MAP: ASSETS ONLY ----------
async function addAsset(def) {
  try {
    const gj = await loadFile(def.file);
    if (!isFC(gj) || gj.features.length === 0) {
      console.warn(`Asset ${def.id}: empty/invalid → skipped`);
      return;
    }
    const srcId = `asset-src-${def.id}`;
    const lyrId = `asset-lyr-${def.id}`;

    if (!map.getSource(srcId)) map.addSource(srcId, { type: 'geojson', data: gj });

    const base = { id: lyrId, source: srcId, paint: def.paint || {} };
    if (def.type === 'fill')      map.addLayer({ ...base, type: 'fill' });
    else if (def.type === 'line') map.addLayer({ ...base, type: 'line' });
    else                          map.addLayer({ ...base, type: 'circle' });

    console.log(`✔ asset loaded: ${def.id} (${gj.features.length})`);
  } catch (err) {
    console.warn(`✖ asset failed: ${def.id} (${def.file})`, err);
  }
}

async function loadAssets() {
  for (const def of ASSET_FILES) {
    await addAsset(def);
  }
}

// ---------- RIGHT MINI-MAP: COVERAGE ONLY ----------
async function loadCoverage() {
  let processed = { type: 'FeatureCollection', features: [] };
  let remaining = { type: 'FeatureCollection', features: [] };

  try { processed = await loadFile(PROCESSED_FILE); } catch { console.warn('Processed missing'); }
  try { remaining = await loadFile(REMAINING_FILE); } catch { console.warn('Remaining missing'); }

  if (!isFC(processed)) processed = { type: 'FeatureCollection', features: [] };
  if (!isFC(remaining)) remaining = { type: 'FeatureCollection', features: [] };

  // Sources
  if (!miniMap.getSource('processed'))
    miniMap.addSource('processed', { type: 'geojson', data: processed });
  else
    miniMap.getSource('processed').setData(processed);

  if (!miniMap.getSource('remaining'))
    miniMap.addSource('remaining', { type: 'geojson', data: remaining });
  else
    miniMap.getSource('remaining').setData(remaining);

  // Layers
  if (!miniMap.getLayer('processed_fill')) {
    miniMap.addLayer({
      id: 'processed_fill',
      type: 'fill',
      source: 'processed',
      paint: { 'fill-color': PROCESSED_COLOR, 'fill-opacity': 0.35 }
    });
    miniMap.addLayer({
      id: 'processed_line',
      type: 'line',
      source: 'processed',
      paint: { 'line-color': OUTLINE_COLOR, 'line-width': 1 }
    });
  }
  if (!miniMap.getLayer('remaining_fill')) {
    miniMap.addLayer({
      id: 'remaining_fill',
      type: 'fill',
      source: 'remaining',
      paint: { 'fill-color': REMAINING_COLOR, 'fill-opacity': 0.35 }
    });
    miniMap.addLayer({
      id: 'remaining_line',
      type: 'line',
      source: 'remaining',
      paint: { 'line-color': OUTLINE_COLOR, 'line-width': 1 }
    });
  }

  // Fit to union bounds if available
  const pb = boundsOfFC(processed);
  const rb = boundsOfFC(remaining);
  const all = [pb, rb].filter(Boolean);
  if (all.length) {
    const minX = Math.min(...all.map(b => b[0][0]));
    const minY = Math.min(...all.map(b => b[0][1]));
    const maxX = Math.max(...all.map(b => b[1][0]));
    const maxY = Math.max(...all.map(b => b[1][1]));
    miniMap.fitBounds([[minX, minY], [maxX, maxY]], { padding: 20, duration: 0 });
  }

  // Double-ensure nothing leaks to the left map
  nukeCoverageOnMain();
  console.log(`Coverage → miniMap. Processed: ${processed.features.length}, Remaining: ${remaining.features.length}`);
}

// ---------- KPIs / CHARTS (optional safe stubs) ----------
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
function updateKPIs() {
  // Example: setText('kpi-total-assets', '—');
}
function drawCharts(proc = 0, rem = 0) {
  const canvas = document.getElementById('donutChart');
  if (!window.Chart || !canvas) return;
  const ctx = canvas.getContext('2d');
  try { if (window._donut) window._donut.destroy(); } catch {}
  window._donut = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: ['Processed','Remaining'], datasets: [{ data: [proc, rem] }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
  });
}

// ---------- BOOT ----------
async function boot() {
  map.on('load', async () => {
    await loadAssets();     // LEFT map: assets only
    nukeCoverageOnMain();   // keep it clean
    updateKPIs();
  });

  miniMap.on('load', async () => {
    await loadCoverage();   // RIGHT map: coverage only
  });
}
boot();
