// =================================================================
// DELTA ROBOT v3.2 - POLMAN BANDUNG / MAJALENGKA (FULL INTEGRATION)
// HOMING = POWER MODE (manual, tanpa AccelStepper, independent timing per motor)
// Gerakan koordinat (XYZ, STARTA, STARTB, RUN) = AccelStepper Coordinated Move
// IK: standar Trossen Robotics + HOMING_THETA_DEG agar arah Y simetris
// END-EFFECTOR: DINAMO HISAP SUCTION CUP VIA RELAY (PIN D12) / SERVO COMPATIBLE
// KOMUNIKASI: USB SERIAL (115200) + ESP32 WEB (SERIAL2 9600 Pin 16 TX2, 17 RX2)
// SAFETY: EMERGENCY STOP SWITCH (PIN D31) & REAL-TIME WEB INTERRUPT
// =================================================================

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
int proxActiveState     = LOW; // Default LOW (NPN Inductive/Optical Sensor NO - saat mendeteksi benda pin tertarik ke GND)

// ===== PIN RELAY & EMERGENCY (EMG) =====
const int relayPin = 12;  // Dinamo Hisap / Suction Cup Relay Pin D12
const int RELAY_ON_STATE  = LOW;  // Active LOW untuk modul relay 5V
const int RELAY_OFF_STATE = HIGH; // Active HIGH untuk mematikan relay
const int emgPin   = 31;  // Emergency Switch Pin D31 (INPUT_PULLUP)
const int EMG_ACTIVE_STATE = HIGH; // Active HIGH saat tombol ditekan (NC switch)

bool isHardwareEmg = false;
bool isSoftwareEmg = false;
bool relayState    = false;

bool isEmgActive() {
  return isHardwareEmg || isSoftwareEmg;
}

void handleCommand(String input);

// ===== AUTONOMOUS (SENSOR PROXIMITY) =====
bool isAutonomous = false;

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
const bool INVERT_X = true;
const bool INVERT_Y = false;
const bool INVERT_Z = false;

// ===== PARAMETER GERAKAN NORMAL (AccelStepper) =====
float baseMaxSpeed   = 1000.0; // 1000 steps/s
float baseAccel      = 500.0;  // 500 steps/s²
const float MIN_SCALED_SPEED = 250.0;

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
const float MIN_Z       = -400.0;
const float MAX_Z       = -50.0;
const float MAX_RADIUS  = 150.0;

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
// SUCTION CUP (VAKUM) & RELAY HELPERS
// =================================================================
void setRelay(bool state) {
  relayState = state;
  digitalWrite(relayPin, state ? RELAY_ON_STATE : RELAY_OFF_STATE);
  sendResponse(state ? F("[VAKUM] HISAP ON (Relay D12)") : F("[VAKUM] OFF / LEPAS (Relay D12)"));
}

void hisapOn() {
  setRelay(true);
}

void hisapOff() {
  setRelay(false);
}

void triggerEMG(bool fromSoftware = false) {
  if (fromSoftware) isSoftwareEmg = true;
  
  // Tahan posisi saat ini (Holding Torque aktif agar arm robot tidak melorot)
  stepperX.moveTo(stepperX.currentPosition());
  stepperY.moveTo(stepperY.currentPosition());
  stepperZ.moveTo(stepperZ.currentPosition());
  autoRunRunning = false;
  
  // Dinamo hisap (Relay D12) dibiarkan TETAP AKTIF menghisap
  sendResponse(F("[EMG] EMG AKTIF - Motor Diam Menahan Posisi & Tetap Menghisap."));
}

void releaseEMG() {
  isSoftwareEmg = false;
  sendResponse(F("[EMG] EMG Dilepas/Reset - Robot Siap Bergerak."));
}

// =================================================================
// REAL-TIME EMG INTERRUPT CHECK & SAFE DELAY
// =================================================================
bool checkEmergencyInput() {
  // 1. Cek tombol fisik D31 secara instan
  bool emgPressed = (digitalRead(emgPin) == EMG_ACTIVE_STATE);
  if (emgPressed && !isHardwareEmg) {
    isHardwareEmg = true;
    triggerEMG(false);
  } else if (!emgPressed && isHardwareEmg) {
    isHardwareEmg = false;
    sendResponse(F("[EMG] Tombol Fisik EMG Dilepas/Reset."));
  }

  // 2. Baca Serial USB PC
  if (Serial.available() > 0) {
    String peekCmd = Serial.readStringUntil('\n');
    peekCmd.trim();
    if (peekCmd.length() > 0) {
      if (autoRunRunning) {
        String up = peekCmd; up.toUpperCase();
        if (up == "EMG" || up == "STOP" || up == "RESET" || up == "EMG OFF" || up == "EMG ON") {
          handleCommand(peekCmd);
        }
      } else {
        handleCommand(peekCmd);
      }
    }
  }

  // 3. Baca Serial2 ESP32 Web
  if (Serial2.available() > 0) {
    String peekCmd = Serial2.readStringUntil('\n');
    peekCmd.trim();
    if (peekCmd.length() > 0) {
      if (autoRunRunning) {
        String up = peekCmd; up.toUpperCase();
        if (up == "EMG" || up == "STOP" || up == "RESET" || up == "EMG OFF" || up == "EMG ON") {
          handleCommand(peekCmd);
        }
      } else {
        handleCommand(peekCmd);
      }
    }
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
    sendResponse("[ERROR] Target Z (" + String(z, 1) + ") di luar batas workspace (" + String(MIN_Z, 0) + " .. " + String(MAX_Z, 0) + ")");
    return false;
  }
  float radius = sqrt(x*x + y*y);
  if (radius > MAX_RADIUS) {
    sendResponse("[ERROR] Radius XY (" + String(radius, 1) + ") > batas " + String(MAX_RADIUS, 0) + " mm");
    return false;
  }
  return true;
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
// POWER HOMING - INDEPENDENT TIMING (POLMAN BANDUNG)
// =================================================================
void performHoming() {
  motorXStopped = motorYStopped = motorZStopped = false;

  unsigned long lastStepX = 0, lastStepY = 0, lastStepZ = 0;
  unsigned long targetDelay = 1000000UL / (unsigned long)HOMING_SPEED;
  unsigned long startDelay  = targetDelay * 2; // Mulai 2x lebih pelan untuk torsi awal maksimum

  digitalWrite(dirPinX, INVERT_X ? !HOMING_DIR_X : HOMING_DIR_X);
  digitalWrite(dirPinY, INVERT_Y ? !HOMING_DIR_Y : HOMING_DIR_Y);
  digitalWrite(dirPinZ, INVERT_Z ? !HOMING_DIR_Z : HOMING_DIR_Z);

  delayMicroseconds(10);

  sendResponse(F(">> POWER HOMING: 3 motor independent (Soft-Start)..."));

  if (digitalRead(limitX) == LOW) { motorXStopped = true; }
  if (digitalRead(limitY) == LOW) { motorYStopped = true; }
  if (digitalRead(limitZ) == LOW) { motorZStopped = true; }

  unsigned long startTime = millis();

  while (!motorXStopped || !motorYStopped || !motorZStopped) {
    unsigned long now = micros();
    unsigned long elapsed = millis() - startTime;

    // Akselerasi lembut dalam 800ms pertama (Soft-Start Ramp)
    unsigned long currentDelay = targetDelay;
    if (elapsed < 800) {
      currentDelay = startDelay - ((startDelay - targetDelay) * elapsed / 800);
    }

    if (!motorXStopped) {
      if (digitalRead(limitX) == LOW) {
        digitalWrite(stepPinX, LOW);
        motorXStopped = true;
      } else if (now - lastStepX >= currentDelay) {
        stepPulse(stepPinX);
        lastStepX = now;
      }
    }

    if (!motorYStopped) {
      if (digitalRead(limitY) == LOW) {
        digitalWrite(stepPinY, LOW);
        motorYStopped = true;
      } else if (now - lastStepY >= currentDelay) {
        stepPulse(stepPinY);
        lastStepY = now;
      }
    }

    if (!motorZStopped) {
      if (digitalRead(limitZ) == LOW) {
        digitalWrite(stepPinZ, LOW);
        motorZStopped = true;
      } else if (now - lastStepZ >= currentDelay) {
        stepPulse(stepPinZ);
        lastStepZ = now;
      }
    }

    if (millis() - startTime > HOMING_TIMEOUT_MS) {
      sendResponse(F("[ERROR] HOMING TIMEOUT!"));
      break;
    }
  }

  delay(200);
  allSteppersOff();

  stepperX.setCurrentPosition(0);
  stepperY.setCurrentPosition(0);
  stepperZ.setCurrentPosition(0);
  applyBaseStepperParams();

  currentAngle[0] = HOMING_THETA_DEG;
  currentAngle[1] = HOMING_THETA_DEG;
  currentAngle[2] = HOMING_THETA_DEG;

  currentX = 0; currentY = 0; currentZ = MAX_Z;

  sendResponse("[HOMING] Selesai dalam " + String((millis() - startTime) / 1000.0, 1) + " s.");
}

void redoHoming() {
  sendResponse(F("[HOME] Memulai homing langsung (Power Mode)..."));
  homingComplete = false;
  performHoming();
  homingComplete = true;

  sendResponse(F("[HOME] Selesai. Pindah ke posisi default (0, 0, -200)..."));
  moveToXYZ(DEFAULT_X, DEFAULT_Y, DEFAULT_Z);
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
    sendResponse(F("[ERROR] Format koordinat salah. Contoh: 0 0 -200"));
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
// =================================================================
void runAutoSequence() {
  sendResponse(F("[START_A] Menjalankan urutan otomatis pick & place A..."));
  autoRunRunning = true;

  // 1. Ambil (Pick A)
  if (!moveToXYZ(seqA_pick_X, seqA_pick_Y, seqA_pick_Z_approach)) { autoRunRunning = false; return; }
  safeDelay(150);

  if (!moveToXYZ(seqA_pick_X, seqA_pick_Y, seqA_pick_Z_down))     { autoRunRunning = false; return; }
  safeDelay(100);
  
  hisapOn();
  if (!safeDelay(500)) { autoRunRunning = false; return; }

  if (!moveToXYZ(seqA_pick_X, seqA_pick_Y, seqA_pick_Z_up))       { autoRunRunning = false; return; }
  safeDelay(150);

  // 2. Transit Tengah -> Homing Limit Switch membawa benda -> Turun ke Tengah Standby
  if (!moveToXYZ(DEFAULT_X, DEFAULT_Y, DEFAULT_Z))                 { autoRunRunning = false; return; }
  safeDelay(200);
  performHoming();
  safeDelay(200);
  if (!moveToXYZ(DEFAULT_X, DEFAULT_Y, DEFAULT_Z))                 { autoRunRunning = false; return; }
  safeDelay(200);

  // 3. Letak (Drop A)
  if (!moveToXYZ(seqA_drop_X, seqA_drop_Y, seqA_drop_Z_approach)) { autoRunRunning = false; return; }
  safeDelay(150);

  if (!moveToXYZ(seqA_drop_X, seqA_drop_Y, seqA_drop_Z_down))     { autoRunRunning = false; return; }
  safeDelay(100);

  hisapOff();
  if (!safeDelay(500)) { autoRunRunning = false; return; }

  if (!moveToXYZ(seqA_drop_X, seqA_drop_Y, seqA_drop_Z_up))       { autoRunRunning = false; return; }
  safeDelay(150);

  // 4. Transit Tengah -> Homing Limit Switch Akhir -> Turun ke Standby
  if (!moveToXYZ(DEFAULT_X, DEFAULT_Y, DEFAULT_Z))                 { autoRunRunning = false; return; }
  safeDelay(200);
  performHoming();
  safeDelay(200);
  if (!moveToXYZ(DEFAULT_X, DEFAULT_Y, DEFAULT_Z))                 { autoRunRunning = false; return; }
  safeDelay(200);
  
  sendResponse(F("[START_A] Urutan otomatis SELESAI."));
  autoRunRunning = false;
}

// =================================================================
// AUTO SEQUENCE B (POLMAN BANDUNG LOGIC)
// =================================================================
void runAutoSequence1() {
  sendResponse(F("[START_B] Menjalankan urutan otomatis pick & place B..."));
  autoRunRunning = true;

  // 1. Ambil (Pick B)
  if (!moveToXYZ(seqB_pick_X, seqB_pick_Y, seqB_pick_Z_approach)) { autoRunRunning = false; return; }
  safeDelay(150);

  if (!moveToXYZ(seqB_pick_X, seqB_pick_Y, seqB_pick_Z_down))     { autoRunRunning = false; return; }
  safeDelay(100);

  hisapOn();
  if (!safeDelay(500)) { autoRunRunning = false; return; }

  if (!moveToXYZ(seqB_pick_X, seqB_pick_Y, seqB_pick_Z_up))       { autoRunRunning = false; return; }
  safeDelay(150);

  // 2. Transit Tengah -> Homing Limit Switch membawa benda -> Turun ke Tengah Standby
  if (!moveToXYZ(DEFAULT_X, DEFAULT_Y, DEFAULT_Z))                 { autoRunRunning = false; return; }
  safeDelay(200);
  performHoming();
  safeDelay(200);
  if (!moveToXYZ(DEFAULT_X, DEFAULT_Y, DEFAULT_Z))                 { autoRunRunning = false; return; }
  safeDelay(200);

  // 3. Letak (Drop B)
  if (!moveToXYZ(seqB_drop_X, seqB_drop_Y, seqB_drop_Z_approach)) { autoRunRunning = false; return; }
  safeDelay(150);

  if (!moveToXYZ(seqB_drop_X, seqB_drop_Y, seqB_drop_Z_down))     { autoRunRunning = false; return; }
  safeDelay(100);

  hisapOff();
  if (!safeDelay(500)) { autoRunRunning = false; return; }

  if (!moveToXYZ(seqB_drop_X, seqB_drop_Y, seqB_drop_Z_up))       { autoRunRunning = false; return; }
  safeDelay(150);

  // 4. Transit Tengah -> Homing Limit Switch Akhir -> Turun ke Standby
  if (!moveToXYZ(DEFAULT_X, DEFAULT_Y, DEFAULT_Z))                 { autoRunRunning = false; return; }
  safeDelay(200);
  performHoming();
  safeDelay(200);
  if (!moveToXYZ(DEFAULT_X, DEFAULT_Y, DEFAULT_Z))                 { autoRunRunning = false; return; }
  safeDelay(200);

  sendResponse(F("[START_B] Urutan otomatis SELESAI."));
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
    z_down = input.substring(space3 + 1).toFloat();
    
    // Ketinggian approach & lift yang aman
    z_appr = -220.0;
    z_up   = -220.0;

    sendResponse("[WEB] Koordinat diupdate: X=" + String(x, 1) + " Y=" + String(y, 1) + " Z=" + String(z_down, 1));
  } else {
    sendResponse(F("[ERROR] Format koordinat tidak valid."));
  }
}

// =================================================================
// COMMAND HANDLER
// =================================================================
void handleCommand(String input) {
  if (input.length() == 0) return;

  String upper = input;
  upper.toUpperCase();

  // Perintah EMG / STOP (Toggle Software EMG)
  if (upper == "EMG" || upper == "STOP") {
    if (isSoftwareEmg) {
      releaseEMG();
    } else {
      triggerEMG(true);
    }
    return;
  }
  else if (upper == "EMG ON" || upper == "EMG_ON")   { triggerEMG(true); return; }
  else if (upper == "RESET" || upper == "RELEASE" || upper == "EMG OFF" || upper == "EMG_OFF") { releaseEMG(); return; }

  // Saat EMG aktif, tolak perintah pergerakan motor namun izinkan hisap/lepas/status
  if (isEmgActive() && upper != "LEPAS" && upper != "BUANG" && upper != "HISAP" && upper != "CAPIT" && upper != "STATUS" && !upper.startsWith("RELAY") && !upper.startsWith("VAKUM")) {
    sendResponse(F("[EMG] Gerakan ditahan: Mode EMG aktif (Robot terkunci menahan posisi)!"));
    return;
  }

  if (upper == "SAVE")        { savePoint(currentX, currentY, currentZ); }
  else if (upper == "LIST")   { listPoints(); }
  else if (upper == "RUN")    { runStoredCoordinates(); }
  else if (upper == "CLEAR")  { clearPoints(); }
  else if (upper == "HOME")   { redoHoming(); }
  else if (upper == "CAPIT" || upper == "HISAP" || upper == "VAKUM ON" || upper == "VAKUM_ON" || upper == "RELAY ON" || upper == "RELAY_ON")  { hisapOn(); }
  else if (upper == "LEPAS" || upper == "BUANG" || upper == "VAKUM OFF" || upper == "VAKUM_OFF" || upper == "RELAY OFF" || upper == "RELAY_OFF") { hisapOff(); }
  else if (upper == "STARTA") { runAutoSequence(); }
  else if (upper == "STARTB") { runAutoSequence1(); }

  else if (upper.startsWith("SET_A_PICK")) { updateCoordinate(upper, seqA_pick_X, seqA_pick_Y, seqA_pick_Z_down, seqA_pick_Z_approach, seqA_pick_Z_up); }
  else if (upper.startsWith("SET_A_DROP")) { updateCoordinate(upper, seqA_drop_X, seqA_drop_Y, seqA_drop_Z_down, seqA_drop_Z_approach, seqA_drop_Z_up); }
  else if (upper.startsWith("SET_B_PICK")) { updateCoordinate(upper, seqB_pick_X, seqB_pick_Y, seqB_pick_Z_down, seqB_pick_Z_approach, seqB_pick_Z_up); }
  else if (upper.startsWith("SET_B_DROP")) { updateCoordinate(upper, seqB_drop_X, seqB_drop_Y, seqB_drop_Z_down, seqB_drop_Z_approach, seqB_drop_Z_up); }

  else if (upper.startsWith("SET_SPEED ")) { 
    float spd = input.substring(10).toFloat(); 
    if (spd >= 100.0 && spd <= 8000.0) {
      baseMaxSpeed = spd;
      applyBaseStepperParams();
      sendResponse("[MOTOR] Kecepatan diatur: " + String(spd, 0));
    }
  }
  else if (upper.startsWith("SET_ACCEL ")) { 
    float acc = input.substring(10).toFloat(); 
    if (acc >= 100.0 && acc <= 6000.0) {
      baseAccel = acc;
      applyBaseStepperParams();
      sendResponse("[MOTOR] Akselerasi diatur: " + String(acc, 0));
    }
  }
  else if (upper == "SET_AUTO ON")  { isAutonomous = true; sendResponse(F("[SYSTEM] Autonomous Mode ON")); }
  else if (upper == "SET_AUTO OFF") { isAutonomous = false; sendResponse(F("[SYSTEM] Autonomous Mode OFF")); }
  else if (upper == "SET_PROX LOW")  { proxActiveState = LOW;  sendResponse(F("[SENSOR] Polaritas Sensor: Active LOW (NPN)")); }
  else if (upper == "SET_PROX HIGH") { proxActiveState = HIGH; sendResponse(F("[SENSOR] Polaritas Sensor: Active HIGH (PNP)")); }
  else if (upper == "STATUS") {
    String stat = "X:" + String(currentX,1) + ",Y:" + String(currentY,1) + ",Z:" + String(currentZ,1) +
                  ",Auto:" + (isAutonomous ? "ON" : "OFF") + ",Vakum:" + (relayState ? "ON" : "OFF") +
                  ",EMG:" + (isEmgActive() ? "ACTIVE" : "OK") + ",Points:" + String(getPointCount()) +
                  ",P1:" + (digitalRead(proximityPin1) == proxActiveState ? "1" : "0") +
                  ",P2:" + (digitalRead(proximityPin2) == proxActiveState ? "1" : "0");
    sendResponse("[STATUS] " + stat);
  }
  else {
    processCoordinateCommand(input);
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

  pinMode(limitX, INPUT_PULLUP);
  pinMode(limitY, INPUT_PULLUP);
  pinMode(limitZ, INPUT_PULLUP);
  pinMode(proximityPin,  INPUT_PULLUP);
  pinMode(proximityPin1, INPUT_PULLUP);
  pinMode(proximityPin2, INPUT_PULLUP);

  pinMode(stepPinX, OUTPUT); pinMode(dirPinX, OUTPUT);
  pinMode(stepPinY, OUTPUT); pinMode(dirPinY, OUTPUT);
  pinMode(stepPinZ, OUTPUT); pinMode(dirPinZ, OUTPUT);

  // Inisialisasi Relay Dinamo Hisap D12 & Emergency D31
  digitalWrite(relayPin, RELAY_OFF_STATE); // Pre-set HIGH sebelum pinMode untuk cegah pompa nyala sesaat
  pinMode(relayPin, OUTPUT);
  digitalWrite(relayPin, RELAY_OFF_STATE); // Pastikan Dinamo Hisap MATI (OFF)
  pinMode(emgPin, INPUT_PULLUP);           // Active HIGH saat ditekan (NC Switch)

  allSteppersOff();

  sendResponse(F("============================================"));
  sendResponse(F("  DELTA ROBOT v3.2 - POLMAN BANDUNG"));
  sendResponse(F("  POWER HOMING + Trossen IK + RELAY VAKUM"));
  sendResponse(F("============================================"));

  initEEPROMIfNeeded();

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
  static unsigned long lastProxDebounceTime = 0;
  static bool stableProx = false, stableProx1 = false, stableProx2 = false;

  bool rawProx  = (digitalRead(proximityPin)  == proxActiveState);
  bool rawProx1 = (digitalRead(proximityPin1) == proxActiveState);
  bool rawProx2 = (digitalRead(proximityPin2) == proxActiveState);

  if (millis() - lastProxDebounceTime >= 30) {
    stableProx  = rawProx;
    stableProx1 = rawProx1;
    stableProx2 = rawProx2;
    lastProxDebounceTime = millis();

    if (isAutonomous && !isEmgActive()) {
      if (stableProx && !lastProxState && !autoRunRunning) {
        sendResponse(F("[PROXIMITY] Sensor terdeteksi -> AUTO RUN"));
        runStoredCoordinates();
      }
      if (stableProx1 && !lastProx1State && !autoRunRunning) {
        sendResponse(F("[PROXIMITY 1] Sensor terdeteksi -> START_A"));
        runAutoSequence();
      }
      if (stableProx2 && !lastProx2State && !autoRunRunning) {
        sendResponse(F("[PROXIMITY 2] Sensor terdeteksi -> START_B"));
        runAutoSequence1();
      }
    }
    lastProxState = stableProx;
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