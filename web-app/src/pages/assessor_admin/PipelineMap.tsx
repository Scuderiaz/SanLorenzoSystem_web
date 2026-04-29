import React, { useEffect, useRef, useState } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import './PipelineMap.css';

// ── Types ──────────────────────────────────────────────────────────────────
type Mode = 'junction' | 'mainline' | 'pipe' | 'consumer';
type ConsumerType = 'Residential' | 'Commercial' | 'Institutional';

interface JunctionPoint {
  id: number;
  lat: number;
  lng: number;
  marker: any;
}

interface PipeLine {
  from: number;
  to: number;
  line: any;
  type: 'mainline' | 'pipe';
}

interface Consumer {
  lat: number;
  lng: number;
  type: ConsumerType;
  marker: any;
}

// ── Barangay data ──────────────────────────────────────────────────────────
const barangays = [
  { name: 'Daculang Bolo', lat: 14.0723, lng: 122.9126, zones: 'Zone 1 & 2',      meters: 272,  color: '#1a237e' },
  { name: 'Dagotdotan',    lat: 14.0680, lng: 122.9050, zones: 'Zone 2, 3 & 4',   meters: 171,  color: '#1565c0' },
  { name: 'Laniton',       lat: 14.0750, lng: 122.8980, zones: 'Zone 3',           meters: 116,  color: '#0277bd' },
  { name: 'Langga',        lat: 14.0610, lng: 122.8920, zones: 'Zone 4',           meters: 44,   color: '#00695c' },
  { name: 'Maisog',        lat: 14.0420, lng: 122.9200, zones: 'Zone 5',           meters: 147,  color: '#2e7d32' },
  { name: 'Mampurog',      lat: 14.0459, lng: 122.8851, zones: 'Zone 4, 5, 6 & 7',meters: 528,  color: '#e65100' },
  { name: 'Matacong',      lat: 14.0380, lng: 122.8750, zones: 'Zone 8, 9 & 10',  meters: 540,  color: '#b71c1c' },
  { name: 'San Isidro',    lat: 14.0300, lng: 122.8650, zones: 'Zone 11',          meters: null, color: '#6a1b9a' },
  { name: 'San Ramon',     lat: 14.0250, lng: 122.8550, zones: 'Zone 12',          meters: null, color: '#4a148c' },
];

const consumerColors: Record<ConsumerType, string> = {
  Residential:   '#1565c0',
  Commercial:    '#e65100',
  Institutional: '#2e7d32',
};

const ZONE_PILLS = [
  { label: 'All',     color: '#1a237e' },
  { label: 'Zone 1',  color: '#1a237e' },
  { label: 'Zone 2',  color: '#1565c0' },
  { label: 'Zone 3',  color: '#0277bd' },
  { label: 'Zone 4',  color: '#00695c' },
  { label: 'Zone 5',  color: '#2e7d32' },
  { label: 'Zone 6',  color: '#558b2f' },
  { label: 'Zone 7',  color: '#f57f17' },
  { label: 'Zone 8',  color: '#e65100' },
  { label: 'Zone 9',  color: '#bf360c' },
  { label: 'Zone 10', color: '#b71c1c' },
  { label: 'Zone 11', color: '#6a1b9a' },
  { label: 'Zone 12', color: '#4a148c' },
];

// ── Component ──────────────────────────────────────────────────────────────
const PipelineMap: React.FC = () => {
  const mapRef = useRef<any>(null);
  const mapInitialized = useRef(false);

  const [mode, setMode] = useState<Mode>('junction');
  const [status, setStatus] = useState('Tip: Place junction points first, then draw pipes between them.');
  const [activeZone, setActiveZone] = useState('All');

  // Mutable state stored in refs to avoid stale closures inside Leaflet handlers
  const junctionsRef = useRef<JunctionPoint[]>([]);
  const pipesRef     = useRef<PipeLine[]>([]);
  const consumersRef = useRef<Consumer[]>([]);
  const historyRef   = useRef<{ type: string; ref: any }[]>([]);
  const pipeStartRef = useRef<JunctionPoint | null>(null);
  const junctionCountRef = useRef(0);
  const modeRef = useRef<Mode>('junction');

  // Keep modeRef in sync
  const changeMode = (m: Mode) => {
    setMode(m);
    modeRef.current = m;
    pipeStartRef.current = null;
    const labels: Record<Mode, string> = {
      junction: 'Click on the map to place a junction point.',
      mainline:  'Click a junction → another junction to draw the MAIN line (thick cyan).',
      pipe:      'Click a junction → another junction to draw a branch pipe.',
      consumer:  'Click on the map to place a consumer connection point.',
    };
    setStatus(labels[m]);
  };

  // Stats derived from refs — we use a counter to force re-render
  const [tick, setTick] = useState(0);
  const forceUpdate = () => setTick(t => t + 1);

  useEffect(() => {
    if (mapInitialized.current) return;
    mapInitialized.current = true;

    // Dynamically load Leaflet CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(link);

    // Dynamically load Leaflet JS
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    script.onload = () => initMap();
    document.head.appendChild(script);
  }, []);

  const initMap = () => {
    const L = (window as any).L;
    if (!L) return;

    const map = L.map('pipeline-leaflet-map').setView([14.065, 122.905], 13);
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    // Plot barangay markers
    barangays.forEach(b => {
      L.circleMarker([b.lat, b.lng], {
        radius: 14, color: b.color, weight: 2,
        fillColor: b.color, fillOpacity: 0.15,
      }).addTo(map);

      L.marker([b.lat, b.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="background:${b.color};color:white;font-size:10px;font-weight:600;padding:2px 7px;border-radius:5px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.25)">${b.name}</div>`,
          iconAnchor: [0, 10],
        }),
      }).addTo(map)
        .bindPopup(`<b>${b.name}</b><br>Zones: ${b.zones}${b.meters ? '<br>Meters: ' + b.meters : ''}`);
    });

    // Legend
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = () => {
      const div = L.DomUtil.create('div', 'pipeline-legend');
      div.innerHTML = `
        <b>Legend</b>
        <div class="legend-row"><div class="legend-dot" style="background:#f5c518;border:2px solid #444"></div> Junction point</div>
        <div class="legend-row"><div class="legend-line" style="background:#00bcd4"></div> Main line</div>
        <div class="legend-row"><div class="legend-line" style="background:#1a237e;"></div> Branch pipe</div>
        <div class="legend-row"><div class="legend-dot" style="background:#1565c0"></div> Residential</div>
        <div class="legend-row"><div class="legend-dot" style="background:#e65100"></div> Commercial</div>
        <div class="legend-row"><div class="legend-dot" style="background:#2e7d32"></div> Institutional</div>
      `;
      return div;
    };
    legend.addTo(map);

    // Map click handler
    map.on('click', (e: any) => {
      const currentMode = modeRef.current;

      if (currentMode === 'junction') {
        junctionCountRef.current += 1;
        const id = junctionCountRef.current;
        const marker = L.circleMarker(e.latlng, {
          radius: 7, color: '#444', weight: 2,
          fillColor: '#f5c518', fillOpacity: 1,
        }).addTo(map)
          .bindTooltip('J' + id, { permanent: true, direction: 'top', offset: [0, -8] });

        const j: JunctionPoint = { id, lat: e.latlng.lat, lng: e.latlng.lng, marker };
        junctionsRef.current.push(j);
        historyRef.current.push({ type: 'junction', ref: j });
        setStatus(`Junction J${id} placed at ${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`);
        forceUpdate();

      } else if (currentMode === 'mainline' || currentMode === 'pipe') {
        const closest = findClosestJunction(e.latlng, 60);
        if (!closest) { setStatus('Click closer to an existing junction point.'); return; }

        if (!pipeStartRef.current) {
          pipeStartRef.current = closest;
          closest.marker.setStyle({ color: '#e65100', weight: 3 });
          setStatus(`Start: J${closest.id} — now click another junction to connect.`);
        } else {
          if (pipeStartRef.current.id === closest.id) { setStatus('Select a different junction.'); return; }
          const isMain = currentMode === 'mainline';
          const line = L.polyline([pipeStartRef.current.marker.getLatLng(), closest.marker.getLatLng()], {
            color: isMain ? '#00bcd4' : '#1a237e',
            weight: isMain ? 5 : 3,
            opacity: 0.85,
            dashArray: isMain ? undefined : '6,4',
          }).addTo(map);

          const p: PipeLine = { from: pipeStartRef.current.id, to: closest.id, line, type: currentMode };
          pipesRef.current.push(p);
          historyRef.current.push({ type: 'pipe', ref: p });
          pipeStartRef.current.marker.setStyle({ color: '#444', weight: 2 });
          setStatus(`${isMain ? 'Main line' : 'Branch pipe'}: J${pipeStartRef.current.id} → J${closest.id}`);
          pipeStartRef.current = null;
          forceUpdate();
        }

      } else if (currentMode === 'consumer') {
        const type = window.prompt('Consumer type?\nEnter: Residential, Commercial, or Institutional', 'Residential') as ConsumerType | null;
        if (!type) return;
        const valid: ConsumerType[] = ['Residential', 'Commercial', 'Institutional'];
        const t: ConsumerType = valid.find(v => v.toLowerCase() === type.trim().toLowerCase()) || 'Residential';
        const color = consumerColors[t];
        const marker = L.circleMarker(e.latlng, {
          radius: 5, color, weight: 2, fillColor: color, fillOpacity: 0.9,
        }).addTo(map).bindPopup(`<b>${t}</b><br>${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`);

        const c: Consumer = { lat: e.latlng.lat, lng: e.latlng.lng, type: t, marker };
        consumersRef.current.push(c);
        historyRef.current.push({ type: 'consumer', ref: c });
        setStatus(`${t} consumer added.`);
        forceUpdate();
      }
    });
  };

  const findClosestJunction = (latlng: any, thresh: number): JunctionPoint | null => {
    const map = mapRef.current;
    if (!map) return null;
    let best: JunctionPoint | null = null;
    let minD = Infinity;
    for (const j of junctionsRef.current) {
      const p1 = map.latLngToContainerPoint(latlng);
      const p2 = map.latLngToContainerPoint([j.lat, j.lng]);
      const d = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
      if (d < minD) { minD = d; best = j; }
    }
    return minD < thresh ? best : null;
  };

  const handleUndo = () => {
    const last = historyRef.current.pop();
    if (!last) { setStatus('Nothing to undo.'); return; }
    if (last.type === 'junction') {
      last.ref.marker.remove();
      junctionsRef.current = junctionsRef.current.filter((j: JunctionPoint) => j.id !== last.ref.id);
      setStatus(`Removed J${last.ref.id}.`);
    } else if (last.type === 'pipe') {
      last.ref.line.remove();
      pipesRef.current = pipesRef.current.filter((p: PipeLine) => p !== last.ref);
      setStatus('Removed last pipe.');
    } else if (last.type === 'consumer') {
      last.ref.marker.remove();
      consumersRef.current = consumersRef.current.filter((c: Consumer) => c !== last.ref);
      setStatus('Removed last consumer.');
    }
    forceUpdate();
  };

  const handleClear = () => {
    if (!window.confirm('Clear all junctions, pipes, and consumers?')) return;
    junctionsRef.current.forEach(j => j.marker.remove());
    pipesRef.current.forEach(p => p.line.remove());
    consumersRef.current.forEach(c => c.marker.remove());
    junctionsRef.current = [];
    pipesRef.current = [];
    consumersRef.current = [];
    historyRef.current = [];
    pipeStartRef.current = null;
    junctionCountRef.current = 0;
    setStatus('Map cleared.');
    forceUpdate();
  };

  const handleExport = () => {
    const data = {
      junctions: junctionsRef.current.map(j => ({ id: 'J' + j.id, lat: j.lat, lng: j.lng })),
      pipes: pipesRef.current.map(p => ({ from: 'J' + p.from, to: 'J' + p.to, type: p.type })),
      consumers: consumersRef.current.map(c => ({ lat: c.lat, lng: c.lng, type: c.type })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'slr_pipeline_map.json';
    a.click();
    setStatus('Map data exported as JSON.');
  };

  const modeLabels: Record<Mode, string> = {
    junction: 'Place Junction',
    mainline:  'Draw Main Line',
    pipe:      'Draw Branch Pipe',
    consumer:  'Add Consumer',
  };

  const modeIcons: Record<Mode, string> = {
    junction: 'fas fa-map-pin',
    mainline:  'fas fa-grip-lines',
    pipe:      'fas fa-project-diagram',
    consumer:  'fas fa-user-circle',
  };

  return (
    <MainLayout title="Pipeline Map">
      <div className="pipeline-map-page">

        {/* Stats row */}
        <div className="pipeline-stats">
          <div className="stat-card">
            <div className="stat-icon blue"><i className="fas fa-map-pin"></i></div>
            <div className="stat-info">
              <div className="stat-value">{junctionsRef.current.length}</div>
              <div className="stat-label">Junction Points</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon teal"><i className="fas fa-project-diagram"></i></div>
            <div className="stat-info">
              <div className="stat-value">{pipesRef.current.length}</div>
              <div className="stat-label">Pipe Segments</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon green"><i className="fas fa-users"></i></div>
            <div className="stat-info">
              <div className="stat-value">{consumersRef.current.filter(c => c.type === 'Residential').length}</div>
              <div className="stat-label">Residential</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon orange"><i className="fas fa-store"></i></div>
            <div className="stat-info">
              <div className="stat-value">{consumersRef.current.filter(c => c.type === 'Commercial').length + consumersRef.current.filter(c => c.type === 'Institutional').length}</div>
              <div className="stat-label">Commercial / Institutional</div>
            </div>
          </div>
        </div>

        {/* Zone filter */}
        <div className="zone-filter">
          <label>Filter by Zone:</label>
          {ZONE_PILLS.map(z => (
            <button
              key={z.label}
              className={`zone-pill ${activeZone === z.label ? 'active' : ''}`}
              style={activeZone === z.label ? { background: z.color, borderColor: z.color } : {}}
              onClick={() => setActiveZone(z.label)}
            >
              {z.label}
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="pipeline-controls">
          {(['junction', 'mainline', 'pipe', 'consumer'] as Mode[]).map(m => (
            <button
              key={m}
              className={`btn btn-mode ${mode === m ? 'active' : ''}`}
              onClick={() => changeMode(m)}
            >
              <i className={modeIcons[m]}></i>
              {modeLabels[m]}
            </button>
          ))}
          <button className="btn btn-mode" onClick={handleUndo}>
            <i className="fas fa-undo"></i> Undo
          </button>
          <button className="btn btn-danger" onClick={handleClear}>
            <i className="fas fa-trash"></i> Clear All
          </button>
          <button className="btn btn-export" onClick={handleExport}>
            <i className="fas fa-download"></i> Export JSON
          </button>
          <span className="mode-hint">
            <i className="fas fa-info-circle"></i> {mode === 'junction' ? 'Click map to place junction' : mode === 'mainline' ? 'Click 2 junctions for main line' : mode === 'pipe' ? 'Click 2 junctions for branch pipe' : 'Click map to add consumer'}
          </span>
        </div>

        {/* Map */}
        <div className="map-wrapper">
          <div id="pipeline-leaflet-map"></div>
          <div className="map-status-bar">
            <i className="fas fa-info-circle"></i>
            {status}
          </div>
        </div>

      </div>
    </MainLayout>
  );
};

export default PipelineMap;
