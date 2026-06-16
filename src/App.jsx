import React, { useState, useEffect, useRef } from 'react';

// =========================================================================
// 🔴 KONFIGURASI SUPABASE ANDA 
// Masukkan URL dan Publishable Key dari Project Supabase Anda di sini:
// =========================================================================
const SUPABASE_URL = 'https://crgckrqueqpgrakkzfmp.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_Dmd8dOeZaAs0IGC4kXrSSg_it8dY8nB'; 

// --- DATA RUJUKAN ---
const KELURAHAN_LIST = ["Lempake", "Mugirejo", "Sempaja Utara", "Sempaja Selatan", "Karang Mumus"];

const getConditionColor = (condition) => {
  switch (condition) {
    case 'Aspal/Baik': return '#10B981'; 
    case 'Berbatu': return '#F59E0B';    
    case 'Licin/Buruk': return '#EF4444'; 
    case 'Tanah/Rusak': return '#B45309'; 
    default: return '#6B7280';
  }
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

// --- ALGORITMA HAVERSINE (MENGHITUNG JARAK DALAM METER) ---
const getDistanceMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Radius bumi dalam meter
  const p1 = lat1 * Math.PI/180;
  const p2 = lat2 * Math.PI/180;
  const dp = (lat2-lat1) * Math.PI/180;
  const dl = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(dp/2) * Math.sin(dp/2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2) * Math.sin(dl/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};
// --- AKHIR ALGORITMA ---


export default function App() {
  // --- STATE APLIKASI UTAMA ---
  const [appRole, setAppRole] = useState(null); 
  const [supabase, setSupabase] = useState(null);
  const [isDbConnected, setIsDbConnected] = useState(false);

  // --- FUNGSI UTILITI TOAST ---
  const [toastMessage, setToastMessage] = useState(null);
  const showToast = (message) => {
    setToastMessage(String(message));
    setTimeout(() => setToastMessage(null), 4000);
  };

  // --- INISIALISASI PUSTAKA & SUPABASE (CDN) ---
  useEffect(() => {
    if (!document.getElementById('tailwind-cdn')) {
      const script = document.createElement('script');
      script.id = 'tailwind-cdn';
      script.src = 'https://cdn.tailwindcss.com';
      document.head.appendChild(script);
    }

    if (SUPABASE_ANON_KEY.includes('PASTE_KUNCI')) return; 

    const initSupabase = () => {
      try {
        setSupabase(window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
      } catch (err) {
        console.warn("Peringatan inisialisasi Supabase:", err);
      }
    };

    if (window.supabase) {
      initSupabase();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.id = 'supabase-js';
    script.onload = initSupabase;
    document.head.appendChild(script);
  }, []);

  // --- STATE DATA ---
  const [syncedRoads, setSyncedRoads] = useState([]); 
  const [drafts, setDrafts] = useState([]); 
  const [selectedRoad, setSelectedRoad] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // --- STATE ADMIN ---
  const [filterKelurahan, setFilterKelurahan] = useState('Semua');
  const [filterKondisi, setFilterKondisi] = useState('Semua');
  // Atur default sidebar terbuka jika layar besar (desktop), tertutup jika layar HP
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768);
  const adminMapContainerRef = useRef(null);
  const adminMapInstanceRef = useRef(null);
  const adminLayerGroupRef = useRef(null);
  const hasFittedAdminMapRef = useRef(false); // <-- TAMBAHAN: Mencegah zoom berulang

  // --- STATE SURVEYOR ---
  const [mobileScreen, setMobileScreen] = useState('home'); 
  const [isRecording, setIsRecording] = useState(false);
  const [realGpsPoints, setRealGpsPoints] = useState([]);
  const [gpsAccuracy, setGpsAccuracy] = useState('-');
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [totalDistance, setTotalDistance] = useState(0); // <-- State Jarak
  const [pinLocation, setPinLocation] = useState(null); 
  const [currentLocation, setCurrentLocation] = useState(null); 
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState(null);
  const [uploadedVideoFile, setUploadedVideoFile] = useState(null); 
  
  // State untuk multiple foto (Max 4)
  const [uploadedPhotoFiles, setUploadedPhotoFiles] = useState([]);
  const [uploadedPhotoUrls, setUploadedPhotoUrls] = useState([]);

  const [formData, setFormData] = useState({
    name: '', kelurahan: KELURAHAN_LIST[0], condition: 'Tanah/Rusak', notes: ''
  });

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const watchIdRef = useRef(null);

  const surveyorMapContainerRef = useRef(null);
  const surveyorMapInstanceRef = useRef(null);
  const surveyorMarkerRef = useRef(null);
  const currentLocationMarkerRef = useRef(null); 
  const watchLocationIdRef = useRef(null); 

  // --- 1. INISIALISASI PUSTAKA LEAFLET ---
  const [isLeafletLoaded, setIsLeafletLoaded] = useState(false);
  useEffect(() => {
    if (window.L) {
      setIsLeafletLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.id = 'leaflet-js-script';
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => setIsLeafletLoaded(true);
    document.head.appendChild(script);
  }, []);

  // --- 2. SUPABASE: TARIK DATA ---
  const fetchRoads = async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('mapped_roads')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (error) throw error;

      const formattedData = (data || []).map(road => {
        let parsedGps = road.realGps;
        let parsedPin = road.pinLocation;
        let parsedPhotos = road.photoUrls;

        if (typeof parsedGps === 'string') {
          try { parsedGps = JSON.parse(parsedGps); } catch (e) { parsedGps = []; }
        }
        if (typeof parsedPin === 'string') {
          try { parsedPin = JSON.parse(parsedPin); } catch (e) { parsedPin = null; }
        }
        if (typeof parsedPhotos === 'string') {
          try { parsedPhotos = JSON.parse(parsedPhotos); } catch (e) { parsedPhotos = []; }
        }

        if (!Array.isArray(parsedGps)) parsedGps = [];
        if (!Array.isArray(parsedPhotos)) parsedPhotos = [];

        return {
          ...road,
          realGps: parsedGps,
          pinLocation: parsedPin,
          photoUrls: parsedPhotos
        };
      });

      setSyncedRoads(formattedData);
      setIsDbConnected(true);
    } catch (error) {
      console.warn("Peringatan jaringan saat mengambil data dari Supabase:", error.message);
      setIsDbConnected(false);
      
      if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError")) {
         showToast("Gagal menyambung. Server Supabase Anda mungkin sedang 'Paused' (Jeda). Silakan aktifkan kembali di dasbor.");
      } else if (error.message.includes("does not exist")) {
         showToast("Tabel 'mapped_roads' belum dibuat di Supabase Anda.");
      }
    }
  };

  useEffect(() => {
    if (supabase) {
      fetchRoads();
      const intervalId = setInterval(() => { fetchRoads(); }, 5000); 
      return () => clearInterval(intervalId); 
    }
  }, [supabase]);


  // --- EFEK PETA ADMIN ---
  useEffect(() => {
    if (appRole !== 'admin' || !isLeafletLoaded || !adminMapContainerRef.current) return;
    
    const map = window.L.map(adminMapContainerRef.current).setView([-0.425, 117.185], 13);
    
    const osm = window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
    const satelit = window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '© Esri' });
    const googleEarth = window.L.tileLayer('http://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}&apistyle=s.t:2|p.v:off', { maxZoom: 20, subdomains:['mt0','mt1','mt2','mt3'], attribution: '© Google' });
    const topo = window.L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '© OpenTopoMap' });
    const terang = window.L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', { maxZoom: 20, attribution: '© CartoDB' });
    const gelap = window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', { maxZoom: 20, attribution: '© CartoDB' });

    osm.addTo(map);

    const baseMaps = {
      "Jalanan (OSM)": osm,
      "Citra Satelit (Esri)": satelit,
      "Google Earth": googleEarth,
      "Topografi": topo,
      "Peta Terang": terang,
      "Peta Gelap": gelap
    };

    window.L.control.layers(baseMaps, null, { position: 'topleft' }).addTo(map);
    
    const layerGroup = window.L.layerGroup().addTo(map);
    adminMapInstanceRef.current = map;
    adminLayerGroupRef.current = layerGroup;

    setTimeout(() => { map.invalidateSize(); window.dispatchEvent(new Event('resize')); }, 200);

    return () => {
      map.remove();
      adminMapInstanceRef.current = null;
      adminLayerGroupRef.current = null;
    };
  }, [appRole, isLeafletLoaded]);

  useEffect(() => {
    if (appRole !== 'admin' || !adminMapInstanceRef.current || !adminLayerGroupRef.current) return;

    const layerGroup = adminLayerGroupRef.current;
    const map = adminMapInstanceRef.current;
    layerGroup.clearLayers();

    const filteredRoads = syncedRoads.filter(road => {
      return (filterKelurahan === 'Semua' || road.kelurahan === filterKelurahan) &&
             (filterKondisi === 'Semua' || road.condition === filterKondisi);
    });

    filteredRoads.forEach(road => {
      if (road.realGps && road.realGps.length > 0) {
        const latlngs = road.realGps.map(pt => [pt.lat, pt.lng]);
        const polyline = window.L.polyline(latlngs, { color: getConditionColor(road.condition), weight: 6, opacity: 0.8 }).addTo(layerGroup);
        window.L.circleMarker(latlngs[0], { radius: 4, fillColor: '#ffffff', color: getConditionColor(road.condition), weight: 2, fillOpacity: 1 }).addTo(layerGroup);

        if (road.pinLocation && road.pinLocation.lat && road.pinLocation.lng) {
          const pinIcon = window.L.divIcon({
            className: 'custom-pin',
            html: `<div style="background-color: ${getConditionColor(road.condition)}; width: 18px; height: 18px; border-radius: 50% 50% 50% 0; border: 2px solid white; transform: rotate(-45deg); box-shadow: 2px 2px 5px rgba(0,0,0,0.5);"></div>`,
            iconSize: [18, 18], iconAnchor: [9, 18], popupAnchor: [0, -18]
          });
          const popupContent = `
            <div style="min-width: 240px; font-family: sans-serif;">
              <h4 style="margin: 0 0 10px 0; font-size: 14px; font-weight: 800; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">📍 ${road.name}</h4>
              <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <th style="padding: 6px 4px; color: #64748b; font-weight: 600; width: 35%;">Kelurahan</th>
                  <td style="padding: 6px 4px; color: #334155; font-weight: 700;">${road.kelurahan}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <th style="padding: 6px 4px; color: #64748b; font-weight: 600;">Kondisi</th>
                  <td style="padding: 6px 4px;">
                    <span style="background-color: ${getConditionColor(road.condition)}20; color: ${getConditionColor(road.condition)}; padding: 3px 6px; border-radius: 4px; font-weight: bold; font-size: 10px;">${road.condition}</span>
                  </td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <th style="padding: 6px 4px; color: #64748b; font-weight: 600; vertical-align: top;">Catatan</th>
                  <td style="padding: 6px 4px; color: #475569; font-style: italic;">${road.notes || '-'}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <th style="padding: 6px 4px; color: #64748b; font-weight: 600; vertical-align: top;">Koordinat</th>
                  <td style="padding: 6px 4px; color: #2563eb; font-family: monospace; font-size: 11px;">
                    ${road.pinLocation.lat.toFixed(6)}<br/>${road.pinLocation.lng.toFixed(6)}
                  </td>
                </tr>
                <tr>
                  <th style="padding: 6px 4px; color: #64748b; font-weight: 600;">Tanggal</th>
                  <td style="padding: 6px 4px; color: #475569; font-size: 11px;">${road.date}</td>
                </tr>
              </table>
              ${road.photoUrls && road.photoUrls.length > 0 ? `<div style="font-size: 10px; text-align: center; margin-top: 8px; color: #3b82f6; font-weight: bold;">[+] Tersedia ${road.photoUrls.length} Foto Lampiran</div>` : ''}
            </div>
          `;
          window.L.marker([road.pinLocation.lat, road.pinLocation.lng], { icon: pinIcon })
            .addTo(layerGroup)
            .bindPopup(popupContent);
        }
        polyline.on('click', () => {
          setSelectedRoad(road);
          // Auto close sidebar on mobile to view map details
          if (window.innerWidth < 768) {
             setIsSidebarOpen(false);
          }
        });
      }
    });

    // Perbaikan: Hanya lakukan fitBounds di awal pemuatan peta saja
    if (filteredRoads.length > 0 && map && !hasFittedAdminMapRef.current) {
      const allLatLngs = filteredRoads.flatMap(r => r.realGps.map(pt => [pt.lat, pt.lng]));
      if (allLatLngs.length > 0) {
        map.fitBounds(window.L.latLngBounds(allLatLngs), { padding: [50, 50] });
        hasFittedAdminMapRef.current = true; // Kunci agar tidak auto-zoom lagi saat auto-refresh
      }
    }
  }, [appRole, syncedRoads, filterKelurahan, filterKondisi]);

  useEffect(() => {
    if (appRole === 'admin' && adminMapInstanceRef.current) {
      setTimeout(() => { adminMapInstanceRef.current.invalidateSize(); }, 300); 
    }
  }, [isSidebarOpen, appRole]);

  // --- EFEK PETA SURVEYOR ---
  useEffect(() => {
    if (appRole !== 'surveyor' || mobileScreen !== 'pin_map' || !isLeafletLoaded || !surveyorMapContainerRef.current) return;

    const map = window.L.map(surveyorMapContainerRef.current);
    surveyorMapInstanceRef.current = map;
    
    const osm = window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });
    const satelit = window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 });
    const googleEarth = window.L.tileLayer('http://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}&apistyle=s.t:2|p.v:off', { maxZoom: 20, subdomains:['mt0','mt1','mt2','mt3'] });
    
    osm.addTo(map); 

    const baseMaps = {
      "Peta Jalan (OSM)": osm,
      "Citra Satelit (Esri)": satelit,
      "Google Earth": googleEarth
    };
    
    window.L.control.layers(baseMaps, null, { position: 'topleft' }).addTo(map);

    setTimeout(() => { map.invalidateSize(); window.dispatchEvent(new Event('resize')); }, 200);

    if (realGpsPoints.length > 0) {
      const latlngs = realGpsPoints.map(pt => [pt.lat, pt.lng]);
      window.L.polyline(latlngs, { color: '#3B82F6', weight: 6, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }).addTo(map);
      window.L.circleMarker(latlngs[0], { radius: 5, fillColor: '#10B981', color: '#fff', weight: 2, fillOpacity: 1 }).addTo(map);
      window.L.circleMarker(latlngs[latlngs.length - 1], { radius: 5, fillColor: '#EF4444', color: '#fff', weight: 2, fillOpacity: 1 }).addTo(map);
      map.fitBounds(window.L.latLngBounds(latlngs), { padding: [30, 30] });
    } else {
      map.setView([-0.425, 117.185], 13);
    }

    map.on('click', (e) => {
      setPinLocation({ lat: e.latlng.lat, lng: e.latlng.lng });
      showToast("📍 Pin kerusakan diletakkan!");
    });

    if ('geolocation' in navigator) {
        watchLocationIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                const newPos = { lat: latitude, lng: longitude };
                setCurrentLocation(newPos);
            },
            (err) => { console.warn("Gagal mendapatkan lokasi GPS:", err); },
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
        );
    }

    return () => {
      if (watchLocationIdRef.current) navigator.geolocation.clearWatch(watchLocationIdRef.current);
      map.remove();
      surveyorMapInstanceRef.current = null;
      surveyorMarkerRef.current = null;
      currentLocationMarkerRef.current = null;
    };
  }, [appRole, mobileScreen, isLeafletLoaded, realGpsPoints]);

  useEffect(() => {
    if (appRole !== 'surveyor' || mobileScreen !== 'pin_map' || !surveyorMapInstanceRef.current) return;
    const map = surveyorMapInstanceRef.current;

    if (pinLocation) {
      const popupContent = `
        <div style="min-width: 240px; font-family: sans-serif;">
          <div style="font-size: 10px; font-weight: bold; color: #ef4444; margin-bottom: 4px; text-transform: uppercase;">Pratinjau Lokasi</div>
          <h4 style="margin: 0 0 10px 0; font-size: 14px; font-weight: 800; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">📍 ${formData.name || 'Nama Jalan Belum Diisi'}</h4>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <th style="padding: 6px 4px; color: #64748b; font-weight: 600; width: 35%;">Kelurahan</th>
              <td style="padding: 6px 4px; color: #334155; font-weight: 700;">${formData.kelurahan}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <th style="padding: 6px 4px; color: #64748b; font-weight: 600;">Kondisi</th>
              <td style="padding: 6px 4px;">
                <span style="background-color: ${getConditionColor(formData.condition)}20; color: ${getConditionColor(formData.condition)}; padding: 3px 6px; border-radius: 4px; font-weight: bold; font-size: 10px;">${formData.condition}</span>
              </td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <th style="padding: 6px 4px; color: #64748b; font-weight: 600; vertical-align: top;">Catatan</th>
              <td style="padding: 6px 4px; color: #475569; font-style: italic;">${formData.notes || '-'}</td>
            </tr>
            <tr>
              <th style="padding: 6px 4px; color: #64748b; font-weight: 600; vertical-align: top;">Koordinat</th>
              <td style="padding: 6px 4px; color: #059669; font-family: monospace; font-size: 11px;">
                ${pinLocation.lat.toFixed(6)}<br/>${pinLocation.lng.toFixed(6)}
              </td>
            </tr>
          </table>
        </div>
      `;

      if (surveyorMarkerRef.current) {
        surveyorMarkerRef.current.setLatLng([pinLocation.lat, pinLocation.lng]);
        surveyorMarkerRef.current.setPopupContent(popupContent);
        surveyorMarkerRef.current.openPopup();
      } else {
        const pinIcon = window.L.divIcon({
          className: 'custom-pin-mobile',
          html: `<div style="background-color: ${getConditionColor(formData.condition)}; width: 18px; height: 18px; border-radius: 50% 50% 50% 0; border: 2px solid white; transform: rotate(-45deg); box-shadow: 2px 2px 5px rgba(0,0,0,0.5);"></div>`,
          iconSize: [18, 18], iconAnchor: [9, 18], popupAnchor: [0, -18]
        });
        surveyorMarkerRef.current = window.L.marker([pinLocation.lat, pinLocation.lng], { icon: pinIcon })
          .addTo(map)
          .bindPopup(popupContent)
          .openPopup();
      }
    }

    if (currentLocation) {
        if (currentLocationMarkerRef.current) {
            currentLocationMarkerRef.current.setLatLng([currentLocation.lat, currentLocation.lng]);
        } else {
            const blueDotIcon = window.L.divIcon({
                className: 'current-location-dot',
                html: `
                    <div style="position: relative; width: 16px; height: 16px;">
                        <div style="position: absolute; width: 16px; height: 16px; background-color: #3B82F6; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.4); z-index: 2;"></div>
                        <div style="position: absolute; top: -8px; left: -8px; width: 32px; height: 32px; background-color: rgba(59, 130, 246, 0.3); border-radius: 50%; animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite; z-index: 1;"></div>
                    </div>
                    <style>@keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }</style>
                `,
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            });
            currentLocationMarkerRef.current = window.L.marker([currentLocation.lat, currentLocation.lng], { icon: blueDotIcon, zIndexOffset: 1000 }).addTo(map);
        }
    }

  }, [appRole, mobileScreen, pinLocation, currentLocation, formData]);


  // --- FUNGSI UTILITI & PERKAKASAN ---
  const startRealHardware = async () => {
    setRealGpsPoints([]); setIsRecording(true); setMobileScreen('record');
    setGpsAccuracy('-'); setCurrentSpeed(0); setTotalDistance(0);
    setUploadedVideoUrl(null); setUploadedVideoFile(null); 
    setUploadedPhotoFiles([]); setUploadedPhotoUrls([]);
    setPinLocation(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      showToast("Kamera tidak diizinkan.");
    }

    if ('geolocation' in navigator) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, accuracy, speed } = position.coords;
          setRealGpsPoints(prev => {
            if (prev.length > 0) {
              const last = prev[prev.length - 1];
              const dist = getDistanceMeters(last.lat, last.lng, latitude, longitude);
              setTotalDistance(d => d + dist);
            }
            return [...prev, { lat: latitude, lng: longitude }];
          });
          setGpsAccuracy(Math.round(accuracy));
          if (speed) setCurrentSpeed(Math.round(speed * 3.6)); 
        },
        () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 5000 }
      );
    }
  };

  const simulateGpsMovement = () => {
    let currentLat = -0.425; let currentLng = 117.185;
    setGpsAccuracy("Simulasi"); setCurrentSpeed(15); setTotalDistance(0);
    if (watchIdRef.current !== null && typeof watchIdRef.current !== 'number') navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = setInterval(() => {
        const oldLat = currentLat;
        const oldLng = currentLng;
        currentLat += (Math.random() * 0.0005) - 0.0001;
        currentLng += (Math.random() * 0.0005) - 0.0002;
        setRealGpsPoints(prev => {
            if (prev.length > 0) {
                const dist = getDistanceMeters(oldLat, oldLng, currentLat, currentLng);
                setTotalDistance(d => d + dist);
            }
            return [...prev, { lat: currentLat, lng: currentLng }];
        });
    }, 1000);
  };

  const stopRealHardware = () => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
    if (watchIdRef.current !== null) {
      if (typeof watchIdRef.current === 'number' && gpsAccuracy === "Simulasi") clearInterval(watchIdRef.current); 
      else navigator.geolocation.clearWatch(watchIdRef.current); 
      watchIdRef.current = null;
    }
    setIsRecording(false); setMobileScreen('form');
  };

  const cancelRecording = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    if (watchIdRef.current !== null) {
        if (typeof watchIdRef.current === 'number' && gpsAccuracy === "Simulasi") clearInterval(watchIdRef.current);
        else navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
    }
    setIsRecording(false); setMobileScreen('home');
  };

  // --- Fungsi Penanganan Multi-Foto ---
  const handlePhotoChange = (e) => {
    const files = Array.from(e.target.files);
    const currentCount = uploadedPhotoFiles.length;
    const allowedCount = 4 - currentCount;
    const newFiles = files.slice(0, allowedCount);

    if (files.length > allowedCount) {
       showToast(`Maksimal 4 foto. Hanya ${allowedCount} foto yang ditambahkan.`);
    }

    const newUrls = newFiles.map(f => URL.createObjectURL(f));
    setUploadedPhotoFiles(prev => [...prev, ...newFiles]);
    setUploadedPhotoUrls(prev => [...prev, ...newUrls]);
  };

  const removePhoto = (index) => {
    setUploadedPhotoFiles(prev => prev.filter((_, i) => i !== index));
    setUploadedPhotoUrls(prev => prev.filter((_, i) => i !== index));
  };


  const saveDraft = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return showToast("Nama jalan wajib diisi!");
    if (realGpsPoints.length < 2) return showToast("Data GPS tidak mencukupi.");

    const simplifiedGps = simplifyGpsData(realGpsPoints, 0.00003); 
    const compressionRate = Math.round((1 - (simplifiedGps.length / realGpsPoints.length)) * 100);

    const newDraft = {
      id: "DRAFT-" + Math.floor(Math.random() * 100000),
      name: formData.name, kelurahan: formData.kelurahan, condition: formData.condition, notes: formData.notes,
      realGps: simplifiedGps, pinLocation: pinLocation, 
      videoFile: uploadedVideoFile, localVideoUrl: uploadedVideoUrl, 
      photoFiles: uploadedPhotoFiles, localPhotoUrls: uploadedPhotoUrls,
      length: (totalDistance / 1000).toFixed(3), // Menyimpan panjang asli jalan dalam km
      date: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
      surveyor: "Tim PUPR",
    };
    
    setDrafts(prev => [...prev, newDraft]);
    setFormData({ name: '', kelurahan: KELURAHAN_LIST[0], condition: 'Tanah/Rusak', notes: '' });
    setUploadedVideoFile(null); setUploadedVideoUrl(null); 
    setUploadedPhotoFiles([]); setUploadedPhotoUrls([]);
    setPinLocation(null);
    setMobileScreen('home'); 
    
    if (compressionRate > 0) showToast(`Tersimpan! GPS dikompresi ${compressionRate}% (${realGpsPoints.length} ➔ ${simplifiedGps.length} titik)`);
    else showToast("Data Tersimpan ke Draf Luring!");
  };

  // --- SUPABASE: UPLOAD DATA & MEDIA ---
  const syncDataToCloud = async () => {
    if (drafts.length === 0) return;
    if (!supabase) return showToast("Konfigurasi Supabase Anda belum diatur di dalam kode.");

    setIsSyncing(true);
    
    try {
      let uploadCount = 0;
      for (const draft of drafts) {
        let finalVideoUrl = null;
        let finalPhotoUrls = [];

        // 1. Upload Video (jika ada)
        if (draft.videoFile) {
          const fileExt = draft.videoFile.name.split('.').pop();
          const fileName = `video-${Date.now()}-${Math.floor(Math.random() * 1000)}.${fileExt}`;
          const { error: uploadError } = await supabase.storage.from('media').upload(fileName, draft.videoFile);

          if (!uploadError) {
            const { data } = supabase.storage.from('media').getPublicUrl(fileName);
            finalVideoUrl = data.publicUrl;
          }
        }

        // 2. Upload Multiple Photos (jika ada)
        if (draft.photoFiles && draft.photoFiles.length > 0) {
          for (let i = 0; i < draft.photoFiles.length; i++) {
            const photoFile = draft.photoFiles[i];
            const fileExt = photoFile.name.split('.').pop();
            const fileName = `photo-${Date.now()}-${i}-${Math.floor(Math.random() * 1000)}.${fileExt}`;
            const { error: photoUploadError } = await supabase.storage.from('media').upload(fileName, photoFile);
            
            if (!photoUploadError) {
              const { data } = supabase.storage.from('media').getPublicUrl(fileName);
              finalPhotoUrls.push(data.publicUrl);
            }
          }
        }

        // 3. Simpan ke Database
        const { id, videoFile, localVideoUrl, photoFiles, localPhotoUrls, ...dataToUpload } = draft; 
        dataToUpload.realGps = JSON.stringify(dataToUpload.realGps); 
        if(dataToUpload.pinLocation) dataToUpload.pinLocation = JSON.stringify(dataToUpload.pinLocation);
        dataToUpload.videoUrl = finalVideoUrl; 
        dataToUpload.photoUrls = JSON.stringify(finalPhotoUrls); // Simpan array string URL foto
        
        const { error: dbError } = await supabase.from('mapped_roads').insert([dataToUpload]);
        
        if (dbError) throw dbError;
        uploadCount++;
      }
      
      showToast(`${uploadCount} Rute Berhasil Diunggah ke Supabase!`);
      setDrafts([]); 
      fetchRoads();
    } catch (error) { 
      console.warn("Peringatan Supabase:", error);
      showToast(`Gagal mengunggah data: ${error.message}`); 
    } finally { 
      setIsSyncing(false); 
    }
  };

  const hapusDataCloud = async (dbId) => {
     if(!supabase) return;
     if(!window.confirm("Hapus permanen rute ini dari database Supabase?")) return;
     try {
        const { error } = await supabase.from('mapped_roads').delete().eq('id', dbId);
        if(error) throw error;
        setSelectedRoad(null); 
        showToast("Rute dihapus dari database pusat.");
        fetchRoads(); 
     } catch (err) { 
        console.warn("Peringatan hapus:", err);
        showToast("Gagal menghapus data."); 
     }
  };


  // =========================================================================
  // RENDER STRUKTUR UTAMA
  // =========================================================================
  return (
    <div className="w-full h-full min-h-screen bg-slate-900 relative text-slate-900 font-sans">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <style dangerouslySetInnerHTML={{__html: `
        .leaflet-container { width: 100%; height: 100%; min-height: 100%; z-index: 10; }
        .animate-fade-in-up { animation: fadeInUp 0.3s ease-out forwards; }
        @keyframes fadeInUp { from { opacity: 0; transform: translate(-50%, 20px); } to { opacity: 1; transform: translate(-50%, 0); } }
        /* Memaksa font cantik khas Tailwind untuk selalu aktif */
        body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background-color: #0f172a; }
      `}} />

      {toastMessage && (
        <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50 bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center space-x-3 transition-all animate-bounce border border-slate-700">
          <span className="text-sm font-semibold">{toastMessage}</span>
        </div>
      )}

      {!appRole && (
        <div className="min-h-screen flex items-center justify-center p-4 bg-slate-900">
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
              <button onClick={() => setAppRole('surveyor')} className="w-full bg-white border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50 text-slate-800 p-4 rounded-2xl flex items-center transition-all group">
                <div className="bg-blue-100 text-blue-600 p-3 rounded-xl mr-4 group-hover:scale-110 transition-transform">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" /></svg>
                </div>
                <div className="text-left">
                  <h3 className="font-extrabold text-slate-900">Aplikasi Surveyor</h3>
                  <p className="text-xs text-slate-500">Akses Perekaman Kamera & GPS</p>
                </div>
              </button>

              <button onClick={() => { setAppRole('admin'); fetchRoads(); }} className="w-full bg-white border-2 border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 text-slate-800 p-4 rounded-2xl flex items-center transition-all group">
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

      {appRole === 'surveyor' && (
        <div className="min-h-screen bg-slate-50 flex flex-col md:max-w-md md:mx-auto md:shadow-2xl md:border-x border-slate-200 relative">
          
          {isSyncing && (
            <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50">
              <div className="bg-white p-6 rounded-2xl shadow-2xl flex flex-col items-center">
                <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                <h3 className="font-bold text-slate-800 text-center">Menyinkronkan ke<br/>Database Supabase...</h3>
              </div>
            </div>
          )}

          <header className="bg-white border-b border-slate-200 py-4 px-5 flex justify-between items-center sticky top-0 z-40">
            <h1 className="font-black text-slate-900 text-lg tracking-tight">R-Map Surveyor</h1>
            <button onClick={() => setAppRole(null)} className="text-rose-500 font-bold text-xs bg-rose-50 px-3 py-1.5 rounded-lg">Keluar</button>
          </header>

          <div className="flex-1 bg-white relative flex flex-col overflow-hidden">
            {mobileScreen === 'home' && (
              <div className="flex-1 p-6 flex flex-col overflow-y-auto">
                <button onClick={startRealHardware} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-3xl p-6 mb-4 mt-4 shadow-xl shadow-blue-600/20 transition-all flex flex-col items-center">
                  <div className="bg-white/20 p-4 rounded-full mb-3"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" /></svg></div>
                  <span className="font-extrabold text-lg">Mulai Rekaman</span>
                  <span className="text-xs text-blue-100 mt-1">Aktifkan Kamera & GPS</span>
                </button>

                <button onClick={() => setMobileScreen('drafts')} className="w-full bg-white border-2 border-slate-200 text-slate-800 rounded-3xl p-5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center space-x-4">
                    <div className="bg-amber-100 p-3 rounded-xl text-amber-700">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-base">Draft Tersimpan</div>
                      <div className="text-xs text-slate-500">Penyimpanan Offline</div>
                    </div>
                  </div>
                  <span className="bg-rose-500 text-white px-3 py-1 rounded-full text-sm font-bold">{drafts.length}</span>
                </button>
              </div>
            )}

            {mobileScreen === 'record' && (
              <div className="flex-1 bg-black flex flex-col relative text-white">
                <div className="flex-1 relative bg-slate-900 flex items-center justify-center overflow-hidden">
                  <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover"/>
                  
                  <div className="absolute top-6 right-6 bg-red-600 px-3 py-1.5 rounded-full text-xs font-bold animate-pulse flex items-center space-x-1.5 shadow-lg">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                    <span>LIVE GPS REC</span>
                  </div>

                  <div className="absolute top-6 left-6 bg-black/60 px-4 py-3 rounded-xl text-xs font-bold font-mono backdrop-blur-md border border-white/10">
                    <div className="text-emerald-400 font-bold mb-1 border-b border-white/20 pb-1">SENSOR DATA:</div>
                    <div>Akurasi: {gpsAccuracy} m</div>
                    <div>Speed: {currentSpeed} km/h</div>
                    <div>Jarak: {totalDistance < 1000 ? Math.round(totalDistance) + ' m' : (totalDistance/1000).toFixed(2) + ' km'}</div>
                    <div>Log Disimpan: {realGpsPoints.length}</div>
                  </div>

                  <div className="absolute top-24 right-6">
                    <button onClick={() => { if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; } }} className="bg-black/60 hover:bg-black/80 text-white px-4 py-2 rounded-xl text-xs font-bold backdrop-blur-md border border-white/20">Matikan Kamera</button>
                  </div>

                  <div className="absolute bottom-8 w-full px-6 space-y-3">
                    {realGpsPoints.length === 0 && (
                      <button onClick={simulateGpsMovement} className="w-full bg-slate-800 text-white text-xs py-3 rounded-xl font-bold shadow-lg">Gagal Sinyal GPS? Gunakan Simulasi</button>
                    )}
                    <div className="bg-black/70 backdrop-blur-md p-4 rounded-2xl border border-white/10 text-left text-xs font-mono h-24 overflow-hidden flex flex-col justify-end">
                      <div className="text-blue-400 font-bold mb-1">Koordinat Terakhir:</div>
                      {realGpsPoints.slice(-2).map((pt, i) => <div key={i} className="text-emerald-300">► {pt.lat.toFixed(6)}, {pt.lng.toFixed(6)}</div>)}
                      {realGpsPoints.length === 0 && <div className="text-slate-400 animate-pulse mt-2">Mencari satelit...</div>}
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-slate-950 flex justify-between items-center z-10 pb-8">
                  <button onClick={cancelRecording} className="text-slate-400 hover:text-white font-bold text-sm">Batal</button>
                  <button onClick={stopRealHardware} className="bg-white text-black px-8 py-4 rounded-full font-black text-sm shadow-xl flex items-center space-x-2">
                    <div className="w-3 h-3 bg-red-500 rounded-sm"></div><span>Selesai & Lapor</span>
                  </button>
                </div>
              </div>
            )}

            {mobileScreen === 'form' && (
              <div className="flex-1 p-6 overflow-y-auto bg-slate-50 text-left">
                <h3 className="text-xl font-black text-slate-800 mb-1">Form Survei Lapangan</h3>
                <p className="text-sm text-slate-500 mb-5">Verifikasi informasi rute yang direkam.</p>
                
                {/* 🔵 KOTAK INFO GPS BARU */}
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl mb-6 flex items-center justify-between shadow-sm">
                  <div className="flex items-center space-x-3">
                    <div className="bg-blue-200 text-blue-600 p-2.5 rounded-xl">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                    </div>
                    <div>
                      <div className="text-blue-900 font-black text-sm leading-tight">Jalur Terekam</div>
                      <div className="text-blue-600 text-[11px] font-bold mt-0.5">{realGpsPoints.length} log satelit | {totalDistance < 1000 ? Math.round(totalDistance) + ' m' : (totalDistance/1000).toFixed(2) + ' km'}</div>
                    </div>
                  </div>
                  <button type="button" onClick={() => setMobileScreen('pin_map')} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-md transition-all active:scale-95 flex items-center space-x-1.5 whitespace-nowrap">
                    <span>Lihat Jalur</span>
                  </button>
                </div>

                <form onSubmit={saveDraft} className="space-y-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Nama Jalan</label>
                    <input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="Cth: Jl. Poros Utama" className="w-full border border-slate-200 p-4 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" required />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Kelurahan</label>
                    <select value={formData.kelurahan} onChange={(e) => setFormData({...formData, kelurahan: e.target.value})} className="w-full border border-slate-200 p-4 rounded-2xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
                      {KELURAHAN_LIST.map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Kondisi Jalan</label>
                    <div className="grid grid-cols-2 gap-3">
                      {['Tanah/Rusak', 'Licin/Buruk', 'Berbatu', 'Aspal/Baik'].map(cond => (
                        <button key={cond} type="button" onClick={() => setFormData({...formData, condition: cond})} className={`p-3 rounded-2xl border text-sm font-extrabold transition-all ${formData.condition === cond ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'}`}>{cond}</button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Catatan Tambahan</label>
                    <textarea value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} className="w-full border border-slate-200 p-4 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-500" rows="3"></textarea>
                  </div>

                  {/* 📸 UNGGAH MULTIPLE FOTO */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                       <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">Unggah Foto (Maks 4)</label>
                       <span className="text-xs font-bold text-slate-400">{uploadedPhotoUrls.length}/4</span>
                    </div>
                    
                    {uploadedPhotoUrls.length < 4 && (
                      <div className="relative border-2 border-dashed border-slate-300 rounded-2xl p-4 text-center bg-white hover:bg-slate-50 transition-colors mb-3">
                        <input type="file" accept="image/*" multiple onChange={handlePhotoChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                        <div className="text-slate-500 text-sm font-semibold flex flex-col items-center">
                          <span className="text-2xl mb-1">📸</span> Tambah Foto
                        </div>
                      </div>
                    )}

                    {uploadedPhotoUrls.length > 0 && (
                      <div className="grid grid-cols-4 gap-2 mb-2">
                        {uploadedPhotoUrls.map((url, idx) => (
                          <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shadow-sm">
                            <img src={url} alt={`Preview ${idx}`} className="w-full h-full object-cover" />
                            <button type="button" onClick={() => removePhoto(idx)} className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow-md border border-white hover:bg-red-600 transition-colors">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 🎥 UNGGAH VIDEO */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Unggah Video (Opsional, Maks 50MB)</label>
                    <div className="relative border-2 border-dashed border-slate-300 rounded-2xl p-4 text-center bg-white hover:bg-slate-50 transition-colors">
                      <input type="file" accept="video/*" onChange={(e) => { 
                          const f = e.target.files[0]; 
                          if(f){ 
                            // 🛑 Validasi Ukuran File (Maksimal 50 MB)
                            const maxSizeBytes = 50 * 1024 * 1024; // 50 MB dalam bytes
                            if (f.size > maxSizeBytes) {
                               showToast("⚠️ Gagal: Ukuran video terlalu besar! Maksimal 50 MB.");
                               e.target.value = ''; // Reset pilihan file
                               return; // Hentikan proses
                            }

                            setUploadedVideoUrl(URL.createObjectURL(f));
                            setUploadedVideoFile(f); 
                            showToast("Video siap dilampirkan."); 
                          } 
                        }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                      {uploadedVideoUrl ? (
                        <div className="text-emerald-600 font-bold text-sm flex flex-col items-center"><span className="text-xl mb-1">✅</span> Video Terlampir (Ketuk tukar)</div>
                      ) : (
                        <div className="text-slate-500 text-sm font-semibold flex flex-col items-center"><span className="text-xl mb-1">📁</span> Pilih file video</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Titik Lokasi Kerusakan (Pin)</label>
                    <div className="bg-white border border-slate-200 p-4 rounded-2xl flex items-center justify-between">
                      <div className={`flex flex-col ${pinLocation ? 'text-emerald-600' : 'text-slate-500'}`}>
                        <span className="text-sm font-bold flex items-center">{pinLocation ? '📍 Pin Terkunci' : 'Belum ditandai'}</span>
                        {pinLocation && (
                           <span className="text-[10px] font-mono mt-1 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                             {pinLocation.lat.toFixed(6)}, {pinLocation.lng.toFixed(6)}
                           </span>
                        )}
                      </div>
                      <button type="button" onClick={() => setMobileScreen('pin_map')} className="bg-amber-100 text-amber-700 px-4 py-2.5 rounded-xl text-xs font-extrabold">{pinLocation ? 'Ubah di Peta' : 'Buka Peta'}</button>
                    </div>
                  </div>

                  <div className="pt-4 pb-8 flex flex-col space-y-3">
                    <button type="submit" className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold text-base shadow-xl">Simpan ke Memori Luring (Draft)</button>
                    <button type="button" onClick={() => {
                      setFormData({ name: '', kelurahan: KELURAHAN_LIST[0], condition: 'Tanah/Rusak', notes: '' });
                      setUploadedVideoFile(null); setUploadedVideoUrl(null); 
                      setUploadedPhotoFiles([]); setUploadedPhotoUrls([]);
                      setPinLocation(null);
                      setMobileScreen('home');
                    }} className="w-full bg-white border-2 border-slate-200 text-slate-600 py-4 rounded-2xl font-bold text-base shadow-sm hover:bg-slate-50">
                      Batal & Kembali
                    </button>
                  </div>
                </form>
              </div>
            )}

            {mobileScreen === 'pin_map' && (
              <div className="flex-1 flex flex-col bg-slate-100 relative">
                <div className="bg-white px-5 py-4 border-b border-slate-200 flex justify-between items-center z-10 shadow-sm">
                  <div><h3 className="font-extrabold text-slate-800 text-base">Tandai Lokasi</h3><p className="text-xs text-slate-500">Ketuk garis biru untuk meletakkan pin</p></div>
                  <button onClick={() => setMobileScreen('form')} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-full font-bold text-sm shadow-md transition-colors">Selesai</button>
                </div>
                
                {/* Tombol Fokus Lokasi Saat Ini */}
                <div className="absolute bottom-6 right-4 z-20">
                     <button 
                         onClick={() => {
                             if (surveyorMapInstanceRef.current && currentLocation) {
                                 surveyorMapInstanceRef.current.setView([currentLocation.lat, currentLocation.lng], 18);
                             } else if (!currentLocation) {
                                 showToast("Mencari sinyal GPS...");
                             }
                         }}
                         className="bg-white p-3 rounded-full shadow-xl border border-slate-200 text-blue-600 hover:bg-slate-50"
                         aria-label="Pusatkan ke lokasi Anda"
                     >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-6 h-6">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                        </svg>
                     </button>
                </div>

                <div className="flex-1 relative z-0">
                   <div ref={surveyorMapContainerRef} className="absolute inset-0 bg-slate-200"></div>
                   {!isLeafletLoaded && <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-sm font-bold text-slate-400 z-10 pointer-events-none">Memuatkan Peta...</div>}
                </div>
              </div>
            )}

            {mobileScreen === 'drafts' && (
              <div className="flex-1 p-6 flex flex-col bg-slate-100 text-left">
                <div className="flex justify-between items-center mb-6 mt-2">
                  <div><h3 className="text-2xl font-black">Draft Offline</h3><p className="text-sm text-slate-500">Disimpan aman di HP</p></div>
                  <button onClick={() => setMobileScreen('home')} className="bg-slate-200 text-slate-600 p-3 rounded-full hover:bg-slate-300">Tutup</button>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto pb-4">
                  {drafts.length === 0 ? (
                    <div className="text-center text-slate-400 mt-10 text-base font-medium border-2 border-dashed border-slate-300 rounded-3xl p-8">Belum ada survei yang disimpan.</div>
                  ) : (
                    drafts.map(d => (
                      <div key={d.id} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-2 h-full" style={{ backgroundColor: getConditionColor(d.condition)}}></div>
                        <div className="pl-3">
                          <div className="font-extrabold text-base text-slate-800">{d.name}</div>
                          <div className="text-xs font-bold text-slate-400 uppercase mt-1">{d.kelurahan}</div>
                          <div className="flex justify-between items-center mt-4 border-t border-slate-100 pt-3 text-xs">
                            <span className="font-bold text-slate-600">{d.realGps.length} Log Satelit</span>
                            <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-lg font-bold">{d.condition}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {drafts.length > 0 && (
                  <div className="pt-2 pb-6">
                    <button onClick={syncDataToCloud} className={`w-full text-white py-4 rounded-2xl font-black text-base flex justify-center items-center space-x-2 shadow-xl ${isDbConnected ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-400'}`}>
                      {isDbConnected ? <span>UNGGAH SEMUA KE SUPABASE</span> : <span>SERVER SUPABASE TERPUTUS</span>}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- RENDER DASBOR ADMIN --- */}
      {appRole === 'admin' && (
        <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans select-none overflow-hidden relative">
          
          <header className="bg-white border-b border-slate-200 h-16 px-4 md:px-6 flex justify-between items-center flex-shrink-0 z-40 shadow-sm">
            <div className="flex items-center space-x-2 md:space-x-3">
              <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1.5 md:p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500" title="Tampilkan/Sembunyikan Menu">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5 md:w-6 md:h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
                </svg>
              </button>
              <div className="hidden md:block bg-blue-600 text-white p-2 rounded-lg">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.246a1.5 1.5 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" /></svg>
              </div>
              <div>
                <h1 className="text-base md:text-lg font-black text-slate-900 leading-none">Dasbor WebGIS</h1>
                <div className="flex items-center space-x-1.5 mt-1">
                   {isDbConnected ? (
                       <span className="flex items-center space-x-1.5"><span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span><span className="text-[9px] md:text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Connected</span></span>
                   ) : (
                       <span className="flex items-center space-x-1.5"><span className="w-2 h-2 bg-rose-500 rounded-full"></span><span className="text-[9px] md:text-[10px] text-rose-600 font-bold uppercase tracking-wider">Paused</span></span>
                   )}
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2 md:space-x-4">
              <button onClick={() => { fetchRoads(); showToast("Memperbarui data dari server..."); }} className="text-blue-600 hover:text-blue-800 font-bold text-xs md:text-sm bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-200 flex items-center space-x-1">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-4 h-4 md:hidden"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                <span className="hidden md:inline">Refresh Data</span>
              </button>
              <button onClick={() => setAppRole(null)} className="text-rose-500 hover:text-white hover:bg-rose-500 border border-rose-200 px-3 md:px-4 py-1.5 rounded-lg text-xs md:text-sm font-bold transition-colors">
                Keluar
              </button>
            </div>
          </header>

          <main className="flex-1 flex overflow-hidden relative">
            {/* Overlay gelap jika sidebar terbuka di HP */}
            {isSidebarOpen && (
               <div className="md:hidden absolute inset-0 bg-slate-900/20 backdrop-blur-sm z-20" onClick={() => setIsSidebarOpen(false)}></div>
            )}

            <aside className={`bg-white flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.02)] transition-all duration-300 ease-in-out overflow-hidden z-30 absolute md:relative h-full ${isSidebarOpen ? 'w-full md:w-96 border-r border-slate-200' : 'w-0 border-r-0'}`}>
              <div className="w-screen md:w-96 flex flex-col h-full flex-shrink-0">
                <div className="p-4 md:p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                  <h3 className="font-extrabold text-slate-800 text-sm flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-4 h-4 mr-2 text-slate-400"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" /></svg>
                    Filter & Laporan
                  </h3>
                  {/* Tombol tutup sidebar khusus HP */}
                  <button onClick={() => setIsSidebarOpen(false)} className="md:hidden bg-slate-200 p-1.5 rounded-lg text-slate-600">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                
                <div className="p-4 md:p-5 border-b border-slate-100 bg-slate-50/50 space-y-3">
                  <select value={filterKelurahan} onChange={(e) => setFilterKelurahan(e.target.value)} className="w-full bg-white border border-slate-200 text-slate-700 text-sm rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm cursor-pointer">
                    <option value="Semua">Semua Wilayah</option>
                    {KELURAHAN_LIST.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                  <select value={filterKondisi} onChange={(e) => setFilterKondisi(e.target.value)} className="w-full bg-white border border-slate-200 text-slate-700 text-sm rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm cursor-pointer">
                    <option value="Semua">Semua Kondisi</option>
                    <option value="Tanah/Rusak">Kritis (Tanah/Rusak)</option>
                    <option value="Licin/Buruk">Bahaya (Licin/Buruk)</option>
                    <option value="Berbatu">Sedang (Berbatu)</option>
                    <option value="Aspal/Baik">Mulus (Aspal)</option>
                  </select>
                </div>

              <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
                <div className="mb-3 flex justify-between items-end px-1">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Laporan Masuk</span>
                  <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-bold">
                    {syncedRoads.filter(r => (filterKelurahan === 'Semua' || r.kelurahan === filterKelurahan) && (filterKondisi === 'Semua' || r.condition === filterKondisi)).length} Data
                  </span>
                </div>

                <div className="space-y-3 pb-8">
                  {syncedRoads.length === 0 ? (
                    <div className="text-center text-slate-400 mt-10 text-sm p-4 border border-dashed border-slate-300 rounded-2xl">
                       Tabel kosong. Menunggu data dari Supabase PostgreSQL.
                    </div>
                  ) : (
                    syncedRoads
                      .filter(road => (filterKelurahan === 'Semua' || road.kelurahan === filterKelurahan) && (filterKondisi === 'Semua' || road.condition === filterKondisi))
                      .map((road) => (
                      <div key={road.dbId || road.id} onClick={() => {
                          setSelectedRoad(road);
                          // Auto close sidebar on mobile so they can see the map
                          if (window.innerWidth < 768) {
                             setIsSidebarOpen(false);
                          }
                          // Fitur Baru: Arahkan kamera peta/zoom langsung ke jalan yang diklik
                          if (adminMapInstanceRef.current && road.realGps && road.realGps.length > 0) {
                             const latlngs = road.realGps.map(pt => [pt.lat, pt.lng]);
                             adminMapInstanceRef.current.fitBounds(window.L.latLngBounds(latlngs), { padding: [40, 40] });
                          }
                      }} className={`p-3 rounded-2xl border bg-white cursor-pointer transition-all hover:-translate-y-0.5 ${selectedRoad?.id === road.id ? 'border-blue-500 shadow-md ring-1 ring-blue-500' : 'border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md'}`}>
                        <div className="flex gap-3">
                          {/* --- KOTAK THUMBNAIL (Prioritas Foto, jika tidak ada baru Video) --- */}
                          <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-slate-100 relative border border-slate-200/60">
                            {road.photoUrls && road.photoUrls.length > 0 ? (
                              <>
                                <img src={road.photoUrls[0]} alt="Foto" className="w-full h-full object-cover" />
                                {road.photoUrls.length > 1 && (
                                  <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded-md font-bold backdrop-blur-sm border border-white/20">
                                    +{road.photoUrls.length - 1}
                                  </div>
                                )}
                              </>
                            ) : road.videoUrl ? (
                              <>
                                <video src={`${road.videoUrl}#t=0.5`} className="w-full h-full object-cover" preload="metadata" muted playsInline />
                                <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-white/90 drop-shadow-md"><path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm14.024-.983a1.125 1.125 0 010 1.966l-5.603 3.113A1.125 1.125 0 019 15.113V8.887c0-.857.921-1.4 1.671-.983l5.603 3.113z" clipRule="evenodd" /></svg>
                                </div>
                              </>
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-6 h-6 mb-1"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" /></svg>
                                <span className="text-[9px] font-bold">No Media</span>
                              </div>
                            )}
                          </div>

                          {/* --- INFO TEKS --- */}
                          <div className="flex-1 flex flex-col min-w-0 py-0.5">
                            <h4 className="font-extrabold text-sm text-slate-800 leading-tight truncate pr-2 mb-1.5">{road.name}</h4>
                            <div className="flex flex-wrap items-center gap-1.5 mb-2">
                              <span className="text-[10px] font-bold text-white px-2 py-0.5 rounded-full whitespace-nowrap" style={{ backgroundColor: getConditionColor(road.condition)}}>{road.condition}</span>
                              <span className="text-[10px] font-semibold text-slate-500 truncate">{road.kelurahan}</span>
                            </div>
                            <div className="mt-auto flex items-center justify-between text-[10px] text-slate-400">
                              <span>{road.date}</span>
                              <span className="font-mono bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 text-slate-500 font-bold">GPS: {road.realGps?.length || 0}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
             </div>
            </aside>

            <section className="flex-1 flex flex-col relative z-0">
              <div className="flex-1 relative w-full h-full">
                <div ref={adminMapContainerRef} className="absolute inset-0 bg-slate-200 z-0"></div>
                {!isLeafletLoaded && <div className="absolute inset-0 flex items-center justify-center bg-slate-100 font-bold text-slate-400 z-10 pointer-events-none">Memuat Peta Leaflet...</div>}
                
                <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm p-2 md:p-3 rounded-xl border border-slate-200 shadow-lg text-[10px] md:text-xs font-bold text-slate-700 z-[1000] pointer-events-none">
                  <div className="mb-1 md:mb-2 text-[9px] md:text-[10px] text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-1 flex justify-between">
                     <span>Legenda Peta</span>
                     <span className="font-extrabold text-blue-600 ml-4">Total: {syncedRoads.filter(r => (filterKelurahan === 'Semua' || r.kelurahan === filterKelurahan) && (filterKondisi === 'Semua' || r.condition === filterKondisi)).length}</span>
                  </div>
                  <div className="flex flex-col space-y-1 md:space-y-2 mt-1 md:mt-2">
                    <div className="flex items-center justify-between space-x-2 md:space-x-3">
                       <div className="flex items-center space-x-1.5 md:space-x-2"><span className="w-3 h-1 md:w-4 md:h-1.5 bg-[#10B981] rounded-full"></span><span>Aspal (Mulus)</span></div>
                       <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded text-[9px] md:text-[10px]">
                          {syncedRoads.filter(r => r.condition === 'Aspal/Baik' && (filterKelurahan === 'Semua' || r.kelurahan === filterKelurahan)).length}
                       </span>
                    </div>
                    <div className="flex items-center justify-between space-x-2 md:space-x-3">
                       <div className="flex items-center space-x-1.5 md:space-x-2"><span className="w-3 h-1 md:w-4 md:h-1.5 bg-[#F59E0B] rounded-full"></span><span>Berbatu (Sedang)</span></div>
                       <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[9px] md:text-[10px]">
                          {syncedRoads.filter(r => r.condition === 'Berbatu' && (filterKelurahan === 'Semua' || r.kelurahan === filterKelurahan)).length}
                       </span>
                    </div>
                    <div className="flex items-center justify-between space-x-2 md:space-x-3">
                       <div className="flex items-center space-x-1.5 md:space-x-2"><span className="w-3 h-1 md:w-4 md:h-1.5 bg-[#B45309] rounded-full"></span><span>Tanah (Rusak)</span></div>
                       <span className="bg-[#B45309] bg-opacity-20 text-[#B45309] px-1.5 py-0.5 rounded text-[9px] md:text-[10px]">
                          {syncedRoads.filter(r => r.condition === 'Tanah/Rusak' && (filterKelurahan === 'Semua' || r.kelurahan === filterKelurahan)).length}
                       </span>
                    </div>
                    <div className="flex items-center justify-between space-x-2 md:space-x-3">
                       <div className="flex items-center space-x-1.5 md:space-x-2"><span className="w-3 h-1 md:w-4 md:h-1.5 bg-[#EF4444] rounded-full"></span><span>Licin (Bahaya)</span></div>
                       <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-[9px] md:text-[10px]">
                          {syncedRoads.filter(r => r.condition === 'Licin/Buruk' && (filterKelurahan === 'Semua' || r.kelurahan === filterKelurahan)).length}
                       </span>
                    </div>
                  </div>
                </div>
              </div>

              {selectedRoad && (
                <div className="absolute bottom-2 md:bottom-6 left-1/2 transform -translate-x-1/2 w-[95%] md:w-11/12 max-w-4xl bg-slate-900 rounded-2xl md:rounded-3xl shadow-2xl border border-slate-700 flex flex-col md:flex-row overflow-hidden z-[1000] animate-fade-in-up max-h-[85vh]">
                  <button onClick={() => setSelectedRoad(null)} className="absolute top-2 right-2 md:top-4 md:right-4 text-slate-400 hover:text-white bg-slate-800 p-1.5 rounded-full z-30">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4 md:w-5 md:h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>

                  <div className="w-full md:w-1/3 bg-black relative border-b md:border-b-0 md:border-r border-slate-800 flex flex-col justify-center items-center h-48 md:min-h-[260px] md:h-auto shrink-0">
                    {/* Prioritas Video di panel hitam */}
                    {selectedRoad.videoUrl ? (
                      <>
                        <video id="admin-vid-player" src={selectedRoad.videoUrl} controls className="absolute inset-0 w-full h-full object-contain bg-black"></video>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            const vid = document.getElementById('admin-vid-player');
                            if(vid) {
                              vid.playbackRate = vid.playbackRate === 1 ? 2 : 1;
                              e.target.innerText = vid.playbackRate === 2 ? "⚡ Kecepatan: 2x" : "⚡ Kecepatan: 1x";
                            }
                          }}
                          className="absolute top-3 left-3 bg-black/60 hover:bg-blue-600 text-white text-[10px] md:text-xs font-bold px-2.5 py-1.5 rounded-lg border border-white/20 backdrop-blur-sm z-10 transition-colors shadow-lg"
                        >
                          ⚡ Kecepatan: 1x
                        </button>
                      </>
                    ) : selectedRoad.photoUrls && selectedRoad.photoUrls.length > 0 ? (
                      <img src={selectedRoad.photoUrls[0]} alt="Foto Utama" className="absolute inset-0 w-full h-full object-cover opacity-80" />
                    ) : (
                      <div className="text-center p-4">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 md:w-10 md:h-10 text-slate-600 mb-1 md:mb-2 mx-auto"><path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm14.024-.983a1.125 1.125 0 010 1.966l-5.603 3.113A1.125 1.125 0 019 15.113V8.887c0-.857.921-1.4 1.671-.983l5.603 3.113z" clipRule="evenodd" /></svg>
                        <span className="text-[10px] md:text-[11px] font-bold text-slate-500">Media Tidak Dilampirkan</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="w-full md:w-2/3 p-4 md:p-6 flex flex-col justify-between bg-slate-900 text-white overflow-y-auto">
                    <div>
                      <div className="flex justify-between items-start mb-1">
                        <div className="text-[10px] md:text-xs font-bold text-blue-400 uppercase tracking-widest">{selectedRoad.kelurahan}</div>
                        <button onClick={() => hapusDataCloud(selectedRoad.id || selectedRoad.dbId)} className="text-[10px] md:text-xs text-rose-400 hover:text-rose-300 font-bold px-2 py-1 md:px-3 bg-rose-500/10 rounded-lg border border-rose-500/20">Hapus Rute</button>
                      </div>
                      <h4 className="text-xl md:text-2xl font-black mb-2 md:mb-3 leading-tight">{selectedRoad.name}</h4>
                      <p className="text-xs md:text-sm text-slate-300 leading-relaxed bg-slate-800/50 p-2.5 md:p-3 rounded-xl border border-slate-700/50 line-clamp-3 md:line-clamp-none">"{selectedRoad.notes || "Tidak ada catatan."}"</p>
                      
                      {selectedRoad.pinLocation && selectedRoad.pinLocation.lat && selectedRoad.pinLocation.lng && (
                        <div className="mt-2 md:mt-3 text-[10px] md:text-xs text-amber-300 bg-amber-500/10 p-2 md:p-2.5 rounded-lg border border-amber-500/20 inline-flex items-center">
                          <span className="mr-1.5 md:mr-2 text-sm md:text-base">📍</span> Pin: {selectedRoad.pinLocation.lat.toFixed(5)}, {selectedRoad.pinLocation.lng.toFixed(5)}
                        </div>
                      )}

                      {/* Galeri Foto di Dasbor Detail */}
                      {selectedRoad.photoUrls && selectedRoad.photoUrls.length > 0 && (
                        <div className="mt-3 md:mt-4 border-t border-slate-700/50 pt-3 md:pt-4">
                          <span className="text-[10px] md:text-xs font-bold text-slate-400 mb-1.5 md:mb-2 block uppercase tracking-wider">Galeri Foto ({selectedRoad.photoUrls.length})</span>
                          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-700">
                            {selectedRoad.photoUrls.map((url, i) => (
                              <a href={url} target="_blank" rel="noreferrer" key={i} className="flex-shrink-0 relative group">
                                <img src={url} className="w-14 h-14 md:w-16 md:h-16 rounded-xl object-cover border border-slate-600 hover:border-blue-400 transition-colors" />
                                <div className="absolute inset-0 bg-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4 md:w-5 md:h-5 text-white drop-shadow-md"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" /></svg>
                                </div>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex gap-2 md:gap-3 text-[10px] md:text-xs font-bold text-slate-400 mt-3 md:mt-4 flex-wrap">
                      <span className="bg-slate-800 px-2.5 py-1 md:py-1.5 rounded-lg">{selectedRoad.date}</span>
                      <span className="bg-slate-800 px-2.5 py-1 md:py-1.5 rounded-lg">{selectedRoad.surveyor}</span>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </main>
        </div>
      )}

    </div>
  );
}
