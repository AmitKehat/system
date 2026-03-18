// src/components/Toolbar/SymbolSearch.jsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useChartStore } from '../../store/chartStore';
import { useStatusStore } from '../../store/statusStore';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

export default function SymbolSearch() {
  const { symbol, setSymbol, reloadChart } = useChartStore();
  
  const [inputValue, setInputValue] = useState(symbol);
  const [isOpen, setIsOpen] = useState(false);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  
  const debouncedQuery = useDebounce(inputValue, 300);

  useEffect(() => {
    setInputValue(symbol);
  }, [symbol]);

  useEffect(() => {
    let isCancelled = false; 

    const searchSymbols = async () => {
      if (!debouncedQuery || debouncedQuery.length < 1) {
        setMatches([]);
        setIsOpen(false);
        setLoading(false);  // Clear loading when no query
        return;
      }

      if (debouncedQuery.toUpperCase() === symbol) {
        setIsOpen(false);
        setLoading(false);  // Clear loading when query matches current symbol
        return;
      }
      
      setLoading(true);
      try {
        const { mode } = useStatusStore.getState();
        
        const res = await fetch(`${API_BASE}/ib/symbol_search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            query: debouncedQuery, 
            max_results: 10, 
            mode: mode 
          })
        });
        const data = await res.json();
        
        if (isCancelled) return; 
        
        if (data.status === 'OK' && data.matches) {
          const filtered = data.matches.filter(m => m.symbol && m.symbol.trim() !== '');
          const unique = filtered.reduce((acc, curr) => {
            const key = `${curr.symbol}-${curr.exchange}`;
            if (!acc.find(m => `${m.symbol}-${m.exchange}` === key)) {
              acc.push(curr);
            }
            return acc;
          }, []);
          
          setMatches(unique);
          setIsOpen(unique.length > 0);
          setSelectedIndex(-1);
        } else {
          setMatches([]);
          setIsOpen(false);
        }
      } catch (e) {
        if (isCancelled) return; 
        setMatches([]);
        setIsOpen(false);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };
    
    searchSymbols();

    return () => {
      isCancelled = true; 
    };
  }, [debouncedQuery, symbol]);
  
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(e.target) &&
        inputRef.current &&
        !inputRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  const handleInputChange = (e) => {
    const value = e.target.value.toUpperCase();
    setInputValue(value);
  };

  const handleSelectSymbol = useCallback((match) => {
    if (match.symbol !== symbol) {
        setInputValue(match.symbol);
        setSymbol(match.symbol);
        reloadChart();
    }
    setIsOpen(false);
    setMatches([]);
    inputRef.current?.blur();
  }, [setSymbol, reloadChart, symbol]);

  const handleKeyDown = (e) => {
    if (!isOpen || matches.length === 0) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const newSymbol = inputValue.trim().toUpperCase();
        if (newSymbol && newSymbol !== symbol) {
          setSymbol(newSymbol);
          reloadChart();
        }
        setIsOpen(false);
        inputRef.current?.blur();
      }
      return;
    }
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < matches.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && matches[selectedIndex]) {
          handleSelectSymbol(matches[selectedIndex]);
        } else if (inputValue.trim()) {
          const newSymbol = inputValue.trim().toUpperCase();
          if (newSymbol !== symbol) {
              setSymbol(newSymbol);
              reloadChart();
          }
          setIsOpen(false);
          inputRef.current?.blur();
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setSelectedIndex(-1);
        break;
      default:
        break;
    }
  };

  const handleFocus = () => {
    if (matches.length > 0) {
      setIsOpen(true);
    }
  };
  
  const handleBlur = () => {
    setTimeout(() => {
      if (!inputValue.trim()) {
        setInputValue(symbol);
      }
    }, 200);
  };
  
  const getSecTypeClass = (secType) => {
    const classes = { 'STK': 'stock', 'ETF': 'etf', 'IND': 'index', 'FUT': 'future', 'OPT': 'option', 'CASH': 'forex', 'CRYPTO': 'crypto', 'BOND': 'bond', 'FUND': 'fund' };
    return classes[secType] || 'stock';
  };

  const getSecTypeLabel = (secType) => {
    const labels = { 'STK': 'Stock', 'ETF': 'ETF', 'IND': 'Index', 'FUT': 'Future', 'OPT': 'Option', 'CASH': 'Forex', 'CRYPTO': 'Crypto', 'BOND': 'Bond', 'FUND': 'Fund' };
    return labels[secType] || secType;
  };
  
  return (
    <div className="symbol-search-container">
      <div className="symbol-input-wrapper">
        <input
          ref={inputRef}
          type="text"
          className="tv-input symbol-input"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="Symbol"
          autoComplete="off"
          spellCheck="false"
        />
        {loading && (
          <div className="symbol-search-loading">
            <div className="spinner-small" />
          </div>
        )}
      </div>
      
      {isOpen && matches.length > 0 && (
        <div ref={dropdownRef} className="symbol-search-dropdown">
          {matches.map((match, index) => (
            <div
              key={`${match.symbol}-${match.exchange}-${index}`}
              className={`symbol-search-item ${index === selectedIndex ? 'selected' : ''}`}
              onClick={() => handleSelectSymbol(match)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              {/* CRITICAL FIX: The entire circle icon and SymbolLogo call have been perfectly eradicated */}
              <div className="symbol-search-item-main">
                <span className="symbol-search-symbol">
                  {match.symbol}
                  <span className={`symbol-search-type ${getSecTypeClass(match.sec_type)}`} style={{ marginLeft: '4px' }}>
                    {getSecTypeLabel(match.sec_type)}
                  </span>
                </span>
                <span className="symbol-search-company-name">{match.name}</span>
              </div>
              <div className="symbol-search-item-details" style={{ marginLeft: 'auto' }}>
                <span className="symbol-search-exchange">{match.exchange}</span>
                <span className="symbol-search-currency">{match.currency}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}