import React, { useState, useEffect, useRef } from 'react';

// =========================================================================
// 🔴 KONFIGURASI SUPABASE ANDA 
// =========================================================================
const SUPABASE_URL = 'https://bucyrbywyrkvjwqpzetk.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_KX8WFsYJBgdsCp-Rp9hg1A_YSxStzFR'; 

// =========================================================================
// 🔵 KONFIGURASI CLOUDINARY (PENYIMPANAN MEDIA PIHAK KETIGA)
// =========================================================================
const CLOUDINARY_CLOUD_NAME = 'djntwm7ta'; 
const CLOUDINARY_UPLOAD_PRESET = 'preset_survey_jalan'; 

// --- FUNGSI PEMUAT LIBRARY SUPER AMAN (ANTI UMD TRAP & CSP SAFE) ---
const loadLibrarySafely = async (cssUrl, jsUrls, globalVarName) => {
  if (window[globalVarName]) return true;

  window.__lib_locks = window.__lib_locks || {};
  if (window.__lib_locks[globalVarName]) {
      for (let i = 0; i < 50; i++) {
          if (window[globalVarName]) return true;
          await new Promise(r => setTimeout(r, 100));
      }
      return !!window[globalVarName];
  }
  window.__lib_locks[globalVarName] = true;

  if (cssUrl && !document.querySelector(`link[href="${cssUrl}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = cssUrl;
      document.head.appendChild(link);
  }

  let success = false;
  for (const url of jsUrls) {
      try {
          const res = await fetch(url);
          if (!res.ok) continue;
          const code = await res.text();

          const safeCode = `
            (function() {
              var define = false;
              var module = false;
              var exports = false;
              ${code}
            })();
          `;

          const blob = new Blob([safeCode], { type: 'application/javascript' });
          const blobUrl = URL.createObjectURL(blob);

          await new Promise((resolve, reject) => {
              const script = document.createElement('script');
              script.src = blobUrl;
              script.onload = resolve;
              script.onerror = reject;
              document.head.appendChild(script);
          });

          await new Promise(r => setTimeout(r, 50));
          if (window[globalVarName]) {
              success = true;
              break;
          }
      } catch (e) {
          console.warn("Mencoba fallback CDN...", e);
      }
  }

  window.__lib_locks[globalVarName] = false;
  return success;
};

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
    case 'Baik': return '#10B981';         
    case 'Rusak Ringan': return '#FBBF24'; 
    case 'Rusak Sedang': return '#F97316'; 
    case 'Rusak Parah': return '#EF4444';  
    default: return '#6B7280';
  }
};

const formatKel = (nama) => {
  if (!nama) return '-';
  return /^(kel\.|kelurahan)\s/i.test(nama) ? nama : `Kel. ${nama}`;
};

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

const getBearing = (lat1, lng1, lat2, lng2) => {
    const toRad = deg => deg * Math.PI / 180;
    const toDeg = rad => rad * 180 / Math.PI;
    const dLng = toRad(lng2 - lng1);
    const y = Math.sin(dLng) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
};

const simplifyGpsData = (points, tolerance = 0.00003) => {
  if (points.length <= 2) return points;
  const sqTolerance = tolerance * tolerance;
  const simplified = [points[0]];
  const simplifyStep = (pts, first, last) => {
      let maxSqDist = sqTolerance, index;
      for (let i = first + 1; i < last; i++) {
          let x = pts[first].lat, y = pts[first].lng, dx = pts[last].lat - x, dy = pts[last].lng - y;
          if (dx !== 0 || dy !== 0) { const t = ((pts[i].lat - x) * dx + (pts[i].lng - y) * dy) / (dx * dx + dy * dy); if (t > 1) { x = pts[last].lat; y = pts[last].lng; } else if (t > 0) { x += dx * t; y += dy * t; } }
          dx = pts[i].lat - x; dy = pts[i].lng - y;
          const sqDist = dx * dx + dy * dy;
          if (sqDist > maxSqDist) { index = i; maxSqDist = sqDist; }
      }
      if (maxSqDist > sqTolerance) { if (index - first > 1) simplifyStep(pts, first, index); simplified.push(pts[index]); if (last - index > 1) simplifyStep(pts, index, last); }
  };
  simplifyStep(points, 0, points.length - 1);
  simplified.push(points[points.length - 1]);
  return simplified;
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

const getVideoThumbnail = (url) => {
    if (!url || typeof url !== 'string') return null;
    // Trik Cloudinary: ambil screenshot detik ke-0 (so_0) dan ubah ekstensi ke .jpg
    if (url.includes('cloudinary.com/video/upload/')) {
        return url.replace('/upload/', '/upload/so_0,w_150,h_150,c_fill/').replace(/\.[^/.]+$/, ".jpg");
    }
    return url.replace(/\.[^/.]+$/, ".jpg"); 
};

const getThumbnailUrl = (road) => {
    if (road.photoUrls && road.photoUrls.length > 0) return road.photoUrls[0];
    if (road.videoUrl) return getVideoThumbnail(road.videoUrl);
    return null;
};

const createPinIconHtml = (conditionColor, thumbnailUrl, size = 'sm') => { // Default diubah ke 'sm' (kecil)
    const s = size === 'lg' ? 36 : (size === 'md' ? 28 : 24); // Ukuran lingkaran diperkecil: lg=36, md=28, sm=24
    const poleH = size === 'lg' ? 18 : (size === 'md' ? 14 : 10); // Tinggi tiang disesuaikan
    const padding = size === 'lg' ? 3 : (size === 'md' ? 2.5 : 2); // Padding disesuaikan
    const mt = size === 'lg' ? -5 : (size === 'md' ? -4 : -3); // Margin top disesuaikan
    
    return `
    <div style="position: relative; width: ${s}px; height: ${s + poleH + mt}px; display: flex; flex-direction: column; align-items: center; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.5));">
        <div style="width: ${s}px; height: ${s}px; border-radius: 50%; background-color: ${conditionColor}; padding: ${padding}px; z-index: 2; box-sizing: border-box; box-shadow: inset 0 2px 4px rgba(255,255,255,0.5), inset 0 -2px 4px rgba(0,0,0,0.3);">
            <div style="width: 100%; height: 100%; border-radius: 50%; overflow: hidden; background-color: ${conditionColor}; position: relative; border: 1px solid rgba(0,0,0,0.2);">
                ${thumbnailUrl ? `<img src="${thumbnailUrl}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'" />` : ''}
                <div style="position: absolute; top: 10%; left: 15%; width: 25%; height: 25%; background: rgba(255,255,255,0.7); border-radius: 50%; filter: blur(1px);"></div>
            </div>
        </div>
        <div style="width: ${size === 'sm' ? 3 : 4}px; height: ${poleH}px; background-color: #334155; border-radius: 2px; margin-top: ${mt}px; z-index: 1; box-shadow: inset 1px 0 2px rgba(255,255,255,0.3);"></div>
    </div>
    `;
};

const compressImage = (file, maxWidth = 1000, maxHeight = 1000, quality = 0.7) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image(); img.src = event.target.result;
      img.onload = () => {
        let width = img.width, height = img.height;
        if (width > height) { if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; } } else { if (height > maxHeight) { width = Math.round((width * maxHeight) / height); height = maxHeight; } }
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => { if (!blob) return reject(new Error('Gagal')); resolve(new File([blob], file.name.replace(/\.[^/.]+$/, "") + "_compressed.jpg", { type: 'image/jpeg', lastModified: Date.now() })); }, 'image/jpeg', quality);
      }; img.onerror = (error) => reject(error);
    }; reader.onerror = (error) => reject(error);
  });
};

const initBaseMaps = (map, L, defaultLayerName = "OSM Default", position = 'topright') => {
  const baseMaps = {
    "Google Maps (Jalan)": L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', { maxZoom: 20 }),
    "Google Hybrid (Satelit)": L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { maxZoom: 20 }),
    "OSM Default": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }),
    "Esri World Imagery": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }),
  };
  if(baseMaps[defaultLayerName]) baseMaps[defaultLayerName].addTo(map); else baseMaps["OSM Default"].addTo(map);
  L.control.layers(baseMaps, null, { position }).addTo(map);
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

const LayerToggle = ({ active, color, onClick }) => (
  <div onClick={(e) => { e.stopPropagation(); onClick(); }} className="w-9 h-5 rounded-full p-0.5 cursor-pointer transition-colors relative flex items-center shrink-0 border border-black/10 shadow-inner" style={{ backgroundColor: active ? color : '#cbd5e1' }}>
      <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform transform ${active ? 'translate-x-4' : 'translate-x-0'}`}></div>
  </div>
);

// --- KOMPONEN EXPORT VIDEO DRONE ---
const DroneVideoExporter = ({ road, onClose }) => {
    const mapContainerRef = useRef(null);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('menu'); 
    const [errorMessage, setErrorMessage] = useState('');
    const [downloadUrl, setDownloadUrl] = useState(null);
    const [is2DMode, setIs2DMode] = useState(false);
    const [selectedMapStyle, setSelectedMapStyle] = useState('google-hybrid');
    const [isPlaying, setIsPlaying] = useState(true);
    const [speed, setSpeed] = useState(1);
    const [vehicleType, setVehicleType] = useState('car');

    const animStateRef = useRef({ isMounted: true, map: null, frameId: null, recorder: null, isPlaying: true, speed: 1, vehicleType: 'car', status: 'menu' });

    const getVehicle3DHtml = (type) => {
        if (type === 'drone') {
            return `
            <div style="width: 40px; height: 40px; transform-style: preserve-3d; position: relative; transform: translateZ(30px) rotateX(10deg);">
                <div style="position: absolute; left: 10px; top: 10px; width: 20px; height: 20px; background: rgba(0,0,0,0.5); filter: blur(5px); transform: translateZ(-30px);"></div>
                <div style="position: absolute; left: 12px; top: 12px; width: 16px; height: 16px; background: #e2e8f0; border-radius: 4px; transform: translateZ(2px); border: 1px solid #94a3b8;"></div>
                <div style="position: absolute; left: 14px; top: 10px; width: 12px; height: 4px; background: #ef4444; border-radius: 2px; transform: translateZ(4px);"></div>
                <div style="position: absolute; left: 0; top: 0; width: 40px; height: 4px; background: #cbd5e1; top: 18px; transform: rotate(45deg) translateZ(1px);"></div>
                <div style="position: absolute; left: 0; top: 0; width: 40px; height: 4px; background: #cbd5e1; top: 18px; transform: rotate(-45deg) translateZ(1px);"></div>
                <style>@keyframes spinFast { 100% { transform: rotate(360deg) translateZ(3px); } } .rotor { position: absolute; width: 16px; height: 16px; border-radius: 50%; background: conic-gradient(transparent 20%, rgba(0,0,0,0.3) 50%, transparent 80%); animation: spinFast 0.1s linear infinite; transform: translateZ(3px); border: 1px solid rgba(0,0,0,0.1); }</style>
                <div class="rotor" style="left: -4px; top: -4px;"></div>
                <div class="rotor" style="right: -4px; top: -4px;"></div>
                <div class="rotor" style="left: -4px; bottom: -4px;"></div>
                <div class="rotor" style="right: -4px; bottom: -4px;"></div>
            </div>`;
        } else if (type === 'motorcycle') {
            return `
            <div style="width: 12px; height: 32px; transform-style: preserve-3d; position: relative;">
                <div style="position: absolute; width: 100%; height: 100%; background: rgba(0,0,0,0.7); filter: blur(3px); transform: translateZ(0px);"></div>
                <div style="position: absolute; left: 4px; top: 0px; width: 4px; height: 8px; background: #1e293b; border-radius: 2px; transform: translateZ(2px);"></div>
                <div style="position: absolute; left: 4px; bottom: 0px; width: 4px; height: 8px; background: #1e293b; border-radius: 2px; transform: translateZ(2px);"></div>
                <div style="position: absolute; left: 2px; top: 6px; width: 8px; height: 20px; background: #ef4444; border-radius: 3px; transform: translateZ(4px);"></div>
                <div style="position: absolute; left: 2px; top: 10px; width: 8px; height: 10px; background: #b91c1c; border-radius: 2px; transform: translateZ(6px);"></div>
                <div style="position: absolute; left: 4px; top: 5px; width: 4px; height: 3px; background: #fef08a; border-radius: 1px; transform: translateZ(6px); box-shadow: 0 -4px 10px #fef08a;"></div>
                <div style="position: absolute; left: 3px; top: 12px; width: 6px; height: 8px; background: #1e293b; border-radius: 2px; transform: translateZ(8px);"></div>
                <div style="position: absolute; left: 3px; top: 14px; width: 6px; height: 6px; background: #0f172a; border-radius: 50%; transform: translateZ(12px);"></div>
            </div>`;
        } else if (type === 'truck') {
            return `
            <div style="width: 28px; height: 70px; transform-style: preserve-3d; position: relative;">
                <div style="position: absolute; width: 100%; height: 100%; background: rgba(0,0,0,0.8); filter: blur(6px); transform: translateZ(0px);"></div>
                <div style="position: absolute; width: 100%; height: 100%; background: #334155; transform: translateZ(4px); border-radius: 4px;"></div>
                <div style="position: absolute; left: 2px; bottom: 2px; width: 24px; height: 48px; background: #94a3b8; transform: translateZ(6px); border-radius: 2px;"></div>
                <div style="position: absolute; left: 2px; bottom: 2px; width: 24px; height: 48px; background: #cbd5e1; transform: translateZ(16px); border-radius: 2px; border: 1px solid #94a3b8;"></div>
                <div style="position: absolute; left: 4px; top: 4px; width: 20px; height: 16px; background: #eab308; transform: translateZ(6px); border-radius: 4px;"></div>
                <div style="position: absolute; left: 4px; top: 4px; width: 20px; height: 16px; background: #facc15; transform: translateZ(14px); border-radius: 4px;"></div>
                <div style="position: absolute; left: 6px; top: 6px; width: 16px; height: 8px; background: #0f172a; transform: translateZ(15px); border-radius: 2px;"></div>
                <div style="position: absolute; left: 6px; top: -2px; width: 6px; height: 4px; background: #fef08a; transform: translateZ(10px); border-radius: 2px; box-shadow: 0 -4px 12px #fef08a;"></div>
                <div style="position: absolute; right: 6px; top: -2px; width: 6px; height: 4px; background: #fef08a; transform: translateZ(10px); border-radius: 2px; box-shadow: 0 -4px 12px #fef08a;"></div>
            </div>`;
        } else if (type === 'runner') {
            return `
            <div style="width: 14px; height: 14px; transform-style: preserve-3d; position: relative;">
                <div style="position: absolute; width: 100%; height: 100%; background: rgba(0,0,0,0.6); filter: blur(3px); transform: translateZ(0px);"></div>
                <style>@keyframes runLegL { 0% { transform: translateZ(2px) translateY(-3px); } 50% { transform: translateZ(2px) translateY(3px); } 100% { transform: translateZ(2px) translateY(-3px); } } @keyframes runLegR { 0% { transform: translateZ(2px) translateY(3px); } 50% { transform: translateZ(2px) translateY(-3px); } 100% { transform: translateZ(2px) translateY(3px); } } @keyframes runArms { 0% { transform: translateZ(14px) rotate(15deg); } 50% { transform: translateZ(14px) rotate(-15deg); } 100% { transform: translateZ(14px) rotate(15deg); } }</style>
                <div style="position: absolute; left: 2px; top: 4px; width: 4px; height: 6px; background: #1e293b; border-radius: 2px; animation: runLegL 0.4s infinite linear;"></div>
                <div style="position: absolute; right: 2px; top: 4px; width: 4px; height: 6px; background: #1e293b; border-radius: 2px; animation: runLegR 0.4s infinite linear;"></div>
                <div style="position: absolute; left: 2px; top: 4px; width: 10px; height: 6px; background: #3b82f6; border-radius: 3px; transform: translateZ(8px);"></div>
                <div style="position: absolute; left: 2px; top: 4px; width: 10px; height: 6px; background: #ef4444; border-radius: 3px; transform: translateZ(14px);"></div>
                <div style="position: absolute; left: -1px; top: 5px; width: 16px; height: 4px; background: #fcd34d; border-radius: 2px; animation: runArms 0.4s infinite linear; transform-origin: center;"></div>
                <div style="position: absolute; left: 3px; top: 3px; width: 8px; height: 8px; background: #fcd34d; border-radius: 50%; transform: translateZ(20px);"></div>
                <div style="position: absolute; left: 4px; top: 4px; width: 6px; height: 6px; background: #0f172a; border-radius: 50%; transform: translateZ(21px);"></div>
            </div>`;
        } else {
            return `
            <div style="width: 24px; height: 48px; transform-style: preserve-3d; position: relative;">
                <div style="position: absolute; width: 100%; height: 100%; background: rgba(0,0,0,0.7); filter: blur(5px); transform: translateZ(0px);"></div>
                <div style="position: absolute; width: 100%; height: 100%; background: #1e293b; transform: translateZ(2px); border-radius: 6px;"></div>
                <div style="position: absolute; width: 100%; height: 100%; background: #3b82f6; transform: translateZ(4px); border-radius: 6px;"></div>
                <div style="position: absolute; width: 100%; height: 100%; background: #2563eb; transform: translateZ(6px); border-radius: 6px;"></div>
                <div style="position: absolute; width: 100%; height: 100%; background: #1d4ed8; transform: translateZ(8px); border-radius: 6px;"></div>
                <div style="position: absolute; width: 86%; height: 50%; left: 7%; top: 25%; background: #0f172a; transform: translateZ(10px); border-radius: 4px;"></div>
                <div style="position: absolute; width: 86%; height: 50%; left: 7%; top: 25%; background: #0f172a; transform: translateZ(12px); border-radius: 4px;"></div>
                <div style="position: absolute; width: 86%; height: 30%; left: 7%; top: 35%; background: #60a5fa; transform: translateZ(14px); border-radius: 3px;"></div>
                <div style="position: absolute; width: 86%; height: 30%; left: 7%; top: 35%; background: #93c5fd; transform: translateZ(16px); border-radius: 3px; box-shadow: inset 0 0 4px rgba(255,255,255,0.5);"></div>
                <div style="position: absolute; left: 3px; top: -1px; width: 5px; height: 4px; background: #fef08a; transform: translateZ(6px); border-radius: 2px; box-shadow: 0 -3px 10px #fef08a;"></div>
                <div style="position: absolute; right: 3px; top: -1px; width: 5px; height: 4px; background: #fef08a; transform: translateZ(6px); border-radius: 2px; box-shadow: 0 -3px 10px #fef08a;"></div>
                <div style="position: absolute; left: 3px; bottom: -1px; width: 5px; height: 4px; background: #ef4444; transform: translateZ(6px); border-radius: 2px; box-shadow: 0 3px 10px #ef4444;"></div>
                <div style="position: absolute; right: 3px; bottom: -1px; width: 5px; height: 4px; background: #ef4444; transform: translateZ(6px); border-radius: 2px; box-shadow: 0 3px 10px #ef4444;"></div>
            </div>`;
        }
    };

    const mapTileUrls = {
        'google-satellite': 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
        'google-street': 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
        'google-hybrid': 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
        'carto-dark': 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
    };

    useEffect(() => {
        animStateRef.current.isMounted = true;
        return () => {
            animStateRef.current.isMounted = false;
            if (animStateRef.current.frameId) cancelAnimationFrame(animStateRef.current.frameId);
            if (animStateRef.current.recorder && animStateRef.current.recorder.state === 'recording') animStateRef.current.recorder.stop();
            if (animStateRef.current.map) animStateRef.current.map.remove();
        };
    }, []);

    useEffect(() => {
        animStateRef.current.isPlaying = isPlaying;
        animStateRef.current.speed = speed;
        animStateRef.current.vehicleType = vehicleType;
        animStateRef.current.status = status;
        
        const iconDiv = document.getElementById('maplibre-vehicle-icon') || document.getElementById('leaflet-vehicle-icon');
        if (iconDiv) {
            iconDiv.innerHTML = getVehicle3DHtml(vehicleType);
        }
    }, [isPlaying, speed, vehicleType, status]);

    const stopAnimation = () => {
        if (animStateRef.current.frameId) cancelAnimationFrame(animStateRef.current.frameId);
        if (animStateRef.current.recorder && animStateRef.current.recorder.state === 'recording') animStateRef.current.recorder.stop();
        if (animStateRef.current.map) {
            animStateRef.current.map.remove();
            animStateRef.current.map = null;
        }
        setStatus('menu');
        setProgress(0);
        setIsPlaying(true);
    };

    const start3DProcess = async (mode) => {
        if (!road || !road.realGps || road.realGps.length < 2) { 
            setStatus('error'); setErrorMessage('Data rute GPS tidak valid atau kurang dari 2 titik.'); return; 
        }

        setStatus('loading');
        setProgress(0);
        setIsPlaying(mode === 'auto');

        const points = road.realGps;
        let cumulativeDistances = [0];
        let totalDist = 0;
        for (let i = 1; i < points.length; i++) {
            totalDist += getDistanceMeters(points[i-1].lat, points[i-1].lng, points[i].lat, points[i].lng);
            cumulativeDistances.push(totalDist);
        }

        let isMapLibreLoaded = !!window.maplibregl;
        if (!isMapLibreLoaded) {
            try {
                if (!document.querySelector('link[href*="maplibre-gl.css"]')) {
                    const link = document.createElement('link'); link.rel = 'stylesheet'; 
                    link.href = 'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css'; 
                    document.head.appendChild(link);
                }
                isMapLibreLoaded = await new Promise(resolve => {
                    const script = document.createElement('script');
                    script.src = 'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js';
                    script.onload = () => resolve(true);
                    script.onerror = () => {
                        const script2 = document.createElement('script');
                        script2.src = 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/3.6.2/maplibre-gl.js';
                        script2.onload = () => resolve(true);
                        script2.onerror = () => resolve(false);
                        document.head.appendChild(script2);
                    };
                    document.head.appendChild(script);
                });
            } catch (e) { isMapLibreLoaded = false; }
        }

        if (!animStateRef.current.isMounted) return;

        if (!isMapLibreLoaded || !window.maplibregl) {
            if (mode === 'auto') {
                setStatus('error'); setErrorMessage('Mode Otomatis (.webm) butuh 3D Engine. Silakan pilih Mode Sinematik untuk tampilan Darurat 2D.'); return;
            }
            if (!window.L) {
                setStatus('error'); setErrorMessage('Sistem peta utama gagal dimuat. Periksa internet Anda.'); return;
            }

            setIs2DMode(true);
            setStatus('presenting');
            
            const map = window.L.map(mapContainerRef.current, { zoomControl: false, dragging: false, scrollWheelZoom: false, attributionControl: false }).setView([points[0].lat, points[0].lng], 18);
            window.L.tileLayer(mapTileUrls[selectedMapStyle], { maxZoom: 22, maxNativeZoom: 20 }).addTo(map);
            
            const latlngs = points.map(p => [p.lat, p.lng]);
            window.L.polyline(latlngs, { color: getConditionColor(road.condition), weight: 14, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }).addTo(map);
            animStateRef.current.map = map;

            const midPoint = points[Math.floor(points.length / 2)];
            const staticLabelIcon = window.L.divIcon({
                className: 'static-route-label',
                html: `<div style="position: relative; width: 0; height: 0; pointer-events: none;"><div style="position: absolute; width: 8px; height: 8px; background: #ffffff; border: 2.5px solid #3b82f6; border-radius: 50%; transform: translate(-50%, -50%); z-index: 2; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"></div><svg style="position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; z-index: 1;"><line x1="0" y1="0" x2="40" y2="-45" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" opacity="0.9" /></svg><div style="position: absolute; transform: translate(calc(40px + 3px), calc(-45px - 50%)); background-color: #3b82f6; color: #ffffff; padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: 800; white-space: nowrap; box-shadow: 0 4px 8px rgba(0,0,0,0.25); z-index: 3; text-transform: uppercase; border: 1px solid rgba(255,255,255,0.4);">${road.name}</div></div>`,
                iconSize: [0, 0], iconAnchor: [0, 0]
            });
            window.L.marker([midPoint.lat, midPoint.lng], { icon: staticLabelIcon, interactive: false }).addTo(map);

            let currentSmoothBearing = getBearing(points[0].lat, points[0].lng, points[1].lat, points[1].lng);
            
            const fallbackIcon = window.L.divIcon({
                className: 'fallback-vehicle',
                html: `<div id="leaflet-vehicle-icon" style="width: 100%; height: 100%; transform-origin: center center; transition: transform 0.1s linear; transform: rotate(${currentSmoothBearing}deg);">${getVehicle3DHtml(animStateRef.current.vehicleType)}</div>`,
                iconSize: [40, 40],
                iconAnchor: [20, 20]
            });
            const fallbackMarker = window.L.marker([points[0].lat, points[0].lng], { icon: fallbackIcon, zIndexOffset: 1000 }).addTo(map);

            let lastTime = null;
            let currentProgress = 0;
            const animateFallback = (timestamp) => {
                if (!lastTime) lastTime = timestamp;
                const dt = timestamp - lastTime;
                lastTime = timestamp;

                if (!animStateRef.current.isMounted || animStateRef.current.status !== 'presenting') return;

                if (animStateRef.current.isPlaying) {
                    const baseDuration = Math.min(30000, Math.max(10000, totalDist * 15));
                    const actualDuration = baseDuration / animStateRef.current.speed;
                    currentProgress += dt / actualDuration;
                    
                    if (currentProgress > 1) currentProgress = 1;
                    setProgress(Math.round(currentProgress * 100));

                    const targetDist = currentProgress * totalDist;
                    let i = 0; while (i < cumulativeDistances.length - 1 && cumulativeDistances[i + 1] < targetDist) { i++; }
                    const p1 = points[i]; const p2 = points[Math.min(i + 1, points.length - 1)];
                    const segDist = getDistanceMeters(p1.lat, p1.lng, p2.lat, p2.lng);
                    const segProgress = segDist === 0 ? 0 : (targetDist - cumulativeDistances[i]) / segDist;
                    
                    const currentLat = p1.lat + (p2.lat - p1.lat) * segProgress; 
                    const currentLng = p1.lng + (p2.lng - p1.lng) * segProgress;
                    
                    if (i < points.length - 1) {
                        let diff = getBearing(p1.lat, p1.lng, p2.lat, p2.lng) - currentSmoothBearing;
                        if (diff > 180) diff -= 360; if (diff < -180) diff += 360;
                        currentSmoothBearing += diff * 0.08; 
                    }

                    map.setView([currentLat, currentLng], 18.5, { animate: false });
                    fallbackMarker.setLatLng([currentLat, currentLng]);
                    const iconDiv = document.getElementById('leaflet-vehicle-icon');
                    if (iconDiv) iconDiv.style.transform = `rotate(${currentSmoothBearing}deg)`;
                }
                
                if (currentProgress < 1) { 
                    animStateRef.current.frameId = requestAnimationFrame(animateFallback); 
                } else { 
                    setTimeout(() => { if(animStateRef.current.isMounted) setIsPlaying(false); }, 500); 
                }
            };
            setTimeout(() => { if(animStateRef.current.isMounted) animStateRef.current.frameId = requestAnimationFrame(animateFallback); }, 500);
            return;
        }

        try {
            const map = new window.maplibregl.Map({
                container: mapContainerRef.current,
                style: {
                    version: 8,
                    sources: { 'satellite': { type: 'raster', tiles: [mapTileUrls[selectedMapStyle]], tileSize: 256, maxzoom: 20 } },
                    layers: [{ id: 'satellite', type: 'raster', source: 'satellite', minzoom: 0, maxzoom: 24 }]
                },
                center: [points[0].lng, points[0].lat],
                zoom: 18.5, pitch: 70, 
                bearing: getBearing(points[0].lat, points[0].lng, points[1].lat, points[1].lng),
                interactive: false, preserveDrawingBuffer: mode === 'auto'
            });

            animStateRef.current.map = map;

            map.on('load', () => {
                if (!animStateRef.current.isMounted) return;
                map.addSource('route', { 'type': 'geojson', 'data': { 'type': 'Feature', 'properties': {}, 'geometry': { 'type': 'LineString', 'coordinates': points.map(p => [p.lng, p.lat]) } } });
                map.addLayer({ 'id': 'route', 'type': 'line', 'source': 'route', 'layout': { 'line-join': 'round', 'line-cap': 'round' }, 'paint': { 'line-color': getConditionColor(road.condition), 'line-width': mode === 'presenting' ? 16 : 12, 'line-opacity': 0.8 } });

                let recordedChunks = [];
                let lastTimeAuto = null; let currentProgressAuto = 0;
                const duration = Math.min(30000, Math.max(10000, totalDist * 15)); 
                let currentSmoothBearing = getBearing(points[0].lat, points[0].lng, points[1].lat, points[1].lng);

                let vehicleMarker = null;

                if (mode === 'auto') {
                    try {
                        const createVehicleImage = (type) => {
                            const size = 80;
                            const canvas = document.createElement('canvas');
                            canvas.width = size;
                            canvas.height = size;
                            const ctx = canvas.getContext('2d', { willReadFrequently: true });
                            ctx.translate(size / 2, size / 2);
                            
                            if (type === 'car') {
                                ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
                                ctx.fillStyle = '#1e293b'; ctx.fillRect(-10, -18, 20, 36); 
                                ctx.fillStyle = '#2563eb'; ctx.fillRect(-8, -16, 16, 32); 
                                ctx.fillStyle = '#0f172a'; ctx.fillRect(-6, -8, 12, 16); 
                                ctx.fillStyle = '#fef08a'; ctx.fillRect(-8, -17, 4, 3); ctx.fillRect(4, -17, 4, 3); 
                                ctx.fillStyle = '#ef4444'; ctx.fillRect(-8, 14, 4, 3); ctx.fillRect(4, 14, 4, 3); 
                            } else if (type === 'motorcycle') {
                                ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
                                ctx.fillStyle = '#1e293b'; ctx.fillRect(-4, -12, 8, 24);
                                ctx.fillStyle = '#ef4444'; ctx.fillRect(-2, -6, 4, 12);
                                ctx.fillStyle = '#fef08a'; ctx.beginPath(); ctx.arc(0, -10, 3, 0, 2*Math.PI); ctx.fill();
                            } else if (type === 'truck') {
                                ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 6;
                                ctx.fillStyle = '#334155'; ctx.fillRect(-14, -28, 28, 56);
                                ctx.fillStyle = '#cbd5e1'; ctx.fillRect(-12, -10, 24, 36);
                                ctx.fillStyle = '#eab308'; ctx.fillRect(-12, -26, 24, 14);
                                ctx.fillStyle = '#0f172a'; ctx.fillRect(-10, -20, 20, 6);
                            } else if (type === 'runner') {
                                ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 4;
                                ctx.translate(0, -2); ctx.fillStyle = '#fcd34d'; ctx.rotate(15 * Math.PI / 180); ctx.fillRect(-12, -2, 24, 4); ctx.rotate(-15 * Math.PI / 180); ctx.translate(0, 2);
                                ctx.fillStyle = '#1e293b'; ctx.fillRect(-5, -5, 4, 7); ctx.fillRect(1, 1, 4, 7);
                                ctx.fillStyle = '#ef4444'; ctx.fillRect(-6, -4, 12, 8);
                                ctx.fillStyle = '#fcd34d'; ctx.beginPath(); ctx.arc(0, -2, 5, 0, 2*Math.PI); ctx.fill();
                                ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(0, -3, 4, 0, 2*Math.PI); ctx.fill();
                            } else { // drone
                                ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 8;
                                ctx.fillStyle = '#cbd5e1'; ctx.fillRect(-2, -16, 4, 32); ctx.fillRect(-16, -2, 32, 4);
                                ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, 2*Math.PI); ctx.fill();
                                ctx.fillStyle = '#0f172a';
                                [[-16,-16], [16,-16], [-16,16], [16,16]].forEach(([dx,dy]) => {
                                    ctx.beginPath(); ctx.arc(dx, dy, 7, 0, 2*Math.PI); ctx.fill();
                                    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(dx, dy, 4, 0, 2*Math.PI); ctx.fill(); ctx.fillStyle = '#0f172a';
                                });
                            }
                            
                            const imageData = ctx.getImageData(0, 0, size, size);
                            return { width: size, height: size, data: new Uint8Array(imageData.data.buffer) };
                        };

                        map.addImage('vehicle-icon', createVehicleImage(animStateRef.current.vehicleType));
                        map.addSource('vehicle', {
                            type: 'geojson',
                            data: { type: 'Feature', properties: { bearing: currentSmoothBearing }, geometry: { type: 'Point', coordinates: [points[0].lng, points[0].lat] } }
                        });
                        map.addLayer({
                            id: 'vehicle-layer',
                            type: 'symbol',
                            source: 'vehicle',
                            layout: {
                                'icon-image': 'vehicle-icon',
                                'icon-size': 1.5,
                                'icon-rotation-alignment': 'map',
                                'icon-rotate': ['get', 'bearing'],
                                'icon-allow-overlap': true,
                                'icon-ignore-placement': true
                            }
                        });

                        const outCanvas = document.createElement('canvas'); outCanvas.width = 1920; outCanvas.height = 1080; 
                        const ctx = outCanvas.getContext('2d'); const mapCanvas = map.getCanvas();
                        const stream = outCanvas.captureStream ? outCanvas.captureStream(30) : (outCanvas.mozCaptureStream ? outCanvas.mozCaptureStream(30) : null);
                        if (!stream) throw new Error("Browser tidak mendukung tangkapan layar internal.");
                        const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm; codecs=vp9') ? 'video/webm; codecs=vp9' : 'video/webm' });
                        animStateRef.current.recorder = recorder;

                        recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
                        recorder.onstop = () => {
                            if (!animStateRef.current.isMounted) return;
                            if (recordedChunks.length === 0) { setStatus('error'); setErrorMessage('Video kosong (0 bytes). Browser memblokir penyimpanan.'); return; }
                            const url = URL.createObjectURL(new Blob(recordedChunks, { type: 'video/webm' }));
                            setDownloadUrl(url); setStatus('finished');
                            const a = document.createElement('a'); a.href = url; a.download = `DroneView_${road.name.replace(/\s+/g, '_')}.webm`; 
                            document.body.appendChild(a); a.click(); document.body.removeChild(a);
                        };

                        recorder.start(); setStatus('recording');

                        const animateAuto = (timestamp) => {
                            if (!lastTimeAuto) lastTimeAuto = timestamp;
                            const dt = timestamp - lastTimeAuto; lastTimeAuto = timestamp;
                            if (!animStateRef.current.isMounted) return;

                            const actualDuration = duration / animStateRef.current.speed;
                            currentProgressAuto += dt / actualDuration;
                            if (currentProgressAuto > 1) currentProgressAuto = 1;
                            setProgress(Math.round(currentProgressAuto * 100));

                            const targetDist = currentProgressAuto * totalDist;
                            let i = 0; while (i < cumulativeDistances.length - 1 && cumulativeDistances[i + 1] < targetDist) { i++; }
                            const p1 = points[i]; const p2 = points[Math.min(i + 1, points.length - 1)];
                            const segDist = getDistanceMeters(p1.lat, p1.lng, p2.lat, p2.lng);
                            const segProgress = segDist === 0 ? 0 : (targetDist - cumulativeDistances[i]) / segDist;
                            const currentLat = p1.lat + (p2.lat - p1.lat) * segProgress; const currentLng = p1.lng + (p2.lng - p1.lng) * segProgress;
                            
                            if (i < points.length - 1) {
                                let diff = getBearing(p1.lat, p1.lng, p2.lat, p2.lng) - currentSmoothBearing;
                                if (diff > 180) diff -= 360; if (diff < -180) diff += 360;
                                currentSmoothBearing += diff * 0.08; 
                            }

                            let pitch = 70; let zoom = 19;
                            if (animStateRef.current.vehicleType === 'drone') { pitch = 60; zoom = 18.5; }
                            else if (animStateRef.current.vehicleType === 'runner') { pitch = 65; zoom = 19.5; }
                            
                            map.getSource('vehicle').setData({
                                type: 'Feature',
                                properties: { bearing: currentSmoothBearing },
                                geometry: { type: 'Point', coordinates: [currentLng, currentLat] }
                            });
                            
                            map.jumpTo({ center: [currentLng, currentLat], bearing: currentSmoothBearing, pitch: pitch, zoom: zoom });
                            
                            try {
                                ctx.drawImage(mapCanvas, 0, 0, 1920, 1080);
                                const grad = ctx.createLinearGradient(0, 750, 0, 1080); 
                                grad.addColorStop(0, 'transparent'); 
                                grad.addColorStop(1, 'rgba(15,23,42,0.95)'); 
                                ctx.fillStyle = grad; 
                                ctx.fillRect(0, 750, 1920, 330);
                                
                                ctx.fillStyle = '#ffffff'; 
                                ctx.font = 'bold 64px sans-serif'; 
                                ctx.fillText(`${road.name.toUpperCase()}`, 75, 945);
                                
                                ctx.font = '36px sans-serif'; 
                                ctx.fillStyle = '#cbd5e1'; 
                                ctx.fillText(`Kondisi: ${road.condition} • Panjang: ${(totalDist/1000).toFixed(2)} km`, 75, 1012);
                                
                                ctx.fillStyle = getConditionColor(road.condition); 
                                ctx.fillRect(0, 1065, 1920 * currentProgressAuto, 15);
                            } catch (err) { throw new Error("Browser memblokir render visual (Tainted Canvas)."); }

                            if (currentProgressAuto < 1) { animStateRef.current.frameId = requestAnimationFrame(animateAuto); } 
                            else { setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 1000); }
                        };
                        animStateRef.current.frameId = requestAnimationFrame(animateAuto);
                    } catch (err) { setStatus('error'); setErrorMessage(err.message + " Gunakan Mode Sinematik untuk kepastian 100%."); }
                } else {
                    const midPoint = points[Math.floor(points.length / 2)];
                    const labelEl = document.createElement('div');
                    labelEl.innerHTML = `<div style="position: relative; width: 0; height: 0; pointer-events: none;"><div style="position: absolute; width: 8px; height: 8px; background: #ffffff; border: 2.5px solid #3b82f6; border-radius: 50%; transform: translate(-50%, -50%); z-index: 2; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"></div><svg style="position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; z-index: 1;"><line x1="0" y1="0" x2="40" y2="-45" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" opacity="0.9" /></svg><div style="position: absolute; transform: translate(calc(40px + 3px), calc(-45px - 50%)); background-color: #3b82f6; color: #ffffff; padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: 800; white-space: nowrap; box-shadow: 0 4px 8px rgba(0,0,0,0.25); z-index: 3; text-transform: uppercase; border: 1px solid rgba(255,255,255,0.4);">${road.name}</div></div>`;
                    new window.maplibregl.Marker({ element: labelEl }).setLngLat([midPoint.lng, midPoint.lat]).addTo(map);

                    const el = document.createElement('div'); el.style.width = '40px'; el.style.height = '40px';
                    el.innerHTML = `<div id="maplibre-vehicle-icon" style="width: 100%; height: 100%; transform-origin: center center; transition: transform 0.1s linear; transform: rotate(${currentSmoothBearing}deg);">${getVehicle3DHtml(animStateRef.current.vehicleType)}</div>`;
                    vehicleMarker = new window.maplibregl.Marker({ element: el, pitchAlignment: 'map', rotationAlignment: 'map' }).setLngLat([points[0].lng, points[0].lat]).addTo(map);

                    setStatus('presenting');
                    let lastTime = null; let currentProgress = 0;
                    const animatePresent = (timestamp) => {
                        if (!lastTime) lastTime = timestamp;
                        const dt = timestamp - lastTime; lastTime = timestamp;
                        if (!animStateRef.current.isMounted || animStateRef.current.status !== 'presenting') return;

                        if (animStateRef.current.isPlaying) {
                            const baseDuration = Math.min(30000, Math.max(10000, totalDist * 15));
                            const actualDuration = baseDuration / animStateRef.current.speed;
                            currentProgress += dt / actualDuration;
                            if (currentProgress > 1) currentProgress = 1;
                            setProgress(Math.round(currentProgress * 100));

                            const targetDist = currentProgress * totalDist;
                            let i = 0; while (i < cumulativeDistances.length - 1 && cumulativeDistances[i + 1] < targetDist) { i++; }
                            const p1 = points[i]; const p2 = points[Math.min(i + 1, points.length - 1)];
                            const segDist = getDistanceMeters(p1.lat, p1.lng, p2.lat, p2.lng);
                            const segProgress = segDist === 0 ? 0 : (targetDist - cumulativeDistances[i]) / segDist;
                            const currentLat = p1.lat + (p2.lat - p1.lat) * segProgress; const currentLng = p1.lng + (p2.lng - p1.lng) * segProgress;
                            
                            if (i < points.length - 1) {
                                let diff = getBearing(p1.lat, p1.lng, p2.lat, p2.lng) - currentSmoothBearing;
                                if (diff > 180) diff -= 360; if (diff < -180) diff += 360;
                                currentSmoothBearing += diff * 0.08; 
                            }

                            let pitch = 70; let zoom = 19;
                            if (animStateRef.current.vehicleType === 'drone') { pitch = 60; zoom = 18.5; }
                            else if (animStateRef.current.vehicleType === 'runner') { pitch = 65; zoom = 19.5; }
                            map.jumpTo({ center: [currentLng, currentLat], bearing: currentSmoothBearing, pitch: pitch, zoom: zoom });
                            vehicleMarker.setLngLat([currentLng, currentLat]);
                            const iconDiv = document.getElementById('maplibre-vehicle-icon');
                            if (iconDiv) iconDiv.style.transform = `rotate(${currentSmoothBearing}deg)`;
                        }

                        if (currentProgress < 1) { animStateRef.current.frameId = requestAnimationFrame(animatePresent); } 
                        else { setTimeout(() => { if(animStateRef.current.isMounted) setIsPlaying(false); }, 500); }
                    };
                    setTimeout(() => { if(animStateRef.current.isMounted) animStateRef.current.frameId = requestAnimationFrame(animatePresent); }, 500);
                }
            });
        } catch (err) { setStatus('error'); setErrorMessage('Terjadi kesalahan saat memuat peta 3D.'); }
    };

    return (
        <div className="fixed inset-0 z-[9999] bg-slate-900 flex flex-col items-center justify-center overflow-hidden">
            <div className={`absolute inset-0 w-full h-full transition-opacity duration-500 ${status === 'presenting' || status === 'recording' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <div ref={mapContainerRef} className="w-full h-full bg-black"></div>
                {status === 'presenting' && (
                    <>
                        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-black/80 to-transparent z-10 pointer-events-none"></div>
                        <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-30 flex items-center gap-2 md:gap-4 bg-black/60 backdrop-blur-md px-4 py-2 md:px-6 md:py-3 rounded-full border border-white/20 shadow-2xl transition-opacity duration-300">
                            <button onClick={() => setIsPlaying(!isPlaying)} className={`w-10 h-10 flex items-center justify-center rounded-full text-white transition-colors ${isPlaying ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}>
                                {isPlaying ? (
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                                ) : (
                                    <svg className="w-5 h-5 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                )}
                            </button>
                            <button onClick={stopAnimation} className="w-10 h-10 flex items-center justify-center rounded-full bg-rose-600 hover:bg-rose-700 text-white transition-colors shadow-sm" title="Stop & Kembali">
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>
                            </button>
                            <div className="w-px h-8 bg-white/20 mx-1"></div>
                            <select value={speed} onChange={e => setSpeed(parseFloat(e.target.value))} className="bg-white/10 hover:bg-white/20 text-white text-xs md:text-sm font-bold outline-none cursor-pointer rounded-lg px-2 py-1.5 border border-white/10 appearance-none text-center">
                                <option value="0.5" className="text-black">🐢 0.5x</option>
                                <option value="1" className="text-black">▶️ 1.0x</option>
                                <option value="2" className="text-black">🐇 2.0x</option>
                                <option value="3" className="text-black">⚡ 3.0x</option>
                            </select>
                            <select value={vehicleType} onChange={e => setVehicleType(e.target.value)} className="bg-white/10 hover:bg-white/20 text-white text-xs md:text-sm font-bold outline-none cursor-pointer rounded-lg px-2 py-1.5 border border-white/10 appearance-none text-center">
                                <option value="car" className="text-black">🚗 Mobil 3D</option>
                                <option value="motorcycle" className="text-black">🏍️ Motor 3D</option>
                                <option value="truck" className="text-black">🚛 Truk 3D</option>
                                <option value="drone" className="text-black">🚁 Drone 3D</option>
                                <option value="runner" className="text-black">🏃 Orang Lari 3D</option>
                            </select>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-black via-black/70 to-transparent z-10 pointer-events-none"></div>
                        <div className="absolute bottom-8 left-8 right-8 z-20 flex flex-col md:flex-row justify-between items-end gap-4 pointer-events-none">
                            <div>
                                <h2 className="text-4xl md:text-5xl font-black text-white drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] mb-2 uppercase">{road.name}</h2>
                                <div className="flex gap-4 items-center">
                                    <span className="px-3 py-1 rounded-full text-white text-sm font-bold shadow-lg" style={{backgroundColor: getConditionColor(road.condition)}}>{road.condition}</span>
                                    <span className="text-white text-lg font-bold drop-shadow-md">{formatKel(road.kelurahan)} • {(road.length || 0)} km</span>
                                    {is2DMode && <span className="bg-slate-700 text-white px-2 py-0.5 rounded text-xs opacity-70">Top-Down 2D Mode</span>}
                                </div>
                            </div>
                            <div className="w-full md:w-1/3 max-w-sm pointer-events-auto">
                                <div className="flex justify-between text-xs text-slate-300 font-bold mb-1"><span>Titik Awal</span><span>Tujuan</span></div>
                                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700"><div className="h-full rounded-full transition-all duration-300" style={{ width: `${progress}%`, backgroundColor: getConditionColor(road.condition) }}></div></div>
                            </div>
                        </div>

                        <button onClick={() => { stopAnimation(); onClose(); }} className="absolute top-6 right-6 z-30 bg-black/50 hover:bg-rose-600 text-white p-3 rounded-full backdrop-blur-md border border-white/20 transition-colors shadow-lg">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </>
                )}
            </div>

            {status !== 'presenting' && (
                <div className="relative z-50 bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 animate-fade-in-up m-4">
                    {status === 'menu' && (
                        <div className="p-8">
                            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z" /></svg>
                            </div>
                            
                            <div className="mb-5">
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 text-center">Pilihan Peta Dasar</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={() => setSelectedMapStyle('google-satellite')} className={`p-2.5 rounded-xl border text-xs font-bold transition-colors ${selectedMapStyle === 'google-satellite' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>🌍 Satelit</button>
                                    <button onClick={() => setSelectedMapStyle('google-street')} className={`p-2.5 rounded-xl border text-xs font-bold transition-colors ${selectedMapStyle === 'google-street' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>🗺️ Jalan (Map)</button>
                                    <button onClick={() => setSelectedMapStyle('google-hybrid')} className={`p-2.5 rounded-xl border text-xs font-bold transition-colors ${selectedMapStyle === 'google-hybrid' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>🏷️ Satelit + Label</button>
                                    <button onClick={() => setSelectedMapStyle('carto-dark')} className={`p-2.5 rounded-xl border text-xs font-bold transition-colors ${selectedMapStyle === 'carto-dark' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>🌙 Mode Gelap</button>
                                </div>
                            </div>

                            <p className="text-slate-500 text-center text-[13px] mb-4 leading-relaxed">Sistem akan secara otomatis menjalankan Mode Animasi. Jika 3D dicegat oleh browser Anda, sistem akan memutar mode Cinematic 2D yang elegan.</p>
                            
                            <div className="space-y-3">
                                <button onClick={() => start3DProcess('presenting')} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-2xl text-left flex items-start gap-4 transition-all shadow-md group">
                                    <div className="bg-white/20 p-2 rounded-xl group-hover:scale-110 transition-transform">📺</div>
                                    <div>
                                        <div className="font-bold text-sm md:text-base">Mode Sinematik (Paling Aman)</div>
                                        <div className="text-xs text-indigo-200 mt-1 font-medium">Animasi diputar otomatis layar penuh. Aktifkan Perekam Layar (Screen Record) HP/Laptop Anda.</div>
                                    </div>
                                </button>
                                <button onClick={() => start3DProcess('auto')} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 p-4 rounded-2xl text-left flex items-start gap-4 border border-slate-300 transition-all group">
                                    <div className="bg-white p-2 rounded-xl shadow-sm group-hover:scale-110 transition-transform text-slate-500">⚙️</div>
                                    <div>
                                        <div className="font-bold text-sm md:text-base">Coba Simpan Otomatis (.webm)</div>
                                        <div className="text-xs text-slate-500 mt-1">Sistem mencoba membuat video internal. Terkadang gagal akibat restriksi izin perekaman browser.</div>
                                    </div>
                                </button>
                            </div>
                            <button onClick={onClose} className="w-full mt-4 py-3 text-slate-500 font-bold text-sm hover:bg-slate-50 rounded-xl transition-colors">Batal</button>
                        </div>
                    )}

                    {(status === 'loading' || status === 'recording') && (
                        <div className="p-10 flex flex-col items-center justify-center">
                            <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-6"></div>
                            <h2 className="text-xl font-black text-slate-900 mb-2">{status === 'loading' ? 'Menyiapkan Peta Cinematic...' : 'Merekam Video Internal...'}</h2>
                            {status === 'recording' && (
                                <div className="w-full max-w-xs mt-4">
                                    <div className="flex justify-between text-xs text-slate-500 font-bold mb-1"><span>Proses Render</span><span>{progress}%</span></div>
                                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200"><div className="h-full bg-indigo-600 transition-all duration-300" style={{ width: `${progress}%` }}></div></div>
                                </div>
                            )}
                        </div>
                    )}

                    {status === 'finished' && (
                        <div className="p-10 text-center">
                            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="w-10 h-10"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                            </div>
                            <h2 className="text-2xl font-black text-slate-900 mb-2">Selesai!</h2>
                            <p className="text-slate-500 mb-6 font-medium text-sm">Proses animasi telah berakhir.</p>
                            <div className="flex gap-3 justify-center">
                                {downloadUrl && <a href={downloadUrl} download={`DroneView_${road.name.replace(/\s+/g, '_')}.webm`} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl transition-colors shadow-md">Unduh Video</a>}
                                <button onClick={onClose} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-6 rounded-xl transition-colors">Kembali</button>
                            </div>
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="p-8 text-center">
                            <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            </div>
                            <h2 className="text-xl font-black text-slate-900 mb-2">Gagal Merekam Internal</h2>
                            <p className="text-slate-600 mb-6 text-sm bg-rose-50 p-3 rounded-lg border border-rose-100 inline-block">{errorMessage}</p>
                            <div className="flex flex-col gap-3">
                                <button onClick={() => start3DProcess('presenting')} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl transition-colors shadow-md flex justify-center items-center gap-2">📺 Gunakan Mode Sinematik Saja</button>
                                <button onClick={onClose} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-6 rounded-xl transition-colors">Batal</button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default function App() {
  const [appRole, setAppRole] = useState(null); 
  const [mobileScreen, setMobileScreen] = useState('home'); 
  const [selectedRoad, setSelectedRoad] = useState(null);
  const [supabase, setSupabase] = useState(null);
  const [isDbConnected, setIsDbConnected] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', actionLabel: '', onConfirm: null, isDanger: true });

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

  const initialKelurahanState = KELURAHAN_LIST.reduce((acc, kel) => { acc[kel] = true; return acc; }, {});
  const [searchQuery, setSearchQuery] = useState('');
  const [activeKelurahan, setActiveKelurahan] = useState(initialKelurahanState);
  const [activeConditions, setActiveConditions] = useState({ 'Baik': true, 'Rusak Ringan': true, 'Rusak Sedang': true, 'Rusak Parah': true });
  const [activeJenis, setActiveJenis] = useState({ 'Aspal': true, 'Beton': true, 'Tanah': true });
  const [expandedSection, setExpandedSection] = useState(null); 
  const [sortConfig, setSortConfig] = useState('date_desc'); 

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

  const [isExportingDroneVideo, setIsExportingDroneVideo] = useState(false);
  const [isVideoFullscreen, setIsVideoFullscreen] = useState(false); 

  useEffect(() => { animationSpeedRef.current = animationSpeedMultiplier; }, [animationSpeedMultiplier]);
  useEffect(() => { isAnimPausedRef.current = isAnimPaused; }, [isAnimPaused]);

  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768);

  const adminMapContainerRef = useRef(null);
  const adminMapInstanceRef = useRef(null);
  const adminLayerGroupRef = useRef(null);
  const adminHighlightLayerGroupRef = useRef(null);
  const hasFittedAdminMapRef = useRef(false);
  const prevAdminSelectionCountRef = useRef(0);

  useEffect(() => {
      if (appRole === 'admin') hasFittedAdminMapRef.current = false;
  }, [appRole, searchQuery, activeKelurahan, activeConditions, activeJenis]);

  useEffect(() => {
    if (!selectedRoad) {
      setHighlightedRoadId(null); 
      setIsVideoFullscreen(false); 
      if (adminMapInstanceRef.current) adminMapInstanceRef.current.closePopup();
    } else {
      setHighlightedRoadId(selectedRoad.id || selectedRoad.dbId); 
    }
  }, [selectedRoad]);

  const toggleAdminRouteSelection = (id) => { setSelectedAdminRouteIds(prev => prev.includes(id) ? prev.filter(rId => rId !== id) : [...prev, id]); };
  const closeAdminModal = () => { setIsVideoFullscreen(false); if (window.location.hash === '#/admin/detail') window.history.back(); else setSelectedRoad(null); };

  const filteredRoads = syncedRoads.filter(road => {
    const matchKel = road.kelurahan ? activeKelurahan[road.kelurahan] !== false : true;
    const matchCond = activeConditions[road.condition] !== false;
    const matchJenis = activeJenis[road.jenisJalan || 'Aspal'] !== false;
    const matchSearch = road.name.toLowerCase().includes(searchQuery.toLowerCase()) || (road.kelurahan && road.kelurahan.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchKel && matchCond && matchJenis && matchSearch;
  });

  const searchedRoads = syncedRoads.filter(road => {
    return road.name.toLowerCase().includes(searchQuery.toLowerCase()) || (road.kelurahan && road.kelurahan.toLowerCase().includes(searchQuery.toLowerCase()));
  });

  const sortedRoads = [...searchedRoads].sort((a, b) => {
      if (sortConfig === 'name_asc') return a.name.localeCompare(b.name);
      if (sortConfig === 'name_desc') return b.name.localeCompare(a.name);
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (sortConfig === 'date_asc') return dateA - dateB;
      return dateB - dateA;
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

  // Status map 
  const [isLeafletLoaded, setIsLeafletLoaded] = useState(false);

  // Gunakan Fetch Loader yang aman untuk mengunduh Leaflet
  useEffect(() => {
    const initLeaflet = async () => {
        const success = await loadLibrarySafely(
            'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css',
            [
                'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js',
                'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
                'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
            ],
            'L'
        );
        if (success) {
            setIsLeafletLoaded(true);
        } else {
            console.error("Leaflet gagal diinisialisasi");
        }
    };
    initLeaflet();
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

  useEffect(() => {
    if (appRole !== 'admin' || !isLeafletLoaded || !adminMapContainerRef.current) return;
    
    const map = window.L.map(adminMapContainerRef.current, { zoomControl: false }).setView([-0.425, 117.185], 13);
    window.L.control.zoom({ position: 'topright' }).addTo(map);

    initBaseMaps(map, window.L, "OSM Default", 'topright');
    
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

    // IMPLEMENTASI MODE FOKUS: Hanya tampilkan rute yang dicentang jika ada
    const roadsToDisplay = selectedAdminRouteIds.length > 0 
        ? filteredRoads.filter(road => selectedAdminRouteIds.includes(road.id || road.dbId))
        : filteredRoads;

    roadsToDisplay.forEach(road => {
      const roadId = road.id || road.dbId;
      if (road.realGps && road.realGps.length > 0) {
        const latlngs = road.realGps.map(pt => [pt.lat, pt.lng]);
        
        const polyline = window.L.polyline(latlngs, { color: getConditionColor(road.condition), weight: 5, opacity: 0.65, lineCap: 'round', lineJoin: 'round' }).addTo(layerGroup);
        window.L.circleMarker(latlngs[0], { radius: 3, fillColor: '#10B981', color: '#ffffff', weight: 1.5, fillOpacity: 1 }).addTo(layerGroup);
        window.L.circleMarker(latlngs[latlngs.length - 1], { radius: 3, fillColor: '#EF4444', color: '#ffffff', weight: 1.5, fillOpacity: 1 }).addTo(layerGroup);

        let marker = null;
        if (road.pinLocation && road.pinLocation.lat && road.pinLocation.lng) {
          const thumbUrl = getThumbnailUrl(road);
          const pinIcon = window.L.divIcon({
            className: 'custom-pin-html', 
            html: createPinIconHtml(getConditionColor(road.condition), thumbUrl, 'sm'), // Ubah ukuran ke 'sm' (kecil)
            iconSize: [24, 37], iconAnchor: [12, 37], popupAnchor: [0, -37] // Sesuaikan ukuran iconSize dan anchor
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

    // Deteksi jika pengguna baru saja mematikan mode fokus sepenuhnya (centang terakhir dilepas)
    const justExitedFocusMode = prevAdminSelectionCountRef.current > 0 && selectedAdminRouteIds.length === 0;
    prevAdminSelectionCountRef.current = selectedAdminRouteIds.length;

    // AUTO-ZOOM (FOKUS) LOGIC:
    if (roadsToDisplay.length > 0 && map) {
      const allLatLngs = roadsToDisplay.flatMap(r => r.realGps.map(pt => [pt.lat, pt.lng]));
      if (allLatLngs.length > 0) { 
        // Selalu zoom in jika rute dicentang (mode fokus), dimuat awal, ATAU zoom out jika fokus baru saja dimatikan
        if (selectedAdminRouteIds.length > 0 || !hasFittedAdminMapRef.current || justExitedFocusMode) {
          hasFittedAdminMapRef.current = true;
          setTimeout(() => {
              if (adminMapInstanceRef.current) {
                  adminMapInstanceRef.current.invalidateSize(true);
                  // Menggunakan flyToBounds agar transisi kamera / auto-zoom terasa mulus
                  adminMapInstanceRef.current.flyToBounds(window.L.latLngBounds(allLatLngs), { padding: [50, 50], maxZoom: 16, duration: 0.6 });
              }
          }, 350); 
        }
      }
    } else if (roadsToDisplay.length === 0 && map && !hasFittedAdminMapRef.current) {
      hasFittedAdminMapRef.current = true;
      setTimeout(() => {
          if (adminMapInstanceRef.current) {
              adminMapInstanceRef.current.invalidateSize(true);
              adminMapInstanceRef.current.setView([-0.425, 117.185], 13);
          }
      }, 350);
    }
  }, [appRole, syncedRoads, activeKelurahan, activeConditions, activeJenis, searchQuery, selectedAdminRouteIds]);

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

  useEffect(() => {
    let onInteractionStart = null; let onInteractionEnd = null;
    let activeTimeouts = []; let activeMarkers = [];

    if (isAnimatingMap && animatingRoadsList.length > 0 && adminMapInstanceRef.current) {
       const map = adminMapInstanceRef.current;
       let isInteracting = false;

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
           } else if (animIconType === 'truck') {
               iconSize = [24, 60]; iconAnchor = [12, 30];
               vehicleSvg = `<svg viewBox="0 0 40 100" width="100%" height="100%" style="filter: drop-shadow(0 6px 8px rgba(0,0,0,0.5));"><rect x="4" y="25" width="32" height="70" rx="4" fill="#64748b"/><rect x="6" y="27" width="28" height="66" rx="2" fill="#94a3b8"/><rect x="6" y="4" width="28" height="20" rx="4" fill="#eab308"/><rect x="8" y="14" width="24" height="6" rx="2" fill="#1e293b"/><rect x="8" y="2" width="6" height="3" rx="1" fill="#fef08a"/><rect x="26" y="2" width="6" height="3" rx="1" fill="#fef08a"/><rect x="2" y="10" width="3" height="8" rx="1" fill="#0f172a"/><rect x="35" y="10" width="3" height="8" rx="1" fill="#0f172a"/><rect x="2" y="35" width="3" height="12" rx="1" fill="#0f172a"/><rect x="35" y="35" width="3" height="12" rx="1" fill="#0f172a"/><rect x="2" y="75" width="3" height="12" rx="1" fill="#0f172a"/><rect x="35" y="75" width="3" height="12" rx="1" fill="#0f172a"/><rect x="16" y="22" width="8" height="6" fill="#334155"/></svg>`;
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
       if (allRouteBounds.length > 0) {
           const isMobile = window.innerWidth < 768;
           map.fitBounds(window.L.latLngBounds(allRouteBounds), { 
               paddingTopLeft: isMobile ? [20, 40] : [80, 80], paddingBottomRight: isMobile ? [20, 240] : [80, 180], maxZoom: 18
           });
       }
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

  useEffect(() => {
    if (appRole !== 'surveyor' || mobileScreen !== 'draw_map' || !isLeafletLoaded || !drawMapContainerRef.current) return;
    const map = window.L.map(drawMapContainerRef.current); drawMapInstanceRef.current = map;
    initBaseMaps(map, window.L, "OSM Default", 'topleft');
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
    initBaseMaps(map, window.L, "OSM Default", 'topleft');
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
      const thumbUrl = uploadedPhotoUrls.length > 0 ? uploadedPhotoUrls[0] : null; 
      const htmlPin = createPinIconHtml(getConditionColor(formData.condition), thumbUrl, 'md'); // Ubah ukuran ke 'md' (sedang)
      const pinIcon = window.L.divIcon({ className: 'custom-pin-html', html: htmlPin, iconSize: [28, 42], iconAnchor: [14, 42] }); // Sesuaikan ukuran iconSize dan anchor
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


  const startRealHardware = async () => {
    setMobileScreen('record'); 
    window.location.hash = '#/surveyor/record'; 
    setRealGpsPoints([]); setIsRecording(true); 
    setRecordingStatus('locating'); setRecordTab('map'); 
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
    setMobileScreen('draw_map');
    window.location.hash = '#/surveyor/draw_map';
    setManualDrawnPoints([]); setRealGpsPoints([]); setTotalDistance(0); setUploadedVideoUrl(null); setUploadedVideoFile(null); 
    setUploadedPhotoFiles([]); setUploadedPhotoUrls([]); setPinLocation(null); setEditingDraftId(null); 
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
    setRealGpsPoints(manualDrawnPoints); 
    setMobileScreen('form');
    window.location.hash = '#/surveyor/form';
  };

  const stopRealHardware = () => {
    if (locatingTimeoutRef.current) clearTimeout(locatingTimeoutRef.current);
    if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
    if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
    setIsRecording(false); setRecordingStatus('idle'); 
    setMobileScreen('form');
    window.location.hash = '#/surveyor/form';
  };

  const cancelRecording = () => {
    if (locatingTimeoutRef.current) clearTimeout(locatingTimeoutRef.current);
    if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
    if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
    setIsRecording(false); setRecordingStatus('idle'); 
    setMobileScreen('home');
    window.location.hash = '#/surveyor/home';
  };

  useEffect(() => {
    if (mobileScreen !== 'record' || !liveMapContainerRef.current || !isLeafletLoaded || liveMapInstanceRef.current) return;
    const map = window.L.map(liveMapContainerRef.current, { zoomControl: false }).setView([-0.425, 117.185], 16);
    initBaseMaps(map, window.L, "OSM Default", 'topleft');
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

  const handleShareDraft = (draft) => {
    const shareText = `📍 Draft Survei: ${draft.name}\nKelurahan: ${formatKel(draft.kelurahan)}\nKondisi: ${draft.condition}\nPanjang: ${draft.length || 0} km\nCatatan: ${draft.notes || '-'}${draft.pinLocation ? `\nMap: https://www.google.com/maps?q=${draft.pinLocation.lat},${draft.pinLocation.lng}` : ''}`;
    
    if (navigator.share) {
      navigator.share({ title: `Draft: ${draft.name}`, text: shareText }).catch(()=>{});
    } else {
      const textArea = document.createElement("textarea"); textArea.value = shareText; document.body.appendChild(textArea); textArea.select();
      try { document.execCommand('copy'); showToast("Detail draft disalin ke clipboard!"); } catch (err) { showToast("Gagal menyalin."); } document.body.removeChild(textArea);
    }
  };

  // --- NEW: FUNGSI EXPORT DRAFT KE FILE JSON ---
  const handleExportDraftJSON = (draft) => {
    const exportData = {
      app: "WebGIS_Surveyor",
      version: "1.0",
      draft: {
        ...draft,
        videoFile: undefined, // File blob tidak bisa diekspor dalam format JSON standar
        photoFiles: undefined,
        localVideoUrl: undefined,
        localPhotoUrls: undefined
      }
    };
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `Draft_${draft.name.replace(/\s+/g, '_')}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    
    showToast("File JSON diunduh. Kirim file ini ke teman Anda.");
  };

  // --- NEW: FUNGSI IMPORT DRAFT DARI FILE JSON ---
  const handleImportDraftJSON = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedData = JSON.parse(event.target.result);
        if (importedData.app === "WebGIS_Surveyor" && importedData.draft) {
          const newDraft = importedData.draft;
          // Generate ID baru agar tidak menimpa draft yang sudah ada
          newDraft.id = "DRAFT-" + Math.floor(Math.random() * 100000);
          newDraft.isUploaded = false; // Reset status unggah
          setDrafts(prev => [...prev, newDraft]);
          showToast(`✅ Draft "${newDraft.name}" berhasil diimpor!`);
        } else {
          showToast("❌ Format file JSON tidak dikenali.");
        }
      } catch (err) {
        showToast("❌ Gagal membaca file JSON.");
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input agar file yang sama bisa diimpor lagi jika perlu
  };

  const executeDeleteDraft = (id) => {
      setDrafts(prev => prev.filter(d => d.id !== id));
      setSelectedDraftIds(prev => prev.filter(selId => selId !== id)); 
      showToast("Draft dihapus.");
  };

  const deleteDraft = (id) => {
      setConfirmModal({
          isOpen: true,
          title: 'Hapus Draft',
          message: 'Hapus draft offline ini secara permanen?',
          actionLabel: 'Hapus',
          onConfirm: () => executeDeleteDraft(id),
          isDanger: true
      });
  };

  const executeDeleteSelectedDrafts = () => {
      setDrafts(prev => prev.filter(d => !selectedDraftIds.includes(d.id))); 
      setSelectedDraftIds([]); 
      showToast("Draft terpilih dihapus.");
  };

  const deleteSelectedDrafts = () => {
      if (selectedDraftIds.length === 0) return;
      setConfirmModal({
          isOpen: true,
          title: 'Hapus Draft Terpilih',
          message: `Anda yakin ingin menghapus ${selectedDraftIds.length} draft yang dipilih?`,
          actionLabel: 'Hapus',
          onConfirm: () => executeDeleteSelectedDrafts(),
          isDanger: true
      });
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

  const uploadVideoInChunks = async (file) => {
      const chunkSize = 5 * 1024 * 1024; 
      const uniqueUploadId = Math.random().toString(36).substring(2) + Date.now();
      const totalChunks = Math.ceil(file.size / chunkSize);
      let secureUrl = null;

      for (let i = 0; i < totalChunks; i++) {
          setSyncMessage(`Mengunggah Video... (${Math.round(((i) / totalChunks) * 100)}%)`);
          const start = i * chunkSize;
          const end = Math.min(start + chunkSize - 1, file.size - 1);
          const chunk = file.slice(start, end + 1);

          let chunkSuccess = false;
          let lastError = null;

          for (let retry = 0; retry < 3; retry++) {
              try {
                  const formData = new FormData();
                  formData.append('file', chunk);
                  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

                  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`, {
                      method: 'POST',
                      headers: {
                          'X-Unique-Upload-Id': uniqueUploadId,
                          'Content-Range': `bytes ${start}-${end}/${file.size}`
                      },
                      body: formData
                  });

                  if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      throw new Error(data.error?.message || `Gagal dari server (Kode: ${res.status})`);
                  }

                  const data = await res.json();
                  if (data.secure_url) secureUrl = data.secure_url; 
                  
                  chunkSuccess = true;
                  break; 
              } catch (err) {
                  lastError = err;
                  console.warn(`Chunk ${i} gagal (Percobaan ${retry + 1}/3):`, err);
                  if (retry < 2) {
                      setSyncMessage(`Koneksi goyah. Mencoba ulang (${retry + 1}/3)...`);
                      await new Promise(r => setTimeout(r, 2500)); 
                  }
              }
          }

          if (!chunkSuccess) {
              throw new Error(lastError.message === 'Failed to fetch' 
                  ? 'Koneksi internet terputus permanen oleh browser HP. Silakan coba lagi.' 
                  : lastError.message);
          }
      }
      return secureUrl;
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
          try {
             finalVideoUrl = await uploadVideoInChunks(draft.videoFile);
             setSyncMessage(`Video rute ${i+1} selesai diunggah.`);
          } catch (e) { 
             throw new Error(`Upload video "${draft.name}" gagal: ${e.message}. Silakan coba lagi nanti.`); 
          }
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

  const executeHapusDataCloud = async (dbId) => {
     if(!supabase) {
         showToast("Koneksi Supabase belum diatur!");
         return;
     }
     
     try {
        setSyncedRoads(prev => prev.filter(r => (r.id || r.dbId) !== dbId));
        
        const { error } = await supabase.from('mapped_roads').delete().eq('id', dbId);
        if(error) {
            fetchRoads(); 
            throw error;
        }
        
        showToast("✅ Rute berhasil dihapus.");
        
        if (selectedRoad && (selectedRoad.id === dbId || selectedRoad.dbId === dbId)) {
            if (window.location.hash === '#/admin/detail') window.history.back();
            else setSelectedRoad(null);
        }
     } catch (err) { 
        console.error("Error Hapus Supabase:", err);
        showToast(`❌ Gagal menghapus: ${err.message || 'Periksa izin RLS'}`); 
     }
  };

  const hapusDataCloud = (dbId, roadName) => {
      setConfirmModal({
          isOpen: true,
          title: `Hapus Jalur "${roadName}"`,
          message: 'Hapus rute ini dari database pusat secara permanen?',
          actionLabel: 'Hapus',
          onConfirm: () => executeHapusDataCloud(dbId),
          isDanger: true
      });
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

    const originalTitle = document.title;
    document.title = "Laporan_Survei_Jalan"; 

    if (!selectedRoad.videoUrl || videoSnapshot.length > 0) {
       window.print();
       document.title = originalTitle;
       return;
    }

    showToast("Mengekstrak frame video untuk cetak...");
    let snapshots = [];
    try {
      const videoEl = document.getElementById('admin-vid-player');
      if (videoEl && videoEl.readyState >= 2 && videoEl.duration > 0) { 
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
    
    setVideoSnapshot(snapshots); 
    setTimeout(() => { 
        window.print(); 
        document.title = originalTitle;
    }, 400); 
  };

  return (
    <div className="fixed inset-0 w-full overflow-hidden bg-slate-900 text-slate-900 font-sans print-static-root print:bg-white">
      <style dangerouslySetInnerHTML={{__html: `
        .leaflet-container { width: 100%; height: 100%; min-height: 100%; z-index: 10; touch-action: none; }
        
        .animate-fade-in-up { animation: fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
        
        .animate-fade-in { animation: fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
        
        body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background-color: #0f172a; overscroll-behavior: none; overflow: hidden; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(148, 163, 184, 0.5); border-radius: 10px; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        
        .custom-scrollbar-dark::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar-dark::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar-dark::-webkit-scrollbar-thumb { background-color: #4a5568; border-radius: 10px; }
        .custom-scrollbar-dark::-webkit-scrollbar-thumb:hover { background-color: #718096; }

        @media screen and (max-width: 768px) { input, select, textarea { font-size: 16px !important; } }
        .leaflet-left { transition: left 0.3s ease-in-out; }
        
        .leaflet-control-layers-toggle { width: 30px !important; height: 30px !important; background-size: 16px !important; }
        .leaflet-touch .leaflet-control-layers-toggle { width: 34px !important; height: 34px !important; background-size: 18px !important; }
        
        .leaflet-popup-content-wrapper { border-radius: 12px !important; padding: 0 !important; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1) !important; }
        .leaflet-popup-content { margin: 14px 16px !important; width: 260px !important; line-height: 1.4 !important; }
        .leaflet-popup-close-button { top: 8px !important; right: 8px !important; color: #ef4444 !important; font-weight: bold !important; font-size: 16px !important; }
        .leaflet-popup-close-button:hover { color: #dc2626 !important; }
        .btn-detail-popup { margin-top: 10px; width: 100%; background-color: #3b82f6; color: white; border: none; padding: 8px; border-radius: 8px; font-weight: 700; font-size: 12px; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3); display: flex; justify-content: center; align-items: center; gap: 6px; }
        .btn-detail-popup:hover { background-color: #2563eb; }
        
        video::-webkit-media-controls-fullscreen-button { display: none !important; } 

        @media (min-width: 768px) {
            .modal-offset-sidebar { padding-left: 356px !important; }
        }

        @media print {
          @page { size: A4; margin: 0mm; } 
          html, body { height: auto !important; min-height: 100% !important; overflow: visible !important; background-color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0 !important; padding: 0 !important; }
          .print-hidden { display: none !important; } 
          .print-static-root { position: static !important; height: auto !important; min-height: 100% !important; overflow: visible !important; display: block !important; background: white !important; }
          .print-show { display: block !important; position: static !important; width: 100% !important; margin: 0; padding: 15mm !important; box-sizing: border-box; }
        }
      `}} />

      {isExportingDroneVideo && animatingRoadsList.length === 1 && (
          <DroneVideoExporter road={animatingRoadsList[0]} onClose={() => setIsExportingDroneVideo(false)} />
      )}

      {toastMessage && (
        <div className="fixed top-14 md:top-6 left-1/2 transform -translate-x-1/2 z-[9999] bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center space-x-3 transition-all animate-bounce border border-slate-700 print-hidden">
          <span className="text-sm font-semibold">{toastMessage}</span>
        </div>
      )}

      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 print-hidden animate-fade-in" onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden text-center animate-fade-in-up" onClick={e => e.stopPropagation()}>
                <div className="p-6 pb-2">
                    <div className={`mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-4 ${confirmModal.isDanger ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'}`}>
                        {confirmModal.isDanger ? (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-7 h-7"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-7 h-7"><path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.518c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.828v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" /></svg>
                        )}
                    </div>
                    <h3 className="text-xl font-black text-slate-900 mb-2">{confirmModal.title}</h3>
                    <p className="text-slate-500 text-sm leading-relaxed">{confirmModal.message}</p>
                </div>
                <div className="p-4 mt-6 flex gap-3 bg-slate-50">
                    <button onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })} className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-100 transition-colors">Batal</button>
                    <button onClick={() => { if (confirmModal.onConfirm) confirmModal.onConfirm(); setConfirmModal({ ...confirmModal, isOpen: false }); }} className={`flex-1 py-3 rounded-xl font-bold text-sm text-white shadow-sm transition-colors ${confirmModal.isDanger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'}`}>{confirmModal.actionLabel}</button>
                </div>
            </div>
        </div>
      )}

      {!appRole && (
        <div className="h-full flex items-center justify-center p-4 bg-slate-900 print-hidden overflow-y-auto">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 text-center border-4 border-slate-800">
            <div className="mx-auto w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white mb-6 shadow-lg shadow-blue-500/30">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.246a1.5 1.5 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" /></svg>
            </div>
            <h1 className="text-3xl font-black text-slate-900 mb-6">Map Sistem</h1>

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

                {/* AREA KONTROL BAWAH (STATISTIK & TOMBOL) */}
                <div className="absolute bottom-0 left-0 right-0 p-4 pb-6 z-30 flex flex-col gap-4">
                    
                    <div className="bg-white/95 backdrop-blur-xl p-3.5 rounded-3xl border border-slate-200 shadow-2xl flex flex-col gap-3">
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

                    <div className="w-full flex items-center justify-center">
                      {recordingStatus === 'locating' || recordingStatus === 'ready' ? (
                         <div className="w-full flex space-x-3">
                             <button onClick={cancelRecording} className="w-1/3 bg-slate-800/80 backdrop-blur-md text-white rounded-2xl py-3.5 font-bold text-sm shadow-lg hover:bg-slate-700 transition-colors">Batal</button>
                             <button onClick={() => setRecordingStatus('recording')} disabled={recordingStatus === 'locating'} className={`w-2/3 py-3.5 rounded-2xl font-black text-sm shadow-xl flex justify-center items-center transition-colors ${recordingStatus === 'ready' ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-slate-800/80 text-slate-400 cursor-not-allowed'}`}>{recordingStatus === 'locating' ? 'Mencari GPS...' : 'START REKAM'}</button>
                         </div>
                      ) : recordingStatus === 'idle' ? (
                         <div className="w-full flex space-x-3">
                             <button onClick={cancelRecording} className="w-full bg-slate-800/80 backdrop-blur-md text-white rounded-2xl py-3.5 font-bold text-sm shadow-lg hover:bg-slate-700 transition-colors">Kembali ke Beranda</button>
                         </div>
                      ) : (
                         <div className="w-full flex space-x-3">
                             {(recordingStatus === 'recording' || recordingStatus === 'auto_paused') && (
                                 <><button onClick={() => setRecordingStatus('paused')} className="w-1/2 bg-amber-500 hover:bg-amber-600 transition-colors text-white rounded-2xl py-3.5 font-black text-sm shadow-xl flex justify-center items-center space-x-2"><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg><span>JEDA</span></button><button onClick={stopRealHardware} className="w-1/2 bg-red-600 hover:bg-red-700 transition-colors text-white rounded-2xl py-3.5 font-black text-sm shadow-xl flex justify-center items-center space-x-2"><div className="w-4 h-4 bg-white rounded-sm"></div><span>SELESAI</span></button></>
                             )}
                             {recordingStatus === 'paused' && (
                                 <><button onClick={() => setRecordingStatus('recording')} className="w-1/2 bg-blue-500 hover:bg-blue-600 transition-colors text-white rounded-2xl py-3.5 font-black text-sm shadow-xl flex justify-center items-center space-x-2"><svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg><span>LANJUT</span></button><button onClick={stopRealHardware} className="w-1/2 bg-red-600 hover:bg-red-700 transition-colors text-white rounded-2xl py-3.5 font-black text-sm shadow-xl flex justify-center items-center space-x-2"><div className="w-4 h-4 bg-white rounded-sm"></div><span>SELESAI</span></button></>
                             )}
                         </div>
                      )}
                    </div>
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
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Video (Maks 100MB)</label>
                    {!uploadedVideoUrl ? (
                      <div className="relative border border-dashed border-slate-300 rounded-2xl px-4 py-3 min-h-[3.5rem] flex items-center justify-center bg-slate-50">
                        <input type="file" accept="video/*" onChange={(e) => { 
                            const f = e.target.files[0]; 
                            if(f){ 
                              const sizeMB = (f.size / (1024 * 1024)).toFixed(1);
                              if (f.size > 100 * 1024 * 1024) return showToast(`Gagal: Ukuran terbaca ${sizeMB}MB (Maks 100MB limit server).`);
                              setUploadedVideoUrl(URL.createObjectURL(f)); setUploadedVideoFile(f); showToast(`Video disiapkan (${sizeMB}MB).`); 
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
                <div className="px-6 pt-4 pb-2 flex-shrink-0 bg-slate-100 z-10">
                  <div className="flex justify-between items-center mb-3">
                    <button onClick={() => document.getElementById('import-draft-input').click()} className="bg-emerald-50 text-emerald-600 border border-emerald-200 px-4 py-2 rounded-full font-bold text-xs flex items-center gap-1.5 shadow-sm hover:bg-emerald-100 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                        Import (.json)
                    </button>
                    <input type="file" accept=".json" id="import-draft-input" className="hidden" onChange={handleImportDraftJSON} />
                    
                    <button onClick={() => { window.location.hash = '#/surveyor/home'; }} className="bg-slate-200 text-slate-600 px-4 py-2 rounded-full font-bold text-xs">Tutup</button>
                  </div>
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
                             <div className="flex space-x-1.5">
                               <button onClick={(e) => { e.stopPropagation(); handleShareDraft(d); }} className="bg-emerald-50 text-emerald-600 p-1.5 rounded-xl transition-colors hover:bg-emerald-100" title="Bagikan Info (Teks)">
                                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185z" /></svg>
                               </button>
                               <button onClick={(e) => { e.stopPropagation(); handleExportDraftJSON(d); }} className="bg-amber-50 text-amber-600 p-1.5 rounded-xl transition-colors hover:bg-amber-100" title="Download File (.json)">
                                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                               </button>
                               <button onClick={(e) => { e.stopPropagation(); editDraft(d); }} className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-blue-100 transition-colors">Edit</button>
                             </div>
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
        <div className="h-full bg-[#1e2530] flex flex-col font-sans select-none overflow-hidden relative print-static-root">
          
          {/* --- HEADER MAP AREA (Di atas Sidebar) --- */}
          <header className="bg-white border-b border-slate-200 px-3 md:px-4 flex justify-between items-center z-[1100] shadow-sm h-16 md:h-16 shrink-0 relative w-full gap-3 print-hidden">
            <div className="flex items-center space-x-2 shrink-0">
              <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1.5 md:p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" /></svg>
              </button>
              <div className="hidden md:flex bg-blue-600 text-white p-2 rounded-lg items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.246a1.5 1.5 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" /></svg></div>
            </div>

            {/* --- STATISTIK LEGENDA DI HEADER --- */}
            <div className="flex-1 flex items-center overflow-x-auto hide-scrollbar gap-2 md:gap-3 py-1">
              <div className="flex items-stretch rounded-md border border-slate-200 overflow-hidden h-9 md:h-10 shrink-0 bg-white shadow-sm">
                 <div className="flex-1 flex items-center gap-1.5 px-2 md:px-3 border-r border-slate-200"><span className="w-2 h-2 rounded-full bg-[#10B981]"></span><span className="text-[10px] md:text-xs font-bold text-slate-600 uppercase">Baik</span></div>
                 <div className="flex items-center justify-center bg-slate-50 px-3 md:px-4"><span className="text-sm md:text-lg font-black text-slate-800"><AnimatedNumber value={adminStats.baik} /></span></div>
              </div>
              <div className="flex items-stretch rounded-md border border-slate-200 overflow-hidden h-9 md:h-10 shrink-0 bg-white shadow-sm">
                 <div className="flex-1 flex items-center gap-1.5 px-2 md:px-3 border-r border-slate-200"><span className="w-2 h-2 rounded-full bg-[#FBBF24]"></span><span className="text-[10px] md:text-xs font-bold text-slate-600 uppercase">Rsk Ringan</span></div>
                 <div className="flex items-center justify-center bg-slate-50 px-3 md:px-4"><span className="text-sm md:text-lg font-black text-slate-800"><AnimatedNumber value={adminStats.rusakRingan} /></span></div>
              </div>
              <div className="flex items-stretch rounded-md border border-slate-200 overflow-hidden h-9 md:h-10 shrink-0 bg-white shadow-sm">
                 <div className="flex-1 flex items-center gap-1.5 px-2 md:px-3 border-r border-slate-200"><span className="w-2 h-2 rounded-full bg-[#F97316]"></span><span className="text-[10px] md:text-xs font-bold text-slate-600 uppercase">Rsk Sedang</span></div>
                 <div className="flex items-center justify-center bg-slate-50 px-3 md:px-4"><span className="text-sm md:text-lg font-black text-slate-800"><AnimatedNumber value={adminStats.rusakSedang} /></span></div>
              </div>
              <div className="flex items-stretch rounded-md border border-slate-200 overflow-hidden h-9 md:h-10 shrink-0 bg-white shadow-sm">
                 <div className="flex-1 flex items-center gap-1.5 px-2 md:px-3 border-r border-slate-200"><span className="w-2 h-2 rounded-full bg-[#EF4444]"></span><span className="text-[10px] md:text-xs font-bold text-slate-600 uppercase">Rsk Parah</span></div>
                 <div className="flex items-center justify-center bg-slate-50 px-3 md:px-4"><span className="text-sm md:text-lg font-black text-slate-800"><AnimatedNumber value={adminStats.rusakParah} /></span></div>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <button onClick={() => fetchRoads()} className="text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 p-2 rounded-lg transition-colors shadow-sm" title="Refresh Data">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
              </button>
              <button onClick={() => { window.location.hash = '#/'; }} className="text-rose-500 bg-rose-50 hover:bg-rose-100 border border-rose-200 p-2 rounded-lg transition-colors shadow-sm" title="Keluar">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" /></svg>
              </button>
            </div>
          </header>

          {/* --- AREA BAWAH HEADER (SIDEBAR & MAP) --- */}
          <div className="flex-1 flex relative w-full overflow-hidden print-hidden">
            
            {/* Overlay Layar Gelap Mobile */}
            {isSidebarOpen && <div className="md:hidden absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-[900]" onClick={() => setIsSidebarOpen(false)}></div>}

            {/* --- SIDEBAR KIRI (FLOATING GLASSMORPHISM) --- */}
            <aside className={`bg-white/50 backdrop-blur-[4px] flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.1)] md:shadow-[0_8px_30px_rgba(0,0,0,0.15)] transition-all duration-300 ease-in-out overflow-hidden z-[1000] absolute top-0 left-0 h-full border-r border-white/40 md:top-4 md:bottom-4 md:h-[calc(100%-2rem)] md:border md:rounded-3xl ${isSidebarOpen ? 'w-[85vw] md:w-[340px] md:left-4' : 'w-0 md:left-0 md:border-transparent opacity-0 md:opacity-100'}`}>
              <div className="w-[85vw] md:w-[340px] flex flex-col h-full flex-shrink-0 text-slate-900">
                
                {/* Header Sidebar Internal */}
                <div className="p-4 flex justify-between items-center border-b border-slate-300/40 bg-white/30">
                  <h3 className="font-black text-slate-900 text-xs md:text-sm tracking-[0.15em] uppercase drop-shadow-md">Daftar Layer</h3>
                  <button onClick={() => setIsSidebarOpen(false)} className="border border-slate-300/50 hover:bg-white/60 bg-white/40 rounded-md p-1.5 text-slate-800 transition-colors shadow-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                
                {/* Search Layer */}
                <div className="px-4 py-4 border-b border-slate-300/40 bg-transparent">
                  <div className="bg-white/50 border border-slate-300/50 rounded-lg flex items-center px-3 py-2.5 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all shadow-inner backdrop-blur-md">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-800" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Cari rute atau wilayah..." className="bg-transparent border-none outline-none w-full text-sm text-slate-900 ml-2 placeholder-slate-700 font-bold" />
                  </div>
                </div>

                {/* Semua Layer Actions */}
                <div className="px-4 py-3 flex justify-between items-center border-b border-slate-300/40 bg-transparent">
                  <span className="text-[10px] font-black text-slate-800 tracking-widest uppercase drop-shadow-md">Semua Layer</span>
                  <div className="flex space-x-2">
                    <button onClick={() => { setActiveConditions({'Baik': true, 'Rusak Ringan': true, 'Rusak Sedang': true, 'Rusak Parah': true}); setActiveJenis({'Aspal': true, 'Beton': true, 'Tanah': true}); setActiveKelurahan(initialKelurahanState); }} className="border border-slate-300/50 text-slate-900 hover:text-blue-800 px-3 py-1.5 rounded-md text-[10px] font-bold hover:bg-white/80 bg-white/50 transition-all shadow-sm">Aktifkan</button>
                    <button onClick={() => { setActiveConditions({'Baik': false, 'Rusak Ringan': false, 'Rusak Sedang': false, 'Rusak Parah': false}); setActiveJenis({'Aspal': false, 'Beton': false, 'Tanah': false}); setActiveKelurahan(KELURAHAN_LIST.reduce((acc, kel) => { acc[kel] = false; return acc; }, {})); setExpandedSection(null); }} className="border border-slate-300/50 text-slate-900 hover:text-rose-800 px-3 py-1.5 rounded-md text-[10px] font-bold hover:bg-white/80 bg-white/50 transition-all shadow-sm">Nonaktifkan</button>
                  </div>
                </div>

                {/* Accordion Lists */}
                <div className="flex-1 overflow-y-auto custom-scrollbar pb-6">
                  
                  {/* WILAYAH KELURAHAN */}
                  <div className="border-b border-slate-300/40">
                     <div className="flex justify-between items-center p-4 cursor-pointer hover:bg-white/50 transition-colors" onClick={() => setExpandedSection(expandedSection === 'kelurahan' ? null : 'kelurahan')}>
                         <div className="flex items-center space-x-3">
                             <div className="w-2.5 h-2.5 rounded-full bg-[#8b5cf6] shadow-[0_0_8px_rgba(139,92,246,0.8)]"></div>
                             <span className="font-bold text-slate-900 text-[13px] drop-shadow-sm">Wilayah Kelurahan</span>
                         </div>
                         <div className="flex items-center space-x-3">
                             <span className="bg-white/70 border border-slate-300/50 shadow-sm px-2 py-0.5 rounded-md text-[11px] font-bold text-slate-900">{Object.values(activeKelurahan).filter(Boolean).length}</span>
                             <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 text-slate-800 transition-transform ${expandedSection === 'kelurahan' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                         </div>
                     </div>
                     {expandedSection === 'kelurahan' && (
                         <div className="pb-3 bg-white/10 max-h-64 overflow-y-auto custom-scrollbar">
                            {KELURAHAN_LIST.map(kel => (
                               <div key={kel} className="flex items-center justify-between px-4 py-2 hover:bg-white/60 transition-colors cursor-pointer" onClick={() => setActiveKelurahan(prev => ({...prev, [kel]: !prev[kel]}))}>
                                  <div className="flex items-center space-x-4 ml-2">
                                      <LayerToggle active={activeKelurahan[kel]} color="#8b5cf6" onClick={() => setActiveKelurahan(prev => ({...prev, [kel]: !prev[kel]}))} />
                                      <span className={`text-[12px] font-bold truncate max-w-[150px] drop-shadow-sm ${activeKelurahan[kel] ? 'text-slate-900' : 'text-slate-700'}`}>{formatKel(kel)}</span>
                                  </div>
                                  <div className="flex items-center space-x-3">
                                      <span className="bg-white/70 border border-slate-300/50 px-2 py-0.5 rounded-md text-[10px] font-bold text-slate-800">{syncedRoads.filter(r => r.kelurahan === kel).length}</span>
                                  </div>
                               </div>
                            ))}
                         </div>
                     )}
                  </div>

                  {/* KONDISI JALAN */}
                  <div className="border-b border-slate-300/40">
                     <div className="flex justify-between items-center p-4 cursor-pointer hover:bg-white/50 transition-colors" onClick={() => setExpandedSection(expandedSection === 'kondisi' ? null : 'kondisi')}>
                         <div className="flex items-center space-x-3">
                             <div className="w-2.5 h-2.5 rounded-full bg-[#EF4444] shadow-[0_0_8px_rgba(239,68,68,0.8)]"></div>
                             <span className="font-bold text-slate-900 text-[13px] drop-shadow-sm">Kondisi Jalan</span>
                         </div>
                         <div className="flex items-center space-x-3">
                             <span className="bg-white/70 border border-slate-300/50 shadow-sm px-2 py-0.5 rounded-md text-[11px] font-bold text-slate-900">{Object.values(activeConditions).filter(Boolean).length}</span>
                             <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 text-slate-800 transition-transform ${expandedSection === 'kondisi' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                         </div>
                     </div>
                     {expandedSection === 'kondisi' && (
                         <div className="pb-3 bg-white/10">
                            {['Baik', 'Rusak Ringan', 'Rusak Sedang', 'Rusak Parah'].map(cond => (
                               <div key={cond} className="flex items-center justify-between px-4 py-2.5 hover:bg-white/60 transition-colors cursor-pointer" onClick={() => setActiveConditions(prev => ({...prev, [cond]: !prev[cond]}))}>
                                  <div className="flex items-center space-x-4 ml-2">
                                      <LayerToggle active={activeConditions[cond]} color={getConditionColor(cond)} onClick={() => setActiveConditions(prev => ({...prev, [cond]: !prev[cond]}))} />
                                      <span className={`text-[13px] font-bold drop-shadow-sm ${activeConditions[cond] ? 'text-slate-900' : 'text-slate-700'}`}>{cond}</span>
                                  </div>
                                  <div className="flex items-center space-x-3">
                                      <span className="bg-white/70 border border-slate-300/50 px-2 py-0.5 rounded-md text-[11px] font-bold text-slate-800">{adminStats[cond === 'Baik' ? 'baik' : cond === 'Rusak Ringan' ? 'rusakRingan' : cond === 'Rusak Sedang' ? 'rusakSedang' : 'rusakParah']}</span>
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-600 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                  </div>
                               </div>
                            ))}
                         </div>
                     )}
                  </div>

                  {/* MATERIAL JALAN */}
                  <div className="border-b border-slate-300/40">
                     <div className="flex justify-between items-center p-4 cursor-pointer hover:bg-white/50 transition-colors" onClick={() => setExpandedSection(expandedSection === 'material' ? null : 'material')}>
                         <div className="flex items-center space-x-3">
                             <div className="w-2.5 h-2.5 rounded-full bg-[#FBBF24] shadow-[0_0_8px_rgba(251,191,36,0.8)]"></div>
                             <span className="font-bold text-slate-900 text-[13px] drop-shadow-sm">Material Jalan</span>
                         </div>
                         <div className="flex items-center space-x-3">
                             <span className="bg-white/70 border border-slate-300/50 shadow-sm px-2 py-0.5 rounded-md text-[11px] font-bold text-slate-900">{Object.values(activeJenis).filter(Boolean).length}</span>
                             <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 text-slate-800 transition-transform ${expandedSection === 'material' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                         </div>
                     </div>
                     {expandedSection === 'material' && (
                         <div className="pb-3 bg-white/10">
                            {['Aspal', 'Beton', 'Tanah'].map(mat => (
                               <div key={mat} className="flex items-center justify-between px-4 py-2.5 hover:bg-white/60 transition-colors cursor-pointer" onClick={() => setActiveJenis(prev => ({...prev, [mat]: !prev[mat]}))}>
                                  <div className="flex items-center space-x-4 ml-2">
                                      <LayerToggle active={activeJenis[mat]} color="#3B82F6" onClick={() => setActiveJenis(prev => ({...prev, [mat]: !prev[mat]}))} />
                                      <span className={`text-[13px] font-bold drop-shadow-sm ${activeJenis[mat] ? 'text-slate-900' : 'text-slate-700'}`}>{mat}</span>
                                  </div>
                                  <div className="flex items-center space-x-3">
                                      <span className="bg-white/70 border border-slate-300/50 px-2 py-0.5 rounded-md text-[11px] font-bold text-slate-800">{adminStats[mat.toLowerCase()]}</span>
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-600 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                  </div>
                               </div>
                            ))}
                         </div>
                     )}
                  </div>

                  {/* DAFTAR RUTE AKTIF */}
                  <div className="border-b border-slate-300/40">
                     <div className="flex justify-between items-center p-4 cursor-pointer hover:bg-white/50 transition-colors" onClick={() => setExpandedSection(expandedSection === 'rute' ? null : 'rute')}>
                         <div className="flex items-center space-x-3">
                             <div className="w-2.5 h-2.5 rounded-full bg-[#0ea5e9] shadow-[0_0_8px_rgba(14,165,233,0.8)]"></div>
                             <span className="font-bold text-slate-900 text-[13px] drop-shadow-sm">Jalan</span>
                         </div>
                         <div className="flex items-center space-x-3">
                             <span className="bg-white/70 border border-slate-300/50 shadow-sm px-2 py-0.5 rounded-md text-[11px] font-bold text-slate-900">{searchedRoads.length}</span>
                             <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 text-slate-800 transition-transform ${expandedSection === 'rute' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                         </div>
                     </div>
                     {expandedSection === 'rute' && (
                         <div className="pb-3 px-3 space-y-2 bg-white/10 pt-2">
                             <div className="flex gap-2 mb-3">
                                 <select value={sortConfig} onChange={e => setSortConfig(e.target.value)} className="w-full bg-white border border-slate-300/50 text-slate-700 text-xs font-bold rounded-lg px-2 py-2 outline-none shadow-sm cursor-pointer">
                                     <option value="date_desc">📅 Terkini (Baru - Lama)</option>
                                     <option value="date_asc">📅 Terlama (Lama - Baru)</option>
                                     <option value="name_asc">🔤 Nama Jalan (A - Z)</option>
                                     <option value="name_desc">🔤 Nama Jalan (Z - A)</option>
                                 </select>
                             </div>
                             <button onClick={() => {
                                 let validRoads = selectedAdminRouteIds.length > 0 ? syncedRoads.filter(r => selectedAdminRouteIds.includes(r.id || r.dbId)).filter(r => r.realGps && r.realGps.length > 1) : sortedRoads.filter(r => r.realGps && r.realGps.length > 1);
                                 if(validRoads.length === 0) return showToast("Tidak ada rute valid.");
                                 setAnimatingRoadsList(validRoads); setIsAnimatingMap(true); setIsAnimPaused(true); setAnimationSpeedMultiplier(1.0); setIsAnimFinished(false); setIsAnimControlMinimized(false);
                                 if(window.innerWidth < 768) setIsSidebarOpen(false);
                             }} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-2.5 rounded-lg text-[11px] tracking-wider font-black shadow-md mb-3 transition-colors">▶ PLAY ANIMASI ({selectedAdminRouteIds.length > 0 ? selectedAdminRouteIds.length : sortedRoads.length})</button>

                              {sortedRoads.map((road) => {
                                  const roadId = road.id || road.dbId; 
                                  const isHighlighted = highlightedRoadId === roadId; 
                                  const isSelectedAdmin = selectedAdminRouteIds.includes(roadId);
                                  return (
                                  <div key={roadId} onClick={() => { setSelectedRoad(road); setHighlightedRoadId(roadId); setVideoSnapshot([]); window.location.hash = '#/admin/detail'; if (window.innerWidth < 768) setIsSidebarOpen(false); if (adminMapInstanceRef.current && road.realGps?.length > 0) adminMapInstanceRef.current.fitBounds(window.L.latLngBounds(road.realGps.map(pt => [pt.lat, pt.lng])), { padding: [40, 40] }); }} 
                                       className={`p-2.5 rounded-xl border cursor-pointer relative transition-colors backdrop-blur-md ${isHighlighted ? 'bg-blue-50/90 border-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.3)]' : 'bg-white/70 border-slate-300/50 hover:bg-white/90 shadow-sm'}`}>
                                    
                                    <div onClick={(e) => { e.stopPropagation(); toggleAdminRouteSelection(roadId); }} className={`absolute top-2.5 right-2.5 w-5 h-5 rounded-md border z-10 flex items-center justify-center transition-colors ${isSelectedAdmin ? 'bg-blue-600 border-blue-600' : 'bg-white/90 border-slate-400 hover:border-blue-400'}`} title="Mode Fokus / Pilih Animasi">
                                        {isSelectedAdmin && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                                    </div>

                                    <button 
                                        type="button"
                                        onPointerDown={(e) => e.stopPropagation()} 
                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); hapusDataCloud(roadId, road.name); }} 
                                        className="absolute bottom-2 right-2 w-7 h-7 rounded-md border border-rose-200 bg-white hover:bg-rose-500 text-rose-500 hover:text-white flex items-center justify-center transition-colors z-[50] shadow-sm"
                                        title="Hapus Rute"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                                    </button>

                                    <div className="flex gap-3 pr-8">
                                      <div className="w-14 h-14 rounded-lg overflow-hidden bg-slate-200/50 shrink-0 border border-slate-300/50 flex items-center justify-center">
                                        {road.photoUrls?.length > 0 ? <img src={road.photoUrls[0]} className="w-full h-full object-cover" /> : road.videoUrl ? <video src={`${road.videoUrl}#t=0.5`} className="w-full h-full object-cover" /> : <span className="text-[8px] text-slate-600 font-bold">No Media</span>}
                                      </div>
                                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                                        <h4 className="font-bold text-sm text-slate-900 truncate pr-4 leading-tight">{road.name}</h4>
                                        <div className="flex gap-2 mt-1.5 items-center">
                                           <span className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: getConditionColor(road.condition)}}></span>
                                           <span className="text-[11px] font-medium text-slate-800 truncate">{formatKel(road.kelurahan)}</span>
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
                <div className="p-4 border-t border-slate-300/40 bg-white/20 backdrop-blur-md">
                    <div className="text-[11px] font-bold text-blue-800 tracking-wider drop-shadow-sm">{Object.values(activeConditions).filter(Boolean).length + Object.values(activeJenis).filter(Boolean).length + Object.values(activeKelurahan).filter(Boolean).length} Layer Aktif</div>
                </div>
              </div>
            </aside>

            {/* --- MAIN CONTENT (MAP & WIDGETS) --- */}
          <main className={`flex-1 relative w-full h-full overflow-hidden bg-transparent`}>
            
            {/* Peta Container Asli 2D Leaflet */}
            <div className="absolute inset-0 w-full h-full z-0 flex items-center justify-center overflow-hidden">
               <div className="w-full h-full relative" style={{ overflow: 'hidden' }}>
                   <div ref={adminMapContainerRef} className="absolute inset-0 bg-slate-200 z-0"></div>
                   {!isLeafletLoaded && <div className="absolute inset-0 flex items-center justify-center bg-slate-100 font-bold text-slate-400 z-10 pointer-events-none">Memuat Peta...</div>}
               </div>
            </div>
          </main>
        </div>

        {/* --- SELECTED ROAD POPUP (DETAIL RUTE) --- */}
        {selectedRoad && (
          <>
            {/* Layer Gelap (Backdrop) */}
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1500] print-hidden" onClick={closeAdminModal}></div>
            
            {/* Wrapper Pemusat Modal (100% Center di Layar) */}
            <div className="fixed inset-0 z-[1600] flex items-end md:items-center justify-center p-0 pointer-events-none print-hidden">
              
              <div className={`relative w-full md:w-[600px] ${isVideoFullscreen ? 'h-[100vh] md:w-full md:h-full max-h-none rounded-none' : 'max-h-[90vh] md:max-h-[92vh] rounded-t-3xl md:rounded-3xl'} bg-white shadow-2xl flex flex-col overflow-hidden pointer-events-auto transition-all duration-300 animate-fade-in-up md:animate-fade-in`}>
                
                {!isVideoFullscreen && (
                  <div className="flex justify-between items-center px-4 py-3 border-b border-slate-200 bg-white z-10 shrink-0">
                    <h3 className="font-black text-slate-900">Detail Rute</h3>
                    <button onClick={closeAdminModal} className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full transition-colors"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
                  </div>
                )}

                <div className={`${isVideoFullscreen ? 'fixed inset-0 z-[9999] bg-black/95 backdrop-blur-xl w-full h-full flex flex-col justify-center' : 'aspect-video w-full max-h-[35vh] md:max-h-[300px] bg-slate-900 relative'} shrink-0 transition-all duration-300`}>
                  {videoSnapshot.length > 0 ? (
                      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-1 p-1">
                          {videoSnapshot.map((snap, i) => <img key={i} src={snap} className="w-full h-full object-cover rounded-sm" />)}
                      </div>
                    ) : selectedRoad.videoUrl ? (
                      <>
                        <video id="admin-vid-player" crossOrigin="anonymous" src={selectedRoad.videoUrl} controls controlsList="nofullscreen" playsInline className="absolute inset-0 w-full h-full object-contain"></video>
                        <button onClick={() => setIsVideoFullscreen(!isVideoFullscreen)} className={`absolute z-30 bg-black/50 hover:bg-black/80 text-white p-2.5 rounded-xl pointer-events-auto backdrop-blur-md border border-white/20 transition-all shadow-lg ${isVideoFullscreen ? 'top-6 right-6' : 'bottom-12 right-4 md:bottom-4 md:right-4'}`} title="Toggle Fullscreen">
                            {isVideoFullscreen ? (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" /></svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
                            )}
                        </button>
                      </>
                    ) : selectedRoad.photoUrls?.length > 0 ? (
                      <img src={selectedRoad.photoUrls[0]} className="absolute inset-0 w-full h-full object-cover" />
                    ) : (<div className="text-center flex items-center justify-center h-full w-full text-white text-sm font-bold">Media Tidak Dilampirkan</div>)}
                  
                  {/* --- WATERMARK OVERLAY --- */}
                  {(selectedRoad.videoUrl || selectedRoad.photoUrls?.length > 0) && videoSnapshot.length === 0 && (
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20 w-full text-center">
                       <div className={`font-black text-white/30 drop-shadow-md tracking-widest transition-all duration-300 ${isVideoFullscreen ? 'text-3xl md:text-5xl opacity-40' : 'text-lg md:text-xl opacity-60'}`}>
                          {selectedRoad.date || new Date().toLocaleDateString('id-ID')}
                       </div>
                    </div>
                  )}
                </div>
                
                {!isVideoFullscreen && (
                  <div className="w-full p-4 md:p-5 flex flex-col flex-1 min-h-0 gap-3">
                    <div className="flex flex-wrap gap-2 justify-end shrink-0">
                       <button onClick={() => hapusDataCloud(selectedRoad.id || selectedRoad.dbId, selectedRoad.name)} className="text-[9px] md:text-xs text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 px-3 py-1.5 rounded-md font-bold transition-colors shadow-sm">Hapus</button>
                       <button onClick={() => { closeAdminModal(); if (adminMapInstanceRef.current) adminMapInstanceRef.current.closePopup(); setAnimatingRoadsList([selectedRoad]); setIsAnimatingMap(true); setIsAnimPaused(true); setCurrentAnimDistance(0); setAnimationSpeedMultiplier(1.0); setShowSpeedControl(false); setIsAnimFinished(false); setIsAnimControlMinimized(false); if(window.innerWidth < 768) setIsSidebarOpen(false); }} className="text-[9px] md:text-xs text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded-md font-bold transition-colors">Play Animasi</button>
                       <button onClick={handleShareLocation} className="text-[9px] md:text-xs text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded-md font-bold transition-colors">Share Lokasi</button>
                       <button onClick={handleExportKML} className="text-[9px] md:text-xs text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded-md font-bold transition-colors">Export KML</button>
                       <button onClick={handlePrint} className="text-[9px] md:text-xs text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded-md font-bold transition-colors">Print</button>
                    </div>
                    
                    <div className="shrink-0">
                        <h4 className="text-lg md:text-xl font-black mb-1 leading-tight text-slate-900">{selectedRoad.name}</h4>
                        <p className="text-xs md:text-sm text-slate-600 italic mb-2">"{selectedRoad.notes || 'Tidak ada catatan.'}"</p>
                    </div>
                    
                    <div className="border border-slate-200 rounded-lg overflow-y-auto custom-scrollbar flex-1 min-h-[100px] bg-white">
                      <table className="w-full text-left text-[10px] md:text-xs border-collapse">
                        <tbody className="divide-y divide-slate-200">
                          <tr><th className="py-3 px-3 bg-slate-50 w-1/3">Kelurahan</th><td className="py-3 px-3">{formatKel(selectedRoad.kelurahan)}</td></tr>
                          <tr><th className="py-3 px-3 bg-slate-50">Jenis/Kondisi</th><td className="py-3 px-3">{selectedRoad.jenisJalan} / <span className="font-bold" style={{color:getConditionColor(selectedRoad.condition)}}>{selectedRoad.condition}</span></td></tr>
                          <tr><th className="py-3 px-3 bg-slate-50">Panjang Rute</th><td className="py-3 px-3">{formatLength(selectedRoad.length)}</td></tr>
                          <tr><th className="py-3 px-3 bg-slate-50 align-top">Titik Lokasi</th><td className="py-3 px-3">{selectedRoad.pinLocation ? `${selectedRoad.pinLocation.lat.toFixed(5)}, ${selectedRoad.pinLocation.lng.toFixed(5)}` : '-'}</td></tr>
                          <tr><th className="py-3 px-3 bg-slate-50 align-top">Tanggal</th><td className="py-3 px-3">{selectedRoad.date || '-'}</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* --- OVERLAY KONTROL ANIMASI BAWAH (FIXED RESPONSIVE) --- */}
        {isAnimatingMap && animatingRoadsList.length > 0 && (
             <div className="fixed bottom-4 left-3 right-3 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-[360px] z-[2000] flex flex-col pointer-events-none print-hidden">
                 
                 {isAnimControlMinimized ? (
                     <button onClick={() => setIsAnimControlMinimized(false)} className="pointer-events-auto mx-auto bg-white/95 px-5 py-3 rounded-full shadow-2xl border border-blue-200 text-blue-700 text-sm font-black w-auto">
                         Buka Kontrol Animasi
                     </button>
                 ) : (
                     <div className="pointer-events-auto bg-white/95 backdrop-blur-xl p-3 md:p-4 rounded-3xl flex flex-col shadow-2xl border border-slate-200 w-full gap-3">
                         
                         {/* --- HEADER KONTROL --- */}
                         <div className="flex justify-between items-center w-full">
                             <div className="flex gap-2 items-center">
                                 {isAnimFinished ? (
                                     <button onClick={() => { setIsAnimatingMap(false); setTimeout(() => { setIsAnimatingMap(true); setIsAnimPaused(false); setIsAnimFinished(false); setCurrentAnimDistance(0); }, 50); }} className="w-10 h-10 flex items-center justify-center rounded-full shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white transition-colors" title="Ulang">
                                         <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                                     </button>
                                 ) : (
                                     <>
                                         <button onClick={() => setIsAnimPaused(!isAnimPaused)} className={`w-10 h-10 flex items-center justify-center rounded-full text-white shadow-sm transition-colors ${isAnimPaused ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-blue-600 hover:bg-blue-700'}`} title={isAnimPaused ? "Play" : "Pause"}>
                                            {isAnimPaused ? 
                                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 ml-0.5"><path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" /></svg> : 
                                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75h-1.5a.75.75 0 01-.75-.75V5.25z" clipRule="evenodd" /></svg>
                                            }
                                         </button>
                                         <button onClick={() => { setIsAnimatingMap(false); setTimeout(() => { setIsAnimatingMap(true); setIsAnimPaused(false); setIsAnimFinished(false); setCurrentAnimDistance(0); }, 50); }} className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-300 shadow-sm transition-colors" title="Mulai Ulang">
                                             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                                         </button>
                                     </>
                                 )}
                                 <button onClick={() => setShowSpeedControl(!showSpeedControl)} className={`px-3 py-1 h-10 rounded-full text-[11px] md:text-xs font-bold border shadow-sm flex items-center justify-center ${showSpeedControl ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-700 border-slate-300'}`}>
                                     {Number(animationSpeedMultiplier).toFixed(2)}x
                                 </button>
                             </div>

                             <div className="flex gap-1.5 items-center">
                                 <button onClick={() => setIsAnimControlMinimized(true)} className="w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-600 border border-slate-300 rounded-full shrink-0 hover:bg-slate-200 transition-colors" title="Sembunyikan">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" /></svg>
                                 </button>
                                 <button onClick={() => { setIsAnimatingMap(false); setIsAnimPaused(false); setShowSpeedControl(false); setAnimatingRoadsList([]); setIsAnimFinished(false); setIsAnimControlMinimized(false); }} className="w-8 h-8 flex items-center justify-center bg-rose-100 text-rose-600 border border-rose-200 rounded-full shrink-0 hover:bg-rose-200 transition-colors" title="Tutup">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                 </button>
                             </div>
                         </div>
                         
                         {/* --- INFO KENDARAAN & JARAK --- */}
                         <div className="flex gap-2 w-full items-stretch">
                             <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex items-center justify-center text-slate-800 shadow-inner">
                                 {animatingRoadsList.length > 1 ? (
                                     <span className="text-blue-700 text-sm font-black truncate">{animatingRoadsList.length} Rute Aktif</span>
                                 ) : (
                                     <span className="text-base md:text-lg font-black truncate tracking-wide">
                                         {currentAnimDistance < 1000 ? Math.round(currentAnimDistance) + ' m' : (currentAnimDistance / 1000).toFixed(2) + ' km'}
                                     </span>
                                 )}
                             </div>
                             
                             <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
                                 <button onClick={() => setAnimIconType('car')} className={`p-1.5 rounded-lg ${animIconType === 'car' ? 'bg-white shadow-sm' : 'opacity-50'}`}>🚗</button>
                                 <button onClick={() => setAnimIconType('motorcycle')} className={`p-1.5 rounded-lg ${animIconType === 'motorcycle' ? 'bg-white shadow-sm' : 'opacity-50'}`}>🏍️</button>
                                 <button onClick={() => setAnimIconType('runner')} className={`p-1.5 rounded-lg ${animIconType === 'runner' ? 'bg-white shadow-sm' : 'opacity-50'}`}>🏃</button>
                                 <button onClick={() => setAnimIconType('truck')} className={`p-1.5 rounded-lg ${animIconType === 'truck' ? 'bg-white shadow-sm' : 'opacity-50'}`}>🚛</button>
                             </div>
                         </div>

                         {/* --- KONTROL SPEED --- */}
                         {showSpeedControl && (
                             <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 shadow-inner w-full">
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

                         {/* --- NEW: TOMBOL 3D & RECORDING TERPISAH --- */}
                         {animatingRoadsList.length === 1 && (
                            <div className="flex gap-2 w-full items-stretch pt-1">
                                <button onClick={() => setIsExportingDroneVideo(true)} className={`w-full py-3.5 rounded-xl text-xs font-black border transition-colors shadow-sm flex items-center justify-center gap-1.5 bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" /></svg>
                                    Export Video 3D (Drone View)
                                </button>
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
        <div className="hidden print-show w-full bg-white text-black p-4 md:p-8" id="print-area">
           <div className="text-center border-b-4 border-black pb-4 mb-6 relative">
              <h1 className="text-2xl font-black uppercase tracking-wide text-black">Laporan Survei Kondisi Jalan</h1>
           </div>
           
           <table className="w-full mb-6 text-[14px] border-collapse text-black">
              <tbody>
                <tr className="border-b border-black/20"><td className="py-2.5 font-bold w-1/3 text-black">Nama Rute / Jalan</td><td className="py-2.5 font-black text-[14px] text-[#800000]">: {selectedRoad.name}</td></tr>
                <tr className="border-b border-black/20"><td className="py-2.5 font-bold text-black">Kelurahan Wilayah</td><td className="py-2.5 font-bold text-black">: {formatKel(selectedRoad.kelurahan)}</td></tr>
                <tr className="border-b border-black/20"><td className="py-2.5 font-bold text-black">Jenis Material Jalan</td><td className="py-2.5 font-bold text-black">: {selectedRoad.jenisJalan || '-'}</td></tr>
                <tr className="border-b border-black/20"><td className="py-2.5 font-bold text-black">Kondisi Dominan</td><td className="py-2.5 text-[#800000]">: <span className="font-bold border border-[#800000] px-2 py-0.5 rounded text-[14px] text-[#800000]">{selectedRoad.condition}</span></td></tr>
                <tr className="border-b border-black/20"><td className="py-2.5 font-bold text-black">Panjang Rute Terecord</td><td className="py-2.5 font-bold text-black">: {formatLength(selectedRoad.length)}</td></tr>
                <tr className="border-b border-black/20"><td className="py-2.5 font-bold text-black align-top">Catatan Lapangan</td><td className="py-2.5 italic text-[#800000]">: "{selectedRoad.notes || 'Tidak ada catatan khusus.'}"</td></tr>
                <tr className="border-b border-black/20"><td className="py-2.5 font-bold text-black">Titik Pin Lokasi (GPS)</td><td className="py-2.5 font-mono text-[14px] font-bold text-black">: {selectedRoad.pinLocation ? `${selectedRoad.pinLocation.lat}, ${selectedRoad.pinLocation.lng}` : 'Tidak ditandai'}</td></tr>
                <tr className="border-b border-black/20"><td className="py-2.5 font-bold text-black">Tanggal Pelaksanaan</td><td className="py-2.5 font-bold text-black">: {selectedRoad.date}</td></tr>
              </tbody>
           </table>

           {/* --- LAMPIRAN GAMBAR/VIDEO --- */}
           <div style={{ pageBreakBefore: 'always', breakBefore: 'page' }} className="pt-4">
              <h3 className="font-bold text-[16px] border-b-2 border-black mb-4 pb-1 text-black">Lampiran Visual Lapangan</h3>
              {videoSnapshot.length > 0 ? (
                 <div className="grid grid-cols-2 gap-4">
                    {videoSnapshot.map((snap, i) => (
                       <div key={i} className="aspect-[4/3] bg-white rounded-lg overflow-hidden border border-black relative">
                          <img src={snap} className="w-full h-full object-cover" />
                          <div className="absolute bottom-2 left-2 bg-black/80 text-white text-[16px] px-2 py-1 rounded backdrop-blur-sm">Frame {i+1}</div>
                       </div>
                    ))}
                 </div>
              ) : selectedRoad.photoUrls?.length > 0 ? (
                 <div className="grid grid-cols-2 gap-4">
                    {selectedRoad.photoUrls.slice(0, 4).map((url, i) => (
                       <div key={i} className="aspect-[4/3] bg-white rounded-lg overflow-hidden border border-black">
                          <img src={url} className="w-full h-full object-cover" />
                       </div>
                    ))}
                 </div>
              ) : (
                 <div className="text-[16px] text-black italic p-4 bg-white rounded-lg border border-black">Tidak ada media visual yang dilampirkan pada survei ini.</div>
              )}
           </div>
        </div>
      )}
    </div>
  );
}
