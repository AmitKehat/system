// src/components/Indicators/IndicatorDialog.jsx
import React, { useState, useMemo } from 'react';
import Modal from '../UI/Modal';
import { Icons } from '../UI/Icons';
import { useChartStore, INDICATOR_DEFS } from '../../store/chartStore';

const CATEGORIES = [
  { id: 'favorites', label: 'Favorites', icon: Icons.StarFilled },
  { id: 'all', label: 'All', icon: Icons.Indicators },
];

const INDICATOR_CATEGORIES = [
  { id: 'moving-averages', label: 'Moving Averages' },
  { id: 'oscillators', label: 'Oscillators' },
  { id: 'volatility', label: 'Volatility' },
  { id: 'volume', label: 'Volume' },
  { id: 'trend', label: 'Trend' },
];

export default function IndicatorDialog() {
  const {
    indicatorDialogOpen,
    closeIndicatorDialog,
    favorites,
    toggleFavorite,
    addIndicator,
    openSettings
  } = useChartStore();

  const [activeCategory, setActiveCategory] = useState('favorites');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredIndicators = useMemo(() => {
    let indicators = INDICATOR_DEFS;

    // Filter by category
    if (activeCategory === 'favorites') {
      indicators = indicators.filter(ind => favorites.includes(ind.type));
    }

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      indicators = indicators.filter(ind =>
        ind.name.toLowerCase().includes(query) ||
        ind.fullName?.toLowerCase().includes(query) ||
        ind.description?.toLowerCase().includes(query)
      );
    }

    return indicators;
  }, [activeCategory, searchQuery, favorites]);

  // Group by category for display
  const groupedIndicators = useMemo(() => {
    if (activeCategory === 'favorites' || searchQuery.trim()) {
      return [{ id: 'results', label: '', indicators: filteredIndicators }];
    }

    return INDICATOR_CATEGORIES.map(cat => ({
      ...cat,
      indicators: filteredIndicators.filter(ind => ind.category === cat.id)
    })).filter(cat => cat.indicators.length > 0);
  }, [filteredIndicators, activeCategory, searchQuery]);

  const handleAddIndicator = (type) => {
    const id = addIndicator(type);
    closeIndicatorDialog();
    if (id) {
      setTimeout(() => {
        openSettings(id);
      }, 150);
    }
  };  

  const handleClose = () => {
    closeIndicatorDialog();
    setSearchQuery('');
    setActiveCategory('favorites');
  };

  return (
    <Modal
      open={indicatorDialogOpen}
      onClose={handleClose}
      title="Indicators"
      className="indicator-dialog"
    >
      <div className="indicator-dialog-content">
        {/* Sidebar */}
        <div className="indicator-dialog-sidebar">
          {CATEGORIES.map(cat => (
            <div
              key={cat.id}
              className={`sidebar-item ${activeCategory === cat.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat.id)}
            >
              <cat.icon />
              <span>{cat.label}</span>
            </div>
          ))}

          <div className="sidebar-divider" />

          {INDICATOR_CATEGORIES.map(cat => (
            <div
              key={cat.id}
              className={`sidebar-item ${activeCategory === cat.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat.id)}
            >
              <span>{cat.label}</span>
            </div>
          ))}
        </div>

        {/* Main content */}
        <div className="indicator-dialog-main">
          {/* Search */}
          <div className="indicator-search-wrapper" style={{ position: 'relative' }}>
            <span className="indicator-search-icon">
              <Icons.Search />
            </span>
            <input
              type="text"
              className="indicator-search"
              placeholder="Search indicators..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>

          {/* Indicator list */}
          <div className="indicator-list">
            {groupedIndicators.map(group => (
              <div key={group.id} className="indicator-category">
                {group.label && (
                  <div className="indicator-category-title">{group.label}</div>
                )}
                {group.indicators.map(ind => (
                  <div
                    key={ind.type}
                    className="indicator-item"
                    onClick={() => handleAddIndicator(ind.type)}
                  >
                    <div
                      className={`indicator-item-star ${favorites.includes(ind.type) ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(ind.type);
                      }}
                    >
                      {favorites.includes(ind.type) ? <Icons.StarFilled /> : <Icons.Star />}
                    </div>
                    <div className="indicator-item-info">
                      <div className="indicator-item-name">
                        {ind.name}
                        {ind.fullName && ind.fullName !== ind.name && (
                          <span style={{ 
                            fontWeight: 400, 
                            color: 'var(--tv-color-text-secondary)',
                            marginLeft: 8 
                          }}>
                            {ind.fullName}
                          </span>
                        )}
                      </div>
                      <div className="indicator-item-desc">{ind.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {filteredIndicators.length === 0 && (
              <div style={{ 
                padding: 'var(--tv-spacing-xl)', 
                textAlign: 'center',
                color: 'var(--tv-color-text-secondary)'
              }}>
                {activeCategory === 'favorites' && !searchQuery
                  ? 'No favorites yet. Click the star icon to add indicators to favorites.'
                  : 'No indicators found.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
