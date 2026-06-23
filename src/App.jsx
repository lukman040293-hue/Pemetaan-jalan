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
  // Jika sudah ada kata "Kel." atau "Kelurahan" di database, jangan ditambahkan lagi
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

// --- HELPER: FORMAT PANJANG JALAN ---
const formatLength = (kmString) => {
  if (!kmString) return '-';
  const km = parseFloat(kmString);
  if (isNaN(km) || km === 0) return '-';
  return km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(2) + ' km';
};

// --- HELPER: KOMPRESI GAMBAR (CANVAS) ---
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

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Gagal mengonversi canvas ke Blob'));
              return;
            }
            const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + "_compressed.jpg", {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          'image/jpeg',
          quality 
        );
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

// --- KOMPONEN ANGKA ANIMASI (ROLLING NUMBER) ---
const AnimatedNumber = ({ value }) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let startTimestamp = null;
    const duration = 1500; 
    let animationFrame;

    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const easeOut = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplayValue(Math.floor(easeOut * value));
      
      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(step);
      }
    };

    animationFrame = window.requestAnimationFrame(step);
    
    return () => window.cancelAnimationFrame(animationFrame);
  }, [value]);

  return <>{displayValue}</>;
};

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
    let metaViewport = document.querySelector('meta[name="viewport"]');
    if (!metaViewport) {
      metaViewport = document.createElement('meta');
      metaViewport.name = 'viewport';
      document.head.appendChild(metaViewport);
    }
    metaViewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';

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
  const [videoSnapshot, setVideoSnapshot] = useState([]); 
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  // --- MEMUAT DRAFT DARI LOCAL STORAGE ---
  useEffect(() => {
    try {
      const savedDrafts = localStorage.getItem('rmap_drafts');
      if (savedDrafts) {
        setDrafts(JSON.parse(savedDrafts));
      }
    } catch (error) {
      console.warn("Gagal memuat draft dari Local Storage:", error);
    }
  }, []);

  // --- MENYIMPAN DRAFT KE LOCAL STORAGE ---
  useEffect(() => {
    try {
      const draftsToSave = drafts.map(draft => {
        const { videoFile, photoFiles, ...safeDraft } = draft;
        return safeDraft;
      });
      localStorage.setItem('rmap_drafts', JSON.stringify(draftsToSave));
    } catch (error) {
      console.warn("Gagal menyimpan draft ke Local Storage:", error);
    }
  }, [drafts]);

  // --- STATE ADMIN ---
  const [filterKelurahan, setFilterKelurahan] = useState('Semua');
  const [filterJenis, setFilterJenis] = useState('Semua'); 
  const [filterKondisi, setFilterKondisi] = useState('Semua');
  const [highlightedRoadId, setHighlightedRoadId] = useState(null);
  const [selectedAdminRouteIds, setSelectedAdminRouteIds] = useState([]); 
  
  // State Animasi
  const [isAnimatingMap, setIsAnimatingMap] = useState(false);
  const [animatingRoadsList, setAnimatingRoadsList] = useState([]); 
  const [isAnimPaused, setIsAnimPaused] = useState(false);
  const isAnimPausedRef = useRef(false);
  const [animationSpeedMultiplier, setAnimationSpeedMultiplier] = useState(1.0);
  const animationSpeedRef = useRef(1.0);
  const [currentAnimDistance, setCurrentAnimDistance] = useState(0);
  const [showSpeedControl, setShowSpeedControl] = useState(false);
  const [animIconType, setAnimIconType] = useState('car'); 
  const animatedMarkerRef = useRef(null);
  const animationTimeoutRef = useRef(null);

  useEffect(() => { animationSpeedRef.current = animationSpeedMultiplier; }, [animationSpeedMultiplier]);
  useEffect(() => { isAnimPausedRef.current = isAnimPaused; }, [isAnimPaused]);

  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768);
  const [showFloatingLegend, setShowFloatingLegend] = useState(window.innerWidth >= 768);

  const adminMapContainerRef = useRef(null);
  const adminMapInstanceRef = useRef(null);
  const adminLayerGroupRef = useRef(null);
  const adminHighlightLayerGroupRef = useRef(null);
  const hasFittedAdminMapRef = useRef(false);

  useEffect(() => {
    if (!selectedRoad) {
      setHighlightedRoadId(null);
      setIsAnimatingMap(false);
      setAnimatingRoadsList([]);
      setShowSpeedControl(false);
      if (adminMapInstanceRef.current) adminMapInstanceRef.current.closePopup();
    } else {
      setHighlightedRoadId(selectedRoad.id || selectedRoad.dbId);
      setIsAnimatingMap(false);
    }
  }, [selectedRoad]);

  const toggleAdminRouteSelection = (id) => {
    setSelectedAdminRouteIds(prev => 
      prev.includes(id) ? prev.filter(rId => rId !== id) : [...prev, id]
    );
  };

  // --- STATE SURVEYOR ---
  const [mobileScreen, setMobileScreen] = useState('home'); 
  const [isRecording, setIsRecording] = useState(false);
  const [realGpsPoints, setRealGpsPoints] = useState([]);
  
  // State Khusus Untuk Mode Gambar Manual
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

  const liveMapContainerRef = useRef(null);
  const liveMapInstanceRef = useRef(null);
  const liveMapMarkerRef = useRef(null);
  const liveMapPolylineRef = useRef(null);

  // Refs Khusus Untuk Mode Gambar Manual
  const drawMapContainerRef = useRef(null);
  const drawMapInstanceRef = useRef(null);
  const drawPolylineRef = useRef(null);
  const drawMarkersGroupRef = useRef(null);

  useEffect(() => { recordingStatusRef.current = recordingStatus; }, [recordingStatus]);

  const [selectedDraftIds, setSelectedDraftIds] = useState([]);
  const [formData, setFormData] = useState({
    name: '', kelurahan: KELURAHAN_LIST[0], jenisJalan: 'Aspal', condition: 'Baik', notes: ''
  });
  const [editingDraftId, setEditingDraftId] = useState(null); 

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const watchIdRef = useRef(null);

  const surveyorMapContainerRef = useRef(null);
  const surveyorMapInstanceRef = useRef(null);
  const surveyorMarkerRef = useRef(null);
  const currentLocationMarkerRef = useRef(null); 

  const locatingTimeoutRef = useRef(null);
  const isGpsForcedRef = useRef(false);

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

  // --- HELPER: FORMAT DATA SUPABASE ---
  const formatRoadData = (road) => {
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
      id: road.id || road.dbId,
      realGps: parsedGps,
      pinLocation: parsedPin,
      photoUrls: parsedPhotos
    };
  };

  // --- 2. SUPABASE: TARIK DATA & POLLING ---
  const fetchRoads = async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('mapped_roads')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
        
      if (error) throw error;

      const formattedData = (data || []).map(formatRoadData);

      setSyncedRoads(prev => {
        if (JSON.stringify(prev) === JSON.stringify(formattedData)) return prev;
        return formattedData;
      });
      setIsDbConnected(true);
    } catch (error) {
      console.warn("Peringatan jaringan saat mengambil data dari Supabase:", error.message);
      setIsDbConnected(false);
      
      if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError")) {
         showToast("Gagal menyambung ke Supabase. Periksa koneksi internet Anda.");
      }
    }
  };

  useEffect(() => {
    if (!supabase) return;
    fetchRoads();
    const intervalId = setInterval(() => { fetchRoads(); }, 15000);
    return () => clearInterval(intervalId);
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
    const highlightGroup = window.L.layerGroup().addTo(map);
    
    adminMapInstanceRef.current = map;
    adminLayerGroupRef.current = layerGroup;
    adminHighlightLayerGroupRef.current = highlightGroup;

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
             (filterJenis === 'Semua' || road.jenisJalan === filterJenis) &&
             (filterKondisi === 'Semua' || road.condition === filterKondisi);
    });

    filteredRoads.forEach(road => {
      const roadId = road.id || road.dbId;
      if (road.realGps && road.realGps.length > 0) {
        const latlngs = road.realGps.map(pt => [pt.lat, pt.lng]);
        
        const polyline = window.L.polyline(latlngs, { 
          color: getConditionColor(road.condition), 
          weight: 5, 
          opacity: 0.65,
          lineCap: 'round', 
          lineJoin: 'round'
        }).addTo(layerGroup);

        window.L.circleMarker(latlngs[0], { radius: 3, fillColor: '#10B981', color: '#ffffff', weight: 1.5, fillOpacity: 1 }).addTo(layerGroup);
        window.L.circleMarker(latlngs[latlngs.length - 1], { radius: 3, fillColor: '#EF4444', color: '#ffffff', weight: 1.5, fillOpacity: 1 }).addTo(layerGroup);

        let marker = null;
        if (road.pinLocation && road.pinLocation.lat && road.pinLocation.lng) {
          const conditionColor = getConditionColor(road.condition);
          const pinSvg = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 40" width="14" height="24" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.3)); transition: all 0.2s ease;">
              <rect x="10.5" y="12" width="3" height="28" rx="1.5" fill="#475569" />
              <circle cx="12" cy="12" r="12" fill="${conditionColor}" />
              <circle cx="7.5" cy="7.5" r="3.5" fill="rgba(255,255,255,0.35)" />
            </svg>
          `;

          const pinIcon = window.L.divIcon({
            className: 'custom-pin-svg', 
            html: pinSvg,
            iconSize: [14, 24], 
            iconAnchor: [7, 24], 
            popupAnchor: [0, -24] 
          });
          
          const uniqueId = roadId || Math.floor(Math.random() * 1000000);
          const popupContent = `
            <div style="min-width: 240px; font-family: sans-serif;">
              <h4 style="margin: 0 0 10px 0; font-size: 14px; font-weight: 800; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">📍 ${road.name}</h4>
              <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <th style="padding: 6px 4px; color: #64748b; font-weight: normal; width: 35%;">Kelurahan</th>
                  <td style="padding: 6px 4px; color: #334155; font-weight: bold;">${formatKel(road.kelurahan)}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <th style="padding: 6px 4px; color: #64748b; font-weight: normal;">Jenis Jalan</th>
                  <td style="padding: 6px 4px; color: #334155; font-weight: bold;">${road.jenisJalan || '-'}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <th style="padding: 6px 4px; color: #64748b; font-weight: normal;">Pjg. Rute</th>
                  <td style="padding: 6px 4px; color: #334155; font-weight: bold;">${formatLength(road.length)}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <th style="padding: 6px 4px; color: #64748b; font-weight: normal;">Kondisi</th>
                  <td style="padding: 6px 4px;">
                    <span style="background-color: ${getConditionColor(road.condition)}20; color: ${getConditionColor(road.condition)}; padding: 3px 6px; border-radius: 4px; font-weight: bold; font-size: 11px;">${road.condition}</span>
                  </td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <th style="padding: 6px 4px; color: #64748b; font-weight: normal; vertical-align: top;">Catatan</th>
                  <td style="padding: 6px 4px; color: #475569; font-style: italic; font-weight: bold;">${road.notes || '-'}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <th style="padding: 6px 4px; color: #64748b; font-weight: normal; vertical-align: top;">Koordinat</th>
                  <td style="padding: 6px 4px; color: #2563eb; font-family: monospace; font-weight: bold;">
                    ${road.pinLocation.lat.toFixed(6)}<br/>${road.pinLocation.lng.toFixed(6)}
                  </td>
                </tr>
                <tr>
                  <th style="padding: 6px 4px; color: #64748b; font-weight: normal;">Tanggal</th>
                  <td style="padding: 6px 4px; color: #475569; font-weight: bold;">${road.date}</td>
                </tr>
              </table>
              ${road.photoUrls && road.photoUrls.length > 0 ? `<div style="font-size: 11px; text-align: center; margin-top: 8px; color: #3b82f6; font-weight: bold;">[+] Tersedia ${road.photoUrls.length} Foto Lampiran</div>` : ''}
              
              <button id="btn-detail-${uniqueId}" class="btn-detail-popup">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" style="width: 14px; height: 14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                Lihat Detail Laporan
              </button>
            </div>
          `;
          
          marker = window.L.marker([road.pinLocation.lat, road.pinLocation.lng], { icon: pinIcon })
            .addTo(layerGroup)
            .bindPopup(popupContent, { autoClose: true, closeOnClick: true });
            
          marker.on('popupopen', () => {
            setHighlightedRoadId(roadId);
            const btn = document.getElementById(`btn-detail-${uniqueId}`);
            if (btn) {
              btn.onclick = () => {
                setSelectedRoad(road);
                setVideoSnapshot([]); 
                if (window.innerWidth < 768) setIsSidebarOpen(false);
              };
            }
          });

          marker.on('popupclose', () => {
            setHighlightedRoadId(prev => prev === roadId ? null : prev);
          });
        }
        
        polyline.on('click', () => {
          setHighlightedRoadId(roadId);
          if (marker) marker.openPopup();
        });
      }
    });

    if (filteredRoads.length > 0 && map && !hasFittedAdminMapRef.current) {
      const allLatLngs = filteredRoads.flatMap(r => r.realGps.map(pt => [pt.lat, pt.lng]));
      if (allLatLngs.length > 0) {
        map.fitBounds(window.L.latLngBounds(allLatLngs), { padding: [50, 50] });
        hasFittedAdminMapRef.current = true;
      }
    }
  }, [appRole, syncedRoads, filterKelurahan, filterKondisi, filterJenis]);

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

        if (activeRoad.pinLocation && activeRoad.pinLocation.lat) {
           const pulseIcon = window.L.divIcon({
              className: 'custom-pulse',
              html: `<div class="animate-ping" style="width: 100%; height: 100%; background-color: ${getConditionColor(activeRoad.condition)}; border-radius: 50%; opacity: 0.8;"></div>`,
              iconSize: [40, 40],
              iconAnchor: [20, 20]
           });
           window.L.marker([activeRoad.pinLocation.lat, activeRoad.pinLocation.lng], { icon: pulseIcon, interactive: false }).addTo(highlightGroup);
        }
      }
    }
  }, [highlightedRoadId, syncedRoads, appRole]);

  useEffect(() => {
    if (appRole === 'admin' && adminMapInstanceRef.current) {
      setTimeout(() => { adminMapInstanceRef.current.invalidateSize(); }, 300); 
    }
  }, [isSidebarOpen, appRole]);

  // --- EFEK: ANIMASI RUTE DI ADMIN ---
  useEffect(() => {
    let onInteractionStart = null;
    let onInteractionEnd = null;
    let activeTimeouts = [];
    let activeMarkers = [];

    if (isAnimatingMap && animatingRoadsList.length > 0 && adminMapInstanceRef.current) {
       const map = adminMapInstanceRef.current;
       let isInteracting = false;

       const getBearing = (lat1, lng1, lat2, lng2) => {
           const toRad = deg => deg * Math.PI / 180;
           const toDeg = rad => rad * 180 / Math.PI;
           const dLng = toRad(lng2 - lng1);
           const y = Math.sin(dLng) * Math.cos(toRad(lat2));
           const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
           return (toDeg(Math.atan2(y, x)) + 360) % 360;
       };

       onInteractionStart = () => { 
           isInteracting = true; 
           activeMarkers.forEach(m => {
               if(m && m.getElement()) m.getElement().style.transition = 'none';
           });
       };
       onInteractionEnd = () => { isInteracting = false; };
       
       map.on('zoomstart', onInteractionStart);
       map.on('zoomend', onInteractionEnd);
       map.on('dragstart', onInteractionStart);
       map.on('dragend', onInteractionEnd);

       let finishedCount = 0;
       const totalVehicles = animatingRoadsList.length;

       animatingRoadsList.forEach((road, vIndex) => {
           const points = road.realGps;
           if (!points || points.length < 2) {
               finishedCount++;
               return;
           }

           // Menambahkan faktor kecepatan acak (0.7x hingga 1.4x) untuk setiap kendaraan
           // Ini akan membedakan kecepatan tiap rute saat diputar bersamaan
           const individualSpeedFactor = 0.7 + (Math.random() * 0.7);

           let currentIndex = 0;
           let accumulatedDistance = 0;
           let currentAngle = getBearing(points[0].lat, points[0].lng, points[1].lat, points[1].lng);
           const iconColor = getConditionColor(road.condition);
           
           let iconHtml = '';
           let iconSize = [32, 50];
           let iconAnchor = [16, 25];

           if (animIconType === 'motorcycle') {
               iconSize = [20, 44];
               iconAnchor = [10, 22];
               iconHtml = `
                <div id="anim-car-wrapper-${vIndex}" style="width: ${iconSize[0]}px; height: ${iconSize[1]}px; transform-origin: center center; transform: rotate(${currentAngle}deg); transition: transform 0.3s ease-out;">
                    <svg viewBox="0 0 40 100" width="100%" height="100%" style="filter: drop-shadow(0 4px 6px rgba(0,0,0,0.4));">
                        <rect x="16" y="5" width="8" height="20" rx="4" fill="#1e293b"/>
                        <rect x="16" y="75" width="8" height="20" rx="4" fill="#1e293b"/>
                        <rect x="24" y="60" width="4" height="25" rx="2" fill="#cbd5e1"/>
                        <rect x="10" y="20" width="20" height="60" rx="10" fill="${iconColor}"/>
                        <rect x="4" y="25" width="32" height="4" rx="2" fill="#475569"/>
                        <rect x="2" y="22" width="6" height="8" rx="3" fill="#0f172a"/>
                        <rect x="32" y="22" width="6" height="8" rx="3" fill="#0f172a"/>
                        <circle cx="20" cy="45" r="12" fill="#f8fafc" stroke="#94a3b8" stroke-width="2"/>
                        <circle cx="20" cy="18" r="4" fill="#fef08a"/>
                        <rect x="16" y="78" width="8" height="4" rx="2" fill="#ef4444"/>
                    </svg>
                </div>`;
           } else if (animIconType === 'runner') {
               iconSize = [28, 28];
               iconAnchor = [14, 14];
               iconHtml = `
                <div id="anim-car-wrapper-${vIndex}" style="width: ${iconSize[0]}px; height: ${iconSize[1]}px; transform-origin: center center; transform: rotate(${currentAngle}deg); transition: transform 0.3s ease-out;">
                    <svg viewBox="0 0 50 50" width="100%" height="100%" style="filter: drop-shadow(0 3px 4px rgba(0,0,0,0.4));">
                        <style>@keyframes runCycle { 0% { transform: scaleX(1); } 50% { transform: scaleX(-1); } 100% { transform: scaleX(1); } }</style>
                        <g style="animation: runCycle 0.5s infinite steps(1); transform-origin: 25px 25px;">
                            <rect x="16" y="6" width="6" height="14" rx="3" fill="#1e293b" />
                            <rect x="28" y="30" width="6" height="14" rx="3" fill="#1e293b" />
                            <path d="M 14 25 Q 6 36 12 44" fill="none" stroke="${iconColor}" stroke-width="5" stroke-linecap="round" />
                            <circle cx="12" cy="44" r="3" fill="#fcd34d" />
                            <path d="M 36 25 Q 44 14 38 6" fill="none" stroke="${iconColor}" stroke-width="5" stroke-linecap="round" />
                            <circle cx="38" cy="6" r="3" fill="#fcd34d" />
                            <rect x="13" y="20" width="24" height="10" rx="5" fill="${iconColor}" />
                        </g>
                        <circle cx="25" cy="25" r="7" fill="#fcd34d" />
                        <path d="M 18 25 A 7 7 0 0 1 32 25 Z" fill="#0f172a" />
                    </svg>
                </div>`;
           } else {
               iconSize = [32, 50];
               iconAnchor = [16, 25];
               iconHtml = `
                <div id="anim-car-wrapper-${vIndex}" style="width: 32px; height: 50px; transform-origin: center center; transform: rotate(${currentAngle}deg); transition: transform 0.3s ease-out;">
                    <svg viewBox="0 0 100 160" width="100%" height="100%" style="filter: drop-shadow(0 6px 8px rgba(0,0,0,0.4));">
                        <rect x="8" y="35" width="16" height="30" rx="6" fill="#334155"/>
                        <rect x="76" y="35" width="16" height="30" rx="6" fill="#334155"/>
                        <rect x="8" y="105" width="16" height="30" rx="6" fill="#334155"/>
                        <rect x="76" y="105" width="16" height="30" rx="6" fill="#334155"/>
                        <rect x="18" y="5" width="64" height="14" rx="7" fill="#cbd5e1"/>
                        <rect x="22" y="145" width="56" height="10" rx="5" fill="#cbd5e1"/>
                        <rect x="14" y="12" width="72" height="135" rx="28" fill="${iconColor}"/>
                        <rect x="18" y="16" width="64" height="127" rx="24" fill="rgba(0,0,0,0.15)"/>
                        <rect x="20" y="18" width="60" height="123" rx="22" fill="${iconColor}"/>
                        <circle cx="26" cy="18" r="9" fill="#f1f5f9" stroke="#94a3b8" stroke-width="2"/>
                        <circle cx="26" cy="18" r="4" fill="#fef08a"/>
                        <circle cx="74" cy="18" r="9" fill="#f1f5f9" stroke="#94a3b8" stroke-width="2"/>
                        <circle cx="74" cy="18" r="4" fill="#fef08a"/>
                        <path d="M 22 55 Q 50 40 78 55 L 72 75 Q 50 65 28 75 Z" fill="#1e293b"/>
                        <path d="M 26 120 Q 50 130 74 120 L 70 108 Q 50 115 30 108 Z" fill="#1e293b"/>
                        <path d="M 20 78 L 24 105 Q 26 90 28 78 Z" fill="#1e293b"/>
                        <path d="M 80 78 L 76 105 Q 74 90 72 78 Z" fill="#1e293b"/>
                        <rect x="28" y="72" width="44" height="38" rx="12" fill="${iconColor}"/>
                        <rect x="32" y="74" width="36" height="16" rx="8" fill="rgba(255,255,255,0.4)"/>
                        <rect x="22" y="140" width="12" height="6" rx="3" fill="#ef4444"/>
                        <rect x="66" y="140" width="12" height="6" rx="3" fill="#ef4444"/>
                    </svg>
                </div>`;
           }
           
           const customVehicleIcon = window.L.divIcon({
              className: 'moving-vehicle-icon',
              html: iconHtml,
              iconSize: iconSize,
              iconAnchor: iconAnchor 
           });

           const marker = window.L.marker([points[0].lat, points[0].lng], { icon: customVehicleIcon, zIndexOffset: 1000 }).addTo(map);
           activeMarkers.push(marker);

           const animate = () => {
              if (currentIndex >= points.length) {
                 finishedCount++;
                 if (finishedCount >= totalVehicles) {
                     setIsAnimatingMap(false);
                     setIsAnimPaused(false);
                     showToast("Animasi semua rute selesai.");
                 }
                 return;
              }

              if (isAnimPausedRef.current) {
                  activeTimeouts.push(setTimeout(animate, 100));
                  return;
              }
              
              const pt = points[currentIndex];
              let segmentDelay = 600 / animationSpeedRef.current; 

              if (currentIndex > 0) {
                  const prevPt = points[currentIndex - 1];
                  const dist = getDistanceMeters(prevPt.lat, prevPt.lng, pt.lat, pt.lng);
                  accumulatedDistance += dist;
                  
                  if (totalVehicles === 1) setCurrentAnimDistance(accumulatedDistance);

                  const baseVisualSpeedMps = 75; 
                  // Terapkan kecepatan global (dari slider kontrol) dikalikan kecepatan individu kendaraan
                  let calculatedDelay = (dist / baseVisualSpeedMps) * 1000 / (animationSpeedRef.current * individualSpeedFactor);
                  segmentDelay = Math.max(30, Math.min(calculatedDelay, 8000));
              }

              if (marker) {
                  const el = marker.getElement();
                  if (el && currentIndex > 0) {
                      if (isInteracting) {
                          el.style.transition = 'none';
                      } else {
                          el.style.transition = `transform ${segmentDelay}ms linear`;
                      }
                  }
                  marker.setLatLng([pt.lat, pt.lng]);
              }
              
              if (currentIndex > 0) {
                  const prevPt = points[currentIndex - 1];
                  // Pastikan titik sebelumnya dan saat ini berbeda agar perhitungan sudut tidak ngawur
                  if (prevPt.lat !== pt.lat || prevPt.lng !== pt.lng) {
                      const targetBearing = getBearing(prevPt.lat, prevPt.lng, pt.lat, pt.lng);
                      
                      let diff = targetBearing - (currentAngle % 360);
                      if (diff > 180) diff -= 360;
                      if (diff < -180) diff += 360;
                      currentAngle += diff;
    
                      const carWrapper = document.getElementById(`anim-car-wrapper-${vIndex}`);
                      if (carWrapper) {
                          // Membatasi waktu rotasi maksimal 400ms agar belokan tampak realistis dan tidak over-predicting
                          carWrapper.style.transition = `transform ${Math.min(segmentDelay * 0.5, 400)}ms ease-in-out`;
                          carWrapper.style.transform = `rotate(${currentAngle}deg)`;
                      }
                  }
              }

              currentIndex++;
              activeTimeouts.push(setTimeout(animate, segmentDelay)); 
           };

           activeTimeouts.push(setTimeout(animate, 800 + (vIndex * 60))); 
       });

       const allRouteBounds = animatingRoadsList.flatMap(r => r.realGps.map(pt => [pt.lat, pt.lng]));
       if (allRouteBounds.length > 0) {
          map.fitBounds(window.L.latLngBounds(allRouteBounds), { paddingTopLeft: [80, 80], paddingBottomRight: [80, 180] });
       }
    }

    return () => {
       activeTimeouts.forEach(clearTimeout);
       activeMarkers.forEach(m => {
           if(m && adminMapInstanceRef.current) adminMapInstanceRef.current.removeLayer(m);
       });
       if (adminMapInstanceRef.current && onInteractionStart && onInteractionEnd) {
           adminMapInstanceRef.current.off('zoomstart', onInteractionStart);
           adminMapInstanceRef.current.off('zoomend', onInteractionEnd);
           adminMapInstanceRef.current.off('dragstart', onInteractionStart);
           adminMapInstanceRef.current.off('dragend', onInteractionEnd);
       }
    };
  }, [isAnimatingMap, animatingRoadsList, animIconType]);

  // --- EFEK: PEMANTAU LOKASI LATAR (GLOBAL UNTUK SURVEYOR) ---
  // Kita pisahkan agar current location tetap terpantau di layar mana pun saat role adalah surveyor
  useEffect(() => {
      if (appRole !== 'surveyor') return;
      
      let watchId;
      if ('geolocation' in navigator) {
          watchId = navigator.geolocation.watchPosition(
              (position) => {
                  setCurrentLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
              },
              () => { console.warn("GPS belum stabil atau izin ditolak."); },
              { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
          );
      }
      return () => {
          if (watchId) navigator.geolocation.clearWatch(watchId);
      };
  }, [appRole]);

  // --- EFEK PETA DRAW MAP (MODE GAMBAR MANUAL) ---
  useEffect(() => {
    if (appRole !== 'surveyor' || mobileScreen !== 'draw_map' || !isLeafletLoaded || !drawMapContainerRef.current) return;

    const map = window.L.map(drawMapContainerRef.current);
    drawMapInstanceRef.current = map;
    
    // Default ke Citra Satelit karena sangat membantu untuk menggambar manual
    const satelit = window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 });
    const osm = window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });
    
    satelit.addTo(map); 

    window.L.control.layers({
      "Citra Satelit (Esri)": satelit,
      "Peta Jalan (OSM)": osm
    }, null, { position: 'topleft' }).addTo(map);

    drawMarkersGroupRef.current = window.L.layerGroup().addTo(map);
    drawPolylineRef.current = window.L.polyline([], { color: '#3B82F6', weight: 6, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }).addTo(map);

    // Pusatkan peta ke lokasi sekarang jika ada, atau ke default Samarinda
    if (currentLocation) {
        map.setView([currentLocation.lat, currentLocation.lng], 16);
    } else {
        map.setView([-0.425, 117.185], 14);
    }

    setTimeout(() => { map.invalidateSize(); window.dispatchEvent(new Event('resize')); }, 300);

    return () => {
      map.remove();
      drawMapInstanceRef.current = null;
      drawPolylineRef.current = null;
      drawMarkersGroupRef.current = null;
    };
  }, [appRole, mobileScreen, isLeafletLoaded]);

  // --- LOGIKA KLIK DAN UPDATE VISUAL PADA DRAW MAP ---
  useEffect(() => {
      if (mobileScreen !== 'draw_map' || !drawMapInstanceRef.current) return;
      const map = drawMapInstanceRef.current;

      const onMapClick = (e) => {
          setManualDrawnPoints(prev => {
              const newPt = { lat: e.latlng.lat, lng: e.latlng.lng };
              if (prev.length > 0) {
                  const lastPt = prev[prev.length - 1];
                  const dist = getDistanceMeters(lastPt.lat, lastPt.lng, newPt.lat, newPt.lng);
                  setTotalDistance(d => d + dist);
              }
              return [...prev, newPt];
          });
      };

      map.on('click', onMapClick);
      return () => { map.off('click', onMapClick); };
  }, [mobileScreen]);

  useEffect(() => {
      if (mobileScreen !== 'draw_map' || !drawPolylineRef.current || !drawMarkersGroupRef.current) return;
      
      drawPolylineRef.current.setLatLngs(manualDrawnPoints.map(p => [p.lat, p.lng]));
      
      drawMarkersGroupRef.current.clearLayers();
      manualDrawnPoints.forEach((pt, idx) => {
          const isStart = idx === 0;
          const isEnd = idx === manualDrawnPoints.length - 1;
          const color = isStart ? '#10B981' : (isEnd ? '#EF4444' : '#ffffff');
          const radius = (isStart || isEnd) ? 5 : 3;
          const weight = (isStart || isEnd) ? 2 : 1.5;
          window.L.circleMarker([pt.lat, pt.lng], { radius, fillColor: color, color: (isStart||isEnd)?'#fff':'#3B82F6', weight, fillOpacity: 1 }).addTo(drawMarkersGroupRef.current);
      });
  }, [manualDrawnPoints, mobileScreen]);


  // --- EFEK PETA PIN (UNTUK FORM) ---
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
      window.L.polyline(latlngs, { color: getConditionColor(formData.condition), weight: 6, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }).addTo(map);
      window.L.circleMarker(latlngs[0], { radius: 3, fillColor: '#10B981', color: '#fff', weight: 1.5, fillOpacity: 1 }).addTo(map);
      window.L.circleMarker(latlngs[latlngs.length - 1], { radius: 3, fillColor: '#EF4444', color: '#fff', weight: 1.5, fillOpacity: 1 }).addTo(map);
      map.fitBounds(window.L.latLngBounds(latlngs), { padding: [30, 30] });
    } else {
      map.setView([-0.425, 117.185], 13);
    }

    map.on('click', async (e) => {
      setPinLocation({ lat: e.latlng.lat, lng: e.latlng.lng });
      showToast("📍 Pin diletakkan! Mendeteksi wilayah...");
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${e.latlng.lat}&lon=${e.latlng.lng}&zoom=18&addressdetails=1`);
        const data = await response.json();
        
        if (data && data.address) {
          const possibleNames = [
            data.address.village, data.address.suburb, data.address.neighbourhood,
            data.address.city_district, data.address.residential, data.address.town
          ].filter(Boolean);

          let foundKelurahan = null;
          for (let name of possibleNames) {
            const normalizedName = name.toLowerCase().replace(/kelurahan|desa|kecamatan/gi, '').trim();
            const match = KELURAHAN_LIST.find(k => k.toLowerCase() === normalizedName);
            if (match) { foundKelurahan = match; break; }
          }
          if (foundKelurahan) {
            setFormData(prev => ({ ...prev, kelurahan: foundKelurahan }));
            showToast(`✅ Otomatis diset: Kel. ${foundKelurahan}`);
          }
        }
      } catch (err) {
        console.warn("Gagal mendeteksi lokasi otomatis:", err);
      }
    });

    return () => {
      map.remove();
      surveyorMapInstanceRef.current = null;
      surveyorMarkerRef.current = null;
      currentLocationMarkerRef.current = null;
    };
  }, [appRole, mobileScreen, isLeafletLoaded, realGpsPoints, formData.condition]);

  useEffect(() => {
    if (appRole !== 'surveyor' || mobileScreen !== 'pin_map' || !surveyorMapInstanceRef.current) return;
    const map = surveyorMapInstanceRef.current;

    if (pinLocation) {
      if (surveyorMarkerRef.current) {
        surveyorMarkerRef.current.remove();
        surveyorMarkerRef.current = null; 
      }
      
      if (!surveyorMarkerRef.current) {
        const conditionColor = getConditionColor(formData.condition);
        const pinSvgMobile = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 40" width="18" height="30" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4)); transition: all 0.2s ease;">
            <rect x="10.5" y="12" width="3" height="28" rx="1.5" fill="#475569" />
            <circle cx="12" cy="12" r="12" fill="${conditionColor}" />
            <circle cx="7.5" cy="7.5" r="3.5" fill="rgba(255,255,255,0.35)" />
          </svg>
        `;

        const pinIcon = window.L.divIcon({
          className: 'custom-pin-mobile-svg',
          html: pinSvgMobile,
          iconSize: [18, 30], 
          iconAnchor: [9, 30] 
        });
        surveyorMarkerRef.current = window.L.marker([pinLocation.lat, pinLocation.lng], { icon: pinIcon })
          .addTo(map);
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
    setRealGpsPoints([]); 
    setIsRecording(true); 
    setMobileScreen('record');
    setRecordingStatus('locating'); 
    setRecordTab('map'); 
    setGpsAccuracy('-'); setCurrentSpeed(0); setTotalDistance(0);
    setUploadedVideoUrl(null); setUploadedVideoFile(null); 
    setUploadedPhotoFiles([]); setUploadedPhotoUrls([]);
    setPinLocation(null);
    setEditingDraftId(null); 

    isGpsForcedRef.current = false;
    if (locatingTimeoutRef.current) clearTimeout(locatingTimeoutRef.current);

    locatingTimeoutRef.current = setTimeout(() => {
      if (recordingStatusRef.current === 'locating') {
        showToast("⏳ Sinyal GPS sulit didapat. Tombol 'Mulai' diaktifkan paksa dengan toleransi rendah.");
        isGpsForcedRef.current = true;
        setRecordingStatus('ready');
      }
    }, 15000);

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
          const currentSpeedKmh = speed ? Math.round(speed * 3.6) : 0;
          
          setGpsAccuracy(Math.round(accuracy));
          setCurrentSpeed(currentSpeedKmh);
          setCurrentLocation({ lat: latitude, lng: longitude });
          
          if (recordingStatusRef.current === 'locating' && accuracy <= 25) {
             if (locatingTimeoutRef.current) clearTimeout(locatingTimeoutRef.current);
             setRecordingStatus('ready');
             showToast("Sinyal GPS Bagus! Siap Memulai.");
          } else if (recordingStatusRef.current === 'ready' && accuracy > 40 && !isGpsForcedRef.current) {
             setRecordingStatus('locating'); 
          }

          if (recordingStatusRef.current === 'recording' || recordingStatusRef.current === 'auto_paused') {
            if (accuracy > 40 && !isGpsForcedRef.current) return; 

            setRealGpsPoints(prev => {
              if (prev.length === 0) {
                 lastMoveTimeRef.current = Date.now();
                 return [{ lat: latitude, lng: longitude }];
              }
              
              const last = prev[prev.length - 1];
              const dist = getDistanceMeters(last.lat, last.lng, latitude, longitude);
              
              if (dist < 3.5) {
                 if (Date.now() - lastMoveTimeRef.current > 10000 && recordingStatusRef.current === 'recording') {
                    setRecordingStatus('auto_paused');
                    showToast("Terdeteksi Berhenti: Auto-Pause aktif.");
                 }
                 return prev;
              }
              if (dist > 100) return prev; 
              
              if (recordingStatusRef.current === 'auto_paused') {
                 setRecordingStatus('recording');
                 showToast("Bergerak: Melanjutkan rekaman otomatis.");
              }
              
              lastMoveTimeRef.current = Date.now();
              setTotalDistance(d => d + dist);
              return [...prev, { lat: latitude, lng: longitude }];
            });
          }
        },
        () => {}, 
        { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
      );
    }
  };

  // --- FUNGSI MODE GAMBAR MANUAL ---
  const startManualDrawing = () => {
    setManualDrawnPoints([]);
    setRealGpsPoints([]); // Pastikan yang dikirim ke form bersih di awal
    setTotalDistance(0);
    setUploadedVideoUrl(null); setUploadedVideoFile(null); 
    setUploadedPhotoFiles([]); setUploadedPhotoUrls([]);
    setPinLocation(null);
    setEditingDraftId(null); 
    setMobileScreen('draw_map');
  };

  const undoLastDrawnPoint = () => {
    setManualDrawnPoints(prev => {
        if (prev.length === 0) return prev;
        if (prev.length === 1) {
            setTotalDistance(0);
            return [];
        }
        const newPoints = prev.slice(0, -1);
        let newDist = 0;
        for (let i = 1; i < newPoints.length; i++) {
            newDist += getDistanceMeters(newPoints[i-1].lat, newPoints[i-1].lng, newPoints[i].lat, newPoints[i].lng);
        }
        setTotalDistance(newDist);
        return newPoints;
    });
  };

  const finishManualDrawing = () => {
    if (manualDrawnPoints.length < 2) {
        showToast("Gambarkan minimal 2 titik untuk membuat rute!");
        return;
    }
    setRealGpsPoints(manualDrawnPoints);
    setMobileScreen('form');
  };

  const simulateGpsMovement = () => {
    let currentLat = -0.425; let currentLng = 117.185;
    setGpsAccuracy("Simulasi"); setCurrentSpeed(15); setTotalDistance(0);
    setRecordingStatus('ready'); 
    
    if (watchIdRef.current !== null && typeof watchIdRef.current !== 'number') navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = setInterval(() => {
        const oldLat = currentLat;
        const oldLng = currentLng;
        currentLat += (Math.random() * 0.0005) - 0.0001;
        currentLng += (Math.random() * 0.0005) - 0.0002;
        setCurrentLocation({ lat: currentLat, lng: currentLng });

        if (recordingStatusRef.current === 'recording') {
           setRealGpsPoints(prev => {
               if (prev.length > 0) {
                   const dist = getDistanceMeters(oldLat, oldLng, currentLat, currentLng);
                   setTotalDistance(d => d + dist);
               }
               return [...prev, { lat: currentLat, lng: currentLng }];
           });
        }
    }, 1000);
  };

  const stopRealHardware = () => {
    if (locatingTimeoutRef.current) clearTimeout(locatingTimeoutRef.current);
    if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
    if (watchIdRef.current !== null) {
      if (typeof watchIdRef.current === 'number' && gpsAccuracy === "Simulasi") clearInterval(watchIdRef.current); 
      else navigator.geolocation.clearWatch(watchIdRef.current); 
      watchIdRef.current = null;
    }
    setIsRecording(false); 
    setRecordingStatus('idle');
    setMobileScreen('form');
  };

  const cancelRecording = () => {
    if (locatingTimeoutRef.current) clearTimeout(locatingTimeoutRef.current);
    if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
    if (watchIdRef.current !== null) {
        if (typeof watchIdRef.current === 'number' && gpsAccuracy === "Simulasi") clearInterval(watchIdRef.current);
        else navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
    }
    setIsRecording(false); 
    setRecordingStatus('idle');
    setMobileScreen('home');
  };

  useEffect(() => {
    if (mobileScreen !== 'record' || !liveMapContainerRef.current || !isLeafletLoaded || liveMapInstanceRef.current) return;
    
    const map = window.L.map(liveMapContainerRef.current, { zoomControl: false }).setView([-0.425, 117.185], 16);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    liveMapInstanceRef.current = map;
    
    liveMapPolylineRef.current = window.L.polyline([], { color: '#3B82F6', weight: 6, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }).addTo(map);

    setTimeout(() => map.invalidateSize(), 300);

    return () => {
       map.remove();
       liveMapInstanceRef.current = null;
       liveMapPolylineRef.current = null;
       liveMapMarkerRef.current = null;
    };
  }, [mobileScreen, isLeafletLoaded]);

  useEffect(() => {
    if (!liveMapInstanceRef.current || mobileScreen !== 'record') return;
    const map = liveMapInstanceRef.current;

    if (currentLocation) {
       if (liveMapMarkerRef.current) {
          liveMapMarkerRef.current.setLatLng([currentLocation.lat, currentLocation.lng]);
       } else {
          const blueDotIcon = window.L.divIcon({
              className: 'live-location-dot',
              html: `<div style="width: 16px; height: 16px; background-color: #3B82F6; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 6px rgba(0,0,0,0.5);"></div>`,
              iconSize: [16, 16], iconAnchor: [8, 8]
          });
          liveMapMarkerRef.current = window.L.marker([currentLocation.lat, currentLocation.lng], { icon: blueDotIcon, zIndexOffset: 1000 }).addTo(map);
          map.setView([currentLocation.lat, currentLocation.lng], 17);
       }
       
       if (recordTab === 'map' && (recordingStatus === 'recording' || recordingStatus === 'ready')) {
           map.panTo([currentLocation.lat, currentLocation.lng], {animate: true, duration: 0.5});
       }
    }

    if (liveMapPolylineRef.current) {
        liveMapPolylineRef.current.setLatLngs(realGpsPoints.map(pt => [pt.lat, pt.lng]));
    }
  }, [currentLocation, realGpsPoints, mobileScreen, recordTab, recordingStatus]);

  useEffect(() => {
     if (recordTab === 'map' && liveMapInstanceRef.current) {
        const map = liveMapInstanceRef.current;
        map.invalidateSize();
        const timers = [100, 300, 500].map(time => 
            setTimeout(() => { 
                if (liveMapInstanceRef.current) {
                    liveMapInstanceRef.current.invalidateSize(true); 
                }
            }, time)
        );
        return () => timers.forEach(clearTimeout);
     }
  }, [recordTab]);

  const handlePhotoChange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const currentCount = uploadedPhotoFiles.length;
    const allowedCount = 4 - currentCount;
    const newFilesToProcess = files.slice(0, allowedCount);

    if (files.length > allowedCount) {
       showToast(`Maksimal 4 foto. Hanya ${allowedCount} foto yang ditambahkan.`);
    }

    showToast("⏳ Mengompresi foto...");

    try {
      const compressedFiles = await Promise.all(
        newFilesToProcess.map(file => compressImage(file, 1000, 1000, 0.7))
      );

      const newUrls = compressedFiles.map(f => URL.createObjectURL(f));
      setUploadedPhotoFiles(prev => [...prev, ...compressedFiles]);
      setUploadedPhotoUrls(prev => [...prev, ...newUrls]);
      showToast("✅ Foto berhasil dikompresi!");
    } catch (error) {
      console.warn("Error kompresi:", error);
      showToast("⚠️ Gagal mengompresi beberapa foto.");
    }
  };

  const removePhoto = (index) => {
    setUploadedPhotoFiles(prev => prev.filter((_, i) => i !== index));
    setUploadedPhotoUrls(prev => prev.filter((_, i) => i !== index));
  };

  const toggleDraftSelection = (id) => {
    setSelectedDraftIds(prev => 
      prev.includes(id) ? prev.filter(draftId => draftId !== id) : [...prev, id]
    );
  };

  const selectAllDrafts = () => {
    if (selectedDraftIds.length === drafts.length) {
      setSelectedDraftIds([]); 
    } else {
      setSelectedDraftIds(drafts.map(d => d.id)); 
    }
  };

  const editDraft = (draft) => {
    setFormData({
      name: draft.name, kelurahan: draft.kelurahan, jenisJalan: draft.jenisJalan || 'Aspal', condition: draft.condition, notes: draft.notes
    });
    setRealGpsPoints(draft.realGps);
    setTotalDistance(parseFloat(draft.length) * 1000 || 0); 
    setPinLocation(draft.pinLocation);
    setUploadedVideoFile(draft.videoFile || null);
    setUploadedVideoUrl(draft.localVideoUrl || null);
    setUploadedPhotoFiles(draft.photoFiles || []);
    setUploadedPhotoUrls(draft.localPhotoUrls || []);
    
    setEditingDraftId(draft.id); 
    setMobileScreen('form');     
  };

  const deleteDraft = (id) => {
    if(window.confirm("Hapus draft offline ini secara permanen?")) {
      setDrafts(prev => prev.filter(d => d.id !== id));
      setSelectedDraftIds(prev => prev.filter(selId => selId !== id)); 
      showToast("Draft berhasil dihapus.");
    }
  };

  const saveDraft = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return showToast("Nama jalan wajib diisi!");
    if (realGpsPoints.length < 2) return showToast("Data GPS tidak mencukupi.");

    const simplifiedGps = simplifyGpsData(realGpsPoints, 0.00001); 
    const compressionRate = Math.round((1 - (simplifiedGps.length / realGpsPoints.length)) * 100);

    const newDraft = {
      id: editingDraftId || ("DRAFT-" + Math.floor(Math.random() * 100000)), 
      name: formData.name, kelurahan: formData.kelurahan, jenisJalan: formData.jenisJalan, condition: formData.condition, notes: formData.notes,
      realGps: simplifiedGps, pinLocation: pinLocation, 
      videoFile: uploadedVideoFile, localVideoUrl: uploadedVideoUrl, 
      photoFiles: uploadedPhotoFiles, localPhotoUrls: uploadedPhotoUrls,
      length: (totalDistance / 1000).toFixed(3), 
      date: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
      surveyor: "Tim PUPR",
      isUploaded: false, 
    };
    
    if (editingDraftId) {
       setDrafts(prev => prev.map(d => d.id === editingDraftId ? newDraft : d));
       showToast("Draft berhasil diperbarui!");
    } else {
       setDrafts(prev => [...prev, newDraft]);
       if (compressionRate > 0) showToast(`Tersimpan! GPS dikompresi ${compressionRate}% (${realGpsPoints.length} ➔ ${simplifiedGps.length} titik)`);
       else showToast("Data Tersimpan ke Draf Luring!");
    }

    setFormData({ name: '', kelurahan: KELURAHAN_LIST[0], jenisJalan: 'Aspal', condition: 'Baik', notes: '' });
    setUploadedVideoFile(null); setUploadedVideoUrl(null); 
    setUploadedPhotoFiles([]); setUploadedPhotoUrls([]);
    setPinLocation(null);
    setEditingDraftId(null);
    setMobileScreen('drafts'); 
  };

  const syncDataToCloud = async () => {
    const draftsToUpload = drafts.filter(d => selectedDraftIds.includes(d.id));

    if (draftsToUpload.length === 0) return showToast("Pilih draft yang ingin diunggah!");
    if (!supabase) return showToast("Konfigurasi Supabase Anda belum diatur di dalam kode.");

    setIsSyncing(true);
    setSyncMessage("Mempersiapkan data...");
    
    try {
      let uploadCount = 0;
      for (let i = 0; i < draftsToUpload.length; i++) {
        const draft = draftsToUpload[i];
        let finalVideoUrl = null;
        let finalPhotoUrls = [];

        if (draft.videoFile) {
          const sizeInMB = (draft.videoFile.size / (1024 * 1024)).toFixed(1);
          setSyncMessage(`Mengunggah Video (${sizeInMB} MB) ke Cloud CDN... (Rute ${i+1}/${draftsToUpload.length})`);
          
          const formData = new FormData();
          formData.append('file', draft.videoFile);
          formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
          
          try {
             const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`, {
                 method: 'POST',
                 body: formData
             });
             const data = await res.json();
             if (data.secure_url) {
                 finalVideoUrl = data.secure_url;
             } else {
                 throw new Error(data.error?.message || "Gagal upload video");
             }
          } catch (uploadError) {
             console.warn("Gagal mengunggah video ke Cloudinary:", uploadError);
             showToast(`Video rute ${draft.name} gagal diunggah, melanjutkan tanpa video.`);
          }
        }

        if (draft.photoFiles && draft.photoFiles.length > 0) {
          setSyncMessage(`Mengunggah ${draft.photoFiles.length} Foto ke Cloud CDN... (Rute ${i+1}/${draftsToUpload.length})`);
          
          for (let j = 0; j < draft.photoFiles.length; j++) {
            const photoFile = draft.photoFiles[j];
            const formData = new FormData();
            formData.append('file', photoFile);
            formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

            try {
               const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
                   method: 'POST',
                   body: formData
               });
               const data = await res.json();
               if (data.secure_url) {
                   finalPhotoUrls.push(data.secure_url);
               }
            } catch (photoUploadError) {
               console.warn("Gagal mengunggah foto ke Cloudinary:", photoUploadError);
            }
          }
        }

        setSyncMessage(`Menyimpan Data Rute ${i+1}/${draftsToUpload.length} ke Supabase...`);
        
        const { id, videoFile, localVideoUrl, photoFiles, localPhotoUrls, isUploaded, ...dataToUpload } = draft; 
        dataToUpload.realGps = JSON.stringify(dataToUpload.realGps); 
        if(dataToUpload.pinLocation) dataToUpload.pinLocation = JSON.stringify(dataToUpload.pinLocation);
        dataToUpload.videoUrl = finalVideoUrl; 
        dataToUpload.photoUrls = JSON.stringify(finalPhotoUrls); 
        
        const { error: dbError } = await supabase.from('mapped_roads').insert([dataToUpload]);
        
        if (dbError) throw dbError;
        uploadCount++;
      }
      
      setSyncMessage("Selesai!");
      showToast(`${uploadCount} Rute Berhasil Diunggah ke Supabase!`);
      
      setDrafts(prev => prev.map(d => selectedDraftIds.includes(d.id) ? { ...d, isUploaded: true } : d));
      setSelectedDraftIds([]); 
      fetchRoads();
    } catch (error) { 
      console.warn("Peringatan Supabase:", error);
      showToast(`Gagal mengunggah data: ${error.message}`); 
    } finally { 
      setIsSyncing(false); 
      setSyncMessage("");
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

  const handleExportKML = () => {
    if (!selectedRoad || !selectedRoad.realGps || selectedRoad.realGps.length === 0) {
      showToast("Tidak ada data rute GPS untuk diekspor.");
      return;
    }

    const coordinates = selectedRoad.realGps.map(pt => `${pt.lng},${pt.lat},0`).join(' ');
    let colorHex = getConditionColor(selectedRoad.condition).replace('#', '');
    let kmlColor = colorHex.length === 6 ? `ff${colorHex.substring(4,6)}${colorHex.substring(2,4)}${colorHex.substring(0,2)}` : 'ffff0000';

    let pinPlacemark = '';
    if (selectedRoad.pinLocation && selectedRoad.pinLocation.lat) {
      pinPlacemark = `
    <Placemark>
      <name>Titik Lokasi: ${selectedRoad.name}</name>
      <description>Kondisi: ${selectedRoad.condition}</description>
      <Point>
        <coordinates>${selectedRoad.pinLocation.lng},${selectedRoad.pinLocation.lat},0</coordinates>
      </Point>
    </Placemark>`;
    }

    const kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${selectedRoad.name}</name>
    <description>Kelurahan: ${formatKel(selectedRoad.kelurahan)} | Kondisi: ${selectedRoad.condition}</description>
    <Style id="routeStyle">
      <LineStyle>
        <color>${kmlColor}</color>
        <width>5</width>
      </LineStyle>
    </Style>
    <Placemark>
      <name>Jalur Rute</name>
      <styleUrl>#routeStyle</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>
          ${coordinates}
        </coordinates>
      </LineString>
    </Placemark>${pinPlacemark}
  </Document>
</kml>`;

    const blob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Rute_${selectedRoad.name.replace(/\s+/g, '_')}.kml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("File KML berhasil diunduh.");
  };

  const handleShareLocation = () => {
    if (!selectedRoad || !selectedRoad.pinLocation || !selectedRoad.pinLocation.lat) {
      showToast("Titik pin lokasi tidak tersedia.");
      return;
    }
    const lat = selectedRoad.pinLocation.lat;
    const lng = selectedRoad.pinLocation.lng;
    const mapLink = `https://www.google.com/maps?q=${lat},${lng}`;
    const shareText = `Kerusakan Jalan: ${selectedRoad.name} (${selectedRoad.condition}). Cek di peta: ${mapLink}`;

    if (navigator.share) {
      navigator.share({
        title: `Lokasi: ${selectedRoad.name}`,
        text: shareText,
        url: mapLink
      }).catch(err => console.warn("Share batal/gagal:", err));
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = shareText;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        showToast("Tautan Google Maps disalin ke clipboard!");
      } catch (err) {
         showToast("Gagal menyalin tautan.");
      }
      document.body.removeChild(textArea);
    }
  };

  const handlePrint = async () => {
    if (!selectedRoad) return;
    let snapshots = [];

    if (selectedRoad.videoUrl) {
      try {
        const videoEl = document.getElementById('admin-vid-player');
        if (videoEl && videoEl.readyState >= 2 && !isNaN(videoEl.duration) && videoEl.duration > 0) { 
          showToast("Mengekstrak 4 cuplikan video untuk dicetak...");
          
          const originalTime = videoEl.currentTime;
          const isPaused = videoEl.paused;
          const duration = videoEl.duration;
          const times = [duration * 0.1, duration * 0.35, duration * 0.6, duration * 0.85];

          for (let t of times) {
             await new Promise(resolve => {
                const onSeeked = () => {
                   videoEl.removeEventListener('seeked', onSeeked);
                   clearTimeout(fallback); 
                   try {
                     const canvas = document.createElement('canvas');
                     canvas.width = videoEl.videoWidth;
                     canvas.height = videoEl.videoHeight;
                     const ctx = canvas.getContext('2d');
                     ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
                     snapshots.push(canvas.toDataURL('image/jpeg', 0.8));
                   } catch(e) {
                     console.warn("CORS/Tangkapan diblokir:", e);
                   }
                   resolve();
                };
                const fallback = setTimeout(() => {
                   videoEl.removeEventListener('seeked', onSeeked);
                   resolve();
                }, 1500); 

                videoEl.addEventListener('seeked', onSeeked);
                videoEl.currentTime = t; 
             });
          }
          videoEl.currentTime = originalTime;
          if (!isPaused) videoEl.play();
        }
      } catch (err) {
        console.warn("Gagal mengekstrak frame video otomatis:", err);
      }
    } 

    setVideoSnapshot(snapshots);
    setTimeout(() => {
      window.print();
    }, 800);
  };

  const filteredRoads = syncedRoads.filter(road => {
    return (filterKelurahan === 'Semua' || road.kelurahan === filterKelurahan) &&
           (filterJenis === 'Semua' || road.jenisJalan === filterJenis) &&
           (filterKondisi === 'Semua' || road.condition === filterKondisi);
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

  return (
    <div className="fixed inset-0 w-full overflow-hidden bg-slate-900 text-slate-900 font-sans print:relative print:h-auto print:overflow-visible print:bg-white">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <style dangerouslySetInnerHTML={{__html: `
        .leaflet-container { width: 100%; height: 100%; min-height: 100%; z-index: 10; touch-action: none; }
        .animate-fade-in-up { animation: fadeInUp 0.3s ease-out forwards; }
        @keyframes fadeInUp { from { opacity: 0; transform: translate(-50%, 20px); } to { opacity: 1; transform: translate(-50%, 0); } }
        .animate-fade-in { animation: fadeIn 0.2s ease-out forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }

        body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background-color: #0f172a; overscroll-behavior: none; overflow: hidden; }
        
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(148, 163, 184, 0.5); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: rgba(148, 163, 184, 0.8); }

        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

        @media screen and (max-width: 768px) {
          input, select, textarea { font-size: 16px !important; }
        }

        .leaflet-left { transition: left 0.3s ease-in-out; }
        .sidebar-open .leaflet-left { left: 380px !important; }
        @media (max-width: 768px) {
          .sidebar-open .leaflet-left { left: calc(85vw + 10px) !important; }
        }

        .leaflet-control-layers-toggle { width: 30px !important; height: 30px !important; background-size: 16px !important; }
        .leaflet-touch .leaflet-control-layers-toggle { width: 34px !important; height: 34px !important; background-size: 18px !important; }

        .btn-detail-popup { margin-top: 12px; width: 100%; background-color: #3b82f6; color: white; border: none; padding: 8px; border-radius: 8px; font-weight: 700; font-size: 12px; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3); display: flex; justify-content: center; align-items: center; gap: 6px; }
        .btn-detail-popup:hover { background-color: #2563eb; }
        .btn-detail-popup:active { transform: scale(0.98); }

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

          <header className="bg-white border-b border-slate-200 px-5 flex justify-between items-center sticky top-0 z-40 pt-6 pb-3 md:py-4">
            <h1 className="font-black text-slate-900 text-lg tracking-tight">R-Map Surveyor</h1>
            <button onClick={() => setAppRole(null)} className="text-rose-500 font-bold text-xs bg-rose-50 px-3 py-1.5 rounded-lg hover:bg-rose-100 transition-colors">Keluar</button>
          </header>

          <div className="flex-1 bg-white relative flex flex-col overflow-hidden">
            {mobileScreen === 'home' && (
              <div className="flex-1 p-6 flex flex-col overflow-y-auto">
                <div className="flex space-x-3 mb-4 mt-4">
                    <button onClick={startRealHardware} className="w-1/2 bg-blue-600 hover:bg-blue-700 text-white rounded-3xl p-5 shadow-xl shadow-blue-600/20 transition-all flex flex-col items-center justify-center">
                        <div className="bg-white/20 p-3 rounded-full mb-3">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                        </div>
                        <span className="font-extrabold text-sm leading-tight text-center">Rekam<br/>GPS Live</span>
                    </button>

                    <button onClick={startManualDrawing} className="w-1/2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-3xl p-5 shadow-xl shadow-emerald-500/20 transition-all flex flex-col items-center justify-center">
                        <div className="bg-white/20 p-3 rounded-full mb-3">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zm-7.518-.267A8.25 8.25 0 1120.25 10.5M8.288 14.212A5.25 5.25 0 1117.25 10.5" /></svg>
                        </div>
                        <span className="font-extrabold text-sm leading-tight text-center">Gambar<br/>Rute Manual</span>
                    </button>
                </div>

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

            {mobileScreen === 'draw_map' && (
              <div className="flex-1 flex flex-col bg-slate-100 relative overflow-hidden">
                <div className="bg-white px-5 pb-3 border-b border-slate-200 flex justify-between items-center z-20 shadow-sm pt-6 md:py-4 relative">
                  <div>
                     <h3 className="font-extrabold text-slate-800 text-base">Gambar Manual</h3>
                     <p className="text-xs text-slate-500">Ketuk peta untuk membuat jalur rute</p>
                  </div>
                  <button onClick={() => setMobileScreen('home')} className="text-slate-400 hover:text-rose-500 transition-colors p-2 rounded-full bg-slate-100 border border-slate-200 shadow-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>

                <div className="flex-1 relative z-0">
                   <div ref={drawMapContainerRef} className="absolute inset-0 bg-slate-200 cursor-crosshair"></div>
                   {!isLeafletLoaded && <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-sm font-bold text-slate-400 z-10 pointer-events-none">Memuatkan Peta...</div>}
                </div>

                {/* Gradient Bawah untuk kontras tombol UI terhadap peta Satelit */}
                <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-slate-900/70 to-transparent z-10 pointer-events-none"></div>
                
                {/* Tombol Lokasi GPS - POSISINYA DINAIKKAN AGAR TIDAK KETINDIS */}
                <div className="absolute bottom-[220px] right-4 z-20">
                     <button 
                         onClick={() => {
                             if (drawMapInstanceRef.current && currentLocation) {
                                 drawMapInstanceRef.current.setView([currentLocation.lat, currentLocation.lng], 16);
                             } else if (!currentLocation) {
                                 showToast("Lokasi GPS Anda belum terdeteksi...");
                             }
                         }}
                         className="bg-white/95 backdrop-blur-md p-3.5 rounded-full shadow-xl border border-slate-200/80 text-blue-600 hover:bg-blue-50 active:scale-95 transition-transform flex items-center justify-center"
                         aria-label="Pusatkan ke lokasi Anda"
                     >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                        </svg>
                     </button>
                </div>

                {/* Panel Kontrol Bawah */}
                <div className="absolute bottom-6 left-4 right-4 z-20 flex flex-col gap-3">
                     <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/80 p-4 flex justify-between items-center">
                         <div>
                            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Total Titik: <span className="text-blue-600 font-black">{manualDrawnPoints.length}</span></div>
                            <div className="text-xl font-black text-slate-900 leading-none">
                               {totalDistance < 1000 ? Math.round(totalDistance) : (totalDistance/1000).toFixed(2)} <span className="text-sm font-medium text-slate-500">{totalDistance < 1000 ? 'm' : 'km'}</span>
                            </div>
                         </div>
                         
                         <button onClick={undoLastDrawnPoint} disabled={manualDrawnPoints.length === 0} className={`p-3.5 rounded-full flex items-center justify-center transition-all border shadow-sm ${manualDrawnPoints.length > 0 ? 'bg-amber-100 border-amber-200 text-amber-700 hover:bg-amber-200 active:scale-95' : 'bg-slate-100 border-slate-200 text-slate-400 opacity-50 cursor-not-allowed'}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
                         </button>
                     </div>

                     <button onClick={finishManualDrawing} disabled={manualDrawnPoints.length < 2} className={`w-full py-4 rounded-2xl font-black text-sm shadow-2xl flex justify-center items-center space-x-2 transition-all border ${manualDrawnPoints.length >= 2 ? 'bg-emerald-500 text-white border-emerald-400 hover:bg-emerald-600 active:scale-95' : 'bg-slate-800/95 backdrop-blur-md text-slate-400 border-slate-700 cursor-not-allowed'}`}>
                         <span>SELESAI GAMBAR JALUR</span>
                         {manualDrawnPoints.length >= 2 ? (
                             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm4.28 10.28a.75.75 0 000-1.06l-3-3a.75.75 0 10-1.06 1.06l1.72 1.72H8.25a.75.75 0 000 1.5h5.69l-1.72 1.72a.75.75 0 101.06 1.06l3-3z" clipRule="evenodd" /></svg>
                         ) : (
                             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                         )}
                     </button>
                </div>
              </div>
            )}

            {mobileScreen === 'record' && (
              <div className="flex-1 relative bg-slate-900 text-white overflow-hidden">
                
                {/* Layer Kamera */}
                <video ref={videoRef} autoPlay playsInline muted className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${recordTab === 'camera' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}/>
                
                {/* Layer Peta Live (Dibungkus div terpisah agar Leaflet tidak bentrok dengan React CSS) */}
                <div className={`absolute inset-0 w-full h-full bg-slate-200 transition-opacity duration-300 ${recordTab === 'map' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
                   <div ref={liveMapContainerRef} className="w-full h-full"></div>
                </div>

                {/* Gradient Bawah untuk Keterbacaan Teks */}
                <div className="absolute bottom-0 left-0 right-0 h-56 bg-gradient-to-t from-slate-950 via-slate-900/60 to-transparent z-20 pointer-events-none"></div>

                {/* --- HEADER TABS: KAMERA VS PETA LIVE --- */}
                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-30 bg-slate-100/90 backdrop-blur-md rounded-full p-1.5 flex shadow-lg border border-slate-200">
                    <button onClick={() => setRecordTab('camera')} className={`px-5 py-2 rounded-full text-xs font-black transition-all ${recordTab === 'camera' ? 'bg-blue-600 text-white shadow-sm border border-blue-600' : 'text-slate-500 hover:text-slate-900'}`}>Kamera</button>
                    <button onClick={() => setRecordTab('map')} className={`px-5 py-2 rounded-full text-xs font-black transition-all flex items-center space-x-1.5 ${recordTab === 'map' ? 'bg-blue-600 text-white shadow-sm border border-blue-600' : 'text-slate-500 hover:text-slate-900'}`}>
                        <span>Live</span>
                        {recordingStatus === 'recording' && <span className="w-2 h-2 bg-red-400 rounded-full animate-pulse border border-white/50"></span>}
                    </button>
                </div>

                {/* OVERLAY: Status Perekaman/GPS Tengah Atas */}
                <div className="absolute top-[68px] left-1/2 transform -translate-x-1/2 z-30 flex flex-col items-center pointer-events-none w-full px-4">
                     {recordingStatus === 'locating' && (
                         <div className="bg-amber-500/95 px-5 py-2.5 rounded-full text-xs font-black flex items-center space-x-2 shadow-xl backdrop-blur-md border border-amber-400 text-white w-auto max-w-full">
                             <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                             <span>Mencari Sinyal GPS... ({gpsAccuracy}m)</span>
                         </div>
                     )}
                     {recordingStatus === 'ready' && (
                         <div className="bg-emerald-500/95 px-5 py-2.5 rounded-full text-xs font-black flex items-center space-x-2 shadow-xl backdrop-blur-md border border-emerald-400 text-white animate-pulse">
                             <span className="text-sm">✅</span>
                             <span>GPS Siap! Tekan Mulai ({gpsAccuracy}m)</span>
                         </div>
                     )}
                     {recordingStatus === 'recording' && (
                         <div className="bg-red-600/90 px-4 py-1.5 rounded-full text-[11px] font-black flex items-center space-x-2 shadow-xl backdrop-blur-md border border-red-500 animate-pulse text-white">
                            <div className="w-2.5 h-2.5 bg-white rounded-full"></div>
                            <span>MEREKAM JALUR AKTIF</span>
                         </div>
                     )}
                     {recordingStatus === 'paused' && (
                         <div className="bg-amber-500/90 px-5 py-2 rounded-full text-xs font-black shadow-xl backdrop-blur-md text-white border border-amber-400">
                            ⏸️ JEDA REKAMAN (Posisi tidak di-log)
                         </div>
                     )}
                     {recordingStatus === 'auto_paused' && (
                         <div className="bg-orange-500/95 px-5 py-2 rounded-full text-xs font-black shadow-xl backdrop-blur-md text-white border border-orange-400 flex items-center space-x-2">
                            <span>⏸️</span>
                            <span>Auto-Pause (Berhenti Bergerak)</span>
                         </div>
                     )}
                </div>
                  
                {/* Tombol Matikan Kamera (Hanya tampil di tab kamera) */}
                {recordTab === 'camera' && (
                  <div className="absolute top-[68px] right-4 z-30">
                    <button onClick={() => { if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; } }} className="bg-black/50 hover:bg-black/70 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold backdrop-blur-sm border border-white/20 transition-colors shadow-lg">Off Video</button>
                  </div>
                )}

                {/* WIDGET BAWAH (Menggabungkan Log & Stats agar lebih lega) */}
                <div className="absolute bottom-[80px] left-4 right-4 bg-white/95 backdrop-blur-xl p-3.5 rounded-3xl border border-slate-200 z-30 shadow-2xl flex flex-col gap-3">
                    
                    {/* Tombol Simulasi Darurat - Mengambang di kanan atas widget bawah */}
                    {(recordingStatus === 'locating' || recordingStatus === 'ready') && realGpsPoints.length === 0 && (
                        <button onClick={simulateGpsMovement} className="absolute -top-11 right-0 bg-slate-800 hover:bg-slate-700 text-white text-[10px] px-4 py-2 rounded-full z-40 border border-slate-700 shadow-lg font-bold transition-colors">
                            Simulasi (Tanpa Sinyal)
                        </button>
                    )}

                    {/* Log Mini */}
                    <div className="flex justify-between items-center text-[10px] bg-slate-100 rounded-xl px-3 py-2 border border-slate-200">
                        <span className="text-blue-600 font-bold flex items-center gap-1.5">
                           <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                           Log: {realGpsPoints.length} Titik
                        </span>
                        <span className="text-emerald-600 font-mono tracking-tight font-bold">
                            {realGpsPoints.length > 0 ? `${realGpsPoints[realGpsPoints.length-1].lat.toFixed(5)}, ${realGpsPoints[realGpsPoints.length-1].lng.toFixed(5)}` : 'Menunggu satelit...'}
                        </span>
                    </div>

                    {/* Stats */}
                    <div className="flex justify-between items-center px-1">
                        <div className="text-center w-1/3">
                            <div className="text-slate-500 text-[9px] uppercase font-bold tracking-widest mb-0.5">Jarak</div>
                            <div className="text-xl font-black text-slate-900 leading-none">{totalDistance < 1000 ? Math.round(totalDistance) : (totalDistance/1000).toFixed(2)} <span className="text-xs font-medium text-slate-500">{totalDistance < 1000 ? 'm' : 'km'}</span></div>
                        </div>
                        <div className="w-px h-8 bg-slate-200"></div>
                        <div className="text-center w-1/3">
                            <div className="text-slate-500 text-[9px] uppercase font-bold tracking-widest mb-0.5">Kecepatan</div>
                            <div className="text-xl font-black text-slate-900 leading-none">{currentSpeed} <span className="text-xs font-medium text-slate-500">km/h</span></div>
                        </div>
                        <div className="w-px h-8 bg-slate-200"></div>
                        <div className="text-center w-1/3">
                            <div className="text-slate-500 text-[9px] uppercase font-bold tracking-widest mb-0.5">Akurasi</div>
                            <div className={`text-xl font-black leading-none ${gpsAccuracy === '-' || gpsAccuracy === 'Simulasi' ? 'text-slate-900' : gpsAccuracy < 15 ? 'text-emerald-600' : gpsAccuracy < 30 ? 'text-amber-500' : 'text-red-600'}`}>{gpsAccuracy} <span className="text-xs font-medium text-slate-500">m</span></div>
                        </div>
                    </div>
                </div>

                {/* --- KONTROL TOMBOL UTAMA (Floating) --- */}
                <div className="absolute bottom-4 left-4 right-4 z-30 flex items-center justify-center">
                  
                  {recordingStatus === 'locating' || recordingStatus === 'ready' ? (
                     <div className="w-full flex space-x-3">
                         <button onClick={cancelRecording} className="w-1/3 bg-slate-800/80 backdrop-blur-md border border-white/10 text-white rounded-2xl py-3.5 font-bold text-sm transition-colors shadow-lg">Batal</button>
                         <button onClick={() => setRecordingStatus('recording')} disabled={recordingStatus === 'locating'} className={`w-2/3 py-3.5 rounded-2xl font-black text-sm shadow-xl flex justify-center items-center space-x-2 transition-all border ${recordingStatus === 'ready' ? 'bg-emerald-500 text-white border-emerald-400 hover:bg-emerald-600 scale-100' : 'bg-slate-800/80 backdrop-blur-md text-slate-400 border-white/5 cursor-not-allowed scale-95'}`}>
                             {recordingStatus === 'locating' ? <span>Mencari GPS...</span> : <span>START RECORD</span>}
                         </button>
                     </div>
                  ) : (
                     <div className="w-full flex space-x-3">
                         {(recordingStatus === 'recording' || recordingStatus === 'auto_paused') && (
                             <>
                                 <button onClick={() => setRecordingStatus('paused')} className="w-1/2 bg-amber-500 hover:bg-amber-600 text-white border border-amber-400 rounded-2xl py-3.5 font-black text-sm shadow-xl flex justify-center items-center space-x-2 transition-colors">
                                     <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                                     <span>JEDA</span>
                                 </button>
                                 <button onClick={stopRealHardware} className="w-1/2 bg-red-600 hover:bg-red-700 text-white border border-red-500 rounded-2xl py-3.5 font-black text-sm shadow-xl flex justify-center items-center space-x-2 transition-colors">
                                     <div className="w-4 h-4 bg-white rounded-sm"></div>
                                     <span>SELESAI LAPOR</span>
                                 </button>
                             </>
                         )}
                         {recordingStatus === 'paused' && (
                             <>
                                 <button onClick={() => setRecordingStatus('recording')} className="w-1/2 bg-blue-500 hover:bg-blue-600 text-white border border-blue-400 rounded-2xl py-3.5 font-black text-sm shadow-xl flex justify-center items-center space-x-2 transition-colors">
                                     <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                     <span>LANJUTKAN</span>
                                 </button>
                                 <button onClick={stopRealHardware} className="w-1/2 bg-red-600 hover:bg-red-700 text-white border border-red-500 rounded-2xl py-3.5 font-black text-sm shadow-xl flex justify-center items-center space-x-2 transition-colors">
                                     <div className="w-4 h-4 bg-white rounded-sm"></div>
                                     <span>SELESAI LAPOR</span>
                                 </button>
                             </>
                         )}
                     </div>
                  )}
                </div>
              </div>
            )}

            {mobileScreen === 'form' && (
              <div className="flex-1 p-6 overflow-y-auto bg-slate-50 text-left custom-scrollbar">
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl mb-6 flex items-center justify-between shadow-sm">
                  <div className="flex items-center space-x-3">
                    <div className="bg-blue-200 text-blue-600 p-2.5 rounded-xl">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                    </div>
                    <div>
                      <div className="text-blue-900 font-black text-sm leading-tight">Jalur Tersimpan</div>
                      <div className="text-blue-600 text-[11px] font-bold mt-0.5">{realGpsPoints.length} titik koordinat | {totalDistance < 1000 ? Math.round(totalDistance) + ' m' : (totalDistance/1000).toFixed(2) + ' km'}</div>
                    </div>
                  </div>
                  <button type="button" onClick={() => setMobileScreen('pin_map')} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-md transition-all active:scale-95 flex items-center space-x-1.5 whitespace-nowrap">
                    <span>Lihat Jalur</span>
                  </button>
                </div>

                <form onSubmit={saveDraft} className="space-y-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Titik Lokasi Kerusakan (Pin)</label>
                    <div className="bg-white border border-slate-200 p-4 rounded-2xl flex items-center justify-between shadow-sm">
                      <div className={`flex flex-col ${pinLocation ? 'text-emerald-600' : 'text-slate-500'}`}>
                        <span className="text-sm font-bold flex items-center">{pinLocation ? '📍 Pin Terkunci' : 'Belum ditandai'}</span>
                        {pinLocation && (
                           <span className="text-[10px] font-mono mt-1 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                             {pinLocation.lat.toFixed(6)}, {pinLocation.lng.toFixed(6)}
                           </span>
                        )}
                      </div>
                      <button type="button" onClick={() => setMobileScreen('pin_map')} className="bg-amber-100 text-amber-700 hover:bg-amber-200 px-4 py-2.5 rounded-xl text-xs font-extrabold transition-colors">{pinLocation ? 'Ubah di Peta' : 'Buka Peta'}</button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Nama Jalan</label>
                    <input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="Cth: Jl. Poros Utama" className="w-full border border-slate-200 p-4 rounded-2xl text-base focus:ring-2 focus:ring-blue-500 outline-none shadow-sm" required />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Kelurahan</label>
                    <select value={formData.kelurahan} onChange={(e) => setFormData({...formData, kelurahan: e.target.value})} className="w-full border border-slate-200 p-4 rounded-2xl text-base bg-white outline-none focus:ring-2 focus:ring-blue-500">
                      {KELURAHAN_LIST.map(k => <option key={k} value={k}>{formatKel(k)}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Jenis Material Jalan</label>
                    <div className="grid grid-cols-3 gap-2">
                      {['Tanah', 'Aspal', 'Beton'].map(jenis => (
                        <button key={jenis} type="button" onClick={() => setFormData({...formData, jenisJalan: jenis})} className={`p-2 rounded-xl border text-sm font-extrabold transition-all ${formData.jenisJalan === jenis ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>{jenis}</button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Kondisi Jalan (Opsional)</label>
                    <div className="grid grid-cols-2 gap-2">
                      {['Baik', 'Rusak Ringan', 'Rusak Sedang', 'Rusak Parah'].map(cond => (
                        <button key={cond} type="button" onClick={() => setFormData({...formData, condition: cond})} className={`p-2 rounded-xl border text-sm font-extrabold transition-all flex items-center justify-center space-x-1.5 ${formData.condition === cond ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getConditionColor(cond) }}></span>
                          <span>{cond}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Catatan Tambahan</label>
                    <textarea value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} className="w-full border border-slate-200 p-4 rounded-2xl text-base outline-none focus:ring-2 focus:ring-blue-500" rows="3"></textarea>
                  </div>

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

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">Unggah Video (Opsional, Maks 150MB)</label>
                    <p className="text-[10px] text-slate-500 mb-2 italic">*Catatan: Batas ukuran telah dinaikkan ke 150MB. Pada banyak HP modern, video akan terkompres secara otomatis jika direkam langsung.</p>
                    
                    {!uploadedVideoUrl ? (
                      <div className="relative border-2 border-dashed border-slate-300 rounded-2xl p-4 text-center bg-white hover:bg-slate-50 transition-colors">
                        <input type="file" accept="video/mp4,video/quicktime,video/*" onChange={(e) => { 
                            const f = e.target.files[0]; 
                            if(f){ 
                              const maxSizeBytes = 150 * 1024 * 1024; // Naikkan limit ke 150MB
                              if (f.size > maxSizeBytes) {
                                 showToast("⚠️ Gagal: Ukuran video masih terlalu besar! Maksimal 150 MB.");
                                 e.target.value = ''; 
                                 return; 
                              }
                              setUploadedVideoUrl(URL.createObjectURL(f));
                              setUploadedVideoFile(f); 
                              showToast("✅ Video siap dilampirkan."); 
                            } 
                          }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                        <div className="text-slate-500 text-sm font-semibold flex flex-col items-center"><span className="text-xl mb-1">📁</span> Pilih file video</div>
                      </div>
                    ) : (
                      <div className="relative border border-emerald-300 rounded-2xl p-4 bg-emerald-50 text-center flex items-center justify-between shadow-sm">
                         <div className="flex items-center space-x-3 text-emerald-700 font-bold text-sm">
                            <span className="text-2xl">✅</span>
                            <div className="text-left flex flex-col">
                               <span>Video Terlampir</span>
                               <span className="text-[10px] text-emerald-600 font-normal truncate max-w-[120px]">{uploadedVideoFile?.name || 'video_tersimpan.mp4'}</span>
                            </div>
                         </div>
                         <button type="button" onClick={() => { setUploadedVideoUrl(null); setUploadedVideoFile(null); showToast("Video batal dilampirkan."); }} className="bg-rose-100 text-rose-600 hover:bg-rose-200 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm flex items-center space-x-1 transition-colors relative z-10">
                           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                           <span>Hapus</span>
                         </button>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 pb-8 flex flex-col space-y-3">
                    <button type="submit" className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold text-base shadow-xl hover:bg-slate-800 transition-colors">
                      {editingDraftId ? 'Simpan Perubahan Draft' : 'Simpan ke Memori Luring (Draft)'}
                    </button>
                    <button type="button" onClick={() => {
                      setFormData({ name: '', kelurahan: KELURAHAN_LIST[0], jenisJalan: 'Aspal', condition: 'Baik', notes: '' });
                      setUploadedVideoFile(null); setUploadedVideoUrl(null); 
                      setUploadedPhotoFiles([]); setUploadedPhotoUrls([]);
                      setPinLocation(null);
                      setMobileScreen(editingDraftId ? 'drafts' : 'home');
                      setEditingDraftId(null);
                    }} className="w-full bg-white border-2 border-slate-200 text-slate-600 py-4 rounded-2xl font-bold text-base shadow-sm hover:bg-slate-50">
                      Batal & Kembali
                    </button>
                  </div>
                </form>
              </div>
            )}

            {mobileScreen === 'pin_map' && (
              <div className="flex-1 flex flex-col bg-slate-100 relative">
                <div className="bg-white px-5 pb-3 border-b border-slate-200 flex justify-between items-center z-10 shadow-sm pt-6 md:py-4">
                  <div><h3 className="font-extrabold text-slate-800 text-base">Tandai Lokasi</h3><p className="text-xs text-slate-500">Ketuk garis biru untuk meletakkan pin</p></div>
                  <button onClick={() => setMobileScreen('form')} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-full font-bold text-sm shadow-md transition-colors">Selesai</button>
                </div>
                
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
              <div className="absolute inset-0 flex flex-col bg-slate-100 text-left z-20">
                {/* Area Header (Tetap/Tidak ikut ter-scroll) */}
                <div className="px-6 pt-6 md:pt-8 pb-2 flex-shrink-0 bg-slate-100 z-10">
                  <div className="flex justify-between items-center mb-4 mt-2">
                    <div><h3 className="text-2xl font-black">Draft Offline</h3><p className="text-sm text-slate-500">Disimpan aman di HP</p></div>
                    <button onClick={() => setMobileScreen('home')} className="bg-slate-200 text-slate-600 p-3 rounded-full hover:bg-slate-300">Tutup</button>
                  </div>

                  {drafts.length > 0 && (
                     <div className="mb-2 flex justify-between items-center bg-white p-3 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:bg-slate-50 transition-colors" onClick={selectAllDrafts}>
                       <span className="text-sm font-bold text-slate-700">Pilih Semua ({drafts.length})</span>
                       <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors ${selectedDraftIds.length === drafts.length ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                          {selectedDraftIds.length === drafts.length && <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>}
                       </div>
                     </div>
                  )}
                </div>

                {/* Area Daftar (Bisa di-scroll tanpa batas) */}
                <div className="flex-1 space-y-4 overflow-y-auto px-6 pb-4 pt-2 custom-scrollbar">
                  {drafts.length === 0 ? (
                    <div className="text-center text-slate-400 mt-10 text-base font-medium border-2 border-dashed border-slate-300 rounded-3xl p-8">Belum ada survei yang disimpan.</div>
                  ) : (
                    drafts.map(d => {
                      const isSelected = selectedDraftIds.includes(d.id);
                      return (
                      <div key={d.id} onClick={() => toggleDraftSelection(d.id)} className={`p-4 rounded-3xl border shadow-sm relative overflow-hidden flex items-center transition-all cursor-pointer ${isSelected ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500' : 'border-slate-200 bg-white hover:border-blue-300'}`}>
                        <div className="absolute top-0 left-0 w-2 h-full" style={{ backgroundColor: getConditionColor(d.condition)}}></div>
                        
                        <div className="pl-1 pr-3 py-2 flex items-center justify-center">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                             {isSelected && <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>}
                          </div>
                        </div>

                        <div className="flex-1 w-full py-1">
                          <div className="flex justify-between items-start">
                             <div className="font-extrabold text-base text-slate-800 pr-2 flex items-center flex-wrap gap-1.5">
                               <span>{d.name}</span>
                               {/* Label Status Terkirim */}
                               {d.isUploaded && (
                                 <span className="bg-emerald-100 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider flex items-center shadow-sm">
                                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="w-2.5 h-2.5 mr-0.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                                   Terkirim
                                 </span>
                               )}
                             </div>
                             <div className="flex space-x-2">
                                 <button onClick={(e) => { e.stopPropagation(); editDraft(d); }} className="bg-blue-50 text-blue-600 border border-blue-200 px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-blue-100 transition-colors shadow-sm flex items-center space-x-1">
                                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>
                                   <span>Edit</span>
                                 </button>
                                 <button onClick={(e) => { e.stopPropagation(); deleteDraft(d.id); }} className="bg-rose-50 text-rose-600 border border-rose-200 p-1.5 rounded-xl text-xs font-bold hover:bg-rose-100 transition-colors shadow-sm flex items-center justify-center">
                                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                                 </button>
                             </div>
                          </div>
                          <div className="text-xs font-bold text-slate-400 uppercase mt-1">{d.jenisJalan} • {formatKel(d.kelurahan)}</div>
                          <div className="flex justify-between items-center mt-3 border-t border-slate-200/60 pt-3 text-xs">
                            <span className="font-bold text-slate-600">{formatLength(d.length)} • {d.realGps.length} Log Satelit</span>
                            <span className="bg-white text-slate-600 px-2 py-0.5 rounded border border-slate-200 font-bold">{d.condition}</span>
                          </div>
                        </div>
                      </div>
                      );
                    })
                  )}
                </div>

                {/* Area Tombol Bawah (Sticky, selalu muncul di bawah) */}
                {drafts.length > 0 && (
                  <div className="p-6 flex-shrink-0 bg-white border-t border-slate-200 z-10 shadow-[0_-5px_15px_rgba(0,0,0,0.03)]">
                    <button onClick={syncDataToCloud} disabled={selectedDraftIds.length === 0} className={`w-full text-white py-4 rounded-2xl font-black text-base flex justify-center items-center space-x-2 shadow-xl transition-all ${isDbConnected && selectedDraftIds.length > 0 ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-400 cursor-not-allowed opacity-80'}`}>
                      {isDbConnected ? <span>UNGGAH TERPILIH ({selectedDraftIds.length})</span> : <span>SERVER SUPABASE TERPUTUS</span>}
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
        <div className="h-full bg-[#F8FAFC] flex flex-col font-sans select-none overflow-hidden relative print-hidden">
          
          <header className="bg-white border-b border-slate-200 px-4 md:px-6 flex justify-between items-center flex-shrink-0 z-40 shadow-sm relative pt-10 pb-2 h-20 md:pt-0 md:pb-0 md:h-16">
            <div className="flex items-center space-x-2 md:space-x-3">
              <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1.5 md:p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500" title="Tampilkan/Sembunyikan Menu">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5 md:w-6 md:h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
                </svg>
              </button>
              <div className="hidden md:block bg-blue-600 text-white p-2 rounded-lg">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.246a1.5 1.5 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" /></svg>
              </div>
              <div className="flex items-center space-x-2.5">
                <h1 className="text-base md:text-lg font-black text-slate-900 leading-none">Dasbor WebGIS</h1>
                {isDbConnected ? (
                    <div className="relative flex h-2.5 w-2.5" title="Terhubung ke Database">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </div>
                ) : (
                    <div className="relative flex h-2.5 w-2.5" title="Koneksi Terputus / Jeda">
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                    </div>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-2 md:space-x-4">
              <button onClick={() => { fetchRoads(); showToast("Memperbarui data dari server..."); }} className="text-slate-600 hover:text-slate-900 font-bold text-xs md:text-sm border border-slate-200 bg-white hover:bg-slate-50 px-2.5 py-1.5 rounded-lg flex items-center space-x-1 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-4 h-4 md:hidden"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                <span className="hidden md:inline">Refresh</span>
              </button>
              <button onClick={() => setAppRole(null)} className="text-rose-500 hover:text-white hover:bg-rose-500 border border-rose-200 px-3 md:px-4 py-1.5 rounded-lg text-xs md:text-sm font-bold transition-colors">
                Keluar
              </button>
            </div>
          </header>

          <main className="flex-1 relative overflow-hidden flex">
            {/* --- PETA FULL WIDTH DI BELAKANG SEMUA KOMPONEN --- */}
            <section className={`absolute inset-0 z-0 flex flex-col ${isSidebarOpen ? 'sidebar-open' : ''}`}>
              
              {/* --- FLOATING WIDGETS (KOTAK LEGENDA MENGAMBANG) --- */}
              <div className={`absolute top-3 md:top-5 z-[400] w-full pointer-events-none transition-all duration-300 ${isSidebarOpen ? 'md:pl-[380px]' : 'pl-0'}`}>
                 
                 {/* Tombol Toggle Legenda (Hanya Mobile) */}
                 <div className="pl-[60px] pr-2 mb-1 pointer-events-none md:hidden">
                    <button 
                       onClick={() => setShowFloatingLegend(!showFloatingLegend)}
                       className="pointer-events-auto bg-white/90 backdrop-blur-md shadow-sm border border-white/50 px-2 py-1 rounded-md text-[8px] font-extrabold text-slate-700 flex items-center justify-between w-full transition-colors hover:bg-slate-50"
                    >
                       <div className="flex items-center gap-1.5">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-3 h-3 text-blue-600"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>
                          <span>{showFloatingLegend ? 'Sembunyikan Legenda' : 'Tampilkan Legenda'}</span>
                       </div>
                       <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className={`w-2.5 h-2.5 transition-transform duration-300 ${showFloatingLegend ? 'rotate-180' : ''}`}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                    </button>
                 </div>

                 {/* Container Kotak Legenda (Flex Wrap untuk kotak individual) */}
                 {/* PERUBAHAN: Menambahkan gap dan padding yang disesuaikan, serta membuat kotak seragam di mobile */}
                 <div className={`${showFloatingLegend ? 'flex' : 'hidden'} md:flex flex-wrap items-center gap-1.5 md:gap-2 pointer-events-none pr-3 md:pr-4 pl-[60px] md:pl-[72px] pb-2`}>
                    
                    {/* --- KELOMPOK KONDISI JALAN --- */}
                    <div className="pointer-events-auto flex items-stretch rounded-lg shadow-sm border border-slate-200/80 overflow-hidden hover:-translate-y-0.5 transition-transform cursor-default h-10 md:h-11 w-[calc(50%-3px)] md:w-auto shrink-0 bg-white/95 backdrop-blur-md">
                       <div className="flex-1 flex items-center gap-1.5 px-2 md:px-3 border-r border-slate-200/80 min-w-0">
                          <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full shadow-sm bg-[#10B981] flex-shrink-0"></span>
                          <span className="text-[9px] md:text-[10px] font-medium text-slate-600 uppercase tracking-wider truncate">Baik</span>
                       </div>
                       <div className="flex items-center justify-center bg-slate-100/90 w-10 md:w-auto md:min-w-[44px] md:px-4 flex-shrink-0">
                          <span className="text-[11px] md:text-sm font-black text-slate-800 leading-none drop-shadow-sm"><AnimatedNumber value={adminStats.baik} /></span>
                       </div>
                    </div>

                    <div className="pointer-events-auto flex items-stretch rounded-lg shadow-sm border border-slate-200/80 overflow-hidden hover:-translate-y-0.5 transition-transform cursor-default h-10 md:h-11 w-[calc(50%-3px)] md:w-auto shrink-0 bg-white/95 backdrop-blur-md">
                       <div className="flex-1 flex items-center gap-1.5 px-2 md:px-3 border-r border-slate-200/80 min-w-0">
                          <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full shadow-sm bg-[#FBBF24] flex-shrink-0"></span>
                          <span className="text-[9px] md:text-[10px] font-medium text-slate-600 uppercase tracking-wider truncate">Rusak Ringan</span>
                       </div>
                       <div className="flex items-center justify-center bg-slate-100/90 w-10 md:w-auto md:min-w-[44px] md:px-4 flex-shrink-0">
                          <span className="text-[11px] md:text-sm font-black text-slate-800 leading-none drop-shadow-sm"><AnimatedNumber value={adminStats.rusakRingan} /></span>
                       </div>
                    </div>

                    <div className="pointer-events-auto flex items-stretch rounded-lg shadow-sm border border-slate-200/80 overflow-hidden hover:-translate-y-0.5 transition-transform cursor-default h-10 md:h-11 w-[calc(50%-3px)] md:w-auto shrink-0 bg-white/95 backdrop-blur-md">
                       <div className="flex-1 flex items-center gap-1.5 px-2 md:px-3 border-r border-slate-200/80 min-w-0">
                          <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full shadow-sm bg-[#F97316] flex-shrink-0"></span>
                          <span className="text-[9px] md:text-[10px] font-medium text-slate-600 uppercase tracking-wider truncate">Rusak Sedang</span>
                       </div>
                       <div className="flex items-center justify-center bg-slate-100/90 w-10 md:w-auto md:min-w-[44px] md:px-4 flex-shrink-0">
                          <span className="text-[11px] md:text-sm font-black text-slate-800 leading-none drop-shadow-sm"><AnimatedNumber value={adminStats.rusakSedang} /></span>
                       </div>
                    </div>

                    <div className="pointer-events-auto flex items-stretch rounded-lg shadow-sm border border-slate-200/80 overflow-hidden hover:-translate-y-0.5 transition-transform cursor-default h-10 md:h-11 w-[calc(50%-3px)] md:w-auto shrink-0 bg-white/95 backdrop-blur-md">
                       <div className="flex-1 flex items-center gap-1.5 px-2 md:px-3 border-r border-slate-200/80 min-w-0">
                          <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full shadow-sm bg-[#EF4444] flex-shrink-0"></span>
                          <span className="text-[9px] md:text-[10px] font-medium text-slate-600 uppercase tracking-wider truncate">Rusak Parah</span>
                       </div>
                       <div className="flex items-center justify-center bg-slate-100/90 w-10 md:w-auto md:min-w-[44px] md:px-4 flex-shrink-0">
                          <span className="text-[11px] md:text-sm font-black text-slate-800 leading-none drop-shadow-sm"><AnimatedNumber value={adminStats.rusakParah} /></span>
                       </div>
                    </div>

                    {/* Pembatas Visual Halus antara Kondisi dan Material (Hanya di Desktop) */}
                    <div className="hidden md:block w-px h-6 bg-slate-300/80 mx-0.5"></div>

                    {/* --- KELOMPOK MATERIAL JALAN --- */}
                    <div className="pointer-events-auto flex items-stretch rounded-lg shadow-sm border border-slate-200/80 overflow-hidden hover:-translate-y-0.5 transition-transform cursor-default h-10 md:h-11 w-[calc(33.33%-4px)] md:w-auto shrink-0 bg-white/95 backdrop-blur-md">
                       <div className="flex-1 flex items-center justify-center md:justify-start gap-1 md:gap-1.5 px-1 md:px-3 border-r border-slate-200/80 min-w-0">
                          <span className="text-[10px] md:text-xs leading-none grayscale opacity-80 drop-shadow-sm flex-shrink-0">🛣️</span>
                          <span className="text-[8px] md:text-[10px] font-medium text-slate-600 uppercase tracking-wider truncate hidden sm:inline-block">Aspal</span>
                       </div>
                       <div className="flex items-center justify-center bg-slate-100/90 w-8 md:w-auto md:min-w-[44px] md:px-4 flex-shrink-0">
                          <span className="text-[11px] md:text-sm font-black text-slate-800 leading-none drop-shadow-sm"><AnimatedNumber value={adminStats.aspal} /></span>
                       </div>
                    </div>

                    <div className="pointer-events-auto flex items-stretch rounded-lg shadow-sm border border-slate-200/80 overflow-hidden hover:-translate-y-0.5 transition-transform cursor-default h-10 md:h-11 w-[calc(33.33%-4px)] md:w-auto shrink-0 bg-white/95 backdrop-blur-md">
                       <div className="flex-1 flex items-center justify-center md:justify-start gap-1 md:gap-1.5 px-1 md:px-3 border-r border-slate-200/80 min-w-0">
                          <span className="text-[10px] md:text-xs leading-none grayscale opacity-80 drop-shadow-sm flex-shrink-0">🧱</span>
                          <span className="text-[8px] md:text-[10px] font-medium text-slate-600 uppercase tracking-wider truncate hidden sm:inline-block">Beton</span>
                       </div>
                       <div className="flex items-center justify-center bg-slate-100/90 w-8 md:w-auto md:min-w-[44px] md:px-4 flex-shrink-0">
                          <span className="text-[11px] md:text-sm font-black text-slate-800 leading-none drop-shadow-sm"><AnimatedNumber value={adminStats.beton} /></span>
                       </div>
                    </div>

                    <div className="pointer-events-auto flex items-stretch rounded-lg shadow-sm border border-slate-200/80 overflow-hidden hover:-translate-y-0.5 transition-transform cursor-default h-10 md:h-11 w-[calc(33.33%-4px)] md:w-auto shrink-0 bg-white/95 backdrop-blur-md">
                       <div className="flex-1 flex items-center justify-center md:justify-start gap-1 md:gap-1.5 px-1 md:px-3 border-r border-slate-200/80 min-w-0">
                          <span className="text-[10px] md:text-xs leading-none opacity-80 drop-shadow-sm flex-shrink-0">🟤</span>
                          <span className="text-[8px] md:text-[10px] font-medium text-slate-600 uppercase tracking-wider truncate hidden sm:inline-block">Tanah</span>
                       </div>
                       <div className="flex items-center justify-center bg-slate-100/90 w-8 md:w-auto md:min-w-[44px] md:px-4 flex-shrink-0">
                          <span className="text-[11px] md:text-sm font-black text-slate-800 leading-none drop-shadow-sm"><AnimatedNumber value={adminStats.tanah} /></span>
                       </div>
                    </div>

                 </div>
              </div>

              <div className="relative w-full h-full">
                <div ref={adminMapContainerRef} className="absolute inset-0 bg-slate-200 z-0"></div>
                {!isLeafletLoaded && <div className="absolute inset-0 flex items-center justify-center bg-slate-100 font-bold text-slate-400 z-10 pointer-events-none">Memuat Peta Leaflet...</div>}
              </div>
            </section>

            {/* Overlay gelap jika sidebar terbuka di HP */}
            {isSidebarOpen && (
               <div className="md:hidden absolute inset-0 bg-slate-900/20 backdrop-blur-sm z-20" onClick={() => setIsSidebarOpen(false)}></div>
            )}

            {/* --- SIDEBAR MENGAMBANG DENGAN KACA TRANSPARAN TINGGI (GLASSMORPHISM) --- */}
            <aside className={`bg-white/60 backdrop-blur-md flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.1)] border-r border-white/40 transition-all duration-300 ease-in-out overflow-hidden z-30 absolute top-0 left-0 h-full ${isSidebarOpen ? 'w-[85%] md:w-[380px]' : 'w-0 border-r-0'}`}>
              <div className="w-[85vw] md:w-[380px] flex flex-col h-full flex-shrink-0">
                <div className="p-4 md:p-5 border-b border-white/30 bg-white/30 flex justify-between items-center">
                  <h3 className="font-extrabold text-slate-800 text-sm flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-4 h-4 mr-2 text-slate-600"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" /></svg>
                    Filter & Laporan
                  </h3>
                  {/* Tombol tutup sidebar khusus HP */}
                  <button onClick={() => setIsSidebarOpen(false)} className="md:hidden bg-slate-200/50 p-1.5 rounded-lg text-slate-700">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                
                <div className="p-4 md:p-5 border-b border-white/30 bg-white/30 space-y-3">
                  <select value={filterKelurahan} onChange={(e) => setFilterKelurahan(e.target.value)} className="w-full bg-white/40 backdrop-blur-sm border border-white/50 text-slate-800 text-sm rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm cursor-pointer">
                    <option value="Semua">Semua Wilayah</option>
                    {KELURAHAN_LIST.map(k => <option key={k} value={k}>{formatKel(k)}</option>)}
                  </select>
                  <select value={filterJenis} onChange={(e) => setFilterJenis(e.target.value)} className="w-full bg-white/40 backdrop-blur-sm border border-white/50 text-slate-800 text-sm rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm cursor-pointer">
                    <option value="Semua">Semua Jenis Jalan</option>
                    <option value="Tanah">Tanah</option>
                    <option value="Aspal">Aspal</option>
                    <option value="Beton">Beton</option>
                  </select>
                  <select value={filterKondisi} onChange={(e) => setFilterKondisi(e.target.value)} className="w-full bg-white/40 backdrop-blur-sm border border-white/50 text-slate-800 text-sm rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm cursor-pointer">
                    <option value="Semua">Semua Kondisi</option>
                    <option value="Baik">Kondisi Baik</option>
                    <option value="Rusak Ringan">Rusak Ringan</option>
                    <option value="Rusak Sedang">Rusak Sedang</option>
                    <option value="Rusak Parah">Rusak Parah</option>
                  </select>
                </div>

              <div className="flex-1 flex flex-col bg-transparent overflow-hidden">
                <div className="px-4 py-3 border-b border-white/30 flex justify-between items-center bg-white/40 z-10 shrink-0">
                  <div>
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Laporan Masuk</span>
                    <span className="bg-blue-100/80 text-blue-700 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm mt-1 inline-block">
                      {adminStats.total} Data
                    </span>
                  </div>
                  <div className="flex items-center">
                    {selectedAdminRouteIds.length > 0 && (
                       <button onClick={() => setSelectedAdminRouteIds([])} className="text-[10px] text-slate-500 hover:text-rose-500 mr-3 font-bold underline transition-colors">
                         Batal Pilih
                       </button>
                    )}
                    <button 
                      onClick={() => {
                         let validRoads = [];
                         if (selectedAdminRouteIds.length > 0) {
                             validRoads = syncedRoads.filter(r => selectedAdminRouteIds.includes(r.id || r.dbId)).filter(r => r.realGps && r.realGps.length > 1);
                         } else {
                             validRoads = syncedRoads.filter(road => (filterKelurahan === 'Semua' || road.kelurahan === filterKelurahan) && (filterJenis === 'Semua' || road.jenisJalan === filterJenis) && (filterKondisi === 'Semua' || road.condition === filterKondisi)).filter(r => r.realGps && r.realGps.length > 1);
                         }

                         if(validRoads.length === 0) return showToast("Tidak ada rute valid untuk diputar.");
                         setAnimatingRoadsList(validRoads);
                         setIsAnimatingMap(true);
                         setIsAnimPaused(true); // Diubah menjadi true agar menunggu diklik play
                         setAnimationSpeedMultiplier(1.0);
                         if(window.innerWidth < 768) setIsSidebarOpen(false);
                      }}
                      className={`${selectedAdminRouteIds.length > 0 ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-emerald-500 hover:bg-emerald-600'} text-white px-3 py-1.5 rounded-lg text-xs font-black shadow-sm flex items-center space-x-1 transition-colors group`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 group-hover:scale-110 transition-transform"><path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" /></svg>
                      <span>{selectedAdminRouteIds.length > 0 ? `Play Terpilih (${selectedAdminRouteIds.length})` : 'Play Semua'}</span>
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-8 custom-scrollbar">
                  {syncedRoads.length === 0 ? (
                    <div className="text-center text-slate-500 mt-10 text-sm p-4 border border-dashed border-slate-300/60 rounded-2xl">
                       Tabel kosong. Menunggu data dari Supabase PostgreSQL.
                    </div>
                  ) : (
                    syncedRoads
                      .filter(road => (filterKelurahan === 'Semua' || road.kelurahan === filterKelurahan) && (filterJenis === 'Semua' || road.jenisJalan === filterJenis) && (filterKondisi === 'Semua' || road.condition === filterKondisi))
                      .map((road) => {
                      const roadId = road.id || road.dbId;
                      const isHighlighted = highlightedRoadId === roadId;
                      const isSelectedAdmin = selectedAdminRouteIds.includes(roadId);

                      return (
                      <div key={roadId} onClick={() => {
                          setSelectedRoad(road);
                          setHighlightedRoadId(roadId);
                          setVideoSnapshot([]); 
                          if (window.innerWidth < 768) {
                             setIsSidebarOpen(false);
                          }
                          if (adminMapInstanceRef.current && road.realGps && road.realGps.length > 0) {
                             const latlngs = road.realGps.map(pt => [pt.lat, pt.lng]);
                             adminMapInstanceRef.current.fitBounds(window.L.latLngBounds(latlngs), { padding: [40, 40] });
                          }
                      }} className={`p-3 rounded-2xl border bg-white/50 backdrop-blur-sm cursor-pointer transition-all hover:-translate-y-0.5 hover:bg-white/70 flex flex-col gap-2 relative ${isHighlighted ? 'border-blue-500 shadow-md ring-1 ring-blue-500 bg-white/80' : 'border-white/60 shadow-sm hover:border-blue-300 hover:shadow-md'}`}>
                        
                        {/* Checkbox Multi-Select Animasi */}
                        <div 
                           onClick={(e) => {
                               e.stopPropagation();
                               toggleAdminRouteSelection(roadId);
                           }}
                           className={`absolute top-2.5 right-2.5 w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors z-10 shadow-sm ${isSelectedAdmin ? 'bg-indigo-600 border-indigo-600' : 'bg-white/80 border-slate-300 hover:border-indigo-400'}`}
                        >
                           {isSelectedAdmin && <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>}
                        </div>

                        <div className="flex gap-3">
                          <div className="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0 bg-slate-100/50 relative border border-white/60 shadow-sm">
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
                              <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-6 h-6 mb-1"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" /></svg>
                                <span className="text-[9px] font-bold">No Media</span>
                              </div>
                            )}
                          </div>

                          <div className="flex-1 flex flex-col min-w-0 py-0.5">
                            <h4 className="font-extrabold text-sm text-slate-900 leading-tight truncate pr-2 mb-1">{road.name}</h4>
                            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                              <span className="text-[10px] font-bold text-white px-2 py-0.5 rounded-full whitespace-nowrap shadow-sm" style={{ backgroundColor: getConditionColor(road.condition)}}>{road.condition}</span>
                              <span className="text-[10px] font-semibold text-slate-600 truncate">{road.jenisJalan || 'Aspal'} • {formatKel(road.kelurahan)}</span>
                            </div>
                            
                            <div className="mt-auto flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-200/50">
                              <span>{road.date}</span>
                              <span className="font-mono bg-white/60 px-1.5 py-0.5 rounded border border-white/50 text-slate-600 font-bold shadow-sm">
                                {formatLength(road.length)} • {road.realGps?.length || 0} GPS
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      );
                    })
                  )}
                </div>
              </div>
             </div>
            </aside>

            {/* --- SELECTED ROAD POPUP (Muncul di tengah bawah) --- */}
            {selectedRoad && !isAnimatingMap && (
              <>
                {/* Backdrop transparan untuk menutup popup jika area luar diklik */}
                <div 
                  className="fixed inset-0 z-[990] cursor-pointer bg-slate-900/20 backdrop-blur-sm" 
                  onClick={() => setSelectedRoad(null)}
                ></div>

                <div className="absolute bottom-2 md:bottom-6 left-1/2 transform -translate-x-1/2 w-[95%] md:w-11/12 max-w-2xl bg-white/95 backdrop-blur-xl rounded-2xl md:rounded-3xl shadow-2xl border border-white/60 flex flex-col overflow-hidden z-[1000] animate-fade-in-up max-h-[90vh]">
                  <button onClick={() => setSelectedRoad(null)} className="absolute top-3 right-3 md:top-4 md:right-4 text-white hover:text-white bg-black/40 hover:bg-rose-600 backdrop-blur-md p-2 rounded-full z-30 transition-colors border border-white/20 shadow-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4 md:w-5 md:h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>

                  <div className="w-full bg-black relative border-b border-slate-200/60 flex flex-col justify-center items-center aspect-video shrink-0">
                    {selectedRoad.videoUrl ? (
                      <>
                        <video id="admin-vid-player" crossOrigin="anonymous" src={selectedRoad.videoUrl} controls className="absolute inset-0 w-full h-full object-contain bg-black"></video>
                        
                        {/* Watermark Tanggal */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[5]">
                          <span className="text-white/50 text-[10px] md:text-xs font-black tracking-widest uppercase drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] select-none">
                            {selectedRoad.date}
                          </span>
                        </div>

                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            const vid = document.getElementById('admin-vid-player');
                            if(vid) {
                              vid.playbackRate = vid.playbackRate === 1 ? 2 : 1;
                              e.target.innerText = vid.playbackRate === 2 ? "⚡ Kecepatan: 2x" : "⚡ Kecepatan: 1x";
                            }
                          }}
                          className="absolute top-3 left-3 bg-black/80 hover:bg-blue-600 text-white text-[10px] md:text-xs font-bold px-2.5 py-1.5 rounded-lg border border-white/20 backdrop-blur-md z-10 transition-colors shadow-lg"
                        >
                          ⚡ Kecepatan: 1x
                        </button>
                      </>
                    ) : selectedRoad.photoUrls && selectedRoad.photoUrls.length > 0 ? (
                      <img src={selectedRoad.photoUrls[0]} alt="Foto Utama" className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <div className="text-center p-4">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 md:w-10 md:h-10 text-slate-600 mb-1 md:mb-2 mx-auto"><path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm14.024-.983a1.125 1.125 0 010 1.966l-5.603 3.113A1.125 1.125 0 019 15.113V8.887c0-.857.921-1.4 1.671-.983l5.603 3.113z" clipRule="evenodd" /></svg>
                        <span className="text-[10px] md:text-[11px] font-bold text-slate-500">Media Tidak Dilampirkan</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="w-full p-5 md:p-6 flex flex-col justify-start bg-white/80 text-slate-800 overflow-y-auto flex-1 min-h-0">
                    <div className="flex justify-end items-start mb-3 pr-8 md:pr-12">
                      <div className="flex flex-wrap gap-1.5 justify-end">
                         <button onClick={() => { 
                             if (adminMapInstanceRef.current) adminMapInstanceRef.current.closePopup(); 
                             setAnimatingRoadsList([selectedRoad]);
                             setIsAnimatingMap(true); 
                             setIsAnimPaused(true); // Diubah menjadi true agar menunggu diklik play
                             setCurrentAnimDistance(0);
                             setAnimationSpeedMultiplier(1.0);
                             setShowSpeedControl(false);
                             if(window.innerWidth < 768) setIsSidebarOpen(false); 
                         }} className="text-[10px] md:text-xs text-amber-600 hover:bg-amber-100/80 font-medium px-2.5 py-1.5 transition-colors rounded-full flex items-center bg-amber-50/50 shadow-sm border border-amber-100">
                           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-3.5 h-3.5 mr-1"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" /></svg>
                           Play Rute
                         </button>
                         <button onClick={handleShareLocation} className="text-[10px] md:text-xs text-emerald-600 hover:bg-emerald-100/80 font-medium px-2.5 py-1.5 transition-colors rounded-full flex items-center bg-emerald-50/50 shadow-sm border border-emerald-100">
                           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-3.5 h-3.5 mr-1"><path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" /></svg>
                           Bagikan
                         </button>
                         <button onClick={handleExportKML} className="text-[10px] md:text-xs text-indigo-600 hover:bg-indigo-100/80 font-medium px-2.5 py-1.5 transition-colors rounded-full flex items-center bg-indigo-50/50 shadow-sm border border-indigo-100">
                           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-3.5 h-3.5 mr-1"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                           KML
                         </button>
                         <button onClick={handlePrint} className="text-[10px] md:text-xs text-blue-600 hover:bg-blue-100/80 font-medium px-2.5 py-1.5 transition-colors rounded-full flex items-center bg-blue-50/50 shadow-sm border border-blue-100">
                           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-3.5 h-3.5 mr-1"><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.724.092m6.524-4.659A15.45 15.45 0 0112 9c-1.39 0-2.73.19-4.008.537m13.064 3.018a4.5 4.5 0 01-1.532 2.656c-1.22.956-2.822 1.49-4.524 1.49-1.703 0-3.305-.534-4.524-1.49a4.5 4.5 0 01-1.532-2.656m12.088-3.018c.24-.03.484-.062.724-.092a1.5 1.5 0 001.276-1.48v-2.31a1.5 1.5 0 00-1.276-1.48c-.24-.03-.484-.062-.724-.092m-12.088 3.018c-.24.03-.48.062-.724.092a1.5 1.5 0 01-1.276-1.48v-2.31a1.5 1.5 0 011.276-1.48c.24-.03.48-.062.724-.092M12 2.25v1m0 17.5v1" /></svg>
                           PDF
                         </button>
                         <button onClick={() => hapusDataCloud(selectedRoad.id || selectedRoad.dbId)} className="text-[10px] md:text-xs text-rose-600 hover:bg-rose-100/80 font-medium px-2.5 py-1.5 transition-colors rounded-full flex items-center bg-rose-50/50 shadow-sm border border-rose-100">
                           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-3.5 h-3.5 mr-1"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                           Hapus
                         </button>
                      </div>
                    </div>
                    
                    <h4 className="text-xl md:text-2xl font-black mb-1 leading-tight text-slate-900">{selectedRoad.name}</h4>
                    <p className="text-sm md:text-base text-slate-600 font-normal mb-4 border-b border-slate-200/60 pb-3 italic">
                      "{selectedRoad.notes || 'Tidak ada catatan.'}"
                    </p>
                    
                    <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-transparent shadow-sm mb-2">
                      <table className="w-full text-left text-xs md:text-sm border-collapse m-0">
                        <tbody className="divide-y divide-slate-200/60">
                          <tr>
                            <th className="py-3 px-4 font-normal text-slate-500 w-[35%] md:w-[30%] bg-slate-50/50">Kelurahan</th>
                            <td className="py-3 px-4 font-normal text-slate-700">{formatKel(selectedRoad.kelurahan)}</td>
                          </tr>
                          <tr>
                            <th className="py-3 px-4 font-normal text-slate-500 bg-slate-50/50">Jenis Jalan</th>
                            <td className="py-3 px-4 font-normal text-slate-700">{selectedRoad.jenisJalan || '-'}</td>
                          </tr>
                          <tr>
                            <th className="py-3 px-4 font-normal text-slate-500 bg-slate-50/50">Pjg. Rute</th>
                            <td className="py-3 px-4 font-normal text-slate-700">{formatLength(selectedRoad.length)}</td>
                          </tr>
                          <tr>
                            <th className="py-3 px-4 font-normal text-slate-500 bg-slate-50/50">Kondisi</th>
                            <td className="py-3 px-4">
                              <span className="px-2 py-1 rounded text-[10px] md:text-xs font-normal whitespace-nowrap" style={{ color: getConditionColor(selectedRoad.condition), backgroundColor: `${getConditionColor(selectedRoad.condition)}20` }}>
                                {selectedRoad.condition}
                              </span>
                            </td>
                          </tr>
                          <tr>
                            <th className="py-3 px-4 font-normal text-slate-500 bg-slate-50/50 align-top">Koordinat Pin</th>
                            <td className="py-3 px-4 text-slate-700 font-normal">
                              {selectedRoad.pinLocation && selectedRoad.pinLocation.lat ? (
                                <>{selectedRoad.pinLocation.lat.toFixed(6)}, {selectedRoad.pinLocation.lng.toFixed(6)}</>
                              ) : '-'}
                            </td>
                          </tr>
                          <tr>
                            <th className="py-3 px-4 font-normal text-slate-500 bg-slate-50/50">Tanggal</th>
                            <td className="py-3 px-4 font-normal text-slate-700">{selectedRoad.date}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {selectedRoad.photoUrls && selectedRoad.photoUrls.length > 0 && (
                      <div className="mt-2 pt-4 border-t border-slate-200/60">
                        <span className="text-[10px] md:text-xs font-bold text-slate-500 mb-2 block uppercase tracking-wider">Galeri Foto ({selectedRoad.photoUrls.length})</span>
                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-300">
                          {selectedRoad.photoUrls.map((url, i) => (
                            <a href={url} target="_blank" rel="noreferrer" key={i} className="flex-shrink-0 relative group">
                              <img src={url} className="w-16 h-16 md:w-20 md:h-20 rounded-xl object-cover border border-slate-200 hover:border-blue-300 shadow-sm transition-colors" />
                              <div className="absolute inset-0 bg-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5 text-white drop-shadow-md"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" /></svg>
                              </div>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* OVERLAY TOMBOL SAAT ANIMASI BERJALAN */}
            {isAnimatingMap && animatingRoadsList.length > 0 && (
               <div className="absolute bottom-12 md:bottom-16 left-1/2 transform -translate-x-1/2 z-[2000] bg-slate-50/95 backdrop-blur-xl px-5 py-4 rounded-3xl flex flex-col shadow-2xl border border-slate-300 animate-fade-in-up w-[90%] max-w-[340px]">
                   
                   {/* Header Utama: Play, Speed Toggle, Close */}
                   <div className="flex justify-between items-center">
                       <div className="flex space-x-2 items-center">
                           <button onClick={() => setIsAnimPaused(!isAnimPaused)} className="px-4 py-2.5 rounded-full text-sm font-black transition-colors shadow-sm flex items-center border bg-blue-600 text-white border-blue-600 hover:bg-blue-700">
                               {isAnimPaused ? '▶ Play' : '⏸ Pause'}
                           </button>
                           
                           {/* Tombol Toggle Kecepatan */}
                           <button 
                               onClick={() => setShowSpeedControl(!showSpeedControl)} 
                               className={`px-3 py-2.5 rounded-full text-xs font-bold transition-all border flex items-center space-x-1 shadow-sm ${showSpeedControl ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'}`}
                           >
                               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" /></svg>
                               <span>{Number(animationSpeedMultiplier).toFixed(2)}x</span>
                           </button>
                       </div>

                       <button onClick={() => { setIsAnimatingMap(false); setIsAnimPaused(false); setShowSpeedControl(false); setAnimatingRoadsList([]); }} className="bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-500 hover:text-white p-2 rounded-full transition-colors shadow-sm flex items-center justify-center" aria-label="Tutup">
                           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                       </button>
                   </div>
                   
                   {/* Info Jarak & Pilihan Kendaraan/Ikon */}
                   <div className="mt-3 flex space-x-2">
                       <div className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-2 flex items-center justify-center text-slate-800 font-mono text-base font-bold shadow-sm whitespace-nowrap">
                           {animatingRoadsList.length > 1 ? (
                               <span className="text-blue-700">{animatingRoadsList.length} Rute Aktif</span>
                           ) : (
                               currentAnimDistance < 1000 ? Math.round(currentAnimDistance) + ' m' : (currentAnimDistance / 1000).toFixed(2) + ' km'
                           )}
                       </div>
                       
                       <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-sm items-center space-x-1">
                           <button onClick={() => setAnimIconType('car')} className={`p-1.5 rounded-lg transition-colors ${animIconType === 'car' ? 'bg-white shadow-sm border border-slate-200 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`} title="Mobil">
                              <span className="text-base leading-none block grayscale filter drop-shadow-sm">🚗</span>
                           </button>
                           <button onClick={() => setAnimIconType('motorcycle')} className={`p-1.5 rounded-lg transition-colors ${animIconType === 'motorcycle' ? 'bg-white shadow-sm border border-slate-200 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`} title="Motor">
                              <span className="text-base leading-none block grayscale filter drop-shadow-sm">🏍️</span>
                           </button>
                           <button onClick={() => setAnimIconType('runner')} className={`p-1.5 rounded-lg transition-colors ${animIconType === 'runner' ? 'bg-white shadow-sm border border-slate-200 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`} title="Orang/Pelari">
                              <span className="text-base leading-none block grayscale filter drop-shadow-sm">🏃</span>
                           </button>
                       </div>
                   </div>

                   {/* Kotak Pengaturan Kecepatan (Warna Putih Teks Hitam) */}
                   {showSpeedControl && (
                       <div className="mt-4 bg-white rounded-2xl p-4 border border-slate-200 shadow-md animate-fade-in text-slate-900">
                           <div className="flex justify-between items-center mb-3">
                               <span className="text-xs font-bold tracking-wide uppercase text-slate-500">Kecepatan Rute</span>
                               <span className="text-xs font-mono font-bold bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md border border-blue-200">{Number(animationSpeedMultiplier).toFixed(2)}x</span>
                           </div>
                           
                           <div className="flex items-center space-x-3 mb-4">
                               <button onClick={() => setAnimationSpeedMultiplier(Math.max(0.25, animationSpeedMultiplier - 0.25))} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center justify-center font-black text-lg leading-none pb-1 shadow-sm border border-slate-300">-</button>
                               
                               <input 
                                   type="range" 
                                   min="0.25" 
                                   max="3.0" 
                                   step="0.25" 
                                   value={animationSpeedMultiplier} 
                                   onChange={(e) => setAnimationSpeedMultiplier(parseFloat(e.target.value))}
                                   className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer" 
                                   style={{ accentColor: '#2563eb' }}
                               />
                               
                               <button onClick={() => setAnimationSpeedMultiplier(Math.min(3.0, animationSpeedMultiplier + 0.25))} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center justify-center font-black text-lg leading-none pb-1 shadow-sm border border-slate-300">+</button>
                           </div>

                           <div className="flex justify-between space-x-1.5">
                               {[1.0, 1.5, 2.0, 2.5, 3.0].map(speed => (
                                   <button 
                                       key={speed} 
                                       onClick={() => setAnimationSpeedMultiplier(speed)} 
                                       className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm border ${animationSpeedMultiplier === speed ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'}`}
                                   >
                                       {speed}x
                                   </button>
                               ))}
                           </div>
                       </div>
                   )}
               </div>
            )}
          </main>
        </div>
      )}

      {/* ======================================================================================
          AREA CETAK KHUSUS (Tampil HANYA saat menekan tombol Print/CTRL+P di Dasbor Admin)
      ========================================================================================== */}
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
                <tr className="border-b border-slate-200">
                   <td className="py-2.5 font-bold text-slate-600">Kondisi Dominan</td>
                   <td className="py-2.5">
                      : <span className="font-bold border border-slate-400 px-2 py-0.5 rounded text-[11px]" style={{ color: getConditionColor(selectedRoad.condition), backgroundColor: `${getConditionColor(selectedRoad.condition)}15` }}>{selectedRoad.condition}</span>
                   </td>
                </tr>
                <tr className="border-b border-slate-200"><td className="py-2.5 font-bold text-slate-600">Panjang Rute Terecord</td><td className="py-2.5 font-bold">: {formatLength(selectedRoad.length)}</td></tr>
                <tr className="border-b border-slate-200"><td className="py-2.5 font-bold text-slate-600">Titik Pin Lokasi (GPS)</td><td className="py-2.5 font-mono text-xs font-bold text-blue-700">: {selectedRoad.pinLocation ? `${selectedRoad.pinLocation.lat}, ${selectedRoad.pinLocation.lng}` : 'Tidak ditandai'}</td></tr>
                <tr className="border-b border-slate-200"><td className="py-2.5 font-bold text-slate-600">Tanggal Pelaksanaan</td><td className="py-2.5 font-bold">: {selectedRoad.date}</td></tr>
                <tr className="border-b border-slate-200"><td className="py-2.5 font-bold text-slate-600">Tim Surveyor Lapangan</td><td className="py-2.5 font-bold">: {selectedRoad.surveyor}</td></tr>
              </tbody>
           </table>

           <div className="mb-6 page-break-inside-avoid">
              <h3 className="font-bold text-slate-800 border-b-2 border-slate-300 pb-1 mb-3 inline-block">Catatan Lapangan</h3>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg min-h-[80px] text-sm text-slate-700 italic">
                 {selectedRoad.notes || "Tidak ada catatan tambahan dari surveyor."}
              </div>
           </div>

           <div className="page-break-inside-avoid">
              <h3 className="font-bold text-slate-800 border-b-2 border-slate-300 pb-1 mb-4 inline-block">Lampiran Media Visual</h3>
              <div className="grid grid-cols-2 gap-4">
                 {/* Print Foto (Jika ada) */}
                 {selectedRoad.photoUrls && selectedRoad.photoUrls.map((url, i) => (
                    <div key={i} className="flex flex-col items-center">
                       <img src={url} className="w-full h-48 object-cover rounded-lg border-2 border-slate-200" alt="Lampiran" />
                       <span className="text-[10px] text-slate-500 mt-1 font-bold">Lampiran Foto {i+1}</span>
                    </div>
                 ))}
                 
                 {/* Print Tangkapan Layar Video (4 Frame) */}
                 {videoSnapshot && videoSnapshot.length > 0 && videoSnapshot.map((snap, i) => (
                    <div key={`vid-snap-${i}`} className="flex flex-col items-center">
                       <div className="relative w-full">
                         <img src={snap} className="w-full h-48 object-cover rounded-lg border-2 border-blue-200 shadow-sm" alt={`Cuplikan Video ${i+1}`} />
                         <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm text-white text-[9px] font-bold px-2 py-1 rounded">CUPLIKAN VIDEO {i+1}</div>
                       </div>
                       <span className="text-[10px] text-slate-500 mt-1 font-bold">Hasil Ekstraksi Otomatis Frame {i+1}</span>
                    </div>
                 ))}
                 
                 {/* Jika Kosong (Tanpa foto dan tanpa video) */}
                 {(!selectedRoad.photoUrls || selectedRoad.photoUrls.length === 0) && (!videoSnapshot || videoSnapshot.length === 0) && (
                    <div className="col-span-2 text-center p-6 border-2 border-dashed border-slate-300 rounded-xl text-slate-400 text-sm font-bold">
                       Tidak ada media visual (Foto/Video) yang dilampirkan pada laporan ini.
                    </div>
                 )}
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
