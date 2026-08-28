import React, { useState, useRef, useEffect } from 'react';
import { useTheme } from '../ThemeContext';

const ThemeToggle = ({ compact = false }) => {
  const { themeMode, setThemeMode, resolvedTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getLabel = () => {
    if (themeMode === 'light') return 'Terang';
    if (themeMode === 'dark') return 'Gelap';
    return 'Sistem';
  };

  return (
    <div className="theme-toggle-wrapper" ref={dropdownRef}>
      <button 
        type="button"
        className="theme-toggle-btn"
        onClick={() => setIsOpen(!isOpen)}
        title="Klik untuk mengganti tema"
        aria-label="Pilih Tema"
      >
        <span className="theme-toggle-label">{getLabel()}</span>
      </button>

      {isOpen && (
        <div className="theme-dropdown-menu">
          <button 
            type="button"
            className={`theme-option-item ${themeMode === 'dark' ? 'active' : ''}`}
            onClick={() => { setThemeMode('dark'); setIsOpen(false); }}
          >
            <span>Gelap (Dark)</span>
          </button>

          <button 
            type="button"
            className={`theme-option-item ${themeMode === 'light' ? 'active' : ''}`}
            onClick={() => { setThemeMode('light'); setIsOpen(false); }}
          >
            <span>Terang (Light)</span>
          </button>

          <button 
            type="button"
            className={`theme-option-item ${themeMode === 'system' ? 'active' : ''}`}
            onClick={() => { setThemeMode('system'); setIsOpen(false); }}
          >
            <span>Ikuti Sistem (Auto)</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default ThemeToggle;
