import React, { useState, useRef, useEffect, useMemo, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas, useLoader, useThree, useFrame } from '@react-three/fiber';
import { Grid, Sphere, Center, CameraControls, Html } from '@react-three/drei';
import { STLLoader } from 'three-stdlib';
import { Wifi, WifiOff, Radio, RefreshCw, X, Server, UploadCloud, ExternalLink, Clock, Download, History, BarChart3, TrendingUp, CheckCircle, RotateCcw, Usb, PlugZap, Unplug, Shield, AlertTriangle, ChevronUp, ChevronDown, Maximize2, Minimize2, Trash2, Terminal as TerminalIcon, Send, Sliders, Play } from 'lucide-react';
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

  const [liveClock, setLiveClock] = useState('');
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      const s = String(d.getSeconds()).padStart(2, '0');
      setLiveClock(`${h}.${m}.${s}`);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

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

  // Web Serial API (USB Direct)
  const serialPortRef = useRef(null);
  const serialWriterRef = useRef(null);
  const serialReaderRef = useRef(null);
  const [usbConnected, setUsbConnected] = useState(false);
  const [isConnectingUsb, setIsConnectingUsb] = useState(false);
  const usbReadLoopRef = useRef(null);

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

  const [isAutonomous, setIsAutonomous] = useState(() => {
    const s = localStorage.getItem('delta_auto_mode');
    return s === 'true'; // Default FALSE (mati), hanya aktif jika user sengaja menyalakannya
  });
  const lastModeChangeTimeRef = useRef(0);
  const [isEmergencyActive, setIsEmergencyActive] = useState(false);

  // VS Code Style Integrated Terminal State
  const [terminalHeight, setTerminalHeight] = useState(() => {
    const saved = localStorage.getItem('delta_terminal_height');
    const val = saved ? parseInt(saved, 10) : 210;
    return isNaN(val) ? 210 : Math.min(Math.max(val, 34), 600);
  });
  const [isTerminalCollapsed, setIsTerminalCollapsed] = useState(() => {
    return localStorage.getItem('delta_terminal_collapsed') === 'true';
  });
  const [isTerminalMaximized, setIsTerminalMaximized] = useState(false);
  const [isDraggingTerminal, setIsDraggingTerminal] = useState(false);
  const [terminalInputText, setTerminalInputText] = useState('');
  const [cmdHistory, setCmdHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const dragStartYRef = useRef(0);
  const dragStartHeightRef = useRef(210);
  const [proxPolarity, setProxPolarity] = useState(() => localStorage.getItem('delta_prox_pol') || 'LOW');
  const [relayActive, setRelayActive] = useState(false);
  const [gripState, setGripState] = useState('NETRAL'); // 'NETRAL' | 'TIUP' | 'HISAP'
  const [gripTiupTime, setGripTiupTime] = useState(() => {
    const s = localStorage.getItem('delta_grip_tiup');
    const val = s ? parseInt(s, 10) : 1000;
    return isNaN(val) ? 1000 : Math.min(Math.max(val, 1000), 10000);
  });
  const [gripHisapTime, setGripHisapTime] = useState(() => {
    const s = localStorage.getItem('delta_grip_hisap');
    const val = s ? parseInt(s, 10) : 3000;
    return isNaN(val) ? 3000 : Math.min(Math.max(val, 1000), 10000);
  });
  const [gripExpandTime, setGripExpandTime] = useState(() => {
    const s = localStorage.getItem('delta_grip_expand');
    const val = s ? parseInt(s, 10) : 800;
    return isNaN(val) ? 800 : Math.min(Math.max(val, 200), 3000);
  });
  const [gripHoldContinuous, setGripHoldContinuous] = useState(() => {
    const s = localStorage.getItem('delta_grip_hold_cont');
    return s !== null ? s === 'true' : true; // Default: Tiup aktif penuh terus (100% PWM)
  });
  const [pump1Speed, setPump1Speed] = useState(() => {
    const s = localStorage.getItem('delta_pump1_speed') || localStorage.getItem('delta_pump_speed');
    return s ? parseInt(s, 10) : 255;
  });
  const [pump2Speed, setPump2Speed] = useState(() => {
    const s = localStorage.getItem('delta_pump2_speed');
    return s ? parseInt(s, 10) : 255;
  });
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

  // LIVE CYCLE TIME METER & PRODUCTION TELEMETRY
  const [isCycleRunning, setIsCycleRunning] = useState(false);
  const [runningCycleProfile, setRunningCycleProfile] = useState('');
  const [liveCycleDuration, setLiveCycleDuration] = useState(0);
  const [lastCycleDuration, setLastCycleDuration] = useState(() => {
    const s = localStorage.getItem('delta_last_cycle');
    return s ? parseFloat(s) : 0;
  });
  const [cycleCountA, setCycleCountA] = useState(() => {
    const s = localStorage.getItem('delta_count_a');
    return s ? parseInt(s, 10) : 0;
  });
  const [cycleCountB, setCycleCountB] = useState(() => {
    const s = localStorage.getItem('delta_count_b');
    return s ? parseInt(s, 10) : 0;
  });
  const [cycleHistory, setCycleHistory] = useState(() => {
    try {
      const s = localStorage.getItem('delta_cycle_history');
      if (s) return JSON.parse(s);
    } catch (_) {}
    return [];
  });
  const [isCycleHistoryModalOpen, setIsCycleHistoryModalOpen] = useState(false);

  // Statistics calculation
  const totalCycles = cycleCountA + cycleCountB;
  const avgCycleDuration = useMemo(() => {
    if (cycleHistory.length === 0) return lastCycleDuration;
    const sum = cycleHistory.reduce((acc, curr) => acc + (Number(curr.duration) || 0), 0);
    return (sum / cycleHistory.length).toFixed(2);
  }, [cycleHistory, lastCycleDuration]);

  const estimatedPPM = useMemo(() => {
    const dur = parseFloat(avgCycleDuration);
    if (!dur || dur <= 0) return '0.0';
    return (60 / dur).toFixed(1);
  }, [avgCycleDuration]);

  // Keyboard Jogging Listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Tombol EMG (Escape) selalu diizinkan kapan saja demi keselamatan
      if (e.key === 'Escape') {
        e.preventDefault();
        sendCommand('EMG');
        return;
      }

      // Jika Auto Mode aktif atau jogging nonaktif, jangan proses pergerakan keyboard
      if (!isKeyJogActive || isAutonomous) return;
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
        if (gripState === 'TIUP') {
          setGripState('HISAP');
          setRelayActive(false);
          sendCommand('HISAP');
        } else {
          setGripState('TIUP');
          setRelayActive(true);
          sendCommand('TIUP');
        }
      } else if (e.code === 'KeyH') {
        e.preventDefault();
        sendCommand('HOME');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isKeyJogActive, isAutonomous, pos, jogStep, gripState, relayActive]);

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

  // VS Code Terminal Resize & Key Handlers
  const handleStartResize = (clientY) => {
    setIsDraggingTerminal(true);
    dragStartYRef.current = clientY;
    dragStartHeightRef.current = isTerminalCollapsed ? 34 : terminalHeight;

    const onMove = (moveY) => {
      const deltaY = dragStartYRef.current - moveY;
      const newH = Math.min(Math.max(dragStartHeightRef.current + deltaY, 34), 650);
      setTerminalHeight(newH);
      if (newH > 48 && isTerminalCollapsed) {
        setIsTerminalCollapsed(false);
        localStorage.setItem('delta_terminal_collapsed', 'false');
      }
    };

    const onMouseMove = (e) => onMove(e.clientY);
    const onTouchMove = (e) => {
      if (e.touches && e.touches[0]) onMove(e.touches[0].clientY);
    };

    const onEnd = () => {
      setIsDraggingTerminal(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onEnd);
      setTerminalHeight(cur => {
        localStorage.setItem('delta_terminal_height', cur);
        return cur;
      });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onEnd);
  };

  const handleToggleTerminalCollapse = () => {
    setIsTerminalCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('delta_terminal_collapsed', next ? 'true' : 'false');
      if (!next && terminalHeight < 100) {
        setTerminalHeight(210);
        localStorage.setItem('delta_terminal_height', 210);
      }
      return next;
    });
  };

  const handleToggleTerminalMaximize = () => {
    if (isTerminalMaximized) {
      setIsTerminalMaximized(false);
      setTerminalHeight(210);
    } else {
      setIsTerminalCollapsed(false);
      setIsTerminalMaximized(true);
      setTerminalHeight(480);
    }
  };

  const handleTerminalKeyDown = (e) => {
    if (e.key === 'Enter') {
      const val = terminalInputText.trim();
      if (val) {
        sendCommand(val);
        setCmdHistory(prev => [val, ...prev.filter(item => item !== val).slice(0, 30)]);
        setHistoryIndex(-1);
        setTerminalInputText('');
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHistory.length > 0 && historyIndex + 1 < cmdHistory.length) {
        const nextIdx = historyIndex + 1;
        setHistoryIndex(nextIdx);
        setTerminalInputText(cmdHistory[nextIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const nextIdx = historyIndex - 1;
        setHistoryIndex(nextIdx);
        setTerminalInputText(cmdHistory[nextIdx]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setTerminalInputText('');
      }
    }
  };

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
          if (data.last_log.includes('TIUP AKTIF') || data.last_log.includes('Pompa 1 ON')) {
            setGripState('TIUP');
            setRelayActive(true);
          } else if (data.last_log.includes('HISAP AKTIF') || data.last_log.includes('Pompa 2 ON')) {
            setGripState('HISAP');
            setRelayActive(false);
          } else if (
            data.last_log.includes('Pompa STOP') ||
            data.last_log.includes('Pompa 2 OFF') ||
            data.last_log.includes('Pompa OFF') ||
            data.last_log.includes('Pompa Netral') ||
            data.last_log.includes('STOP / Netral') ||
            data.last_log.includes('Netral') ||
            data.last_log.includes('Dilepas') ||
            data.last_log.includes('Grip:NETRAL') ||
            data.last_log.includes('SELESAI') ||
            data.last_log.includes('CYCLE_END')
          ) {
            setGripState('NETRAL');
            setRelayActive(false);
          }

          if (data.last_log.includes('EMG AKTIF') || data.last_log.includes('DARURAT AKTIF') || data.last_log.includes('EMG:ACTIVE') || data.last_log.includes('Mode EMG aktif')) {
            setIsEmergencyActive(true);
          } else if (data.last_log.includes('Dilepas') || data.last_log.includes('Reset') || data.last_log.includes('[HOMING] Selesai') || data.last_log.includes('SELESAI')) {
            setIsEmergencyActive(false);
          }
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
    setLogs(prev => [...prev, `[SYSTEM] Mode koneksi: ${mode.toUpperCase()} (${mode === 'wifi' ? cleanIp : mode === 'usb' ? 'Web Serial USB' : 'Backend'})`]);
    if (mode === 'wifi') {
      checkEspStatus(cleanIp);
    }
  };

  // ===== WEB SERIAL API HANDLERS =====
  const connectUsb = async () => {
    if (!('serial' in navigator)) {
      alert('Web Serial API tidak didukung. Gunakan browser Chrome atau Edge versi terbaru.');
      return;
    }
    try {
      setIsConnectingUsb(true);
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      serialPortRef.current = port;

      const writer = port.writable.getWriter();
      serialWriterRef.current = writer;

      setUsbConnected(true);
      setLogs(prev => [...prev, '[USB] Terhubung ke Arduino Mega via USB Serial (115200 baud).']);

      // Start read loop
      const readLoop = async () => {
        const reader = port.readable.getReader();
        serialReaderRef.current = reader;
        const decoder = new TextDecoder();
        let buffer = '';
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.length > 0) {
                setLogs(prev => [...prev, `[MEGA] ${trimmed}`]);
                if (trimmed.includes('TIUP AKTIF') || trimmed.includes('Pompa 1 ON')) {
                  setGripState('TIUP');
                  setRelayActive(true);
                } else if (trimmed.includes('HISAP AKTIF') || trimmed.includes('Pompa 2 ON')) {
                  setGripState('HISAP');
                  setRelayActive(false);
                } else if (
                  trimmed.includes('Pompa STOP') ||
                  trimmed.includes('Pompa 2 OFF') ||
                  trimmed.includes('Pompa OFF') ||
                  trimmed.includes('Pompa Netral') ||
                  trimmed.includes('STOP / Netral') ||
                  trimmed.includes('Netral') ||
                  trimmed.includes('Dilepas') ||
                  trimmed.includes('Grip:NETRAL') ||
                  trimmed.includes('SELESAI') ||
                  trimmed.includes('CYCLE_END')
                ) {
                  setGripState('NETRAL');
                  setRelayActive(false);
                }

                if (trimmed.includes('EMG AKTIF') || trimmed.includes('DARURAT AKTIF') || trimmed.includes('EMG:ACTIVE') || trimmed.includes('Mode EMG aktif')) {
                  setIsEmergencyActive(true);
                } else if (trimmed.includes('Dilepas') || trimmed.includes('Reset') || trimmed.includes('[HOMING] Selesai') || trimmed.includes('SELESAI')) {
                  setIsEmergencyActive(false);
                }

                if (Date.now() - lastModeChangeTimeRef.current > 4000) {
                  if (trimmed.includes('[MODE] >>> MODE AUTO') || trimmed.includes('Autonomous Mode ON') || trimmed.includes('Auto Mode: ON')) {
                    setIsAutonomous(true);
                    localStorage.setItem('delta_auto_mode', 'true');
                  } else if (trimmed.includes('[MODE] >>> MODE MANUAL') || trimmed.includes('Autonomous Mode OFF') || trimmed.includes('Auto Mode: OFF')) {
                    setIsAutonomous(false);
                    localStorage.setItem('delta_auto_mode', 'false');
                  }
                }
              }
            }
          }
        } catch (err) {
          setLogs(prev => [...prev, `[USB] Koneksi terputus: ${err.message}`]);
        } finally {
          reader.releaseLock();
          setUsbConnected(false);
        }
      };
      usbReadLoopRef.current = readLoop();
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        setLogs(prev => [...prev, `[USB ERROR] ${err.message}`]);
      }
    } finally {
      setIsConnectingUsb(false);
    }
  };

  const disconnectUsb = async () => {
    try {
      if (serialReaderRef.current) {
        await serialReaderRef.current.cancel();
        serialReaderRef.current = null;
      }
      if (serialWriterRef.current) {
        await serialWriterRef.current.close();
        serialWriterRef.current = null;
      }
      if (serialPortRef.current) {
        await serialPortRef.current.close();
        serialPortRef.current = null;
      }
      setUsbConnected(false);
      setLogs(prev => [...prev, '[USB] Koneksi USB diputus.']);
    } catch (err) {
      setLogs(prev => [...prev, `[USB] ${err.message}`]);
    }
  };

  const sendUsbCommand = async (cmd) => {
    if (!serialWriterRef.current || !usbConnected) {
      setLogs(prev => [...prev, '[USB ERROR] Tidak terhubung ke USB Serial. Klik "Hubungkan USB" dulu.']);
      return;
    }
    const encoder = new TextEncoder();
    await serialWriterRef.current.write(encoder.encode(cmd + '\n'));
  };

  const fetchLayout = async () => {
    const token = localStorage.getItem('delta_token');
    if (!token) return;
    try {
      const res = await fetch('/api/layout', {
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
    let combined = [];
    try {
      const local = JSON.parse(localStorage.getItem('delta_local_templates') || '[]');
      if (Array.isArray(local)) combined = [...local];
    } catch (_) {}

    try {
      const token = localStorage.getItem('delta_token');
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/templates', { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success' && Array.isArray(data.data)) {
          const map = new Map();
          data.data.forEach(t => map.set(t.template_name, t));
          combined.forEach(t => {
            if (!map.has(t.template_name)) {
              map.set(t.template_name, t);
            }
          });
          setTemplates(Array.from(map.values()));
          return;
        }
      }
    } catch (err) {
      console.warn('Fetch templates server fallback:', err);
    }
    if (combined.length > 0) {
      setTemplates(combined);
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
        await fetch('/api/layout', {
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

  const handleSetMode = async (targetMode) => {
    const isAuto = targetMode === 'AUTO';
    setIsAutonomous(isAuto);
    localStorage.setItem('delta_auto_mode', isAuto ? 'true' : 'false');
    lastModeChangeTimeRef.current = Date.now();
    await sendCommand(isAuto ? 'MODE AUTO' : 'MODE MANUAL');
    setLogs(prev => [...prev, `[SYSTEM] Mode operasional dialihkan ke: ${isAuto ? 'AUTO' : 'MANUAL'}`]);
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
      setPos({ x: 0, y: 0, z: -50 });
    }

    // USB Web Serial mode - kirim langsung ke Arduino Mega
    if (connectionMode === 'usb') {
      await sendUsbCommand(cmd);
      return;
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
      const response = await fetch('/api/command', {
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
      await sleep(100);
      await sendCommand(`SET_A_DROP ${t.dropA_x} ${t.dropA_y} ${t.dropA_z}`);
      await sleep(100);
      await sendCommand(`SET_B_PICK ${t.pickB_x} ${t.pickB_y} ${t.pickB_z}`);
      await sleep(100);
      await sendCommand(`SET_B_DROP ${t.dropB_x} ${t.dropB_y} ${t.dropB_z}`);
      await sleep(100);
      await sendCommand(`SAVE_CONFIG`);
      setLogs(prev => [...prev, `[SYSTEM] Seluruh titik koordinat template '${name}' disimpan permanen ke EEPROM robot.`]);
    }
  };

  const handleDeleteTemplate = async () => {
    const trimmedName = newTemplateName.trim();
    if (!trimmedName) {
      alert("Pilih template yang ingin dihapus!");
      return;
    }
    if (!window.confirm(`Hapus template '${trimmedName}'?`)) return;

    // 1. Hapus dari local storage
    try {
      const local = JSON.parse(localStorage.getItem('delta_local_templates') || '[]');
      const filtered = local.filter(t => t.template_name !== trimmedName);
      localStorage.setItem('delta_local_templates', JSON.stringify(filtered));
    } catch (_) {}

    // 2. Hapus dari backend database
    const token = localStorage.getItem('delta_token');
    try {
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`/api/templates/${encodeURIComponent(trimmedName)}`, {
        method: 'DELETE',
        headers
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setLogs(prev => [...prev, `[SYSTEM] Template '${trimmedName}' berhasil dihapus.`]);
      } else {
        setLogs(prev => [...prev, `[SYSTEM] Template '${trimmedName}' dihapus dari cache lokal.`]);
      }
    } catch (err) {
      setLogs(prev => [...prev, `[SYSTEM] Template '${trimmedName}' dihapus dari cache lokal.`]);
    }
    setNewTemplateName("");
    fetchTemplates();
  };

  const handleSaveTemplate = async () => {
    const trimmedName = newTemplateName.trim();
    if (!trimmedName) {
      alert("Masukkan nama template terlebih dahulu!");
      return;
    }
    const token = localStorage.getItem('delta_token');
    const payload = {
      template_name: trimmedName,
      pickA_x: parseFloat(pickA.x) || 0, pickA_y: parseFloat(pickA.y) || 0, pickA_z: parseFloat(pickA.z) || 0,
      dropA_x: parseFloat(dropA.x) || 0, dropA_y: parseFloat(dropA.y) || 0, dropA_z: parseFloat(dropA.z) || 0,
      pickB_x: parseFloat(pickB.x) || 0, pickB_y: parseFloat(pickB.y) || 0, pickB_z: parseFloat(pickB.z) || 0,
      dropB_x: parseFloat(dropB.x) || 0, dropB_y: parseFloat(dropB.y) || 0, dropB_z: parseFloat(dropB.z) || 0
    };

    // 1. Simpan ke local storage selalu (offline resilience)
    try {
      const local = JSON.parse(localStorage.getItem('delta_local_templates') || '[]');
      const filtered = local.filter(t => t.template_name !== trimmedName);
      filtered.push({ ...payload, id: Date.now() });
      localStorage.setItem('delta_local_templates', JSON.stringify(filtered));
    } catch (_) {}

    // 2. Simpan ke backend database
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setLogs(prev => [...prev, `[SYSTEM] Template '${trimmedName}' tersimpan di database.`]);
        setNewTemplateName("");
        fetchTemplates();
      } else {
        setLogs(prev => [...prev, `[PERINGATAN] Template tersimpan lokal (Server: ${data.message || res.statusText}).`]);
        setNewTemplateName("");
        fetchTemplates();
      }
    } catch (err) {
      setLogs(prev => [...prev, `[PERINGATAN] Template tersimpan secara lokal (${err.message}).`]);
      setNewTemplateName("");
      fetchTemplates();
    }
  };

  const handleApplyAllCoordinates = async () => {
    setIsApplyingAll(true);
    setLogs(prev => [...prev, `[SYSTEM] Menerapkan seluruh koordinat dan parameter robot ke EEPROM...`]);
    try {
      localStorage.setItem('delta_pickA', JSON.stringify(pickA));
      localStorage.setItem('delta_dropA', JSON.stringify(dropA));
      localStorage.setItem('delta_pickB', JSON.stringify(pickB));
      localStorage.setItem('delta_dropB', JSON.stringify(dropB));
      localStorage.setItem('delta_motor_speed', speedVal);
      localStorage.setItem('delta_motor_accel', accelVal);
      localStorage.setItem('delta_grip_tiup', gripTiupTime);
      localStorage.setItem('delta_grip_hisap', gripHisapTime);
      localStorage.setItem('delta_grip_expand', gripExpandTime);
      localStorage.setItem('delta_grip_hold_cont', gripHoldContinuous);

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
      await sleep(100);
      await sendCommand(`SET_GRIP_TIME ${gripTiupTime} ${gripHisapTime} ${gripExpandTime}`);
      await sleep(100);
      await sendCommand(`SET_GRIP_HOLD ${gripHoldContinuous ? 1 : 0}`);
      await sleep(100);
      await sendCommand(`SET_GRIP_SPEED ${pump1Speed} ${pump2Speed}`);
      await sleep(100);
      await sendCommand(`SAVE_CONFIG`);

      setLogs(prev => [...prev, `[SYSTEM] SUKSES! Seluruh parameter (Koordinat A/B, Kecepatan/Akselerasi, Waktu Tiup/Hisap/Expand, Mode Tiup Terus, PWM Pompa) tersimpan permanen di otak robot (EEPROM)!`]);
    } catch (err) {
      setLogs(prev => [...prev, `[ERROR] Gagal menerapkan seluruh koordinat: ${err.message}`]);
    } finally {
      setIsApplyingAll(false);
    }
  };

  const executeStep = async (stepName, profile) => {
    const p = profile === 'A' ? pickA : pickB;
    const d = profile === 'A' ? dropA : dropB;
    const safePickZ = Math.min(-200, Math.max(-315, Number(p.z) + 45));
    const safeDropZ = Math.min(-200, Math.max(-315, Number(d.z) + 45));

    switch (stepName) {
      case 'approach_pick':
        setLogs(prev => [...prev, `[STEP ${profile}] 1. Pindah ke atas Pick: (${p.x}, ${p.y}, ${safePickZ}) + HISAP (Mengembang Buka Cakar ${gripExpandTime}ms)`]);
        await sendCommand(`${p.x} ${p.y} ${safePickZ}`);
        await sleep(150);
        setGripState('HISAP');
        setRelayActive(false);
        await sendCommand(`SET_GRIP_SPEED ${pump1Speed} ${pump2Speed}`);
        await sendCommand('HISAP ON');
        await sleep(gripExpandTime);
        break;
      case 'pick_down':
        setLogs(prev => [...prev, `[STEP ${profile}] 2. Turun ke Pick: (${p.x}, ${p.y}, ${p.z}) -> TIUP (AMBIL/MENJEPIT BENDA)`]);
        await sendCommand(`${p.x} ${p.y} ${p.z}`);
        await sleep(250);
        setGripState('TIUP');
        setRelayActive(true);
        await sendCommand(`SET_GRIP_SPEED ${pump1Speed} ${pump2Speed}`);
        await sendCommand('TIUP ON');
        await sleep(gripTiupTime);
        if (gripHoldContinuous) {
          setLogs(prev => [...prev, `[STEP ${profile}] Benda terkunci rapat. Mode Tiup Aktif Terus Penuh (PWM ${pump1Speed}).`]);
        } else {
          const holdPwm = Math.max(80, Math.round(pump1Speed * 0.55));
          await sendCommand(`SET_GRIP_SPEED ${holdPwm} ${pump2Speed}`);
          setLogs(prev => [...prev, `[STEP ${profile}] Benda terkunci rapat. Mode hemat daya aktif (PWM ${holdPwm}).`]);
        }
        break;
      case 'pick_lift':
        setLogs(prev => [...prev, `[STEP ${profile}] 3. Angkat Objek: (${p.x}, ${p.y}, ${safePickZ}) (TIUP MENAHAN BENDA)`]);
        await sendCommand(`${p.x} ${p.y} ${safePickZ}`);
        await sleep(150);
        setLogs(prev => [...prev, `[STEP ${profile}] 3b. Geser ke tengah dulu: (0, 0, ${safePickZ})`]);
        await sendCommand(`0 0 ${safePickZ}`);
        await sleep(150);
        setLogs(prev => [...prev, `[STEP ${profile}] 3c. Naik lurus ke Home: (0, 0, -200)`]);
        await sendCommand(`0 0 -200`);
        break;
      case 'approach_drop':
        setLogs(prev => [...prev, `[STEP ${profile}] 4. Geser ke atas Drop: (${d.x}, ${d.y}, ${safeDropZ}) (TIUP TETAP MENAHAN)`]);
        await sendCommand(`${d.x} ${d.y} ${safeDropZ}`);
        break;
      case 'drop_down':
        setLogs(prev => [...prev, `[STEP ${profile}] 5. Turun ke Drop: (${d.x}, ${d.y}, ${d.z}) -> HISAP (LEPAS BARANG)`]);
        await sendCommand(`${d.x} ${d.y} ${d.z}`);
        await sleep(250);
        setGripState('HISAP');
        setRelayActive(false);
        await sendCommand(`SET_GRIP_SPEED ${pump1Speed} ${pump2Speed}`);
        await sendCommand('HISAP ON');
        await sleep(gripHisapTime);
        await sendCommand('STOP_PUMP');
        setGripState('NETRAL');
        setLogs(prev => [...prev, `[STEP ${profile}] Benda dilepas beres. Driver L298N OFF (0V). Jeda 1 detik daya murni Stepper sebelum balik home...`]);
        await sleep(1000);
        break;
      case 'drop_lift':
        setLogs(prev => [...prev, `[STEP ${profile}] 6. Balik Home langsung sampai menyentuh Limit Switch (Mode Sinkron Halus Tanpa Gasruk)!`]);
        await sendCommand('HOME');
        break;
      default:
        break;
    }
  };

  const applyGlobalZOffset = (delta) => {
    const MIN_SAFE_Z = -400.0; // Batas fisik absolut Z
    const MAX_SAFE_Z = -100.0;

    const clampZ = (currentZ) => {
      const computed = Math.round((Number(currentZ) + delta) * 10) / 10;
      return Math.max(MIN_SAFE_Z, Math.min(MAX_SAFE_Z, computed));
    };

    const newPickA = { ...pickA, z: clampZ(pickA.z) };
    const newDropA = { ...dropA, z: clampZ(dropA.z) };
    const newPickB = { ...pickB, z: clampZ(pickB.z) };
    const newDropB = { ...dropB, z: clampZ(dropB.z) };

    const wasClamped = [pickA.z, dropA.z, pickB.z, dropB.z].some(
      z => (Number(z) + delta) < MIN_SAFE_Z
    );

    setPickA(newPickA);
    setDropA(newDropA);
    setPickB(newPickB);
    setDropB(newDropB);

    localStorage.setItem('delta_pickA', JSON.stringify(newPickA));
    localStorage.setItem('delta_dropA', JSON.stringify(newDropA));
    localStorage.setItem('delta_pickB', JSON.stringify(newPickB));
    localStorage.setItem('delta_dropB', JSON.stringify(newDropB));

    // Kirim langsung ke Arduino Mega agar koreksi Z langsung aktif & tersimpan permanen
    (async () => {
      try {
        await sendCommand(`SET_A_PICK ${newPickA.x} ${newPickA.y} ${newPickA.z}`);
        await sleep(50);
        await sendCommand(`SET_A_DROP ${newDropA.x} ${newDropA.y} ${newDropA.z}`);
        await sleep(50);
        await sendCommand(`SET_B_PICK ${newPickB.x} ${newPickB.y} ${newPickB.z}`);
        await sleep(50);
        await sendCommand(`SET_B_DROP ${newDropB.x} ${newDropB.y} ${newDropB.z}`);
        await sleep(50);
        await sendCommand(`SAVE_CONFIG`);
        setLogs(prev => [...prev, `[Z-OFFSET] Koreksi Z (${delta > 0 ? '+' : ''}${delta} mm) langsung diterapkan & disimpan permanen ke EEPROM robot.`]);
      } catch (e) {}
    })();

    if (wasClamped) {
      setLogs(prev => [...prev, `[Z-OFFSET] Peringatan: Titik Z dibatasi di batas aman (${MIN_SAFE_Z} mm) agar tidak menabrak batas mekanis!`]);
    } else {
      setLogs(prev => [...prev, `[Z-OFFSET] Seluruh titik Z disesuaikan (${delta > 0 ? '+' : ''}${delta} mm).`]);
    }
  };

  const executeTimedSequence = async (profileKey) => {
    if (isCycleRunning) return;
    const profileLabel = profileKey === 'A' ? 'Profil A' : 'Profil B';
    setIsCycleRunning(true);
    setRunningCycleProfile(profileLabel);
    setLiveCycleDuration(0);
    const startTs = Date.now();

    const intervalId = setInterval(() => {
      setLiveCycleDuration(parseFloat(((Date.now() - startTs) / 1000).toFixed(2)));
    }, 50);

    try {
      if (profileKey === 'A') {
        setLogs(prev => [...prev, `[CYCLE] Memulai siklus ${profileLabel}...`]);
        await sendCommand(`SET_A_PICK ${pickA.x} ${pickA.y} ${pickA.z}`);
        await sleep(40);
        await sendCommand(`SET_A_DROP ${dropA.x} ${dropA.y} ${dropA.z}`);
        await sleep(40);
        await sendCommand(`SET_SPEED ${speedVal}`);
        await sleep(40);
        await sendCommand(`SET_ACCEL ${accelVal}`);
        await sleep(40);
        await sendCommand(`SET_GRIP_TIME ${gripTiupTime} ${gripHisapTime} ${gripExpandTime}`);
        await sleep(40);
        await sendCommand(`SET_GRIP_HOLD ${gripHoldContinuous ? 1 : 0}`);
        await sleep(40);
        await sendCommand(`SET_GRIP_SPEED ${pump1Speed} ${pump2Speed}`);
        await sleep(50);
        await sendCommand('STARTA');
      } else {
        setLogs(prev => [...prev, `[CYCLE] Memulai siklus ${profileLabel}...`]);
        await sendCommand(`SET_B_PICK ${pickB.x} ${pickB.y} ${pickB.z}`);
        await sleep(40);
        await sendCommand(`SET_B_DROP ${dropB.x} ${dropB.y} ${dropB.z}`);
        await sleep(40);
        await sendCommand(`SET_SPEED ${speedVal}`);
        await sleep(40);
        await sendCommand(`SET_ACCEL ${accelVal}`);
        await sleep(40);
        await sendCommand(`SET_GRIP_TIME ${gripTiupTime} ${gripHisapTime} ${gripExpandTime}`);
        await sleep(40);
        await sendCommand(`SET_GRIP_HOLD ${gripHoldContinuous ? 1 : 0}`);
        await sleep(40);
        await sendCommand(`SET_GRIP_SPEED ${pump1Speed} ${pump2Speed}`);
        await sleep(50);
        await sendCommand('STARTB');
      }

      const dur = parseFloat(((Date.now() - startTs) / 1000).toFixed(2));
      const ppmVal = (60 / dur).toFixed(1);
      setLastCycleDuration(dur);
      localStorage.setItem('delta_last_cycle', dur);

      if (profileKey === 'A') {
        setCycleCountA(prev => {
          const next = prev + 1;
          localStorage.setItem('delta_count_a', next);
          return next;
        });
      } else {
        setCycleCountB(prev => {
          const next = prev + 1;
          localStorage.setItem('delta_count_b', next);
          return next;
        });
      }

      const newRecord = {
        id: Date.now(),
        profile: profileLabel,
        duration: dur,
        ppm: ppmVal,
        timestamp: new Date().toLocaleTimeString(),
        date: new Date().toLocaleDateString('id-ID'),
        status: 'SUCCESS'
      };

      setCycleHistory(prev => {
        const next = [newRecord, ...prev.slice(0, 99)];
        localStorage.setItem('delta_cycle_history', JSON.stringify(next));
        return next;
      });

      setLogs(prev => [...prev, `[TELEMETRY] Siklus ${profileLabel} selesai. Durasi: ${dur}s | Throughput: ${ppmVal} PPM`]);
    } catch (err) {
      setLogs(prev => [...prev, `[CYCLE ERROR] ${err.message}`]);
    } finally {
      clearInterval(intervalId);
      setIsCycleRunning(false);
      setLiveCycleDuration(0);
    }
  };

  const handleStartA = () => executeTimedSequence('A');
  const handleStartB = () => executeTimedSequence('B');

  const exportCycleReportCSV = () => {
    if (cycleHistory.length === 0) {
      alert('Belum ada data riwayat siklus untuk diekspor!');
      return;
    }

    const headers = ['No', 'Tanggal', 'Waktu', 'Profil', 'Durasi_Detik', 'Throughput_PPM', 'Status'];
    const rows = cycleHistory.map((item, idx) => [
      idx + 1,
      `"${item.date || ''}"`,
      `"${item.timestamp || ''}"`,
      `"${item.profile || ''}"`,
      item.duration,
      item.ppm,
      item.status
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + 
      [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Laporan_Produksi_Robot_Delta_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setLogs(prev => [...prev, `[TELEMETRY] Laporan CSV riwayat produksi berhasil diunduh.`]);
  };

  const resetCycleCounter = () => {
    if (window.confirm('Apakah Anda yakin ingin me-reset statistik produksi dan riwayat siklus?')) {
      setCycleCountA(0);
      setCycleCountB(0);
      setLastCycleDuration(0);
      setCycleHistory([]);
      localStorage.removeItem('delta_count_a');
      localStorage.removeItem('delta_count_b');
      localStorage.removeItem('delta_last_cycle');
      localStorage.removeItem('delta_cycle_history');
      setLogs(prev => [...prev, '[TELEMETRY] Counter dan riwayat siklus telah di-reset.']);
    }
  };

  return (
    <div className="dashboard-layout">
      {/* TOPBAR */}
      <header className="topbar">
        <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <img 
            src="/logopolman.svg" 
            alt="POLMAN BANDUNG" 
            style={{ height: '32px', width: 'auto', objectFit: 'contain', flexShrink: 0 }}
            onError={(e) => { e.target.src = '/polman.png'; }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, flexShrink: 0 }}>
            <span style={{ fontSize: '1rem', fontWeight: 800, letterSpacing: '-0.3px', color: 'var(--text-color)', whiteSpace: 'nowrap' }}>
              ROBOT DELTA
            </span>
            <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.6px', whiteSpace: 'nowrap' }}>
              POLMAN BANDUNG • OPERATIONAL CENTER
            </span>
          </div>
          <div className="system-status-pill-topbar">
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#3b82f6', boxShadow: '0 0 6px #3b82f6', flexShrink: 0 }}></span>
            <span>SYSTEM STATUS: ACTIVE</span>
          </div>
        </div>

        <div className="topbar-actions">
          {/* Connection Indicator Badge */}
          {connectionMode === 'wifi' ? (
            <div
              className={`conn-badge ${espStatus.status === 'connected' ? 'online' : (espStatus.status === 'ap_mode' ? 'ap' : 'offline')}`}
              onClick={() => setIsWifiModalOpen(true)}
              title="Pengaturan Wi-Fi & ESP32"
            >
              {espStatus.status === 'connected' ? <Wifi size={13} style={{ flexShrink: 0 }} /> : (espStatus.status === 'ap_mode' ? <Radio size={13} style={{ flexShrink: 0 }} /> : <WifiOff size={13} style={{ flexShrink: 0 }} />)}
              <span>
                {espStatus.status === 'connected' ? `${espStatus.ssid || espStatus.ip}` : (espStatus.status === 'ap_mode' ? 'MODE AP' : 'ESP32 OFFLINE')}
              </span>
            </div>
          ) : connectionMode === 'usb' ? (
            <div
              className={`conn-badge ${usbConnected ? 'online' : 'offline'}`}
              onClick={() => setIsWifiModalOpen(true)}
              title="Mode USB Serial Langsung ke Mega"
            >
              <Usb size={13} style={{ flexShrink: 0 }} />
              <span>{usbConnected ? 'USB TERHUBUNG' : 'USB TERPUTUS'}</span>
            </div>
          ) : (
            <div
              className="conn-badge"
              onClick={() => setIsWifiModalOpen(true)}
              title="Mode Server Backend (Serial USB)"
            >
              <Server size={13} style={{ flexShrink: 0 }} />
              <span>SERIAL COM</span>
            </div>
          )}

          {/* Realtime Live Clock Pill */}
          <div 
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              gap: '6px', 
              height: '32px',
              padding: '0 10px', 
              background: 'var(--card-bg)', 
              border: '1px solid var(--border-color)', 
              borderRadius: '6px', 
              fontSize: '0.78rem', 
              fontWeight: 600, 
              color: 'var(--text-color)', 
              fontFamily: "'JetBrains Mono', monospace",
              whiteSpace: 'nowrap',
              boxSizing: 'border-box',
              flexShrink: 0,
              lineHeight: 1
            }}
          >
            <Clock size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} />
            <span>{liveClock || '12.55.11'}</span>
          </div>

          {/* Operating Mode Status Pill in Top Header */}
          <div
            className="conn-badge"
            style={{
              cursor: 'pointer',
              background: isAutonomous ? 'rgba(245, 158, 11, 0.12)' : 'rgba(59, 130, 246, 0.12)',
              borderColor: isAutonomous ? 'rgba(245, 158, 11, 0.35)' : 'rgba(59, 130, 246, 0.35)',
              color: isAutonomous ? '#f59e0b' : '#3b82f6',
            }}
            onClick={() => handleSetMode(isAutonomous ? 'MANUAL' : 'AUTO')}
            title={isAutonomous ? "Mode AUTO Aktif - Klik untuk beralih ke Mode MANUAL" : "Mode MANUAL Aktif - Klik untuk beralih ke Mode AUTO"}
          >
            {isAutonomous ? <AlertTriangle size={13} style={{ flexShrink: 0 }} /> : <Shield size={13} style={{ flexShrink: 0 }} />}
            <span>{isAutonomous ? 'MODE: AUTO' : 'MODE: MANUAL'}</span>
          </div>

          {/* Navigasi ke Landing Page */}
          <button
            className="wifi-topbar-btn"
            onClick={() => navigate('/')}
            title="Buka Landing Page Robot Delta"
          >
            Landing Page
          </button>

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
            style={{ borderColor: 'rgba(56, 189, 248, 0.4)' }}
            onClick={() => setIsOtaModalOpen(true)}
            title="Update Firmware ESP32 Nirkabel (OTA)"
          >
            <UploadCloud size={13} style={{ flexShrink: 0 }} />
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

          {/* Card 0: Industrial Operating Mode Switcher (Safety Interlock) */}
          <div 
            className="section-card" 
            style={{ 
              border: isAutonomous ? '1px solid rgba(245, 158, 11, 0.45)' : '1px solid rgba(59, 130, 246, 0.4)',
              background: isAutonomous ? 'rgba(245, 158, 11, 0.03)' : 'rgba(59, 130, 246, 0.03)',
              boxShadow: isAutonomous ? '0 0 14px rgba(245, 158, 11, 0.08)' : '0 0 14px rgba(59, 130, 246, 0.06)',
              transition: 'all 0.3s ease'
            }}
          >
            <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
                <Shield size={13} style={{ color: isAutonomous ? '#f59e0b' : '#3b82f6' }} />
                MODE OPERASI
              </span>
              <span
                style={{
                  fontSize: '0.62rem',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontWeight: 800,
                  letterSpacing: '0.5px',
                  whiteSpace: 'nowrap',
                  background: isAutonomous ? 'rgba(245, 158, 11, 0.18)' : 'rgba(59, 130, 246, 0.18)',
                  color: isAutonomous ? '#f59e0b' : '#60a5fa',
                  border: isAutonomous ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid rgba(59, 130, 246, 0.35)'
                }}
              >
                {isAutonomous ? 'AUTO' : 'MANUAL'}
              </span>
            </div>

            {/* Segmented Industrial Switch */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '6px',
              background: 'rgba(0, 0, 0, 0.25)',
              padding: '4px',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              marginTop: '4px'
            }}>
              <button
                type="button"
                className="clean-btn"
                style={{
                  padding: '8px 4px',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  background: !isAutonomous ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : 'transparent',
                  borderColor: !isAutonomous ? '#3b82f6' : 'transparent',
                  color: !isAutonomous ? '#ffffff' : 'var(--text-secondary)',
                  boxShadow: !isAutonomous ? '0 2px 8px rgba(37, 99, 235, 0.35)' : 'none',
                  cursor: 'pointer',
                  borderRadius: '5px'
                }}
                onClick={() => handleSetMode('MANUAL')}
              >
                <Sliders size={13} />
                <span>MANUAL</span>
              </button>

              <button
                type="button"
                className="clean-btn"
                style={{
                  padding: '8px 4px',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  background: isAutonomous ? 'linear-gradient(135deg, #d97706, #b45309)' : 'transparent',
                  borderColor: isAutonomous ? '#f59e0b' : 'transparent',
                  color: isAutonomous ? '#ffffff' : 'var(--text-secondary)',
                  boxShadow: isAutonomous ? '0 2px 8px rgba(217, 119, 6, 0.4)' : 'none',
                  cursor: 'pointer',
                  borderRadius: '5px'
                }}
                onClick={() => handleSetMode('AUTO')}
              >
                <Play size={13} />
                <span>AUTO</span>
              </button>
            </div>

            {/* Industrial Safety Interlock Callout */}
            <div style={{
              marginTop: '6px',
              padding: '6px 8px',
              borderRadius: '5px',
              fontSize: '0.67rem',
              lineHeight: '1.4',
              background: isAutonomous ? 'rgba(245, 158, 11, 0.08)' : 'rgba(59, 130, 246, 0.08)',
              border: isAutonomous ? '1px solid rgba(245, 158, 11, 0.25)' : '1px solid rgba(59, 130, 246, 0.25)',
              color: 'var(--text-secondary)'
            }}>
              {isAutonomous ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#f59e0b', fontWeight: 700, marginBottom: '2px' }}>
                    <AlertTriangle size={12} />
                    <span>INTERLOCK KEAMANAN AKTIF</span>
                  </div>
                  <span>
                    Sensor Proximity (A: Pin 53, B: Pin 51, Conveyor: Pin 2) aktif. Tombol manual dikunci demi keamanan operator.
                  </span>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#60a5fa', fontWeight: 700, marginBottom: '2px' }}>
                    <CheckCircle size={12} />
                    <span>SENSOR PROXIMITY DINONAKTIFKAN</span>
                  </div>
                  <span>
                    Sensor diblokir di firmware (100% aman). Bebas melakukan jogging manual, kalibrasi koordinat, & uji pompa.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Card 1: Quick Command Grid */}
          <div className="section-card">
            <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>AKSI CEPAT</span>
              {isAutonomous && (
                <span style={{ fontSize: '0.62rem', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.35)', padding: '1px 6px', borderRadius: '4px', fontWeight: 700, letterSpacing: '0.3px' }}>
                  TERKUNCI (AUTO)
                </span>
              )}
            </div>
            <div className="clean-btn-grid">
              <button 
                className="clean-btn primary" 
                onClick={() => sendCommand('HOME')}
                disabled={isAutonomous}
              >
                HOME
              </button>
              <button
                className={`clean-btn ${gripState === 'TIUP' ? 'primary' : ''}`}
                onClick={() => {
                  setGripState('TIUP');
                  setRelayActive(true);
                  sendCommand('TIUP');
                }}
                disabled={isAutonomous}
                title="Tiup Soft Gripper untuk mengambil barang"
              >
                TIUP (AMBIL)
              </button>
              <button
                className={`clean-btn ${gripState === 'HISAP' ? 'warning' : ''}`}
                onClick={() => {
                  setGripState('HISAP');
                  setRelayActive(false);
                  sendCommand('HISAP');
                }}
                disabled={isAutonomous}
                title="Hisap Soft Gripper untuk melepas barang"
              >
                HISAP (LEPAS)
              </button>
              <button 
                className="clean-btn success" 
                onClick={handleStartA}
                disabled={isAutonomous}
              >
                START A
              </button>
              <button 
                className="clean-btn success" 
                onClick={handleStartB}
                disabled={isAutonomous}
              >
                START B
              </button>
              <button 
                className="clean-btn" 
                onClick={() => sendCommand('0 0 -200')}
                disabled={isAutonomous}
                title="Pindah cepat ke posisi tengah siap kerja (0, 0, -200)"
              >
                STANDBY
              </button>
            </div>

            <div style={{ display: 'flex', gap: '4px', marginTop: '3px' }}>
              <button 
                className={`clean-btn ${isEmergencyActive ? 'primary' : 'danger'}`}
                onClick={() => sendCommand('EMG')} 
                style={{ 
                  flex: 1, 
                  padding: '6px 2px', 
                  fontWeight: 700,
                  backgroundColor: isEmergencyActive ? '#10b981' : undefined,
                  borderColor: isEmergencyActive ? '#059669' : undefined,
                  color: isEmergencyActive ? '#ffffff' : undefined
                }}
                title={isEmergencyActive ? "Lepas Mode Darurat & Balik Home Otomatis" : "Emergency Stop (Hentikan Robot Seketika)"}
              >
                {isEmergencyActive ? "RESET & HOME" : "EMG"}
              </button>
              <button 
                className="clean-btn primary" 
                onClick={() => sendCommand(`${pos.x} ${pos.y} -200`)} 
                disabled={isAutonomous}
                style={{ flex: 1, padding: '6px 2px', fontSize: '0.72rem' }}
                title="Angkat lengan ke posisi aman Z = -200"
              >
                AMAN (Z-200)
              </button>
              <button 
                className="clean-btn" 
                onClick={() => sendCommand('HOME')} 
                disabled={isAutonomous}
                style={{ flex: 1, padding: '6px 2px' }}
              >
                RESET
              </button>
            </div>
          </div>

          {/* Card 2: Soft Robotic Gripper & Sensor Autonomy */}
          <div className="section-card">
            <div className="section-title">
              <span>SOFT GRIPPER (L298N)</span>
              <span className="slider-value-chip" style={{ fontSize: '0.68rem', fontWeight: 700 }}>
                {gripState === 'TIUP' ? 'TIUP' : gripState === 'HISAP' ? 'HISAP' : 'NETRAL'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Status Soft Gripper (L298N):</span>
                <span
                  className="slider-value-chip"
                  style={{
                    color: gripState === 'TIUP' ? 'var(--accent-color)' : gripState === 'HISAP' ? '#f59e0b' : 'var(--text-muted)'
                  }}
                >
                  {gripState === 'TIUP' ? 'TIUP (AMBIL)' : gripState === 'HISAP' ? 'HISAP (LEPAS)' : 'NETRAL / OFF'}
                </span>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '5px' }}>
                <button
                  className={`clean-btn ${gripState === 'TIUP' ? 'primary' : ''}`}
                  style={{ padding: '8px 4px', fontSize: '0.72rem', fontWeight: 600 }}
                  onClick={() => {
                    setGripState('TIUP');
                    setRelayActive(true);
                    sendCommand('TIUP');
                  }}
                  disabled={isAutonomous}
                  title="Tiup Pompa 1 (P23/P25) untuk mencengkeram barang"
                >
                  TIUP (AMBIL)
                </button>
                <button
                  className={`clean-btn ${gripState === 'HISAP' ? 'warning' : ''}`}
                  style={{ padding: '8px 4px', fontSize: '0.72rem', fontWeight: 600 }}
                  onClick={() => {
                    setGripState('HISAP');
                    setRelayActive(false);
                    sendCommand('HISAP');
                  }}
                  disabled={isAutonomous}
                  title="Hisap Pompa 2 (P27/P29) untuk melepas barang"
                >
                  HISAP (LEPAS)
                </button>
                <button
                  className="clean-btn"
                  style={{ padding: '8px 4px', fontSize: '0.72rem' }}
                  onClick={() => {
                    setGripState('NETRAL');
                    setRelayActive(false);
                    sendCommand('STOP_PUMP');
                  }}
                  disabled={isAutonomous}
                  title="Matikan kedua pompa (Netral)"
                >
                  STOP
                </button>
              </div>

              {/* Timing Controls for Tiup and Hisap (1 - 10 Detik) */}
              <div style={{ background: 'var(--card-bg, rgba(255,255,255,0.03))', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>WAKTU TIUP & HISAP</span>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block' }}>Rentang: 1 - 10 Detik (1000 - 10000 ms)</span>
                  </div>
                  <button
                    className="clean-btn primary"
                    style={{ padding: '3px 10px', fontSize: '0.68rem', fontWeight: 600 }}
                    onClick={async () => {
                      localStorage.setItem('delta_grip_tiup', gripTiupTime);
                      localStorage.setItem('delta_grip_hisap', gripHisapTime);
                      localStorage.setItem('delta_grip_expand', gripExpandTime);
                      localStorage.setItem('delta_grip_hold_cont', gripHoldContinuous);

                      await sendCommand(`SET_GRIP_TIME ${gripTiupTime} ${gripHisapTime} ${gripExpandTime}`);
                      await sleep(100);
                      await sendCommand(`SET_GRIP_HOLD ${gripHoldContinuous ? 1 : 0}`);
                      await sleep(100);
                      await sendCommand(`SAVE_CONFIG`);
                      setLogs(prev => [...prev, `[GRIPPER] Parameter waktu tersimpan permanen ke EEPROM: Tiup=${gripTiupTime}ms | Hisap=${gripHisapTime}ms | Pre-Expand=${gripExpandTime}ms | Mode=${gripHoldContinuous ? 'Tiup Penuh Terus' : 'Hemat Daya'}`]);
                    }}
                    disabled={isAutonomous}
                    title="Kirim dan simpan permanen waktu tiup, hisap, pre-expand & mode ke EEPROM Arduino Mega"
                  >
                    Simpan Timing
                  </button>
                </div>

                {/* Mode Tiup Selama Membawa Barang */}
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '6px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Mode Tiup Saat Bawa Barang:
                    </span>
                    <span style={{ fontSize: '0.64rem', color: gripHoldContinuous ? 'var(--accent-color)' : '#f59e0b', fontWeight: 700 }}>
                      {gripHoldContinuous ? 'TIUP AKTIF PENUH TERUS' : 'HEMAT DAYA (55%)'}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                    <button
                      type="button"
                      disabled={isAutonomous}
                      onClick={async () => {
                        setGripHoldContinuous(true);
                        localStorage.setItem('delta_grip_hold_cont', 'true');
                        await sendCommand('SET_GRIP_HOLD 1');
                      }}
                      style={{
                        padding: '4px 6px',
                        fontSize: '0.65rem',
                        fontWeight: gripHoldContinuous ? 700 : 500,
                        borderRadius: '4px',
                        border: '1px solid ' + (gripHoldContinuous ? 'var(--accent-color)' : 'var(--border-color)'),
                        background: gripHoldContinuous ? 'var(--accent-color)' : 'rgba(255,255,255,0.03)',
                        color: gripHoldContinuous ? '#fff' : 'var(--text-secondary)',
                        cursor: isAutonomous ? 'not-allowed' : 'pointer'
                      }}
                      title="Pompa 1 Tiup tetap aktif menyala 100% penuh sepanjang perjalanan membawa benda dari Pick ke Drop agar benda terkunci kuat"
                    >
                      ✓ Tiup Aktif Penuh Terus
                    </button>
                    <button
                      type="button"
                      disabled={isAutonomous}
                      onClick={async () => {
                        setGripHoldContinuous(false);
                        localStorage.setItem('delta_grip_hold_cont', 'false');
                        await sendCommand('SET_GRIP_HOLD 0');
                      }}
                      style={{
                        padding: '4px 6px',
                        fontSize: '0.65rem',
                        fontWeight: !gripHoldContinuous ? 700 : 500,
                        borderRadius: '4px',
                        border: '1px solid ' + (!gripHoldContinuous ? '#f59e0b' : 'var(--border-color)'),
                        background: !gripHoldContinuous ? '#f59e0b' : 'rgba(255,255,255,0.03)',
                        color: !gripHoldContinuous ? '#000' : 'var(--text-secondary)',
                        cursor: isAutonomous ? 'not-allowed' : 'pointer'
                      }}
                      title="Pompa 1 diturunkan ke 55% PWM saat meluncur untuk menghemat listrik catu daya"
                    >
                      Mode Hemat Daya (55%)
                    </button>
                  </div>
                </div>

                {/* Slider Tiup (Ambil) */}
                <div className="slider-container" style={{ margin: '1px 0' }}>
                  <div className="slider-labels" style={{ fontSize: '0.68rem' }}>
                    <span style={{ fontWeight: 600 }}>Waktu Tiup (Ambil)</span>
                    <span className="slider-value-chip" style={{ fontWeight: 700, minWidth: '70px', textAlign: 'center' }}>
                      {(gripTiupTime / 1000).toFixed(1)} s ({gripTiupTime} ms)
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1000" max="10000" step="100"
                    value={gripTiupTime}
                    disabled={isAutonomous}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      setGripTiupTime(v);
                      localStorage.setItem('delta_grip_tiup', v);
                    }}
                    onMouseUp={() => sendCommand(`SET_GRIP_TIME ${gripTiupTime} ${gripHisapTime} ${gripExpandTime}`)}
                    onTouchEnd={() => sendCommand(`SET_GRIP_TIME ${gripTiupTime} ${gripHisapTime} ${gripExpandTime}`)}
                  />
                  <div style={{ display: 'flex', gap: '4px', marginTop: '3px', flexWrap: 'wrap' }}>
                    {[1000, 2000, 3000, 4000, 5000, 8000, 10000].map((t) => (
                      <button
                        key={t}
                        type="button"
                        disabled={isAutonomous}
                        onClick={() => {
                          setGripTiupTime(t);
                          localStorage.setItem('delta_grip_tiup', t);
                          sendCommand(`SET_GRIP_TIME ${t} ${gripHisapTime} ${gripExpandTime}`);
                        }}
                        style={{
                          fontSize: '0.6rem',
                          padding: '1px 5px',
                          borderRadius: '3px',
                          border: '1px solid var(--border-color)',
                          background: gripTiupTime === t ? 'var(--accent-color)' : 'rgba(255,255,255,0.04)',
                          color: gripTiupTime === t ? '#fff' : 'var(--text-secondary)',
                          cursor: isAutonomous ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {t / 1000}s
                      </button>
                    ))}
                  </div>
                </div>

                {/* Slider Hisap (Lepas) */}
                <div className="slider-container" style={{ margin: '1px 0' }}>
                  <div className="slider-labels" style={{ fontSize: '0.68rem' }}>
                    <span style={{ fontWeight: 600 }}>Waktu Hisap (Lepas)</span>
                    <span className="slider-value-chip" style={{ fontWeight: 700, minWidth: '70px', textAlign: 'center' }}>
                      {(gripHisapTime / 1000).toFixed(1)} s ({gripHisapTime} ms)
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1000" max="10000" step="100"
                    value={gripHisapTime}
                    disabled={isAutonomous}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      setGripHisapTime(v);
                      localStorage.setItem('delta_grip_hisap', v);
                    }}
                    onMouseUp={() => sendCommand(`SET_GRIP_TIME ${gripTiupTime} ${gripHisapTime} ${gripExpandTime}`)}
                    onTouchEnd={() => sendCommand(`SET_GRIP_TIME ${gripTiupTime} ${gripHisapTime} ${gripExpandTime}`)}
                  />
                  <div style={{ display: 'flex', gap: '4px', marginTop: '3px', flexWrap: 'wrap' }}>
                    {[1000, 2000, 3000, 4000, 5000, 8000, 10000].map((t) => (
                      <button
                        key={t}
                        type="button"
                        disabled={isAutonomous}
                        onClick={() => {
                          setGripHisapTime(t);
                          localStorage.setItem('delta_grip_hisap', t);
                          sendCommand(`SET_GRIP_TIME ${gripTiupTime} ${t} ${gripExpandTime}`);
                        }}
                        style={{
                          fontSize: '0.6rem',
                          padding: '1px 5px',
                          borderRadius: '3px',
                          border: '1px solid var(--border-color)',
                          background: gripHisapTime === t ? 'var(--accent-color)' : 'rgba(255,255,255,0.04)',
                          color: gripHisapTime === t ? '#fff' : 'var(--text-secondary)',
                          cursor: isAutonomous ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {t / 1000}s
                      </button>
                    ))}
                  </div>
                </div>

                {/* Slider Pre-Expand (Mengembang Sebelum Ambil) */}
                <div className="slider-container" style={{ margin: '1px 0' }}>
                  <div className="slider-labels" style={{ fontSize: '0.68rem' }}>
                    <span style={{ fontWeight: 600 }}>Pre-Expand (Hisap Buka Jari Sebelum Ambil)</span>
                    <span className="slider-value-chip" style={{ fontWeight: 700, minWidth: '70px', textAlign: 'center' }}>
                      {(gripExpandTime / 1000).toFixed(1)} s ({gripExpandTime} ms)
                    </span>
                  </div>
                  <input
                    type="range"
                    min="200" max="3000" step="100"
                    value={gripExpandTime}
                    disabled={isAutonomous}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      setGripExpandTime(v);
                      localStorage.setItem('delta_grip_expand', v);
                    }}
                    onMouseUp={() => sendCommand(`SET_GRIP_TIME ${gripTiupTime} ${gripHisapTime} ${gripExpandTime}`)}
                    onTouchEnd={() => sendCommand(`SET_GRIP_TIME ${gripTiupTime} ${gripHisapTime} ${gripExpandTime}`)}
                  />
                  <div style={{ display: 'flex', gap: '4px', marginTop: '3px', flexWrap: 'wrap' }}>
                    {[300, 500, 800, 1000, 1500, 2000].map((t) => (
                      <button
                        key={t}
                        type="button"
                        disabled={isAutonomous}
                        onClick={() => {
                          setGripExpandTime(t);
                          localStorage.setItem('delta_grip_expand', t);
                          sendCommand(`SET_GRIP_TIME ${gripTiupTime} ${gripHisapTime} ${t}`);
                        }}
                        style={{
                          fontSize: '0.6rem',
                          padding: '1px 5px',
                          borderRadius: '3px',
                          border: '1px solid var(--border-color)',
                          background: gripExpandTime === t ? 'var(--accent-color)' : 'rgba(255,255,255,0.04)',
                          color: gripExpandTime === t ? '#fff' : 'var(--text-secondary)',
                          cursor: isAutonomous ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {t >= 1000 ? (t / 1000) + 's' : t + 'ms'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Pump Speed Controls (PWM) */}
              <div style={{ background: 'var(--card-bg, rgba(255,255,255,0.03))', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>KECEPATAN POMPA (PWM)</span>
                  <button
                    className="clean-btn primary"
                    style={{ padding: '2px 8px', fontSize: '0.65rem' }}
                    onClick={async () => {
                      localStorage.setItem('delta_pump1_speed', pump1Speed);
                      localStorage.setItem('delta_pump2_speed', pump2Speed);
                      await sendCommand(`SET_GRIP_SPEED ${pump1Speed} ${pump2Speed}`);
                      await sleep(100);
                      await sendCommand(`SAVE_CONFIG`);
                      setLogs(prev => [...prev, `[GRIPPER] Kecepatan pompa tersimpan permanen ke EEPROM: Pompa 1 (Tiup)=${pump1Speed} | Pompa 2 (Hisap)=${pump2Speed}`]);
                    }}
                    disabled={isAutonomous}
                    title="Kirim parameter kecepatan pompa (PWM) dan simpan permanen ke EEPROM Arduino Mega"
                  >
                    Simpan Kecepatan
                  </button>
                </div>

                <div className="slider-container" style={{ margin: '2px 0' }}>
                  <div className="slider-labels" style={{ fontSize: '0.68rem' }}>
                    <span>Pompa 1 Tiup (Ambil / D45)</span>
                    <span className="slider-value-chip">{pump1Speed} ({Math.round((pump1Speed / 255) * 100)}%)</span>
                  </div>
                  <input
                    type="range"
                    min="50" max="255" step="5"
                    value={pump1Speed}
                    disabled={isAutonomous}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      setPump1Speed(v);
                      localStorage.setItem('delta_pump1_speed', v);
                    }}
                    onMouseUp={() => sendCommand(`SET_GRIP_SPEED ${pump1Speed} ${pump2Speed}`)}
                    onTouchEnd={() => sendCommand(`SET_GRIP_SPEED ${pump1Speed} ${pump2Speed}`)}
                  />
                </div>

                <div className="slider-container" style={{ margin: '2px 0' }}>
                  <div className="slider-labels" style={{ fontSize: '0.68rem' }}>
                    <span>Pompa 2 Hisap (Lepas / D12)</span>
                    <span className="slider-value-chip">{pump2Speed} ({Math.round((pump2Speed / 255) * 100)}%)</span>
                  </div>
                  <input
                    type="range"
                    min="50" max="255" step="5"
                    value={pump2Speed}
                    disabled={isAutonomous}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      setPump2Speed(v);
                      localStorage.setItem('delta_pump2_speed', v);
                    }}
                    onMouseUp={() => sendCommand(`SET_GRIP_SPEED ${pump1Speed} ${pump2Speed}`)}
                    onTouchEnd={() => sendCommand(`SET_GRIP_SPEED ${pump1Speed} ${pump2Speed}`)}
                  />
                </div>
              </div>

              {/* Sensor Diagnostics */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px', paddingTop: '6px', borderTop: '1px solid var(--border-color)', fontSize: '0.72rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Sensor Proximity (A:D53, B:D51):</span>
                <button
                  className="clean-btn"
                  style={{ padding: '2px 8px', fontSize: '0.68rem' }}
                  title="Uji status deteksi pin sensor fisik saat ini"
                  onClick={() => sendCommand('TEST_SENSOR')}
                  disabled={isAutonomous}
                >
                  CEK SENSOR
                </button>
              </div>

              {isAutonomous && (
                <div style={{ background: 'rgba(0, 255, 136, 0.08)', border: '1px solid rgba(0, 255, 136, 0.25)', borderRadius: '4px', padding: '6px', fontSize: '0.68rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                  <strong style={{ color: 'var(--accent-color)' }}>Mode Otomatis Aktif:</strong> Letakkan benda di depan Sensor A (Pin 53) untuk START A, atau Sensor B (Pin 51) untuk START B.
                </div>
              )}
            </div>
          </div>

          {/* Card 3: Live Cycle Time Meter & Production Telemetry */}
          <div className="section-card">
            <div className="section-title">
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Clock size={14} style={{ color: 'var(--accent-color)' }} />
                CYCLE TIME & TELEMETRI
              </span>
              <span 
                className={`slider-value-chip ${isCycleRunning ? 'pulse-glow' : ''}`} 
                style={{ 
                  margin: 0, 
                  padding: '2px 8px', 
                  fontSize: '0.68rem',
                  background: isCycleRunning ? 'rgba(0, 255, 136, 0.2)' : 'var(--card-bg)',
                  color: isCycleRunning ? 'var(--accent-color)' : 'var(--text-muted)'
                }}
              >
                {isCycleRunning ? `RUNNING (${liveCycleDuration}s)` : 'STANDBY'}
              </span>
            </div>

            {/* Metrics 3-Col Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginTop: '6px' }}>
              <div style={{ padding: '8px 4px', textAlign: 'center', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--accent-color)', fontFamily: 'Space Grotesk' }}>
                  {isCycleRunning ? `${liveCycleDuration}s` : (lastCycleDuration > 0 ? `${lastCycleDuration}s` : '-')}
                </span>
                <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block' }}>Siklus Terakhir</span>
              </div>
              <div style={{ padding: '8px 4px', textAlign: 'center', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#38bdf8', fontFamily: 'Space Grotesk' }}>
                  {avgCycleDuration > 0 ? `${avgCycleDuration}s` : '-'}
                </span>
                <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block' }}>Rata-rata</span>
              </div>
              <div style={{ padding: '8px 4px', textAlign: 'center', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f59e0b', fontFamily: 'Space Grotesk' }}>
                  {estimatedPPM}
                </span>
                <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block' }}>PPM Throughput</span>
              </div>
            </div>

            {/* Counter Row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px 10px', marginTop: '6px', fontSize: '0.72rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Item Diproses:</span>
              <div style={{ display: 'flex', gap: '8px', fontWeight: 600 }}>
                <span style={{ color: 'var(--text-color)' }}>A: <strong style={{ color: 'var(--accent-color)' }}>{cycleCountA}</strong></span>
                <span style={{ color: 'var(--text-color)' }}>B: <strong style={{ color: 'var(--accent-color)' }}>{cycleCountB}</strong></span>
                <span style={{ color: 'var(--text-color)' }}>Total: <strong style={{ color: '#38bdf8' }}>{totalCycles}</strong></span>
              </div>
            </div>

            {/* Telemetry Actions */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px', marginTop: '6px' }}>
              <button 
                className="clean-btn primary" 
                style={{ padding: '6px 10px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
                onClick={() => setIsCycleHistoryModalOpen(true)}
              >
                <History size={13} />
                Riwayat & Ekspor CSV
              </button>
              <button 
                className="clean-btn" 
                style={{ padding: '6px 8px', fontSize: '0.7rem' }}
                title="Reset counter produksi"
                onClick={resetCycleCounter}
              >
                <RotateCcw size={13} />
              </button>
            </div>
          </div>

          {/* Card 4: Jogging Controls (Absolute & Step Relative) */}
          <div className="section-card">
            <div className="section-title">
              <span>MANUAL JOGGING</span>
              <div className="step-selector">
                {[1, 5, 10, 25].map(s => (
                  <button
                    key={s}
                    className={`step-btn ${jogStep === s ? 'active' : ''}`}
                    disabled={isAutonomous}
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
              <input type="number" name="x" placeholder="X" required defaultValue={pos.x} disabled={isAutonomous} />
              <input type="number" name="y" placeholder="Y" required defaultValue={pos.y} disabled={isAutonomous} />
              <input type="number" name="z" placeholder="Z" required defaultValue={pos.z} disabled={isAutonomous} />
              <button type="submit" disabled={isAutonomous}>GO</button>
            </form>

            {/* D-Pad Jogging */}
            <div className="jog-container" style={{ marginTop: '2px' }}>
              <button className="jog-btn" disabled={isAutonomous} onClick={() => sendCommand(`${pos.x - jogStep} ${pos.y} ${pos.z}`)}>
                X-
              </button>
              <button className="jog-btn" disabled={isAutonomous} onClick={() => sendCommand(`${pos.x} ${pos.y - jogStep} ${pos.z}`)}>
                Y+
              </button>
              <button className="jog-btn" disabled={isAutonomous} onClick={() => sendCommand(`${pos.x + jogStep} ${pos.y} ${pos.z}`)}>
                X+
              </button>
              <button className="jog-btn" disabled={isAutonomous} onClick={() => sendCommand(`${pos.x} ${pos.y} ${pos.z + jogStep}`)}>
                Z+
              </button>
              <button className="jog-btn" disabled={isAutonomous} onClick={() => sendCommand(`${pos.x} ${pos.y + jogStep} ${pos.z}`)}>
                Y-
              </button>
              <button className="jog-btn" disabled={isAutonomous} onClick={() => sendCommand(`${pos.x} ${pos.y} ${pos.z - jogStep}`)}>
                Z-
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', fontSize: '0.7rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Shortcut Keyboard:</span>
              <button
                className={`clean-btn ${isKeyJogActive ? 'primary' : ''}`}
                style={{ padding: '2px 8px', fontSize: '0.68rem' }}
                disabled={isAutonomous}
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
                disabled={isAutonomous}
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
                disabled={isAutonomous}
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
                disabled={isAutonomous}
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
                disabled={isAutonomous || isPlayingPattern}
                onClick={() => runTestPattern('circle')}
                style={{ padding: '6px 2px', fontSize: '0.68rem' }}
              >
                Lingkaran
              </button>
              <button
                className="clean-btn"
                disabled={isAutonomous || isPlayingPattern}
                onClick={() => runTestPattern('square')}
                style={{ padding: '6px 2px', fontSize: '0.68rem' }}
              >
                Persegi
              </button>
              <button
                className="clean-btn"
                disabled={isAutonomous || isPlayingPattern}
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

          {/* VS CODE STYLE INTEGRATED ADJUSTABLE TERMINAL */}
          <div 
            className="vscode-terminal-panel"
            style={{
              height: isTerminalCollapsed ? '34px' : `${terminalHeight}px`,
              cursor: isDraggingTerminal ? 'ns-resize' : 'default'
            }}
          >
            {/* Splitter Resizer Handle Bar */}
            <div 
              className={`vscode-terminal-resizer ${isDraggingTerminal ? 'active' : ''}`}
              title="Tarik ke atas/bawah untuk atur ukuran (Klik 2x untuk minimize/restore)"
              onMouseDown={(e) => { e.preventDefault(); handleStartResize(e.clientY); }}
              onTouchStart={(e) => { if (e.touches && e.touches[0]) handleStartResize(e.touches[0].clientY); }}
              onDoubleClick={handleToggleTerminalCollapse}
            />

            {/* VS Code Style Header Tabs & Actions */}
            <div className="vscode-terminal-header" onDoubleClick={handleToggleTerminalCollapse}>
              <div className="vscode-terminal-tabs">
                <div className="vscode-terminal-tab active">
                  <TerminalIcon size={13} style={{ color: 'var(--accent-color)' }} />
                  <span>TERMINAL SERIAL & ROBOT LOGS</span>
                  <span style={{ 
                    fontSize: '0.62rem', 
                    background: 'rgba(255,255,255,0.08)', 
                    padding: '1px 6px', 
                    borderRadius: '10px',
                    fontFamily: 'monospace' 
                  }}>
                    {logs.length}
                  </span>
                </div>
              </div>

              <div className="vscode-terminal-actions">
                <button 
                  className="vscode-action-btn"
                  title="Bersihkan Log (Clear)"
                  onClick={() => setLogs(["[SYSTEM] Log dibersihkan."])}
                >
                  <Trash2 size={13} />
                </button>
                <button 
                  className="vscode-action-btn"
                  title={isTerminalMaximized ? "Restore Ukuran" : "Perbesar Penuh (Maximize)"}
                  onClick={handleToggleTerminalMaximize}
                >
                  {isTerminalMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                </button>
                <button 
                  className="vscode-action-btn"
                  title={isTerminalCollapsed ? "Buka Terminal" : "Sembunyikan Terminal (Minimize)"}
                  onClick={handleToggleTerminalCollapse}
                >
                  {isTerminalCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>
            </div>

            {/* Terminal Body & Prompt */}
            {!isTerminalCollapsed && (
              <div className="vscode-terminal-body">
                <div className="vscode-terminal-logs">
                  {logs.map((log, i) => {
                    let extraClass = '';
                    if (log.includes('ERROR') || log.includes('Gagal')) extraClass = ' error';
                    else if (log.startsWith('>')) extraClass = ' cmd';
                    else if (log.includes('[ROBOT]') || log.includes('[MEGA]')) extraClass = ' robot';
                    return (
                      <div key={i} className={`log-line${extraClass}`}>{log}</div>
                    );
                  })}
                  <div ref={logsEndRef} />
                </div>

                {/* VS Code Command Input Line */}
                <div className="vscode-terminal-input-bar">
                  <span className="prompt" style={{ color: 'var(--accent-color)', fontWeight: 700 }}>{">"}</span>
                  <input
                    type="text"
                    className="terminal-input"
                    value={terminalInputText}
                    onChange={(e) => setTerminalInputText(e.target.value)}
                    placeholder="Ketik perintah (HOME, TIUP, HISAP, STARTA, STARTB, X Y Z, SET_SPEED 800)..."
                    onKeyDown={handleTerminalKeyDown}
                  />
                  <button
                    className="clean-btn primary"
                    style={{ padding: '3px 10px', fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                    onClick={() => {
                      const val = terminalInputText.trim();
                      if (val) {
                        sendCommand(val);
                        setCmdHistory(prev => [val, ...prev.filter(item => item !== val).slice(0, 30)]);
                        setTerminalInputText('');
                      }
                    }}
                  >
                    <Send size={11} />
                    <span>Kirim</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* RIGHT PANEL: COORDINATES & SEQUENCING */}
        <aside className="panel right-panel">
          <div className="panel-header-title">
            SEKUENSI & TEMPLATE KOORDINAT
          </div>

          {/* Card 1: Templates */}
          <div className="section-card">
            <div className="section-title">
              TEMPLATE KOORDINAT
            </div>
            <select onChange={handleSelectTemplate} value={newTemplateName || ""} disabled={isAutonomous}>
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
                disabled={isAutonomous}
                style={{ flexGrow: 1 }}
              />
              <button className="clean-btn primary" onClick={handleSaveTemplate} disabled={isAutonomous} style={{ padding: '6px 10px' }}>
                Simpan
              </button>
              <button className="clean-btn danger" onClick={handleDeleteTemplate} disabled={isAutonomous} style={{ padding: '6px 10px' }}>
                Hapus
              </button>
            </div>

            <button
              className="clean-btn primary"
              onClick={handleApplyAllCoordinates}
              disabled={isAutonomous || isApplyingAll}
              style={{ width: '100%', marginTop: '6px', padding: '8px', fontWeight: 600 }}
            >
              {isApplyingAll ? 'Menerapkan ke Robot...' : 'Terapkan Semua Koordinat ke Robot'}
            </button>

            {/* Global Z-Offset Adjuster */}
            <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Koreksi Ketinggian Z (Global Offset) <span style={{ color: '#f59e0b', fontSize: '0.64rem' }}>[Batas: -400mm]</span>:
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '3px' }}>
                <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '4px 1px' }} disabled={isAutonomous} onClick={() => applyGlobalZOffset(-10)} title="Turunkan seluruh titik Z sebesar 10mm">
                  -10mm
                </button>
                <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '4px 1px' }} disabled={isAutonomous} onClick={() => applyGlobalZOffset(-5)} title="Turunkan seluruh titik Z sebesar 5mm">
                  -5mm
                </button>
                <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '4px 1px' }} disabled={isAutonomous} onClick={() => applyGlobalZOffset(-1)} title="Turunkan seluruh titik Z sebesar 1mm">
                  -1mm
                </button>
                <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '4px 1px' }} disabled={isAutonomous} onClick={() => applyGlobalZOffset(1)} title="Naikkan seluruh titik Z sebesar 1mm">
                  +1mm
                </button>
                <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '4px 1px' }} disabled={isAutonomous} onClick={() => applyGlobalZOffset(5)} title="Naikkan seluruh titik Z sebesar 5mm">
                  +5mm
                </button>
                <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '4px 1px' }} disabled={isAutonomous} onClick={() => applyGlobalZOffset(10)} title="Naikkan seluruh titik Z sebesar 10mm">
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
                disabled={isAutonomous}
              >
                Test Routine A
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                <span>Titik Ambil (Pick A):</span>
                <span 
                  style={{ 
                    color: isAutonomous ? 'var(--text-muted)' : 'var(--accent-color)', 
                    cursor: isAutonomous ? 'not-allowed' : 'pointer' 
                  }} 
                  onClick={() => !isAutonomous && sendCommand(`${pickA.x} ${pickA.y} ${pickA.z}`)}
                >
                  Gerak ke Pick A
                </span>
              </div>
              <div className="coord-row">
                <input type="number" value={pickA.x} disabled={isAutonomous} onChange={e => { const v = { ...pickA, x: e.target.value }; setPickA(v); localStorage.setItem('delta_pickA', JSON.stringify(v)); }} placeholder="X" />
                <input type="number" value={pickA.y} disabled={isAutonomous} onChange={e => { const v = { ...pickA, y: e.target.value }; setPickA(v); localStorage.setItem('delta_pickA', JSON.stringify(v)); }} placeholder="Y" />
                <input type="number" value={pickA.z} disabled={isAutonomous} onChange={e => { const v = { ...pickA, z: e.target.value }; setPickA(v); localStorage.setItem('delta_pickA', JSON.stringify(v)); }} placeholder="Z" />
                <button className="clean-btn action-btn" disabled={isAutonomous} onClick={() => { const v = { x: pos.x, y: pos.y, z: pos.z }; setPickA(v); localStorage.setItem('delta_pickA', JSON.stringify(v)); }}>GET</button>
                <button className="clean-btn primary action-btn" disabled={isAutonomous} onClick={async () => { localStorage.setItem('delta_pickA', JSON.stringify(pickA)); await sendCommand(`SET_A_PICK ${pickA.x} ${pickA.y} ${pickA.z}`); await sleep(50); await sendCommand('SAVE_CONFIG'); }}>SET</button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                <span>Titik Letak (Drop A):</span>
                <span 
                  style={{ 
                    color: isAutonomous ? 'var(--text-muted)' : 'var(--accent-color)', 
                    cursor: isAutonomous ? 'not-allowed' : 'pointer' 
                  }} 
                  onClick={() => !isAutonomous && sendCommand(`${dropA.x} ${dropA.y} ${dropA.z}`)}
                >
                  Gerak ke Drop A
                </span>
              </div>
              <div className="coord-row">
                <input type="number" value={dropA.x} disabled={isAutonomous} onChange={e => { const v = { ...dropA, x: e.target.value }; setDropA(v); localStorage.setItem('delta_dropA', JSON.stringify(v)); }} placeholder="X" />
                <input type="number" value={dropA.y} disabled={isAutonomous} onChange={e => { const v = { ...dropA, y: e.target.value }; setDropA(v); localStorage.setItem('delta_dropA', JSON.stringify(v)); }} placeholder="Y" />
                <input type="number" value={dropA.z} disabled={isAutonomous} onChange={e => { const v = { ...dropA, z: e.target.value }; setDropA(v); localStorage.setItem('delta_dropA', JSON.stringify(v)); }} placeholder="Z" />
                <button className="clean-btn action-btn" disabled={isAutonomous} onClick={() => { const v = { x: pos.x, y: pos.y, z: pos.z }; setDropA(v); localStorage.setItem('delta_dropA', JSON.stringify(v)); }}>GET</button>
                <button className="clean-btn primary action-btn" disabled={isAutonomous} onClick={async () => { localStorage.setItem('delta_dropA', JSON.stringify(dropA)); await sendCommand(`SET_A_DROP ${dropA.x} ${dropA.y} ${dropA.z}`); await sleep(50); await sendCommand('SAVE_CONFIG'); }}>SET</button>
              </div>

              {/* Step by Step Sequencer A */}
              <div style={{ marginTop: '6px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '6px' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600 }}>
                  Uji Langkah per Langkah (Profil A):
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                  <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '5px 2px' }} disabled={isAutonomous} onClick={() => executeStep('approach_pick', 'A')}>
                    1. Buka (Hisap)
                  </button>
                  <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '5px 2px' }} disabled={isAutonomous} onClick={() => executeStep('pick_down', 'A')}>
                    2. Jepit (Tiup)
                  </button>
                  <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '5px 2px' }} disabled={isAutonomous} onClick={() => executeStep('pick_lift', 'A')}>
                    3. Angkat
                  </button>
                  <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '5px 2px' }} disabled={isAutonomous} onClick={() => executeStep('approach_drop', 'A')}>
                    4. Atas Drop
                  </button>
                  <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '5px 2px' }} disabled={isAutonomous} onClick={() => executeStep('drop_down', 'A')}>
                    5. Lepas (Hisap)
                  </button>
                  <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '5px 2px' }} disabled={isAutonomous} onClick={() => executeStep('drop_lift', 'A')}>
                    6. Home
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
                disabled={isAutonomous}
              >
                Test Routine B
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                <span>Titik Ambil (Pick B):</span>
                <span 
                  style={{ 
                    color: isAutonomous ? 'var(--text-muted)' : 'var(--accent-color)', 
                    cursor: isAutonomous ? 'not-allowed' : 'pointer' 
                  }} 
                  onClick={() => !isAutonomous && sendCommand(`${pickB.x} ${pickB.y} ${pickB.z}`)}
                >
                  Gerak ke Pick B
                </span>
              </div>
              <div className="coord-row">
                <input type="number" value={pickB.x} disabled={isAutonomous} onChange={e => { const v = { ...pickB, x: e.target.value }; setPickB(v); localStorage.setItem('delta_pickB', JSON.stringify(v)); }} placeholder="X" />
                <input type="number" value={pickB.y} disabled={isAutonomous} onChange={e => { const v = { ...pickB, y: e.target.value }; setPickB(v); localStorage.setItem('delta_pickB', JSON.stringify(v)); }} placeholder="Y" />
                <input type="number" value={pickB.z} disabled={isAutonomous} onChange={e => { const v = { ...pickB, z: e.target.value }; setPickB(v); localStorage.setItem('delta_pickB', JSON.stringify(v)); }} placeholder="Z" />
                <button className="clean-btn action-btn" disabled={isAutonomous} onClick={() => { const v = { x: pos.x, y: pos.y, z: pos.z }; setPickB(v); localStorage.setItem('delta_pickB', JSON.stringify(v)); }}>GET</button>
                <button className="clean-btn primary action-btn" disabled={isAutonomous} onClick={async () => { localStorage.setItem('delta_pickB', JSON.stringify(pickB)); await sendCommand(`SET_B_PICK ${pickB.x} ${pickB.y} ${pickB.z}`); await sleep(50); await sendCommand('SAVE_CONFIG'); }}>SET</button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                <span>Titik Letak (Drop B):</span>
                <span 
                  style={{ 
                    color: isAutonomous ? 'var(--text-muted)' : 'var(--accent-color)', 
                    cursor: isAutonomous ? 'not-allowed' : 'pointer' 
                  }} 
                  onClick={() => !isAutonomous && sendCommand(`${dropB.x} ${dropB.y} ${dropB.z}`)}
                >
                  Gerak ke Drop B
                </span>
              </div>
              <div className="coord-row">
                <input type="number" value={dropB.x} disabled={isAutonomous} onChange={e => { const v = { ...dropB, x: e.target.value }; setDropB(v); localStorage.setItem('delta_dropB', JSON.stringify(v)); }} placeholder="X" />
                <input type="number" value={dropB.y} disabled={isAutonomous} onChange={e => { const v = { ...dropB, y: e.target.value }; setDropB(v); localStorage.setItem('delta_dropB', JSON.stringify(v)); }} placeholder="Y" />
                <input type="number" value={dropB.z} disabled={isAutonomous} onChange={e => { const v = { ...dropB, z: e.target.value }; setDropB(v); localStorage.setItem('delta_dropB', JSON.stringify(v)); }} placeholder="Z" />
                <button className="clean-btn action-btn" disabled={isAutonomous} onClick={() => { const v = { x: pos.x, y: pos.y, z: pos.z }; setDropB(v); localStorage.setItem('delta_dropB', JSON.stringify(v)); }}>GET</button>
                <button className="clean-btn primary action-btn" disabled={isAutonomous} onClick={async () => { localStorage.setItem('delta_dropB', JSON.stringify(dropB)); await sendCommand(`SET_B_DROP ${dropB.x} ${dropB.y} ${dropB.z}`); await sleep(50); await sendCommand('SAVE_CONFIG'); }}>SET</button>
              </div>

              {/* Step by Step Sequencer B */}
              <div style={{ marginTop: '6px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '6px' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600 }}>
                  Uji Langkah per Langkah (Profil B):
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                  <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '5px 2px' }} disabled={isAutonomous} onClick={() => executeStep('approach_pick', 'B')}>
                    1. Buka (Hisap)
                  </button>
                  <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '5px 2px' }} disabled={isAutonomous} onClick={() => executeStep('pick_down', 'B')}>
                    2. Jepit (Tiup)
                  </button>
                  <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '5px 2px' }} disabled={isAutonomous} onClick={() => executeStep('pick_lift', 'B')}>
                    3. Angkat
                  </button>
                  <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '5px 2px' }} disabled={isAutonomous} onClick={() => executeStep('approach_drop', 'B')}>
                    4. Atas Drop
                  </button>
                  <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '5px 2px' }} disabled={isAutonomous} onClick={() => executeStep('drop_down', 'B')}>
                    5. Lepas (Hisap)
                  </button>
                  <button className="clean-btn" style={{ fontSize: '0.65rem', padding: '5px 2px' }} disabled={isAutonomous} onClick={() => executeStep('drop_lift', 'B')}>
                    6. Home
                  </button>
                </div>
              </div>
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
                    Backend Serial
                  </button>
                  <button
                    className={`mode-btn ${connectionMode === 'usb' ? 'active' : ''}`}
                    onClick={() => handleSaveConnectionSettings('usb', espIp)}
                    title="Hubungkan langsung ke Arduino Mega via USB port browser (Web Serial API)"
                  >
                    USB Mega Langsung
                  </button>
                </div>

                {/* USB Direct Connection Card */}
                {connectionMode === 'usb' && (
                  <div className="config-card" style={{ marginTop: '14px', border: '1px solid rgba(168,85,247,0.4)' }}>
                    <div className="config-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Usb size={15} style={{ color: '#a855f7' }} />
                        USB Serial Langsung ke Arduino Mega
                      </span>
                      <span style={{ fontSize: '0.7rem', color: usbConnected ? 'var(--accent-color)' : '#f87171', fontWeight: 600 }}>
                        {usbConnected ? 'TERHUBUNG' : 'TERPUTUS'}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '6px 0 10px 0', lineHeight: 1.5 }}>
                      Mode ini menghubungkan browser langsung ke port USB Arduino Mega 2560 tanpa perantara backend server. Cocok untuk demo offline atau jika teman ingin mencoba tanpa perlu ngrok.
                    </p>
                    <div style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: '6px', padding: '8px 10px', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '10px', lineHeight: 1.5 }}>
                      <strong style={{ color: '#a855f7' }}>Syarat:</strong> Gunakan Chrome atau Edge. Colokkan kabel USB Arduino Mega ke komputer ini. Pastikan tidak ada program Arduino IDE / backend yang sedang membuka COM port yang sama.
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {!usbConnected ? (
                        <button
                          className="clean-btn primary"
                          style={{ flex: 1, padding: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'rgba(168,85,247,0.2)', borderColor: '#a855f7', color: '#a855f7' }}
                          onClick={connectUsb}
                          disabled={isConnectingUsb}
                        >
                          <PlugZap size={14} />
                          {isConnectingUsb ? 'Menghubungkan...' : 'Pilih Port & Hubungkan USB'}
                        </button>
                      ) : (
                        <button
                          className="clean-btn danger"
                          style={{ flex: 1, padding: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                          onClick={disconnectUsb}
                        >
                          <Unplug size={14} />
                          Putus Koneksi USB
                        </button>
                      )}
                    </div>
                  </div>
                )}
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

      {/* CYCLE HISTORY & CSV EXPORT MODAL */}
      {isCycleHistoryModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsCycleHistoryModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '640px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BarChart3 size={18} style={{ color: 'var(--accent-color)' }} />
                Riwayat Siklus & Telemetri Produksi
              </div>
              <button className="modal-close-btn" onClick={() => setIsCycleHistoryModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {/* Summary KPIs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px' }}>
                <div style={{ background: 'var(--input-bg)', border: '1px solid var(--border-color)', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent-color)', fontFamily: 'Space Grotesk' }}>{totalCycles}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Total Siklus</div>
                </div>
                <div style={{ background: 'var(--input-bg)', border: '1px solid var(--border-color)', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#38bdf8', fontFamily: 'Space Grotesk' }}>{lastCycleDuration > 0 ? `${lastCycleDuration}s` : '-'}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Durasi Terakhir</div>
                </div>
                <div style={{ background: 'var(--input-bg)', border: '1px solid var(--border-color)', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#a855f7', fontFamily: 'Space Grotesk' }}>{avgCycleDuration > 0 ? `${avgCycleDuration}s` : '-'}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Rata-rata</div>
                </div>
                <div style={{ background: 'var(--input-bg)', border: '1px solid var(--border-color)', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f59e0b', fontFamily: 'Space Grotesk' }}>{estimatedPPM}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Kapasitas (PPM)</div>
                </div>
              </div>

              {/* History Table */}
              <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--input-bg)' }}>
                {cycleHistory.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Belum ada riwayat siklus. Jalankan START A atau START B untuk mencatat data waktu siklus.
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '8px 10px' }}>#</th>
                        <th style={{ padding: '8px 10px' }}>Waktu</th>
                        <th style={{ padding: '8px 10px' }}>Profil</th>
                        <th style={{ padding: '8px 10px' }}>Durasi</th>
                        <th style={{ padding: '8px 10px' }}>Throughput</th>
                        <th style={{ padding: '8px 10px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cycleHistory.map((item, idx) => (
                        <tr key={item.id || idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{idx + 1}</td>
                          <td style={{ padding: '8px 10px' }}>{item.timestamp}</td>
                          <td style={{ padding: '8px 10px', fontWeight: 600, color: item.profile === 'Profil A' ? 'var(--accent-color)' : '#38bdf8' }}>{item.profile}</td>
                          <td style={{ padding: '8px 10px', fontFamily: 'JetBrains Mono' }}>{item.duration}s</td>
                          <td style={{ padding: '8px 10px', color: '#f59e0b' }}>{item.ppm} PPM</td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{ color: 'var(--accent-color)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <CheckCircle size={12} /> {item.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Modal Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                <button
                  className="clean-btn danger"
                  style={{ padding: '8px 14px', fontSize: '0.78rem' }}
                  onClick={resetCycleCounter}
                >
                  Reset Semua Data
                </button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="clean-btn"
                    style={{ padding: '8px 14px', fontSize: '0.78rem' }}
                    onClick={() => setIsCycleHistoryModalOpen(false)}
                  >
                    Tutup
                  </button>
                  <button
                    className="clean-btn primary"
                    style={{ padding: '8px 16px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                    onClick={exportCycleReportCSV}
                  >
                    <Download size={14} />
                    Unduh Laporan CSV
                  </button>
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
