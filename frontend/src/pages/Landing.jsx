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
      <header className="hero-section" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', maxWidth: '1200px', width: '100%', gap: '40px', zIndex: 2 }}>
          <div className="hero-content" style={{ flex: '1', maxWidth: '550px', textAlign: 'left' }}>
            <div className="badge-pill">Open Source Robotics</div>
            <h1 className="hero-title">DELTA X <span>ROBOT OS</span></h1>
            <p className="hero-subtitle">
              Sistem operasi untuk robot Delta Open Source pertama di dunia. 
              Dirancang untuk edukasi, penelitian, dan automasi industri ringan. Cepat, akurat, dan dapat disesuaikan.
            </p>
            <div className="hero-actions" style={{ justifyContent: 'flex-start' }}>
              <button className="primary-btn pulse-glow" onClick={() => navigate('/dashboard')}>
                AKSES DASHBOARD <ArrowRight size={18} />
              </button>
            </div>
          </div>

          <div className="hero-3d-container" style={{ flex: '1', maxWidth: '600px', height: '600px', position: 'relative' }}>
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
            <h3>Mengapa Delta Robot?</h3>
            <p>
              Delta Robot adalah tipe robot paralel yang terdiri dari tiga lengan bersendi yang terhubung 
              ke dasar universal di atas ruang kerja. Desain mekanis unik ini memusatkan massa motor di bagian atas, 
              membuat lengan robot sangat ringan namun kokoh. 
            </p>
            <p>
              Hasil dari desain ini adalah tingkat akselerasi dan kecepatan ekstrem tanpa mengorbankan kepresisian ruang. Proyek Delta X kami lahir dari visi untuk menjadikan automasi tingkat industri lebih mudah diakses, direplikasi, dan dikembangkan oleh institusi maupun pabrikan kecil di seluruh dunia.
            </p>
          </div>
          <div className="about-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
            <div className="stat-box" style={{ alignItems: 'center', textAlign: 'center' }}>
              <span className="stat-value">1/16</span>
              <span className="stat-label">Microstepping</span>
            </div>
            <div className="stat-box" style={{ alignItems: 'center', textAlign: 'center' }}>
              <span className="stat-value">150<small>mm</small></span>
              <span className="stat-label">Radius Kerja</span>
            </div>
            <div className="stat-box" style={{ alignItems: 'center', textAlign: 'center', gridColumn: 'span 2' }}>
              <span className="stat-value">3</span>
              <span className="stat-label">Derajat Kebebasan (DOF)</span>
            </div>
          </div>
        </div>
      </section>

      {/* DASHBOARD FEATURES */}
      <section id="features" className="capabilities-section fade-in-up">
        <div className="section-header center">
          <h2>KEUNGGULAN DASHBOARD</h2>
          <p>Kontrol penuh atas robot Delta Anda melalui antarmuka web interaktif tanpa perlu instalasi perangkat lunak tambahan.</p>
          <div className="separator-line"></div>
        </div>
        
        <div className="features-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginTop: '40px' }}>
          <div className="feature-card hover-lift">
            <div className="icon-wrapper"><Monitor size={28} /></div>
            <h3>Live 3D Digital Twin</h3>
            <p>Visualisasi pergerakan robot secara *real-time* di dalam browser. Pantau posisi dan orientasi mesin secara presisi tanpa harus berada di lokasi fisik.</p>
          </div>
          <div className="feature-card hover-lift">
            <div className="icon-wrapper"><Sliders size={28} /></div>
            <h3>Kontrol Koordinat Akurat</h3>
            <p>Kendalikan pergerakan X, Y, Z dan status *end-effector* (vakum/gripper) dengan mudah melalui panel antarmuka yang sangat responsif.</p>
          </div>
          <div className="feature-card hover-lift">
            <div className="icon-wrapper"><Terminal size={28} /></div>
            <h3>Terminal Interaktif</h3>
            <p>Kirim perintah G-Code secara langsung dan pantau log pergerakan serta respons serial secara *live* untuk keperluan *debugging* dan kalibrasi.</p>
          </div>
          <div className="feature-card hover-lift">
            <div className="icon-wrapper"><Link size={28} /></div>
            <h3>Koneksi Nirkabel & Serial</h3>
            <p>Terhubung langsung via ESP32 Wi-Fi Direct maupun Serial Port dengan latensi komunikasi nyaris nol.</p>
          </div>
        </div>
      </section>

      {/* CAPABILITIES / USE CASES */}
      <section id="capabilities" className="capabilities-section">
        <div className="section-header center">
          <h2>FOKUS UTAMA: PICK & PLACE</h2>
          <p>Dirancang khusus untuk memindahkan dan memilah barang dengan presisi dan kecepatan tinggi.</p>
          <div className="separator-line"></div>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '40px' }}>
          <div className="feature-card hover-lift" style={{ maxWidth: '700px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="icon-wrapper" style={{ width: '80px', height: '80px', marginBottom: '20px' }}>
              <Box size={40} />
            </div>
            <h3 style={{ fontSize: '24px', marginBottom: '15px' }}>High-Speed Sorting</h3>
            <p style={{ fontSize: '16px', lineHeight: '1.8', color: '#aaa' }}>
              Memanfaatkan kinematika paralel, sistem Delta OS kami memastikan komponen atau barang 
              dapat diambil dan diletakkan kembali dengan deviasi margin yang sangat rendah. 
              Sangat ideal dipadukan dengan modul hisap vakum (Suction Cup) maupun capit presisi (Gripper) untuk lini perakitan otomatisasi Anda.
            </p>
          </div>
        </div>
      </section>

      {/* TECH STACK ARCHITECTURE */}
      <section id="tech" className="tech-section">
        <div className="section-header center">
          <h2>ARSITEKTUR TEKNOLOGI</h2>
          <p>Sistem berlapis untuk menjamin komunikasi yang stabil dari antarmuka web hingga pergerakan motor.</p>
          <div className="separator-line"></div>
        </div>
        
        <div className="workflow-diagram" style={{ marginTop: '40px' }}>
          <div className="workflow-node">
            <Layers className="node-icon" />
            <h4>Web Dashboard</h4>
            <span>React.js + Three.js</span>
            <p>Antarmuka visualisasi 3D Real-time</p>
          </div>
          <ArrowRight className="workflow-arrow" />
          <div className="workflow-node">
            <Activity className="node-icon" />
            <h4>Backend API</h4>
            <span>Node.js Express + MySQL</span>
            <p>Otentikasi, Database & Manajemen Profil</p>
          </div>
          <ArrowRight className="workflow-arrow" />
          <div className="workflow-node">
            <Cpu className="node-icon" />
            <h4>Firmware & Gateway</h4>
            <span>Arduino Mega + ESP32 Wi-Fi</span>
            <p>Inverse Kinematics, Kontrol Stepper & REST API</p>
          </div>
        </div>

        <div className="specs-list" style={{ marginTop: '50px' }}>
          <div className="feature-card hover-lift" style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
            <Target className="spec-icon" size={36} />
            <div>
              <h4 style={{ fontSize: '18px', marginBottom: '10px', color: 'var(--accent-color)' }}>Presisi Kinematik Trigonometri</h4>
              <p style={{ color: '#aaa', lineHeight: '1.6' }}>Perhitungan sudut Inverse Kinematics dilakukan secara native di dalam board Arduino Mega 2560 untuk meminimalkan *delay* eksekusi gerak.</p>
            </div>
          </div>
          <div className="feature-card hover-lift" style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
            <Zap className="spec-icon" size={36} />
            <div>
              <h4 style={{ fontSize: '18px', marginBottom: '10px', color: 'var(--accent-color)' }}>Sistem Motor Stepper & Belt</h4>
              <p style={{ color: '#aaa', lineHeight: '1.6' }}>Menggunakan NEMA 17 Stepper Motors dipadukan dengan timing belt GT2 untuk distribusi gaya yang merata, menghasilkan pergerakan minim backlash.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="landing-footer">
        <div className="footer-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '10px' }}>
          <div className="footer-brand">
            <h3 style={{ fontSize: '20px' }}>DELTA OS</h3>
            <p style={{ fontSize: '14px', marginTop: '5px' }}>Sistem Kontrol Industri Terbuka</p>
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
