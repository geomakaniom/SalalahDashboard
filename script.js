// -------------------------
// Salalah Dashboard - script.js
// -------------------------

// ----- CONFIG -----
const MAP_CENTER = [54.115, 17.019]; // tweak if you like
const MAP_ZOOM   = 12;

// Asset filenames (GeoJSON FeatureCollections) expected in data/ or Data/
const ASSET_FILES = [
  { id: 'street',         file: 'street.geojson',   type: 'line',
    paint: { 'line-color': '#2f4858', 'line-width': 1 } },

  { id: 'LightPoles',     file: 'LightPoles.geojson', type: 'circle',
    paint: { 'circle-radius': 3, 'circle-color': '#6a9fb5' } },

  { id: 'Manholes',       file: 'Manholes.geojson',   type: 'circle',
    paint: { 'circle-radius': 3, 'circle-color': '#b56576' } },

  { id: 'OTC',            file: 'OTC.geojson',        type: 'fill',
    paint: { 'fill-color': '#ffd166', 'fill-opacity': 0.35 } },

  { id: 'BusStops',       file: 'BusStops.geojson',   type: 'circle',
    paint: { 'circle-radius': 3, 'circle-color': '#118ab2' } },

  { id: 'ParkingLot',     file: 'ParkingLot.geojson', type: 'fill',
    paint: { 'fill-color': '#8ecae6', 'fill-opacity': 0.35 } },

  { id: 'Roundabout',     file: 'Roundabout.geojson', type: 'line',
    paint: { 'line-color': '#8d99ae', 'line-width': 1.5 } },

  { id: 'Bridges',        file: 'Bridges.geojson',    type: 'line',
    paint: { 'line-color': '#5e548e', 'line-width': 2 } },

  { id: 'Travel_Agencies',file: 'Travel_Agencies.geojson', type: 'circle',
    paint: { 'circle-radius': 3, 'circle-color': '#06d6a0' } },

  { id: 'GasStation',     file: 'GasStation.geojson', type: 'circle',
    paint: { 'circle-radius': 3, 'circle-color': '#ef476f' } },

  { id: 'Service_Stations', file: 'Service_Stations.geojson', type: 'circle',
    paint: { 'circle-radius': 3, 'circle-color': '#8338ec' } },

  { id: 'College',        file: 'College.geojson',    type: 'fill',
    paint: { 'fill-color': '#a0c4ff', 'fill-opacity': 0.35 } },

  { id: 'Nursery',        file: 'Nursery.geojson',    type: 'fill',
    paint: { 'fill-color': '#caffbf', 'fill-opacity': 0.35 } },

  { id: 'Schools',        file: 'Schools.geojson',    type: 'fill',
    paint: { 'fill-color': '#ffd6a5', 'fill-opacity': 0.35 } },
];

// Coverage files (ONLY for the right mini-map)
const PROCESSED_FILE = 'Processed.geojson';
const REMAINING_FILE = 'Remaining.geojson';

// Colors for coverage
const PROCESSED_COLOR = '#71b084';
const REMAINING_COLOR = '#bca3c2';
const OUTLINE_DARK    = '#3a3a3a';

// ----- UTILITIES -----
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

async function fetchJSON(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

// Try Data/ then data/
async function loadFile(file) {
  try { return await fetchJSON(`Data/${file}`); }
  catch (e1) {
    try { return await fetchJSON(`data/${file}`); }
    catch (e2) { console.error(`Missing file: Data/${file} and data/${file}`); throw e2; }
  }
}

function isFeatureCollection(gj) {
  return gj && gj.type === 'FeatureCollection' && Array.isArray(gj.features);
}

function boundsOfFC(gj) {
  if (!isFeatureCollection(gj) || gj.features.length === 0) return null;
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  const update = (c) => {
    const [x,y] = c;
    if (x<minX) minX=x; if (y<minY) minY=y;
    if (x>maxX) maxX=x; if (y>maxY) maxY=y;
  };
  const walk = (coords) => {
    if (typeof coords[0] === 'number') update(coords);
    else coords.forEach(walk);
  };
  gj.features.forEach(f => {
    const g = f.geometry;
    if (!g) return;
    if (g.type === 'Point') update(g.coordinates);
    else walk(g.coordinates);
  });
  return [[minX, minY], [maxX, maxY]];
}

// ----- MAPS -----
const map = new maplibregl.Map({
  container: 'map', style: osmRasterStyle(), center: MAP_CENTER, zoom: MAP_ZOOM
});

const miniMap = new maplibregl.Map({
  container: 'coverageMap', style: osmRasterStyle(), center: MAP_CENTER, zoom: MAP_ZOOM
});

// ----- LOAD ASSETS (LEFT MAP ONLY) -----
async function addAssetLayerToMain(def) {
  try {
    const gj = await loadFile(def.file);
    if (!isFeatureCollection(gj) || gj.features.length === 0) {
      console.warn(`Asset ${def.id}: empty or invalid, skipping.`);
      return;
    }
    const srcId = `asset-src-${def.id}`;
    const lyrId = `asset-lyr-${def.id}`;
    if (!map.getSource(srcId)) map.addSource(srcId, { type: 'geojson', data: gj });

    const base = { id: lyrId, source: srcId, paint: def.paint || {} };
    if (def.type === 'fill')      map.addLayer({ ...base, type: 'fill' });
    else if (def.type === 'line') map.addLayer({ ...base, type: 'line' });
    else                          map.addLayer({ ...base, type: 'circle' });

    console.log(`✔ Loaded asset: ${def.id} (${gj.features.length} features)`);
  } catch (err) {
    console.warn(`✖ Failed asset ${def.id}: ${def.file}`, err);
  }
}

async function loadAssets() {
  for (const def of ASSET_FILES) await addAssetLayerToMain(def);
}

// ----- LOAD COVERAGE (RIGHT MAP ONLY) -----
async function loadCoverage() {
  let processed = { type: 'FeatureCollection', features: [] };
  let remaining = { type: 'FeatureCollection', features: [] };

  try { processed = await loadFile(PROCESSED_FILE); } catch (e) { console.warn('Processed missing'); }
  try { remaining = await loadFile(REMAINING_FILE); } catch (e) { console.warn('Remaining missing'); }

  if (!isFeatureCollection(processed)) processed = { type:'FeatureCollection', features:[] };
  if (!isFeatureCollection(remaining)) remaining = { type:'FeatureCollection', features:[] };

  // sources
  if (!miniMap.getSource('processed')) miniMap.addSource('processed', { type:'geojson', data: processed });
  else miniMap.getSource('processed').setData(processed);

  if (!miniMap.getSource('remaining')) miniMap.addSource('remaining', { type:'geojson', data: remaining });
  else miniMap.getSource('remaining').setData(remaining);

  // layers (miniMap only)
  if (!miniMap.getLayer('processed_fill')) {
    miniMap.addLayer({ id:'processed_fill', type:'fill', source:'processed',
      paint: { 'fill-color': PROCESSED_COLOR, 'fill-opacity': 0.35 }});
    miniMap.addLayer({ id:'processed_line', type:'line', source:'processed',
      paint: { 'line-color': OUTLINE_DARK, 'line-width': 1 }});
  }
  if (!miniMap.getLayer('remaining_fill')) {
    miniMap.addLayer({ id:'remaining_fill', type:'fill', source:'remaining',
      paint: { 'fill-color': REMAINING_COLOR, 'fill-opacity': 0.35 }});
    miniMap.addLayer({ id:'remaining_line', type:'line', source:'remaining',
      paint: { 'line-color': OUTLINE_DARK, 'line-width': 1 }});
  }

  // fit to union bounds if possible
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

  // IMPORTANT: ensure coverage NEVER appears on the main map
  ['processed_fill','processed_line','remaining_fill','remaining_line'].forEach(id=>{
    if (map.getLayer(id)) map.removeLayer(id);
  });
  ['processed','remaining'].forEach(id=>{
    if (map.getSource(id)) map.removeSource(id);
  });

  console.log(`Coverage loaded. Processed: ${processed.features.length}, Remaining: ${remaining.features.length}`);
}

// ----- KPIs / CHARTS (safe no-crash stubs) -----
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function updateKPIs() {
  // You can compute from assets if you want; here we just set placeholders or keep existing numbers
  // Example: setText('kpi-total-assets', '18,537');
}

function drawCharts(processed = 0, remaining = 0) {
  // Only if Chart.js exists and elements exist
  const donutCanvas = document.getElementById('donutChart');
  if (window.Chart && donutCanvas) {
    const ctx = donutCanvas.getContext('2d');
    try { if (window._donut) window._donut.destroy(); } catch(e){}
    window._donut = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Processed km²','Remaining km²'],
        datasets: [{ data: [processed, remaining] }]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
  }
}

// ----- BOOT -----
async function boot() {
  // left map
  map.on('load', async () => {
    await loadAssets();
    updateKPIs();
  });

  // right map
  miniMap.on('load', async () => {
    await loadCoverage();
  });
}

boot();
