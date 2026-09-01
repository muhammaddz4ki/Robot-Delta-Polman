import React, { useState, useRef, useEffect, useMemo, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas, useLoader, useThree, useFrame } from '@react-three/fiber';
import { Grid, Sphere, Center, CameraControls, Html } from '@react-three/drei';
import { STLLoader } from 'three-stdlib';
import { Wifi, WifiOff, Radio, RefreshCw, X, Server, UploadCloud, ExternalLink } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';
import { useTheme } from '../ThemeContext';
import DeltaRobotDigitalTwin from '../components/DeltaRobotDigitalTwin';
import * as THREE from 'three';
import '../App.css';

const CameraReporter = ({ onChange, controlsRef }) => {
  useFrame(() => {
    if (controlsRef && controlsRef.current) {
      const cp = controlsRef.current.getPosition(new THREE.Vector3());
      const ct = controlsRef.current.getTarget(new THREE.Vector3());
      const cx = Math.round(cp.x);
      const cy = Math.round(cp.y);
      const cz = Math.round(cp.z);
      const tx = Math.round(ct.x);
      const ty = Math.round(ct.y);
      const tz = Math.round(ct.z);
      onChange(prev => {
        if (prev.x !== cx || prev.y !== cy || prev.z !== cz || prev.tx !== tx || prev.ty !== ty || prev.tz !== tz) {
          return { x: cx, y: cy, z: cz, tx, ty, tz };
        }
        return prev;
      });
    }
  });
  return null;
};

const CoordinateMarker = ({ position, color, label, visible = true }) => {
  if (!visible || !position) return null;
  const px = Number(position.x) || 0;
  const py = Number(position.y) || 0;
  const pz = Number(position.z) || 0;

  // In Three.js workspace mapping: X -> x, Z -> y (vertical), -Y -> z (depth)
  const threePos = [px, pz, -py];

  return (
    <group position={threePos}>
      {/* Target Sphere */}
      <mesh>
        <sphereGeometry args={[5, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.8}
          transparent
          opacity={0.85}
        />
      </mesh>

      {/* Ground Projection Ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[7, 9, 24]} />
        <meshBasicMaterial color={color} side={THREE.DoubleSide} transparent opacity={0.6} />
      </mesh>

      {/* HTML 3D Label */}
      <Html position={[0, 10, 0]} center distanceFactor={350} style={{ pointerEvents: 'none' }}>
        <div style={{
          background: 'rgba(15, 23, 42, 0.88)',
          border: `1px solid ${color}`,
          color: '#ffffff',
          fontSize: '9px',
          fontWeight: '700',
          padding: '2px 5px',
          borderRadius: '4px',
          whiteSpace: 'nowrap',
          boxShadow: `0 0 8px ${color}50`,
          fontFamily: 'JetBrains Mono, monospace'
        }}>
          {label}
        </div>
      </Html>
    </group>
  );
};

const RobotBase = ({ scale, position, rotation }) => {
  const geom = useLoader(STLLoader, '/RobotFull.stl');
  return (
    <Center position={[position.x, position.y, position.z]}>
      <mesh geometry={geom} rotation={[rotation.x * Math.PI / 180, rotation.y * Math.PI / 180, rotation.z * Math.PI / 180]} scale={scale}>
        <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.2} side={2} />
      </mesh>
    </Center>
  );
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const Dashboard = () => {
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const [logs, setLogs] = useState(["[SYSTEM] Delta Robot OS Siap.", "[SYSTEM] Visualizer 3D Aktif."]);
  const [pos, setPos] = useState({ x: 0, y: 0, z: -200 });
  const [grip, setGrip] = useState(125);
  const [showMarkers, setShowMarkers] = useState(() => localStorage.getItem('delta_show_markers') !== 'false');
  const [jogStep, setJogStep] = useState(() => {
    const s = localStorage.getItem('delta_jog_step');
    return s ? Number(s) : 5;
  });

  const cameraControlsRef = useRef(null);
  const [isCameraLocked, setIsCameraLocked] = useState(false);
  const [activeView, setActiveView] = useState('iso');

  // Stored / Default camera values
  const savedCam = useMemo(() => {
    try {
      const raw = localStorage.getItem('delta_custom_cam_v2');
      if (raw) return JSON.parse(raw);
    } catch (_) { }
    return { x: -182, y: 421, z: 196, tx: 0, ty: -20, tz: 0 };
  }, []);

  const [camInfo, setCamInfo] = useState(savedCam);

  // Connection & Wi-Fi Management
  const [connectionMode, setConnectionMode] = useState(() => localStorage.getItem('delta_conn_mode') || 'wifi');
  const [espIp, setEspIp] = useState(() => localStorage.getItem('delta_esp_ip') || 'http://192.168.4.1');
  const [isWifiModalOpen, setIsWifiModalOpen] = useState(false);
  const [espStatus, setEspStatus] = useState({ status: 'unknown', ip: '', ssid: '', rssi: 0, last_log: '' });
  const [isCheckingEsp, setIsCheckingEsp] = useState(false);
  const [wifiNetworks, setWifiNetworks] = useState([]);
  const [isScanningWifi, setIsScanningWifi] = useState(false);
  const [selectedSsid, setSelectedSsid] = useState('');
  const [newWifiPass, setNewWifiPass] = useState('');
  const [wifiStatusMessage, setWifiStatusMessage] = useState('');
  const [isSavingWifi, setIsSavingWifi] = useState(false);
  const [wifiSubTab, setWifiSubTab] = useState('hotspot'); // 'hotspot' | 'ap'
  const [isApplyingAll, setIsApplyingAll] = useState(false);
  const [isOtaModalOpen, setIsOtaModalOpen] = useState(false);

  const lastSeenLogRef = useRef('');

  const flyTo = (view) => {
    setActiveView(view);
    if (!cameraControlsRef.current) return;
    switch (view) {
      case 'iso': {
        const targetCam = savedCam || { x: -182, y: 421, z: 196, tx: 0, ty: -20, tz: 0 };
        cameraControlsRef.current.setLookAt(targetCam.x, targetCam.y, targetCam.z, targetCam.tx || 0, targetCam.ty || -20, targetCam.tz || 0, true);
        break;
      }
      case 'top':
        cameraControlsRef.current.setLookAt(0, 360, 0.1, 0, 0, 0, true);
        break;
      case 'front':
        cameraControlsRef.current.setLookAt(0, 0, 360, 0, 0, 0, true);
        break;
      case 'right':
        cameraControlsRef.current.setLookAt(360, 0, 0, 0, 0, 0, true);
        break;
      default:
        break;
    }
  };

  const saveCurrentCameraView = () => {
    if (camInfo) {
      localStorage.setItem('delta_custom_cam_v2', JSON.stringify(camInfo));
      alert(`Sudut Pandang Kamera Berhasil Disimpan!\nPosisi: [${camInfo.x}, ${camInfo.y}, ${camInfo.z}]\nTarget: [${camInfo.tx || 0}, ${camInfo.ty || 0}, ${camInfo.tz || 0}]\n\nSudut ini akan selalu aktif saat web dibuka atau di-refresh.`);
    }
  };

  const [pickA, setPickA] = useState(() => {
    try {
      const s = localStorage.getItem('delta_pickA');
      if (s) return JSON.parse(s);
    } catch (_) {}
    return { x: 20, y: -30, z: -280 };
  });
  const [dropA, setDropA] = useState(() => {
    try {
      const s = localStorage.getItem('delta_dropA');
      if (s) return JSON.parse(s);
    } catch (_) {}
    return { x: 20, y: 120, z: -320 };
  });
  const [pickB, setPickB] = useState(() => {
    try {
      const s = localStorage.getItem('delta_pickB');
      if (s) return JSON.parse(s);
    } catch (_) {}
    return { x: -25, y: -25, z: -295 };
  });
  const [dropB, setDropB] = useState(() => {
    try {
      const s = localStorage.getItem('delta_dropB');
      if (s) return JSON.parse(s);
    } catch (_) {}
    return { x: -80, y: 110, z: -320 };
  });

  const [templates, setTemplates] = useState([]);
  const [newTemplateName, setNewTemplateName] = useState("");

  const [isAutonomous, setIsAutonomous] = useState(() => localStorage.getItem('delta_auto_mode') === 'true');
  const [relayActive, setRelayActive] = useState(false);
  const [isKeyJogActive, setIsKeyJogActive] = useState(() => {
    const s = localStorage.getItem('delta_key_jog');
    return s !== null ? s === 'true' : true;
  });
  const [speedVal, setSpeedVal] = useState(() => {
    const s = localStorage.getItem('delta_motor_speed');
    return s ? Number(s) : 1000;
  });
  const [accelVal, setAccelVal] = useState(() => {
    const s = localStorage.getItem('delta_motor_accel');
    return s ? Number(s) : 500;
  });
  const [isPlayingPattern, setIsPlayingPattern] = useState(false);

  const [stlScale, setStlScale] = useState(() => {
    const s = localStorage.getItem('delta_stl_scale');
    return s ? parseFloat(s) : 0.25;
  });
  const [stlPos, setStlPos] = useState(() => {
    try {
      const s = localStorage.getItem('delta_stl_pos');
      if (s) return JSON.parse(s);
    } catch (_) {}
    return { x: 0, y: 0, z: 0 };
  });
  const [stlRot, setStlRot] = useState(() => {
    try {
      const s = localStorage.getItem('delta_stl_rot');
      if (s) return JSON.parse(s);
    } catch (_) {}
    return { x: -1, y: -20, z: 0 };
  });

  // Keyboard Jogging Listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isKeyJogActive) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'ArrowLeft' || e.code === 'KeyA') {
        e.preventDefault();
        sendCommand(`${pos.x - jogStep} ${pos.y} ${pos.z}`);
      } else if (e.key === 'ArrowRight' || e.code === 'KeyD') {
        e.preventDefault();
        sendCommand(`${pos.x + jogStep} ${pos.y} ${pos.z}`);
      } else if (e.key === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        sendCommand(`${pos.x} ${pos.y - jogStep} ${pos.z}`);
      } else if (e.key === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault();
        sendCommand(`${pos.x} ${pos.y + jogStep} ${pos.z}`);
      } else if (e.key === 'PageUp' || e.code === 'KeyQ') {
        e.preventDefault();
        sendCommand(`${pos.x} ${pos.y} ${pos.z + jogStep}`);
      } else if (e.key === 'PageDown' || e.code === 'KeyE') {
        e.preventDefault();
        sendCommand(`${pos.x} ${pos.y} ${pos.z - jogStep}`);
      } else if (e.code === 'Space') {
        e.preventDefault();
        const nextRelay = !relayActive;
        setRelayActive(nextRelay);
        sendCommand(nextRelay ? 'HISAP' : 'LEPAS');
      } else if (e.code === 'KeyH') {
        e.preventDefault();
        sendCommand('HOME');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        sendCommand('EMG');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isKeyJogActive, pos, jogStep, relayActive]);

  // Automated Trajectory Runner
  const runTestPattern = async (patternType) => {
    if (isPlayingPattern) return;
    setIsPlayingPattern(true);
    setLogs(prev => [...prev, `[PATTERN] Memulai lintasan geometris: ${patternType.toUpperCase()}...`]);

    const sleep = (ms) => new Promise(res => setTimeout(res, ms));

    try {
      if (patternType === 'circle') {
        const radius = 40;
        const zLvl = -250;
        for (let a = 0; a <= 360; a += 30) {
          const rad = (a * Math.PI) / 180;
          const px = Math.round(radius * Math.cos(rad));
          const py = Math.round(radius * Math.sin(rad));
          await sendCommand(`${px} ${py} ${zLvl}`);
          await sleep(250);
        }
      } else if (patternType === 'square') {
        const zLvl = -250;
        const pts = [[-35, -35], [35, -35], [35, 35], [-35, 35], [-35, -35]];
        for (const [px, py] of pts) {
          await sendCommand(`${px} ${py} ${zLvl}`);
          await sleep(350);
        }
      } else if (patternType === 'triangle') {
        const zLvl = -250;
        const pts = [[0, 45], [38, -25], [-38, -25], [0, 45]];
        for (const [px, py] of pts) {
          await sendCommand(`${px} ${py} ${zLvl}`);
          await sleep(350);
        }
      }
      setLogs(prev => [...prev, `[PATTERN] Lintasan ${patternType.toUpperCase()} selesai.`]);
    } catch (err) {
      setLogs(prev => [...prev, `[PATTERN ERROR] ${err.message}`]);
    } finally {
      setIsPlayingPattern(false);
    }
  };

  const logsEndRef = useRef(null);

  // Normalize IP / URL
  const getCleanEspUrl = (url) => {
    let clean = (url || '').trim();
    if (!clean) return 'http://192.168.4.1';
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `http://${clean}`;
    }
    return clean.replace(/\/+$/, '');
  };

  // Check ESP32 status
  const checkEspStatus = async (overrideIp) => {
    const targetUrl = getCleanEspUrl(overrideIp || espIp);
    setIsCheckingEsp(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`${targetUrl}/status`, { 
        signal: controller.signal,
        mode: 'cors'
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        setEspStatus(data);
        if (data.last_log && data.last_log !== lastSeenLogRef.current && data.last_log !== "Menunggu status robot..." && data.last_log.trim()) {
          lastSeenLogRef.current = data.last_log;
          setLogs(prev => [...prev, `[ROBOT] ${data.last_log}`]);
        }
      } else {
        console.warn('[ESP32 STATUS] Response not ok:', res.status);
        setEspStatus({ status: 'disconnected', ip: '', ssid: '', rssi: 0, last_log: '' });
      }
    } catch (err) {
      console.warn('[ESP32 STATUS ERROR]:', err);
      setEspStatus({ status: 'disconnected', ip: '', ssid: '', rssi: 0, last_log: '' });
    } finally {
      setIsCheckingEsp(false);
    }
  };

  // Scan Wi-Fi
  const handleScanWifi = async () => {
    const targetUrl = getCleanEspUrl(espIp);
    setIsScanningWifi(true);
    setWifiStatusMessage('Memindai jaringan Wi-Fi sekitar ESP32...');
    try {
      const res = await fetch(`${targetUrl}/scan`);
      const data = await res.json();
      if (data.status === 'success' && data.networks) {
        setWifiNetworks(data.networks);
        setWifiStatusMessage(`Ditemukan ${data.count} jaringan Wi-Fi.`);
      } else {
        setWifiStatusMessage('Gagal scan Wi-Fi.');
      }
    } catch (err) {
      setWifiStatusMessage('Gagal scan Wi-Fi.');
    } finally {
      setIsScanningWifi(false);
    }
  };

  // Save Wi-Fi config
  const handleSaveWifi = async (e) => {
    e.preventDefault();
    if (!selectedSsid.trim()) {
      alert('Pilih nama SSID Wi-Fi!');
      return;
    }
    const targetUrl = getCleanEspUrl(espIp);
    setIsSavingWifi(true);
    setWifiStatusMessage('Mengirim data Wi-Fi ke ESP32...');

    try {
      const formData = new URLSearchParams();
      formData.append('ssid', selectedSsid.trim());
      formData.append('pass', newWifiPass);

      const res = await fetch(`${targetUrl}/setwifi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString()
      });

      const data = await res.json();
      setWifiStatusMessage(data.message || 'Wi-Fi tersimpan! ESP32 merestart...');
      setLogs(prev => [...prev, `[WIFI] Wi-Fi diperbarui: ${selectedSsid}.`]);

      setTimeout(() => {
        setIsSavingWifi(false);
        checkEspStatus();
      }, 3000);
    } catch (err) {
      setWifiStatusMessage('Gagal mengirim konfigurasi Wi-Fi.');
      setIsSavingWifi(false);
    }
  };

  const handleSaveConnectionSettings = (mode, ip) => {
    const cleanIp = getCleanEspUrl(ip);
    setConnectionMode(mode);
    setEspIp(cleanIp);
    localStorage.setItem('delta_conn_mode', mode);
    localStorage.setItem('delta_esp_ip', cleanIp);
    setLogs(prev => [...prev, `[SYSTEM] Mode koneksi: ${mode.toUpperCase()} (${mode === 'wifi' ? cleanIp : 'Backend'})`]);
    if (mode === 'wifi') {
      checkEspStatus(cleanIp);
    }
  };

  const fetchLayout = async () => {
    const token = localStorage.getItem('delta_token');
    if (!token) return;
    try {
      const res = await fetch('http://localhost:5000/api/layout', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.status === 'success' && data.data) {
        if (data.data.stlScale !== undefined) setStlScale(data.data.stlScale);
        if (data.data.stlPos !== undefined) setStlPos(data.data.stlPos);
        if (data.data.stlRot !== undefined) setStlRot(data.data.stlRot);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTemplates = async () => {
    try {
      const token = localStorage.getItem('delta_token');
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('http://localhost:5000/api/templates', { headers });
      const data = await res.json();
      if (data.status === 'success' && Array.isArray(data.data)) {
        setTemplates(data.data);
      }
    } catch (err) {
      console.error('Fetch templates error:', err);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('delta_token');
    if (!token) {
      navigate('/login');
      return;
    }
    fetchTemplates();
    fetchLayout();

    if (connectionMode === 'wifi') {
      checkEspStatus();
    }
  }, [navigate]);

  useEffect(() => {
    if (connectionMode !== 'wifi') return;
    const interval = setInterval(() => {
      checkEspStatus();
    }, 2500);
    return () => clearInterval(interval);
  }, [connectionMode, espIp]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const save3DLayout = async () => {
    localStorage.setItem('delta_stl_scale', stlScale);
    localStorage.setItem('delta_stl_pos', JSON.stringify(stlPos));
    localStorage.setItem('delta_stl_rot', JSON.stringify(stlRot));

    const token = localStorage.getItem('delta_token');
    if (token) {
      try {
        await fetch('http://localhost:5000/api/layout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            stlScale: stlScale,
            stlPos: stlPos,
            stlRot: stlRot
          })
        });
      } catch (err) {}
    }
    setLogs(prev => [...prev, `[SYSTEM] Layout Model 3D berhasil disimpan permanen.`]);
    alert("Layout dan kalibrasi model 3D berhasil disimpan!");
  };

  const handleLogout = () => {
    localStorage.removeItem('delta_token');
    localStorage.removeItem('delta_user');
    navigate('/login');
  };

  const sendCommand = async (cmd) => {
    setLogs(prev => [...prev, `> ${cmd}`]);

    const parts = cmd.trim().toUpperCase().split(" ");
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      setPos({ x: parseFloat(parts[0]), y: parseFloat(parts[1]), z: parseFloat(parts[2]) });
    } else if (parts[0] === "X" && parts.length === 2) {
      setPos(p => ({ ...p, x: parseFloat(parts[1]) }));
    } else if (parts[0] === "Y" && parts.length === 2) {
      setPos(p => ({ ...p, y: parseFloat(parts[1]) }));
    } else if (parts[0] === "Z" && parts.length === 2) {
      setPos(p => ({ ...p, z: parseFloat(parts[1]) }));
    } else if (parts[0] === "HOME") {
      setPos({ x: 0, y: 0, z: -200 });
    }

    if (connectionMode === 'wifi') {
      const targetUrl = getCleanEspUrl(espIp);
      try {
        const response = await fetch(`${targetUrl}/cmd?val=${encodeURIComponent(cmd)}`, { mode: 'cors' });
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'success') {
            if (data.last_log && data.last_log !== lastSeenLogRef.current && data.last_log.trim()) {
              lastSeenLogRef.current = data.last_log;
              setLogs(prev => [...prev, `[ROBOT] ${data.last_log}`]);
            }
          }
        } else {
          setLogs(prev => [...prev, `[ERROR] ESP32 merespons kode: ${response.status}`]);
        }
      } catch (err) {
        console.error('[ESP32 CMD ERROR]:', err);
        setLogs(prev => [...prev, `[ERROR] Gagal mengirim ke ESP32`]);
      }
      return;
    }

    const token = localStorage.getItem('delta_token');
    try {
      const response = await fetch('http://localhost:5000/api/command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ command: cmd })
      });

      if (response.status === 401) {
        handleLogout();
        return;
      }

      const data = await response.json();
      if (data.response) {
        setLogs(prev => [...prev, `[ROBOT] ${data.response}`]);
      }
    } catch (error) {
      setLogs(prev => [...prev, `[ERROR] Gagal mengirim perintah`]);
    }
  };

  const handleManualMove = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const x = fd.get('x');
    const y = fd.get('y');
    const z = fd.get('z');
    sendCommand(`${x} ${y} ${z}`);
  };

  const handleSelectTemplate = async (e) => {
    const name = e.target.value;
    if (!name) return;
    const t = templates.find(item => item.template_name === name);
    if (t) {
      const pA = { x: t.pickA_x, y: t.pickA_y, z: t.pickA_z };
      const dA = { x: t.dropA_x, y: t.dropA_y, z: t.dropA_z };
      const pB = { x: t.pickB_x, y: t.pickB_y, z: t.pickB_z };
      const dB = { x: t.dropB_x, y: t.dropB_y, z: t.dropB_z };

      setPickA(pA);
      setDropA(dA);
      setPickB(pB);
      setDropB(dB);
      localStorage.setItem('delta_pickA', JSON.stringify(pA));
      localStorage.setItem('delta_dropA', JSON.stringify(dA));
      localStorage.setItem('delta_pickB', JSON.stringify(pB));
      localStorage.setItem('delta_dropB', JSON.stringify(dB));

      setNewTemplateName(name);
      setLogs(prev => [...prev, `[SYSTEM] Template dimuat: ${name}`]);

      await sendCommand(`SET_A_PICK ${t.pickA_x} ${t.pickA_y} ${t.pickA_z}`);
      await sleep(150);
      await sendCommand(`SET_A_DROP ${t.dropA_x} ${t.dropA_y} ${t.dropA_z}`);
      await sleep(150);
      await sendCommand(`SET_B_PICK ${t.pickB_x} ${t.pickB_y} ${t.pickB_z}`);
      await sleep(150);
      await sendCommand(`SET_B_DROP ${t.dropB_x} ${t.dropB_y} ${t.dropB_z}`);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!newTemplateName.trim()) return;
    if (!window.confirm(`Hapus template '${newTemplateName}'?`)) return;

    const token = localStorage.getItem('delta_token');
    try {
      const res = await fetch(`http://localhost:5000/api/templates/${newTemplateName}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.status === 'success') {
        setLogs(prev => [...prev, `[SYSTEM] Template '${newTemplateName}' dihapus.`]);
        setNewTemplateName("");
        fetchTemplates();
      }
    } catch (err) {
      setLogs(prev => [...prev, `[ERROR] Gagal menghapus template`]);
    }
  };

  const handleSaveTemplate = async () => {
    if (!newTemplateName.trim()) return;
    const token = localStorage.getItem('delta_token');
    try {
      const res = await fetch('http://localhost:5000/api/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          template_name: newTemplateName,
          pickA_x: pickA.x, pickA_y: pickA.y, pickA_z: pickA.z,
          dropA_x: dropA.x, dropA_y: dropA.y, dropA_z: dropA.z,
          pickB_x: pickB.x, pickB_y: pickB.y, pickB_z: pickB.z,
          dropB_x: dropB.x, dropB_y: dropB.y, dropB_z: dropB.z
        })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setLogs(prev => [...prev, `[SYSTEM] Template '${newTemplateName}' tersimpan.`]);
        setNewTemplateName("");
        fetchTemplates();
      }
    } catch (err) {
      setLogs(prev => [...prev, `[ERROR] Gagal menyimpan template`]);
    }
  };

  const handleApplyAllCoordinates = async () => {
    setIsApplyingAll(true);
    setLogs(prev => [...prev, `[SYSTEM] Menerapkan seluruh koordinat dan parameter motor ke robot...`]);
    try {
      localStorage.setItem('delta_pickA', JSON.stringify(pickA));
      localStorage.setItem('delta_dropA', JSON.stringify(dropA));
      localStorage.setItem('delta_pickB', JSON.stringify(pickB));
      localStorage.setItem('delta_dropB', JSON.stringify(dropB));
      localStorage.setItem('delta_motor_speed', speedVal);
      localStorage.setItem('delta_motor_accel', accelVal);

      await sendCommand(`SET_A_PICK ${pickA.x} ${pickA.y} ${pickA.z}`);
      await sleep(100);
      await sendCommand(`SET_A_DROP ${dropA.x} ${dropA.y} ${dropA.z}`);
      await sleep(100);
      await sendCommand(`SET_B_PICK ${pickB.x} ${pickB.y} ${pickB.z}`);
      await sleep(100);
      await sendCommand(`SET_B_DROP ${dropB.x} ${dropB.y} ${dropB.z}`);
      await sleep(100);
      await sendCommand(`SET_SPEED ${speedVal}`);
      await sleep(100);
      await sendCommand(`SET_ACCEL ${accelVal}`);

      setLogs(prev => [...prev, `[SYSTEM] Seluruh koordinat Profil A & B serta parameter motor berhasil disinkronkan ke robot.`]);
    } catch (err) {
      setLogs(prev => [...prev, `[ERROR] Gagal menerapkan seluruh koordinat: ${err.message}`]);
    } finally {
      setIsApplyingAll(false);
    }
  };

  const executeStep = async (stepName, profile) => {
    const p = profile === 'A' ? pickA : pickB;
    const d = profile === 'A' ? dropA : dropB;
    const safeZ = -230;

    switch (stepName) {
      case 'approach_pick':
        setLogs(prev => [...prev, `[STEP ${profile}] 1. Pindah ke atas Pick: (${p.x}, ${p.y}, ${safeZ})`]);
        await sendCommand(`${p.x} ${p.y} ${safeZ}`);
        break;
      case 'pick_down':
        setLogs(prev => [...prev, `[STEP ${profile}] 2. Turun ke Pick: (${p.x}, ${p.y}, ${p.z}) + HISAP ON`]);
        await sendCommand(`${p.x} ${p.y} ${p.z}`);
        await sleep(250);
        setRelayActive(true);
        await sendCommand('HISAP');
        break;
      case 'pick_lift':
        setLogs(prev => [...prev, `[STEP ${profile}] 3. Angkat Objek: (${p.x}, ${p.y}, ${safeZ})`]);
        await sendCommand(`${p.x} ${p.y} ${safeZ}`);
        break;
      case 'approach_drop':
        setLogs(prev => [...prev, `[STEP ${profile}] 4. Geser ke atas Drop: (${d.x}, ${d.y}, ${safeZ})`]);
        await sendCommand(`${d.x} ${d.y} ${safeZ}`);
        break;
      case 'drop_down':
        setLogs(prev => [...prev, `[STEP ${profile}] 5. Turun ke Drop: (${d.x}, ${d.y}, ${d.z}) + LEPAS OFF`]);
        await sendCommand(`${d.x} ${d.y} ${d.z}`);
        await sleep(250);
        setRelayActive(false);
        await sendCommand('LEPAS');
        break;
      case 'drop_lift':
        setLogs(prev => [...prev, `[STEP ${profile}] 6. Angkat Selesai: (${d.x}, ${d.y}, ${safeZ})`]);
        await sendCommand(`${d.x} ${d.y} ${safeZ}`);
        break;
      default:
        break;
    }
  };

  const applyGlobalZOffset = (delta) => {
    const newPickA = { ...pickA, z: Math.round((Number(pickA.z) + delta) * 10) / 10 };
    const newDropA = { ...dropA, z: Math.round((Number(dropA.z) + delta) * 10) / 10 };
    const newPickB = { ...pickB, z: Math.round((Number(pickB.z) + delta) * 10) / 10 };
    const newDropB = { ...dropB, z: Math.round((Number(dropB.z) + delta) * 10) / 10 };

    setPickA(newPickA);
    setDropA(newDropA);
    setPickB(newPickB);
    setDropB(newDropB);

    localStorage.setItem('delta_pickA', JSON.stringify(newPickA));
    localStorage.setItem('delta_dropA', JSON.stringify(newDropA));
    localStorage.setItem('delta_pickB', JSON.stringify(newPickB));
    localStorage.setItem('delta_dropB', JSON.stringify(newDropB));

    setLogs(prev => [...prev, `[Z-OFFSET] Seluruh titik Z disesuaikan (${delta > 0 ? '+' : ''}${delta} mm). Klik 'Terapkan Semua' untuk sinkronisasi ke robot.`]);
  };

  const handleStartA = async () => {
    setLogs(prev => [...prev, `[SYSTEM] Sinkronisasi Profil A -> Menjalankan START A...`]);
    await sendCommand(`SET_A_PICK ${pickA.x} ${pickA.y} ${pickA.z}`);
    await sleep(100);
    await sendCommand(`SET_A_DROP ${dropA.x} ${dropA.y} ${dropA.z}`);
    await sleep(100);
    await sendCommand('STARTA');
  };

  const handleStartB = async () => {
    setLogs(prev => [...prev, `[SYSTEM] Sinkronisasi Profil B -> Menjalankan START B...`]);
    await sendCommand(`SET_B_PICK ${pickB.x} ${pickB.y} ${pickB.z}`);
    await sleep(100);
    await sendCommand(`SET_B_DROP ${dropB.x} ${dropB.y} ${dropB.z}`);
    await sleep(100);
    await sendCommand('STARTB');
  };

  return (
    <div className="dashboard-layout">
      {/* TOPBAR */}
      <header className="topbar">
        <div className="logo">
          <span>DELTA ROBOT OS</span>
        </div>

        <div className="topbar-actions">
          {/* Connection Indicator Badge */}
          {connectionMode === 'wifi' ? (
            <div
              className={`conn-badge ${espStatus.status === 'connected' ? 'online' : (espStatus.status === 'ap_mode' ? 'ap' : 'offline')}`}
              onClick={() => setIsWifiModalOpen(true)}
              title="Pengaturan Wi-Fi & ESP32"
            >
              {espStatus.status === 'connected' ? <Wifi size={13} /> : (espStatus.status === 'ap_mode' ? <Radio size={13} /> : <WifiOff size={13} />)}
              <span>
                {espStatus.status === 'connected' ? `${espStatus.ssid || espStatus.ip}` : (espStatus.status === 'ap_mode' ? 'MODE AP' : 'ESP32 OFFLINE')}
              </span>
            </div>
          ) : (
            <div
              className="conn-badge"
              onClick={() => setIsWifiModalOpen(true)}
              title="Mode Server Backend (Serial USB)"
            >
              <Server size={13} />
              <span>SERIAL COM</span>
            </div>
          )}

          {/* Wi-Fi Setup Button */}
          <button
            className="wifi-topbar-btn"
            onClick={() => {
              setIsWifiModalOpen(true);
              if (connectionMode === 'wifi') checkEspStatus();
            }}
          >
            Wi-Fi & Node
          </button>

          {/* OTA Firmware Update Button */}
          <button
            className="wifi-topbar-btn"
            style={{ display: 'flex', alignItems: 'center', gap: '5px', borderColor: 'rgba(56, 189, 248, 0.4)' }}
            onClick={() => setIsOtaModalOpen(true)}
            title="Update Firmware ESP32 Nirkabel (OTA)"
          >
            <UploadCloud size={13} />
            <span>OTA Update</span>
          </button>

          {/* Theme Switcher */}
          <ThemeToggle />

          <div className="user-badge">
            <span>{localStorage.getItem('delta_user')}</span>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      {/* DASHBOARD GRID */}
      <div className="dashboard-grid">
        {/* LEFT PANEL: ROBOT CONTROLS */}
        <aside className="panel left-panel">
          <div className="panel-header-title">
            KONTROL UTAMA
          </div>

          {/* Card 1: Quick Command Grid */}
          <div className="section-card">
            <div className="section-title">
              AKSI CEPAT
            </div>
            <div className="clean-btn-grid">
              <button className="clean-btn primary" onClick={() => sendCommand('HOME')}>
                HOME
              </button>
              <button
                className={`clean-btn ${relayActive ? 'primary' : 'warning'}`}
                onClick={() => {
                  setRelayActive(true);
                  sendCommand('HISAP');
                }}
              >
                HISAP
              </button>
              <button
                className="clean-btn"
                onClick={() => {
                  setRelayActive(false);
                  sendCommand('LEPAS');
                }}
              >
                LEPAS
              </button>
              <button className="clean-btn primary" onClick={handleStartA}>
                START A
              </button>
              <button className="clean-btn primary" onClick={handleStartB}>
                START B
              </button>
              <button 
                className="clean-btn" 
                onClick={() => sendCommand('0 0 -200')}
                title="Pindah cepat ke posisi tengah siap kerja (0, 0, -200)"
              >
                STANDBY
              </button>
            </div>

            <div style={{ display: 'flex', gap: '4px', marginTop: '3px' }}>
              <button 
                className="clean-btn danger" 
                onClick={() => sendCommand('EMG')} 
                style={{ flex: 1, padding: '6px 2px', fontWeight: 700 }}
              >
                EMG
              </button>
              <button 
                className="clean-btn primary" 
                onClick={() => sendCommand(`${pos.x} ${pos.y} -200`)} 
                style={{ flex: 1, padding: '6px 2px', fontSize: '0.72rem' }}
                title="Angkat lengan ke posisi aman Z = -200"
              >
                AMAN (Z-200)
              </button>
              <button 
                className="clean-btn" 
                onClick={() => sendCommand('HOME')} 
                style={{ flex: 1, padding: '6px 2px' }}
              >
                RESET
              </button>
            </div>
          </div>

          {/* Card 2: Suction Cup (Vakum) & Sensor Autonomy */}
          <div className="section-card">
            <div className="section-title">
              <span>SENSOR & DINAMO HISAP</span>
              <button
                className={`clean-btn ${isAutonomous ? 'primary' : ''}`}
                style={{ padding: '3px 8px', fontSize: '0.7rem' }}
                onClick={() => {
                  const newState = !isAutonomous;
                  setIsAutonomous(newState);
                  localStorage.setItem('delta_auto_mode', newState);
                  sendCommand(`SET_AUTO ${newState ? 'ON' : 'OFF'}`);
                }}
              >
                {isAutonomous ? 'AUTO ON' : 'AUTO OFF'}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Suction Cup (Vakum D12):</span>
                <span className="slider-value-chip" style={{ color: relayActive ? 'var(--accent-color)' : 'var(--text-muted)' }}>
                  {relayActive ? 'AKTIF (ON)' : 'STANDBY (OFF)'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <button
                  className={`clean-btn ${relayActive ? 'primary' : ''}`}
                  style={{ padding: '8px', fontSize: '0.75rem', fontWeight: 600 }}
                  onClick={() => {
                    setRelayActive(true);
                    sendCommand('HISAP');
                  }}
                >
                  HISAP (ON)
                </button>
                <button
                  className="clean-btn"
                  style={{ padding: '8px', fontSize: '0.75rem' }}
                  onClick={() => {
                    setRelayActive(false);
                    sendCommand('LEPAS');
                  }}
                >
                  BUANG (OFF)
                </button>
              </div>
            </div>
          </div>

          {/* Card 3: Jogging Controls (Absolute & Step Relative) */}
          <div className="section-card">
            <div className="section-title">
              <span>MANUAL JOGGING</span>
              <div className="step-selector">
                {[1, 5, 10, 25].map(s => (
                  <button
                    key={s}
                    className={`step-btn ${jogStep === s ? 'active' : ''}`}
                    onClick={() => {
                      setJogStep(s);
                      localStorage.setItem('delta_jog_step', s);
                    }}
                  >
                    {s}mm
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleManualMove} className="coord-form">
              <input type="number" name="x" placeholder="X" required defaultValue={pos.x} />
              <input type="number" name="y" placeholder="Y" required defaultValue={pos.y} />
              <input type="number" name="z" placeholder="Z" required defaultValue={pos.z} />
              <button type="submit">GO</button>
            </form>

            {/* D-Pad Jogging */}
            <div className="jog-container" style={{ marginTop: '2px' }}>
              <button className="jog-btn" onClick={() => sendCommand(`${pos.x - jogStep} ${pos.y} ${pos.z}`)}>
                X-
              </button>
              <button className="jog-btn" onClick={() => sendCommand(`${pos.x} ${pos.y - jogStep} ${pos.z}`)}>
                Y+
              </button>
              <button className="jog-btn" onClick={() => sendCommand(`${pos.x + jogStep} ${pos.y} ${pos.z}`)}>
                X+
              </button>
              <button className="jog-btn" onClick={() => sendCommand(`${pos.x} ${pos.y} ${pos.z + jogStep}`)}>
                Z+
              </button>
              <button className="jog-btn" onClick={() => sendCommand(`${pos.x} ${pos.y + jogStep} ${pos.z}`)}>
                Y-
              </button>
              <button className="jog-btn" onClick={() => sendCommand(`${pos.x} ${pos.y} ${pos.z - jogStep}`)}>
                Z-
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', fontSize: '0.7rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Shortcut Keyboard:</span>
              <button
                className={`clean-btn ${isKeyJogActive ? 'primary' : ''}`}
                style={{ padding: '2px 8px', fontSize: '0.68rem' }}
                onClick={() => {
                  const next = !isKeyJogActive;
                  setIsKeyJogActive(next);
                  localStorage.setItem('delta_key_jog', next);
                }}
              >
                {isKeyJogActive ? 'AKTIF' : 'NONAKTIF'}
              </button>
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center', background: 'var(--card-bg)', padding: '4px', borderRadius: '4px', marginTop: '4px' }}>
              A/D: X | W/S: Y | Q/E: Z | Spasi: Capit | ESC: Stop
            </div>
          </div>

          {/* Card 4: Motor Dynamics (Speed & Acceleration) */}
          <div className="section-card">
            <div className="section-title">
              <span>DINAMIKA MOTOR</span>
              <button
                className="clean-btn primary"
                style={{ padding: '2px 8px', fontSize: '0.68rem' }}
                onClick={() => {
                  sendCommand(`SET_SPEED ${speedVal}`);
                  sendCommand(`SET_ACCEL ${accelVal}`);
                  setLogs(prev => [...prev, `[MOTOR] Kecepatan (${speedVal} spd) & Akselerasi (${accelVal} acc) disinkronkan ke robot.`]);
                }}
              >
                Terapkan
              </button>
            </div>
            <div className="slider-container">
              <div className="slider-labels">
                <span>Kecepatan Stepper</span>
                <span className="slider-value-chip">{speedVal} spd</span>
              </div>
              <input
                type="range"
                min="100" max="1200" step="50"
                value={speedVal}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  setSpeedVal(v);
                  localStorage.setItem('delta_motor_speed', v);
                }}
                onMouseUp={() => sendCommand(`SET_SPEED ${speedVal}`)}
                onTouchEnd={() => sendCommand(`SET_SPEED ${speedVal}`)}
              />
            </div>
            <div className="slider-container">
              <div className="slider-labels">
                <span>Akselerasi</span>
                <span className="slider-value-chip">{accelVal} acc</span>
              </div>
              <input
                type="range"
                min="100" max="1000" step="50"
                value={accelVal}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  setAccelVal(v);
                  localStorage.setItem('delta_motor_accel', v);
                }}
                onMouseUp={() => sendCommand(`SET_ACCEL ${accelVal}`)}
                onTouchEnd={() => sendCommand(`SET_ACCEL ${accelVal}`)}
              />
            </div>
          </div>

          {/* Card 5: Trajectory Test Pattern Generator */}
          <div className="section-card">
            <div className="section-title">
              <span>TEST LINTASAN GEOMETRIS</span>
              {isPlayingPattern && <span style={{ color: 'var(--accent-color)', fontSize: '0.68rem', fontWeight: 700 }}>RUNNING...</span>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
              <button
                className="clean-btn"
                disabled={isPlayingPattern}
                onClick={() => runTestPattern('circle')}
                style={{ padding: '6px 2px', fontSize: '0.68rem' }}
              >
                Lingkaran
              </button>
              <button
                className="clean-btn"
                disabled={isPlayingPattern}
                onClick={() => runTestPattern('square')}
                style={{ padding: '6px 2px', fontSize: '0.68rem' }}
              >
                Persegi
              </button>
              <button
                className="clean-btn"
                disabled={isPlayingPattern}
                onClick={() => runTestPattern('triangle')}
                style={{ padding: '6px 2px', fontSize: '0.68rem' }}
              >
                Segitiga
              </button>
            </div>
          </div>

          {/* Card 4: 3D Alignment */}
          <div className="section-card">
            <div className="section-title">
              PENYELARASAN MODEL 3D
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.72rem' }}>
              <div className="slider-labels">
                <span>Rotasi X:{stlRot.x}° | Y:{stlRot.y}° | Z:{stlRot.z}°</span>
              </div>
              <div style={{ display: 'flex', gap: '3px' }}>
                <input type="range" min="-180" max="180" value={stlRot.x} onChange={e => setStlRot({ ...stlRot, x: parseInt(e.target.value) })} title="Rotasi X" />
                <input type="range" min="-180" max="180" value={stlRot.y} onChange={e => setStlRot({ ...stlRot, y: parseInt(e.target.value) })} title="Rotasi Y" />
                <input type="range" min="-180" max="180" value={stlRot.z} onChange={e => setStlRot({ ...stlRot, z: parseInt(e.target.value) })} title="Rotasi Z" />
              </div>

              <div className="slider-labels">
                <span>Posisi X:{stlPos.x} | Y:{stlPos.y} | Z:{stlPos.z}</span>
              </div>
              <div style={{ display: 'flex', gap: '3px' }}>
                <input type="range" min="-200" max="200" value={stlPos.x} onChange={e => setStlPos({ ...stlPos, x: parseInt(e.target.value) })} title="Posisi X" />
                <input type="range" min="-200" max="200" value={stlPos.y} onChange={e => setStlPos({ ...stlPos, y: parseInt(e.target.value) })} title="Posisi Y" />
                <input type="range" min="-200" max="200" value={stlPos.z} onChange={e => setStlPos({ ...stlPos, z: parseInt(e.target.value) })} title="Posisi Z" />
              </div>

              <div className="slider-labels">
                <span>Skala 3D: {stlScale}</span>
              </div>
              <input type="range" min="0.1" max="5" step="0.1" value={stlScale} onChange={e => setStlScale(parseFloat(e.target.value))} />

              <button className="clean-btn primary" onClick={save3DLayout} style={{ marginTop: '2px', padding: '6px' }}>
                Simpan Layout 3D
              </button>
            </div>
          </div>
        </aside>

        {/* CENTER VIEW: 3D LIVE WORKSPACE */}
        <main className="center-view">
          <div className="viewer-topbar">
            <div className="viewer-info-left">
              <span>3D WORKSPACE</span>
              <span style={{ color: 'var(--text-muted)' }}>|</span>
              <span>X: <strong style={{ color: 'var(--accent-color)' }}>{pos.x}</strong> Y: <strong style={{ color: 'var(--accent-color)' }}>{pos.y}</strong> Z: <strong style={{ color: 'var(--accent-color)' }}>{pos.z}</strong></span>
              <span style={{ color: 'var(--text-muted)' }}>|</span>
              <span style={{ color: 'var(--accent-color)', fontFamily: 'JetBrains Mono, monospace' }}>
                CAM: [{camInfo.x}, {camInfo.y}, {camInfo.z}]
              </span>
            </div>

            <div className="viewer-controls-right">
              <button className={`cam-btn ${activeView === 'iso' ? 'active' : ''}`} onClick={() => flyTo('iso')}>ISO</button>
              <button className={`cam-btn ${activeView === 'top' ? 'active' : ''}`} onClick={() => flyTo('top')}>TOP</button>
              <button className={`cam-btn ${activeView === 'front' ? 'active' : ''}`} onClick={() => flyTo('front')}>FRONT</button>
              <button className={`cam-btn ${activeView === 'right' ? 'active' : ''}`} onClick={() => flyTo('right')}>RIGHT</button>
              <button className={`cam-btn ${isCameraLocked ? 'active' : ''}`} onClick={() => setIsCameraLocked(!isCameraLocked)}>
                {isCameraLocked ? 'LOCKED' : 'LOCK'}
              </button>
              <button
                className={`cam-btn ${showMarkers ? 'active' : ''}`}
                onClick={() => {
                  const next = !showMarkers;
                  setShowMarkers(next);
                  localStorage.setItem('delta_show_markers', next);
                }}
                title="Tampilkan / Sembunyikan Titik Target Pick & Drop di Visualizer 3D"
              >
                {showMarkers ? 'TARGETS: ON' : 'TARGETS: OFF'}
              </button>
              <button className="cam-btn save-view-btn" onClick={saveCurrentCameraView} title="Simpan sudut kamera saat ini sebagai default">
                SIMPAN VIEW
              </button>
            </div>
          </div>

          <div className="canvas-container">
            <Canvas camera={{ position: [savedCam.x, savedCam.y, savedCam.z], fov: 45 }}>
              <ambientLight intensity={resolvedTheme === 'light' ? 0.9 : 0.6} />
              <directionalLight position={[100, 200, 50]} intensity={resolvedTheme === 'light' ? 1.6 : 1.4} />
              <CameraControls ref={cameraControlsRef} makeDefault enabled={!isCameraLocked} />
              <CameraReporter onChange={setCamInfo} controlsRef={cameraControlsRef} />

              <Grid
                args={[500, 500]}
                cellSize={25}
                cellThickness={0.8}
                cellColor={resolvedTheme === 'light' ? '#e2e8f0' : 'rgba(255, 255, 255, 0.08)'}
                sectionSize={100}
                sectionThickness={1.2}
                sectionColor={resolvedTheme === 'light' ? '#059669' : '#00ff88'}
                fadeDistance={1000}
              />
              <axesHelper args={[120]} />

              {/* End-Effector Live Target Position Marker */}
              <Sphere args={[8, 16, 16]} position={[pos.x, pos.z, -pos.y]}>
                <meshStandardMaterial color="#f43f5e" emissive="#f43f5e" emissiveIntensity={0.8} />
              </Sphere>

              {/* Target Position Visual Markers (Pick & Drop Profil A & B) */}
              <CoordinateMarker position={pickA} color="#22c55e" label="Pick A" visible={showMarkers} />
              <CoordinateMarker position={dropA} color="#06b6d4" label="Drop A" visible={showMarkers} />
              <CoordinateMarker position={pickB} color="#f59e0b" label="Pick B" visible={showMarkers} />
              <CoordinateMarker position={dropB} color="#a855f7" label="Drop B" visible={showMarkers} />

              {/* High-Fidelity Robot 3D STL CAD Model */}
              <Suspense fallback={
                <mesh position={[0, -225, 0]}>
                  <cylinderGeometry args={[150, 150, 350, 32]} />
                  <meshBasicMaterial color={resolvedTheme === 'light' ? '#059669' : '#00ff88'} wireframe transparent opacity={0.05} />
                </mesh>
              }>
                <RobotBase scale={stlScale} position={stlPos} rotation={stlRot} />
              </Suspense>
            </Canvas>
          </div>
        </main>

        {/* RIGHT PANEL: COORDINATES & TERMINAL */}
        <aside className="panel right-panel">
          <div className="panel-header-title">
            SEKUENSI & LOG SISTEM
          </div>

          {/* Card 1: Templates */}
          <div className="section-card">
            <div className="section-title">
              TEMPLATE KOORDINAT
            </div>
            <select onChange={handleSelectTemplate} value={newTemplateName || ""}>
              <option value="" disabled>-- Pilih Template Koordinat ({templates.length} Tersedia) --</option>
              {templates.map(t => (
                <option key={t.id || t.template_name} value={t.template_name}>
                  {t.template_name}
                </option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: '5px' }}>
              <input
                type="text"
                placeholder="Nama Template Baru"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                style={{ flexGrow: 1 }}
              />
              <button className="clean-btn primary" onClick={handleSaveTemplate} style={{ padding: '6px 10px' }}>
                Simpan
              </button>
              <button className="clean-btn danger" onClick={handleDeleteTemplate} style={{ padding: '6px 10px' }}>
                Hapus
              </button>
            </div>

            <button
              className="clean-btn primary"
              onClick={handleApplyAllCoordinates}
              disabled={isApplyingAll}
              style={{ width: '100%', marginTop: '6px', padding: '8px', fontWeight: 600 }}
            >
              {isApplyingAll ? 'Menerapkan ke Robot...' : 'Terapkan Semua Koordinat ke Robot'}
            </button>

            {/* Global Z-Offset Adjuster */}
            <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>Koreksi Ketinggian Z (Global Offset):</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '3px' }}>
                <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '4px 1px' }} onClick={() => applyGlobalZOffset(-10)} title="Turunkan seluruh titik Z sebesar 10mm">
                  -10mm
                </button>
                <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '4px 1px' }} onClick={() => applyGlobalZOffset(-5)} title="Turunkan seluruh titik Z sebesar 5mm">
                  -5mm
                </button>
                <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '4px 1px' }} onClick={() => applyGlobalZOffset(-1)} title="Turunkan seluruh titik Z sebesar 1mm">
                  -1mm
                </button>
                <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '4px 1px' }} onClick={() => applyGlobalZOffset(1)} title="Naikkan seluruh titik Z sebesar 1mm">
                  +1mm
                </button>
                <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '4px 1px' }} onClick={() => applyGlobalZOffset(5)} title="Naikkan seluruh titik Z sebesar 5mm">
                  +5mm
                </button>
                <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '4px 1px' }} onClick={() => applyGlobalZOffset(10)} title="Naikkan seluruh titik Z sebesar 10mm">
                  +10mm
                </button>
              </div>
            </div>
          </div>

          {/* Card 2: Profile A */}
          <div className="section-card">
            <div className="section-title">
              <span>PROFIL A (PICK & DROP)</span>
              <button
                className="clean-btn"
                style={{ padding: '2px 6px', fontSize: '0.68rem' }}
                onClick={handleStartA}
              >
                Test Routine A
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                <span>Titik Ambil (Pick A):</span>
                <span style={{ color: 'var(--accent-color)', cursor: 'pointer' }} onClick={() => sendCommand(`${pickA.x} ${pickA.y} ${pickA.z}`)}>Gerak ke Pick A</span>
              </div>
              <div className="coord-row">
                <input type="number" value={pickA.x} onChange={e => { const v = { ...pickA, x: e.target.value }; setPickA(v); localStorage.setItem('delta_pickA', JSON.stringify(v)); }} placeholder="X" />
                <input type="number" value={pickA.y} onChange={e => { const v = { ...pickA, y: e.target.value }; setPickA(v); localStorage.setItem('delta_pickA', JSON.stringify(v)); }} placeholder="Y" />
                <input type="number" value={pickA.z} onChange={e => { const v = { ...pickA, z: e.target.value }; setPickA(v); localStorage.setItem('delta_pickA', JSON.stringify(v)); }} placeholder="Z" />
                <button className="clean-btn action-btn" onClick={() => { const v = { x: pos.x, y: pos.y, z: pos.z }; setPickA(v); localStorage.setItem('delta_pickA', JSON.stringify(v)); }}>GET</button>
                <button className="clean-btn primary action-btn" onClick={() => { localStorage.setItem('delta_pickA', JSON.stringify(pickA)); sendCommand(`SET_A_PICK ${pickA.x} ${pickA.y} ${pickA.z}`); }}>SET</button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                <span>Titik Letak (Drop A):</span>
                <span style={{ color: 'var(--accent-color)', cursor: 'pointer' }} onClick={() => sendCommand(`${dropA.x} ${dropA.y} ${dropA.z}`)}>Gerak ke Drop A</span>
              </div>
              <div className="coord-row">
                <input type="number" value={dropA.x} onChange={e => { const v = { ...dropA, x: e.target.value }; setDropA(v); localStorage.setItem('delta_dropA', JSON.stringify(v)); }} placeholder="X" />
                <input type="number" value={dropA.y} onChange={e => { const v = { ...dropA, y: e.target.value }; setDropA(v); localStorage.setItem('delta_dropA', JSON.stringify(v)); }} placeholder="Y" />
                <input type="number" value={dropA.z} onChange={e => { const v = { ...dropA, z: e.target.value }; setDropA(v); localStorage.setItem('delta_dropA', JSON.stringify(v)); }} placeholder="Z" />
                <button className="clean-btn action-btn" onClick={() => { const v = { x: pos.x, y: pos.y, z: pos.z }; setDropA(v); localStorage.setItem('delta_dropA', JSON.stringify(v)); }}>GET</button>
                <button className="clean-btn primary action-btn" onClick={() => { localStorage.setItem('delta_dropA', JSON.stringify(dropA)); sendCommand(`SET_A_DROP ${dropA.x} ${dropA.y} ${dropA.z}`); }}>SET</button>
              </div>

              {/* Step by Step Sequencer A */}
              <div style={{ marginTop: '6px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '6px' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600 }}>
                  Uji Langkah per Langkah (Profil A):
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                  <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '5px 2px' }} onClick={() => executeStep('approach_pick', 'A')}>
                    1. Atas Pick
                  </button>
                  <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '5px 2px' }} onClick={() => executeStep('pick_down', 'A')}>
                    2. Ambil (Hisap)
                  </button>
                  <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '5px 2px' }} onClick={() => executeStep('pick_lift', 'A')}>
                    3. Angkat
                  </button>
                  <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '5px 2px' }} onClick={() => executeStep('approach_drop', 'A')}>
                    4. Atas Drop
                  </button>
                  <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '5px 2px' }} onClick={() => executeStep('drop_down', 'A')}>
                    5. Letak (Buang)
                  </button>
                  <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '5px 2px' }} onClick={() => executeStep('drop_lift', 'A')}>
                    6. Selesai
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Profile B */}
          <div className="section-card">
            <div className="section-title">
              <span>PROFIL B (PICK & DROP)</span>
              <button
                className="clean-btn"
                style={{ padding: '2px 6px', fontSize: '0.68rem' }}
                onClick={handleStartB}
              >
                Test Routine B
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                <span>Titik Ambil (Pick B):</span>
                <span style={{ color: 'var(--accent-color)', cursor: 'pointer' }} onClick={() => sendCommand(`${pickB.x} ${pickB.y} ${pickB.z}`)}>Gerak ke Pick B</span>
              </div>
              <div className="coord-row">
                <input type="number" value={pickB.x} onChange={e => { const v = { ...pickB, x: e.target.value }; setPickB(v); localStorage.setItem('delta_pickB', JSON.stringify(v)); }} placeholder="X" />
                <input type="number" value={pickB.y} onChange={e => { const v = { ...pickB, y: e.target.value }; setPickB(v); localStorage.setItem('delta_pickB', JSON.stringify(v)); }} placeholder="Y" />
                <input type="number" value={pickB.z} onChange={e => { const v = { ...pickB, z: e.target.value }; setPickB(v); localStorage.setItem('delta_pickB', JSON.stringify(v)); }} placeholder="Z" />
                <button className="clean-btn action-btn" onClick={() => { const v = { x: pos.x, y: pos.y, z: pos.z }; setPickB(v); localStorage.setItem('delta_pickB', JSON.stringify(v)); }}>GET</button>
                <button className="clean-btn primary action-btn" onClick={() => { localStorage.setItem('delta_pickB', JSON.stringify(pickB)); sendCommand(`SET_B_PICK ${pickB.x} ${pickB.y} ${pickB.z}`); }}>SET</button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                <span>Titik Letak (Drop B):</span>
                <span style={{ color: 'var(--accent-color)', cursor: 'pointer' }} onClick={() => sendCommand(`${dropB.x} ${dropB.y} ${dropB.z}`)}>Gerak ke Drop B</span>
              </div>
              <div className="coord-row">
                <input type="number" value={dropB.x} onChange={e => { const v = { ...dropB, x: e.target.value }; setDropB(v); localStorage.setItem('delta_dropB', JSON.stringify(v)); }} placeholder="X" />
                <input type="number" value={dropB.y} onChange={e => { const v = { ...dropB, y: e.target.value }; setDropB(v); localStorage.setItem('delta_dropB', JSON.stringify(v)); }} placeholder="Y" />
                <input type="number" value={dropB.z} onChange={e => { const v = { ...dropB, z: e.target.value }; setDropB(v); localStorage.setItem('delta_dropB', JSON.stringify(v)); }} placeholder="Z" />
                <button className="clean-btn action-btn" onClick={() => { const v = { x: pos.x, y: pos.y, z: pos.z }; setDropB(v); localStorage.setItem('delta_dropB', JSON.stringify(v)); }}>GET</button>
                <button className="clean-btn primary action-btn" onClick={() => { localStorage.setItem('delta_dropB', JSON.stringify(dropB)); sendCommand(`SET_B_DROP ${dropB.x} ${dropB.y} ${dropB.z}`); }}>SET</button>
              </div>

              {/* Step by Step Sequencer B */}
              <div style={{ marginTop: '6px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '6px' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600 }}>
                  Uji Langkah per Langkah (Profil B):
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                  <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '5px 2px' }} onClick={() => executeStep('approach_pick', 'B')}>
                    1. Atas Pick
                  </button>
                  <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '5px 2px' }} onClick={() => executeStep('pick_down', 'B')}>
                    2. Ambil (Hisap)
                  </button>
                  <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '5px 2px' }} onClick={() => executeStep('pick_lift', 'B')}>
                    3. Angkat
                  </button>
                  <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '5px 2px' }} onClick={() => executeStep('approach_drop', 'B')}>
                    4. Atas Drop
                  </button>
                  <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '5px 2px' }} onClick={() => executeStep('drop_down', 'B')}>
                    5. Letak (Buang)
                  </button>
                  <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '5px 2px' }} onClick={() => executeStep('drop_lift', 'B')}>
                    6. Selesai
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: Terminal */}
          <div className="section-card" style={{ flexGrow: 1 }}>
            <div className="section-title">
              <span>TERMINAL LOG</span>
              <button
                onClick={() => setLogs(["[SYSTEM] Log dibersihkan."])}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.7rem', cursor: 'pointer' }}
              >
                Clear
              </button>
            </div>
            <div className="terminal">
              {logs.map((log, i) => (
                <div key={i} className="log-line">{log}</div>
              ))}
              <div ref={logsEndRef} />
            </div>
            <div className="terminal-input-container">
              <span className="prompt">{">"}</span>
              <input
                type="text"
                className="terminal-input"
                placeholder="Ketik perintah (HOME, CAPIT, LEPAS, STARTA, X Y Z)..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    sendCommand(e.target.value);
                    e.target.value = '';
                  }
                }}
              />
            </div>
          </div>
        </aside>
      </div>

      {/* WIFI & CONNECTION MANAGER MODAL */}
      {isWifiModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsWifiModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                Konfigurasi Wi-Fi & Node ESP32
              </div>
              <button className="modal-close-btn" onClick={() => setIsWifiModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {/* Mode Selector */}
              <div>
                <label className="info-text" style={{ marginBottom: '6px', display: 'block', fontWeight: '600' }}>Metode Komunikasi Robot:</label>
                <div className="mode-selector">
                  <button
                    className={`mode-btn ${connectionMode === 'wifi' ? 'active' : ''}`}
                    onClick={() => handleSaveConnectionSettings('wifi', espIp)}
                  >
                    ESP32 Wi-Fi Direct
                  </button>
                  <button
                    className={`mode-btn ${connectionMode === 'backend' ? 'active' : ''}`}
                    onClick={() => handleSaveConnectionSettings('backend', espIp)}
                  >
                    Backend Serial USB
                  </button>
                </div>
              </div>

              {/* Sub-Tab Wi-Fi: AP Mandiri vs Hotspot/Client */}
              {connectionMode === 'wifi' && (
                <div style={{ marginTop: '10px' }}>
                  <label className="info-text" style={{ marginBottom: '6px', display: 'block', fontWeight: '600' }}>Pilih Mode Jaringan ESP32:</label>
                  <div className="mode-selector" style={{ background: 'rgba(0,0,0,0.3)', padding: '3px', borderRadius: '8px' }}>
                    <button
                      type="button"
                      className={`mode-btn ${wifiSubTab === 'hotspot' ? 'active' : ''}`}
                      onClick={() => {
                        setWifiSubTab('hotspot');
                        if (espIp === 'http://192.168.4.1') {
                          setEspIp('http://deltarobot.local');
                          handleSaveConnectionSettings('wifi', 'http://deltarobot.local');
                        }
                      }}
                      style={{ fontSize: '0.8rem', padding: '7px' }}
                    >
                      Mode Hotspot HP / Wi-Fi
                    </button>
                    <button
                      type="button"
                      className={`mode-btn ${wifiSubTab === 'ap' ? 'active' : ''}`}
                      onClick={() => {
                        setWifiSubTab('ap');
                        setEspIp('http://192.168.4.1');
                        handleSaveConnectionSettings('wifi', 'http://192.168.4.1');
                      }}
                      style={{ fontSize: '0.8rem', padding: '7px' }}
                    >
                      Mode AP Mandiri (192.168.4.1)
                    </button>
                  </div>
                </div>
              )}

              {/* VIEW 1: MODE AP MANDIRI */}
              {connectionMode === 'wifi' && wifiSubTab === 'ap' && (
                <div className="config-card" style={{ border: '1px solid rgba(0, 255, 136, 0.3)' }}>
                  <div className="config-card-title">
                    <span>Access Point Mandiri (Offline)</span>
                    <span className={`status-badge-inline ${espStatus.status === 'connected' || espStatus.status === 'ap_mode' ? 'online' : 'offline'}`}>
                      {espStatus.status === 'ap_mode' || espStatus.status === 'connected' ? 'MODE AP' : 'OFFLINE'}
                    </span>
                  </div>

                  <div style={{ background: 'rgba(0,0,0,0.25)', padding: '10px 12px', borderRadius: '6px', fontSize: '0.82rem', marginBottom: '12px', lineHeight: '1.6' }}>
                    <div><strong>Nama Wi-Fi (SSID):</strong> <code style={{ color: 'var(--accent-color)' }}>DeltaRobot_Config</code></div>
                    <div><strong>Password:</strong> <code style={{ color: 'var(--accent-color)' }}>12345678</code></div>
                    <div><strong>IP Address:</strong> <code style={{ color: 'var(--accent-color)' }}>http://192.168.4.1</code></div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      className="clean-btn primary"
                      onClick={() => {
                        handleSaveConnectionSettings('wifi', 'http://192.168.4.1');
                        checkEspStatus('http://192.168.4.1');
                      }}
                      style={{ flex: 1, padding: '9px', fontWeight: 600 }}
                      disabled={isCheckingEsp}
                    >
                      {isCheckingEsp ? 'Memeriksa...' : 'Sambungkan ke AP (192.168.4.1)'}
                    </button>
                    <button
                      type="button"
                      className="clean-btn"
                      onClick={() => {
                        handleSaveConnectionSettings('wifi', 'http://deltarobot.local');
                        checkEspStatus('http://deltarobot.local');
                      }}
                      style={{ padding: '9px 12px' }}
                    >
                      mDNS
                    </button>
                  </div>

                  <div className="guide-step" style={{ marginTop: '10px' }}>
                    <strong>Panduan:</strong> Hubungkan Wi-Fi laptop ke <strong>DeltaRobot_Config</strong> (Password: <code>12345678</code>), lalu klik tombol Sambungkan di atas.
                  </div>
                </div>
              )}

              {/* VIEW 2: MODE HOTSPOT HP / WI-FI CLIENT */}
              {connectionMode === 'wifi' && wifiSubTab === 'hotspot' && (
                <>
                  <div className="config-card">
                    <div className="config-card-title">
                      <span>Alamat IP / Host ESP32</span>
                      <span className={`status-badge-inline ${espStatus.status === 'connected' ? 'online' : (espStatus.status === 'ap_mode' ? 'ap' : 'offline')}`}>
                        {espStatus.status === 'connected' ? 'TERHUBUNG' : (espStatus.status === 'ap_mode' ? 'MODE AP' : 'OFFLINE')}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        type="text"
                        value={espIp}
                        onChange={e => {
                          const v = e.target.value;
                          setEspIp(v);
                          localStorage.setItem('delta_esp_ip', v);
                        }}
                        placeholder="http://deltarobot.local atau http://192.168.4.1"
                        style={{ flexGrow: 1, marginBottom: 0 }}
                      />
                      <button
                        className="clean-btn primary"
                        onClick={() => {
                          handleSaveConnectionSettings('wifi', espIp);
                          checkEspStatus(espIp);
                        }}
                        style={{ padding: '6px 14px' }}
                        disabled={isCheckingEsp}
                      >
                        {isCheckingEsp ? 'PING...' : 'TEST'}
                      </button>
                    </div>

                    <div className="quick-ips">
                      <button className="quick-ip-btn" onClick={() => { setEspIp('http://deltarobot.local'); handleSaveConnectionSettings('wifi', 'http://deltarobot.local'); checkEspStatus('http://deltarobot.local'); }}>
                        deltarobot.local (mDNS)
                      </button>
                      <button className="quick-ip-btn" onClick={() => { setEspIp('http://192.168.4.1'); handleSaveConnectionSettings('wifi', 'http://192.168.4.1'); checkEspStatus('http://192.168.4.1'); }}>
                        AP Mandiri (192.168.4.1)
                      </button>
                    </div>

                    {espStatus.status === 'connected' && (
                      <div style={{ marginTop: '8px', fontSize: '0.78rem', color: 'var(--success-color)' }}>
                        Terhubung: <strong>{espStatus.ssid}</strong> ({espStatus.rssi} dBm)
                      </div>
                    )}
                  </div>

                  {/* Wi-Fi Portal Launcher Card */}
                  <div className="config-card" style={{ border: '1px solid rgba(0, 255, 136, 0.3)' }}>
                    <div className="config-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Atur & Sambung Wi-Fi ESP32</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--accent-color)', fontWeight: 600 }}>Web Portal</span>
                    </div>

                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 10px 0', lineHeight: 1.4 }}>
                      Pindai Wi-Fi sekitar, pilih SSID, dan simpan password melalui portal bawaan ESP32 secara instan tanpa kendala CORS.
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <a
                        href={`${espIp.replace(/\/$/, '')}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="clean-btn primary"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '10px',
                          fontSize: '0.85rem',
                          textDecoration: 'none',
                          fontWeight: 'bold',
                          background: 'rgba(0, 255, 136, 0.15)',
                          borderColor: '#00ff88',
                          color: '#00ff88'
                        }}
                      >
                        <span>Buka Portal Pengaturan Wi-Fi ({espIp})</span>
                        <ExternalLink size={14} />
                      </a>

                      <a
                        href="http://192.168.4.1/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="clean-btn"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '8px',
                          fontSize: '0.78rem',
                          textDecoration: 'none',
                          color: 'var(--text-muted)'
                        }}
                      >
                        <span>Buka via Mode AP Mandiri (http://192.168.4.1)</span>
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                </>
              )}

              {/* OTA Firmware Update Card */}
              <div className="config-card" style={{ border: '1px solid rgba(56, 189, 248, 0.3)', marginTop: '10px' }}>
                <div className="config-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Update Firmware ESP32 (OTA)</span>
                  <span style={{ fontSize: '0.7rem', color: '#38bdf8', fontWeight: 600 }}>Nirkabel</span>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 10px 0', lineHeight: 1.4 }}>
                  Perbarui program ESP32 melalui Wi-Fi tanpa mencolokkan kabel USB.
                </p>
                <button
                  type="button"
                  className="clean-btn"
                  style={{ width: '100%', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'rgba(56, 189, 248, 0.12)', borderColor: '#38bdf8', color: '#38bdf8' }}
                  onClick={() => {
                    setIsWifiModalOpen(false);
                    setIsOtaModalOpen(true);
                  }}
                >
                  <UploadCloud size={14} />
                  <span>Buka Panduan & Halaman Update OTA</span>
                </button>
              </div>

              {/* Quick Guide */}
              <div className="guide-step" style={{ marginTop: '10px' }}>
                <strong>Langkah Pengaturan Wi-Fi Baru:</strong><br />
                1. Hubungkan Wi-Fi laptop ke hotspot <strong>DeltaRobot_Config</strong> (Pass: <code>12345678</code>).<br />
                2. Klik tombol <strong>Buka Portal Pengaturan Wi-Fi</strong> di atas.<br />
                3. Di halaman portal, klik <em>Pindai Wi-Fi Sekitar</em> &rarr; pilih Wi-Fi Anda &rarr; isi password &rarr; klik <em>Simpan ke ESP32 & Hubungkan</em>.<br />
                4. ESP32 otomatis restart dan terhubung ke Wi-Fi Anda.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OTA FIRMWARE UPDATE MODAL */}
      {isOtaModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsOtaModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '540px' }}>
            <div className="modal-header">
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UploadCloud size={18} color="#38bdf8" />
                <span>Update Firmware ESP32 (OTA / Nirkabel)</span>
              </div>
              <button className="modal-close-btn" onClick={() => setIsOtaModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div style={{ background: 'rgba(56, 189, 248, 0.08)', borderLeft: '3px solid #38bdf8', padding: '12px', borderRadius: '6px', fontSize: '0.82rem', marginBottom: '14px', lineHeight: '1.5' }}>
                Fitur <strong>OTA (Over-The-Air)</strong> memungkinkan Anda meng-upload sketch terbaru ke modul ESP32 secara langsung lewat jaringan Wi-Fi tanpa memerlukan kabel data USB.
              </div>

              <div className="config-card" style={{ marginBottom: '14px' }}>
                <div className="config-card-title">
                  Langkah-Langkah Update Firmware:
                </div>
                <ol style={{ fontSize: '0.8rem', color: 'var(--text-color)', paddingLeft: '18px', margin: '8px 0', lineHeight: '1.7' }}>
                  <li>Buka file <code>DeltaRobot_ESP32.ino</code> di software <strong>Arduino IDE</strong>.</li>
                  <li>Pastikan board terpilih <strong>ESP32 Dev Module</strong>.</li>
                  <li>Klik menu <strong>Sketch</strong> &rarr; pilih <strong>Export Compiled Binary</strong> (atau tekan <code>Ctrl + Alt + S</code>).</li>
                  <li>Arduino IDE akan membuat file berekstensi <strong><code>.bin</code></strong> di dalam folder sketch Anda.</li>
                  <li>Klik tombol hijau di bawah untuk membuka halaman upload ESP32.</li>
                  <li>Pilih file <strong><code>.bin</code></strong> tersebut lalu klik <strong>Upload Firmware</strong>.</li>
                  <li>Tunggu 5 detik, ESP32 akan me-reboot secara otomatis dan firmware baru langsung aktif!</li>
                </ol>
              </div>

              {/* Jaringan & Opsi URL Upload */}
              <div className="config-card" style={{ border: '1px solid rgba(56, 189, 248, 0.3)', marginBottom: '14px' }}>
                <div className="config-card-title" style={{ color: '#38bdf8' }}>
                  Pilih Jalur Akses Halaman Upload:
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                  {/* Opsi 1: Mode AP Mandiri */}
                  <div style={{ background: 'rgba(0,0,0,0.25)', padding: '10px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 'bold', color: 'var(--text-color)', marginBottom: '4px' }}>
                      Opsi A: Mode AP Mandiri (Paling Stabil & Direkomendasikan)
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                      *Pastikan Wi-Fi laptop terhubung ke hotspot <strong>DeltaRobot_Config</strong> (Pass: <code>12345678</code>).
                    </div>
                    <a
                      href="http://192.168.4.1/update"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="clean-btn"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '9px',
                        fontSize: '0.82rem',
                        textDecoration: 'none',
                        fontWeight: 'bold',
                        background: 'rgba(0, 255, 136, 0.15)',
                        borderColor: '#00ff88',
                        color: '#00ff88'
                      }}
                    >
                      <span>Buka http://192.168.4.1/update</span>
                      <ExternalLink size={14} />
                    </a>
                  </div>

                  {/* Opsi 2: Mode Wi-Fi Client / Hotspot */}
                  <div style={{ background: 'rgba(0,0,0,0.25)', padding: '10px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 'bold', color: 'var(--text-color)', marginBottom: '4px' }}>
                      Opsi B: Mode Wi-Fi Client / Hotspot
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                      *Laptop dan ESP32 harus berada di jaringan Wi-Fi / Hotspot yang sama.
                    </div>
                    <a
                      href={`${espIp.replace(/\/$/, '')}/update`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="clean-btn"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '9px',
                        fontSize: '0.82rem',
                        textDecoration: 'none',
                        fontWeight: 'bold',
                        background: 'rgba(56, 189, 248, 0.15)',
                        borderColor: '#38bdf8',
                        color: '#38bdf8'
                      }}
                    >
                      <span>Buka {`${espIp.replace(/\/$/, '')}/update`}</span>
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
