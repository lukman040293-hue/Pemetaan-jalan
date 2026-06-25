import React, { useState, useEffect, useRef } from 'react';

// =========================================================================
// 🔴 KONFIGURASI SUPABASE ANDA 
// Masukkan URL dan Publishable Key dari Project Supabase Anda di sini:
// =========================================================================
const SUPABASE_URL = 'https://bucyrbywyrkvjwqpzetk.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_KX8WFsYJBgdsCp-Rp9hg1A_YSxStzFR'; 

// =========================================================================
// 🔵 KONFIGURASI CLOUDINARY (PENYIMPANAN MEDIA PIHAK KETIGA)
// Digunakan agar storage Supabase (1GB limit) tidak cepat penuh.
// =========================================================================
const CLOUDINARY_CLOUD_NAME = 'djntwm7ta'; // Ganti dengan "Cloud Name" dari dashboard Cloudinary Anda
const CLOUDINARY_UPLOAD_PRESET = 'preset_survey_jalan'; // Ganti dengan "Upload Preset" tipe Unsigned milik Anda

// --- DATA RUJUKAN ---
const KELURAHAN_LIST = [
  "Air Hitam", "Air Putih", "Bandara", "Baqa", "Bayur", "Budaya Pampang", "Bugis", "Bukit Pinang", "Bukuan", "Dadi Mulya", 
  "Gunung Kelua", "Gunung Panjang", "Handil Bakti", "Harapan Baru", "Jawa", "Karang Anyar", "Karang Asam Ilir", 
  "Karang Asam Ulu", "Karang Mumus", "Lempake", "Loa Bahu", "Loa Bakung", "Loa Buah", "Makroman", "Mangkupalas", 
  "Mesjid", "Mugirejo", "Pasar Pagi", "Pelabuhan", "Pelita", "Pulau Atas", "Rapak Dalam", "Rawa Makmur", "Sambutan", 
  "Selili", "Sempaja Barat", "Sempaja Selatan", "Sempaja Timur", "Sempaja Utara", "Sengkotek", "Sidodadi", "Sidodamai", 
  "Sidomulyo", "Simpang Pasir", "Simpang Tiga", "Sindang Sari", "Sungai Dama", "Sungai Kapih", "Sungai Keledang", 
  "Sungai Pinang Dalam", "Sungai Pinang Luar", "Sungai Siring", "Tanah Merah", "Tani Aman", "Teluk Lerong Ilir", 
  "Teluk Lerong Ulu", "Temindung Permai", "Tenun"
];

const getConditionColor = (condition) => {
  switch (condition) {
    case 'Baik': return '#10B981';         // Hijau
    case 'Rusak Ringan': return '#FBBF24'; // Kuning/Amber
    case 'Rusak Sedang': return '#F97316'; // Oranye
    case 'Rusak Parah': return '#EF4444';  // Merah
    default: return '#6B7280';
  }
};

// --- HELPER: FORMAT NAMA KELURAHAN ---
const formatKel = (nama) => {
  if (!nama) return '-';
  return /^(kel\.|kelurahan)\s/i.test(nama) ? nama : `Kel. ${nama}`;
};

// --- ALGORITMA SIMPLIFIKASI KOORDINAT (DOUGLAS-PEUCKER) ---
const getSqDist = (p, p1, p2) => {
  let x = p1.lat, y = p1.lng, dx = p2.lat - x, dy = p2.lng - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p.lat - x) * dx + (p.lng - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = p2.lat; y = p2.lng; } 
    else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = p.lat - x; dy = p.lng - y;
  return dx * dx + dy * dy;
};

const simplifyStep = (points, first, last, sqTolerance, simplified) => {
  let maxSqDist = sqTolerance, index;
  for (let i = first + 1; i < last; i++) {
    const sqDist = getSqDist(points[i], points[first], points[last]);
    if (sqDist > maxSqDist) { index = i; maxSqDist = sqDist; }
  }
  if (maxSqDist > sqTolerance) {
    if (index - first > 1) simplifyStep(points, first, index, sqTolerance, simplified);
    simplified.push(points[index]);
    if (last - index > 1) simplifyStep(points, index, last, sqTolerance, simplified);
  }
};

const simplifyGpsData = (points, tolerance = 0.00003) => {
  if (points.length <= 2) return points;
  const sqTolerance = tolerance * tolerance;
  const simplified = [points[0]];
  simplifyStep(points, 0, points.length - 1, sqTolerance, simplified);
  simplified.push(points[points.length - 1]);
  return simplified;
};

// --- ALGORITMA HAVERSINE ---
const getDistanceMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; 
  const p1 = lat1 * Math.PI/180;
  const p2 = lat2 * Math.PI/180;
  const dp = (lat2-lat1) * Math.PI/180;
  const dl = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(dp/2) * Math.sin(dp/2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2) * Math.sin(dl/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

const formatLength = (kmString) => {
  if (!kmString) return '-';
  const km = parseFloat(kmString);
  if (isNaN(km) || km === 0) return '-';
  return km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(2) + ' km';
};

const formatDuration = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const compressImage = (file, maxWidth = 1000, maxHeight = 1000, quality = 0.7) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > height) { if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
        } else { if (height > maxHeight) { width = Math.round((width * maxHeight) / height); height = maxHeight; } }
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
            if (!blob) return reject(new Error('Gagal'));
            resolve(new File([blob], file.name.replace(/\.[^/.]+$/, "") + "_compressed.jpg", { type: 'image/jpeg', lastModified: Date.now() }));
        }, 'image/jpeg', quality);
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

const LockCylinder = ({ digit, idx }) => {
  const stripRef = useRef(null);
  const numbers = Array.from({ length: 40 }, (_, i) => i % 10);
  const targetNum = parseInt(digit, 10);
  const targetIndex = 30 + targetNum;

  useEffect(() => {
    if (stripRef.current) {
      stripRef.current.style.transition = 'none';
      stripRef.current.style.transform = `translateY(0em)`;
      void stripRef.current.offsetHeight; 
      const duration = 2.0 + (idx * 0.4); 
      stripRef.current.style.transition = `transform ${duration}s cubic-bezier(0.15, 0.85, 0.2, 1)`;
      stripRef.current.style.transform = `translateY(-${targetIndex * 1.1}em)`;
    }
  }, [digit, idx]);

  return (
    <span style={{ display: 'inline-block', height: '1.1em', lineHeight: '1.1em', overflow: 'hidden', position: 'relative', background: 'transparent', margin: '0 1px', color: '#0f172a' }}>
      <span ref={stripRef} style={{ display: 'flex', flexDirection: 'column', willChange: 'transform' }}>
        {numbers.map((num, i) => <span key={i} style={{ height: '1.1em', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900' }}>{num}</span>)}
      </span>
    </span>
  );
};

const AnimatedNumber = ({ value }) => {
  const valStr = String(value); const digits = valStr.split('');
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', margin: '0 -2px' }}>
      {digits.map((digit, idx) => <LockCylinder key={`${digits.length}-${idx}`} digit={digit} idx={idx} />)}
    </span>
  );
};

// --- KOMPONEN TOGGLE (DAFTAR LAYER) ---
const LayerToggle = ({ active, color, onClick }) => (
  <div onClick={(e) => { e.stopPropagation(); onClick(); }} className="w-9 h-5 rounded-full p-0.5 cursor-pointer transition-colors relative flex items-center shrink-0 border border-black/10 shadow-inner" style={{ backgroundColor: active ? color : '#cbd5e1' }}>
      <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform transform ${active ? 'translate-x-4' : 'translate-x-0'}`}></div>
  </div>
);

export default function App() {
  // --- STATE APLIKASI UTAMA ---
  const [appRole, setAppRole] = useState(null); 
  const [mobileScreen, setMobileScreen] = useState('home'); 
  const [selectedRoad, setSelectedRoad] = useState(null);

  const [supabase, setSupabase] = useState(null);
  const [isDbConnected, setIsDbConnected] = useState(false);

  // --- ROUTING ---
  useEffect(() => {
      const handleHashChange = () => {
          const hash = window.location.hash;
          if (hash === '#/' || hash === '') setAppRole(null);
          else if (hash === '#/admin') { setAppRole('admin'); setSelectedRoad(null); } 
          else if (hash === '#/admin/detail') setAppRole('admin');
          else if (hash.startsWith('#/surveyor')) { setAppRole('surveyor'); setMobileScreen(hash.replace('#/surveyor/', '') || 'home'); }
      };
      window.addEventListener('hashchange', handleHashChange);
      if (!window.location.hash) window.location.hash = '#/';
      else handleHashChange();
      return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const [toastMessage, setToastMessage] = useState(null);
  const showToast = (message) => { setToastMessage(String(message)); setTimeout(() => setToastMessage(null), 4000); };

  useEffect(() => {
    let metaViewport = document.querySelector('meta[name="viewport"]');
    if (!metaViewport) { metaViewport = document.createElement('meta'); metaViewport.name = 'viewport'; document.head.appendChild(metaViewport); }
    metaViewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';

    if (!document.getElementById('tailwind-cdn')) {
      const script = document.createElement('script'); script.id = 'tailwind-cdn'; script.src = 'https://cdn.tailwindcss.com'; document.head.appendChild(script);
    }
    if (SUPABASE_ANON_KEY.includes('PASTE_KUNCI')) return; 

    const initSupabase = () => { try { setSupabase(window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)); } catch (err) { console.warn(err); } };
    if (window.supabase) { initSupabase(); return; }

    const script = document.createElement('script'); script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'; script.id = 'supabase-js';
    script.onload = initSupabase; document.head.appendChild(script);
  }, []);

  const [syncedRoads, setSyncedRoads] = useState([]); 
  const [drafts, setDrafts] = useState([]); 
  const [videoSnapshot, setVideoSnapshot] = useState([]); 
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  useEffect(() => {
    try { const savedDrafts = localStorage.getItem('rmap_drafts'); if (savedDrafts) setDrafts(JSON.parse(savedDrafts)); } catch (e) {}
  }, []);

  useEffect(() => {
    try { const draftsToSave = drafts.map(({ videoFile, photoFiles, ...safeDraft }) => safeDraft); localStorage.setItem('rmap_drafts', JSON.stringify(draftsToSave)); } catch (e) {}
  }, [drafts]);

  // --- STATE ADMIN BARU (DAFTAR LAYER) ---
  const initialKelurahanState = KELURAHAN_LIST.reduce((acc, kel) => { acc[kel] = true; return acc; }, {});
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeKelurahan, setActiveKelurahan] = useState(initialKelurahanState);
  const [activeConditions, setActiveConditions] = useState({ 'Baik': true, 'Rusak Ringan': true, 'Rusak Sedang': true, 'Rusak Parah': true });
  const [activeJenis, setActiveJenis] = useState({ 'Aspal': true, 'Beton': true, 'Tanah': true });
  const [expandedSection, setExpandedSection] = useState('kondisi'); 

  const [highlightedRoadId, setHighlightedRoadId] = useState(null);
  const [selectedAdminRouteIds, setSelectedAdminRouteIds] = useState([]); 
  
  const [isAnimatingMap, setIsAnimatingMap] = useState(false);
  const [animatingRoadsList, setAnimatingRoadsList] = useState([]); 
  const [isAnimPaused, setIsAnimPaused] = useState(false);
  const isAnimPausedRef = useRef(false);
  const [isAnimFinished, setIsAnimFinished] = useState(false); 
  const [isAnimControlMinimized, setIsAnimControlMinimized] = useState(false);
  const [animationSpeedMultiplier, setAnimationSpeedMultiplier] = useState(1.0);
  const animationSpeedRef = useRef(1.0);
  const [currentAnimDistance, setCurrentAnimDistance] = useState(0);
  const [showSpeedControl, setShowSpeedControl] = useState(false);
  const [animIconType, setAnimIconType] = useState('car'); 

  useEffect(() => { animationSpeedRef.current = animationSpeedMultiplier; }, [animationSpeedMultiplier]);
  useEffect(() => { isAnimPausedRef.current = isAnimPaused; }, [isAnimPaused]);

  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768);
  const [showFloatingLegend, setShowFloatingLegend] = useState(window.innerWidth >= 768);

  const adminMapContainerRef = useRef(null);
  const adminMapInstanceRef = useRef(null);
  const adminLayerGroupRef = useRef(null);
  const adminHighlightLayerGroupRef = useRef(null);
  const hasFittedAdminMapRef = useRef(false);

  // Memastikan peta mengkalkulasi ulang lebar dan posisinya setiap kali filter atau tampilan awal diakses
  useEffect(() => {
      if (appRole === 'admin') hasFittedAdminMapRef.current = false;
  }, [appRole, searchQuery, activeKelurahan, activeConditions, activeJenis]);

  useEffect(() => {
    if (!selectedRoad) {
      setHighlightedRoadId(null); setIsAnimatingMap(false); setAnimatingRoadsList([]); setShowSpeedControl(false); setIsAnimFinished(false); setIsAnimControlMinimized(false);
      if (adminMapInstanceRef.current) adminMapInstanceRef.current.closePopup();
    } else {
      setHighlightedRoadId(selectedRoad.id || selectedRoad.dbId); setIsAnimatingMap(false); setIsAnimFinished(false); setIsAnimControlMinimized(false);
    }
  }, [selectedRoad]);

  const toggleAdminRouteSelection = (id) => { setSelectedAdminRouteIds(prev => prev.includes(id) ? prev.filter(rId => rId !== id) : [...prev, id]); };
  const closeAdminModal = () => { if (window.location.hash === '#/admin/detail') window.history.back(); else setSelectedRoad(null); };

  // --- FILTERING LOGIC SECARA GLOBAL ---
  const filteredRoads = syncedRoads.filter(road => {
    const matchKel = road.kelurahan ? activeKelurahan[road.kelurahan] !== false : true;
    const matchCond = activeConditions[road.condition] !== false;
    const matchJenis = activeJenis[road.jenisJalan || 'Aspal'] !== false;
    const matchSearch = road.name.toLowerCase().includes(searchQuery.toLowerCase()) || (road.kelurahan && road.kelurahan.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchKel && matchCond && matchJenis && matchSearch;
  });

  const adminStats = {
    total: filteredRoads.length,
    baik: filteredRoads.filter(r => r.condition === 'Baik').length,
    rusakRingan: filteredRoads.filter(r => r.condition === 'Rusak Ringan').length,
    rusakSedang: filteredRoads.filter(r => r.condition === 'Rusak Sedang').length,
    rusakParah: filteredRoads.filter(r => r.condition === 'Rusak Parah').length,
    aspal: filteredRoads.filter(r => r.jenisJalan === 'Aspal' || !r.jenisJalan).length,
    beton: filteredRoads.filter(r => r.jenisJalan === 'Beton').length,
    tanah: filteredRoads.filter(r => r.jenisJalan === 'Tanah').length,
  };

  // --- STATE SURVEYOR ---
  const [isRecording, setIsRecording] = useState(false);
  const [realGpsPoints, setRealGpsPoints] = useState([]);
  const [manualDrawnPoints, setManualDrawnPoints] = useState([]);
  const [gpsAccuracy, setGpsAccuracy] = useState('-');
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [totalDistance, setTotalDistance] = useState(0);
  const [pinLocation, setPinLocation] = useState(null); 
  const [currentLocation, setCurrentLocation] = useState(null); 
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState(null);
  const [uploadedVideoFile, setUploadedVideoFile] = useState(null); 
  const [uploadedPhotoFiles, setUploadedPhotoFiles] = useState([]);
  const [uploadedPhotoUrls, setUploadedPhotoUrls] = useState([]);
  const [recordingStatus, setRecordingStatus] = useState('idle'); 
  const recordingStatusRef = useRef('idle');
  const lastMoveTimeRef = useRef(Date.now());
  const [recordTab, setRecordTab] = useState('camera'); 
  const [recordingDuration, setRecordingDuration] = useState(0);

  const liveMapContainerRef = useRef(null);
  const liveMapInstanceRef = useRef(null);
  const liveMapMarkerRef = useRef(null);
  const liveMapPolylineRef = useRef(null);
  const drawMapContainerRef = useRef(null);
  const drawMapInstanceRef = useRef(null);
  const drawPolylineRef = useRef(null);
  const drawMarkersGroupRef = useRef(null);
  const drawMapCurrentLocMarkerRef = useRef(null);

  useEffect(() => { recordingStatusRef.current = recordingStatus; }, [recordingStatus]);
  useEffect(() => { let interval; if (recordingStatus === 'recording') { interval = setInterval(() => { setRecordingDuration(prev => prev + 1); }, 1000); } return () => clearInterval(interval); }, [recordingStatus]);

  useEffect(() => {
     if (mobileScreen !== 'record' && isRecording) {
         if (locatingTimeoutRef.current) clearTimeout(locatingTimeoutRef.current);
         if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
         if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
         setIsRecording(false); setRecordingStatus('idle'); showToast("Perekaman dibatalkan otomatis.");
     }
  }, [mobileScreen, isRecording]);

  const [selectedDraftIds, setSelectedDraftIds] = useState([]);
  const [formData, setFormData] = useState({ name: '', kelurahan: KELURAHAN_LIST[0], jenisJalan: 'Aspal', condition: 'Baik', notes: '' });
  const [editingDraftId, setEditingDraftId] = useState(null); 
  const videoRef = useRef(null); const streamRef = useRef(null); const watchIdRef = useRef(null);
  const surveyorMapContainerRef = useRef(null); const surveyorMapInstanceRef = useRef(null); const surveyorMarkerRef = useRef(null); const currentLocationMarkerRef = useRef(null); 
  const locatingTimeoutRef = useRef(null); const isGpsForcedRef = useRef(false);
  const [isLeafletLoaded, setIsLeafletLoaded] = useState(false);

  useEffect(() => {
    if (window.L) { setIsLeafletLoaded(true); return; }
    const script = document.createElement('script'); script.id = 'leaflet-js-script'; script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => setIsLeafletLoaded(true); document.head.appendChild(script);
  }, []);

  const formatRoadData = (road) => {
    let parsedGps = road.realGps; let parsedPin = road.pinLocation; let parsedPhotos = road.photoUrls;
    if (typeof parsedGps === 'string') { try { parsedGps = JSON.parse(parsedGps); } catch (e) { parsedGps = []; } }
    if (typeof parsedPin === 'string') { try { parsedPin = JSON.parse(parsedPin); } catch (e) { parsedPin = null; } }
    if (typeof parsedPhotos === 'string') { try { parsedPhotos = JSON.parse(parsedPhotos); } catch (e) { parsedPhotos = []; } }
    if (!Array.isArray(parsedGps)) parsedGps = []; if (!Array.isArray(parsedPhotos)) parsedPhotos = [];
    return { ...road, id: road.id || road.dbId, realGps: parsedGps, pinLocation: parsedPin, photoUrls: parsedPhotos };
  };

  const fetchRoads = async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.from('mapped_roads').select('*').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      const formattedData = (data || []).map(formatRoadData);
      setSyncedRoads(prev => JSON.stringify(prev) === JSON.stringify(formattedData) ? prev : formattedData);
      setIsDbConnected(true);
    } catch (error) { setIsDbConnected(false); if (error.message.includes("Failed to fetch")) showToast("Gagal menyambung ke database."); }
  };

  useEffect(() => { if (!supabase) return; fetchRoads(); const intervalId = setInterval(() => { fetchRoads(); }, 15000); return () => clearInterval(intervalId); }, [supabase]);

  // --- EFEK PETA ADMIN ---
  useEffect(() => {
    if (appRole !== 'admin' || !isLeafletLoaded || !adminMapContainerRef.current) return;
    
    const map = window.L.map(adminMapContainerRef.current, { zoomControl: false }).setView([-0.425, 117.185], 13);
    window.L.control.zoom({ position: 'topright' }).addTo(map);

    const osm = window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
    const satelit = window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '© Esri' });
    
    osm.addTo(map);
    window.L.control.layers({ "Jalanan (OSM)": osm, "Citra Satelit": satelit }, null, { position: 'topright' }).addTo(map);
    
    adminMapInstanceRef.current = map;
    adminLayerGroupRef.current = window.L.layerGroup().addTo(map);
    adminHighlightLayerGroupRef.current = window.L.layerGroup().addTo(map);

    setTimeout(() => { map.invalidateSize(); window.dispatchEvent(new Event('resize')); }, 200);
    return () => { map.remove(); adminMapInstanceRef.current = null; adminLayerGroupRef.current = null; };
  }, [appRole, isLeafletLoaded]);

  useEffect(() => {
    if (appRole !== 'admin' || !adminMapInstanceRef.current || !adminLayerGroupRef.current) return;

    const layerGroup = adminLayerGroupRef.current;
    const map = adminMapInstanceRef.current;
    layerGroup.clearLayers();

    filteredRoads.forEach(road => {
      const roadId = road.id || road.dbId;
      if (road.realGps && road.realGps.length > 0) {
        const latlngs = road.realGps.map(pt => [pt.lat, pt.lng]);
        
        const polyline = window.L.polyline(latlngs, { color: getConditionColor(road.condition), weight: 5, opacity: 0.65, lineCap: 'round', lineJoin: 'round' }).addTo(layerGroup);
        window.L.circleMarker(latlngs[0], { radius: 3, fillColor: '#10B981', color: '#ffffff', weight: 1.5, fillOpacity: 1 }).addTo(layerGroup);
        window.L.circleMarker(latlngs[latlngs.length - 1], { radius: 3, fillColor: '#EF4444', color: '#ffffff', weight: 1.5, fillOpacity: 1 }).addTo(layerGroup);

        let marker = null;
        if (road.pinLocation && road.pinLocation.lat && road.pinLocation.lng) {
          const pinIcon = window.L.divIcon({
            className: 'custom-pin-svg', 
            html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 40" width="14" height="24" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.3));"><rect x="10.5" y="12" width="3" height="28" rx="1.5" fill="#475569" /><circle cx="12" cy="12" r="12" fill="${getConditionColor(road.condition)}" /><circle cx="7.5" cy="7.5" r="3.5" fill="rgba(255,255,255,0.35)" /></svg>`,
            iconSize: [14, 24], iconAnchor: [7, 24], popupAnchor: [0, -24] 
          });
          
          const uniqueId = roadId || Math.floor(Math.random() * 1000000);
          
          const popupContent = `
            <div style="font-family: ui-sans-serif, system-ui, sans-serif;">
              <h4 style="margin: 0 0 10px 0; font-size: 14px; font-weight: 800; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; padding-right: 14px; display: flex; align-items: center; gap: 4px;">
                 <span style="font-size:16px;">📍</span> ${road.name}
              </h4>
              <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
                <tr style="border-bottom: 1px solid #f8fafc;"><th style="padding: 6px 0; color: #64748b; font-weight: normal; width: 38%;">Kelurahan</th><td style="padding: 6px 0; color: #334155; font-weight: 800;">${formatKel(road.kelurahan)}</td></tr>
                <tr style="border-bottom: 1px solid #f8fafc;"><th style="padding: 6px 0; color: #64748b; font-weight: normal;">Kondisi</th><td style="padding: 6px 0;"><span style="background-color: ${getConditionColor(road.condition)}20; color: ${getConditionColor(road.condition)}; padding: 2px 6px; border-radius: 4px; font-weight: 800; font-size: 12px;">${road.condition}</span></td></tr>
                <tr style="border-bottom: 1px solid #f8fafc;"><th style="padding: 6px 0; color: #64748b; font-weight: normal;">Panjang Rute</th><td style="padding: 6px 0; color: #334155; font-weight: 800;">${formatLength(road.length)}</td></tr>
                <tr style="border-bottom: 1px solid #f8fafc;"><th style="padding: 6px 0; color: #64748b; font-weight: normal; vertical-align: top;">Titik Lokasi</th><td style="padding: 6px 0; color: #2563eb; font-weight: 800; line-height: 1.2; white-space: nowrap;">${road.pinLocation ? road.pinLocation.lat.toFixed(5) + ', ' + road.pinLocation.lng.toFixed(5) : '-'}</td></tr>
                <tr><th style="padding: 6px 0; color: #64748b; font-weight: normal;">Tanggal</th><td style="padding: 6px 0; color: #475569; font-weight: 800;">${road.date || '-'}</td></tr>
              </table>
              <button id="btn-detail-${uniqueId}" class="btn-detail-popup">Lihat Detail</button>
            </div>
          `;
          
          marker = window.L.marker([road.pinLocation.lat, road.pinLocation.lng], { icon: pinIcon }).addTo(layerGroup).bindPopup(popupContent, { autoClose: true, closeOnClick: true });
          marker.on('popupopen', () => {
            setHighlightedRoadId(roadId);
            const btn = document.getElementById(`btn-detail-${uniqueId}`);
            if (btn) btn.onclick = () => { setSelectedRoad(road); setVideoSnapshot([]); window.location.hash = '#/admin/detail'; if (window.innerWidth < 768) setIsSidebarOpen(false); };
          });
          marker.on('popupclose', () => setHighlightedRoadId(prev => prev === roadId ? null : prev));
        }
        polyline.on('click', () => { setHighlightedRoadId(roadId); if (marker) marker.openPopup(); });
      }
    });

    if (filteredRoads.length > 0 && map && !hasFittedAdminMapRef.current) {
      const allLatLngs = filteredRoads.flatMap(r => r.realGps.map(pt => [pt.lat, pt.lng]));
      if (allLatLngs.length > 0) { 
        hasFittedAdminMapRef.current = true;
        setTimeout(() => {
            if (adminMapInstanceRef.current) {
                adminMapInstanceRef.current.invalidateSize(true);
                adminMapInstanceRef.current.fitBounds(window.L.latLngBounds(allLatLngs), { padding: [50, 50], maxZoom: 16 });
            }
        }, 350); 
      }
    } else if (filteredRoads.length === 0 && map && !hasFittedAdminMapRef.current) {
      hasFittedAdminMapRef.current = true;
      setTimeout(() => {
          if (adminMapInstanceRef.current) {
              adminMapInstanceRef.current.invalidateSize(true);
              adminMapInstanceRef.current.setView([-0.425, 117.185], 13);
          }
      }, 350);
    }
  }, [appRole, syncedRoads, activeKelurahan, activeConditions, activeJenis, searchQuery]);

  useEffect(() => {
    if (appRole !== 'admin' || !adminHighlightLayerGroupRef.current) return;
    const highlightGroup = adminHighlightLayerGroupRef.current;
    highlightGroup.clearLayers();

    if (highlightedRoadId) {
      const activeRoad = syncedRoads.find(r => (r.id || r.dbId) === highlightedRoadId);
      if (activeRoad && activeRoad.realGps && activeRoad.realGps.length > 0) {
        const latlngs = activeRoad.realGps.map(pt => [pt.lat, pt.lng]);
        window.L.polyline(latlngs, { color: '#3B82F6', weight: 16, opacity: 0.5, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(highlightGroup);
        window.L.polyline(latlngs, { color: '#ffffff', weight: 10, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(highlightGroup);
        window.L.polyline(latlngs, { color: getConditionColor(activeRoad.condition), weight: 6, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(highlightGroup);
      }
    }
  }, [highlightedRoadId, syncedRoads, appRole]);

  useEffect(() => {
    if (appRole === 'admin' && adminMapInstanceRef.current) setTimeout(() => adminMapInstanceRef.current.invalidateSize(), 300); 
  }, [isSidebarOpen, appRole]);

  // --- EFEK: ANIMASI RUTE DI ADMIN ---
  useEffect(() => {
    let onInteractionStart = null; let onInteractionEnd = null;
    let activeTimeouts = []; let activeMarkers = [];

    if (isAnimatingMap && animatingRoadsList.length > 0 && adminMapInstanceRef.current) {
       const map = adminMapInstanceRef.current;
       let isInteracting = false;

       const getBearing = (lat1, lng1, lat2, lng2) => {
           const toRad = deg => deg * Math.PI / 180; const toDeg = rad => rad * 180 / Math.PI;
           const dLng = toRad(lng2 - lng1);
           const y = Math.sin(dLng) * Math.cos(toRad(lat2));
           const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
           return (toDeg(Math.atan2(y, x)) + 360) % 360;
       };

       onInteractionStart = () => { isInteracting = true; activeMarkers.forEach(m => { if(m && m.getElement()) m.getElement().style.transition = 'none'; }); };
       onInteractionEnd = () => { isInteracting = false; };
       
       map.on('zoomstart', onInteractionStart); map.on('zoomend', onInteractionEnd); map.on('dragstart', onInteractionStart); map.on('dragend', onInteractionEnd);

       let finishedCount = 0; const totalVehicles = animatingRoadsList.length;

       animatingRoadsList.forEach((road, vIndex) => {
           const points = road.realGps;
           if (!points || points.length < 2) { finishedCount++; return; }

           const individualSpeedFactor = 0.7 + (Math.random() * 0.7);
           let currentIndex = 0; let accumulatedDistance = 0;
           let currentAngle = getBearing(points[0].lat, points[0].lng, points[1].lat, points[1].lng);
           
           let vehicleSvg = ''; let iconSize = [32, 50]; let iconAnchor = [16, 25];

           if (animIconType === 'motorcycle') {
               iconSize = [26, 42]; iconAnchor = [13, 21];
               vehicleSvg = `<svg viewBox="0 0 40 95" width="100%" height="100%" style="filter: drop-shadow(0 4px 6px rgba(0,0,0,0.5));"><rect x="17" y="72" width="6" height="20" rx="3" fill="#0f172a"/><rect x="27" y="58" width="4" height="24" rx="2" fill="#94a3b8"/><path d="M 15 55 L 25 55 L 23 82 L 17 82 Z" fill="#334155"/><rect x="16" y="81" width="8" height="3" rx="1" fill="#ef4444"/><rect x="17" y="3" width="6" height="18" rx="3" fill="#0f172a"/><path d="M 15 13 L 25 13 L 26 23 L 14 23 Z" fill="#334155"/><circle cx="20" cy="12" r="3" fill="#fef08a" /><path d="M 6 28 Q 20 22 34 28" stroke="#475569" stroke-width="3" stroke-linecap="round" fill="none"/><rect x="4" y="26" width="5" height="9" rx="2" fill="#000" transform="rotate(15, 6, 30)"/><rect x="31" y="26" width="5" height="9" rx="2" fill="#000" transform="rotate(-15, 34, 30)"/><path d="M 13 26 Q 20 18 27 26 L 29 45 Q 20 49 11 45 Z" fill="#dc2626"/><path d="M 15 28 Q 20 22 25 28 L 26 40 Q 20 42 14 40 Z" fill="rgba(255,255,255,0.2)"/><path d="M 13 45 Q 20 42 27 45 L 25 65 Q 20 70 15 65 Z" fill="#1e293b"/><path d="M 9 48 Q 20 40 31 48 L 28 55 Q 20 59 12 55 Z" fill="#334155"/><circle cx="20" cy="46" r="8" fill="#f8fafc" stroke="#64748b" stroke-width="1.5"/><path d="M 14 43.5 Q 20 38 26 43.5 Q 20 47 14 43.5 Z" fill="#0f172a"/></svg>`;
           } else if (animIconType === 'runner') {
               iconSize = [28, 28]; iconAnchor = [14, 14];
               vehicleSvg = `<svg viewBox="0 0 50 50" width="100%" height="100%" style="filter: drop-shadow(0 3px 4px rgba(0,0,0,0.4));"><style>@keyframes runCycle { 0% { transform: scaleX(1); } 50% { transform: scaleX(-1); } 100% { transform: scaleX(1); } }</style><g style="animation: runCycle 0.5s infinite steps(1); transform-origin: 25px 25px;"><rect x="16" y="6" width="6" height="14" rx="3" fill="#1e293b" /><rect x="28" y="30" width="6" height="14" rx="3" fill="#1e293b" /><path d="M 14 25 Q 6 36 12 44" fill="none" stroke="#475569" stroke-width="5" stroke-linecap="round" /><circle cx="12" cy="44" r="3" fill="#fcd34d" /><path d="M 36 25 Q 44 14 38 6" fill="none" stroke="#475569" stroke-width="5" stroke-linecap="round" /><circle cx="38" cy="6" r="3" fill="#fcd34d" /><rect x="13" y="20" width="24" height="10" rx="5" fill="#3b82f6" /></g><circle cx="25" cy="25" r="7" fill="#fcd34d" /><path d="M 18 25 A 7 7 0 0 1 32 25 Z" fill="#0f172a" /></svg>`;
           } else {
               iconSize = [24, 38]; iconAnchor = [12, 19];
               vehicleSvg = `<svg viewBox="0 0 100 160" width="100%" height="100%" style="filter: drop-shadow(0 6px 8px rgba(0,0,0,0.4));"><rect x="8" y="35" width="16" height="30" rx="6" fill="#334155"/><rect x="76" y="35" width="16" height="30" rx="6" fill="#334155"/><rect x="8" y="105" width="16" height="30" rx="6" fill="#334155"/><rect x="76" y="105" width="16" height="30" rx="6" fill="#334155"/><rect x="18" y="5" width="64" height="14" rx="7" fill="#cbd5e1"/><rect x="22" y="145" width="56" height="10" rx="5" fill="#cbd5e1"/><rect x="14" y="12" width="72" height="135" rx="28" fill="#94a3b8"/><rect x="18" y="16" width="64" height="127" rx="24" fill="rgba(0,0,0,0.15)"/><rect x="20" y="18" width="60" height="123" rx="22" fill="#cbd5e1"/><circle cx="26" cy="18" r="9" fill="#f1f5f9" stroke="#94a3b8" stroke-width="2"/><circle cx="26" cy="18" r="4" fill="#fef08a"/><circle cx="74" cy="18" r="9" fill="#f1f5f9" stroke="#94a3b8" stroke-width="2"/><circle cx="74" cy="18" r="4" fill="#fef08a"/><path d="M 22 55 Q 50 40 78 55 L 72 75 Q 50 65 28 75 Z" fill="#1e293b"/><path d="M 26 120 Q 50 130 74 120 L 70 108 Q 50 115 30 108 Z" fill="#1e293b"/><path d="M 20 78 L 24 105 Q 26 90 28 78 Z" fill="#1e293b"/><path d="M 80 78 L 76 105 Q 74 90 72 78 Z" fill="#1e293b"/><rect x="28" y="72" width="44" height="38" rx="12" fill="#cbd5e1"/><rect x="32" y="74" width="36" height="16" rx="8" fill="rgba(255,255,255,0.4)"/><rect x="22" y="140" width="12" height="6" rx="3" fill="#ef4444"/><rect x="66" y="140" width="12" height="6" rx="3" fill="#ef4444"/></svg>`;
           }
           
           const iconHtml = `<div id="anim-car-wrapper-${vIndex}" style="width: ${iconSize[0]}px; height: ${iconSize[1]}px; transform-origin: center center; transform: rotate(${currentAngle}deg); transition: transform 0.3s ease-out;">${vehicleSvg}</div>`;
           const customVehicleIcon = window.L.divIcon({ className: 'moving-vehicle-icon', html: iconHtml, iconSize: iconSize, iconAnchor: iconAnchor });
           const marker = window.L.marker([points[0].lat, points[0].lng], { icon: customVehicleIcon, zIndexOffset: 1000 }).addTo(map);
           activeMarkers.push(marker);

           const midPoint = points[Math.floor(points.length / 2)];
           const dirX = vIndex % 2 === 0 ? 40 : -40; const dirY = vIndex % 3 === 0 ? -45 : (vIndex % 3 === 1 ? -25 : -65);
           const staticLabelIcon = window.L.divIcon({
               className: 'static-route-label',
               html: `<div style="position: relative; width: 0; height: 0; pointer-events: none;"><div style="position: absolute; width: 8px; height: 8px; background: #ffffff; border: 2.5px solid #3b82f6; border-radius: 50%; transform: translate(-50%, -50%); z-index: 2; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"></div><svg style="position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; z-index: 1;"><line x1="0" y1="0" x2="${dirX}" y2="${dirY}" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" opacity="0.9" /></svg><div style="position: absolute; transform: translate(calc(${dirX}px ${dirX > 0 ? '+ 3px' : '- 100% - 3px'}), calc(${dirY}px - 50%)); background-color: #3b82f6; color: #ffffff; padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: 800; white-space: nowrap; box-shadow: 0 4px 8px rgba(0,0,0,0.25); z-index: 3; text-transform: uppercase; border: 1px solid rgba(255,255,255,0.4);">${road.name}</div></div>`,
               iconSize: [0, 0], iconAnchor: [0, 0]
           });
           const staticLabelMarker = window.L.marker([midPoint.lat, midPoint.lng], { icon: staticLabelIcon, interactive: false }).addTo(map);
           activeMarkers.push(staticLabelMarker); 

           const animate = () => {
              if (currentIndex >= points.length) {
                 finishedCount++;
                 if (finishedCount >= totalVehicles) { setIsAnimPaused(true); setIsAnimFinished(true); }
                 return;
              }

              if (isAnimPausedRef.current) { activeTimeouts.push(setTimeout(animate, 100)); return; }
              
              const pt = points[currentIndex];
              let segmentDelay = 600 / animationSpeedRef.current; 

              if (currentIndex > 0) {
                  const prevPt = points[currentIndex - 1];
                  const dist = getDistanceMeters(prevPt.lat, prevPt.lng, pt.lat, pt.lng);
                  accumulatedDistance += dist;
                  if (totalVehicles === 1) setCurrentAnimDistance(accumulatedDistance);
                  const baseVisualSpeedMps = 75; 
                  let calculatedDelay = (dist / baseVisualSpeedMps) * 1000 / (animationSpeedRef.current * individualSpeedFactor);
                  segmentDelay = Math.max(30, Math.min(calculatedDelay, 8000));
              }

              if (marker) {
                  const el = marker.getElement();
                  if (el && currentIndex > 0) el.style.transition = isInteracting ? 'none' : `transform ${segmentDelay}ms linear`;
                  marker.setLatLng([pt.lat, pt.lng]);
              }
              
              if (currentIndex > 0) {
                  const prevPt = points[currentIndex - 1];
                  if (prevPt.lat !== pt.lat || prevPt.lng !== pt.lng) {
                      const targetBearing = getBearing(prevPt.lat, prevPt.lng, pt.lat, pt.lng);
                      let diff = targetBearing - (currentAngle % 360);
                      if (diff > 180) diff -= 360; if (diff < -180) diff += 360;
                      currentAngle += diff;
                      const carWrapper = document.getElementById(`anim-car-wrapper-${vIndex}`);
                      if (carWrapper) { carWrapper.style.transition = `transform ${Math.min(segmentDelay * 0.5, 400)}ms ease-in-out`; carWrapper.style.transform = `rotate(${currentAngle}deg)`; }
                  }
              }

              currentIndex++;
              activeTimeouts.push(setTimeout(animate, segmentDelay)); 
           };

           activeTimeouts.push(setTimeout(animate, 800 + (vIndex * 60))); 
       });

       const allRouteBounds = animatingRoadsList.flatMap(r => r.realGps.map(pt => [pt.lat, pt.lng]));
       if (allRouteBounds.length > 0) map.fitBounds(window.L.latLngBounds(allRouteBounds), { paddingTopLeft: [80, 80], paddingBottomRight: [80, 180] });
    }

    return () => {
       activeTimeouts.forEach(clearTimeout);
       activeMarkers.forEach(m => { if(m && adminMapInstanceRef.current) adminMapInstanceRef.current.removeLayer(m); });
       if (adminMapInstanceRef.current && onInteractionStart && onInteractionEnd) {
           adminMapInstanceRef.current.off('zoomstart', onInteractionStart); adminMapInstanceRef.current.off('zoomend', onInteractionEnd);
           adminMapInstanceRef.current.off('dragstart', onInteractionStart); adminMapInstanceRef.current.off('dragend', onInteractionEnd);
       }
    };
  }, [isAnimatingMap, animatingRoadsList, animIconType]);

  // --- PEMANTAU LOKASI SURVEYOR ---
  useEffect(() => {
      if (appRole !== 'surveyor') return;
      let watchId;
      if ('geolocation' in navigator) {
          watchId = navigator.geolocation.watchPosition(
              (position) => setCurrentLocation({ lat: position.coords.latitude, lng: position.coords.longitude }),
              () => console.warn("GPS belum stabil atau izin ditolak."),
              { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
          );
      }
      return () => { if (watchId) navigator.geolocation.clearWatch(watchId); };
  }, [appRole]);

  // --- EFEK PETA DRAW MAP & PIN ---
  useEffect(() => {
    if (appRole !== 'surveyor' || mobileScreen !== 'draw_map' || !isLeafletLoaded || !drawMapContainerRef.current) return;
    const map = window.L.map(drawMapContainerRef.current); drawMapInstanceRef.current = map;
    const satelit = window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 });
    const osm = window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    window.L.control.layers({ "Peta Jalan (OSM)": osm, "Citra Satelit (Esri)": satelit }, null, { position: 'topleft' }).addTo(map);
    drawMarkersGroupRef.current = window.L.layerGroup().addTo(map);
    drawPolylineRef.current = window.L.polyline([], { color: '#3B82F6', weight: 6, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }).addTo(map);
    if (currentLocation) map.setView([currentLocation.lat, currentLocation.lng], 16); else map.setView([-0.425, 117.185], 14);
    setTimeout(() => { map.invalidateSize(); window.dispatchEvent(new Event('resize')); }, 300);
    return () => { map.remove(); drawMapInstanceRef.current = null; drawPolylineRef.current = null; drawMarkersGroupRef.current = null; drawMapCurrentLocMarkerRef.current = null; };
  }, [appRole, mobileScreen, isLeafletLoaded]);

  useEffect(() => {
    if (appRole !== 'surveyor' || mobileScreen !== 'draw_map' || !drawMapInstanceRef.current) return;
    if (currentLocation) {
        if (drawMapCurrentLocMarkerRef.current) drawMapCurrentLocMarkerRef.current.setLatLng([currentLocation.lat, currentLocation.lng]);
        else {
            const icon = window.L.divIcon({ className: 'current-location-dot', html: `<div style="position: relative; width: 16px; height: 16px;"><div style="position: absolute; width: 16px; height: 16px; background-color: #3B82F6; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.4); z-index: 2;"></div><div style="position: absolute; top: -8px; left: -8px; width: 32px; height: 32px; background-color: rgba(59, 130, 246, 0.3); border-radius: 50%; animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite; z-index: 1;"></div></div>`, iconSize: [16, 16], iconAnchor: [8, 8] });
            drawMapCurrentLocMarkerRef.current = window.L.marker([currentLocation.lat, currentLocation.lng], { icon, zIndexOffset: 1000, interactive: false }).addTo(drawMapInstanceRef.current);
        }
    }
  }, [appRole, mobileScreen, currentLocation]);

  useEffect(() => {
      if (mobileScreen !== 'draw_map' || !drawMapInstanceRef.current) return;
      const onMapClick = (e) => {
          setManualDrawnPoints(prev => {
              const newPt = { lat: e.latlng.lat, lng: e.latlng.lng };
              if (prev.length > 0) setTotalDistance(d => d + getDistanceMeters(prev[prev.length - 1].lat, prev[prev.length - 1].lng, newPt.lat, newPt.lng));
              return [...prev, newPt];
          });
      };
      drawMapInstanceRef.current.on('click', onMapClick);
      return () => { if(drawMapInstanceRef.current) drawMapInstanceRef.current.off('click', onMapClick); };
  }, [mobileScreen]);

  useEffect(() => {
      if (mobileScreen !== 'draw_map' || !drawPolylineRef.current || !drawMarkersGroupRef.current) return;
      drawPolylineRef.current.setLatLngs(manualDrawnPoints.map(p => [p.lat, p.lng]));
      drawMarkersGroupRef.current.clearLayers();
      manualDrawnPoints.forEach((pt, idx) => {
          const isStart = idx === 0; const isEnd = idx === manualDrawnPoints.length - 1;
          const color = isStart ? '#10B981' : (isEnd ? '#EF4444' : '#ffffff');
          window.L.circleMarker([pt.lat, pt.lng], { radius: isStart||isEnd ? 5 : 3, fillColor: color, color: isStart||isEnd?'#fff':'#3B82F6', weight: isStart||isEnd ? 2 : 1.5, fillOpacity: 1 }).addTo(drawMarkersGroupRef.current);
      });
  }, [manualDrawnPoints, mobileScreen]);

  useEffect(() => {
    if (appRole !== 'surveyor' || mobileScreen !== 'pin_map' || !isLeafletLoaded || !surveyorMapContainerRef.current) return;
    const map = window.L.map(surveyorMapContainerRef.current); surveyorMapInstanceRef.current = map;
    const osm = window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    const satelit = window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 });
    window.L.control.layers({ "Peta Jalan (OSM)": osm, "Citra Satelit": satelit }, null, { position: 'topleft' }).addTo(map);
    setTimeout(() => { map.invalidateSize(); window.dispatchEvent(new Event('resize')); }, 200);

    if (realGpsPoints.length > 0) {
      const latlngs = realGpsPoints.map(pt => [pt.lat, pt.lng]);
      window.L.polyline(latlngs, { color: getConditionColor(formData.condition), weight: 6, opacity: 0.9 }).addTo(map);
      window.L.circleMarker(latlngs[0], { radius: 3, fillColor: '#10B981', color: '#fff' }).addTo(map);
      window.L.circleMarker(latlngs[latlngs.length - 1], { radius: 3, fillColor: '#EF4444', color: '#fff' }).addTo(map);
      map.fitBounds(window.L.latLngBounds(latlngs), { padding: [30, 30] });
    } else map.setView([-0.425, 117.185], 13);

    map.on('click', async (e) => {
      setPinLocation({ lat: e.latlng.lat, lng: e.latlng.lng }); showToast("📍 Pin diletakkan! Mendeteksi...");
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${e.latlng.lat}&lon=${e.latlng.lng}&zoom=18&addressdetails=1`);
        const data = await response.json();
        if (data && data.address) {
          const possibleNames = [data.address.village, data.address.suburb, data.address.neighbourhood, data.address.city_district].filter(Boolean);
          for (let name of possibleNames) {
            const normalized = name.toLowerCase().replace(/kelurahan|desa|kecamatan/gi, '').trim();
            const match = KELURAHAN_LIST.find(k => k.toLowerCase() === normalized);
            if (match) { setFormData(prev => ({ ...prev, kelurahan: match })); showToast(`✅ Kel. ${match}`); break; }
          }
        }
      } catch (err) {}
    });

    return () => { map.remove(); surveyorMapInstanceRef.current = null; surveyorMarkerRef.current = null; currentLocationMarkerRef.current = null; };
  }, [appRole, mobileScreen, isLeafletLoaded, realGpsPoints, formData.condition]);

  useEffect(() => {
    if (appRole !== 'surveyor' || mobileScreen !== 'pin_map' || !surveyorMapInstanceRef.current) return;
    if (pinLocation) {
      if (surveyorMarkerRef.current) surveyorMarkerRef.current.remove();
      const pinIcon = window.L.divIcon({ className: 'custom-pin-mobile-svg', html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 40" width="18" height="30" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));"><rect x="10.5" y="12" width="3" height="28" rx="1.5" fill="#475569" /><circle cx="12" cy="12" r="12" fill="${getConditionColor(formData.condition)}" /><circle cx="7.5" cy="7.5" r="3.5" fill="rgba(255,255,255,0.35)" /></svg>`, iconSize: [18, 30], iconAnchor: [9, 30] });
      surveyorMarkerRef.current = window.L.marker([pinLocation.lat, pinLocation.lng], { icon: pinIcon }).addTo(surveyorMapInstanceRef.current);
    }
    if (currentLocation) {
        if (currentLocationMarkerRef.current) currentLocationMarkerRef.current.setLatLng([currentLocation.lat, currentLocation.lng]);
        else {
            const icon = window.L.divIcon({ className: 'current-location-dot', html: `<div style="position: relative; width: 16px; height: 16px;"><div style="position: absolute; width: 16px; height: 16px; background-color: #3B82F6; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.4); z-index: 2;"></div><div style="position: absolute; top: -8px; left: -8px; width: 32px; height: 32px; background-color: rgba(59, 130, 246, 0.3); border-radius: 50%; animation: ping 2s infinite; z-index: 1;"></div></div>`, iconSize: [16, 16], iconAnchor: [8, 8] });
            currentLocationMarkerRef.current = window.L.marker([currentLocation.lat, currentLocation.lng], { icon, zIndexOffset: 1000 }).addTo(surveyorMapInstanceRef.current);
        }
    }
  }, [appRole, mobileScreen, pinLocation, currentLocation, formData]);


  // --- FUNGSI UTILITI & PEREKAMAN GPS ---
  const startRealHardware = async () => {
    setRealGpsPoints([]); setIsRecording(true); window.location.hash = '#/surveyor/record'; setRecordingStatus('locating'); setRecordTab('map'); 
    setGpsAccuracy('-'); setCurrentSpeed(0); setTotalDistance(0); setRecordingDuration(0);
    setUploadedVideoUrl(null); setUploadedVideoFile(null); setUploadedPhotoFiles([]); setUploadedPhotoUrls([]);
    setPinLocation(null); setEditingDraftId(null); isGpsForcedRef.current = false;

    if (locatingTimeoutRef.current) clearTimeout(locatingTimeoutRef.current);
    locatingTimeoutRef.current = setTimeout(() => {
      if (recordingStatusRef.current === 'locating') { showToast("⏳ Sinyal GPS sulit didapat. Diaktifkan paksa."); isGpsForcedRef.current = true; setRecordingStatus('ready'); }
    }, 15000);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream; if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) { showToast("Kamera tidak diizinkan."); }

    if ('geolocation' in navigator) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, accuracy, speed } = position.coords;
          setGpsAccuracy(Math.round(accuracy)); setCurrentSpeed(speed ? Math.round(speed * 3.6) : 0);
          setCurrentLocation({ lat: latitude, lng: longitude });
          
          if (recordingStatusRef.current === 'locating' && accuracy <= 25) {
             if (locatingTimeoutRef.current) clearTimeout(locatingTimeoutRef.current);
             setRecordingStatus('ready'); showToast("Sinyal GPS Bagus!");
          } else if (recordingStatusRef.current === 'ready' && accuracy > 40 && !isGpsForcedRef.current) setRecordingStatus('locating'); 

          if (recordingStatusRef.current === 'recording' || recordingStatusRef.current === 'auto_paused') {
            if (accuracy > 40 && !isGpsForcedRef.current) return; 
            setRealGpsPoints(prev => {
              if (prev.length === 0) { lastMoveTimeRef.current = Date.now(); return [{ lat: latitude, lng: longitude }]; }
              const dist = getDistanceMeters(prev[prev.length - 1].lat, prev[prev.length - 1].lng, latitude, longitude);
              if (dist < 3.5) {
                 if (Date.now() - lastMoveTimeRef.current > 10000 && recordingStatusRef.current === 'recording') { setRecordingStatus('auto_paused'); showToast("Auto-Pause aktif."); }
                 return prev;
              }
              if (dist > 100) return prev; 
              if (recordingStatusRef.current === 'auto_paused') { setRecordingStatus('recording'); showToast("Melanjutkan rekaman."); }
              lastMoveTimeRef.current = Date.now(); setTotalDistance(d => d + dist);
              return [...prev, { lat: latitude, lng: longitude }];
            });
          }
        }, () => {}, { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
      );
    }
  };

  const startManualDrawing = () => {
    setManualDrawnPoints([]); setRealGpsPoints([]); setTotalDistance(0); setUploadedVideoUrl(null); setUploadedVideoFile(null); 
    setUploadedPhotoFiles([]); setUploadedPhotoUrls([]); setPinLocation(null); setEditingDraftId(null); window.location.hash = '#/surveyor/draw_map';
  };

  const undoLastDrawnPoint = () => {
    setManualDrawnPoints(prev => {
        if (prev.length <= 1) { setTotalDistance(0); return []; }
        const newPoints = prev.slice(0, -1);
        let newDist = 0; for (let i = 1; i < newPoints.length; i++) newDist += getDistanceMeters(newPoints[i-1].lat, newPoints[i-1].lng, newPoints[i].lat, newPoints[i].lng);
        setTotalDistance(newDist); return newPoints;
    });
  };

  const finishManualDrawing = () => {
    if (manualDrawnPoints.length < 2) return showToast("Gambarkan minimal 2 titik!");
    setRealGpsPoints(manualDrawnPoints); window.location.hash = '#/surveyor/form';
  };

  const stopRealHardware = () => {
    if (locatingTimeoutRef.current) clearTimeout(locatingTimeoutRef.current);
    if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
    if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
    setIsRecording(false); setRecordingStatus('idle'); window.location.hash = '#/surveyor/form';
  };

  const cancelRecording = () => {
    if (locatingTimeoutRef.current) clearTimeout(locatingTimeoutRef.current);
    if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
    if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
    setIsRecording(false); setRecordingStatus('idle'); window.location.hash = '#/surveyor/home';
  };

  useEffect(() => {
    if (mobileScreen !== 'record' || !liveMapContainerRef.current || !isLeafletLoaded || liveMapInstanceRef.current) return;
    const map = window.L.map(liveMapContainerRef.current, { zoomControl: false }).setView([-0.425, 117.185], 16);
    const osm = window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    const satelit = window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 });
    window.L.control.layers({ "Peta (OSM)": osm, "Satelit": satelit }, null, { position: 'topleft' }).addTo(map);
    liveMapInstanceRef.current = map;
    liveMapPolylineRef.current = window.L.polyline([], { color: '#3B82F6', weight: 6, opacity: 0.9 }).addTo(map);
    setTimeout(() => map.invalidateSize(), 300);
    return () => { map.remove(); liveMapInstanceRef.current = null; liveMapPolylineRef.current = null; liveMapMarkerRef.current = null; };
  }, [mobileScreen, isLeafletLoaded]);

  useEffect(() => {
    if (!liveMapInstanceRef.current || mobileScreen !== 'record') return;
    const map = liveMapInstanceRef.current;
    if (currentLocation) {
       if (liveMapMarkerRef.current) liveMapMarkerRef.current.setLatLng([currentLocation.lat, currentLocation.lng]);
       else {
          const icon = window.L.divIcon({ className: 'live-location-dot', html: `<div style="width: 16px; height: 16px; background-color: #3B82F6; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 6px rgba(0,0,0,0.5);"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] });
          liveMapMarkerRef.current = window.L.marker([currentLocation.lat, currentLocation.lng], { icon, zIndexOffset: 1000 }).addTo(map);
          map.setView([currentLocation.lat, currentLocation.lng], 17);
       }
       if (recordTab === 'map' && (recordingStatus === 'recording' || recordingStatus === 'ready')) map.panTo([currentLocation.lat, currentLocation.lng], {animate: true, duration: 0.5});
    }
    if (liveMapPolylineRef.current) liveMapPolylineRef.current.setLatLngs(realGpsPoints.map(pt => [pt.lat, pt.lng]));
  }, [currentLocation, realGpsPoints, mobileScreen, recordTab, recordingStatus]);

  useEffect(() => {
     if (recordTab === 'map' && liveMapInstanceRef.current) {
        liveMapInstanceRef.current.invalidateSize();
        const timers = [100, 300].map(time => setTimeout(() => { if (liveMapInstanceRef.current) liveMapInstanceRef.current.invalidateSize(true); }, time));
        return () => timers.forEach(clearTimeout);
     }
  }, [recordTab]);

  const handlePhotoChange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    const allowedCount = 4 - uploadedPhotoFiles.length;
    const newFilesToProcess = files.slice(0, allowedCount);
    if (files.length > allowedCount) showToast(`Maks 4 foto. Hanya ${allowedCount} ditambahkan.`);
    showToast("⏳ Mengompresi foto...");
    try {
      const compressedFiles = await Promise.all(newFilesToProcess.map(file => compressImage(file, 1000, 1000, 0.7)));
      const newUrls = compressedFiles.map(f => URL.createObjectURL(f));
      setUploadedPhotoFiles(prev => [...prev, ...compressedFiles]); setUploadedPhotoUrls(prev => [...prev, ...newUrls]);
      showToast("✅ Foto dikompresi!");
    } catch (error) { showToast("⚠️ Gagal mengompresi foto."); }
  };

  const removePhoto = (index) => {
    setUploadedPhotoFiles(prev => prev.filter((_, i) => i !== index)); setUploadedPhotoUrls(prev => prev.filter((_, i) => i !== index));
  };

  const toggleDraftSelection = (id) => setSelectedDraftIds(prev => prev.includes(id) ? prev.filter(draftId => draftId !== id) : [...prev, id]);
  const selectAllDrafts = () => setSelectedDraftIds(selectedDraftIds.length === drafts.length ? [] : drafts.map(d => d.id));

  const editDraft = (draft) => {
    setFormData({ name: draft.name, kelurahan: draft.kelurahan, jenisJalan: draft.jenisJalan || 'Aspal', condition: draft.condition, notes: draft.notes });
    setRealGpsPoints(draft.realGps); setTotalDistance(parseFloat(draft.length) * 1000 || 0); setRecordingDuration(draft.duration || 0); setPinLocation(draft.pinLocation);
    setUploadedVideoFile(draft.videoFile || null); setUploadedVideoUrl(draft.localVideoUrl || null); setUploadedPhotoFiles(draft.photoFiles || []); setUploadedPhotoUrls(draft.localPhotoUrls || []);
    setEditingDraftId(draft.id); window.location.hash = '#/surveyor/form';     
  };

  const deleteDraft = (id) => {
    if(window.confirm("Hapus draft offline ini permanen?")) {
      setDrafts(prev => prev.filter(d => d.id !== id)); setSelectedDraftIds(prev => prev.filter(selId => selId !== id)); showToast("Draft dihapus.");
    }
  };

  const deleteSelectedDrafts = () => {
    if (selectedDraftIds.length === 0) return;
    if (window.confirm(`Hapus ${selectedDraftIds.length} draft terpilih?`)) {
      setDrafts(prev => prev.filter(d => !selectedDraftIds.includes(d.id))); setSelectedDraftIds([]); showToast("Draft terpilih dihapus.");
    }
  };

  const saveDraft = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return showToast("Nama jalan wajib!");
    if (realGpsPoints.length < 2) return showToast("Data GPS tidak mencukupi.");

    const simplifiedGps = simplifyGpsData(realGpsPoints, 0.00001); 
    const compressionRate = Math.round((1 - (simplifiedGps.length / realGpsPoints.length)) * 100);

    const newDraft = {
      id: editingDraftId || ("DRAFT-" + Math.floor(Math.random() * 100000)), 
      name: formData.name, kelurahan: formData.kelurahan, jenisJalan: formData.jenisJalan, condition: formData.condition, notes: formData.notes,
      realGps: simplifiedGps, pinLocation: pinLocation, 
      videoFile: uploadedVideoFile, localVideoUrl: uploadedVideoUrl, photoFiles: uploadedPhotoFiles, localPhotoUrls: uploadedPhotoUrls,
      length: (totalDistance / 1000).toFixed(3), duration: recordingDuration,
      date: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
      surveyor: "Tim PUPR", isUploaded: false, 
    };
    
    if (editingDraftId) { setDrafts(prev => prev.map(d => d.id === editingDraftId ? newDraft : d)); showToast("Draft diperbarui!"); } 
    else { setDrafts(prev => [...prev, newDraft]); showToast(compressionRate > 0 ? `Tersimpan! Kompresi GPS ${compressionRate}%` : "Tersimpan ke Draf Luring!"); }

    setFormData({ name: '', kelurahan: KELURAHAN_LIST[0], jenisJalan: 'Aspal', condition: 'Baik', notes: '' });
    setUploadedVideoFile(null); setUploadedVideoUrl(null); setUploadedPhotoFiles([]); setUploadedPhotoUrls([]); setPinLocation(null); setEditingDraftId(null); window.location.hash = '#/surveyor/drafts'; 
  };

  const syncDataToCloud = async () => {
    const draftsToUpload = drafts.filter(d => selectedDraftIds.includes(d.id));
    if (draftsToUpload.length === 0) return showToast("Pilih draft yang ingin diunggah!");
    if (!supabase) return showToast("Konfigurasi Supabase Anda belum diatur.");

    setIsSyncing(true); setSyncMessage("Mempersiapkan data...");
    
    try {
      let uploadCount = 0;
      for (let i = 0; i < draftsToUpload.length; i++) {
        const draft = draftsToUpload[i]; let finalVideoUrl = null; let finalPhotoUrls = [];

        if (draft.videoFile) {
          setSyncMessage(`Mengunggah Video... (Rute ${i+1}/${draftsToUpload.length})`);
          const formData = new FormData(); formData.append('file', draft.videoFile); formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
          try {
             const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`, { method: 'POST', body: formData });
             const data = await res.json();
             if (data.secure_url) finalVideoUrl = data.secure_url; else throw new Error(data.error?.message);
          } catch (e) { showToast(`Video rute ${draft.name} gagal diunggah.`); }
        }

        if (draft.photoFiles && draft.photoFiles.length > 0) {
          setSyncMessage(`Mengunggah Foto... (Rute ${i+1}/${draftsToUpload.length})`);
          for (let j = 0; j < draft.photoFiles.length; j++) {
            const formData = new FormData(); formData.append('file', draft.photoFiles[j]); formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
            try {
               const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: formData });
               const data = await res.json(); if (data.secure_url) finalPhotoUrls.push(data.secure_url);
            } catch (e) {}
          }
        }

        setSyncMessage(`Menyimpan Rute ${i+1}/${draftsToUpload.length} ke Database...`);
        const { id, videoFile, localVideoUrl, photoFiles, localPhotoUrls, isUploaded, ...dataToUpload } = draft; 
        dataToUpload.realGps = JSON.stringify(dataToUpload.realGps); 
        if(dataToUpload.pinLocation) dataToUpload.pinLocation = JSON.stringify(dataToUpload.pinLocation);
        dataToUpload.videoUrl = finalVideoUrl; dataToUpload.photoUrls = JSON.stringify(finalPhotoUrls); 
        
        const { error: dbError } = await supabase.from('mapped_roads').insert([dataToUpload]);
        if (dbError) throw dbError;
        uploadCount++;
      }
      
      setSyncMessage("Selesai!"); showToast(`${uploadCount} Rute Diunggah ke Server!`);
      setDrafts(prev => prev.map(d => selectedDraftIds.includes(d.id) ? { ...d, isUploaded: true } : d));
      setSelectedDraftIds([]); fetchRoads();
    } catch (error) { showToast(`Gagal mengunggah: ${error.message}`); } finally { setIsSyncing(false); setSyncMessage(""); }
  };

  const hapusDataCloud = async (dbId) => {
     if(!supabase) return;
     if(!window.confirm("Hapus rute ini dari database pusat?")) return;
     try {
        const { error } = await supabase.from('mapped_roads').delete().eq('id', dbId);
        if(error) throw error;
        showToast("Rute dihapus."); fetchRoads(); 
        if (window.location.hash === '#/admin/detail') window.history.back();
        else setSelectedRoad(null);
     } catch (err) { showToast("Gagal menghapus."); }
  };

  const handleExportKML = () => {
    if (!selectedRoad || !selectedRoad.realGps || selectedRoad.realGps.length === 0) return showToast("Tidak ada data rute GPS.");
    const coordinates = selectedRoad.realGps.map(pt => `${pt.lng},${pt.lat},0`).join(' ');
    let colorHex = getConditionColor(selectedRoad.condition).replace('#', '');
    let kmlColor = colorHex.length === 6 ? `ff${colorHex.substring(4,6)}${colorHex.substring(2,4)}${colorHex.substring(0,2)}` : 'ffff0000';
    let pinPlacemark = selectedRoad.pinLocation && selectedRoad.pinLocation.lat ? `<Placemark><name>Pin</name><Point><coordinates>${selectedRoad.pinLocation.lng},${selectedRoad.pinLocation.lat},0</coordinates></Point></Placemark>` : '';

    const kmlContent = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${selectedRoad.name}</name><Style id="routeStyle"><LineStyle><color>${kmlColor}</color><width>5</width></LineStyle></Style><Placemark><styleUrl>#routeStyle</styleUrl><LineString><tessellate>1</tessellate><coordinates>${coordinates}</coordinates></LineString></Placemark>${pinPlacemark}</Document></kml>`;
    const blob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `Rute_${selectedRoad.name.replace(/\s+/g, '_')}.kml`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handleShareLocation = () => {
    if (!selectedRoad || !selectedRoad.pinLocation || !selectedRoad.pinLocation.lat) return showToast("Pin lokasi tidak tersedia.");
    const shareText = `Lokasi: ${selectedRoad.name} (${selectedRoad.condition}). Map: https://www.google.com/maps?q=${selectedRoad.pinLocation.lat},${selectedRoad.pinLocation.lng}`;
    if (navigator.share) navigator.share({ title: selectedRoad.name, text: shareText, url: `https://www.google.com/maps?q=${selectedRoad.pinLocation.lat},${selectedRoad.pinLocation.lng}` }).catch(()=>{});
    else {
      const textArea = document.createElement("textarea"); textArea.value = shareText; document.body.appendChild(textArea); textArea.select();
      try { document.execCommand('copy'); showToast("Tautan disalin ke clipboard!"); } catch (err) {} document.body.removeChild(textArea);
    }
  };

  const handlePrint = async () => {
    if (!selectedRoad) return;
    let snapshots = [];
    if (selectedRoad.videoUrl) {
      try {
        const videoEl = document.getElementById('admin-vid-player');
        if (videoEl && videoEl.readyState >= 2 && videoEl.duration > 0) { 
          showToast("Mengekstrak frame video...");
          const originalTime = videoEl.currentTime; const isPaused = videoEl.paused; const duration = videoEl.duration;
          for (let t of [duration * 0.1, duration * 0.35, duration * 0.6, duration * 0.85]) {
             await new Promise(resolve => {
                const onSeeked = () => {
                   videoEl.removeEventListener('seeked', onSeeked); clearTimeout(fallback); 
                   try {
                     const canvas = document.createElement('canvas'); canvas.width = videoEl.videoWidth; canvas.height = videoEl.videoHeight;
                     canvas.getContext('2d').drawImage(videoEl, 0, 0, canvas.width, canvas.height);
                     snapshots.push(canvas.toDataURL('image/jpeg', 0.8));
                   } catch(e) {}
                   resolve();
                };
                const fallback = setTimeout(() => { videoEl.removeEventListener('seeked', onSeeked); resolve(); }, 1500); 
                videoEl.addEventListener('seeked', onSeeked); videoEl.currentTime = t; 
             });
          }
          videoEl.currentTime = originalTime; if (!isPaused) videoEl.play();
        }
      } catch (err) {}
    } 
    setVideoSnapshot(snapshots); setTimeout(() => { window.print(); }, 800);
  };

  return (
    <div className="fixed inset-0 w-full overflow-hidden bg-slate-900 text-slate-900 font-sans print:relative print:h-auto print:overflow-visible print:bg-white">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <style dangerouslySetInnerHTML={{__html: `
        .leaflet-container { width: 100%; height: 100%; min-height: 100%; z-index: 10; touch-action: none; }
        .animate-fade-in-up { animation: fadeInUp 0.3s ease-out forwards; }
        @keyframes fadeInUp { from { opacity: 0; transform: translate(-50%, 20px); } to { opacity: 1; transform: translate(-50%, 0); } }
        .animate-fade-in { animation: fadeIn 0.2s ease-out forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
        body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background-color: #0f172a; overscroll-behavior: none; overflow: hidden; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(148, 163, 184, 0.5); border-radius: 10px; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        
        /* Dark Scrollbar untuk Sidebar Admin */
        .custom-scrollbar-dark::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar-dark::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar-dark::-webkit-scrollbar-thumb { background-color: #4a5568; border-radius: 10px; }
        .custom-scrollbar-dark::-webkit-scrollbar-thumb:hover { background-color: #718096; }

        @media screen and (max-width: 768px) { input, select, textarea { font-size: 16px !important; } }
        .leaflet-left { transition: left 0.3s ease-in-out; }
        
        .leaflet-control-layers-toggle { width: 30px !important; height: 30px !important; background-size: 16px !important; }
        .leaflet-touch .leaflet-control-layers-toggle { width: 34px !important; height: 34px !important; background-size: 18px !important; }
        
        /* OVERRIDE DESAIN POPUP LEAFLET AGAR LEBIH RAPAT DAN SUDUT MEMBULAT */
        .leaflet-popup-content-wrapper { border-radius: 12px !important; padding: 0 !important; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1) !important; }
        .leaflet-popup-content { margin: 14px 16px !important; width: 260px !important; line-height: 1.4 !important; }
        .leaflet-popup-close-button { top: 8px !important; right: 8px !important; color: #ef4444 !important; font-weight: bold !important; font-size: 16px !important; }
        .leaflet-popup-close-button:hover { color: #dc2626 !important; }
        .btn-detail-popup { margin-top: 10px; width: 100%; background-color: #3b82f6; color: white; border: none; padding: 8px; border-radius: 8px; font-weight: 700; font-size: 12px; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3); display: flex; justify-content: center; align-items: center; gap: 6px; }
        .btn-detail-popup:hover { background-color: #2563eb; }
        
        @media print {
          @page { size: A4; margin: 20mm; } 
          body { background-color: white !important; overflow: auto !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-hidden { display: none !important; } 
        }
      `}} />

      {toastMessage && (
        <div className="fixed top-14 md:top-6 left-1/2 transform -translate-x-1/2 z-50 bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center space-x-3 transition-all animate-bounce border border-slate-700 print-hidden">
          <span className="text-sm font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* --- HALAMAN LANDING PAGE --- */}
      {!appRole && (
        <div className="h-full flex items-center justify-center p-4 bg-slate-900 print-hidden overflow-y-auto">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 text-center border-4 border-slate-800">
            <div className="mx-auto w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white mb-6 shadow-lg shadow-blue-500/30">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.246a1.5 1.5 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" /></svg>
            </div>
            <h1 className="text-3xl font-black text-slate-900 mb-2">R-Map Sistem</h1>
            <p className="text-slate-500 text-sm mb-6">Pilih peran Anda untuk masuk ke dalam sistem terpadu.</p>

            {(!supabase) && (
              <div className="mb-6 p-4 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-xs text-left">
                <strong className="block mb-1 text-amber-900">⚠️ Supabase Belum Terhubung</strong>
                Sistem sedang memuat atau kredensial Anda belum dimasukkan dengan benar.
              </div>
            )}

            <div className="space-y-4">
              <button onClick={() => { window.location.hash = '#/surveyor/home'; }} className="w-full bg-white border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50 text-slate-800 p-4 rounded-2xl flex items-center transition-all group">
                <div className="bg-blue-100 text-blue-600 p-3 rounded-xl mr-4 group-hover:scale-110 transition-transform">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" /></svg>
                </div>
                <div className="text-left">
                  <h3 className="font-extrabold text-slate-900">Aplikasi Surveyor</h3>
                  <p className="text-xs text-slate-500">Akses Perekaman Kamera & GPS</p>
                </div>
              </button>

              <button onClick={() => { window.location.hash = '#/admin'; fetchRoads(); }} className="w-full bg-white border-2 border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 text-slate-800 p-4 rounded-2xl flex items-center transition-all group">
                <div className="bg-emerald-100 text-emerald-600 p-3 rounded-xl mr-4 group-hover:scale-110 transition-transform">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" /></svg>
                </div>
                <div className="text-left">
                  <h3 className="font-extrabold text-slate-900">Dasbor Admin</h3>
                  <p className="text-xs text-slate-500">Pusat Analisis & Peta WebGIS</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- APLIKASI SURVEYOR MOBILE --- */}
      {appRole === 'surveyor' && (
        <div className="h-full bg-slate-50 flex flex-col md:max-w-md md:mx-auto md:shadow-2xl md:border-x border-slate-200 relative print-hidden">
          
          {isSyncing && (
            <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50">
              <div className="bg-white p-6 rounded-2xl shadow-2xl flex flex-col items-center max-w-[80%] text-center">
                <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                <h3 className="font-black text-slate-800 mb-1">Menyinkronkan Data</h3>
                <p className="text-sm font-bold text-blue-600 animate-pulse">{syncMessage}</p>
                <p className="text-xs text-slate-500 mt-2">Jangan tutup aplikasi saat proses ini berlangsung.</p>
              </div>
            </div>
          )}

          <div className="flex-1 bg-white relative flex flex-col overflow-hidden">
            {mobileScreen === 'home' && (
              <div className="flex-1 p-6 flex flex-col overflow-y-auto">
                <div className="flex justify-end mb-2">
                   <button onClick={() => { window.location.hash = '#/'; }} className="text-rose-500 font-bold text-xs bg-rose-50 px-4 py-2 rounded-xl hover:bg-rose-100 transition-colors">Keluar</button>
                </div>

                <div className="flex space-x-3 mb-4 mt-2">
                    <button onClick={startRealHardware} className="w-1/2 bg-white border-2 border-blue-500 hover:bg-blue-50 text-slate-800 rounded-3xl p-5 shadow-sm transition-all flex flex-col items-center justify-center group">
                        <div className="bg-blue-100 text-blue-600 p-3 rounded-full mb-3 group-hover:scale-110 transition-transform">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                        </div>
                        <span className="font-extrabold text-sm leading-tight text-center group-hover:text-blue-700 transition-colors">Rekam<br/>GPS Live</span>
                    </button>

                    <button onClick={startManualDrawing} className="w-1/2 bg-white border-2 border-emerald-500 hover:bg-emerald-50 text-slate-800 rounded-3xl p-5 shadow-sm transition-all flex flex-col items-center justify-center group">
                        <div className="bg-emerald-100 text-emerald-600 p-3 rounded-full mb-3 group-hover:scale-110 transition-transform">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zm-7.518-.267A8.25 8.25 0 1120.25 10.5M8.288 14.212A5.25 5.25 0 1117.25 10.5" /></svg>
                        </div>
                        <span className="font-extrabold text-sm leading-tight text-center group-hover:text-emerald-700 transition-colors">Gambar<br/>Rute Manual</span>
                    </button>
                </div>

                <button onClick={() => { window.location.hash = '#/surveyor/drafts'; }} className="w-full bg-white border-2 border-slate-200 text-slate-800 rounded-3xl p-5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center space-x-4">
                    <div className="text-slate-600 pl-1">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-7 h-7"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-lg">Draft</div>
                    </div>
                  </div>
                  <span className="bg-rose-500 text-white px-3 py-1 rounded-full text-sm font-bold">{drafts.length}</span>
                </button>
              </div>
            )}

            {mobileScreen === 'draw_map' && (
              <div className="flex-1 flex flex-col bg-slate-100 relative overflow-hidden">
                <div className="flex-1 relative z-0">
                   <div ref={drawMapContainerRef} className="absolute inset-0 bg-slate-200 cursor-crosshair"></div>
                   {!isLeafletLoaded && <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-sm font-bold text-slate-400 z-10 pointer-events-none">Memuatkan Peta...</div>}
                </div>

                <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-slate-900/70 to-transparent z-10 pointer-events-none"></div>
                
                <div className="absolute bottom-[220px] right-4 z-20">
                     <button onClick={() => {
                             if (drawMapInstanceRef.current && currentLocation) drawMapInstanceRef.current.flyTo([currentLocation.lat, currentLocation.lng], 17, { duration: 0.6 });
                             else if (!currentLocation) showToast("Mencari sinyal GPS...");
                         }}
                         className="bg-white/95 backdrop-blur-md p-3.5 rounded-full shadow-xl border border-slate-200/80 text-blue-600 hover:bg-blue-50"
                     >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                     </button>
                </div>

                <div className="absolute bottom-6 left-4 right-4 z-20 flex flex-col gap-3">
                     <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/80 p-4 flex justify-between items-center">
                         <div>
                            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Total Titik: <span className="text-blue-600 font-black">{manualDrawnPoints.length}</span></div>
                            <div className="text-xl font-black text-slate-900 leading-none">
                               {totalDistance < 1000 ? Math.round(totalDistance) : (totalDistance/1000).toFixed(2)} <span className="text-sm font-medium text-slate-500">{totalDistance < 1000 ? 'm' : 'km'}</span>
                            </div>
                         </div>
                         <button onClick={undoLastDrawnPoint} disabled={manualDrawnPoints.length === 0} className={`p-3.5 rounded-full flex items-center justify-center transition-all border shadow-sm ${manualDrawnPoints.length > 0 ? 'bg-amber-100 border-amber-200 text-amber-700 hover:bg-amber-200' : 'bg-slate-100 border-slate-200 text-slate-400 opacity-50 cursor-not-allowed'}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
                         </button>
                     </div>

                     <div className="w-full flex space-x-3">
                         <button onClick={() => { window.location.hash = '#/surveyor/home'; }} className="w-1/3 bg-slate-800/80 backdrop-blur-md border border-white/10 text-white rounded-2xl py-3.5 font-bold text-sm shadow-lg">Batal</button>
                         <button onClick={finishManualDrawing} disabled={manualDrawnPoints.length < 2} className={`w-2/3 py-3.5 rounded-2xl font-black text-sm shadow-xl flex justify-center items-center space-x-2 border ${manualDrawnPoints.length >= 2 ? 'bg-emerald-500 text-white border-emerald-400 hover:bg-emerald-600' : 'bg-slate-800/95 backdrop-blur-md text-slate-400 border-white/5 cursor-not-allowed scale-95'}`}>
                             <span>SELESAI GAMBAR</span>
                         </button>
                     </div>
                </div>
              </div>
            )}

            {mobileScreen === 'record' && (
              <div className="flex-1 relative bg-slate-900 text-white overflow-hidden">
                <video ref={videoRef} autoPlay playsInline muted className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${recordTab === 'camera' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}/>
                <div className={`absolute inset-0 w-full h-full bg-slate-200 transition-opacity duration-300 ${recordTab === 'map' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}><div ref={liveMapContainerRef} className="w-full h-full"></div></div>
                <div className="absolute bottom-0 left-0 right-0 h-56 bg-gradient-to-t from-slate-950 via-slate-900/60 to-transparent z-20 pointer-events-none"></div>

                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-30 bg-slate-100/90 backdrop-blur-md rounded-full p-1.5 flex shadow-lg border border-slate-200">
                    <button onClick={() => setRecordTab('camera')} className={`px-5 py-2 rounded-full text-xs font-black transition-all ${recordTab === 'camera' ? 'bg-blue-600 text-white shadow-sm border border-blue-600' : 'text-slate-500'}`}>Kamera</button>
                    <button onClick={() => setRecordTab('map')} className={`px-5 py-2 rounded-full text-xs font-black transition-all flex items-center space-x-1.5 ${recordTab === 'map' ? 'bg-blue-600 text-white shadow-sm border border-blue-600' : 'text-slate-500'}`}>
                        <span>Live</span>{recordingStatus === 'recording' && <span className="w-2 h-2 bg-red-400 rounded-full animate-pulse border border-white/50"></span>}
                    </button>
                </div>

                <div className="absolute top-[68px] left-1/2 transform -translate-x-1/2 z-30 flex flex-col items-center pointer-events-none w-full px-4">
                     {recordingStatus === 'locating' && (<div className="bg-amber-500/95 px-5 py-2.5 rounded-full text-xs font-black flex items-center space-x-2 shadow-xl backdrop-blur-md text-white"><svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg><span>Mencari GPS... ({gpsAccuracy}m)</span></div>)}
                     {recordingStatus === 'ready' && (<div className="bg-emerald-500/95 px-5 py-2.5 rounded-full text-xs font-black flex items-center space-x-2 shadow-xl backdrop-blur-md text-white animate-pulse"><span className="text-sm">✅</span><span>GPS Siap! Mulai ({gpsAccuracy}m)</span></div>)}
                     {recordingStatus === 'recording' && (<div className="bg-red-600/90 px-4 py-1.5 rounded-full text-[11px] font-black flex items-center space-x-2 shadow-xl backdrop-blur-md text-white animate-pulse"><div className="w-2.5 h-2.5 bg-white rounded-full"></div><span>MEREKAM AKTIF</span></div>)}
                     {recordingStatus === 'paused' && (<div className="bg-amber-500/90 px-5 py-2 rounded-full text-xs font-black shadow-xl backdrop-blur-md text-white">⏸️ JEDA REKAMAN</div>)}
                </div>
                  
                {recordTab === 'camera' && (
                  <div className="absolute top-[68px] right-4 z-30">
                    <button onClick={() => { if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; } }} className="bg-black/50 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold backdrop-blur-sm">Off Video</button>
                  </div>
                )}

                <div className="absolute bottom-[80px] left-4 right-4 bg-white/95 backdrop-blur-xl p-3.5 rounded-3xl border border-slate-200 z-30 shadow-2xl flex flex-col gap-3">
                    <div className="flex justify-between items-center text-[10px] bg-slate-100 rounded-xl px-3 py-2 border border-slate-200">
                        <span className="text-blue-600 font-bold flex items-center gap-1.5"><div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>Log: {realGpsPoints.length}</span>
                        <span className="text-emerald-600 font-mono tracking-tight font-bold">{realGpsPoints.length > 0 ? `${realGpsPoints[realGpsPoints.length-1].lat.toFixed(5)}, ${realGpsPoints[realGpsPoints.length-1].lng.toFixed(5)}` : 'Satelit...'}</span>
                    </div>

                    <div className="flex justify-between items-center px-1">
                        <div className="text-center w-1/4"><div className="text-slate-500 text-[9px] uppercase font-bold tracking-widest mb-0.5">Waktu</div><div className="text-lg md:text-xl font-black text-slate-900 leading-none">{formatDuration(recordingDuration)}</div></div>
                        <div className="w-px h-8 bg-slate-200"></div>
                        <div className="text-center w-1/4"><div className="text-slate-500 text-[9px] uppercase font-bold tracking-widest mb-0.5">Jarak</div><div className="text-lg md:text-xl font-black text-slate-900 leading-none">{totalDistance < 1000 ? Math.round(totalDistance) : (totalDistance/1000).toFixed(2)} <span className="text-[10px] font-medium text-slate-500">{totalDistance < 1000 ? 'm' : 'km'}</span></div></div>
                        <div className="w-px h-8 bg-slate-200"></div>
                        <div className="text-center w-1/4"><div className="text-slate-500 text-[9px] uppercase font-bold tracking-widest mb-0.5">Speed</div><div className="text-lg md:text-xl font-black text-slate-900 leading-none">{currentSpeed} <span className="text-[10px] font-medium text-slate-500">km/h</span></div></div>
                        <div className="w-px h-8 bg-slate-200"></div>
                        <div className="text-center w-1/4"><div className="text-slate-500 text-[9px] uppercase font-bold tracking-widest mb-0.5">Akurasi</div><div className={`text-lg md:text-xl font-black leading-none ${gpsAccuracy === '-' ? 'text-slate-900' : gpsAccuracy < 15 ? 'text-emerald-600' : 'text-amber-500'}`}>{gpsAccuracy} <span className="text-[10px] font-medium text-slate-500">m</span></div></div>
                    </div>
                </div>

                <div className="absolute bottom-4 left-4 right-4 z-30 flex items-center justify-center">
                  {recordingStatus === 'locating' || recordingStatus === 'ready' ? (
                     <div className="w-full flex space-x-3">
                         <button onClick={cancelRecording} className="w-1/3 bg-slate-800/80 backdrop-blur-md text-white rounded-2xl py-3.5 font-bold text-sm shadow-lg">Batal</button>
                         <button onClick={() => setRecordingStatus('recording')} disabled={recordingStatus === 'locating'} className={`w-2/3 py-3.5 rounded-2xl font-black text-sm shadow-xl flex justify-center items-center ${recordingStatus === 'ready' ? 'bg-emerald-500 text-white' : 'bg-slate-800/80 text-slate-400 cursor-not-allowed'}`}>{recordingStatus === 'locating' ? 'Mencari...' : 'START'}</button>
                     </div>
                  ) : (
                     <div className="w-full flex space-x-3">
                         {(recordingStatus === 'recording' || recordingStatus === 'auto_paused') && (
                             <><button onClick={() => setRecordingStatus('paused')} className="w-1/2 bg-amber-500 text-white rounded-2xl py-3.5 font-black text-sm shadow-xl flex justify-center items-center space-x-2"><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg><span>JEDA</span></button><button onClick={stopRealHardware} className="w-1/2 bg-red-600 text-white rounded-2xl py-3.5 font-black text-sm shadow-xl flex justify-center items-center space-x-2"><div className="w-4 h-4 bg-white rounded-sm"></div><span>SELESAI</span></button></>
                         )}
                         {recordingStatus === 'paused' && (
                             <><button onClick={() => setRecordingStatus('recording')} className="w-1/2 bg-blue-500 text-white rounded-2xl py-3.5 font-black text-sm shadow-xl flex justify-center items-center space-x-2"><svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg><span>LANJUT</span></button><button onClick={stopRealHardware} className="w-1/2 bg-red-600 text-white rounded-2xl py-3.5 font-black text-sm shadow-xl flex justify-center items-center space-x-2"><div className="w-4 h-4 bg-white rounded-sm"></div><span>SELESAI</span></button></>
                         )}
                     </div>
                  )}
                </div>
              </div>
            )}

            {mobileScreen === 'form' && (
              <div className="flex-1 p-5 overflow-y-auto bg-white text-left custom-scrollbar">
                <div className="bg-slate-50 p-4 rounded-3xl mb-6 flex items-center justify-between border border-slate-100">
                  <div className="flex items-center space-x-3">
                    <div className="bg-blue-100 text-blue-600 p-2.5 rounded-2xl"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg></div>
                    <div><div className="text-slate-900 font-bold text-sm">Jalur Tersimpan</div><div className="text-slate-500 text-xs">{realGpsPoints.length} ttk | {(totalDistance/1000).toFixed(2)} km</div></div>
                  </div>
                  <button type="button" onClick={() => { window.location.hash = '#/surveyor/pin_map'; }} className="bg-white hover:bg-slate-100 text-blue-600 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold active:scale-95">Lihat Peta</button>
                </div>

                <form onSubmit={saveDraft} className="space-y-5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Pin Lokasi Utama</label>
                    <div className="bg-slate-50 px-4 py-3 min-h-[3.5rem] rounded-2xl flex items-center justify-between border border-slate-100">
                      <div className={`flex flex-col justify-center ${pinLocation ? 'text-blue-600' : 'text-slate-500'}`}><span className="text-sm font-semibold">{pinLocation ? '📍 Lokasi Terkunci' : 'Belum ditandai'}</span></div>
                      <button type="button" onClick={() => { window.location.hash = '#/surveyor/pin_map'; }} className="text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg text-xs font-bold">{pinLocation ? 'Ubah' : 'Buka Peta'}</button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Nama Jalan</label>
                    <input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="Cth: Jl. Poros Utama" className="w-full bg-slate-50 px-4 py-3.5 rounded-2xl text-base outline-none focus:ring-2 focus:ring-blue-500" required />
                  </div>
                  
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Kelurahan</label>
                    <select value={formData.kelurahan} onChange={(e) => setFormData({...formData, kelurahan: e.target.value})} className="w-full bg-slate-50 px-4 py-3.5 rounded-2xl text-base outline-none focus:ring-2 focus:ring-blue-500">
                      {KELURAHAN_LIST.map(k => <option key={k} value={k}>{formatKel(k)}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Jenis Material</label>
                    <div className="flex bg-slate-50 p-1 rounded-2xl border border-slate-100">
                      {['Tanah', 'Aspal', 'Beton'].map(jenis => (<button key={jenis} type="button" onClick={() => setFormData({...formData, jenisJalan: jenis})} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold ${formData.jenisJalan === jenis ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>{jenis}</button>))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Kondisi</label>
                    <div className="grid grid-cols-2 gap-2">
                      {['Baik', 'Rusak Ringan', 'Rusak Sedang', 'Rusak Parah'].map(cond => {
                        const isActive = formData.condition === cond; const condColor = getConditionColor(cond);
                        return (<button key={cond} type="button" onClick={() => setFormData({...formData, condition: cond})} className={`py-3 rounded-2xl text-sm font-semibold flex items-center justify-center space-x-2 border ${isActive ? 'text-white shadow-md' : 'bg-slate-50 text-slate-600 border-slate-100'}`} style={isActive ? { backgroundColor: condColor, borderColor: condColor } : {}}><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: isActive ? '#fff' : condColor }}></span><span>{cond}</span></button>);
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Catatan Lapangan</label>
                    <textarea value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} className="w-full bg-slate-50 px-4 py-3.5 rounded-2xl text-base outline-none focus:ring-2 focus:ring-blue-500 resize-none min-h-[80px]" placeholder="Ketik keterangan..."></textarea>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2"><label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Foto ({uploadedPhotoUrls.length}/4)</label></div>
                    {uploadedPhotoUrls.length < 4 && (
                      <div className="relative border border-dashed border-slate-300 rounded-2xl px-4 py-3 min-h-[3.5rem] flex items-center justify-center bg-slate-50 mb-3">
                        <input type="file" accept="image/*" multiple onChange={handlePhotoChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                        <div className="text-slate-500 text-sm font-medium flex items-center gap-2">Tambah Foto</div>
                      </div>
                    )}
                    {uploadedPhotoUrls.length > 0 && (
                      <div className="grid grid-cols-4 gap-2 mb-2">
                        {uploadedPhotoUrls.map((url, idx) => (
                          <div key={idx} className="relative aspect-square rounded-xl overflow-hidden bg-slate-100">
                            <img src={url} alt={`Prev ${idx}`} className="w-full h-full object-cover" />
                            <button type="button" onClick={() => removePhoto(idx)} className="absolute top-1 right-1 bg-red-500/90 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">x</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Video (Maks 150MB)</label>
                    {!uploadedVideoUrl ? (
                      <div className="relative border border-dashed border-slate-300 rounded-2xl px-4 py-3 min-h-[3.5rem] flex items-center justify-center bg-slate-50">
                        <input type="file" accept="video/*" onChange={(e) => { 
                            const f = e.target.files[0]; 
                            if(f){ 
                              if (f.size > 150*1024*1024) return showToast("Ukuran video melebihi 150MB.");
                              setUploadedVideoUrl(URL.createObjectURL(f)); setUploadedVideoFile(f); showToast("Video disiapkan."); 
                            } 
                          }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                        <div className="text-slate-500 text-sm font-medium flex items-center gap-2">Pilih Video</div>
                      </div>
                    ) : (
                      <div className="bg-emerald-50 rounded-2xl px-4 py-3 min-h-[3.5rem] flex items-center justify-between border border-emerald-100">
                         <div className="text-emerald-700 font-medium text-sm truncate max-w-[200px]">{uploadedVideoFile?.name || 'video.mp4'}</div>
                         <button type="button" onClick={() => { setUploadedVideoUrl(null); setUploadedVideoFile(null); }} className="text-rose-500 p-1.5">x</button>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 pb-8 flex flex-col space-y-3">
                    <button type="submit" className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-base shadow-sm">{editingDraftId ? 'Perbarui Draft' : 'Simpan ke Draft'}</button>
                    <button type="button" onClick={() => { window.location.hash = editingDraftId ? '#/surveyor/drafts' : '#/surveyor/home'; setEditingDraftId(null); }} className="w-full bg-white border border-slate-200 text-slate-600 py-3.5 rounded-2xl font-bold text-sm">Batal</button>
                  </div>
                </form>
              </div>
            )}

            {mobileScreen === 'pin_map' && (
              <div className="flex-1 flex flex-col bg-slate-100 relative">
                <div className="bg-white px-5 py-4 border-b border-slate-200 flex justify-between items-center z-10 shadow-sm">
                  <div><h3 className="font-extrabold text-slate-800 text-base">Letakkan Pin</h3></div>
                  <button onClick={() => { window.location.hash = '#/surveyor/form'; }} className="bg-blue-600 text-white px-6 py-2 rounded-full font-bold text-sm shadow-md">Selesai</button>
                </div>
                <div className="absolute bottom-6 right-4 z-20"><button onClick={() => currentLocation && surveyorMapInstanceRef.current.setView([currentLocation.lat, currentLocation.lng], 18)} className="bg-white p-3 rounded-full shadow-xl text-blue-600">GPS</button></div>
                <div className="flex-1 relative z-0"><div ref={surveyorMapContainerRef} className="absolute inset-0 bg-slate-200"></div></div>
              </div>
            )}

            {mobileScreen === 'drafts' && (
              <div className="absolute inset-0 flex flex-col bg-slate-100 text-left z-20">
                <div className="px-6 pt-8 pb-2 flex-shrink-0 bg-slate-100 z-10">
                  <div className="flex justify-end mb-4"><button onClick={() => { window.location.hash = '#/surveyor/home'; }} className="bg-slate-200 text-slate-600 px-4 py-2 rounded-full font-bold text-sm">Tutup</button></div>
                  {drafts.length > 0 && (
                     <div className="mb-2 flex justify-between items-center bg-white px-4 py-2.5 rounded-2xl shadow-sm cursor-pointer" onClick={selectAllDrafts}>
                       <span className="text-sm font-bold text-slate-700">Pilih Semua</span>
                       <div className={`w-5 h-5 rounded-full border-2 ${selectedDraftIds.length === drafts.length ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}></div>
                     </div>
                  )}
                </div>

                <div className="flex-1 space-y-2.5 overflow-y-auto px-6 pb-4 custom-scrollbar">
                  {drafts.length === 0 ? (<div className="text-center text-slate-400 mt-10 p-8 border-2 border-dashed border-slate-300 rounded-2xl">Belum ada survei tersimpan.</div>) : (
                    drafts.map(d => {
                      const isSelected = selectedDraftIds.includes(d.id);
                      return (
                      <div key={d.id} onClick={() => toggleDraftSelection(d.id)} className={`px-3 py-2.5 rounded-2xl border shadow-sm flex items-center cursor-pointer ${isSelected ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'bg-white'}`}>
                        <div className="pl-1.5 pr-3"><div className={`w-5 h-5 rounded-full border-2 ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}></div></div>
                        <div className="flex-1">
                          <div className="flex justify-between items-center">
                             <div className="font-extrabold text-sm truncate max-w-[140px]">{d.name}</div>
                             <button onClick={(e) => { e.stopPropagation(); editDraft(d); }} className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-xl text-xs font-bold">Edit</button>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-1">{d.isUploaded ? '✅ Terunggah' : 'Menunggu Unggah'}</div>
                        </div>
                      </div>
                      );
                    })
                  )}
                </div>

                {drafts.length > 0 && (
                  <div className="p-4 bg-white border-t border-slate-200 flex space-x-3">
                    <button onClick={deleteSelectedDrafts} disabled={selectedDraftIds.length === 0} className={`w-1/3 py-4 rounded-2xl font-black text-sm ${selectedDraftIds.length > 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-400'}`}>HAPUS</button>
                    <button onClick={syncDataToCloud} disabled={selectedDraftIds.length === 0} className={`w-2/3 py-4 rounded-2xl text-white font-black text-sm ${isDbConnected && selectedDraftIds.length > 0 ? 'bg-blue-600' : 'bg-slate-400'}`}>UNGGAH ({selectedDraftIds.length})</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- RENDER DASBOR ADMIN --- */}
      {appRole === 'admin' && (
        <div className="h-full bg-[#1e2530] flex flex-col font-sans select-none overflow-hidden relative print-hidden">
          
          {/* --- HEADER MAP AREA (Di atas Sidebar) --- */}
          <header className="bg-white border-b border-slate-200 px-4 md:px-6 flex justify-between items-center z-[1100] shadow-sm h-14 md:h-16 shrink-0 relative w-full">
            <div className="flex items-center space-x-2 md:space-x-3">
              <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1.5 md:p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" /></svg>
              </button>
              <div className="hidden md:block bg-blue-600 text-white p-2 rounded-lg"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.246a1.5 1.5 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" /></svg></div>
            </div>
            <div className="flex items-center space-x-2 md:space-x-4">
              <button onClick={() => fetchRoads()} className="text-slate-600 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold">Refresh</button>
              <button onClick={() => { window.location.hash = '#/'; }} className="text-rose-500 border border-rose-200 px-3 py-1.5 rounded-lg text-xs font-bold">Keluar</button>
            </div>
          </header>

          {/* --- AREA BAWAH HEADER (SIDEBAR & MAP) --- */}
          <div className="flex-1 flex relative overflow-hidden w-full">
            
            {/* Overlay Layar Gelap Mobile */}
            {isSidebarOpen && <div className="md:hidden absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-[900]" onClick={() => setIsSidebarOpen(false)}></div>}

            {/* --- SIDEBAR KIRI (LIGHT GLASSMORPHISM LAYER LIST 20%) --- */}
            <aside className={`bg-white/20 backdrop-blur-xl flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.1)] transition-all duration-300 ease-in-out overflow-hidden z-[1000] absolute top-0 left-0 h-full border-r border-white/30 ${isSidebarOpen ? 'w-[85vw] md:w-[340px]' : 'w-0 border-r-0'}`}>
              <div className="w-[85vw] md:w-[340px] flex flex-col h-full flex-shrink-0 text-slate-800">
                
                {/* Header Sidebar Internal */}
                <div className="p-4 flex justify-between items-center border-b border-white/20 bg-white/30">
                  <h3 className="font-black text-slate-800 text-xs md:text-sm tracking-[0.15em] uppercase">Daftar Layer</h3>
                  <button onClick={() => setIsSidebarOpen(false)} className="border border-white/30 hover:bg-white/60 bg-white/40 rounded-md p-1.5 text-slate-600 transition-colors shadow-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                
                {/* Search Layer */}
                <div className="px-4 py-4 border-b border-white/20 bg-white/10">
                  <div className="bg-white/40 border border-white/40 rounded-md flex items-center px-3 py-2.5 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400 transition-all shadow-inner">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Cari rute atau wilayah..." className="bg-transparent border-none outline-none w-full text-sm text-slate-900 ml-2 placeholder-slate-600 font-medium" />
                  </div>
                </div>

                {/* Semua Layer Actions */}
                <div className="px-4 py-3 flex justify-between items-center border-b border-white/20 bg-white/10">
                  <span className="text-[10px] font-black text-slate-600 tracking-widest uppercase">Semua Layer</span>
                  <div className="flex space-x-2">
                    <button onClick={() => { setActiveConditions({'Baik': true, 'Rusak Ringan': true, 'Rusak Sedang': true, 'Rusak Parah': true}); setActiveJenis({'Aspal': true, 'Beton': true, 'Tanah': true}); setActiveKelurahan(initialKelurahanState); }} className="border border-white/50 text-slate-800 hover:text-blue-700 px-3 py-1.5 rounded-md text-[10px] font-bold hover:bg-white bg-white/30 transition-all shadow-sm">Aktifkan</button>
                    <button onClick={() => { setActiveConditions({'Baik': false, 'Rusak Ringan': false, 'Rusak Sedang': false, 'Rusak Parah': false}); setActiveJenis({'Aspal': false, 'Beton': false, 'Tanah': false}); setActiveKelurahan(KELURAHAN_LIST.reduce((acc, kel) => { acc[kel] = false; return acc; }, {})); }} className="border border-white/50 text-slate-800 hover:text-rose-700 px-3 py-1.5 rounded-md text-[10px] font-bold hover:bg-white bg-white/30 transition-all shadow-sm">Nonaktifkan</button>
                  </div>
                </div>

                {/* Accordion Lists */}
                <div className="flex-1 overflow-y-auto custom-scrollbar pb-6">
                  
                  {/* WILAYAH KELURAHAN */}
                  <div className="border-b border-white/20">
                     <div className="flex justify-between items-center p-4 cursor-pointer hover:bg-white/30 transition-colors" onClick={() => setExpandedSection(expandedSection === 'kelurahan' ? null : 'kelurahan')}>
                         <div className="flex items-center space-x-3">
                             <div className="w-2.5 h-2.5 rounded-full bg-[#8b5cf6] shadow-[0_0_8px_rgba(139,92,246,0.5)]"></div>
                             <span className="font-bold text-slate-900 text-[13px]">Wilayah Kelurahan</span>
                         </div>
                         <div className="flex items-center space-x-3">
                             <span className="bg-white/50 border border-white/40 shadow-sm px-2 py-0.5 rounded-md text-[11px] font-bold text-slate-800">{Object.values(activeKelurahan).filter(Boolean).length}</span>
                             <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 text-slate-600 transition-transform ${expandedSection === 'kelurahan' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                         </div>
                     </div>
                     {expandedSection === 'kelurahan' && (
                         <div className="pb-3 bg-white/10 max-h-64 overflow-y-auto custom-scrollbar">
                            {KELURAHAN_LIST.map(kel => (
                               <div key={kel} className="flex items-center justify-between px-4 py-2 hover:bg-white/40 transition-colors cursor-pointer" onClick={() => setActiveKelurahan(prev => ({...prev, [kel]: !prev[kel]}))}>
                                  <div className="flex items-center space-x-4 ml-2">
                                      <LayerToggle active={activeKelurahan[kel]} color="#8b5cf6" onClick={() => setActiveKelurahan(prev => ({...prev, [kel]: !prev[kel]}))} />
                                      <span className={`text-[12px] font-bold truncate max-w-[150px] ${activeKelurahan[kel] ? 'text-slate-900' : 'text-slate-500'}`}>{formatKel(kel)}</span>
                                  </div>
                                  <div className="flex items-center space-x-3">
                                      <span className="bg-white/50 border border-white/30 px-2 py-0.5 rounded-md text-[10px] font-bold text-slate-700">{syncedRoads.filter(r => r.kelurahan === kel).length}</span>
                                  </div>
                               </div>
                            ))}
                         </div>
                     )}
                  </div>

                  {/* KONDISI JALAN */}
                  <div className="border-b border-white/20">
                     <div className="flex justify-between items-center p-4 cursor-pointer hover:bg-white/30 transition-colors" onClick={() => setExpandedSection(expandedSection === 'kondisi' ? null : 'kondisi')}>
                         <div className="flex items-center space-x-3">
                             <div className="w-2.5 h-2.5 rounded-full bg-[#EF4444] shadow-[0_0_8px_rgba(239,68,68,0.5)]"></div>
                             <span className="font-bold text-slate-900 text-[13px]">Kondisi Jalan</span>
                         </div>
                         <div className="flex items-center space-x-3">
                             <span className="bg-white/50 border border-white/40 shadow-sm px-2 py-0.5 rounded-md text-[11px] font-bold text-slate-800">{Object.values(activeConditions).filter(Boolean).length}</span>
                             <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 text-slate-600 transition-transform ${expandedSection === 'kondisi' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                         </div>
                     </div>
                     {expandedSection === 'kondisi' && (
                         <div className="pb-3 bg-white/10">
                            {['Baik', 'Rusak Ringan', 'Rusak Sedang', 'Rusak Parah'].map(cond => (
                               <div key={cond} className="flex items-center justify-between px-4 py-2.5 hover:bg-white/40 transition-colors cursor-pointer" onClick={() => setActiveConditions(prev => ({...prev, [cond]: !prev[cond]}))}>
                                  <div className="flex items-center space-x-4 ml-2">
                                      <LayerToggle active={activeConditions[cond]} color={getConditionColor(cond)} onClick={() => setActiveConditions(prev => ({...prev, [cond]: !prev[cond]}))} />
                                      <span className={`text-[13px] font-bold ${activeConditions[cond] ? 'text-slate-900' : 'text-slate-500'}`}>{cond}</span>
                                  </div>
                                  <div className="flex items-center space-x-3">
                                      <span className="bg-white/50 border border-white/30 px-2 py-0.5 rounded-md text-[11px] font-bold text-slate-700">{adminStats[cond === 'Baik' ? 'baik' : cond === 'Rusak Ringan' ? 'rusakRingan' : cond === 'Rusak Sedang' ? 'rusakSedang' : 'rusakParah']}</span>
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                  </div>
                               </div>
                            ))}
                         </div>
                     )}
                  </div>

                  {/* MATERIAL JALAN */}
                  <div className="border-b border-white/20">
                     <div className="flex justify-between items-center p-4 cursor-pointer hover:bg-white/30 transition-colors" onClick={() => setExpandedSection(expandedSection === 'material' ? null : 'material')}>
                         <div className="flex items-center space-x-3">
                             <div className="w-2.5 h-2.5 rounded-full bg-[#FBBF24] shadow-[0_0_8px_rgba(251,191,36,0.5)]"></div>
                             <span className="font-bold text-slate-900 text-[13px]">Material Jalan</span>
                         </div>
                         <div className="flex items-center space-x-3">
                             <span className="bg-white/50 border border-white/40 shadow-sm px-2 py-0.5 rounded-md text-[11px] font-bold text-slate-800">{Object.values(activeJenis).filter(Boolean).length}</span>
                             <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 text-slate-600 transition-transform ${expandedSection === 'material' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                         </div>
                     </div>
                     {expandedSection === 'material' && (
                         <div className="pb-3 bg-white/10">
                            {['Aspal', 'Beton', 'Tanah'].map(mat => (
                               <div key={mat} className="flex items-center justify-between px-4 py-2.5 hover:bg-white/40 transition-colors cursor-pointer" onClick={() => setActiveJenis(prev => ({...prev, [mat]: !prev[mat]}))}>
                                  <div className="flex items-center space-x-4 ml-2">
                                      <LayerToggle active={activeJenis[mat]} color="#3B82F6" onClick={() => setActiveJenis(prev => ({...prev, [mat]: !prev[mat]}))} />
                                      <span className={`text-[13px] font-bold ${activeJenis[mat] ? 'text-slate-900' : 'text-slate-500'}`}>{mat}</span>
                                  </div>
                                  <div className="flex items-center space-x-3">
                                      <span className="bg-white/50 border border-white/30 px-2 py-0.5 rounded-md text-[11px] font-bold text-slate-700">{adminStats[mat.toLowerCase()]}</span>
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                  </div>
                               </div>
                            ))}
                         </div>
                     )}
                  </div>

                  {/* DAFTAR RUTE AKTIF */}
                  <div className="border-b border-white/20">
                     <div className="flex justify-between items-center p-4 cursor-pointer hover:bg-white/30 transition-colors" onClick={() => setExpandedSection(expandedSection === 'rute' ? null : 'rute')}>
                         <div className="flex items-center space-x-3">
                             <div className="w-2.5 h-2.5 rounded-full bg-[#0ea5e9] shadow-[0_0_8px_rgba(14,165,233,0.5)]"></div>
                             <span className="font-bold text-slate-900 text-[13px]">Daftar Rute Tersimpan</span>
                         </div>
                         <div className="flex items-center space-x-3">
                             <span className="bg-white/50 border border-white/40 shadow-sm px-2 py-0.5 rounded-md text-[11px] font-bold text-slate-800">{filteredRoads.length}</span>
                             <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 text-slate-600 transition-transform ${expandedSection === 'rute' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                         </div>
                     </div>
                     {expandedSection === 'rute' && (
                         <div className="pb-3 px-3 space-y-2 bg-white/10 pt-2">
                             <button onClick={() => {
                                 let validRoads = selectedAdminRouteIds.length > 0 ? syncedRoads.filter(r => selectedAdminRouteIds.includes(r.id || r.dbId)).filter(r => r.realGps && r.realGps.length > 1) : filteredRoads.filter(r => r.realGps && r.realGps.length > 1);
                                 if(validRoads.length === 0) return showToast("Tidak ada rute valid.");
                                 setAnimatingRoadsList(validRoads); setIsAnimatingMap(true); setIsAnimPaused(false); setAnimationSpeedMultiplier(1.0); setIsAnimFinished(false); setIsAnimControlMinimized(false);
                                 if(window.innerWidth < 768) setIsSidebarOpen(false);
                             }} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-2.5 rounded-lg text-[11px] tracking-wider font-black shadow-md mb-3 transition-colors">▶ PLAY ANIMASI ({selectedAdminRouteIds.length > 0 ? selectedAdminRouteIds.length : filteredRoads.length})</button>

                              {filteredRoads.map((road) => {
                                  const roadId = road.id || road.dbId; 
                                  const isHighlighted = highlightedRoadId === roadId; 
                                  const isSelectedAdmin = selectedAdminRouteIds.includes(roadId);
                                  return (
                                  <div key={roadId} onClick={() => { setSelectedRoad(road); setHighlightedRoadId(roadId); setVideoSnapshot([]); window.location.hash = '#/admin/detail'; if (window.innerWidth < 768) setIsSidebarOpen(false); if (adminMapInstanceRef.current && road.realGps?.length > 0) adminMapInstanceRef.current.fitBounds(window.L.latLngBounds(road.realGps.map(pt => [pt.lat, pt.lng])), { padding: [40, 40] }); }} 
                                       className={`p-2.5 rounded-xl border cursor-pointer relative transition-colors ${isHighlighted ? 'bg-blue-50/90 border-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.15)]' : 'bg-white/40 border-white/50 hover:bg-white/80 shadow-sm'}`}>
                                    <div onClick={(e) => { e.stopPropagation(); toggleAdminRouteSelection(roadId); }} className={`absolute top-2.5 right-2.5 w-5 h-5 rounded-md border z-10 flex items-center justify-center transition-colors ${isSelectedAdmin ? 'bg-blue-600 border-blue-600' : 'bg-white/60 border-slate-400 hover:border-blue-400'}`}>
                                        {isSelectedAdmin && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                                    </div>
                                    <div className="flex gap-3">
                                      <div className="w-14 h-14 rounded-lg overflow-hidden bg-slate-100 shrink-0 border border-slate-200/50 flex items-center justify-center">
                                        {road.photoUrls?.length > 0 ? <img src={road.photoUrls[0]} className="w-full h-full object-cover" /> : road.videoUrl ? <video src={`${road.videoUrl}#t=0.5`} className="w-full h-full object-cover" /> : <span className="text-[8px] text-slate-500 font-bold">No Media</span>}
                                      </div>
                                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                                        <h4 className="font-bold text-sm text-slate-900 truncate pr-6 leading-tight">{road.name}</h4>
                                        <div className="flex gap-2 mt-1.5 items-center">
                                           <span className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: getConditionColor(road.condition)}}></span>
                                           <span className="text-[11px] font-medium text-slate-700 truncate">{formatKel(road.kelurahan)}</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  );
                              })}
                         </div>
                     )}
                  </div>

                </div>

                {/* Footer Sidebar */}
                <div className="p-4 border-t border-white/30 bg-white/20 backdrop-blur-md">
                    <div className="text-[11px] font-bold text-blue-700 tracking-wider">{Object.values(activeConditions).filter(Boolean).length + Object.values(activeJenis).filter(Boolean).length + Object.values(activeKelurahan).filter(Boolean).length} Layer Aktif</div>
                </div>
              </div>
            </aside>

            {/* --- MAIN CONTENT (MAP & WIDGETS) --- */}
            <main className="flex-1 relative w-full h-full">
              
              {/* --- FLOATING WIDGETS (KOTAK LEGENDA MENGAMBANG) --- */}
              <div className={`absolute top-3 md:top-5 z-[400] pointer-events-none transition-all pr-3 ${isSidebarOpen ? 'md:left-[360px] pl-[50px] md:pl-5 w-[calc(100%-360px)]' : 'left-0 pl-[50px] md:pl-5 w-full'}`}>
                 <div className="pointer-events-none md:hidden mb-2">
                    <button onClick={() => setShowFloatingLegend(!showFloatingLegend)} className="pointer-events-auto bg-white/90 shadow-sm border px-3 py-1.5 rounded-md text-[10px] font-bold text-slate-700 w-auto">
                       {showFloatingLegend ? 'Tutup Legenda' : 'Buka Legenda'}
                    </button>
                 </div>

                 <div className={`${showFloatingLegend ? 'flex' : 'hidden'} md:flex flex-nowrap md:flex-wrap items-center gap-2 pointer-events-auto overflow-x-auto hide-scrollbar pb-3`}>
                    <div className="flex items-stretch rounded-lg shadow-sm border border-slate-200 overflow-hidden h-9 md:h-11 shrink-0 bg-white min-w-[130px] md:min-w-0">
                       <div className="flex-1 flex items-center gap-1.5 px-3 border-r border-slate-200"><span className="w-2 h-2 rounded-full bg-[#10B981]"></span><span className="text-[10px] font-medium text-slate-600 uppercase">Baik</span></div>
                       <div className="flex items-center justify-center bg-slate-50 px-3 border-l border-slate-200"><span className="text-lg md:text-xl font-black text-slate-800"><AnimatedNumber value={adminStats.baik} /></span></div>
                    </div>
                    <div className="flex items-stretch rounded-lg shadow-sm border border-slate-200 overflow-hidden h-9 md:h-11 shrink-0 bg-white min-w-[130px] md:min-w-0">
                       <div className="flex-1 flex items-center gap-1.5 px-3 border-r border-slate-200"><span className="w-2 h-2 rounded-full bg-[#FBBF24]"></span><span className="text-[10px] font-medium text-slate-600 uppercase">Rsk Ringan</span></div>
                       <div className="flex items-center justify-center bg-slate-50 px-3 border-l border-slate-200"><span className="text-lg md:text-xl font-black text-slate-800"><AnimatedNumber value={adminStats.rusakRingan} /></span></div>
                    </div>
                    <div className="flex items-stretch rounded-lg shadow-sm border border-slate-200 overflow-hidden h-9 md:h-11 shrink-0 bg-white min-w-[130px] md:min-w-0">
                       <div className="flex-1 flex items-center gap-1.5 px-3 border-r border-slate-200"><span className="w-2 h-2 rounded-full bg-[#F97316]"></span><span className="text-[10px] font-medium text-slate-600 uppercase">Rsk Sedang</span></div>
                       <div className="flex items-center justify-center bg-slate-50 px-3 border-l border-slate-200"><span className="text-lg md:text-xl font-black text-slate-800"><AnimatedNumber value={adminStats.rusakSedang} /></span></div>
                    </div>
                    <div className="flex items-stretch rounded-lg shadow-sm border border-slate-200 overflow-hidden h-9 md:h-11 shrink-0 bg-white min-w-[130px] md:min-w-0">
                       <div className="flex-1 flex items-center gap-1.5 px-3 border-r border-slate-200"><span className="w-2 h-2 rounded-full bg-[#EF4444]"></span><span className="text-[10px] font-medium text-slate-600 uppercase">Rsk Parah</span></div>
                       <div className="flex items-center justify-center bg-slate-50 px-3 border-l border-slate-200"><span className="text-lg md:text-xl font-black text-slate-800"><AnimatedNumber value={adminStats.rusakParah} /></span></div>
                    </div>
                 </div>
              </div>

              {/* Peta Container */}
              <div className={`absolute inset-0 transition-all duration-300 ${isSidebarOpen ? 'admin-map-shifted' : 'left-0 w-full'}`}>
                 <div ref={adminMapContainerRef} className="absolute inset-0 bg-slate-200 z-0"></div>
                 {!isLeafletLoaded && <div className="absolute inset-0 flex items-center justify-center bg-slate-100 font-bold text-slate-400 z-10 pointer-events-none">Memuat Peta...</div>}
              </div>
            </main>
          </div>

          {/* --- SELECTED ROAD POPUP (DETAIL RUTE) --- */}
          {selectedRoad && !isAnimatingMap && (
            <>
              <div className="fixed inset-0 z-[1100] bg-slate-900/30 backdrop-blur-sm" onClick={closeAdminModal}></div>
              <div className="fixed bottom-2 left-2 right-2 md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-y-1/2 md:-translate-x-1/2 md:w-11/12 max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden z-[1200] max-h-[85vh]">
                <button onClick={closeAdminModal} className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-white bg-black/40 hover:bg-black/60 rounded-full z-30 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </button>
                <div className="w-full bg-black relative border-b border-slate-200 aspect-video shrink-0">
                  <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center">
                      <div className="text-white/40 font-black text-lg md:text-2xl tracking-[0.2em] uppercase drop-shadow-md mix-blend-overlay select-none">{selectedRoad.date}</div>
                  </div>
                  {selectedRoad.videoUrl ? (
                    <video id="admin-vid-player" crossOrigin="anonymous" src={selectedRoad.videoUrl} controls className="absolute inset-0 w-full h-full object-contain"></video>
                  ) : selectedRoad.photoUrls?.length > 0 ? (
                    <img src={selectedRoad.photoUrls[0]} className="absolute inset-0 w-full h-full object-cover" />
                  ) : (<div className="text-center flex items-center justify-center h-full w-full text-white text-sm font-bold">Media Tidak Dilampirkan</div>)}
                </div>
                
                <div className="w-full p-4 flex flex-col overflow-y-auto flex-1">
                  <div className="flex flex-wrap gap-2 justify-end mb-4">
                       <button onClick={() => { if (adminMapInstanceRef.current) adminMapInstanceRef.current.closePopup(); setAnimatingRoadsList([selectedRoad]); setIsAnimatingMap(true); setIsAnimPaused(false); setCurrentAnimDistance(0); setAnimationSpeedMultiplier(1.0); setShowSpeedControl(false); setIsAnimFinished(false); setIsAnimControlMinimized(false); if(window.innerWidth < 768) setIsSidebarOpen(false); }} className="text-[9px] md:text-xs text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded-md font-bold transition-colors">Play Animasi</button>
                       <button onClick={handleShareLocation} className="text-[9px] md:text-xs text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded-md font-bold transition-colors">Share Lokasi</button>
                       <button onClick={handleExportKML} className="text-[9px] md:text-xs text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded-md font-bold transition-colors">Export KML</button>
                       <button onClick={handlePrint} className="text-[9px] md:text-xs text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded-md font-bold transition-colors">Print</button>
                  </div>
                  
                  <h4 className="text-lg md:text-xl font-black mb-1 leading-tight text-slate-900">{selectedRoad.name}</h4>
                  <p className="text-xs md:text-sm text-slate-600 italic mb-4">"{selectedRoad.notes || 'Tidak ada catatan.'}"</p>
                  
                  <div className="border border-slate-200 rounded-lg overflow-hidden mb-2">
                    <table className="w-full text-left text-[10px] md:text-xs border-collapse">
                      <tbody className="divide-y divide-slate-200">
                        <tr><th className="py-2.5 px-3 bg-slate-50 w-1/3">Kelurahan</th><td className="py-2.5 px-3">{formatKel(selectedRoad.kelurahan)}</td></tr>
                        <tr><th className="py-2.5 px-3 bg-slate-50">Jenis/Kondisi</th><td className="py-2.5 px-3">{selectedRoad.jenisJalan} / <span className="font-bold" style={{color:getConditionColor(selectedRoad.condition)}}>{selectedRoad.condition}</span></td></tr>
                        <tr><th className="py-2.5 px-3 bg-slate-50">Panjang Rute</th><td className="py-2.5 px-3">{formatLength(selectedRoad.length)}</td></tr>
                        <tr><th className="py-2.5 px-3 bg-slate-50 align-top">Titik Lokasi</th><td className="py-2.5 px-3">{selectedRoad.pinLocation ? `${selectedRoad.pinLocation.lat.toFixed(5)}, ${selectedRoad.pinLocation.lng.toFixed(5)}` : '-'}</td></tr>
                        <tr><th className="py-2.5 px-3 bg-slate-50 align-top">Tanggal</th><td className="py-2.5 px-3">{selectedRoad.date || '-'}</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* --- OVERLAY KONTROL ANIMASI BAWAH (FIXED RESPONSIVE) --- */}
          {isAnimatingMap && animatingRoadsList.length > 0 && (
             <div className="fixed bottom-4 left-3 right-3 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-[420px] z-[2000] flex flex-col pointer-events-none">
                 
                 {isAnimControlMinimized ? (
                     <button onClick={() => setIsAnimControlMinimized(false)} className="pointer-events-auto mx-auto bg-white/95 px-5 py-3 rounded-full shadow-2xl border border-blue-200 text-blue-700 text-sm font-black w-auto">
                         Buka Kontrol Animasi
                     </button>
                 ) : (
                     <div className="pointer-events-auto bg-white/95 backdrop-blur-xl p-3 md:p-4 rounded-3xl flex flex-col shadow-2xl border border-slate-200 w-full gap-2.5">
                         
                         <div className="flex justify-between items-center w-full">
                             <div className="flex gap-1.5 md:gap-2 items-center">
                                 {isAnimFinished ? (
                                     <button onClick={() => { setIsAnimatingMap(false); setTimeout(() => { setIsAnimatingMap(true); setIsAnimPaused(false); setIsAnimFinished(false); setCurrentAnimDistance(0); }, 50); }} className="px-3 md:px-4 py-1.5 md:py-2 rounded-full text-xs md:text-sm font-black shadow-sm bg-emerald-600 text-white">🔄 Ulang</button>
                                 ) : (
                                     <button onClick={() => setIsAnimPaused(!isAnimPaused)} className={`px-3 md:px-4 py-1.5 md:py-2 rounded-full text-xs md:text-sm font-black shadow-sm text-white ${isAnimPaused ? 'bg-emerald-500 animate-pulse' : 'bg-blue-600'}`}>{isAnimPaused ? '▶ PLAY' : '⏸ PAUSE'}</button>
                                 )}
                                 <button onClick={() => setShowSpeedControl(!showSpeedControl)} className={`px-2.5 md:px-3 py-1.5 md:py-2 rounded-full text-[10px] md:text-xs font-bold border shadow-sm ${showSpeedControl ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-700 border-slate-300'}`}>
                                     {Number(animationSpeedMultiplier).toFixed(2)}x
                                 </button>
                             </div>

                             <div className="flex gap-1.5 md:gap-2 items-center">
                                 <button onClick={() => setIsAnimControlMinimized(true)} className="bg-slate-100 text-slate-600 border border-slate-300 p-1.5 md:p-2 rounded-full shrink-0">_</button>
                                 <button onClick={() => { setIsAnimatingMap(false); setIsAnimPaused(false); setShowSpeedControl(false); setAnimatingRoadsList([]); setIsAnimFinished(false); setIsAnimControlMinimized(false); }} className="bg-rose-100 text-rose-600 border border-rose-200 p-1.5 md:p-2 rounded-full shrink-0">x</button>
                             </div>
                         </div>
                         
                         <div className="flex gap-2 w-full">
                             <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 flex items-center justify-center text-slate-800 text-xs font-bold shadow-inner">
                                 {animatingRoadsList.length > 1 ? (<span className="text-blue-700 truncate">{animatingRoadsList.length} Rute Aktif</span>) : (<span className="truncate">{currentAnimDistance < 1000 ? Math.round(currentAnimDistance) + ' m' : (currentAnimDistance / 1000).toFixed(2) + ' km'}</span>)}
                             </div>
                             
                             <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
                                 <button onClick={() => setAnimIconType('car')} className={`p-1 md:p-1.5 rounded-lg ${animIconType === 'car' ? 'bg-white shadow-sm' : 'opacity-50'}`}>🚗</button>
                                 <button onClick={() => setAnimIconType('motorcycle')} className={`p-1 md:p-1.5 rounded-lg ${animIconType === 'motorcycle' ? 'bg-white shadow-sm' : 'opacity-50'}`}>🏍️</button>
                                 <button onClick={() => setAnimIconType('runner')} className={`p-1 md:p-1.5 rounded-lg ${animIconType === 'runner' ? 'bg-white shadow-sm' : 'opacity-50'}`}>🏃</button>
                             </div>
                         </div>

                         {showSpeedControl && (
                             <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 shadow-inner w-full mt-1">
                                 <div className="flex items-center space-x-2 md:space-x-3 mb-3">
                                     <button onClick={() => setAnimationSpeedMultiplier(Math.max(0.25, animationSpeedMultiplier - 0.25))} className="w-6 h-6 bg-white text-slate-800 rounded-full font-black border border-slate-300">-</button>
                                     <input type="range" min="0.25" max="3.0" step="0.25" value={animationSpeedMultiplier} onChange={(e) => setAnimationSpeedMultiplier(parseFloat(e.target.value))} className="flex-1 h-1.5 bg-slate-300 rounded-lg" style={{ accentColor: '#2563eb' }}/>
                                     <button onClick={() => setAnimationSpeedMultiplier(Math.min(3.0, animationSpeedMultiplier + 0.25))} className="w-6 h-6 bg-white text-slate-800 rounded-full font-black border border-slate-300">+</button>
                                 </div>
                                 <div className="flex justify-between gap-1 md:gap-1.5">
                                     {[1.0, 1.5, 2.0, 2.5, 3.0].map(speed => (
                                         <button key={speed} onClick={() => setAnimationSpeedMultiplier(speed)} className={`flex-1 py-1.5 rounded-md text-[10px] md:text-xs font-bold border ${animationSpeedMultiplier === speed ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'}`}>{speed}x</button>
                                     ))}
                                 </div>
                             </div>
                         )}
                     </div>
                 )}
             </div>
          )}
        </div>
      )}

      {/* --- AREA CETAK PDF --- */}
      {appRole === 'admin' && selectedRoad && (
        <div className="hidden print:block w-full bg-white text-black p-8 absolute top-0 left-0 z-[99999]" style={{ minHeight: '297mm' }}>
           <div className="text-center border-b-4 border-slate-800 pb-4 mb-6">
              <h1 className="text-2xl font-black uppercase tracking-wide">Laporan Survei Kondisi Jalan</h1>
              <p className="text-slate-500 mt-1 text-sm font-semibold">Dokumen Resmi Sistem WebGIS R-Map</p>
           </div>
           
           <table className="w-full mb-6 text-sm border-collapse">
              <tbody>
                <tr className="border-b border-slate-200"><td className="py-2.5 font-bold w-1/3 text-slate-600">Nama Rute / Jalan</td><td className="py-2.5 font-black text-base">: {selectedRoad.name}</td></tr>
                <tr className="border-b border-slate-200"><td className="py-2.5 font-bold text-slate-600">Kelurahan Wilayah</td><td className="py-2.5 font-bold">: {formatKel(selectedRoad.kelurahan)}</td></tr>
                <tr className="border-b border-slate-200"><td className="py-2.5 font-bold text-slate-600">Jenis Material Jalan</td><td className="py-2.5 font-bold">: {selectedRoad.jenisJalan || '-'}</td></tr>
                <tr className="border-b border-slate-200"><td className="py-2.5 font-bold text-slate-600">Kondisi Dominan</td><td className="py-2.5">: <span className="font-bold border border-slate-400 px-2 py-0.5 rounded text-[11px]" style={{ color: getConditionColor(selectedRoad.condition), backgroundColor: `${getConditionColor(selectedRoad.condition)}15` }}>{selectedRoad.condition}</span></td></tr>
                <tr className="border-b border-slate-200"><td className="py-2.5 font-bold text-slate-600">Panjang Rute Terecord</td><td className="py-2.5 font-bold">: {formatLength(selectedRoad.length)}</td></tr>
                <tr className="border-b border-slate-200"><td className="py-2.5 font-bold text-slate-600">Titik Pin Lokasi (GPS)</td><td className="py-2.5 font-mono text-xs font-bold text-blue-700">: {selectedRoad.pinLocation ? `${selectedRoad.pinLocation.lat}, ${selectedRoad.pinLocation.lng}` : 'Tidak ditandai'}</td></tr>
                <tr className="border-b border-slate-200"><td className="py-2.5 font-bold text-slate-600">Tanggal Pelaksanaan</td><td className="py-2.5 font-bold">: {selectedRoad.date}</td></tr>
              </tbody>
           </table>
        </div>
      )}
    </div>
  );
}
