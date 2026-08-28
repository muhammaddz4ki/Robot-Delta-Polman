# 🤖 3-DOF Parallel Delta Robot - Politeknik Manufaktur Bandung (POLMAN)

[![Platform - Arduino Mega 2560](https://img.shields.io/badge/Platform-Arduino%20Mega%202560-00979D?logo=arduino&logoColor=white)](https://www.arduino.cc/)
[![IoT Gateway - ESP32](https://img.shields.io/badge/IoT%20Gateway-ESP32-E7352C?logo=espressif&logoColor=white)](https://www.espressif.com/)
[![Frontend - React + Vite](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61DAFB?logo=react&logoColor=black)](https://vitejs.dev/)
[![Backend - Node.js Express](https://img.shields.io/badge/Backend-Node.js%20Express-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Database - MySQL](https://img.shields.io/badge/Database-MySQL-4479A1?logo=mysql&logoColor=white)](https://www.mysql.com/)
[![Institution - POLMAN Bandung](https://img.shields.io/badge/Institution-POLMAN%20Bandung-003366)](https://polman-bandung.ac.id/)

---

## 📌 Ringkasan Proyek (Abstract)

Repositori ini memuat rancang bangun dan implementasi terpadu sistem **3-DOF Parallel Delta Robot (v3.2)** yang dikembangkan di **Politeknik Manufaktur Bandung (POLMAN)**. Sistem ini menggabungkan:
1. **Low-level Embedded Control (Arduino Mega 2560)**: Perhitungan Kinematika Invers (*Inverse Kinematics*), sinkronisasi akselerasi multi-axis (*AccelStepper*), *Power Homing routine*, proteksi termal servo gripper, dan penyimpanan waypoint non-volatile (EEPROM).
2. **IoT Gateway & Connectivity (ESP32)**: Dual-mode Wi-Fi (AP + Station), web captive portal, RESTful API JSON dengan dukungan CORS, *mDNS resolution* (`deltarobot.local`), serta *Over-The-Air (OTA) Web Firmware Update*.
3. **Industrial Web Control Interface (React & Node.js/MySQL)**: Antarmuka berbasis web responsif untuk pemantauan telemetri real-time, kontrol kartesian manual, perekaman lintasan (*trajectory mapping*), dan eksekusi sekuensi otomatis (*Pick & Place*).
4. **Mechanical & CAD 3D Models**: Berkas desain mekanik presisi 3D (.STEP & .STL) untuk lengan delta, basis tripod, konveyor, dan beragam modul *end-effector* (servo gripper, soft gripper, vacuum suction, dan laser module).

---

## 🏗️ Arsitektur Sistem (System Architecture)

```mermaid
flowchart TD
    subgraph UserInterface["🌐 User Interface & Client Layer"]
        WebDashboard["React + Vite Web Dashboard\n(Realtime Telemetry & Controls)"]
        DirectSerial["Serial Monitor / Terminal CLI"]
    end

    subgraph ServerLayer["💻 Application & Database Layer"]
        NodeServer["Node.js Express REST API\n(Port: 5000)"]
        MySQLDB[("MySQL Database\n(Users, Layouts, Templates)")]
        NodeServer <--> MySQLDB
    end

    subgraph IoTGateway["📡 IoT Gateway Layer (ESP32)"]
        ESP32Core["ESP32 Dual-Core SoC"]
        WiFiPortal["Dual Mode AP + STA Wi-Fi\n(mDNS: deltarobot.local)"]
        OTA["Web OTA Firmware Update"]
        RestBridge["REST API Bridge & CORS Handler"]
        ESP32Core --- WiFiPortal
        ESP32Core --- OTA
        ESP32Core --- RestBridge
    end

    subgraph EmbeddedController["⚡ Real-Time Motion Control (Arduino Mega 2560)"]
        MegaCore["ATmega2560 (16 MHz)"]
        IKEngine["Inverse Kinematics Engine\n(Trossen Robotics Model)"]
        HomingSync["Synchronized Power Homing\n(3-Axis Zeroing Routine)"]
        EEPROMStore["EEPROM Memory Storage\n(Up to 10 Waypoints)"]
        SmartPWM["Smart Gripper Power Manager\n(Anti-Jitter / Thermal Safe)"]
        
        MegaCore --> IKEngine
        MegaCore --> HomingSync
        MegaCore --> EEPROMStore
        MegaCore --> SmartPWM
    end

    subgraph HardwareActuators["⚙️ Mechanical & Sensors Layer"]
        MotorX["Stepper Motor X (3:1 Ratio)"]
        MotorY["Stepper Motor Y (3:1 Ratio)"]
        MotorZ["Stepper Motor Z (3:1 Ratio)"]
        GripperServo["Micro Servo Gripper (PWM)"]
        LimitSwitches["Limit Switches (X, Y, Z Zeroing)"]
        ProximitySensors["Proximity Triggers (Auto Pick & Place)"]
    end

    WebDashboard <-->|HTTP / REST API| NodeServer
    WebDashboard <-->|Direct Local REST / CORS| RestBridge
    NodeServer <-->|Serial / HTTP| ESP32Core
    DirectSerial <-->|UART0 (9600 Baud)| MegaCore
    RestBridge <-->|UART2 High-Speed (115200 Baud)| MegaCore

    IKEngine --> MotorX
    IKEngine --> MotorY
    IKEngine --> MotorZ
    SmartPWM --> GripperServo
    LimitSwitches --> HomingSync
    ProximitySensors --> MegaCore
```

---

## ⚙️ Parameter Kinematika & Batasan Mekanik

Sistem mengadopsi model matematis **3-DOF Parallel Delta Kinematics** dengan parameter geometri terkalibrasi:

$$\begin{aligned}
\text{Radius Base } (r_f) &= 130.0\text{ mm} \\
\text{Panjang Lengan Biceps } (f) &= 80.0\text{ mm} \\
\text{Panjang Lengan Forearm } (r_e) &= 300.0\text{ mm} \\
\text{Radius End-Effector } (e) &= 40.0\text{ mm} \\
\text{Gear Ratio Stepper} &= 3:1 \\
\text{Offset Sudut Homing } (\theta_{\text{offset}}) &= 21.0^\circ
\end{aligned}$$

### Amplop Ruang Kerja (Workspace Envelope)
* **Batas Jangkauan Horizontal ($XY$):** Radius maksimal $150.0\text{ mm}$ ($\sqrt{X^2 + Y^2} \le 150.0$)
* **Batas Jangkauan Vertikal ($Z$):** $Z_{\text{maks}} = -50.0\text{ mm}$ hingga $Z_{\text{min}} = -400.0\text{ mm}$
* **Posisi Default Standby (Home):** $X = 0.0\text{ mm},\; Y = 0.0\text{ mm},\; Z = -200.0\text{ mm}$

---

## 🔌 Pemetaan Pin Perangkat Keras (Hardware Pinout)

### 1. Mikrokontroler Utama (Arduino Mega 2560)
| Kategori | Nama Sinyal | Pin Arduino Mega | Keterangan / Konfigurasi |
|---|---|---|---|
| **Motor Stepper X** | STEP / DIR | Pin `7` / Pin `6` | Gearbox Ratio 3:1 |
| **Motor Stepper Y** | STEP / DIR | Pin `44` / Pin `42` | Gearbox Ratio 3:1 |
| **Motor Stepper Z** | STEP / DIR | Pin `5` / Pin `4` | Gearbox Ratio 3:1 |
| **Aktuator Gripper** | PWM Signal | Pin `12` | Smart Duty Cycle Pulse |
| **Limit Switch X** | Limit Sensor | Pin `9` | Input Pull-Up (Active LOW) |
| **Limit Switch Y** | Limit Sensor | Pin `11` | Input Pull-Up (Active LOW) |
| **Limit Switch Z** | Limit Sensor | Pin `41` | Input Pull-Up (Active LOW) |
| **Proximity Sensor 1** | Trigger RUN | Pin `2` | Eksekusi Waypoints EEPROM |
| **Proximity Sensor 2** | Trigger STARTA | Pin `53` | Sekuensi Pick & Place Profil A |
| **Proximity Sensor 3** | Trigger STARTB | Pin `51` | Sekuensi Pick & Place Profil B |
| **UART Bridge (ke ESP32)**| RX2 / TX2 | Pin `17` (RX2) / Pin `16` (TX2) | Baudrate: `115200 bps` |

### 2. IoT Gateway (ESP32)
| Antarmuka | Pin ESP32 | Terhubung Ke | Deskripsi |
|---|---|---|---|
| **UART2 RX** | GPIO `16` | Mega Pin `16` (TX2) | Menerima status & log dari Mega |
| **UART2 TX** | GPIO `17` | Mega Pin `17` (RX2) | Mengirim perintah G-Code/Serial ke Mega |

---

## 💻 Protokol Komunikasi & Serial Commands

Komunikasi antara kontroler, gateway, dan antarmuka pengguna mendukung baudrate **`9600 bps`** (UART0 Serial Monitor) dan **`115200 bps`** (UART2 ESP32 Bridge) dengan terminasi `Newline (\n)`.

| Perintah | Contoh Format | Deskripsi & Respons Sistem |
|---|---|---|
| **Gerak Koordinat** | `0 0 -250` | Menggerakkan end-effector ke target $(X, Y, Z)$ secara terkoordinasi |
| `HOME` | `HOME` | Memulai rutinitas kalibrasi posisi absolut (3-axis synchronized zeroing) |
| `CAPIT` | `CAPIT` | Mengaktifkan gripper (Servo $111^\circ$), PWM aktif 1 detik lalu dilepas |
| `LEPAS` | `LEPAS` | Membuka gripper (Servo $0^\circ$), PWM aktif 1 detik lalu dilepas |
| `SAVE` | `SAVE` | Menyimpan koordinat aktual $(X, Y, Z)$ ke slot memori EEPROM (Maks. 10) |
| `LIST` | `LIST` | Mengembalikan daftar seluruh titik waypoint yang tersimpan di EEPROM |
| `RUN` | `RUN` | Mengeksekusi pergerakan sekuensial seluruh waypoint di EEPROM |
| `CLEAR` | `CLEAR` | Mengosongkan data memori EEPROM |
| `STARTA` | `STARTA` | Menjalankan program statis *Pick & Place* Profil A |
| `STARTB` | `STARTB` | Menjalankan program statis *Pick & Place* Profil B |
| `HELP` / `?` | `HELP` | Menampilkan ringkasan status sistem dan panduan parameter batas |

---

## 🌐 Antarmuka RESTful API (ESP32 & Node.js Backend)

### ESP32 Micro-Endpoints (Port `80` / `deltarobot.local`)
- `GET /status` : Mengembalikan status koneksi Wi-Fi dan pembacaan log UART terakhir.
- `POST /cmd` : Mengirimkan perintah teks langsung ke Arduino Mega (`body: command=HOME`).
- `POST /move` : Menggerakkan robot dengan payload JSON (`{"x": 0, "y": 0, "z": -200}`).
- `GET /update` : Web portal untuk instalasi OTA Firmware binary (`.bin`).

### Node.js Express Endpoints (Port `5000`)
- `POST /api/login` : Autentikasi operator / admin menggunakan JWT.
- `POST /api/command` : Dispatch perintah gerak ke hardware / simulator.
- `GET/POST /api/layout` : Manajemen konfigurasi dashboard UI.
- `GET/POST /api/templates` : Manajemen template sekuensi gerakan robot tersimpan.

---

## 📂 Struktur Direktori Proyek

```text
Robot-Delta-Polman/
├── .gitignore                   # Konfigurasi ignoransi berkas Git
├── README.md                    # Dokumentasi komprehensif proyek (Dokumen ini)
├── DeltaRobot_Mega.ino          # Firmware utama Arduino Mega 2560 (IK & Motion Control)
├── DeltaRobot_ESP32.ino         # Firmware IoT Gateway ESP32 (Wi-Fi, REST API, OTA)
│
├── Backend/                     # Layanan Backend Node.js & Express
│   ├── .env.example             # Contoh variabel lingkungan backend
│   ├── package.json             # Dependensi backend (Express, MySQL2, JWT, CORS)
│   ├── server.js                # Entry point server REST API
│   └── setup.sql                # Skema inisialisasi basis data MySQL
│
├── frontend/                    # Web Control Interface (React + Vite)
│   ├── .env.example             # Contoh variabel lingkungan frontend
│   ├── package.json             # Dependensi frontend & UI libraries
│   ├── vite.config.js           # Konfigurasi Vite bundler
│   ├── index.html               # Entry point HTML
│   └── src/                     # Source code aplikasi React
│       ├── pages/               # Halaman Dashboard, Landing, Login, Visualizer
│       ├── components/          # Komponen UI modular, 3D Canvas, Telemetry Cards
│       └── ...
│
└── Delta 3D/                    # Desain CAD Mekanik & Manufaktur 3D
    ├── Delta X 1 - v2.STEP       # Master assembly CAD model
    ├── TripodBase.stl           # Base mounting tripod model
    ├── Conveyor-X/              # Desain modular konveyor penunjang
    ├── Slider-X/                # Desain modular slider linear
    ├── Delta-X-Robot/           # CAD komponen lengan dan bodi delta
    └── Delta-X-End-Effectors/   # Beragam modul gripper (Gripper, Vacuum, Soft, Laser)
```

---

## 🚀 Panduan Instalasi & Menjalankan Sistem

### 1. Pemrograman Firmware Mikrokontroler
1. **Arduino Mega 2560:**
   - Buka `DeltaRobot_Mega.ino` menggunakan Arduino IDE.
   - Pasang library dependensi melalui Library Manager: `AccelStepper` (v1.61+), `Servo`, `EEPROM`.
   - Pilih Board: **Arduino Mega or Mega 2560** -> Upload.
2. **ESP32 IoT Gateway:**
   - Buka `DeltaRobot_ESP32.ino` di Arduino IDE.
   - Pilih Board: **ESP32 Dev Module**.
   - Upload firmware. Hubungkan perangkat ke AP Wi-Fi `Delta-Robot-Setup` untuk konfigurasi koneksi jaringan.

### 2. Konfigurasi Database & Backend
1. Pastikan layanan MySQL/MariaDB aktif (misalnya melalui XAMPP).
2. Buat database atau biarkan script inisialisasi berjalan otomatis:
   ```bash
   cd Backend
   cp .env.example .env
   npm install
   npm start
   ```
3. Backend akan aktif pada `http://localhost:5000`.

### 3. Menjalankan Frontend Web Dashboard
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```
Buka peramban pada `http://localhost:5173` untuk mengakses antarmuka kontrol.

---

## 👥 Pengembang & Pembimbing Akademik

* **Institusi:** Politeknik Manufaktur Bandung (POLMAN Bandung)
* **Program Studi:** Teknik Mekatronika / Otomasi Manufaktur
* **Pengembang Utama:** [Muhammad Dzaki](https://github.com/muhammaddz4ki)

---

## 📄 Lisensi (License)

Proyek ini didistribusikan di bawah lisensi terbuka untuk keperluan akademik, riset, dan pengembangan teknologi otomasi manufaktur.