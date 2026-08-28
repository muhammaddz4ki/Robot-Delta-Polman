CREATE DATABASE IF NOT EXISTS robot_delta_db;
USE robot_delta_db;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'admin'
);

-- Default password is 'admin123' (hashed using werkzeug pbkdf2:sha256)
INSERT IGNORE INTO users (username, password_hash, role) VALUES 
('admin', 'scrypt:32768:8:1$kYdO9gQ1iIeP9nN4$4f4c8032c2538b71d9e7943c7263fb39b1a7d65fc54d8b8cc7fa6fbe147e4eb1a4b67d5cb1ed0583b4b087095c5c029312b9d885eb26d2e482200dc832fcff37', 'admin');

CREATE TABLE IF NOT EXISTS robot_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    profile_name VARCHAR(50) UNIQUE NOT NULL,
    x FLOAT NOT NULL DEFAULT 0,
    y FLOAT NOT NULL DEFAULT 0,
    z FLOAT NOT NULL DEFAULT 0
);

INSERT IGNORE INTO robot_settings (profile_name, x, y, z) VALUES 
('PICK_A', 20, -30, -280),
('DROP_A', 20, 120, -320),
('PICK_B', -25, -25, -295),
('DROP_B', -80, 110, -320);

CREATE TABLE IF NOT EXISTS coordinate_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    template_name VARCHAR(100) UNIQUE NOT NULL,
    pickA_x FLOAT, pickA_y FLOAT, pickA_z FLOAT,
    dropA_x FLOAT, dropA_y FLOAT, dropA_z FLOAT,
    pickB_x FLOAT, pickB_y FLOAT, pickB_z FLOAT,
    dropB_x FLOAT, dropB_y FLOAT, dropB_z FLOAT
);

INSERT IGNORE INTO coordinate_templates (template_name, pickA_x, pickA_y, pickA_z, dropA_x, dropA_y, dropA_z, pickB_x, pickB_y, pickB_z, dropB_x, dropB_y, dropB_z) VALUES 
('Default Setting', 20, -30, -280, 20, 120, -320, -25, -25, -295, -80, 110, -320);

CREATE TABLE IF NOT EXISTS app_settings (
    setting_key VARCHAR(50) PRIMARY KEY,
    setting_value JSON
);
