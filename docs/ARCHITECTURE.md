# Arsitektur & Spesifikasi Sistem Delta Robot

Dokumen ini menjelaskan struktur arsitektur perangkat keras, firmware, antarmuka komunikasi, backend, dan frontend sistem kontrol Robot Delta Polman.

---

## 1. Ikhtisar Arsitektur Sistem

Sistem Robot Delta menggunakan arsitektur modular berlapis:

```mermaid
graph TD
    subgraph Pengguna & Operator
        Browser[Dashboard Web React + Three.js]
    end

    subgraph Server & Cloud
        Backend[Backend Node.js + Express]
        MySQL[(Database MySQL)]
    end

    subgraph Jaringan & Komunikasi
        WiFi[Koneksi Wi-Fi 2.4 GHz]
        USB[Web Serial API / USB COM]
    end

    subgraph Kontroler Mikrokontroler
        ESP32[ESP32 Wi-Fi & REST Gateway]
        Mega[Arduino Mega 2560 R3]
    end

    subgraph Aktuator & Sensor
        Steppers[3x Stepper NEMA 23 + Driver TB6600]
        Gripper[Vakum Solenoid / Relay Gripper]
        Proximity[3x Sensor Proximity Induktif]
    end

    Browser <-->|HTTP REST / WebSocket| Backend
    Backend <--> MySQL
    Browser <-->|HTTP REST /status, /cmd| ESP32
    Browser <-->|Direct Web Serial| Mega
    ESP32 <-->|UART Serial2 @ 115200 bps| Mega
    Mega --> Steppers
    Mega --> Gripper
    Mega <-- Proximity
```

---

## 2. Struktur Direktori Repositori

```text
Robot-Delta/
├── firmware/                      # Firmware mikrokontroler
│   ├── DeltaRobot_Mega/
│   │   └── DeltaRobot_Mega.ino    # Firmware kendali kinematika invers & stepper Mega 2560
│   └── DeltaRobot_ESP32/
│       └── DeltaRobot_ESP32.ino   # Firmware Wi-Fi Web Server & bridge UART ESP32
│
├── Backend/                       # Layanan REST API & database Node.js Express
│   ├── .env.example
│   ├── package.json
│   ├── server.js                  # Server utama (Port 5000)
│   └── setup.sql                  # Skema database MySQL
│
├── frontend/                      # Aplikasi antarmuka web (React + Vite + Three.js)
│   ├── public/                    # Model STL Robot & Logo SVG
│   ├── src/                       # Komponen UI, Visualisasi Digital Twin, Pages
│   ├── package.json
│   └── vite.config.js
│
├── hardware/                      # Desain mekanikal CAD & 3D Printing STL
│   ├── Conveyor-X/
│   ├── Delta-X-End-Effectors/
│   ├── Delta-X-Robot/
│   ├── Slider-X/
│   └── Delta X 1 - v2.STEP
│
├── docs/                          # Dokumentasi teknis terpusat
│   └── ARCHITECTURE.md
│
├── package.json                   # Root orchestrator runner (concurrently)
└── README.md                      # Dokumentasi umum proyek
```

---

## 3. Alokasi Pinout Perangkat Keras (Arduino Mega 2560)

| Komponen | Pin Arduino Mega | Keterangan |
| :--- | :--- | :--- |
| **Stepper Motor 1** | Pin 3 (STEP), Pin 4 (DIR) | Sumbu A (Lengan 1) |
| **Stepper Motor 2** | Pin 5 (STEP), Pin 6 (DIR) | Sumbu B (Lengan 2) |
| **Stepper Motor 3** | Pin 7 (STEP), Pin 8 (DIR) | Sumbu C (Lengan 3) |
| **Limit Switch / Home**| Pin 18, 19, 20 (Interrupt) | Switch Homing Sumbu 1, 2, 3 |
| **Sensor Proximity A** | Pin 53 | Deteksi benda kerja di Pick Point A |
| **Sensor Proximity B** | Pin 51 | Deteksi benda kerja di Pick Point B |
| **Sensor Proximity 3** | Pin 2 | Cadangan sensor proximity jalur conveyor |
| **Relay / Pompa Vakum**| Pin 12 | Aktuator Suction Cup (Grip & Release) |
| **Tombol Emergency**   | Pin 21 (External Interrupt)| Interlock Darurat Perangkat Keras |
| **Komunikasi UART2**   | Pin 16 (TX2), Pin 17 (RX2) | Terhubung ke ESP32 RX2/TX2 (115200 bps)|

---

## 4. Mode Operasi Standar Industri

Sistem mengadopsi standar keselamatan mesin industri:

1. **Mode MANUAL (Setup / Maintenance)**:
   - Pengguna bebas melakukan Jogging manual pada sumbu X, Y, dan Z.
   - Sensor proximity dinonaktifkan untuk mencegah pemicuan siklus otomatis tak terduga saat kalibrasi atau perawatan mekanik.
   - Akses penuh ke pengubahan parameter kecepatan, akselerasi, dan template koordinat.

2. **Mode AUTO (Line Production)**:
   - Tombol jogging dan konfigurasi dinonaktifkan demi keselamatan operator.
   - Sensor proximity membaca kedatangan part di konveyor secara aktif.
   - Robot secara otonom menjalankan siklus Pick & Place sesuai koordinat template yang tersimpan di EEPROM.
