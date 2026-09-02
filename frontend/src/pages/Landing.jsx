import React, { Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Cpu, Zap, Activity, Box, PenTool, Printer, Code, Layers, Target, Monitor, Sliders, Terminal, Link } from 'lucide-react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, Center } from '@react-three/drei';
import { STLLoader } from 'three-stdlib';
import ThemeToggle from '../components/ThemeToggle';
import './pages.css';

const RobotBase = ({ scale, position, rotation }) => {
  const geom = useLoader(STLLoader, '/RobotFull.stl');
  return (
    <Center position={[position.x, position.y, position.z]}>
      <mesh geometry={geom} rotation={[rotation.x * Math.PI/180, rotation.y * Math.PI/180, rotation.z * Math.PI/180]} scale={scale}>
        <meshStandardMaterial color="#b0b0b0" metalness={0.8} roughness={0.2} side={2} />
      </mesh>
    </Center>
  );
};

const Landing = () => {
  const navigate = useNavigate();

  return (
    <div className="page-container landing-page">
      {/* HEADER NAVBAR */}
      <nav className="landing-nav">
        <div className="nav-logo">
          <span className="logo-text">DELTA OS</span>
        </div>
        <div className="nav-links">
          <a href="#about">PHILOSOPHY</a>
          <a href="#features">FEATURES</a>
          <a href="#capabilities">CAPABILITIES</a>
          <a href="#tech">TECHNOLOGY</a>
        </div>
        <div className="nav-right-actions">
          <ThemeToggle />
          <button className="nav-btn-outline" onClick={() => navigate('/login')}>LOGIN</button>
        </div>
      </nav>

      {/* HERO SECTION */}
      <header className="hero-section">
        <div className="hero-container-inner">
          <div className="hero-content">
            <div className="badge-pill">Open Source Robotics</div>
            <h1 className="hero-title">DELTA ROBOT <span>POLMAN OS</span></h1>
            <p className="hero-subtitle">
              Sistem operasi robot Delta paralel presisi tinggi Politeknik Manufaktur Negeri Bandung.
              Dirancang untuk riset, edukasi, dan automasi industri Pick & Place berkecepatan tinggi.
            </p>
            <div className="hero-actions">
              <button className="primary-btn pulse-glow" onClick={() => navigate('/dashboard')}>
                AKSES DASHBOARD <ArrowRight size={18} />
              </button>
            </div>
          </div>

          <div className="hero-3d-container">
            <Canvas camera={{ position: [250, 150, 250], fov: 45 }}>
              <ambientLight intensity={0.5} />
              <directionalLight position={[100, 200, 50]} intensity={1.5} />
              <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={1} target={[0, 80, 0]} />
              
              <Suspense fallback={null}>
                <RobotBase scale={0.5} position={{x:0, y:60, z:12}} rotation={{x:-1, y:-20, z:0}} />
              </Suspense>
            </Canvas>
          </div>
        </div>
        
        <div className="hero-bg-grid"></div>
      </header>

      {/* PHILOSOPHY / ABOUT */}
      <section id="about" className="about-section fade-in-up">
        <div className="section-header center">
          <h2>FILOSOFI DESAIN</h2>
          <div className="separator-line"></div>
        </div>
        <div className="about-grid" style={{ marginTop: '40px' }}>
          <div className="about-text" style={{ textAlign: 'justify' }}>
            <h3>Mengapa Delta Robot Polman?</h3>
            <p>
              Delta Robot adalah tipe robot paralel berkecepatan tinggi yang memusatkan massa motor di pelat dasar atas, 
              menghilangkan beban inersia motor pada lengan artikulasi. Dirancang dan dikembangkan di Politeknik Manufaktur Negeri Bandung (POLMAN), 
              robot ini menggunakan aktuator stepper terkalibrasi khusus untuk automasi *Pick & Place* industri dengan keandalan maksimal.
            </p>
            <p>
              Dilengkapi dengan aktuator **Hanpose Planetary Gearbox 5.18:1**, driver mikro-langkah DRV8825, dinamo hisap vakum berdaya tinggi, 
              serta sensor pendeteksi barang ganda (*Dual Optical/Inductive Proximity*) untuk menjalankan siklus penyortiran barang A dan B secara otonom tanpa campur tangan operator.
            </p>
          </div>
          <div className="about-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
            <div className="stat-box" style={{ alignItems: 'center', textAlign: 'center' }}>
              <span className="stat-value">5.18:1</span>
              <span className="stat-label">Planetary Gear Ratio</span>
            </div>
            <div className="stat-box" style={{ alignItems: 'center', textAlign: 'center' }}>
              <span className="stat-value">2.88</span>
              <span className="stat-label">Steps / Derajat</span>
            </div>
            <div className="stat-box" style={{ alignItems: 'center', textAlign: 'center' }}>
              <span className="stat-value">150<small>mm</small></span>
              <span className="stat-label">Radius Workspace</span>
            </div>
            <div className="stat-box" style={{ alignItems: 'center', textAlign: 'center' }}>
              <span className="stat-value">3 DOF</span>
              <span className="stat-label">Paralel Kinematika</span>
            </div>
          </div>
        </div>
      </section>

      {/* DASHBOARD FEATURES */}
      <section id="features" className="capabilities-section fade-in-up">
        <div className="section-header center">
          <h2>FITUR KONTROL & DASHBOARD</h2>
          <p>Kontrol penuh atas robot Delta Anda melalui antarmuka web interaktif tanpa perlu instalasi perangkat lunak tambahan.</p>
          <div className="separator-line"></div>
        </div>
        
        <div className="features-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginTop: '40px' }}>
          <div className="feature-card hover-lift">
            <div className="icon-wrapper"><Monitor size={28} /></div>
            <h3>Live 3D Digital Twin</h3>
            <p>Visualisasi kinematika robot secara *real-time* di dalam browser. Tiga lengan virtual bergerak presisi mengikuti posisi koordinat fisik robot.</p>
          </div>
          <div className="feature-card hover-lift">
            <div className="icon-wrapper"><Sliders size={28} /></div>
            <h3>Dual Profile (A & B)</h3>
            <p>Manajemen koordinat Pick & Place terpisah untuk barang A dan B. Simpan template tak terbatas ke database MySQL dengan satu klik.</p>
          </div>
          <div className="feature-card hover-lift">
            <div className="icon-wrapper"><Zap size={28} /></div>
            <h3>Mode Otonom Dual-Sensor</h3>
            <p>Sistem deteksi cerdas berbasis sensor proximity (Pin 53 untuk Item A, Pin 51 untuk Item B). Robot otomatis memilah saat barang tiba.</p>
          </div>
          <div className="feature-card hover-lift">
            <div className="icon-wrapper"><Link size={28} /></div>
            <h3>Koneksi ESP32 Wi-Fi & USB</h3>
            <p>Dukungan komunikasi ganda: REST API nirkabel via ESP32 Wi-Fi Direct (192.168.4.1) serta koneksi kabel Serial USB 115200 baud.</p>
          </div>
        </div>
      </section>

      {/* CAPABILITIES / USE CASES */}
      <section id="capabilities" className="capabilities-section">
        <div className="section-header center">
          <h2>FOKUS: HIGH-SPEED PICK & PLACE</h2>
          <p>Dirancang khusus untuk automasi pemindahan dan penyortiran barang presisi di lini produksi manufaktur.</p>
          <div className="separator-line"></div>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '40px' }}>
          <div className="feature-card hover-lift" style={{ maxWidth: '750px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="icon-wrapper" style={{ width: '80px', height: '80px', marginBottom: '20px' }}>
              <Box size={40} />
            </div>
            <h3 style={{ fontSize: '24px', marginBottom: '15px' }}>Automasi Pemilahan Vakum Industri</h3>
            <p style={{ fontSize: '16px', lineHeight: '1.8', color: '#aaa' }}>
              Menggunakan dinamo hisap vakum elektrik yang dikontrol via relay optocoupler D12. 
              Sistem trajektori cerdas memastikan robot mengambil barang, melakukan homing transit tanpa resiko gesekan mekanis, 
              lalu meletakkan barang di wadah drop tujuan dengan toleransi akurasi sub-milimeter.
            </p>
          </div>
        </div>
      </section>

      {/* TECH STACK ARCHITECTURE */}
      <section id="tech" className="tech-section">
        <div className="section-header center">
          <h2>SPESIFIKASI & ARSITEKTUR TEKNIK</h2>
          <p>Arsitektur komputasi terdistribusi untuk menjamin keandalan kontrol real-time tanpa latensi.</p>
          <div className="separator-line"></div>
        </div>
        
        <div className="workflow-diagram" style={{ marginTop: '40px' }}>
          <div className="workflow-node">
            <Layers className="node-icon" />
            <h4>Web Frontend</h4>
            <span>React 18 + Three.js</span>
            <p>Visualisasi 3D, Template Koordinat & Terminal</p>
          </div>
          <ArrowRight className="workflow-arrow" />
          <div className="workflow-node">
            <Activity className="node-icon" />
            <h4>Backend Server</h4>
            <span>Node.js Express + MySQL</span>
            <p>Manajemen Akun, Database Template & Telemetri</p>
          </div>
          <ArrowRight className="workflow-arrow" />
          <div className="workflow-node">
            <Cpu className="node-icon" />
            <h4>Dual Microcontroller</h4>
            <span>Arduino Mega + ESP32</span>
            <p>Inverse Kinematics 2560 & Wireless Gateway</p>
          </div>
        </div>

        <div className="specs-list" style={{ marginTop: '50px' }}>
          <div className="feature-card hover-lift" style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
            <Target className="spec-icon" size={36} />
            <div>
              <h4 style={{ fontSize: '18px', marginBottom: '10px', color: 'var(--accent-color)' }}>Motor Hanpose 17HS4401S-PG5.18</h4>
              <p style={{ color: '#aaa', lineHeight: '1.6' }}>Stepper dengan Planetary Gearbox internal rasio 5.18:1. Menghasilkan torsi penahan tinggi, resolusi 2.88 steps per derajat, serta bebas slip pada akselerasi tinggi.</p>
            </div>
          </div>
          <div className="feature-card hover-lift" style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
            <Zap className="spec-icon" size={36} />
            <div>
              <h4 style={{ fontSize: '18px', marginBottom: '10px', color: 'var(--accent-color)' }}>Sistem Keamanan Hardware & Software</h4>
              <p style={{ color: '#aaa', lineHeight: '1.6' }}>Dilengkapi saklar fisik Emergency Stop (NC Switch D31) yang seketika mengunci motor dalam holding torque tanpa memutus vakum objek, ditambah interrupt darurat via web.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="landing-footer">
        <div className="footer-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '10px' }}>
          <div className="footer-brand">
            <h3 style={{ fontSize: '20px' }}>DELTA ROBOT POLMAN</h3>
            <p style={{ fontSize: '14px', marginTop: '5px' }}>Politeknik Manufaktur Negeri Bandung - Majalengka</p>
          </div>
          <div className="separator-line" style={{ width: '40px', height: '2px', margin: '10px 0' }}></div>
          <div className="footer-links">
            <p style={{ fontSize: '13px' }}>© 2026 Delta OS. Hak Cipta Dilindungi.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
