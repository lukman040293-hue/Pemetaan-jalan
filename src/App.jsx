import React, { useState, useEffect, useRef } from 'react';

// =========================================================================
// 🔴 KONFIGURASI SUPABASE ANDA 
// Masukkan URL dan Publishable Key dari Project Supabase Anda di sini:
// =========================================================================
const SUPABASE_URL = 'https://crgckrqueqpgrakkzfmp.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_Dmd8dOeZaAs0IGC4kXrSSg_it8dY8nB'; 

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
  const [videoSnapshot, setVideoSnapshot] = useState([]); // Diubah menjadi array untuk menampung 4 cuplikan
  
  // Status Upload Cloud
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  // --- MEMUAT DRAFT DARI LOCAL STORAGE SAAT APLIKASI DIBUKA ---
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

  // --- MENYIMPAN DRAFT KE LOCAL STORAGE SETIAP KALI ADA PERUBAHAN ---
  useEffect(() => {
    try {
      // Kita perlu menyaring object "File" asli karena File tidak bisa di-stringify ke JSON langsung.
      // Kita hanya menyimpan data teks, GPS, dan string URL sementara.
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
  // Atur default sidebar terbuka jika layar besar (desktop), tertutup jika layar HP
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768);
  const adminMapContainerRef = useRef(null);
  const adminMapInstanceRef = useRef(null);
  const adminLayerGroupRef = useRef(null);
  const hasFittedAdminMapRef = useRef(false);

  // --- STATE SURVEYOR ---
  const [mobileScreen, setMobileScreen] = useState('home'); 
  const [isRecording, setIsRecording] = useState(false);
  const [realGpsPoints, setRealGpsPoints] = useState([]);
  const [gpsAccuracy, setGpsAccuracy] = useState('-');
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [totalDistance, setTotalDistance] = useState(0);
  const [pinLocation, setPinLocation] = useState(null); 
  const [currentLocation, setCurrentLocation] = useState(null); 
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState(null);
  const [uploadedVideoFile, setUploadedVideoFile] = useState(null); 
  
  // State untuk multiple foto (Max 4)
  const [uploadedPhotoFiles, setUploadedPhotoFiles] = useState([]);
  const [uploadedPhotoUrls, setUploadedPhotoUrls] = useState([]);

  // State untuk memilih draft offline mana saja yang akan diunggah
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

      setSyncedRoads(prev => {
        if (JSON.stringify(prev) === JSON.stringify(formattedData)) return prev;
        return formattedData;
      });
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
             (filterJenis === 'Semua' || road.jenisJalan === filterJenis) &&
             (filterKondisi === 'Semua' || road.condition === filterKondisi);
    });

    filteredRoads.forEach(road => {
      if (road.realGps && road.realGps.length > 0) {
        const latlngs = road.realGps.map(pt => [pt.lat, pt.lng]);
        const polyline = window.L.polyline(latlngs, { color: getConditionColor(road.condition), weight: 6, opacity: 0.8 }).addTo(layerGroup);
        
        latlngs.forEach(coord => {
          window.L.circleMarker(coord, { 
            radius: 2, 
            fillColor: '#ffffff', 
            color: getConditionColor(road.condition), 
            weight: 1.5, 
            fillOpacity: 1 
          }).addTo(layerGroup);
        });

        window.L.circleMarker(latlngs[0], { radius: 5, fillColor: '#10B981', color: '#ffffff', weight: 2, fillOpacity: 1 }).addTo(layerGroup);
        window.L.circleMarker(latlngs[latlngs.length - 1], { radius: 5, fillColor: '#EF4444', color: '#ffffff', weight: 2, fillOpacity: 1 }).addTo(layerGroup);

        if (road.pinLocation && road.pinLocation.lat && road.pinLocation.lng) {
          const pinIcon = window.L.divIcon({
            className: 'custom-pin',
            html: `<div style="background-color: ${getConditionColor(road.condition)}; width: 18px; height: 18px; border-radius: 50% 50% 50% 0; border: 2px solid white; transform: rotate(-45deg); box-shadow: 2px 2px 5px rgba(0,0,0,0.5);"></div>`,
            iconSize: [18, 18], iconAnchor: [9, 18], popupAnchor: [0, -18]
          });
          
          const uniqueId = road.id || road.dbId || Math.floor(Math.random() * 1000000);
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
          
          const marker = window.L.marker([road.pinLocation.lat, road.pinLocation.lng], { icon: pinIcon })
            .addTo(layerGroup)
            .bindPopup(popupContent, { autoClose: false, closeOnClick: false });
            
          // Memasang event listener klik ke tombol Detail di dalam popup HTML
          marker.on('popupopen', () => {
            const btn = document.getElementById(`btn-detail-${uniqueId}`);
            if (btn) {
              btn.onclick = () => {
                setSelectedRoad(road);
                setVideoSnapshot([]); 
                // Jika di layar HP, sidebar di close agar layar tidak penuh
                if (window.innerWidth < 768) {
                   setIsSidebarOpen(false);
                }
              };
            }
          });
        }
        
        polyline.on('click', () => {
          setSelectedRoad(road);
          setVideoSnapshot([]); 
          if (window.innerWidth < 768) {
             setIsSidebarOpen(false);
          }
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
  }, [appRole, syncedRoads, filterKelurahan, filterKondisi]);

  useEffect(() => {
    if (appRole === 'admin' && adminMapInstanceRef.current) {
      setTimeout(() => { adminMapInstanceRef.current.invalidateSize(); }, 300); 
    }
  }, [isSidebarOpen, appRole]);

  // --- EFEK PETA SURVEYOR ---
  // (Sama seperti sebelumnya, dikurangi untuk ringkasnya, tidak ada perubahan logika GPS)
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
      window.L.circleMarker(latlngs[0], { radius: 5, fillColor: '#10B981', color: '#fff', weight: 2, fillOpacity: 1 }).addTo(map);
      window.L.circleMarker(latlngs[latlngs.length - 1], { radius: 5, fillColor: '#EF4444', color: '#fff', weight: 2, fillOpacity: 1 }).addTo(map);
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

    if ('geolocation' in navigator) {
        watchLocationIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                setCurrentLocation({ lat: latitude, lng: longitude });
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
  }, [appRole, mobileScreen, isLeafletLoaded, realGpsPoints, formData.condition]);

  useEffect(() => {
    if (appRole !== 'surveyor' || mobileScreen !== 'pin_map' || !surveyorMapInstanceRef.current) return;
    const map = surveyorMapInstanceRef.current;

    if (pinLocation) {
      if (surveyorMarkerRef.current) {
        surveyorMarkerRef.current.setLatLng([pinLocation.lat, pinLocation.lng]);
      } else {
        const pinIcon = window.L.divIcon({
          className: 'custom-pin-mobile',
          html: `<div style="background-color: ${getConditionColor(formData.condition)}; width: 18px; height: 18px; border-radius: 50% 50% 50% 0; border: 2px solid white; transform: rotate(-45deg); box-shadow: 2px 2px 5px rgba(0,0,0,0.5);"></div>`,
          iconSize: [18, 18], iconAnchor: [9, 18]
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
    setRealGpsPoints([]); setIsRecording(true); setMobileScreen('record');
    setGpsAccuracy('-'); setCurrentSpeed(0); setTotalDistance(0);
    setUploadedVideoUrl(null); setUploadedVideoFile(null); 
    setUploadedPhotoFiles([]); setUploadedPhotoUrls([]);
    setPinLocation(null);
    setEditingDraftId(null); 

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
          setGpsAccuracy(Math.round(accuracy));
          if (speed) setCurrentSpeed(Math.round(speed * 3.6)); 
          if (accuracy > 20) return;

          setRealGpsPoints(prev => {
            if (prev.length === 0) return [{ lat: latitude, lng: longitude }];
            const last = prev[prev.length - 1];
            const dist = getDistanceMeters(last.lat, last.lng, latitude, longitude);
            if (dist < 1) return prev;
            if (dist > 100) return prev;
            setTotalDistance(d => d + dist);
            return [...prev, { lat: latitude, lng: longitude }];
          });
        },
        () => {}, 
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
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
          setSyncMessage(`Mengunggah Video (${sizeInMB} MB) untuk Rute ${i+1}/${draftsToUpload.length}... Mohon tunggu.`);
          
          const fileExt = draft.videoFile.name.split('.').pop();
          const fileName = `video-${Date.now()}-${Math.floor(Math.random() * 1000)}.${fileExt}`;
          const { error: uploadError } = await supabase.storage.from('media').upload(fileName, draft.videoFile);

          if (!uploadError) {
            const { data } = supabase.storage.from('media').getPublicUrl(fileName);
            finalVideoUrl = data.publicUrl;
          }
        }

        if (draft.photoFiles && draft.photoFiles.length > 0) {
          setSyncMessage(`Mengunggah ${draft.photoFiles.length} Foto untuk Rute ${i+1}/${draftsToUpload.length}...`);
          
          for (let j = 0; j < draft.photoFiles.length; j++) {
            const photoFile = draft.photoFiles[j];
            const fileExt = photoFile.name.split('.').pop();
            const fileName = `photo-${Date.now()}-${j}-${Math.floor(Math.random() * 1000)}.${fileExt}`;
            const { error: photoUploadError } = await supabase.storage.from('media').upload(fileName, photoFile);
            
            if (!photoUploadError) {
              const { data } = supabase.storage.from('media').getPublicUrl(fileName);
              finalPhotoUrls.push(data.publicUrl);
            }
          }
        }

        setSyncMessage(`Menyimpan Rute ${i+1}/${draftsToUpload.length} ke Database Pusat...`);
        
        const { id, videoFile, localVideoUrl, photoFiles, localPhotoUrls, ...dataToUpload } = draft; 
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
      setDrafts(prev => prev.filter(d => !selectedDraftIds.includes(d.id)));
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


  // =========================================================================
  // RENDER STRUKTUR UTAMA
  // =========================================================================
  return (
    <div className="w-full h-screen h-[100dvh] overflow-hidden bg-slate-900 relative text-slate-900 font-sans print:h-auto print:overflow-visible print:bg-white">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <style dangerouslySetInnerHTML={{__html: `
        .leaflet-container { width: 100%; height: 100%; min-height: 100%; z-index: 10; touch-action: none; }
        .animate-fade-in-up { animation: fadeInUp 0.3s ease-out forwards; }
        @keyframes fadeInUp { from { opacity: 0; transform: translate(-50%, 20px); } to { opacity: 1; transform: translate(-50%, 0); } }
        body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background-color: #0f172a; overscroll-behavior: none; overflow: hidden; }
        
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(148, 163, 184, 0.5); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: rgba(148, 163, 184, 0.8); }

        /* Mendorong tombol Zoom & Layer ke kanan agar tidak tertutup sidebar */
        .leaflet-left { transition: left 0.3s ease-in-out; }
        .sidebar-open .leaflet-left { left: 395px !important; }
        @media (max-width: 768px) {
          /* Menggunakan vw agar lebih presisi di layar HP */
          .sidebar-open .leaflet-left { left: calc(85vw + 15px) !important; }
        }

        /* Tombol Detail di dalam Popup */
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
        <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50 bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center space-x-3 transition-all animate-bounce border border-slate-700 print-hidden">
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

                  {gpsAccuracy > 20 && gpsAccuracy !== '-' && (
                    <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-amber-500/90 text-white px-4 py-2 rounded-full text-[10px] md:text-xs font-bold shadow-lg flex items-center space-x-2 border border-amber-400 backdrop-blur-sm z-50 whitespace-nowrap">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <span>Sinyal Terhalang ({gpsAccuracy}m) - Menunggu Akurasi...</span>
                    </div>
                  )}

                  <div className="absolute top-6 left-6 bg-black/80 px-4 py-3 rounded-xl text-xs font-bold font-mono backdrop-blur-md border border-white/10">
                    <div className="text-emerald-400 font-bold mb-1 border-b border-white/20 pb-1">SENSOR DATA:</div>
                    <div className={gpsAccuracy > 20 ? "text-amber-400" : "text-white"}>Akurasi: {gpsAccuracy} m</div>
                    <div>Speed: {currentSpeed} km/h</div>
                    <div>Jarak: {totalDistance < 1000 ? Math.round(totalDistance) + ' m' : (totalDistance/1000).toFixed(2) + ' km'}</div>
                    <div>Log Disimpan: {realGpsPoints.length}</div>
                  </div>

                  <div className="absolute top-24 right-6">
                    <button onClick={() => { if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; } }} className="bg-black/80 hover:bg-black/90 text-white px-4 py-2 rounded-xl text-xs font-bold backdrop-blur-md border border-white/20">Matikan Kamera</button>
                  </div>

                  <div className="absolute bottom-8 w-full px-6 space-y-3">
                    {realGpsPoints.length === 0 && (
                      <button onClick={simulateGpsMovement} className="w-full bg-slate-800 text-white text-xs py-3 rounded-xl font-bold shadow-lg">Gagal Sinyal GPS? Gunakan Simulasi</button>
                    )}
                    <div className="bg-black/85 backdrop-blur-md p-4 rounded-2xl border border-white/10 text-left text-xs font-mono h-24 overflow-hidden flex flex-col justify-end">
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
                    <input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="Cth: Jl. Poros Utama" className="w-full border border-slate-200 p-4 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm" required />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Kelurahan</label>
                    <select value={formData.kelurahan} onChange={(e) => setFormData({...formData, kelurahan: e.target.value})} className="w-full border border-slate-200 p-4 rounded-2xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
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
                    <textarea value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} className="w-full border border-slate-200 p-4 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-500" rows="3"></textarea>
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
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">Unggah Video (Opsional, Maks 50MB)</label>
                    <p className="text-[10px] text-slate-500 mb-2 italic">*Catatan: Jika video terlalu besar, silahkan kirim ke WA dan download kembali agar ukuran video mencukupi.</p>
                    <div className="relative border-2 border-dashed border-slate-300 rounded-2xl p-4 text-center bg-white hover:bg-slate-50 transition-colors">
                      <input type="file" accept="video/*" onChange={(e) => { 
                          const f = e.target.files[0]; 
                          if(f){ 
                            const maxSizeBytes = 50 * 1024 * 1024; 
                            if (f.size > maxSizeBytes) {
                               showToast("⚠️ Gagal: Ukuran video terlalu besar! Maksimal 50 MB.");
                               e.target.value = ''; 
                               return; 
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
                <div className="bg-white px-5 py-4 border-b border-slate-200 flex justify-between items-center z-10 shadow-sm">
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
              <div className="flex-1 p-6 flex flex-col bg-slate-100 text-left">
                <div className="flex justify-between items-center mb-4 mt-2">
                  <div><h3 className="text-2xl font-black">Draft Offline</h3><p className="text-sm text-slate-500">Disimpan aman di HP</p></div>
                  <button onClick={() => setMobileScreen('home')} className="bg-slate-200 text-slate-600 p-3 rounded-full hover:bg-slate-300">Tutup</button>
                </div>

                {drafts.length > 0 && (
                   <div className="mb-4 flex justify-between items-center bg-white p-3 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:bg-slate-50 transition-colors" onClick={selectAllDrafts}>
                     <span className="text-sm font-bold text-slate-700">Pilih Semua ({drafts.length})</span>
                     <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors ${selectedDraftIds.length === drafts.length ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                        {selectedDraftIds.length === drafts.length && <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>}
                     </div>
                   </div>
                )}

                <div className="flex-1 space-y-4 overflow-y-auto pb-4">
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
                             <div className="font-extrabold text-base text-slate-800 pr-2">{d.name}</div>
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
                    )})
                  )}
                </div>

                {drafts.length > 0 && (
                  <div className="pt-2 pb-6">
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
          
          <header className="bg-white border-b border-slate-200 h-16 px-4 md:px-6 flex justify-between items-center flex-shrink-0 z-40 shadow-sm relative">
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
            {/* Memindahkan trigger 'sidebar-open' ke parent wrapper agar React tidak merusak node peta Leaflet */}
            <section className={`absolute inset-0 z-0 flex flex-col ${isSidebarOpen ? 'sidebar-open' : ''}`}>
              <div className="relative w-full h-full">
                <div ref={adminMapContainerRef} className="absolute inset-0 bg-slate-200 z-0"></div>
                {!isLeafletLoaded && <div className="absolute inset-0 flex items-center justify-center bg-slate-100 font-bold text-slate-400 z-10 pointer-events-none">Memuat Peta Leaflet...</div>}
                
                <div className="absolute top-4 md:top-6 right-4 bg-white/70 backdrop-blur-md p-2 md:p-3 rounded-xl border border-white/50 shadow-lg text-[10px] md:text-xs font-bold text-slate-700 z-[1000] pointer-events-none">
                  <div className="mb-1 md:mb-2 text-[9px] md:text-[10px] text-slate-600 uppercase tracking-widest border-b border-slate-300/50 pb-1 flex justify-between">
                     <span>Legenda Peta</span>
                     <span className="font-extrabold text-blue-600 ml-4">Total: {syncedRoads.filter(r => (filterKelurahan === 'Semua' || r.kelurahan === filterKelurahan) && (filterJenis === 'Semua' || r.jenisJalan === filterJenis) && (filterKondisi === 'Semua' || r.condition === filterKondisi)).length}</span>
                  </div>
                  <div className="flex flex-col space-y-1 md:space-y-2 mt-1 md:mt-2">
                    <div className="flex items-center justify-between space-x-2 md:space-x-3">
                       <div className="flex items-center space-x-1.5 md:space-x-2"><span className="w-3 h-1 md:w-4 md:h-1.5 bg-[#10B981] rounded-full shadow-sm"></span><span>Baik / Mulus</span></div>
                       <span className="bg-emerald-100/80 text-emerald-700 px-1.5 py-0.5 rounded text-[9px] md:text-[10px]">
                          {syncedRoads.filter(r => r.condition === 'Baik' && (filterKelurahan === 'Semua' || r.kelurahan === filterKelurahan) && (filterJenis === 'Semua' || r.jenisJalan === filterJenis)).length}
                       </span>
                    </div>
                    <div className="flex items-center justify-between space-x-2 md:space-x-3">
                       <div className="flex items-center space-x-1.5 md:space-x-2"><span className="w-3 h-1 md:w-4 md:h-1.5 bg-[#FBBF24] rounded-full shadow-sm"></span><span>Rusak Ringan</span></div>
                       <span className="bg-amber-100/80 text-amber-700 px-1.5 py-0.5 rounded text-[9px] md:text-[10px]">
                          {syncedRoads.filter(r => r.condition === 'Rusak Ringan' && (filterKelurahan === 'Semua' || r.kelurahan === filterKelurahan) && (filterJenis === 'Semua' || r.jenisJalan === filterJenis)).length}
                       </span>
                    </div>
                    <div className="flex items-center justify-between space-x-2 md:space-x-3">
                       <div className="flex items-center space-x-1.5 md:space-x-2"><span className="w-3 h-1 md:w-4 md:h-1.5 bg-[#F97316] rounded-full shadow-sm"></span><span>Rusak Sedang</span></div>
                       <span className="bg-orange-100/80 text-orange-700 px-1.5 py-0.5 rounded text-[9px] md:text-[10px]">
                          {syncedRoads.filter(r => r.condition === 'Rusak Sedang' && (filterKelurahan === 'Semua' || r.kelurahan === filterKelurahan) && (filterJenis === 'Semua' || r.jenisJalan === filterJenis)).length}
                       </span>
                    </div>
                    <div className="flex items-center justify-between space-x-2 md:space-x-3">
                       <div className="flex items-center space-x-1.5 md:space-x-2"><span className="w-3 h-1 md:w-4 md:h-1.5 bg-[#EF4444] rounded-full shadow-sm"></span><span>Rusak Parah</span></div>
                       <span className="bg-red-100/80 text-red-700 px-1.5 py-0.5 rounded text-[9px] md:text-[10px]">
                          {syncedRoads.filter(r => r.condition === 'Rusak Parah' && (filterKelurahan === 'Semua' || r.kelurahan === filterKelurahan) && (filterJenis === 'Semua' || r.jenisJalan === filterJenis)).length}
                       </span>
                    </div>
                  </div>

                  {/* TAMBAHAN LEGENDA MATERIAL JALAN */}
                  <div className="mt-2 md:mt-3 pt-2 border-t border-slate-300/50">
                    <div className="mb-1.5 text-[8px] md:text-[9px] text-slate-500 uppercase tracking-widest">Material Jalan</div>
                    <div className="flex flex-col space-y-1 md:space-y-2">
                      <div className="flex items-center justify-between space-x-2 md:space-x-3">
                         <div className="flex items-center space-x-1.5 md:space-x-2"><span className="text-sm leading-none grayscale opacity-80">🛣️</span><span>Aspal</span></div>
                         <span className="bg-slate-200/70 text-slate-700 px-1.5 py-0.5 rounded text-[9px] md:text-[10px]">
                            {syncedRoads.filter(r => (r.jenisJalan === 'Aspal' || !r.jenisJalan) && (filterKelurahan === 'Semua' || r.kelurahan === filterKelurahan) && (filterJenis === 'Semua' || r.jenisJalan === filterJenis) && (filterKondisi === 'Semua' || r.condition === filterKondisi)).length}
                         </span>
                      </div>
                      <div className="flex items-center justify-between space-x-2 md:space-x-3">
                         <div className="flex items-center space-x-1.5 md:space-x-2"><span className="text-sm leading-none grayscale opacity-80">🧱</span><span>Beton</span></div>
                         <span className="bg-slate-200/70 text-slate-700 px-1.5 py-0.5 rounded text-[9px] md:text-[10px]">
                            {syncedRoads.filter(r => r.jenisJalan === 'Beton' && (filterKelurahan === 'Semua' || r.kelurahan === filterKelurahan) && (filterJenis === 'Semua' || r.jenisJalan === filterJenis) && (filterKondisi === 'Semua' || r.condition === filterKondisi)).length}
                         </span>
                      </div>
                      <div className="flex items-center justify-between space-x-2 md:space-x-3">
                         <div className="flex items-center space-x-1.5 md:space-x-2"><span className="text-sm leading-none opacity-80">🟤</span><span>Tanah</span></div>
                         <span className="bg-slate-200/70 text-slate-700 px-1.5 py-0.5 rounded text-[9px] md:text-[10px]">
                            {syncedRoads.filter(r => r.jenisJalan === 'Tanah' && (filterKelurahan === 'Semua' || r.kelurahan === filterKelurahan) && (filterJenis === 'Semua' || r.jenisJalan === filterJenis) && (filterKondisi === 'Semua' || r.condition === filterKondisi)).length}
                         </span>
                      </div>
                    </div>
                  </div>

                </div>
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
                <div className="px-4 py-3 border-b border-white/30 flex justify-between items-end bg-white/40 z-10 shrink-0">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Laporan Masuk</span>
                  <span className="bg-blue-100/80 text-blue-700 px-2 py-0.5 rounded-full text-xs font-bold shadow-sm">
                    {syncedRoads.filter(r => (filterKelurahan === 'Semua' || r.kelurahan === filterKelurahan) && (filterJenis === 'Semua' || r.jenisJalan === filterJenis) && (filterKondisi === 'Semua' || r.condition === filterKondisi)).length} Data
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-8 custom-scrollbar">
                  {syncedRoads.length === 0 ? (
                    <div className="text-center text-slate-500 mt-10 text-sm p-4 border border-dashed border-slate-300/60 rounded-2xl">
                       Tabel kosong. Menunggu data dari Supabase PostgreSQL.
                    </div>
                  ) : (
                    syncedRoads
                      .filter(road => (filterKelurahan === 'Semua' || road.kelurahan === filterKelurahan) && (filterJenis === 'Semua' || road.jenisJalan === filterJenis) && (filterKondisi === 'Semua' || road.condition === filterKondisi))
                      .map((road) => (
                      <div key={road.dbId || road.id} onClick={() => {
                          setSelectedRoad(road);
                          setVideoSnapshot([]); 
                          if (window.innerWidth < 768) {
                             setIsSidebarOpen(false);
                          }
                          if (adminMapInstanceRef.current && road.realGps && road.realGps.length > 0) {
                             const latlngs = road.realGps.map(pt => [pt.lat, pt.lng]);
                             adminMapInstanceRef.current.fitBounds(window.L.latLngBounds(latlngs), { padding: [40, 40] });
                          }
                      }} className={`p-3 rounded-2xl border bg-white/50 backdrop-blur-sm cursor-pointer transition-all hover:-translate-y-0.5 hover:bg-white/70 ${selectedRoad?.id === road.id ? 'border-blue-500 shadow-md ring-1 ring-blue-500' : 'border-white/60 shadow-sm hover:border-blue-300 hover:shadow-md'}`}>
                        <div className="flex gap-3">
                          <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-slate-100/50 relative border border-white/60 shadow-sm">
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
                            <h4 className="font-extrabold text-sm text-slate-900 leading-tight truncate pr-2 mb-1.5">{road.name}</h4>
                            <div className="flex flex-wrap items-center gap-1.5 mb-2">
                              <span className="text-[10px] font-bold text-white px-2 py-0.5 rounded-full whitespace-nowrap shadow-sm" style={{ backgroundColor: getConditionColor(road.condition)}}>{road.condition}</span>
                              <span className="text-[10px] font-semibold text-slate-600 truncate">{road.jenisJalan || 'Aspal'} • {formatKel(road.kelurahan)}</span>
                            </div>
                            <div className="mt-auto flex items-center justify-between text-[10px] text-slate-500">
                              <span>{road.date}</span>
                              <span className="font-mono bg-white/60 px-1.5 py-0.5 rounded border border-white/50 text-slate-600 font-bold">
                                {formatLength(road.length)} • {road.realGps?.length || 0} GPS
                              </span>
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

            {/* --- SELECTED ROAD POPUP (Muncul di tengah bawah) --- */}
            {selectedRoad && (
              <div className="absolute bottom-2 md:bottom-6 left-1/2 transform -translate-x-1/2 w-[95%] md:w-11/12 max-w-4xl bg-white/95 backdrop-blur-xl rounded-2xl md:rounded-3xl shadow-2xl border border-white/60 flex flex-col md:flex-row overflow-hidden z-[1000] animate-fade-in-up max-h-[85vh]">
                <button onClick={() => setSelectedRoad(null)} className="absolute top-3 right-3 md:top-5 md:right-5 text-slate-500 hover:text-slate-900 bg-slate-100/80 hover:bg-slate-200 p-2 rounded-full z-30 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4 md:w-5 md:h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>

                <div className="w-full md:w-1/3 bg-slate-100 relative border-b md:border-b-0 md:border-r border-slate-200/60 flex flex-col justify-center items-center h-48 md:min-h-[260px] md:h-auto shrink-0">
                  {selectedRoad.videoUrl ? (
                    <>
                      <video id="admin-vid-player" crossOrigin="anonymous" src={selectedRoad.videoUrl} controls className="absolute inset-0 w-full h-full object-contain bg-black"></video>
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
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 md:w-10 md:h-10 text-slate-300 mb-1 md:mb-2 mx-auto"><path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm14.024-.983a1.125 1.125 0 010 1.966l-5.603 3.113A1.125 1.125 0 019 15.113V8.887c0-.857.921-1.4 1.671-.983l5.603 3.113z" clipRule="evenodd" /></svg>
                      <span className="text-[10px] md:text-[11px] font-bold text-slate-400">Media Tidak Dilampirkan</span>
                    </div>
                  )}
                </div>
                
                <div className="w-full md:w-2/3 p-5 md:p-8 flex flex-col justify-between bg-white/80 text-slate-800 overflow-y-auto">
                  <div>
                    <div className="flex justify-between items-start mb-2 pr-12 md:pr-16">
                      <div className="text-[10px] md:text-xs font-semibold text-blue-600 uppercase tracking-widest mt-1.5">{formatKel(selectedRoad.kelurahan)}</div>
                      <div className="flex space-x-1">
                         <button onClick={handlePrint} className="text-[10px] md:text-xs text-blue-600 hover:bg-blue-100/80 font-medium px-3 py-1.5 transition-colors rounded-full flex items-center bg-blue-50/50">
                           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-3.5 h-3.5 mr-1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.724.092m6.524-4.659A15.45 15.45 0 0112 9c-1.39 0-2.73.19-4.008.537m13.064 3.018a4.5 4.5 0 01-1.532 2.656c-1.22.956-2.822 1.49-4.524 1.49-1.703 0-3.305-.534-4.524-1.49a4.5 4.5 0 01-1.532-2.656m12.088-3.018c.24-.03.484-.062.724-.092a1.5 1.5 0 001.276-1.48v-2.31a1.5 1.5 0 00-1.276-1.48c-.24-.03-.484-.062-.724-.092m-12.088 3.018c-.24.03-.48.062-.724.092a1.5 1.5 0 01-1.276-1.48v-2.31a1.5 1.5 0 011.276-1.48c.24-.03.48-.062.724-.092M12 2.25v1m0 17.5v1" /></svg>
                           Cetak PDF
                         </button>
                         <button onClick={() => hapusDataCloud(selectedRoad.id || selectedRoad.dbId)} className="text-[10px] md:text-xs text-rose-600 hover:bg-rose-100/80 font-medium px-3 py-1.5 transition-colors rounded-full bg-rose-50/50">Hapus Rute</button>
                      </div>
                    </div>
                    
                    <h4 className="text-2xl font-black mb-1 leading-tight text-slate-900">{selectedRoad.name}</h4>
                    
                    <p className="text-sm text-slate-600 leading-relaxed font-normal mb-3">
                      "{selectedRoad.notes || "Tidak ada catatan."}"
                    </p>
                    
                    {selectedRoad.pinLocation && selectedRoad.pinLocation.lat && selectedRoad.pinLocation.lng && (
                      <div className="text-xs text-slate-500 font-normal inline-flex items-center">
                        <span className="mr-1.5 text-amber-500">📍</span> Pin: {selectedRoad.pinLocation.lat.toFixed(5)}, {selectedRoad.pinLocation.lng.toFixed(5)}
                      </div>
                    )}

                    {selectedRoad.photoUrls && selectedRoad.photoUrls.length > 0 && (
                      <div className="mt-5 pt-4">
                        <span className="text-[10px] md:text-xs font-medium text-slate-500 mb-2 block uppercase tracking-wider">Galeri Foto ({selectedRoad.photoUrls.length})</span>
                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-300">
                          {selectedRoad.photoUrls.map((url, i) => (
                            <a href={url} target="_blank" rel="noreferrer" key={i} className="flex-shrink-0 relative group">
                              <img src={url} className="w-14 h-14 md:w-16 md:h-16 rounded-xl object-cover border border-slate-200 hover:border-blue-300 shadow-sm transition-colors" />
                              <div className="absolute inset-0 bg-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4 md:w-5 md:h-5 text-white drop-shadow-md"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" /></svg>
                              </div>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 text-xs font-normal text-slate-500 mt-5 pt-4 border-t border-slate-200/60">
                    <span>{selectedRoad.date}</span>
                    <span className="text-slate-300">•</span>
                    <span>Pjg: {formatLength(selectedRoad.length)}</span>
                  </div>
                </div>
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
