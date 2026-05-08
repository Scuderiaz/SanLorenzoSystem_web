import React, { useEffect, useRef, useState, useCallback, useReducer } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import './PipelineMap.css';
import { loadConsumersWithFallback } from '../../services/userManagementApi';

// ── Types ──────────────────────────────────────────────────────────────────
type Mode = 'grab' | 'junction' | 'mainline' | 'pipe' | 'Consumer';
type ConsumerType = 'Residential' | 'Commercial' | 'Institutional' | 'Industrial';

interface JunctionPoint { id: number; lat: number; lng: number; marker: any; }
interface PipeLine      { from: number; to: number; line: any; type: 'mainline' | 'pipe'; }
interface Consumer      { lat: number; lng: number; type: ConsumerType; marker: any; }
interface HistoryItem   { type: string; ref: any; }

// ── Constants ──────────────────────────────────────────────────────────────
const BARANGAYS = [
  { name:'Daculang Bolo', lat:14.0723, lng:122.9126, zones:['Zone 1','Zone 2'],                       meters:272,  color:'#1a237e' },
  { name:'Dagotdotan',    lat:14.0680, lng:122.9050, zones:['Zone 2','Zone 3','Zone 4'],               meters:171,  color:'#1565c0' },
  { name:'Laniton',       lat:14.0750, lng:122.8980, zones:['Zone 3'],                                 meters:116,  color:'#0277bd' },
  { name:'Langga',        lat:14.0610, lng:122.8920, zones:['Zone 4'],                                 meters:44,   color:'#00695c' },
  { name:'Maisog',        lat:14.0420, lng:122.9200, zones:['Zone 5'],                                 meters:147,  color:'#2e7d32' },
  { name:'Mampurog',      lat:14.0459, lng:122.8851, zones:['Zone 4','Zone 5','Zone 6','Zone 7'],      meters:528,  color:'#e65100' },
  { name:'Matacong',      lat:14.0380, lng:122.8750, zones:['Zone 8','Zone 9','Zone 10'],              meters:540,  color:'#b71c1c' },
  { name:'San Isidro',    lat:14.0300, lng:122.8650, zones:['Zone 11'],                                meters:null, color:'#6a1b9a' },
  { name:'San Ramon',     lat:14.0250, lng:122.8550, zones:['Zone 12'],                                meters:null, color:'#4a148c' },
];

const ZONE_PILLS = [
  { label:'All',      color:'#1a237e' },
  { label:'Zone 1',   color:'#1a237e' }, { label:'Zone 2',  color:'#1565c0' },
  { label:'Zone 3',   color:'#0277bd' }, { label:'Zone 4',  color:'#00695c' },
  { label:'Zone 5',   color:'#2e7d32' }, { label:'Zone 6',  color:'#558b2f' },
  { label:'Zone 7',   color:'#f57f17' }, { label:'Zone 8',  color:'#e65100' },
  { label:'Zone 9',   color:'#bf360c' }, { label:'Zone 10', color:'#b71c1c' },
  { label:'Zone 11',  color:'#6a1b9a' }, { label:'Zone 12', color:'#4a148c' },
];

const MAIN_LINES = [
  { id: 'ML2', label: 'Main Line 2', lat: 14.03531, lng: 122.86335 },
  { id: 'ML3', label: 'Main Line 3', lat: 14.04143, lng: 122.83856 },
  // Main Line 1 — TBD
];

const MODE_CONFIG: Record<Mode, { label: string; icon: string; hint: string }> = {
  grab:     { label:'Pan Map',       icon:'fas fa-hand-paper',      hint:'Click and drag the map to navigate. No points will be placed.' },
  junction: { label:'Add Junction',  icon:'fas fa-map-pin',         hint:'Click anywhere on the map to place a junction (branching) point.' },
  mainline: { label:'Main Line',     icon:'fas fa-grip-lines',      hint:'Click a junction point to start, then click another to draw the MAIN transmission line.' },
  pipe:     { label:'Branch Pipe',   icon:'fas fa-project-diagram', hint:'Click a junction point to start, then click another to draw a distribution branch pipe.' },
  Consumer: { label:'Add Consumer',  icon:'fas fa-user-circle',     hint:'Click on the map near a junction to place a Residential, Commercial, Institutional, or Industrial Consumer.' },
};

// ── Component ──────────────────────────────────────────────────────────────
const PipelineMap: React.FC = () => {
  const mapRef          = useRef<any>(null);
  const mapInitialized  = useRef(false);
  const barangayLayers  = useRef<any[]>([]);
  const mainLineRefs = useRef<{ id: string; label: string; marker: any; circle: any }[]>([]);
  const [dbConsumers, setDbConsumers] = useState<any[]>([]);
  const [consumerSearch, setConsumerSearch] = useState('');
  const [filteredConsumers, setFilteredConsumers] = useState<any[]>([]);
  const [pendingConsumerLatLng, setPendingConsumerLatLng] = useState<any>(null);
  const junctionsRef    = useRef<JunctionPoint[]>([]);
  const pipesRef        = useRef<PipeLine[]>([]);
  const consumersRef    = useRef<Consumer[]>([]);
  const historyRef      = useRef<HistoryItem[]>([]);
  const redoStackRef    = useRef<HistoryItem[]>([]);
  const pipeStartRef    = useRef<JunctionPoint | null>(null);
  const junctionCountRef= useRef(0);
  const modeRef         = useRef<Mode>('grab');

  const [mode, setMode]             = useState<Mode>('grab');
  const [status, setStatus]         = useState('Select a tool from the toolbar to begin.');
  const [activeZone, setActiveZone] = useState('All');
  const [showConsumerModal, setShowConsumerModal] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
const [searchResults, setSearchResults] = useState<{ label: string; type: string; lat: number; lng: number; marker: any }[]>([]);
const [showResults, setShowResults] = useState(false);

const handleSearch = useCallback((query: string) => {
  setSearchQuery(query);
  if (!query.trim()) { setSearchResults([]); setShowResults(false); return; }
  const q = query.toLowerCase();
  const results: { label: string; type: string; lat: number; lng: number; marker: any }[] = [];

  // Search Main Lines
  mainLineRefs.current.forEach(ml => {
    if (ml.label.toLowerCase().includes(q) || ml.id.toLowerCase().includes(q)) {
      results.push({ label: ml.label, type: 'Main Line', lat: ml.marker.getLatLng().lat, lng: ml.marker.getLatLng().lng, marker: ml.circle });
    }
  });

  // Search Consumers
  consumersRef.current.forEach(c => {
    if (c.type.toLowerCase().includes(q)) {
      results.push({ label: `${c.type} Consumer`, type: c.type, lat: c.lat, lng: c.lng, marker: c.marker });
    }
  });

  // Search Junctions
  junctionsRef.current.forEach(j => {
    if ((`j${j.id}`).includes(q) || (`junction ${j.id}`).includes(q)) {
      results.push({ label: `Junction J${j.id}`, type: 'Junction', lat: j.lat, lng: j.lng, marker: j.marker });
    }
  });

  setSearchResults(results);
  setShowResults(results.length > 0);
}, []);

const handleSelectResult = useCallback((result: { label: string; type: string; lat: number; lng: number; marker: any }) => {
  const map = mapRef.current;
  if (!map) return;
  map.setView([result.lat, result.lng], 17);
  setTimeout(() => result.marker.openPopup(), 400);
  setShowResults(false);
  setSearchQuery(result.label);
  setStatus(`Found: ${result.label}`);
}, []);

  const [, forceUpdate] = useReducer((value: number) => value + 1, 0);

  useEffect(() => {
  const fetchConsumers = async () => {
    try {
      const result = await loadConsumersWithFallback();
      setDbConsumers(result.data || []);
    } catch (err) {
      console.error('Failed to load consumers:', err);
    }
  };
  void fetchConsumers();
}, []);

const handleConsumerSearch = useCallback((query: string) => {
  setConsumerSearch(query);
  if (!query.trim()) { setFilteredConsumers([]); return; }
  const q = query.toLowerCase();
  const filtered = dbConsumers.filter(c =>
    String(c.Consumer_Name || '').toLowerCase().includes(q) ||
    String(c.Account_Number || '').toLowerCase().includes(q) ||
    String(c.Meter_Number || '').toLowerCase().includes(q)
  ).slice(0, 10);
  setFilteredConsumers(filtered);
}, [dbConsumers]);

  // ── Change mode ──────────────────────────────────────────────────────────
  const changeMode = useCallback((m: Mode) => {
    setMode(m);
    modeRef.current = m;
    pipeStartRef.current = null;

    const map = mapRef.current;
    if (!map) return;
    if (m === 'grab') {
      map.dragging.enable();
      map.getContainer().style.cursor = 'grab';
    } else {
      map.dragging.enable(); // always allow drag, but click will do action
      map.getContainer().style.cursor = m === 'junction' ? 'crosshair' : 'pointer';
    }
    setStatus(MODE_CONFIG[m].hint);
  }, []);

  // ── Find closest junction ────────────────────────────────────────────────
  const findClosestJunction = useCallback((latlng: any, thresh = 60): JunctionPoint | null => {
    const map = mapRef.current;
    if (!map) return null;
    let best: JunctionPoint | null = null;
    let minD = Infinity;
    for (const j of junctionsRef.current) {
      const p1 = map.latLngToContainerPoint(latlng);
      const p2 = map.latLngToContainerPoint([j.lat, j.lng]);
      const d  = Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
      if (d < minD) { minD = d; best = j; }
    }
    return minD < thresh ? best : null;
  }, []);

  // ── Zone filter ──────────────────────────────────────────────────────────
  const applyZoneFilter = useCallback((zone: string) => {
    setActiveZone(zone);
    const map = mapRef.current;
    if (!map) return;
    const L = (window as any).L;
    if (!L) return;

    barangayLayers.current.forEach(layer => map.removeLayer(layer));
    barangayLayers.current = [];

    BARANGAYS.forEach(b => {
      const inZone = zone === 'All' || b.zones.includes(zone);
      const opacity = inZone ? 0.9 : 0.15;
      const fillOpacity = inZone ? 0.2 : 0.04;

      const circle = L.circleMarker([b.lat, b.lng], {
        radius: inZone ? 16 : 12,
        color: b.color,
        weight: inZone ? 2.5 : 1,
        fillColor: b.color,
        fillOpacity,
        opacity,
      }).addTo(map);

      const label = L.marker([b.lat, b.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="background:${b.color};color:white;font-size:10px;font-weight:600;padding:2px 7px;border-radius:5px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.25);opacity:${inZone ? 1 : 0.3}">${b.name}</div>`,
          iconAnchor: [0, 10],
        }),
      }).addTo(map).bindPopup(`<b>${b.name}</b><br>Zones: ${b.zones.join(', ')}${b.meters ? '<br>Meters: ' + b.meters : ''}`);

      barangayLayers.current.push(circle, label);
    });

    // Zoom to zone if not All
    if (zone !== 'All') {
      const matching = BARANGAYS.filter(b => b.zones.includes(zone));
      if (matching.length > 0) {
        const lats = matching.map(b => b.lat);
        const lngs = matching.map(b => b.lng);
        const bounds = L.latLngBounds(
          [Math.min(...lats) - 0.005, Math.min(...lngs) - 0.005],
          [Math.max(...lats) + 0.005, Math.max(...lngs) + 0.005]
        );
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    } else {
      map.setView([14.065, 122.905], 13);
    }
  }, []);

  // ── Undo ─────────────────────────────────────────────────────────────────
  const handleUndo = useCallback(() => {
    const last = historyRef.current.pop();
    if (!last) { setStatus('Nothing to undo.'); return; }
    redoStackRef.current.push(last);
    if (last.type === 'junction') {
      last.ref.marker.remove();
      junctionsRef.current = junctionsRef.current.filter((j: JunctionPoint) => j.id !== last.ref.id);
      setStatus(`Undone: removed J${last.ref.id}.`);
    } else if (last.type === 'pipe') {
      last.ref.line.remove();
      pipesRef.current = pipesRef.current.filter((p: PipeLine) => p !== last.ref);
      setStatus('Undone: removed last pipe.');
    } else if (last.type === 'Consumer') {
      last.ref.marker.remove();
      consumersRef.current = consumersRef.current.filter((c: Consumer) => c !== last.ref);
      setStatus('Undone: removed last Consumer.');
    }
    forceUpdate();
  }, []);

  // ── Redo ─────────────────────────────────────────────────────────────────
  const handleRedo = useCallback(() => {
    const item = redoStackRef.current.pop();
    if (!item) { setStatus('Nothing to redo.'); return; }
    const map = mapRef.current;
    const L   = (window as any).L;
    if (!map || !L) return;

    historyRef.current.push(item);

    if (item.type === 'junction') {
      item.ref.marker.addTo(map);
      junctionsRef.current.push(item.ref);
      setStatus(`Redone: restored J${item.ref.id}.`);
    } else if (item.type === 'pipe') {
      item.ref.line.addTo(map);
      pipesRef.current.push(item.ref);
      setStatus('Redone: restored pipe.');
    } else if (item.type === 'Consumer') {
      item.ref.marker.addTo(map);
      consumersRef.current.push(item.ref);
      setStatus(`Redone: restored ${item.ref.type} Consumer.`);
    }
    forceUpdate();
  }, []);

  // ── Clear ─────────────────────────────────────────────────────────────────
  const handleClear = useCallback(() => {
    if (!window.confirm('Clear all junctions, pipes, and consumers?')) return;
    junctionsRef.current.forEach(j => j.marker.remove());
    pipesRef.current.forEach(p => p.line.remove());
    consumersRef.current.forEach(c => c.marker.remove());
    junctionsRef.current = [];
    pipesRef.current     = [];
    consumersRef.current = [];
    historyRef.current   = [];
    redoStackRef.current = [];
    pipeStartRef.current = null;
    junctionCountRef.current = 0;
    setStatus('Map cleared.');
    forceUpdate();
  }, []);

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const data = {
      junctions: junctionsRef.current.map(j => ({ id:'J'+j.id, lat:j.lat, lng:j.lng })),
      pipes:     pipesRef.current.map(p => ({ from:'J'+p.from, to:'J'+p.to, type:p.type })),
      consumers: consumersRef.current.map(c => ({ lat:c.lat, lng:c.lng, type:c.type })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'slr_pipeline_map.json';
    a.click();
    setStatus('Map data exported as slr_pipeline_map.json');
  }, []);

  // ── Consumer modal confirm ────────────────────────────────────────────────
  // ── Init map ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapInitialized.current) return;
    mapInitialized.current = true;

    const link = document.createElement('link');
    link.rel   = 'stylesheet';
    link.href  = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(link);

    const script  = document.createElement('script');
    script.src    = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    script.onload = () => {
      const L   = (window as any).L;
      const map = L.map('pipeline-leaflet-map').setView([14.065, 122.905], 13);
      mapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:'© OpenStreetMap contributors', maxZoom:19,
      }).addTo(map);

      // Initial barangay markers
      BARANGAYS.forEach(b => {
        const circle = L.circleMarker([b.lat, b.lng], {
          radius:14, color:b.color, weight:2, fillColor:b.color, fillOpacity:0.18,
        }).addTo(map);
        const label = L.marker([b.lat, b.lng], {
          icon: L.divIcon({
            className:'',
            html:`<div style="background:${b.color};color:white;font-size:10px;font-weight:600;padding:2px 7px;border-radius:5px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.25)">${b.name}</div>`,
            iconAnchor:[0, 10],
          }),
        }).addTo(map).bindPopup(`<b>${b.name}</b><br>Zones: ${b.zones.join(', ')}${b.meters ? '<br>Meters: '+b.meters : ''}`);
        barangayLayers.current.push(circle, label);
      });

        // Main Line markers
     MAIN_LINES.forEach(ml => {
  const circle = L.circleMarker([ml.lat, ml.lng], {
    radius: 10, color: '#00838f', weight: 3,
    fillColor: '#00bcd4', fillOpacity: 0.9,
  }).addTo(map).bindPopup(`
    <b>🔵 ${ml.label}</b><br>
    <small>${ml.lat.toFixed(5)}, ${ml.lng.toFixed(5)}</small><br>
    <i>Main water line source</i>
  `);

  const marker = L.marker([ml.lat, ml.lng], {
    icon: L.divIcon({
      className: '',
      html: `<div style="background:#00838f;color:white;font-size:10px;font-weight:700;padding:2px 8px;border-radius:5px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.3)">🔵 ${ml.label}</div>`,
      iconAnchor: [0, 10],
    }),
  }).addTo(map);

  mainLineRefs.current.push({ id: ml.id, label: ml.label, marker, circle });
});

      // Legend
      const legend = L.control({ position:'bottomright' });
      legend.onAdd = () => {
        const div = L.DomUtil.create('div','pipeline-legend');
        div.innerHTML = `
           <b>Legend</b>
           <div style="font-size:11px;color:#666;margin-bottom:4px">Water System Hierarchy</div>
           <div class="legend-row"><div class="legend-dot" style="background:#00bcd4;border:2px solid #00838f"></div> Main Line (Source)</div>
           <div class="legend-row"><div class="legend-line" style="background:#00bcd4"></div> Main transmission line</div>
           <div class="legend-row"><div class="legend-dot" style="background:#f5c518;border:2px solid #444"></div> Junction point</div>
           <div class="legend-row"><div class="legend-line" style="background:#1a237e"></div> Branch pipe</div>
           <div class="legend-row"><div class="legend-dot" style="background:#1565c0"></div> Residential</div>
           <div class="legend-row"><div class="legend-dot" style="background:#e65100"></div> Commercial</div>
           <div class="legend-row"><div class="legend-dot" style="background:#2e7d32"></div> Institutional</div>
           <div class="legend-row"><div class="legend-dot" style="background:#6a1b9a"></div> Industrial</div>
      `;
        return div;
      };
      legend.addTo(map);

      // Map click
      map.on('click', (e: any) => {
        const m = modeRef.current;
        if (m === 'grab') return;

        if (m === 'junction') {
          junctionCountRef.current += 1;
          const id = junctionCountRef.current;
          const marker = L.circleMarker(e.latlng, {
            radius:7, color:'#444', weight:2, fillColor:'#f5c518', fillOpacity:1,
          }).addTo(map).bindTooltip('J'+id, { permanent:true, direction:'top', offset:[0,-8] });
          const j: JunctionPoint = { id, lat:e.latlng.lat, lng:e.latlng.lng, marker };
          junctionsRef.current.push(j);
          historyRef.current.push({ type:'junction', ref:j });
          redoStackRef.current = [];
          setStatus(`Junction J${id} placed at ${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`);
          forceUpdate();

        } else if (m === 'mainline' || m === 'pipe') {
          const closest = findClosestJunction(e.latlng);
          if (!closest) { setStatus('Click closer to a junction point.'); return; }
          if (!pipeStartRef.current) {
            pipeStartRef.current = closest;
            closest.marker.setStyle({ color:'#e65100', weight:3 });
            setStatus(`Start: J${closest.id} — now click another junction to connect.`);
          } else {
            if (pipeStartRef.current.id === closest.id) { setStatus('Choose a different junction.'); return; }
            const isMain = m === 'mainline';
            const line = L.polyline([pipeStartRef.current.marker.getLatLng(), closest.marker.getLatLng()], {
              color: isMain ? '#00bcd4' : '#1a237e',
              weight: isMain ? 5 : 3,
              opacity: 0.85,
              dashArray: isMain ? undefined : '6,4',
            }).addTo(map);
            const p: PipeLine = { from:pipeStartRef.current.id, to:closest.id, line, type:m };
            pipesRef.current.push(p);
            historyRef.current.push({ type:'pipe', ref:p });
            redoStackRef.current = [];
            pipeStartRef.current.marker.setStyle({ color:'#444', weight:2 });
            setStatus(`${isMain ? 'Main line' : 'Branch pipe'}: J${pipeStartRef.current.id} → J${closest.id}`);
            pipeStartRef.current = null;
            forceUpdate();
          }

        } else if (m === 'Consumer') {
          setPendingConsumerLatLng(e.latlng);
          setConsumerSearch('');
          setFilteredConsumers([]);
          setShowConsumerModal(true);
        }
      });

      // Start in grab mode
      map.getContainer().style.cursor = 'grab';
    };
    document.head.appendChild(script);
  }, [findClosestJunction]);

  const canUndo = historyRef.current.length > 0;
  const canRedo = redoStackRef.current.length > 0;

  return (
    <MainLayout title="Pipeline Map">
      <div className="pipeline-map-page">

   {/* Consumer modal */}
        {showConsumerModal && (
          <div className="consumer-modal-overlay">
            <div className="consumer-modal" style={{ width: 380 }}>
              <h3>Add Consumer to Map</h3>
              <p>Search by name, account number, or meter number:</p>

              {/* Search input */}
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1.5px solid #d0d5dd', borderRadius: 8, padding: '8px 12px', background: '#fafafa' }}>
                  <i className="fas fa-search" style={{ color: '#888', fontSize: 13 }}></i>
                  <input
                    type="text"
                    placeholder="Search consumer..."
                    value={consumerSearch}
                    onChange={e => handleConsumerSearch(e.target.value)}
                    style={{ border: 'none', outline: 'none', flex: 1, fontSize: 13, background: 'transparent' }}
                    autoFocus
                  />
                </div>

                {/* Dropdown results */}
                {filteredConsumers.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.12)', zIndex: 10000, maxHeight: 220, overflowY: 'auto', marginTop: 4 }}>
                    {filteredConsumers.map((c, i) => {
                      const classColor =
                        c.Classification_Name === 'Commercial'
                          ? '#e65100'
                          : c.Classification_Name === 'Institutional'
                            ? '#2e7d32'
                            : c.Classification_Name === 'Industrial'
                              ? '#6a1b9a'
                              : '#1565c0';
                      return (
                        <button key={i} type="button"
                          onClick={() => {
                            const map = mapRef.current;
                            const L = (window as any).L;
                            if (!map || !L || !pendingConsumerLatLng) return;
                            const color = classColor;
                            const marker = L.circleMarker(pendingConsumerLatLng, {
                              radius: 6, color, weight: 2, fillColor: color, fillOpacity: 0.9,
                            }).addTo(map).bindPopup(`
                              <b>${c.Consumer_Name || 'Unknown'}</b><br>
                              <small>Account: ${c.Account_Number || 'N/A'}</small><br>
                              <small>Meter: ${c.Meter_Number || 'N/A'}</small><br>
                              <small>Classification: ${c.Classification_Name || 'N/A'}</small><br>
                              <small>Zone: ${c.Zone_Name || 'N/A'}</small><br>
                              <small>Barangay: ${c.Barangay || 'N/A'}</small>
                            `);
                            const consumer = { lat: pendingConsumerLatLng.lat, lng: pendingConsumerLatLng.lng, type: (c.Classification_Name || 'Residential') as ConsumerType, marker };
                            consumersRef.current.push(consumer);
                            historyRef.current.push({ type: 'Consumer', ref: consumer });
                            redoStackRef.current = [];
                            setStatus(`${c.Consumer_Name} (${c.Classification_Name}) added to map.`);
                            setShowConsumerModal(false);
                            setConsumerSearch('');
                            setFilteredConsumers([]);
                            setPendingConsumerLatLng(null);
                            forceUpdate();
                          }}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f5f7ff')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: classColor, flexShrink: 0 }}></div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{c.Consumer_Name || 'Unknown'}</div>
                            <div style={{ fontSize: 11, color: '#888' }}>
                              {c.Account_Number || 'No account no.'} · {c.Classification_Name || 'N/A'} · {c.Barangay || 'N/A'}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {consumerSearch && filteredConsumers.length === 0 && (
                  <div style={{ padding: '10px 14px', fontSize: 13, color: '#888', textAlign: 'center', marginTop: 4, background: '#f9f9f9', borderRadius: 8 }}>
                    No consumers found.
                  </div>
                )}
              </div>

              <div className="modal-actions" style={{ marginTop: 16 }}>
                <button type="button" className="btn btn-cancel" onClick={() => {
                  setShowConsumerModal(false);
                  setConsumerSearch('');
                  setFilteredConsumers([]);
                  setPendingConsumerLatLng(null);
                }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Search Bar */}
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1.5px solid #d0d5dd', borderRadius: 8, padding: '8px 14px' }}>
            <i className="fas fa-search" style={{ color: '#888', fontSize: 13 }}></i>
            <input
              type="text"
              placeholder="Search main line, junction, or consumer..."
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowResults(true)}
              style={{ border: 'none', outline: 'none', flex: 1, fontSize: 13, color: '#333', background: 'transparent' }}
            />
            {searchQuery && (
              <button type="button" onClick={() => { setSearchQuery(''); setSearchResults([]); setShowResults(false); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: 13 }}>
                <i className="fas fa-times"></i>
              </button>
            )}
          </div>
          {showResults && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.12)', zIndex: 9000, maxHeight: 220, overflowY: 'auto', marginTop: 4 }}>
              {searchResults.map((r, i) => (
                <button key={i} type="button" onClick={() => handleSelectResult(r)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f5f7ff')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  <i className={r.type === 'Main Line' ? 'fas fa-water' : r.type === 'Junction' ? 'fas fa-map-pin' : 'fas fa-user-circle'}
                    style={{ color: r.type === 'Main Line' ? '#00838f' : r.type === 'Junction' ? '#f5c518' : '#1565c0', width: 16 }}></i>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{r.label}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>{r.type}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Stats */}
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
            <div className="stat-icon green"><i className="fas fa-home"></i></div>
            <div className="stat-info">
              <div className="stat-value">{consumersRef.current.filter(c => c.type === 'Residential').length}</div>
              <div className="stat-label">Residential</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon orange"><i className="fas fa-store"></i></div>
            <div className="stat-info">
              <div className="stat-value">{consumersRef.current.filter(c => c.type !== 'Residential').length}</div>
              <div className="stat-label">Commercial / Institutional / Industrial</div>
            </div>
          </div>
        </div>

        {/* Instruction bar */}
        <div className="instruction-bar">
          <i className="fas fa-lightbulb"></i>
          <span>{MODE_CONFIG[mode].hint}</span>
        </div>

        {/* Zone filter */}
        <div className="zone-filter-row">
          <label><i className="fas fa-layer-group"></i> &nbsp;Filter Zone:</label>
          {ZONE_PILLS.map(z => (
            <button
              key={z.label}
              type="button"
              className={`zone-pill ${activeZone === z.label ? 'active' : ''}`}
              style={activeZone === z.label ? { background:z.color } : {}}
              onClick={() => applyZoneFilter(z.label)}
            >
              {z.label}
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="pipeline-controls">
          {/* Mode buttons */}
          {(['grab','junction','mainline','pipe','Consumer'] as Mode[]).map(m => (
            <button
              key={m}
              type="button"
              className={`btn btn-mode ${m === 'grab' ? 'btn-grab' : ''} ${mode === m ? 'active' : ''}`}
              onClick={() => changeMode(m)}
            >
              <i className={MODE_CONFIG[m].icon}></i>
              {MODE_CONFIG[m].label}
            </button>
          ))}

          <div className="toolbar-divider" />

          {/* Undo / Redo */}
          <button type="button" className="btn btn-undo-redo" onClick={handleUndo} disabled={!canUndo}>
            <i className="fas fa-undo"></i> Undo
          </button>
          <button type="button" className="btn btn-undo-redo" onClick={handleRedo} disabled={!canRedo}>
            <i className="fas fa-redo"></i> Redo
          </button>

          <div className="toolbar-divider" />

          <button type="button" className="btn btn-danger" onClick={handleClear}>
            <i className="fas fa-trash"></i> Clear All
          </button>
          <button type="button" className="btn btn-export" onClick={handleExport}>
            <i className="fas fa-download"></i> Export JSON
          </button>
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


