# 3-DOF Parallel Delta Robot - Politeknik Manufaktur Bandung (POLMAN)

[![Platform - Arduino Mega 2560](https://img.shields.io/badge/Platform-Arduino%20Mega%202560-00979D?logo=arduino&logoColor=white)](https://www.arduino.cc/)
[![IoT Gateway - ESP32](https://img.shields.io/badge/IoT%20Gateway-ESP32-E7352C?logo=espressif&logoColor=white)](https://www.espressif.com/)
[![Frontend - React + Vite](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61DAFB?logo=react&logoColor=black)](https://vitejs.dev/)
[![Backend - Node.js Express](https://img.shields.io/badge/Backend-Node.js%20Express-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Database - MySQL](https://img.shields.io/badge/Database-MySQL-4479A1?logo=mysql&logoColor=white)](https://www.mysql.com/)
[![Institution - POLMAN Bandung](https://img.shields.io/badge/Institution-POLMAN%20Bandung-003366)](https://polman-bandung.ac.id/)

---

## Ringkasan Proyek (Abstract)

Repositori ini memuat rancang bangun dan implementasi terpadu sistem **3-DOF Parallel Delta Robot OS (v3.2)** yang dikembangkan di **Politeknik Manufaktur Bandung (POLMAN)**. Sistem ini mengintegrasikan kendali deterministik *low-level* berbasis mikrokontroler dengan ekosistem IoT nirkabel dan antarmuka web industri modern:

1. **Low-Level Motion Control (Arduino Mega 2560)**:
   - Perhitungan Kinematika Invers (*Inverse Kinematics*) berbasis model matematis Trossen Robotics.
   - Algoritma interpolasi koordinasi multi-axis (*Synchronized Multi-Axis Interpolation*) untuk lintasan 3D lurus dan mulus.
   - *Soft-Start Independent Power Homing* dengan peredam getaran beban inersia dan pengangkatan bertahap (*Smooth Staged Lift*).
   - Sistem keselamatan industri *Multi-Tier Emergency Stop (EMG)* dengan *Holding Torque* aktif dan proteksi hisap vakum.
   - Filter *software debounce* untuk sensor otomasi konveyor.
2. **IoT Gateway & Nirkabel (ESP32)**:
   - Mode ganda *Access Point (AP)* mandiri `DeltaRobot_Config` (`192.168.4.1`) dan *Station (STA)* Wi-Fi lokal.
   - Protokol mDNS lokal (`http://deltarobot.local`).
   - Jembatan komunikasi data *High-Speed UART (115200 baud)* dengan *CORS-enabled RESTful API JSON*.
   - Pembaruan program nirkabel *Over-The-Air (OTA) Web Firmware Update* (`/update`).
3. **Industrial Web Control Interface (React, Three.js, Node.js & MySQL)**:
   - Visualisasi *3D Digital Twin* interaktif dengan penanda target ruang kerja (*Ghost Target Markers*).
   - Penguji langkah per langkah (*Single-Step Sequencer*) untuk profiling Pick & Place yang aman.
   - Penyesuaian ketinggian instan (*Global Z-Offset Adjuster*).
   - Manajemen basis data resep / template koordinat kerja tanpa batas.
4. **Mechanical CAD 3D Models**:
   - Berkas CAD 3D presisi (.STEP & .STL) untuk lengan delta, bodi tripod, modul konveyor, dan beragam modul *end-effector* (vakum suction cup, servo gripper, soft gripper, dan laser).

---

## Arsitektur Sistem (System Architecture)

```mermaid
flowchart TD
    subgraph UserInterface["User Interface & Digital Twin Layer"]
        WebDashboard["React + Three.js Web Dashboard\n(3D Digital Twin, Step Sequencer, Jogging)"]
        DirectSerial["Serial Monitor / USB Terminal (115200 Baud)"]
    end

    subgraph ServerLayer["Application & Database Layer"]
        NodeServer["Node.js Express REST API\n(Port: 5000)"]
        MySQLDB[("MySQL Database\n(Users, Layouts, Recipes/Templates)")]
        NodeServer <--> MySQLDB
    end

    subgraph IoTGateway["IoT Gateway Layer (ESP32)"]
        ESP32Core["ESP32 Dual-Core SoC"]
        WiFiPortal["Dual Mode AP + STA Wi-Fi\n(mDNS: deltarobot.local)"]
        OTA["Web OTA Firmware Update (/update)"]
        RestBridge["REST API Bridge & CORS Handler"]
        ESP32Core --- WiFiPortal
        ESP32Core --- OTA
        ESP32Core --- RestBridge
    end

    subgraph EmbeddedController["Real-Time Motion & Safety Control (Arduino Mega 2560)"]
        MegaCore["ATmega2560 (16 MHz)"]
        IKEngine["Inverse Kinematics Engine\n(Trossen Robotics Model)"]
        HomingSync["Soft-Start Power Homing\n(3-Axis Zeroing Routine)"]
        SafetyManager["Emergency Stop (EMG)\n(Holding Torque & Vacuum Retention)"]
        EEPROMStore["EEPROM Memory Storage\n(Waypoints Backup)"]
        
        MegaCore --> IKEngine
        MegaCore --> HomingSync
        MegaCore --> SafetyManager
        MegaCore --> EEPROMStore
    end

    subgraph HardwareActuators["Mechanical & Actuator Layer"]
        MotorX["Stepper Motor X (Gear Ratio 3:1)"]
        MotorY["Stepper Motor Y (Gear Ratio 3:1)"]
        MotorZ["Stepper Motor Z (Gear Ratio 3:1)"]
        SuctionRelay["Relay Dinamo Vakum D12 (Active LOW)"]
        EmgSwitch["Saklar Darurat Fisik D31 (NC)"]
        LimitSwitches["Limit Switches (X, Y, Z Zeroing)"]
        ProximitySensors["Proximity Triggers (Debounced 30ms)"]
    end

    WebDashboard <-->|HTTP / REST API| NodeServer
    WebDashboard <-->|Direct Local REST / CORS| RestBridge
    NodeServer <-->|Serial / HTTP Bridge| ESP32Core
    DirectSerial <-->|UART0 (115200 Baud)| MegaCore
    RestBridge <-->|UART2 High-Speed (115200 Baud)| MegaCore

    IKEngine --> MotorX
    IKEngine --> MotorY
    IKEngine --> MotorZ
    MegaCore --> SuctionRelay
    EmgSwitch --> SafetyManager
    LimitSwitches --> HomingSync
    ProximitySensors --> MegaCore
```

---

## Parameter Kinematika & Ruang Kerja (Workspace Envelope)

Sistem mengadopsi formulasi matematis **3-DOF Parallel Delta Kinematics** dengan parameter dimensi terkalibrasi:

$$\begin{aligned}
\text{Radius Base } (f) &= 80.0\text{ mm} \\
\text{Panjang Lengan Biceps } (r_f) &= 130.0\text{ mm} \\
\text{Panjang Lengan Forearm } (r_e) &= 300.0\text{ mm} \\
\text{Radius End-Effector } (e) &= 40.0\text{ mm} \\
\text{Planetary Gear Ratio (Hanpose PG5.18)} &= 5.18:1 \\
\text{Sudut Arm saat Homing } (\theta_{\text{home}}) &= -36.0^\circ
\end{aligned}$$

### Amplop Ruang Kerja (Workspace Limits)
* **Batas Jangkauan Horizontal ($XY$):** Radius maksimal $150.0\text{ mm}$ ($\sqrt{X^2 + Y^2} \le 150.0\text{ mm}$).
* **Batas Jangkauan Vertikal ($Z$):** $Z_{\text{maks}} = -50.0\text{ mm}$ hingga $Z_{\text{min}} = -400.0\text{ mm}$ (Batas fisik absolut).
* **Margin Keselamatan Kerja ($Z_{\text{safe}}$):** $Z_{\text{safe\_min}} = -392.0\text{ mm}$ (Margin $8.0\text{ mm}$ dari $Z_{\text{min}}$ demi mencegah *stall* motor dan singularitas kinematika pada sudut lengan ekstrem).
* **Posisi Default Standby (Home):** $X = 0.0\text{ mm},\; Y = 0.0\text{ mm},\; Z = -200.0\text{ mm}$.

---

## Pemetaan Pin Perangkat Keras (Hardware Pinout)

### 1. Mikrokontroler Utama (Arduino Mega 2560)
| Kategori | Nama Sinyal | Pin Arduino Mega | Mode Pin | Keterangan / Konfigurasi |
|---|---|---|---|---|
| **Motor Stepper X** | STEP / DIR | Pin `7` / Pin `6` | OUTPUT | Hanpose PG5.18 (Ratio 5.18:1, 2.878 steps/deg) |
| **Motor Stepper Y** | STEP / DIR | Pin `44` / Pin `42` | OUTPUT | Hanpose PG5.18 (Ratio 5.18:1, 2.878 steps/deg) |
| **Motor Stepper Z** | STEP / DIR | Pin `5` / Pin `4` | OUTPUT | Hanpose PG5.18 (Ratio 5.18:1, 2.878 steps/deg) |
| **Relay Dinamo Vakum** | Suction Signal | Pin `12` | OUTPUT | Active LOW (LOW = ON, HIGH = OFF) |
| **Emergency Switch** | EMG Button | Pin `31` | INPUT_PULLUP | Active HIGH (NC Switch opens on press) |
| **Limit Switch X** | Limit Sensor | Pin `9` | INPUT_PULLUP | Active LOW saat tertekan |
| **Limit Switch Y** | Limit Sensor | Pin `11` | INPUT_PULLUP | Active LOW saat tertekan |
| **Limit Switch Z** | Limit Sensor | Pin `41` | INPUT_PULLUP | Active LOW saat tertekan |
| **Proximity Sensor 0** | Trigger RUN | Pin `2` | INPUT_PULLUP | Filter Debounce 30ms (Auto Run EEPROM) |
| **Proximity Sensor 1** | Trigger STARTA | Pin `53` | INPUT_PULLUP | Filter Debounce 30ms (Auto Profil A) |
| **Proximity Sensor 2** | Trigger STARTB | Pin `51` | INPUT_PULLUP | Filter Debounce 30ms (Auto Profil B) |
| **UART Bridge (ESP32)** | RX2 / TX2 | Pin `17` (RX2) / Pin `16` (TX2) | SERIAL2 | Kecepatan Tinggi: `115200 bps` |
| **USB Monitor (PC)** | USB CDC | Pin `0` (RX0) / Pin `1` (TX0) | SERIAL | Kecepatan: `115200 bps` |

### 2. IoT Gateway (ESP32 Dev Module)
| Antarmuka | Pin ESP32 | Terhubung Ke | Deskripsi |
|---|---|---|---|
| **UART2 RX** | GPIO `16` | Mega Pin `16` (TX2) | Menerima status koordinat & log Mega |
| **UART2 TX** | GPIO `17` | Mega Pin `17` (RX2) | Mengirim perintah gerak & kontrol ke Mega |

---

## Protokol Komunikasi & Serial Commands

Komunikasi data serial berjalan pada baudrate **`115200 bps`** dengan terminasi `Newline (\n)`.

| Perintah | Contoh Format | Deskripsi & Respons Sistem |
|---|---|---|
| **Gerak Koordinat** | `0 0 -250` | Menggerakkan end-effector ke target $(X, Y, Z)$ secara terkoordinasi |
| `HOME` | `HOME` | Menjalankan *Smooth Staged Homing* (Lifting $\rightarrow$ Centering $\rightarrow$ Zeroing) |
| `TIUP` / `AMBIL` | `TIUP` | Mengaktifkan pompa 1 untuk meniup (mencengkeram benda) dan menahan |
| `HISAP` / `LEPAS` | `HISAP` | Mengaktifkan pompa 2 untuk menghisap (melepaskan benda) |
| `SET_GRIP_TIME [t1] [t2]` | `SET_GRIP_TIME 4000 1000` | Mengatur durasi waktu tiup & hisap (1000 - 10000 ms / 1 - 10 detik) |
| `SET_GRIP_SPEED [p1] [p2]` | `SET_GRIP_SPEED 255 255` | Mengatur kecepatan PWM pompa 1 (Tiup) dan pompa 2 (Hisap) (0-255) |
| `STOP_PUMP` / `GRIP_STOP` | `STOP_PUMP` | Mematikan kedua pompa L298N (Kondisi Netral) |
| `EMG` / `STOP` | `EMG` | Toggle mode darurat (Motor mengunci posisi, pompa mati seketika demi keselamatan) |
| `RESET` | `RESET` | Melepas status darurat dan mengembalikan robot ke kondisi siap operasi |
| `STARTA` | `STARTA` | Menjalankan sekuensi otomatis *Pick & Place* Profil A |
| `STARTB` | `STARTB` | Menjalankan sekuensi otomatis *Pick & Place* Profil B |
| `SET_A_PICK X Y Z`| `SET_A_PICK 20 -30 -280` | Memperbarui titik ambil Profil A secara dinamis dari web |
| `SET_A_DROP X Y Z`| `SET_A_DROP 20 120 -320` | Memperbarui titik letak Profil A secara dinamis dari web |
| `SET_B_PICK X Y Z`| `SET_B_PICK -55 -40 -280` | Memperbarui titik ambil Profil B secara dinamis dari web |
| `SET_B_DROP X Y Z`| `SET_B_DROP -80 110 -320` | Memperbarui titik letak Profil B secara dinamis dari web |
| `SET_SPEED [val]` | `SET_SPEED 700` | Mengatur batas kecepatan maksimum motor stepper |
| `SET_ACCEL [val]` | `SET_ACCEL 350` | Mengatur akselerasi gerak motor stepper |
| `STATUS` | `STATUS` | Mengembalikan status koordinat aktual, status sensor, dan mode darurat |
| `SAVE` | `SAVE` | Menyimpan koordinat aktual ke EEPROM (Maksimal 10 titik) |
| `RUN` | `RUN` | Mengeksekusi pergerakan sekuensial seluruh waypoint di EEPROM |
| `CLEAR` | `CLEAR` | Menghapus seluruh memori titik koordinat di EEPROM |

---

## Antarmuka RESTful API (ESP32 & Node.js Backend)

### ESP32 Micro-Endpoints (Port `80` / `deltarobot.local`)
- `GET /` : Built-in Web Portal untuk pemindaian dan konfigurasi Wi-Fi.
- `GET /status` : Mengembalikan status koneksi Wi-Fi, IP, SSID, dan log UART terakhir.
- `GET /cmd?val=...` : Eksekusi perintah kontrol langsung via URL query.
- `POST /cmd` : Eksekusi perintah kontrol via JSON body (`{"command": "HOME"}`).
- `GET /scan` : Pemindaian daftar jaringan Wi-Fi 2.4 GHz di sekitar ESP32.
- `GET/POST /update` : Web portal untuk upload firmware nirkabel (*Over-The-Air*).

### Node.js Express Endpoints (Port `5000`)
- `POST /api/login` : Autentikasi operator / admin menggunakan JWT.
- `POST /api/command` : Dispatch perintah gerak ke hardware / simulator.
- `GET/POST /api/layout` : Manajemen konfigurasi tata letak visualizer 3D.
- `GET/POST/DELETE /api/templates` : Manajemen template resep koordinat Pick & Place di basis data MySQL.

---

## Struktur Direktori Proyek

```text
Robot-Delta/
├── .gitignore                   # Konfigurasi ignoransi berkas Git
├── package.json                 # Konfigurasi Unified Workspace Runner (1 Terminal)
├── README.md                    # Dokumentasi komprehensif proyek (Dokumen ini)
│
├── firmware/                    # Firmware Mikrokontroler (Standar Arduino IDE)
│   ├── DeltaRobot_Mega/
│   │   └── DeltaRobot_Mega.ino  # Firmware utama Arduino Mega 2560 (IK, Homing & Motion Control)
│   └── DeltaRobot_ESP32/
│       └── DeltaRobot_ESP32.ino # Firmware IoT Gateway ESP32 (Wi-Fi, REST API, OTA Update)
│
├── Backend/                     # Layanan Backend Node.js & Express
│   ├── .env.example             # Contoh konfigurasi environment backend
│   ├── package.json             # Dependensi backend (Express, MySQL2, JWT, CORS)
│   ├── server.js                # Entry point REST API Server
│   └── setup.sql                # Skema inisialisasi basis data MySQL
│
├── frontend/                    # Web Control Interface (React + Three.js + Vite)
│   ├── .env.example             # Contoh konfigurasi environment frontend
│   ├── package.json             # Dependensi frontend & UI libraries
│   ├── vite.config.js           # Konfigurasi bundler Vite
│   ├── index.html               # Entry point HTML
│   └── src/                     # Source code aplikasi React
│       ├── pages/               # Dashboard, Landing Page, Login, Visualizer
│       ├── components/          # 3D Canvas Twin, Coordinate Markers, Telemetry Cards
│       └── ...
│
├── hardware/                    # Desain CAD Mekanik & Manufaktur 3D
│   ├── Delta X 1 - v2.STEP       # Master assembly CAD model
│   ├── TripodBase.stl           # Base mounting tripod 3D model
│   ├── Conveyor-X/              # Desain modular konveyor pendukung
│   ├── Slider-X/                # Desain modular slider linear
│   ├── Delta-X-Robot/           # CAD komponen lengan dan bodi delta
│   └── Delta-X-End-Effectors/   # Beragam modul aktuator (Vacuum, Gripper, Soft, Laser)
│
└── docs/                        # Dokumentasi teknis terpusat
    └── ARCHITECTURE.md          # Spesifikasi arsitektur & pinout perangkat keras
```

---

## Panduan Instalasi & Pengoperasian

### 1. Pemrograman Firmware Mikrokontroler
1. **Arduino Mega 2560:**
   - Buka `firmware/DeltaRobot_Mega/DeltaRobot_Mega.ino` di **Arduino IDE**.
   - Pasang library: `AccelStepper` dan `EEPROM`.
   - Pilih Board: **Arduino Mega or Mega 2560** $\rightarrow$ Prosesor: **ATmega2560 (Mega 2560)**.
   - Sambungkan kabel USB dan klik **Upload**.
2. **ESP32 IoT Gateway:**
   - Buka `firmware/DeltaRobot_ESP32/DeltaRobot_ESP32.ino` di **Arduino IDE**.
   - Pilih Board: **ESP32 Dev Module** $\rightarrow$ klik **Upload**.
   - Hubungkan laptop ke Wi-Fi `DeltaRobot_Config` (Password: `12345678`), buka browser pada `http://192.168.4.1` atau `http://deltarobot.local` untuk konfigurasi jaringan.

### 2. Konfigurasi Web App (Backend + Frontend)

#### A. Persiapan Lingkungan & Dependensi
1. Pastikan service **MySQL** telah aktif (misal via XAMPP).
2. Di root folder `d:\Robot Delta`, install seluruh dependensi sekaligus dengan **satu perintah**:
   ```bash
   npm run install:all
   ```
   *(Perintah ini akan menginstal dependensi root runner, Backend Node.js, dan Frontend Vite secara otomatis).*

#### B. Menjalankan Sistem (Unified Runner - Cukup 1 Terminal)
Cukup buka **1 terminal** di root folder `d:\Robot Delta` dan jalankan:
```bash
npm run dev
```
> **Output Terminal:**
> * `[BACKEND]` (Biru)  : Node.js Express REST API aktif di `http://localhost:5000`
> * `[FRONTEND]` (Cyan) : Vite React Dashboard aktif di `http://localhost:5173`

Buka peramban pada **`http://localhost:5173`** untuk mengakses antarmuka kontrol.

#### C. Menjalankan Secara Manual (Opsi Terminal Terpisah)
Jika Anda ingin menjalankan layanan secara terpisah di terminal independen:
* **Hanya Backend**: `npm run dev:backend` (atau `cd Backend && npm run dev`)
* **Hanya Frontend**: `npm run dev:frontend` (atau `cd frontend && npm run dev`)
* **Build Produksi Frontend**: `npm run build`

---

## Pengembang & Pembimbing Akademik

* **Institusi:** Politeknik Manufaktur Bandung (POLMAN Bandung)
* **Program Studi:** Teknologi Rekayasa Informatika Industri
* **Pengembang Utama:** [Muhammad Dzaki](https://github.com/muhammaddz4ki)

---

## Lisensi (License)

Proyek ini didistribusikan di bawah lisensi terbuka untuk keperluan akademik, riset, dan pengembangan teknologi otomasi manufaktur.