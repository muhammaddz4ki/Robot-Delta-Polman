// =================================================================
// DELTA ROBOT v3.2 - POLMAN BANDUNG / MAJALENGKA (FULL INTEGRATION)
// HOMING = POWER MODE (manual, tanpa AccelStepper, independent timing per motor)
// Gerakan koordinat (XYZ, STARTA, STARTB, RUN) = AccelStepper Coordinated Move
// IK: standar Trossen Robotics + HOMING_THETA_DEG agar arah Y simetris
// END-EFFECTOR: SOFT ROBOTIC GRIPPER VIA DRIVER L298N (DUAL PUMP TIUP & HISAP)
// L298N PINOUT: IN1=23, IN2=25, IN3=27, IN4=29, ENA=45 (PWM), ENB=12 (PWM SERVOS)
// LOGIKA: TIUP = AMBIL BARANG | HISAP = LEPAS BARANG (DENGAN KONTROL WAKTU / TIMING)

#include <AccelStepper.h>
#include <EEPROM.h>

#define motorInterfaceType 1

// ===== PIN MOTOR =====
const int stepPinX = 7;  const int dirPinX = 6;
const int stepPinY = 44; const int dirPinY = 42;
const int stepPinZ = 5;  const int dirPinZ = 4;

// ===== PIN LIMIT SWITCH =====
const int limitX = 9;
const int limitY = 11;
const int limitZ = 41;

// ===== PIN PROXIMITY =====
const int proximityPin  = 2;
const int proximityPin1 = 53;
const int proximityPin2 = 51;
const int PROX_ACTIVE_STATE = HIGH;

// ===== PIN L298N DUAL PUMP CONTROLLER (SOFT GRIPPER) =====
// Pompa 1 = TIUP (Ambil Barang / Grip Inflate)
// Pompa 2 = HISAP (Lepas Barang / Release Deflate)
const int pump1_IN1 = 23; // Pompa 1 Arah A
const int pump1_IN2 = 25; // Pompa 1 Arah B
const int pump2_IN3 = 27; // Pompa 2 Arah A
const int pump2_IN4 = 29; // Pompa 2 Arah B
const int pump1_ENA = 45; // Speed Pompa 1 (PWM P45)
const int pump2_ENB = 12; // Speed Pompa 2 (PWM SERVOS D12)

// Parameter Soft Gripper
int pump1_Speed = 255; // PWM 0 - 255
int pump2_Speed = 255; // PWM 0 - 255
unsigned long gripTiupDuration   = 1200; // ms (Waktu tiup untuk ambil barang)
unsigned long gripHisapDuration  = 1000; // ms (Waktu hisap untuk lepas barang)
unsigned long gripExpandDuration = 800;  // ms (Waktu hisap sebentar untuk mengembang/membuka cakar sebelum ambil barang)
bool gripHoldContinuous = true;          // true = Tiup 100% penuh terus menerus selama membawa barang | false = Mode hemat daya 55%
String gripState = "NETRAL"; // "NETRAL", "TIUP", "HISAP"

const int emgPin   = 31;  // Emergency Switch Pin D31 (INPUT_PULLUP)
const int EMG_ACTIVE_STATE = HIGH; // Active HIGH saat tombol ditekan (NC switch)

bool isHardwareEmg = false;
bool isSoftwareEmg = false;

bool isEmgActive() {
  return isHardwareEmg || isSoftwareEmg;
}

void handleCommand(String input);

// ===== INDUSTRIAL OPERATION MODE (SAFETY INTERLOCK) =====
// MANUAL MODE: Sensor Proximity 100% diblokir & diabaikan. Operator leluasa Jogging, Kalibrasi, Setting.
// AUTO MODE  : Sensor Proximity aktif membaca conveyor. Tombol jogging & manual commands dikunci interlock.
bool isAutonomous = false; // false = MANUAL MODE (Default Aman) | true = AUTO MODE (Line Production)

// ===== PARAMETER DELTA (mm) - POLMAN BANDUNG =====
const float f  = 80.0;
const float e  = 40.0;
const float rf = 130.0;
const float re = 300.0;
const float baseHeight = 45.0;

// ===== PARAMETER MOTOR (HANPOSE 17HS4401S-PG5.18) =====
const float STEPS_PER_TURN   = 200.0; // 1.8 derajat per step
const float GEAR_RATIO       = 5.18;  // Planetary Gearbox Ratio 5.18:1
const float STEPS_PER_DEGREE = (STEPS_PER_TURN * GEAR_RATIO) / 360.0; // 2.877778 steps/derajat

// ===== INVERT ARAH MOTOR =====
const bool INVERT_X = false;
const bool INVERT_Y = true;
const bool INVERT_Z = false;

// ===== PARAMETER GERAKAN NORMAL (AccelStepper) =====
// Disetel ke kecepatan dan akselerasi bertorsi tinggi untuk motor Gearbox PG5.18
float baseMaxSpeed   = 800.0; // 800 steps/s (Torsi mantap, kuat mengangkat beban)
float baseAccel      = 400.0; // 400 steps/s² (Akselerasi halus, mencegah motor kehilangan langkah/stall)
const float MIN_SCALED_SPEED = 200.0;

// ===== PARAMETER HOMING - POWER MODE =====
const float HOMING_SPEED        = 130.0; // Torsi kuat, hening & presisi
const int   STEP_PULSE_WIDTH    = 8;
const unsigned long HOMING_TIMEOUT_MS = 30000UL;

const uint8_t HOMING_DIR_X = LOW;
const uint8_t HOMING_DIR_Y = LOW;
const uint8_t HOMING_DIR_Z = LOW;

// ===== SUDUT ARM SAAT HOMING =====
const float HOMING_THETA_DEG = -36.0;

// ===== WORKSPACE LIMITS (mm) =====
const float MIN_Z            = -400.0;
const float MAX_Z            = -50.0;
const float MAX_RADIUS       = 150.0;
const float Z_SAFETY_MARGIN  = 8.0;    // Margin keselamatan operasional (mm)
const float MIN_SAFE_Z       = MIN_Z + Z_SAFETY_MARGIN; // -392.0 mm (Batas operasional efektif aman)

// ===== POSISI DEFAULT SETELAH HOMING =====
const float DEFAULT_X = 0.0;
const float DEFAULT_Y = 0.0;
const float DEFAULT_Z = -200.0;

// ===== SETTING POSISI START_A (DINAMIS DARI WEB / BAWAAN POLMAN) =====
float seqA_pick_X = 30.0;
float seqA_pick_Y = -50.0;
float seqA_pick_Z_approach = -220.0;
float seqA_pick_Z_down     = -263.0;
float seqA_pick_Z_up       = -220.0;

float seqA_drop_X = 50.0;
float seqA_drop_Y = 140.0;
float seqA_drop_Z_approach = -220.0;
float seqA_drop_Z_down     = -310.0;
float seqA_drop_Z_up       = -220.0;

// ===== SETTING POSISI START_B (DINAMIS DARI WEB / BAWAAN POLMAN) =====
float seqB_pick_X = -50.0;
float seqB_pick_Y = -50.0;
float seqB_pick_Z_approach = -220.0;
float seqB_pick_Z_down     = -260.0;
float seqB_pick_Z_up       = -220.0;

float seqB_drop_X = -35.0;
float seqB_drop_Y = 130.0;
float seqB_drop_Z_approach = -220.0;
float seqB_drop_Z_down     = -310.0;
float seqB_drop_Z_up       = -220.0;

// ===== EEPROM =====
const byte EEPROM_MAGIC      = 0xA5;
const int  EEPROM_ADDR_MAGIC = 0;
const int  EEPROM_ADDR_COUNT = 1;
const int  EEPROM_ADDR_DATA  = 2;
const int  MAX_POINTS        = 10;
const int  POINT_SIZE        = sizeof(float) * 3;

// ===== STATE =====
bool homingComplete = false;
bool motorXStopped = false, motorYStopped = false, motorZStopped = false;

float currentAngle[3] = {0, 0, 0};
float currentX = 0, currentY = 0, currentZ = 0;

bool lastProxState   = false;
bool lastProx1State  = false;
bool lastProx2State  = false;
bool autoRunRunning  = false;

// ===== STEPPER (untuk gerakan koordinat saja) =====
AccelStepper stepperX(motorInterfaceType, stepPinX, dirPinX);
AccelStepper stepperY(motorInterfaceType, stepPinY, dirPinY);
AccelStepper stepperZ(motorInterfaceType, stepPinZ, dirPinZ);

// =================================================================
// LOG BRIDGE (OUTPUT KE USB SERIAL & ESP32 UART VIA SERIAL2)
// =================================================================
void sendResponse(String msg) {
  Serial.println(msg);
  Serial2.println(msg); // Pin 16 TX2 ke ESP32 RX
  Serial1.println(msg); // Fallback Pin 18 TX1
}

// =================================================================
// SOFT ROBOTIC GRIPPER HELPERS (DRIVER L298N)
// Logika: TIUP = Ambil Barang | HISAP = Lepas Barang | STOP = Netral
// =================================================================
void softGripStop() {
  digitalWrite(pump1_IN1, LOW);
  digitalWrite(pump1_IN2, LOW);
  analogWrite(pump1_ENA, 0);
  digitalWrite(pump1_ENA, LOW);

  digitalWrite(pump2_IN3, LOW);
  digitalWrite(pump2_IN4, LOW);
  analogWrite(pump2_ENB, 0);
  digitalWrite(pump2_ENB, LOW);

  gripState = "NETRAL";
  sendResponse(F("[GRIPPER] Pompa STOP / Netral (Driver L298N OFF Total 0V)"));
}

void softGripTiupRaw(bool active) {
  if (active) {
    // Matikan pompa hisap terlebih dahulu
    digitalWrite(pump2_IN3, LOW);
    digitalWrite(pump2_IN4, LOW);
    analogWrite(pump2_ENB, 0);

    // Nyalakan pompa 1 (Tiup / Ambil)
    digitalWrite(pump1_IN1, HIGH);
    digitalWrite(pump1_IN2, LOW);
    analogWrite(pump1_ENA, pump1_Speed);

    gripState = "TIUP";
    sendResponse(F("[GRIPPER] TIUP AKTIF -> Ambil Barang (Pompa 1 ON)"));
  } else {
    digitalWrite(pump1_IN1, LOW);
    digitalWrite(pump1_IN2, LOW);
    analogWrite(pump1_ENA, 0);
    gripState = "NETRAL";
    sendResponse(F("[GRIPPER] TIUP SELESAI -> Pompa 1 OFF"));
  }
}

void softGripHisapRaw(bool active) {
  if (active) {
    // Matikan pompa tiup terlebih dahulu
    digitalWrite(pump1_IN1, LOW);
    digitalWrite(pump1_IN2, LOW);
    analogWrite(pump1_ENA, 0);

    // Nyalakan pompa 2 (Hisap / Lepas)
    digitalWrite(pump2_IN3, HIGH);
    digitalWrite(pump2_IN4, LOW);
    analogWrite(pump2_ENB, pump2_Speed);

    gripState = "HISAP";
    sendResponse(F("[GRIPPER] HISAP AKTIF -> Lepas Barang (Pompa 2 ON)"));
  } else {
    digitalWrite(pump2_IN3, LOW);
    digitalWrite(pump2_IN4, LOW);
    analogWrite(pump2_ENB, 0);
    gripState = "NETRAL";
    sendResponse(F("[GRIPPER] HISAP SELESAI -> Pompa 2 OFF"));
  }
}

// Meniup selama durasi tertentu untuk mengambil barang dan TETAP MENAHAN
// Mendukung pre-expand: Mengembangkan cakar (HISAP sebentar) sebelum TIUP mengambil barang
bool softGripAmbilBarang(unsigned long durationMs = 0, bool preExpand = true) {
  // Jika diminta pre-expand dan gripper belum dalam mode HISAP, kembangkan cakar dulu
  if (preExpand && gripState != "HISAP") {
    sendResponse("[GRIPPER] Mengembangkan Cakar (HISAP " + String(gripExpandDuration) + " ms)...");
    softGripHisapRaw(true);
    if (!safeDelay(gripExpandDuration)) {
      if (!isEmgActive()) softGripStop();
      return false;
    }
  }

  unsigned long dur = (durationMs > 0) ? durationMs : gripTiupDuration;
  sendResponse("[GRIPPER] Memulai TIUP (Ambil Barang) selama " + String(dur) + " ms...");
  softGripTiupRaw(true);
  if (!safeDelay(dur)) {
    if (!isEmgActive()) softGripStop();
    return false;
  }
  // JANGAN softGripStop() di sini: Pompa Tiup TETAP ON menahan benda hingga titik drop!
  sendResponse(F("[GRIPPER] Barang Berhasil Dicengkeram -> TIUP TETAP ON MENAHAN BENDA!"));
  return true;
}

// Menangani tekanan holding selama robot membawa benda menuju Drop:
// Jika gripHoldContinuous == true: Tiup 100% PWM penuh terus menerus agar barang berat tidak jatuh/goyang
// Jika gripHoldContinuous == false: Mode hemat daya 55% PWM agar efisien dan arus motor tidak drop
void softGripHoldPressure() {
  if (gripState == "TIUP") {
    if (gripHoldContinuous) {
      analogWrite(pump1_ENA, pump1_Speed);
      sendResponse("[GRIPPER] Mode Tiup Aktif Penuh Terus (PWM " + String(pump1_Speed) + ") -> Benda Dicengkeram Kuat Penuh Selama Bergerak!");
    } else {
      int holdSpeed = (pump1_Speed * 55) / 100;
      if (holdSpeed < 80 && pump1_Speed >= 80) holdSpeed = 80;
      else if (holdSpeed < 40) holdSpeed = pump1_Speed;
      analogWrite(pump1_ENA, holdSpeed);
      sendResponse("[GRIPPER] Mode Hemat Daya Aktif (PWM " + String(holdSpeed) + ") -> Benda Menjepit Kuat & Torsi Motor 100% Penuh!");
    }
  }
}

// Menghisap selama durasi tertentu untuk melepas barang
bool softGripLepasBarang(unsigned long durationMs = 0) {
  unsigned long dur = (durationMs > 0) ? durationMs : gripHisapDuration;
  sendResponse("[GRIPPER] Memulai HISAP (Lepas Barang) selama " + String(dur) + " ms...");
  softGripHisapRaw(true);
  if (!safeDelay(dur)) { softGripStop(); return false; }
  softGripStop();
  sendResponse(F("[GRIPPER] Benda Berhasil Dilepas -> Pompa STOP / Netral"));
  return true;
}

// Fungsi alias legacy
void hisapOn()  { softGripAmbilBarang(); } // Ambil = Tiup
void hisapOff() { softGripLepasBarang(); } // Lepas = Hisap

void triggerEMG(bool fromSoftware = false) {
  if (fromSoftware) isSoftwareEmg = true;
  
  // Tahan posisi saat ini (Holding Torque aktif agar arm robot tidak melorot)
  stepperX.moveTo(stepperX.currentPosition());
  stepperY.moveTo(stepperY.currentPosition());
  stepperZ.moveTo(stepperZ.currentPosition());
  autoRunRunning = false;
  
  // PERMINTAAN USER: Saat EMG ditekan, pompa tiup/ambil barang TETAP ON menahan benda
  // agar benda yang sedang dicengkeram tidak jatuh/terlepas di tengah pergerakan!
  if (gripState == "TIUP") {
    sendResponse(F("[EMG] DARURAT AKTIF: Robot Berhenti di Tempat & Gripper Tetap Menahan Benda!"));
  } else {
    sendResponse(F("[EMG] DARURAT AKTIF: Robot Berhenti Seketika di Tempat!"));
  }
}

void releaseEMG() {
  isSoftwareEmg = false;
  isHardwareEmg = false;
  // PERMINTAAN USER: Saat EMG dilepas / ditekan lagi, matikan driver pompa total
  softGripStop();
  sendResponse(F("[EMG] Mode Darurat Dilepas: Driver Pompa OFF Total (0V) & Robot Otomatis Balik ke Home..."));
}

// =================================================================
// REAL-TIME EMG INTERRUPT CHECK & SAFE DELAY
// =================================================================
// Buffer Serial Non-Blocking agar loop stepper tidak terhambat timeout
String serialUsbBuf = "";
String serial2UartBuf = "";

void processSerialChar(char c, String &buf) {
  if (c == '\r') return;
  if (c == '\n') {
    buf.trim();
    if (buf.length() > 0) {
      if (autoRunRunning) {
        String up = buf; up.toUpperCase();
        if (up == "EMG" || up == "STOP" || up == "RESET" || up == "EMG OFF" || up == "EMG ON") {
          handleCommand(buf);
        }
      } else {
        handleCommand(buf);
      }
    }
    buf = "";
  } else {
    if (buf.length() < 120) {
      buf += c;
    }
  }
}

bool checkEmergencyInput() {
  // 1. Cek tombol fisik D31 dengan Software Debounce (40ms) agar kebal noise induksi motor/pompa
  static unsigned long lastEmgDebounceTime = 0;
  static bool lastRawEmg = false;
  static bool stableEmgState = false;

  bool rawEmg = (digitalRead(emgPin) == EMG_ACTIVE_STATE);
  if (rawEmg != lastRawEmg) {
    lastEmgDebounceTime = millis();
    lastRawEmg = rawEmg;
  }

  if ((millis() - lastEmgDebounceTime) >= 40) {
    if (rawEmg != stableEmgState) {
      stableEmgState = rawEmg;
      if (stableEmgState && !isHardwareEmg) {
        isHardwareEmg = true;
        triggerEMG(false);
      } else if (!stableEmgState && isHardwareEmg) {
        isHardwareEmg = false;
        releaseEMG();
        redoHoming();
      }
    }
  }

  // 2. Baca Serial USB PC secara NON-BLOCKING (tanpa delay/timeout)
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    processSerialChar(c, serialUsbBuf);
  }

  // 3. Baca Serial2 ESP32 Web secara NON-BLOCKING (tanpa delay/timeout)
  while (Serial2.available() > 0) {
    char c = (char)Serial2.read();
    processSerialChar(c, serial2UartBuf);
  }

  return isEmgActive();
}

bool safeDelay(unsigned long ms) {
  unsigned long start = millis();
  while (millis() - start < ms) {
    if (checkEmergencyInput()) return false;
    delay(1);
  }
  return true;
}

// =================================================================
// AccelStepper defaults & helpers
// =================================================================
void applyBaseStepperParams() {
  stepperX.setMaxSpeed(baseMaxSpeed); stepperX.setAcceleration(baseAccel);
  stepperY.setMaxSpeed(baseMaxSpeed); stepperY.setAcceleration(baseAccel);
  stepperZ.setMaxSpeed(baseMaxSpeed); stepperZ.setAcceleration(baseAccel);
  stepperX.setPinsInverted(INVERT_X, false, false);
  stepperY.setPinsInverted(INVERT_Y, false, false);
  stepperZ.setPinsInverted(INVERT_Z, false, false);
}

void stepPulse(int stepPin) {
  digitalWrite(stepPin, HIGH);
  delayMicroseconds(STEP_PULSE_WIDTH);
  digitalWrite(stepPin, LOW);
}

void allSteppersOff() {
  digitalWrite(stepPinX, LOW);
  digitalWrite(stepPinY, LOW);
  digitalWrite(stepPinZ, LOW);
}

// =================================================================
// INVERSE KINEMATICS - DELTA ROBOT (Trossen Robotics method)
// =================================================================
bool delta_calcAngleYZ(float x0, float y0, float z0, float &theta) {
  const float tan30 = 0.5773502692;
  float y1 = -0.5 * tan30 * f;
  y0 -= 0.5 * tan30 * e;

  float a = (x0*x0 + y0*y0 + z0*z0 + rf*rf - re*re - y1*y1) / (2.0*z0);
  float b = (y1 - y0) / z0;

  float d = -(a + b*y1)*(a + b*y1) + rf*(b*b*rf + rf);
  if (d < 0) return false;

  float yj = (y1 - a*b - sqrt(d)) / (b*b + 1);
  float zj = a + b*yj;

  theta = atan2(-zj, (y1 - yj)) * 180.0 / PI;
  return true;
}

bool calculateInverseKinematics(float x0, float y0, float z0, float theta[3]) {
  const float cos120 = -0.5;
  const float sin120 =  0.8660254038;

  if (!delta_calcAngleYZ(x0, y0, z0, theta[0])) return false;
  if (!delta_calcAngleYZ(x0*cos120 + y0*sin120,
                         y0*cos120 - x0*sin120,
                         z0, theta[1])) return false;
  if (!delta_calcAngleYZ(x0*cos120 - y0*sin120,
                         y0*cos120 + x0*sin120,
                         z0, theta[2])) return false;

  for (int i = 0; i < 3; i++) {
    if (theta[i] < -90.0 || theta[i] > 90.0) return false;
  }
  return true;
}

bool isInWorkspace(float x, float y, float z) {
  if (z > MAX_Z || z < MIN_Z) {
    sendResponse("[ERROR] Target Z (" + String(z, 1) + ") di luar batas fisik workspace (" + String(MIN_Z, 0) + " .. " + String(MAX_Z, 0) + " mm)");
    return false;
  }
  if (z < MIN_SAFE_Z) {
    sendResponse("[WARNING] Target Z (" + String(z, 1) + ") berada di zona batas mekanis kritis! (Batas aman: " + String(MIN_SAFE_Z, 1) + " mm)");
  }
  float radius = sqrt(x*x + y*y);
  if (radius > MAX_RADIUS) {
    sendResponse("[ERROR] Radius XY (" + String(radius, 1) + ") > batas " + String(MAX_RADIUS, 0) + " mm");
    return false;
  }
  return true;
}

// =================================================================
// [FIX3] DETEKSI ZONA EKSTREM / NEAR-SINGULARITY PADA WORKSPACE
// Mendeteksi jika titik berada di > 85% MAX_RADIUS agar gerakan adaptif
// =================================================================
bool isNearWorkspaceEdge(float x, float y) {
  float radius = sqrt(x*x + y*y);
  return (radius > MAX_RADIUS * 0.85);  // ambang 85% dari radius maksimum (127.5mm jika MAX_RADIUS = 150mm)
}

// =================================================================
// CETAK SUDUT LENGAN HASIL INVERSE KINEMATICS (POLMAN LOGIC)
// =================================================================
void printInverseKinematicsAngles(float theta[3]) {
  String ang = "[IK] Theta1=" + String(theta[0], 1) + "° | Theta2=" + String(theta[1], 1) + "° | Theta3=" + String(theta[2], 1) + "°";
  sendResponse(ang);
}

// =================================================================
// COORDINATED MOVE (AccelStepper dengan Sinkronisasi Kecepatan)
// =================================================================
bool moveToAngles(float targetAngles[3]) {
  // Hitung target posisi step absolut dari titik Home (0 step)
  long targetSteps[3];
  targetSteps[0] = (long)round((targetAngles[0] - HOMING_THETA_DEG) * STEPS_PER_DEGREE);
  targetSteps[1] = (long)round((targetAngles[1] - HOMING_THETA_DEG) * STEPS_PER_DEGREE);
  targetSteps[2] = (long)round((targetAngles[2] - HOMING_THETA_DEG) * STEPS_PER_DEGREE);

  long diffSteps[3];
  diffSteps[0] = targetSteps[0] - stepperX.currentPosition();
  diffSteps[1] = targetSteps[1] - stepperY.currentPosition();
  diffSteps[2] = targetSteps[2] - stepperZ.currentPosition();

  long aSteps[3] = { labs(diffSteps[0]), labs(diffSteps[1]), labs(diffSteps[2]) };
  long maxSteps = aSteps[0];
  if (aSteps[1] > maxSteps) maxSteps = aSteps[1];
  if (aSteps[2] > maxSteps) maxSteps = aSteps[2];

  if (maxSteps == 0) {
    currentAngle[0] = targetAngles[0];
    currentAngle[1] = targetAngles[1];
    currentAngle[2] = targetAngles[2];
    return true;
  }

  // Hitung rasio kecepatan agar ketiga motor selesai gerak pada saat bersamaan
  float minSpd = baseMaxSpeed * 0.10;
  if (minSpd < 20.0) minSpd = 20.0;

  float spd[3];
  for (int i = 0; i < 3; i++) {
    if (aSteps[i] == 0) {
      spd[i] = 1.0;
    } else {
      float ratio = (float)aSteps[i] / (float)maxSteps;
      spd[i] = baseMaxSpeed * ratio;
      if (spd[i] < minSpd)           spd[i] = minSpd;
      if (spd[i] > baseMaxSpeed)     spd[i] = baseMaxSpeed;
    }
  }

  stepperX.setMaxSpeed(spd[0]); stepperX.setAcceleration(baseAccel);
  stepperY.setMaxSpeed(spd[1]); stepperY.setAcceleration(baseAccel);
  stepperZ.setMaxSpeed(spd[2]); stepperZ.setAcceleration(baseAccel);

  // Gunakan posisi ABSOLUT (moveTo) agar tidak ada akumulasi error rounding desimal
  stepperX.moveTo(targetSteps[0]);
  stepperY.moveTo(targetSteps[1]);
  stepperZ.moveTo(targetSteps[2]);

  currentAngle[0] = targetAngles[0];
  currentAngle[1] = targetAngles[1];
  currentAngle[2] = targetAngles[2];

  while (stepperX.distanceToGo() != 0 ||
         stepperY.distanceToGo() != 0 ||
         stepperZ.distanceToGo() != 0) {
    if (checkEmergencyInput()) {
      stepperX.moveTo(stepperX.currentPosition());
      stepperY.moveTo(stepperY.currentPosition());
      stepperZ.moveTo(stepperZ.currentPosition());
      applyBaseStepperParams();
      return false; // Interupsi darurat!
    }
    stepperX.run();
    stepperY.run();
    stepperZ.run();
  }

  applyBaseStepperParams();
  return true;
}

bool moveToXYZ(float x, float y, float z) {
  if (checkEmergencyInput()) return false;
  if (!isInWorkspace(x, y, z)) return false;

  float theta[3];
  if (!calculateInverseKinematics(x, y, z, theta)) {
    sendResponse(F("[ERROR] Posisi di luar jangkauan mekanis robot!"));
    return false;
  }

  printInverseKinematicsAngles(theta);

  if (!moveToAngles(theta)) return false;

  currentX = x; currentY = y; currentZ = z;
  sendResponse("[MOVE] -> X=" + String(x, 1) + " Y=" + String(y, 1) + " Z=" + String(z, 1));
  return true;
}

// =================================================================
// STAGED LIFT (NAIK PELAN-PELAN PER STEP - TORSI MAKSIMUM)
// Mengangkat vertikal dari titik dasar yang berat secara bertahap
// agar motor tidak kekurangan tenaga atau goyang-goyang (stall)
// =================================================================
bool liftSlowly(float x, float y, float fromZ, float toZ, float stepSize = 18.0) {
  float currentLiftZ = fromZ;

  float savedSpeed = baseMaxSpeed;
  float savedAccel = baseAccel;

  // Set sementara ke mode torsi tinggi (kecepatan stabil, akselerasi terkontrol)
  baseMaxSpeed = 350.0; // Kecepatan mantap & bertorsi tinggi
  baseAccel    = 200.0; // Akselerasi halus tanpa sentakan mendadak

  sendResponse("[LIFT] Mengangkat bertahap dari Z=" + String(fromZ, 0) + " ke Z=" + String(toZ, 0) + " (Torsi Penuh)...");

  while (currentLiftZ < toZ) {
    currentLiftZ += stepSize;
    if (currentLiftZ > toZ) currentLiftZ = toZ;

    if (!moveToXYZ(x, y, currentLiftZ)) {
      baseMaxSpeed = savedSpeed;
      baseAccel    = savedAccel;
      applyBaseStepperParams();
      return false;
    }
    safeDelay(50); // Jeda mikro stabilitas antar-step
  }

  // Kembalikan ke kecepatan dan akselerasi normal
  baseMaxSpeed = savedSpeed;
  baseAccel    = savedAccel;
  applyBaseStepperParams();
  sendResponse(F("[LIFT] Berhasil naik ke posisi aman dengan stabil & bertenaga!"));
  return true;
}

// =================================================================
// SMOOTH MOVE DENGAN TORSI TINGGI
// Menurunkan arm ke titik kerja dengan kecepatan dan akselerasi terkontrol
// agar motor tidak amblas/jatuh karena inersia beban dan gaya gravitasi
// =================================================================
bool moveSmoothlyToXYZ(float x, float y, float z, float targetSpeed = 0.0, float targetAccel = 0.0) {
  float spd = (targetSpeed > 0.0) ? targetSpeed : baseMaxSpeed;
  float acc = (targetAccel > 0.0) ? targetAccel : baseAccel;

  float savedSpeed = baseMaxSpeed;
  float savedAccel = baseAccel;

  baseMaxSpeed = spd;
  baseAccel    = acc;
  applyBaseStepperParams();

  bool ok = moveToXYZ(x, y, z);

  baseMaxSpeed = savedSpeed;
  baseAccel    = savedAccel;
  applyBaseStepperParams();
  return ok;
}

// =================================================================
// POWER HOMING SINKRON DENGAN AUTO BACK-OFF (POLMAN BANDUNG)
// Menjamin ketiga motor menyentuh limit switch dengan presisi tanpa bentrok/gasruk!
// =================================================================
void performHoming() {
  // Pastikan driver pompa L298N OFF Total (0V) saat homing demi keamanan & daya motor maksimal
  softGripStop();

  motorXStopped = motorYStopped = motorZStopped = false;

  // 1. AUTO BACK-OFF: Jika ada switch yang sudah tertekan di awal, mundur sedikit ke bawah
  // agar ketiga motor mulai dari posisi bebas (HIGH) bersama-sama (Mencegah salah satu motor tertahan & bentrok)
  if (digitalRead(limitX) == LOW || digitalRead(limitY) == LOW || digitalRead(limitZ) == LOW) {
    sendResponse(F("[HOMING] Melepas switch (Back-off ke bawah)..."));
    digitalWrite(dirPinX, INVERT_X ? HOMING_DIR_X : !HOMING_DIR_X);
    digitalWrite(dirPinY, INVERT_Y ? HOMING_DIR_Y : !HOMING_DIR_Y);
    digitalWrite(dirPinZ, INVERT_Z ? HOMING_DIR_Z : !HOMING_DIR_Z);
    delayMicroseconds(10);

    for (int step = 0; step < 70; step++) {
      stepPulse(stepPinX);
      stepPulse(stepPinY);
      stepPulse(stepPinZ);
      delayMicroseconds(10000); // ~100 steps/s pelan dan bertorsi
    }
    delay(100);
  }

  // 2. Sekarang arahkan serempak ke atas menuju limit switch
  digitalWrite(dirPinX, INVERT_X ? !HOMING_DIR_X : HOMING_DIR_X);
  digitalWrite(dirPinY, INVERT_Y ? !HOMING_DIR_Y : HOMING_DIR_Y);
  digitalWrite(dirPinZ, INVERT_Z ? !HOMING_DIR_Z : HOMING_DIR_Z);
  delayMicroseconds(10);

  sendResponse(F(">> HOMING SINKRON: Naik bersamaan sampai menyentuh Limit Switch..."));

  motorXStopped = (digitalRead(limitX) == LOW);
  motorYStopped = (digitalRead(limitY) == LOW);
  motorZStopped = (digitalRead(limitZ) == LOW);

  unsigned long startTime = millis();
  unsigned long lastStepTime = 0;
  // [FIX2] Ramp akselerasi halus di awal fase naik: mulai ~40 steps/s lalu naik ke target 120 steps/s
  const unsigned long targetInterval = 1000000UL / 120; // 120 steps/s final (~8333 us)
  const unsigned long startInterval  = 1000000UL / 40;  // 40 steps/s awal (~25000 us)
  const int RAMP_STEPS = 50; // Jumlah langkah akselerasi awal (tanpa hentakan)
  int homingStepCount = 0;

  while (!motorXStopped || !motorYStopped || !motorZStopped) {
    // Interupsi Darurat Real-Time: Cek tombol fisik D31 & Serial Web "EMG"
    if (checkEmergencyInput()) {
      motorXStopped = motorYStopped = motorZStopped = true;
      allSteppersOff();
      sendResponse(F("[EMG] Homing Dihentikan Seketika karena Emergency Stop Aktif!"));
      return;
    }

    unsigned long now = micros();

    // [FIX2] Hitung interval dinamis selama periode ramp awal
    unsigned long currentInterval;
    if (homingStepCount < RAMP_STEPS) {
      currentInterval = startInterval - ((startInterval - targetInterval) * (unsigned long)homingStepCount / RAMP_STEPS);
    } else {
      currentInterval = targetInterval;
    }

    if (now - lastStepTime >= currentInterval) {
      lastStepTime = now;
      if (homingStepCount < RAMP_STEPS) homingStepCount++;

      if (!motorXStopped) {
        if (digitalRead(limitX) == LOW) {
          digitalWrite(stepPinX, LOW);
          motorXStopped = true;
        } else {
          stepPulse(stepPinX);
        }
      }

      if (!motorYStopped) {
        if (digitalRead(limitY) == LOW) {
          digitalWrite(stepPinY, LOW);
          motorYStopped = true;
        } else {
          stepPulse(stepPinY);
        }
      }

      if (!motorZStopped) {
        if (digitalRead(limitZ) == LOW) {
          digitalWrite(stepPinZ, LOW);
          motorZStopped = true;
        } else {
          stepPulse(stepPinZ);
        }
      }
    }

    if (millis() - startTime > HOMING_TIMEOUT_MS) {
      sendResponse(F("[ERROR] HOMING TIMEOUT!"));
      break;
    }
  }

  delay(150);
  allSteppersOff();

  stepperX.setCurrentPosition(0);
  stepperY.setCurrentPosition(0);
  stepperZ.setCurrentPosition(0);
  applyBaseStepperParams();

  currentAngle[0] = HOMING_THETA_DEG;
  currentAngle[1] = HOMING_THETA_DEG;
  currentAngle[2] = HOMING_THETA_DEG;

  currentX = 0; currentY = 0; currentZ = MAX_Z;

  sendResponse("[HOMING] Selesai! Ketiga Limit Switch Tersentuh Presisi (" + String((millis() - startTime) / 1000.0, 1) + " s)");
}

void redoHoming() {
  softGripStop(); // Pastikan driver pompa L298N mati sebelum kembali ke home
  sendResponse(F("[HOME] Memulai homing sampai menyentuh Limit Switch..."));
  homingComplete = false;
  performHoming();
  homingComplete = true;
}

// =================================================================
// PARSING COORDINATE COMMAND
// =================================================================
void processCoordinateCommand(String input) {
  float x = 0, y = 0, z = 0;
  int firstSpace  = input.indexOf(' ');
  int secondSpace = input.indexOf(' ', firstSpace + 1);

  if (firstSpace > 0 && secondSpace > firstSpace) {
    x = input.substring(0, firstSpace).toFloat();
    y = input.substring(firstSpace + 1, secondSpace).toFloat();
    z = input.substring(secondSpace + 1).toFloat();
    moveToXYZ(x, y, z);
  } else {
    sendResponse("[ERROR] Format koordinat salah ('" + input + "'). Contoh: 0 0 -200");
  }
}

// =================================================================
// EEPROM - SAVED POINTS
// =================================================================
void initEEPROMIfNeeded() {
  byte magic = EEPROM.read(EEPROM_ADDR_MAGIC);
  if (magic != EEPROM_MAGIC) {
    EEPROM.update(EEPROM_ADDR_MAGIC, EEPROM_MAGIC);
    EEPROM.update(EEPROM_ADDR_COUNT, 0);
    sendResponse(F("[EEPROM] Inisialisasi pertama kali (kosong)."));
  } else {
    byte n = EEPROM.read(EEPROM_ADDR_COUNT);
    sendResponse("[EEPROM] Ditemukan " + String(n) + " koordinat tersimpan.");
  }
}

byte getPointCount() {
  byte n = EEPROM.read(EEPROM_ADDR_COUNT);
  if (n > MAX_POINTS) n = 0;
  return n;
}

int pointAddress(byte index) {
  return EEPROM_ADDR_DATA + (index * POINT_SIZE);
}

void savePoint(float x, float y, float z) {
  byte n = getPointCount();
  if (n >= MAX_POINTS) {
    sendResponse(F("[SAVE] PENUH! Gunakan CLEAR dulu."));
    return;
  }
  int addr = pointAddress(n);
  EEPROM.put(addr,                     x);
  EEPROM.put(addr + sizeof(float),     y);
  EEPROM.put(addr + 2 * sizeof(float), z);
  EEPROM.update(EEPROM_ADDR_COUNT, n + 1);

  sendResponse("[SAVE] Titik " + String(n + 1) + " disimpan: " + String(x, 1) + " " + String(y, 1) + " " + String(z, 1));
}

void readPoint(byte index, float &x, float &y, float &z) {
  int addr = pointAddress(index);
  EEPROM.get(addr,                     x);
  EEPROM.get(addr + sizeof(float),     y);
  EEPROM.get(addr + 2 * sizeof(float), z);
}

void listPoints() {
  byte n = getPointCount();
  sendResponse("[LIST] Total titik: " + String(n));
  for (byte i = 0; i < n; i++) {
    float x, y, z;
    readPoint(i, x, y, z);
    sendResponse("  #" + String(i + 1) + " : " + String(x, 1) + " " + String(y, 1) + " " + String(z, 1));
  }
}

void clearPoints() {
  EEPROM.update(EEPROM_ADDR_COUNT, 0);
  sendResponse(F("[CLEAR] Semua koordinat dihapus."));
}

// =================================================================
// EEPROM - SISTEM KONFIGURASI LENGKAP (OTAK ROBOT PERMANEN)
// Menyimpan Kecepatan, Akselerasi, Pompa PWM, Waktu Tiup/Hisap/Pre-Expand,
// dan Koordinat Profil A & B secara permanen ke memori EEPROM!
// =================================================================
const int  EEPROM_ADDR_CONFIG_MAGIC = 200;
const byte EEPROM_CONFIG_MAGIC     = 0xDE; // Delta Robot System Magic
const int  EEPROM_ADDR_CONFIG       = 201;

struct SystemConfig {
  float speed;
  float accel;
  int pump1Speed;
  int pump2Speed;
  unsigned long tiupMs;
  unsigned long hisapMs;
  unsigned long expandMs;
  bool gripHoldContinuous;
  bool isAutonomous;
  float pickA_X, pickA_Y, pickA_Z_down;
  float dropA_X, dropA_Y, dropA_Z_down;
  float pickB_X, pickB_Y, pickB_Z_down;
  float dropB_X, dropB_Y, dropB_Z_down;
};

void saveSystemConfigToEEPROM() {
  SystemConfig cfg;
  cfg.speed              = baseMaxSpeed;
  cfg.accel              = baseAccel;
  cfg.pump1Speed         = pump1_Speed;
  cfg.pump2Speed         = pump2_Speed;
  cfg.tiupMs             = gripTiupDuration;
  cfg.hisapMs            = gripHisapDuration;
  cfg.expandMs           = gripExpandDuration;
  cfg.gripHoldContinuous = gripHoldContinuous;
  cfg.isAutonomous       = isAutonomous;

  cfg.pickA_X = seqA_pick_X; cfg.pickA_Y = seqA_pick_Y; cfg.pickA_Z_down = seqA_pick_Z_down;
  cfg.dropA_X = seqA_drop_X; cfg.dropA_Y = seqA_drop_Y; cfg.dropA_Z_down = seqA_drop_Z_down;
  cfg.pickB_X = seqB_pick_X; cfg.pickB_Y = seqB_pick_Y; cfg.pickB_Z_down = seqB_pick_Z_down;
  cfg.dropB_X = seqB_drop_X; cfg.dropB_Y = seqB_drop_Y; cfg.dropB_Z_down = seqB_drop_Z_down;

  EEPROM.put(EEPROM_ADDR_CONFIG, cfg);
  EEPROM.update(EEPROM_ADDR_CONFIG_MAGIC, EEPROM_CONFIG_MAGIC);
  sendResponse(F("[EEPROM] Seluruh konfigurasi robot TERSIMPAN PERMANEN ke otak robot (EEPROM)!"));
}

void loadSystemConfigFromEEPROM() {
  byte magic = EEPROM.read(EEPROM_ADDR_CONFIG_MAGIC);
  if (magic != EEPROM_CONFIG_MAGIC) {
    sendResponse(F("[EEPROM] Belum ada konfigurasi tersimpan, menyimpan nilai default ke EEPROM..."));
    saveSystemConfigToEEPROM();
    return;
  }

  SystemConfig cfg;
  EEPROM.get(EEPROM_ADDR_CONFIG, cfg);

  if (cfg.speed >= 100.0 && cfg.speed <= 8000.0) baseMaxSpeed = cfg.speed;
  if (cfg.accel >= 100.0 && cfg.accel <= 8000.0) baseAccel = cfg.accel;
  if (cfg.pump1Speed >= 0 && cfg.pump1Speed <= 255) pump1_Speed = cfg.pump1Speed;
  if (cfg.pump2Speed >= 0 && cfg.pump2Speed <= 255) pump2_Speed = cfg.pump2Speed;
  if (cfg.tiupMs >= 100 && cfg.tiupMs <= 10000) gripTiupDuration = cfg.tiupMs;
  if (cfg.hisapMs >= 100 && cfg.hisapMs <= 10000) gripHisapDuration = cfg.hisapMs;
  if (cfg.expandMs >= 100 && cfg.expandMs <= 10000) gripExpandDuration = cfg.expandMs;
  gripHoldContinuous = cfg.gripHoldContinuous;
  isAutonomous       = cfg.isAutonomous;

  if (cfg.pickA_Z_down <= MAX_Z && cfg.pickA_Z_down >= MIN_Z) {
    seqA_pick_X = cfg.pickA_X; seqA_pick_Y = cfg.pickA_Y; seqA_pick_Z_down = cfg.pickA_Z_down;
    seqA_pick_Z_approach = seqA_pick_Z_down + 45.0; seqA_pick_Z_up = -220.0;
  }
  if (cfg.dropA_Z_down <= MAX_Z && cfg.dropA_Z_down >= MIN_Z) {
    seqA_drop_X = cfg.dropA_X; seqA_drop_Y = cfg.dropA_Y; seqA_drop_Z_down = cfg.dropA_Z_down;
    seqA_drop_Z_approach = seqA_drop_Z_down + 45.0; seqA_drop_Z_up = -220.0;
  }
  if (cfg.pickB_Z_down <= MAX_Z && cfg.pickB_Z_down >= MIN_Z) {
    seqB_pick_X = cfg.pickB_X; seqB_pick_Y = cfg.pickB_Y; seqB_pick_Z_down = cfg.pickB_Z_down;
    seqB_pick_Z_approach = seqB_pick_Z_down + 45.0; seqB_pick_Z_up = -220.0;
  }
  if (cfg.dropB_Z_down <= MAX_Z && cfg.dropB_Z_down >= MIN_Z) {
    seqB_drop_X = cfg.dropB_X; seqB_drop_Y = cfg.dropB_Y; seqB_drop_Z_down = cfg.dropB_Z_down;
    seqB_drop_Z_approach = seqB_drop_Z_down + 45.0; seqB_drop_Z_up = -220.0;
  }

  applyBaseStepperParams();
  sendResponse("[EEPROM] Konfigurasi dimuat: Spd=" + String(baseMaxSpeed, 0) + ", Acc=" + String(baseAccel, 0) +
               ", Pump1=" + String(pump1_Speed) + ", Pump2=" + String(pump2_Speed) +
               ", Tiup=" + String(gripTiupDuration) + "ms, Hisap=" + String(gripHisapDuration) +
               "ms, Pre-Expand=" + String(gripExpandDuration) + "ms, TiupTerus=" + (gripHoldContinuous ? "AKTIF" : "HEMAT") +
               ", Mode=" + (isAutonomous ? "AUTO" : "MANUAL"));
}

void runStoredCoordinates() {
  byte n = getPointCount();
  if (n == 0) {
    sendResponse(F("[RUN] Tidak ada koordinat tersimpan."));
    return;
  }

  autoRunRunning = true;
  sendResponse("[RUN] Menjalankan " + String(n) + " titik...");

  for (byte i = 0; i < n; i++) {
    if (checkEmergencyInput()) { autoRunRunning = false; return; }
    float x, y, z;
    readPoint(i, x, y, z);
    if (!moveToXYZ(x, y, z)) { autoRunRunning = false; return; }
    if (!safeDelay(300))     { autoRunRunning = false; return; }
  }

  sendResponse(F("[RUN] Selesai. Kembali ke posisi default."));
  moveToXYZ(DEFAULT_X, DEFAULT_Y, DEFAULT_Z);
  autoRunRunning = false;
}

// =================================================================
// AUTO SEQUENCE A (POLMAN BANDUNG LOGIC)
// Alur: Pick Up -> Ambil (Tiup) -> Transit Home Dulu (Menahan Benda) -> 
//       Meluncur ke Drop -> Lepas (Hisap) -> TUNGGU LEPAS BERES & POMPA OFF ->
//       Balik ke Home (Daya Motor Penuh) -> Selesai
// =================================================================
void runAutoSequence() {
  unsigned long cycleStart = millis();
  sendResponse(F("[CYCLE_START] START_A"));
  sendResponse(F("[START_A] Memulai siklus Pick & Place A..."));
  autoRunRunning = true;

  // [FIX3] Deteksi apakah titik Drop A berada di zona ekstrem dekat batas radius maksimum (near-singularity)
  float dropRadiusA = sqrt(seqA_drop_X * seqA_drop_X + seqA_drop_Y * seqA_drop_Y);
  bool dropANearEdge = isNearWorkspaceEdge(seqA_drop_X, seqA_drop_Y);
  if (dropANearEdge) {
    sendResponse("[WARNING] Titik Drop A dekat batas radius maksimum (" + String(dropRadiusA, 1) + "mm / " + String(MAX_RADIUS, 0) + "mm) -> menggunakan mode gerak ekstra hati-hati (staged lift, kecepatan direduksi)");
  }

  // 1. Bergerak ke Titik Pick Approach
  if (!moveToXYZ(seqA_pick_X, seqA_pick_Y, seqA_pick_Z_approach)) { if (!isEmgActive()) softGripStop(); autoRunRunning = false; return; }
  if (!safeDelay(100)) { if (!isEmgActive()) softGripStop(); autoRunRunning = false; return; }

  // [FITUR BARU] Mengembangkan cakar (HISAP) terlebih dahulu sebelum turun melingkupi benda
  sendResponse("[GRIPPER] Mengembangkan Jari (HISAP Pre-Expand " + String(gripExpandDuration) + " ms)...");
  softGripHisapRaw(true);
  if (!safeDelay(gripExpandDuration)) { if (!isEmgActive()) softGripStop(); autoRunRunning = false; return; }

  // Turun halus dengan cakar yang sudah mengembang melingkupi benda
  sendResponse(F("[START_A] Turun dengan cakar mengembang melingkupi benda..."));
  if (!moveSmoothlyToXYZ(seqA_pick_X, seqA_pick_Y, seqA_pick_Z_down, baseMaxSpeed * 0.75, baseAccel * 0.75)) { if (!isEmgActive()) softGripStop(); autoRunRunning = false; return; }
  if (!safeDelay(100)) { if (!isEmgActive()) softGripStop(); autoRunRunning = false; return; }
  
  // 2. Ambil Benda (TIUP AKTIF dan KUNCI BENDA)
  if (!softGripAmbilBarang(0, false)) { if (!isEmgActive()) softGripStop(); autoRunRunning = false; return; }
  // Hemat daya pompa agar arus tidak menyedot daya motor stepper (Torsi motor tetap 100%)
  softGripHoldPressure();

  // a. Angkat Benda langsung dari Pick ke Approach
  sendResponse(F("[START_A] Mengangkat benda ke posisi aman approach..."));
  if (!moveSmoothlyToXYZ(seqA_pick_X, seqA_pick_Y, seqA_pick_Z_approach, baseMaxSpeed * 0.7, baseAccel * 0.6)) { if (!isEmgActive()) softGripStop(); autoRunRunning = false; return; }
  if (!safeDelay(100)) { if (!isEmgActive()) softGripStop(); autoRunRunning = false; return; }

  // b. Meluncur langsung ke Home tengah membawa benda (SATU gerakan diagonal mulus tanpa jeda)
  sendResponse(F("[START_A] Membawa benda ke Home tengah..."));
  if (!moveSmoothlyToXYZ(DEFAULT_X, DEFAULT_Y, DEFAULT_Z, baseMaxSpeed, baseAccel))                 { if (!isEmgActive()) softGripStop(); autoRunRunning = false; return; }
  if (!safeDelay(150)) { if (!isEmgActive()) softGripStop(); autoRunRunning = false; return; }

  // 4. Bergerak ke Titik Drop (Letak) sambil membawa beban
  sendResponse(F("[START_A] Meluncur dari Home menuju titik Drop Approach..."));
  if (!moveSmoothlyToXYZ(seqA_drop_X, seqA_drop_Y, seqA_drop_Z_approach, baseMaxSpeed, baseAccel)) { if (!isEmgActive()) softGripStop(); autoRunRunning = false; return; }
  if (!safeDelay(150)) { if (!isEmgActive()) softGripStop(); autoRunRunning = false; return; }

  // Turun halus ke titik Drop: jika zona ekstrem kurangi kecepatan, jika normal gunakan kecepatan bertorsi
  sendResponse(F("[START_A] Menurunkan ke titik Drop dengan torsi terkontrol..."));
  if (dropANearEdge) {
    if (!moveSmoothlyToXYZ(seqA_drop_X, seqA_drop_Y, seqA_drop_Z_down, baseMaxSpeed * 0.45, baseAccel * 0.4)) { if (!isEmgActive()) softGripStop(); autoRunRunning = false; return; }
  } else {
    if (!moveSmoothlyToXYZ(seqA_drop_X, seqA_drop_Y, seqA_drop_Z_down, baseMaxSpeed * 0.7, baseAccel * 0.7)) { if (!isEmgActive()) softGripStop(); autoRunRunning = false; return; }
  }
  if (!safeDelay(100)) { if (!isEmgActive()) softGripStop(); autoRunRunning = false; return; }

  // 5. Lepas Benda (HISAP) & TUNGGU LEPAS BERES
  sendResponse("[GRIPPER] Tiba di Drop -> HISAP (Lepas Benda) selama " + String(gripHisapDuration) + " ms...");
  softGripLepasBarang(gripHisapDuration);
  softGripStop(); // MATIKAN TOTAL SELURUH SINYAL & LOGIKA DRIVER L298N (0V)

  // JEDA WAKTU 1 DETIK: Driver L298N Mati Total (0V), Catu Daya Murni untuk Stepper Arduino Mega!
  sendResponse(F("[DROP] Jeda waktu 1 detik: Driver L298N OFF Total (0V) -> Catu daya murni Stepper!"));
  safeDelay(1000);

  // 6. Balik Home Langsung (Mode Manual Home - Murni Step Sinkron, Bebas Bentrok & Gasruk!)
  sendResponse(F("[START_A] Balik Home langsung menyentuh Limit Switch (Sinkron Mode Manual Tanpa Gasruk)..."));
  performHoming();
  safeDelay(150);

  float durationSec = (millis() - cycleStart) / 1000.0;
  sendResponse(String(F("[CYCLE_END] START_A Duration:")) + String(durationSec, 2) + F("s"));
  sendResponse(F("[START_A] Urutan otomatis SELESAI!"));
  autoRunRunning = false;
}

// =================================================================
// AUTO SEQUENCE B (POLMAN BANDUNG LOGIC)
// =================================================================
void runAutoSequence1() {
  unsigned long cycleStart = millis();
  sendResponse(F("[CYCLE_START] START_B"));
  sendResponse(F("[START_B] Memulai siklus Pick & Place B..."));
  autoRunRunning = true;

  // [FIX3] Deteksi apakah titik Drop B berada di zona ekstrem dekat batas radius maksimum (near-singularity)
  float dropRadiusB = sqrt(seqB_drop_X * seqB_drop_X + seqB_drop_Y * seqB_drop_Y);
  bool dropBNearEdge = isNearWorkspaceEdge(seqB_drop_X, seqB_drop_Y);
  if (dropBNearEdge) {
    sendResponse("[WARNING] Titik Drop B dekat batas radius maksimum (" + String(dropRadiusB, 1) + "mm / " + String(MAX_RADIUS, 0) + "mm) -> menggunakan mode gerak ekstra hati-hati (staged lift, kecepatan direduksi)");
  }

  // 1. Bergerak ke Titik Pick Approach
  if (!moveToXYZ(seqB_pick_X, seqB_pick_Y, seqB_pick_Z_approach)) { if (!isEmgActive()) softGripStop(); autoRunRunning = false; return; }
  if (!safeDelay(100)) { if (!isEmgActive()) softGripStop(); autoRunRunning = false; return; }

  // [FITUR BARU] Mengembangkan cakar (HISAP) terlebih dahulu sebelum turun melingkupi benda
  sendResponse("[GRIPPER] Mengembangkan Jari (HISAP Pre-Expand " + String(gripExpandDuration) + " ms)...");
  softGripHisapRaw(true);
  if (!safeDelay(gripExpandDuration)) { if (!isEmgActive()) softGripStop(); autoRunRunning = false; return; }

  // Turun halus dengan cakar yang sudah mengembang melingkupi benda
  sendResponse(F("[START_B] Turun dengan cakar mengembang melingkupi benda..."));
  if (!moveSmoothlyToXYZ(seqB_pick_X, seqB_pick_Y, seqB_pick_Z_down, baseMaxSpeed * 0.75, baseAccel * 0.75)) { if (!isEmgActive()) softGripStop(); autoRunRunning = false; return; }
  if (!safeDelay(100)) { if (!isEmgActive()) softGripStop(); autoRunRunning = false; return; }

  // 2. Ambil Benda (TIUP AKTIF dan KUNCI BENDA)
  if (!softGripAmbilBarang(0, false)) { if (!isEmgActive()) softGripStop(); autoRunRunning = false; return; }
  // Hemat daya pompa agar arus tidak menyedot daya motor stepper (Torsi motor tetap 100%)
  softGripHoldPressure();

  // a. Angkat Benda langsung dari Pick ke Approach
  sendResponse(F("[START_B] Mengangkat benda ke posisi aman approach..."));
  if (!moveSmoothlyToXYZ(seqB_pick_X, seqB_pick_Y, seqB_pick_Z_approach, baseMaxSpeed * 0.7, baseAccel * 0.6)) { if (!isEmgActive()) softGripStop(); autoRunRunning = false; return; }
  if (!safeDelay(100)) { if (!isEmgActive()) softGripStop(); autoRunRunning = false; return; }

  // b. Meluncur langsung ke Home tengah membawa benda (SATU gerakan diagonal mulus tanpa jeda)
  sendResponse(F("[START_B] Membawa benda ke Home tengah..."));
  if (!moveSmoothlyToXYZ(DEFAULT_X, DEFAULT_Y, DEFAULT_Z, baseMaxSpeed, baseAccel))                 { if (!isEmgActive()) softGripStop(); autoRunRunning = false; return; }
  if (!safeDelay(150)) { if (!isEmgActive()) softGripStop(); autoRunRunning = false; return; }

  // 4. Bergerak ke Titik Drop (Letak) sambil membawa beban
  sendResponse(F("[START_B] Meluncur dari Home menuju titik Drop Approach..."));
  if (!moveSmoothlyToXYZ(seqB_drop_X, seqB_drop_Y, seqB_drop_Z_approach, baseMaxSpeed, baseAccel)) { if (!isEmgActive()) softGripStop(); autoRunRunning = false; return; }
  if (!safeDelay(150)) { if (!isEmgActive()) softGripStop(); autoRunRunning = false; return; }

  // Turun halus ke titik Drop: jika zona ekstrem kurangi kecepatan, jika normal gunakan kecepatan bertorsi
  sendResponse(F("[START_B] Menurunkan ke titik Drop dengan torsi terkontrol..."));
  if (dropBNearEdge) {
    if (!moveSmoothlyToXYZ(seqB_drop_X, seqB_drop_Y, seqB_drop_Z_down, baseMaxSpeed * 0.45, baseAccel * 0.4)) { if (!isEmgActive()) softGripStop(); autoRunRunning = false; return; }
  } else {
    if (!moveSmoothlyToXYZ(seqB_drop_X, seqB_drop_Y, seqB_drop_Z_down, baseMaxSpeed * 0.7, baseAccel * 0.7)) { if (!isEmgActive()) softGripStop(); autoRunRunning = false; return; }
  }
  if (!safeDelay(100)) { if (!isEmgActive()) softGripStop(); autoRunRunning = false; return; }

  // 5. Lepas Benda (HISAP) & TUNGGU LEPAS BERES
  sendResponse("[GRIPPER] Tiba di Drop -> HISAP (Lepas Benda) selama " + String(gripHisapDuration) + " ms...");
  softGripLepasBarang(gripHisapDuration);
  softGripStop(); // MATIKAN TOTAL SELURUH SINYAL & LOGIKA DRIVER L298N (0V)

  // JEDA WAKTU 1 DETIK: Driver L298N Mati Total (0V), Catu Daya Murni untuk Stepper Arduino Mega!
  sendResponse(F("[DROP] Jeda waktu 1 detik: Driver L298N OFF Total (0V) -> Catu daya murni Stepper!"));
  safeDelay(1000);

  // 6. Balik Home Langsung (Mode Manual Home - Murni Step Sinkron, Bebas Bentrok & Gasruk!)
  sendResponse(F("[START_B] Balik Home langsung menyentuh Limit Switch (Sinkron Mode Manual Tanpa Gasruk)..."));
  performHoming();
  safeDelay(150);

  float durationSec = (millis() - cycleStart) / 1000.0;
  sendResponse(String(F("[CYCLE_END] START_B Duration:")) + String(durationSec, 2) + F("s"));
  sendResponse(F("[START_B] Urutan otomatis SELESAI!"));
  autoRunRunning = false;
}

// =================================================================
// PARSER PEMBARUAN KOORDINAT DARI WEB DASHBOARD
// =================================================================
void updateCoordinate(String input, float &x, float &y, float &z_down, float &z_appr, float &z_up) {
  int space1 = input.indexOf(' ');
  int space2 = input.indexOf(' ', space1 + 1);
  int space3 = input.indexOf(' ', space2 + 1);
  if (space1 > 0 && space2 > 0 && space3 > 0) {
    x = input.substring(space1 + 1, space2).toFloat();
    y = input.substring(space2 + 1, space3).toFloat();
    float req_z = input.substring(space3 + 1).toFloat();
    
    // Batasi Z_down dalam amplop ruang kerja fisik robot (MIN_Z .. MAX_Z)
    if (req_z < MIN_Z) {
      sendResponse("[CLAMP] Z_down (" + String(req_z, 1) + "mm) melebihi batas fisik MIN_Z (" + String(MIN_Z, 1) + "mm)! Di-clamp ke " + String(MIN_Z, 1) + " mm");
      z_down = MIN_Z;
    } else if (req_z > MAX_Z) {
      sendResponse("[CLAMP] Z_down (" + String(req_z, 1) + "mm) di atas MAX_Z (" + String(MAX_Z, 1) + "mm)! Di-clamp ke " + String(MAX_Z, 1) + " mm");
      z_down = MAX_Z;
    } else {
      z_down = req_z; // Terima nilai persis seperti yang diinputkan user (identik dengan manual)!
    }
    
    // Validasi radius XY
    float rad = sqrt(x * x + y * y);
    if (rad > MAX_RADIUS) {
      sendResponse("[WARNING] Radius XY (" + String(rad, 1) + " mm) melebihi batas MAX_RADIUS (" + String(MAX_RADIUS, 1) + " mm)!");
    }

    // Ketinggian approach adaptif: selalu 45 mm di atas titik kerja z_down
    z_appr = z_down + 45.0;
    if (z_appr > -180.0) z_appr = -180.0; // Batas atas aman

    // Ketinggian angkat (lift-off) vertikal: Wajib sampai ketinggian bebas (-230 mm)
    // agar arm robot keluar dari sudut mekanik ekstrem sebelum meluncur ke Home!
    z_up = -230.0;

    sendResponse("[WEB] Koordinat diupdate: X=" + String(x, 1) + " Y=" + String(y, 1) + " Z=" + String(z_down, 1) + " (Appr=" + String(z_appr, 1) + ", Up=" + String(z_up, 1) + ")");
    saveSystemConfigToEEPROM();
  } else {
    sendResponse(F("[ERROR] Format koordinat tidak valid."));
  }
}

// =================================================================
// COMMAND HANDLER
// =================================================================
void handleCommand(String input) {
  if (input.length() == 0) return;
  if (input.startsWith("[")) return; // Abaikan echo log / respon sistem sendiri

  String upper = input;
  upper.toUpperCase();

  // Perintah EMG / STOP / RESET
  if (upper == "EMG" || upper == "STOP") {
    if (!isEmgActive()) {
      triggerEMG(true);
    } else {
      releaseEMG();
      redoHoming();
    }
    return;
  }
  else if (upper == "EMG ON" || upper == "EMG_ON") {
    triggerEMG(true);
    return;
  }
  else if (upper == "RESET" || upper == "RELEASE" || upper == "EMG OFF" || upper == "EMG_OFF") {
    releaseEMG();
    redoHoming();
    return;
  }

  // Saat EMG aktif, tolak perintah pergerakan motor namun izinkan hisap/lepas/status
  if (isEmgActive() && upper != "LEPAS" && upper != "BUANG" && upper != "HISAP" && upper != "CAPIT" && upper != "TIUP" && upper != "AMBIL" && upper != "GRIP_STOP" && upper != "STOP_PUMP" && upper != "STATUS") {
    sendResponse(F("[EMG] Gerakan ditahan: Mode EMG aktif (Robot terkunci menahan posisi)!"));
    return;
  }

  if (upper == "SAVE")        { savePoint(currentX, currentY, currentZ); }
  else if (upper == "LIST")   { listPoints(); }
  else if (upper == "RUN")    { runStoredCoordinates(); }
  else if (upper == "CLEAR")  { clearPoints(); }
  else if (upper == "HOME")   { redoHoming(); }
  
  // Perintah Soft Gripper (Tiup = Ambil, Hisap = Lepas)
  else if (upper == "TIUP" || upper == "AMBIL" || upper == "GRIP" || upper == "CAPIT")  { softGripAmbilBarang(); }
  else if (upper == "HISAP" || upper == "LEPAS" || upper == "BUANG" || upper == "RELEASE") { softGripLepasBarang(); }
  else if (upper == "TIUP ON" || upper == "TIUP_ON" || upper == "PUMP1 ON") { softGripTiupRaw(true); }
  else if (upper == "HISAP ON" || upper == "HISAP_ON" || upper == "PUMP2 ON") { softGripHisapRaw(true); }
  else if (upper == "STOP_PUMP" || upper == "GRIP_STOP" || upper == "NETRAL" || upper == "TIUP OFF" || upper == "HISAP OFF") { softGripStop(); }
  
  else if (upper.startsWith("SET_GRIP_TIME ")) {
    // Format: SET_GRIP_TIME <waktu_tiup_ms> <waktu_hisap_ms> [waktu_expand_ms]
    String params = input.substring(14);
    params.trim();
    int sp1 = params.indexOf(' ');
    if (sp1 > 0) {
      unsigned long t_tiup = params.substring(0, sp1).toInt();
      String rem = params.substring(sp1 + 1);
      rem.trim();
      int sp2 = rem.indexOf(' ');
      unsigned long t_hisap = 0;
      unsigned long t_expand = 0;
      if (sp2 > 0) {
        t_hisap = rem.substring(0, sp2).toInt();
        t_expand = rem.substring(sp2 + 1).toInt();
      } else {
        t_hisap = rem.toInt();
      }
      if (t_tiup >= 100 && t_tiup <= 10000)   gripTiupDuration = t_tiup;
      if (t_hisap >= 100 && t_hisap <= 10000) gripHisapDuration = t_hisap;
      if (t_expand >= 100 && t_expand <= 10000) gripExpandDuration = t_expand;
      saveSystemConfigToEEPROM();
      sendResponse("[GRIPPER] Waktu diset -> Tiup: " + String(gripTiupDuration) + "ms | Hisap: " + String(gripHisapDuration) + "ms | Pre-Expand: " + String(gripExpandDuration) + "ms (Tersimpan Permanen)");
    } else {
      sendResponse(F("[ERROR] Format: SET_GRIP_TIME <tiup_ms> <hisap_ms> [expand_ms] (Contoh: SET_GRIP_TIME 1200 1000 800)"));
    }
  }
  else if (upper.startsWith("SET_GRIP_SPEED ")) {
    // Format: SET_GRIP_SPEED <pwm1> [pwm2]
    String params = input.substring(15);
    params.trim();
    int sp = params.indexOf(' ');
    if (sp > 0) {
      int s1 = params.substring(0, sp).toInt();
      int s2 = params.substring(sp + 1).toInt();
      if (s1 >= 0 && s1 <= 255) pump1_Speed = s1;
      if (s2 >= 0 && s2 <= 255) pump2_Speed = s2;
    } else {
      int s = params.toInt();
      if (s >= 0 && s <= 255) {
        pump1_Speed = s;
        pump2_Speed = s;
      }
    }
    // Update PWM seketika jika pompa sedang running
    if (gripState == "TIUP") analogWrite(pump1_ENA, pump1_Speed);
    if (gripState == "HISAP") analogWrite(pump2_ENB, pump2_Speed);
    saveSystemConfigToEEPROM();
    sendResponse("[GRIPPER] Kecepatan Pompa diset -> Pompa1(Tiup): " + String(pump1_Speed) + " | Pompa2(Hisap): " + String(pump2_Speed) + " (Tersimpan Permanen)");
  }
  else if (upper == "STARTA") { runAutoSequence(); }
  else if (upper == "STARTB") { runAutoSequence1(); }

  else if (upper.startsWith("SET_A_PICK")) { updateCoordinate(upper, seqA_pick_X, seqA_pick_Y, seqA_pick_Z_down, seqA_pick_Z_approach, seqA_pick_Z_up); }
  else if (upper.startsWith("SET_A_DROP")) { updateCoordinate(upper, seqA_drop_X, seqA_drop_Y, seqA_drop_Z_down, seqA_drop_Z_approach, seqA_drop_Z_up); }
  else if (upper.startsWith("SET_B_PICK")) { updateCoordinate(upper, seqB_pick_X, seqB_pick_Y, seqB_pick_Z_down, seqB_pick_Z_approach, seqB_pick_Z_up); }
  else if (upper.startsWith("SET_B_DROP")) { updateCoordinate(upper, seqB_drop_X, seqB_drop_Y, seqB_drop_Z_down, seqB_drop_Z_approach, seqB_drop_Z_up); }

  else if (upper.startsWith("SET_GRIP_HOLD ")) {
    // Format: SET_GRIP_HOLD <1|0> (1 = Tiup Aktif Penuh Terus, 0 = Mode Hemat Daya 55%)
    String valStr = input.substring(14);
    valStr.trim();
    int v = valStr.toInt();
    gripHoldContinuous = (v != 0);
    saveSystemConfigToEEPROM();
    if (gripHoldContinuous) {
      sendResponse(F("[GRIPPER] Mode Tiup Ambil Diset: TIUP AKTIF PENUH TERUS (100% PWM) Selama Membawa Barang (Tersimpan Permanen)"));
    } else {
      sendResponse(F("[GRIPPER] Mode Tiup Ambil Diset: MODE HEMAT DAYA (55% PWM Holding) (Tersimpan Permanen)"));
    }
  }
  else if (upper.startsWith("SET_SPEED ")) { 
    float spd = input.substring(10).toFloat(); 
    if (spd >= 100.0 && spd <= 8000.0) {
      baseMaxSpeed = spd;
      applyBaseStepperParams();
      saveSystemConfigToEEPROM();
      sendResponse("[MOTOR] Kecepatan diatur: " + String(spd, 0) + " (Tersimpan Permanen)");
    }
  }
  else if (upper.startsWith("SET_ACCEL ")) { 
    float acc = input.substring(10).toFloat(); 
    if (acc >= 100.0 && acc <= 6000.0) {
      baseAccel = acc;
      applyBaseStepperParams();
      saveSystemConfigToEEPROM();
      sendResponse("[MOTOR] Akselerasi diatur: " + String(acc, 0) + " (Tersimpan Permanen)");
    }
  }
  else if (upper == "SAVE_CONFIG" || upper == "SIMPAN" || upper == "SAVE_ALL") {
    saveSystemConfigToEEPROM();
  }
  else if (upper == "SET_AUTO ON" || upper == "MODE AUTO" || upper == "MODE_AUTO" || upper == "AUTO ON")  { 
    isAutonomous = true; 
    lastProxState  = (digitalRead(proximityPin)  == PROX_ACTIVE_STATE);
    lastProx1State = (digitalRead(proximityPin1) == PROX_ACTIVE_STATE);
    lastProx2State = (digitalRead(proximityPin2) == PROX_ACTIVE_STATE);
    saveSystemConfigToEEPROM();
    sendResponse(F("[MODE] >>> MODE AUTO (LINE PRODUCTION) DIAKTIFKAN: Sensor Proximity Aktif! Tombol manual dikunci demi keamanan.")); 
  }
  else if (upper == "SET_AUTO OFF" || upper == "MODE MANUAL" || upper == "MODE_MANUAL" || upper == "AUTO OFF" || upper == "MANUAL") { 
    isAutonomous = false; 
    saveSystemConfigToEEPROM();
    sendResponse(F("[MODE] >>> MODE MANUAL (MAINTENANCE/SETUP) DIAKTIFKAN: Sensor Proximity 100% Diblokir & Dinonaktifkan! Bebas Jogging & Setting.")); 
  }
  else if (upper == "TEST_SENSOR" || upper == "CEK_SENSOR") {
    int v_p  = digitalRead(proximityPin);
    int v_p1 = digitalRead(proximityPin1);
    int v_p2 = digitalRead(proximityPin2);
    String diag = "[CEK_SENSOR] Pin 53 (Sensor A): " + String(v_p1) + 
                  " | Pin 51 (Sensor B): " + String(v_p2) + 
                  " | Pin 2: " + String(v_p) + 
                  " | Auto Mode: " + (isAutonomous ? "ON" : "OFF");
    sendResponse(diag);
  }
  else if (upper == "STATUS") {
    String stat = "X:" + String(currentX,1) + ",Y:" + String(currentY,1) + ",Z:" + String(currentZ,1) +
                  ",Auto:" + (isAutonomous ? "ON" : "OFF") + ",Grip:" + gripState +
                  ",Tiup:" + String(gripTiupDuration) + ",Hisap:" + String(gripHisapDuration) +
                  ",PreExp:" + String(gripExpandDuration) + ",HoldCont:" + (gripHoldContinuous ? "1" : "0") +
                  ",EMG:" + (isEmgActive() ? "ACTIVE" : "OK") + ",Points:" + String(getPointCount()) +
                  ",P1:" + String(digitalRead(proximityPin1)) +
                  ",P2:" + String(digitalRead(proximityPin2));
    sendResponse("[STATUS] " + stat);
  }
  else {
    char firstChar = input.charAt(0);
    if (isDigit(firstChar) || firstChar == '-' || firstChar == '+') {
      processCoordinateCommand(input);
    }
  }
}

// =================================================================
// SETUP
// =================================================================
void setup() {
  Serial.begin(115200);  // USB Monitor PC
  Serial.setTimeout(10);
  Serial2.begin(115200); // UART ke ESP32 (TX2 pin 16, RX2 pin 17) - High Speed
  Serial2.setTimeout(10);
  Serial1.begin(115200); // Fallback UART (TX1 pin 18, RX1 pin 19)
  Serial1.setTimeout(10);

  pinMode(17, INPUT_PULLUP); // RX2 (mencegah floating noise jika ESP32 belum terpasang / mati)
  pinMode(19, INPUT_PULLUP); // RX1 Fallback

  pinMode(limitX, INPUT_PULLUP);
  pinMode(limitY, INPUT_PULLUP);
  pinMode(limitZ, INPUT_PULLUP);
  pinMode(proximityPin,  INPUT_PULLUP);
  pinMode(proximityPin1, INPUT_PULLUP);
  pinMode(proximityPin2, INPUT_PULLUP);

  pinMode(stepPinX, OUTPUT); pinMode(dirPinX, OUTPUT);
  pinMode(stepPinY, OUTPUT); pinMode(dirPinY, OUTPUT);
  pinMode(stepPinZ, OUTPUT); pinMode(dirPinZ, OUTPUT);

  stepperX.setMinPulseWidth(5);
  stepperY.setMinPulseWidth(5);
  stepperZ.setMinPulseWidth(5);

  // Inisialisasi Driver L298N Soft Gripper & Emergency D31
  pinMode(pump1_IN1, OUTPUT);
  pinMode(pump1_IN2, OUTPUT);
  pinMode(pump2_IN3, OUTPUT);
  pinMode(pump2_IN4, OUTPUT);
  pinMode(pump1_ENA, OUTPUT);
  pinMode(pump2_ENB, OUTPUT);
  softGripStop(); // Pastikan kedua pompa mati saat booting awal

  pinMode(emgPin, INPUT_PULLUP);           // Active HIGH saat ditekan (NC Switch)

  allSteppersOff();

  sendResponse(F("============================================"));
  sendResponse(F("  DELTA ROBOT v3.2 - POLMAN BANDUNG"));
  sendResponse(F("  POWER HOMING + Trossen IK + SOFT GRIPPER"));
  sendResponse(F("============================================"));

  initEEPROMIfNeeded();
  loadSystemConfigFromEEPROM(); // Muat konfigurasi kecepatan, akselerasi, pompa, dan koordinat dari EEPROM
  if (isAutonomous) {
    sendResponse(F("[MODE] >>> MODE AUTO (LINE PRODUCTION) DIAKTIFKAN: Sensor Proximity Aktif! Tombol manual dikunci demi keamanan."));
  } else {
    sendResponse(F("[MODE] >>> MODE MANUAL (MAINTENANCE/SETUP) DIAKTIFKAN: Sensor Proximity 100% Diblokir & Dinonaktifkan! Bebas Jogging & Setting."));
  }

  sendResponse(F("Starting POWER HOMING..."));
  delay(500);
  performHoming();

  sendResponse(F(">>> HOMING POWER MODE COMPLETE!"));
  homingComplete = true;

  sendResponse("[SYSTEM] Pindah ke posisi default: 0 0 -200");
  moveToXYZ(DEFAULT_X, DEFAULT_Y, DEFAULT_Z);
}

// =================================================================
// LOOP
// =================================================================
void loop() {
  // 1. Cek Serial USB Monitor & Emergency Switch D31
  checkEmergencyInput();

  // 2. Baca Sensor Proximity Otomasi dengan Software Debounce (30ms)
  // [FIX] Software debounce sejati berbasis millis(): reset timer jika sinyal mentah berubah,
  // dan hanya trigger otomasi setelah kondisi stabil > 30ms untuk eliminasi noise sensor induktif
  static unsigned long lastProxDebounceTime = 0;
  static bool lastRawProx  = false;
  static bool lastRawProx1 = false;
  static bool lastRawProx2 = false;
  static bool stableProx   = false;
  static bool stableProx1  = false;
  static bool stableProx2  = false;

  bool rawProx  = (digitalRead(proximityPin)  == PROX_ACTIVE_STATE);
  bool rawProx1 = (digitalRead(proximityPin1) == PROX_ACTIVE_STATE);
  bool rawProx2 = (digitalRead(proximityPin2) == PROX_ACTIVE_STATE);

  // [FIX] Setiap kali nilai mentah salah satu sensor berubah, reset timer debounce
  if (rawProx != lastRawProx || rawProx1 != lastRawProx1 || rawProx2 != lastRawProx2) {
    lastProxDebounceTime = millis();
    lastRawProx  = rawProx;
    lastRawProx1 = rawProx1;
    lastRawProx2 = rawProx2;
  }

  // [FIX] Jika pembacaan mentah telah stabil > 30ms, evaluasi dan trigger aksi pada transisi stabil
  if ((millis() - lastProxDebounceTime) >= 30) {
    if (isAutonomous && !isEmgActive() && !autoRunRunning) {
      if (rawProx1 && !stableProx1) {
        sendResponse(F("[PROXIMITY 1] Sensor A (Pin 53) terdeteksi -> START_A"));
        runAutoSequence();
      }
      else if (rawProx2 && !stableProx2) {
        sendResponse(F("[PROXIMITY 2] Sensor B (Pin 51) terdeteksi -> START_B"));
        runAutoSequence1();
      }
      else if (rawProx && !stableProx) {
        sendResponse(F("[PROXIMITY] Sensor (Pin 2) terdeteksi -> AUTO RUN"));
        runStoredCoordinates();
      }
    }

    // [FIX] Perbarui nilai stabil setelah deteksi transisi
    stableProx  = rawProx;
    stableProx1 = rawProx1;
    stableProx2 = rawProx2;
    lastProxState  = stableProx;
    lastProx1State = stableProx1;
    lastProx2State = stableProx2;
  }

  // 3. Eksekusi Langkah Stepper
  if (!isEmgActive()) {
    stepperX.run();
    stepperY.run();
    stepperZ.run();
  }
}