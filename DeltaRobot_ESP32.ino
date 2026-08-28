// =================================================================
// DELTA ROBOT - ESP32 IOT GATEWAY & WEB CONTROLLER
// FITUR: Dual Mode AP + STA Wi-Fi, REST API JSON, CORS Support,
//        mDNS (http://deltarobot.local), OTA Web Firmware Update,
//        High-Speed UART Bridge (115200 baud) ke Arduino Mega
// =================================================================

#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <ESPmDNS.h>
#include <Update.h>

#define RXp2 16 // Hubungkan ke Pin 16 (TX2) Mega
#define TXp2 17 // Hubungkan ke Pin 17 (RX2) Mega

WebServer server(80);
Preferences prefs;

String currentSSID = "";
String currentPass = "";
String lastMegaLog = "Menunggu status robot...";

// Helper untuk mengirim CORS headers agar Web React tidak diblokir browser
void sendCORSHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
}

void handleOptions() {
  sendCORSHeaders();
  server.send(204);
}

String escapeJsonString(String input) {
  String out = "";
  for (unsigned int i = 0; i < input.length(); i++) {
    char c = input.charAt(i);
    if (c == '"') out += "\\\"";
    else if (c == '\\') out += "\\\\";
    else if (c == '\r' || c == '\n') out += " ";
    else if (c >= 32 && c <= 126) out += c;
  }
  return out;
}

// Built-in Web Portal untuk konfigurasi Wi-Fi langsung di browser
void handleRoot() {
  sendCORSHeaders();
  bool isConnected = (WiFi.status() == WL_CONNECTED);
  String clientIp = isConnected ? WiFi.localIP().toString() : "Belum Terhubung";
  
  String html = "<!DOCTYPE html><html><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'>";
  html += "<title>Delta Robot Wi-Fi Portal</title><style>";
  html += "body{font-family:system-ui,-apple-system,sans-serif;background:#0d1117;color:#c9d1d9;margin:0;padding:20px;display:flex;justify-content:center;}";
  html += ".card{background:#161b22;border:1px solid #30363d;border-radius:12px;max-width:440px;width:100%;padding:24px;box-shadow:0 8px 24px rgba(0,0,0,0.5);}";
  html += "h2{color:#58a6ff;margin-top:0;font-size:1.3rem;display:flex;align-items:center;gap:8px;}";
  html += ".badge{padding:4px 8px;border-radius:20px;font-size:0.75rem;font-weight:bold;}";
  html += ".badge-ok{background:#238636;color:#fff;} .badge-warn{background:#d29922;color:#fff;}";
  html += "label{font-size:0.85rem;color:#8b949e;display:block;margin-top:14px;margin-bottom:4px;}";
  html += "input,select{width:100%;box-sizing:border-box;background:#0d1117;border:1px solid #30363d;color:#fff;padding:10px;border-radius:6px;font-size:0.9rem;}";
  html += "button{width:100%;margin-top:16px;background:#238636;color:#fff;border:none;padding:12px;border-radius:6px;font-size:0.95rem;font-weight:bold;cursor:pointer;transition:0.2s;}";
  html += "button:hover{background:#2ea043;}";
  html += ".scan-btn{background:#1f6feb;margin-top:8px;} .scan-btn:hover{background:#388bfd;}";
  html += ".info{background:#0d1117;border-left:3px solid #58a6ff;padding:10px;margin:14px 0;font-size:0.82rem;line-height:1.4;}";
  html += "</style></head><body><div class='card'>";
  html += "<h2>Delta Robot ESP32</h2>";
  html += "<div class='info'>";
  html += "<strong>Status Mode:</strong> " + String(isConnected ? "<span class='badge badge-ok'>TERHUBUNG</span>" : "<span class='badge badge-warn'>AP MANDIRI</span>") + "<br>";
  html += "<strong>Wi-Fi Tersimpan:</strong> " + (currentSSID.length() > 0 ? currentSSID : "<i>(Kosong)</i>") + "<br>";
  html += "<strong>IP Client:</strong> " + clientIp + "<br>";
  html += "<strong>IP Access Point:</strong> 192.168.4.1";
  html += "</div>";

  html += "<form method='POST' action='/setwifi'>";
  html += "<label>SSID / Nama Wi-Fi:</label>";
  html += "<input type='text' id='ssid' name='ssid' value='" + currentSSID + "' placeholder='Contoh: POCO F5 atau Wi-Fi Rumah' required>";
  html += "<label>Password Wi-Fi:</label>";
  html += "<input type='password' name='pass' placeholder='Masukkan password Wi-Fi'>";
  html += "<button type='submit'>Simpan ke ESP32 & Hubungkan</button>";
  html += "</form>";

  html += "<button class='scan-btn' onclick='scanWifi()'>Pindai Wi-Fi Sekitar</button>";
  html += "<div id='scanResults' style='margin-top:10px;'></div>";

  html += "<script>";
  html += "function scanWifi(){";
  html += "  const r = document.getElementById('scanResults');";
  html += "  r.innerHTML = '<small style=\"color:#8b949e\">Memindai...</small>';";
  html += "  fetch('/scan').then(res=>res.json()).then(data=>{";
  html += "    if(data.networks && data.networks.length>0){";
  html += "      let h = '<label>Pilih Wi-Fi Terdeteksi:</label><select onchange=\"document.getElementById(\\'ssid\\').value=this.value\">';";
  html += "      h += '<option value=\"\">-- Pilih Wi-Fi --</option>';";
  html += "      data.networks.forEach(n=>{ if(n.ssid) h += `<option value=\"${n.ssid}\">${n.ssid} (${n.rssi} dBm)</option>`; });";
  html += "      h += '</select>';";
  html += "      r.innerHTML = h;";
  html += "    } else { r.innerHTML = '<small style=\"color:#f85149\">Tidak ada Wi-Fi terdeteksi.</small>'; }";
  html += "  }).catch(e=>{ r.innerHTML = '<small style=\"color:#f85149\">Gagal memindai.</small>'; });";
  html += "}";
  html += "</script>";

  html += "</div></body></html>";
  server.send(200, "text/html", html);
}

// Mengembalikan status koneksi ESP32 dalam format JSON untuk React Dashboard
void handleStatus() {
  sendCORSHeaders();
  bool isConnected = (WiFi.status() == WL_CONNECTED);
  String mode = isConnected ? "connected" : "ap_mode";
  String ip = isConnected ? WiFi.localIP().toString() : WiFi.softAPIP().toString();
  String ssid = isConnected ? currentSSID : "DeltaRobot_Config";

  String json = "{";
  json += "\"status\":\"" + mode + "\",";
  json += "\"ip\":\"" + ip + "\",";
  json += "\"ssid\":\"" + ssid + "\",";
  json += "\"ap_ip\":\"" + WiFi.softAPIP().toString() + "\",";
  json += "\"mdns\":\"http://deltarobot.local\",";
  json += "\"last_log\":\"" + escapeJsonString(lastMegaLog) + "\"";
  json += "}";

  server.send(200, "application/json", json);
}

// Pindai jaringan Wi-Fi 2.4 GHz sekitar
void handleScan() {
  sendCORSHeaders();
  int n = WiFi.scanNetworks();
  String json = "{\"networks\":[";
  for (int i = 0; i < n; ++i) {
    if (i > 0) json += ",";
    String ssid = WiFi.SSID(i);
    ssid.replace("\"", "");
    json += "{\"ssid\":\"" + ssid + "\",\"rssi\":" + String(WiFi.RSSI(i)) + ",\"secure\":" + String(WiFi.encryptionType(i) != WIFI_AUTH_OPEN ? "true" : "false") + "}";
  }
  json += "]}";
  WiFi.scanDelete();
  server.send(200, "application/json", json);
}

// Mengirim perintah ke Mega via Serial2
void handleCmd() {
  sendCORSHeaders();
  String cmd = "";
  if (server.hasArg("val")) {
    cmd = server.arg("val");
  } else if (server.hasArg("command")) {
    cmd = server.arg("command");
  } else if (server.hasArg("plain")) {
    String body = server.arg("plain");
    body.trim();
    if (body.startsWith("{") && body.indexOf("\"command\"") != -1) {
      int startPos = body.indexOf("\"command\"") + 10;
      int colon = body.indexOf(":", startPos);
      int quote1 = body.indexOf("\"", colon);
      int quote2 = body.indexOf("\"", quote1 + 1);
      if (quote1 != -1 && quote2 != -1) {
        cmd = body.substring(quote1 + 1, quote2);
      }
    } else {
      cmd = body;
    }
  }

  if (cmd.length() > 0) {
    Serial2.println(cmd);
    Serial.println("[Web/React -> Mega]: " + cmd);
    
    String json = "{\"status\":\"success\",\"command\":\"" + escapeJsonString(cmd) + "\",\"last_log\":\"" + escapeJsonString(lastMegaLog) + "\"}";
    server.send(200, "application/json", json);
  } else {
    server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Perintah kosong (Missing val/command)\"}");
  }
}

void handleGetLog() {
  sendCORSHeaders();
  String json = "{\"status\":\"success\",\"log\":\"" + escapeJsonString(lastMegaLog) + "\"}";
  server.send(200, "application/json", json);
}

void handleSetWifi() {
  sendCORSHeaders();
  String newSSID = "";
  String newPass = "";

  if (server.hasArg("ssid")) {
    newSSID = server.arg("ssid");
    newPass = server.hasArg("pass") ? server.arg("pass") : "";
  } else if (server.hasArg("plain")) {
    String body = server.arg("plain");
    int sIdx = body.indexOf("\"ssid\"");
    int pIdx = body.indexOf("\"pass\"");
    if (sIdx != -1) {
      int c1 = body.indexOf(":", sIdx);
      int q1 = body.indexOf("\"", c1);
      int q2 = body.indexOf("\"", q1 + 1);
      if (q1 != -1 && q2 != -1) newSSID = body.substring(q1 + 1, q2);
    }
    if (pIdx != -1) {
      int c1 = body.indexOf(":", pIdx);
      int q1 = body.indexOf("\"", c1);
      int q2 = body.indexOf("\"", q1 + 1);
      if (q1 != -1 && q2 != -1) newPass = body.substring(q1 + 1, q2);
    }
  }

  if (newSSID.length() > 0) {
    prefs.begin("wifi-config", false);
    prefs.putString("ssid", newSSID);
    prefs.putString("pass", newPass);
    prefs.end();

    currentSSID = newSSID;
    currentPass = newPass;

    String resp = "<!DOCTYPE html><html><head><meta charset='UTF-8'><title>Wi-Fi Disimpan</title>";
    resp += "<style>body{font-family:sans-serif;background:#0d1117;color:#fff;text-align:center;padding:50px;}</style></head><body>";
    resp += "<h2>Wi-Fi Berhasil Disimpan!</h2>";
    resp += "<p>ESP32 sedang mencoba menghubungkan ke: <b>" + newSSID + "</b></p>";
    resp += "<p>Jika berhasil, buka kembali dashboard melalui IP baru atau <a href='http://deltarobot.local' style='color:#58a6ff;'>http://deltarobot.local</a>.</p>";
    resp += "<p><small>ESP32 akan me-restart koneksi dalam 3 detik...</small></p>";
    resp += "</body></html>";
    server.send(200, "text/html", resp);

    delay(2000);
    WiFi.disconnect();
    delay(500);
    WiFi.begin(newSSID.c_str(), newPass.c_str());
  } else {
    server.send(400, "text/plain", "Error: SSID tidak boleh kosong!");
  }
}

// OTA (Over-The-Air) Web Firmware Update
void handleOTA() {
  sendCORSHeaders();
  String html = "<!DOCTYPE html><html><head><meta charset='UTF-8'><title>ESP32 OTA Update</title>";
  html += "<style>body{font-family:sans-serif;background:#0d1117;color:#c9d1d9;padding:40px;display:flex;justify-content:center;}";
  html += ".box{background:#161b22;border:1px solid #30363d;padding:24px;border-radius:8px;max-width:400px;width:100%;}";
  html += "input{margin:12px 0;width:100%;} button{background:#238636;color:#fff;border:none;padding:10px;width:100%;border-radius:6px;cursor:pointer;font-weight:bold;}</style></head>";
  html += "<body><div class='box'><h3>ESP32 OTA Firmware Update</h3>";
  html += "<form method='POST' action='/update' enctype='multipart/form-data'>";
  html += "<input type='file' name='update' accept='.bin' required>";
  html += "<button type='submit'>Upload Firmware (.bin)</button>";
  html += "</form></div></body></html>";
  server.send(200, "text/html", html);
}

void setup() {
  Serial.begin(115200); // USB Monitor Debugging
  
  // UART Serial2 ke Arduino Mega pada baudrate tinggi 115200
  Serial2.begin(115200, SERIAL_8N1, RXp2, TXp2);

  Serial.println("\n============================================");
  Serial.println("  DELTA ROBOT - ESP32 IOT NODE READY");
  Serial.println("============================================");

  // Ambil data konfigurasi Wi-Fi dari NVS Flash
  prefs.begin("wifi-config", true);
  currentSSID = prefs.getString("ssid", "");
  currentPass = prefs.getString("pass", "");
  prefs.end();

  // Mode Dual: Access Point (AP) Mandiri + Client (STA)
  WiFi.mode(WIFI_AP_STA);

  // 1. Jalankan Hotspot AP Mandiri (Fallback jika Wi-Fi luar tidak ada)
  IPAddress apIP(192, 168, 4, 1);
  IPAddress netMsk(255, 255, 255, 0);
  WiFi.softAPConfig(apIP, apIP, netMsk);
  WiFi.softAP("DeltaRobot_Config", "12345678");
  Serial.println("[Wi-Fi AP] Hotspot Mandiri Aktif: DeltaRobot_Config (Password: 12345678)");
  Serial.print("[Wi-Fi AP] IP Access Point: http://");
  Serial.println(WiFi.softAPIP());

  // 2. Hubungkan ke Wi-Fi tersimpan (jika ada)
  if (currentSSID.length() > 0) {
    Serial.println("[ESP32] Mencoba terhubung ke Wi-Fi tersimpan: " + currentSSID);
    WiFi.begin(currentSSID.c_str(), currentPass.c_str());

    unsigned long startAttempt = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 6000) {
      delay(500);
      Serial.print(".");
    }

    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("\n[Wi-Fi Client] Berhasil terhubung ke: " + currentSSID);
      Serial.print("[Wi-Fi Client] IP Address: http://");
      Serial.println(WiFi.localIP());
    } else {
      Serial.println("\n[Wi-Fi Client] Gagal terhubung ke '" + currentSSID + "'. Buka http://192.168.4.1 untuk konfigurasi.");
    }
  } else {
    Serial.println("[Wi-Fi Client] Belum ada Wi-Fi tersimpan. Buka http://192.168.4.1 (Wi-Fi: DeltaRobot_Config).");
  }

  // Aktifkan mDNS (http://deltarobot.local)
  if (MDNS.begin("deltarobot")) {
    Serial.println("[mDNS] Respon di: http://deltarobot.local");
  }

  // Routing Endpoint Web Server
  server.on("/", HTTP_GET, handleRoot);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/scan", HTTP_GET, handleScan);
  server.on("/cmd", HTTP_GET, handleCmd);
  server.on("/cmd", HTTP_POST, handleCmd);
  server.on("/getlog", HTTP_GET, handleGetLog);
  server.on("/setwifi", HTTP_POST, handleSetWifi);
  server.on("/setwifi", HTTP_GET, handleSetWifi);

  // OTA Firmware Update Endpoints
  server.on("/update", HTTP_GET, handleOTA);
  server.on("/update", HTTP_POST, []() {
    sendCORSHeaders();
    server.send(200, "text/plain", (Update.hasError()) ? "UPDATE GAGAL" : "UPDATE SUKSES. Rebooting...");
    delay(1000);
    ESP.restart();
  }, []() {
    HTTPUpload& upload = server.upload();
    if (upload.status == UPLOAD_FILE_START) {
      Serial.printf("[OTA] Memulai update: %s\n", upload.filename.c_str());
      if (!Update.begin(UPDATE_SIZE_UNKNOWN)) {
        Update.printError(Serial);
      }
    } else if (upload.status == UPLOAD_FILE_WRITE) {
      if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
        Update.printError(Serial);
      }
    } else if (upload.status == UPLOAD_FILE_END) {
      if (Update.end(true)) {
        Serial.printf("[OTA] Update sukses! Ukuran: %u bytes\n", upload.totalSize);
      } else {
        Update.printError(Serial);
      }
    }
  });

  // Handle CORS Preflight OPTIONS requests
  server.onNotFound([]() {
    if (server.method() == HTTP_OPTIONS) {
      handleOptions();
    } else {
      sendCORSHeaders();
      server.send(404, "text/plain", "Not Found");
    }
  });

  server.begin();
  Serial.println("[HTTP Server] Siap menerima koneksi!");
}

void loop() {
  server.handleClient();

  // Membaca pesan log dari Arduino Mega pada 115200 baud
  if (Serial2.available() > 0) {
    String msg = Serial2.readStringUntil('\n');
    msg.trim();
    if (msg.length() > 0) {
      lastMegaLog = msg;
      Serial.println("[Mega -> ESP32]: " + msg);
    }
  }
}