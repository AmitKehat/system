import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useWatchlistStore } from '../../store/watchlistStore';
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

const getSecTypeClass = (secType) => {
  const classes = { 'STK': 'stock', 'ETF': 'etf', 'IND': 'index', 'FUT': 'future', 'OPT': 'option', 'CASH': 'forex', 'CRYPTO': 'crypto', 'BOND': 'bond', 'FUND': 'fund' };
  return classes[secType] || 'stock';
};

const getSecTypeLabel = (secType) => {
  const labels = { 'STK': 'Stock', 'ETF': 'ETF', 'IND': 'Index', 'FUT': 'Future', 'OPT': 'Option', 'CASH': 'Forex', 'CRYPTO': 'Crypto', 'BOND': 'Bond', 'FUND': 'Fund' };
  return labels[secType] || secType;
};


// --- SAFE FORMATTER HELPERS ---
const formatNum = (num, decimals = 2) => {
    if (num === null || num === undefined || num === '--') return '--';
    const parsed = parseFloat(num);
    return isNaN(parsed) ? '--' : parsed.toFixed(decimals);
};

const formatCompact = (num) => {
    if (num === null || num === undefined || num === '--') return '--';
    const parsed = Math.abs(parseFloat(num));
    const sign = num < 0 ? '-' : '';
    if (isNaN(parsed)) return '--';
    if (parsed >= 1e12) return sign + (parsed / 1e12).toFixed(2) + 'T';
    if (parsed >= 1e9) return sign + (parsed / 1e9).toFixed(2) + 'B';
    if (parsed >= 1e6) return sign + (parsed / 1e6).toFixed(2) + 'M';
    return sign + parsed.toLocaleString();
};

const formatCompactSpace = (num) => {
    if (num === null || num === undefined || num === '--') return '--';
    const parsed = Math.abs(parseFloat(num));
    const sign = num < 0 ? '-' : '';
    if (isNaN(parsed)) return '--';
    if (parsed >= 1e12) return sign + (parsed / 1e12).toFixed(2) + ' B';
    if (parsed >= 1e9) return sign + (parsed / 1e9).toFixed(2) + ' B';
    if (parsed >= 1e6) return sign + (parsed / 1e6).toFixed(2) + ' M';
    return sign + parsed.toLocaleString();
};


// --- NATIVE REACT COMPONENT: Financials Widget (Interactive) ---
const NativeFinancials = ({ profile }) => {
    const [chartType, setChartType] = useState('income');
    const [tab, setTab] = useState('annual');
    const [hoveredIdx, setHoveredIdx] = useState(null);
    const [isDropdownHovered, setIsDropdownHovered] = useState(false);

    const financials = profile?.financials;
    if (!financials) return null;

    const sectionData = financials[chartType];
    if (!sectionData) return null;

    const data = tab === 'annual' ? sectionData.annual : sectionData.quarterly;
    if (!data || data.length === 0) return null;

    const svgWidth = 400;
    const svgHeight = 250;
    const chartTop = 60;
    const chartBottom = 200;
    const chartLeft = 40; 
    const chartRight = 330; 

    const allVals = [];
    if (chartType === 'income') allVals.push(...data.map(d=>d.revenue||0), ...data.map(d=>d.netIncome||0));
    if (chartType === 'balance') allVals.push(...data.map(d=>d.assets||0), ...data.map(d=>d.liabilities||0));
    if (chartType === 'cashflow') allVals.push(...data.map(d=>d.operating||0), ...data.map(d=>d.investing||0), ...data.map(d=>d.financing||0));

    const rawMaxVal = Math.max(0.1, ...allVals);
    const rawMinVal = Math.min(0, ...allVals);
    const valPadding = (rawMaxVal - rawMinVal) * 0.1;
    const maxVal = rawMaxVal + valPadding;
    const minVal = rawMinVal < 0 ? rawMinVal - valPadding : 0;
    
    let minMargin = 0, maxMargin = 100;
    let hasLeftAxis = false;
    
    if (chartType === 'income') {
        const mVals = data.map(d => d.netMargin || 0);
        const rawMaxM = Math.max(0.1, ...mVals);
        const rawMinM = Math.min(0, ...mVals);
        const mPadding = (rawMaxM - rawMinM) * 0.2 || 5;
        maxMargin = rawMaxM + mPadding;
        minMargin = rawMinM - mPadding;
        hasLeftAxis = true;
    } else if (chartType === 'balance') {
        const mVals = data.map(d => d.liabilityRatio || 0);
        const rawMaxM = Math.max(0.1, ...mVals);
        const rawMinM = Math.min(0, ...mVals);
        const mPadding = (rawMaxM - rawMinM) * 0.2 || 5;
        maxMargin = rawMaxM + mPadding;
        minMargin = rawMinM - mPadding;
        hasLeftAxis = true;
    }

    const gridLines = [0, 1, 2, 3, 4];
    const stepX = (chartRight - chartLeft) / Math.max(1, data.length);
    const barWidth = Math.min(16, stepX * 0.25);
    
    const getCY = (val) => chartBottom - ((val - minVal) / (maxVal - minVal)) * (chartBottom - chartTop);
    const zeroY = getCY(0);

    return (
        <div style={{ marginTop: '24px', borderTop: '1px solid var(--tv-color-border, #2a2e39)', paddingTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '14px', display: 'flex', alignItems: 'center' }}>
                    
                    <div 
                        onMouseEnter={() => setIsDropdownHovered(true)}
                        onMouseLeave={() => setIsDropdownHovered(false)}
                        style={{
                            position: 'relative',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '4px 8px',
                            marginLeft: '-8px',
                            borderRadius: '4px',
                            background: isDropdownHovered ? 'var(--tv-color-border, #2a2e39)' : 'transparent',
                            transition: 'background 0.2s ease',
                            cursor: 'pointer'
                        }}
                    >
                        <select
                            value={chartType}
                            onChange={(e) => setChartType(e.target.value)}
                            style={{ 
                                background: 'transparent', 
                                color: 'var(--tv-color-text-primary, #e0e3eb)', 
                                border: 'none', 
                                fontWeight: 'bold', 
                                fontSize: '14px', 
                                outline: 'none', 
                                cursor: 'pointer',
                                appearance: 'none',
                                WebkitAppearance: 'none',
                                paddingRight: '16px',
                                zIndex: 2,
                                position: 'relative'
                            }}
                        >
                            <option value="income" style={{background: '#1e222d'}}>Income statement</option>
                            <option value="balance" style={{background: '#1e222d'}}>Balance sheet</option>
                            <option value="cashflow" style={{background: '#1e222d'}}>Cash flow</option>
                        </select>
                        <div style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex', alignItems: 'center', zIndex: 1, color: 'var(--tv-color-text-secondary, #787b86)' }}>
                            <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </div>
                    </div>

                </div>
                <div style={{ display: 'flex', gap: '12px', fontSize: '13px' }}>
                    <span onClick={() => setTab('annual')} style={{ cursor: 'pointer', color: tab === 'annual' ? '#2962ff' : 'var(--tv-color-text-secondary, #787b86)' }}>Annual</span>
                    <span onClick={() => setTab('quarterly')} style={{ cursor: 'pointer', color: tab === 'quarterly' ? '#2962ff' : 'var(--tv-color-text-secondary, #787b86)' }}>Quarterly</span>
                </div>
            </div>

            <div style={{ position: 'relative', width: '100%', height: 'auto', overflow: 'hidden' }}>
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} width="100%" height="100%" style={{ display: 'block' }}>
                    
                    {hoveredIdx !== null && (
                        <rect 
                            x={chartLeft + hoveredIdx * stepX} 
                            y={chartTop} 
                            width={stepX} 
                            height={chartBottom - chartTop} 
                            fill="rgba(255,255,255,0.04)" 
                            pointerEvents="none" 
                        />
                    )}

                    {gridLines.map(i => {
                        const y = chartBottom - (i / 4) * (chartBottom - chartTop);
                        const mVal = minMargin + (maxMargin - minMargin) * (i / 4);
                        const rVal = minVal + (maxVal - minVal) * (i / 4);
                        return (
                            <g key={i}>
                                <line x1={chartLeft} y1={y} x2={chartRight} y2={y} stroke="var(--tv-color-border, #2a2e39)" strokeWidth="1" />
                                {hasLeftAxis && (
                                    <text x={chartLeft - 5} y={y + 4} fill="var(--tv-color-text-secondary, #787b86)" fontSize="11" fontFamily="sans-serif" textAnchor="end">{mVal.toFixed(0)}%</text>
                                )}
                                <text x={chartRight + 5} y={y + 4} fill="var(--tv-color-text-secondary, #787b86)" fontSize="11" fontFamily="sans-serif" textAnchor="start">{formatCompactSpace(rVal)}</text>
                            </g>
                        );
                    })}

                    {data.map((d, i) => {
                        const xCenter = chartLeft + (i + 0.5) * stepX;
                        const prev = i > 0 ? data[i-1] : null;
                        const pXCenter = chartLeft + (i - 0.5) * stepX;

                        return (
                            <g key={i}>
                                <text x={xCenter} y={chartBottom + 20} fill="var(--tv-color-text-secondary, #787b86)" fontSize="11" fontFamily="sans-serif" textAnchor="middle">{d.period}</text>
                                
                                {chartType === 'income' && (
                                    <>
                                        {d.revenue !== null && <rect x={xCenter - barWidth - 1} y={d.revenue >= 0 ? getCY(d.revenue) : zeroY} width={barWidth} height={Math.abs(getCY(d.revenue) - zeroY)} fill="#2962ff" rx="1" />}
                                        {d.netIncome !== null && <rect x={xCenter + 1} y={d.netIncome >= 0 ? getCY(d.netIncome) : zeroY} width={barWidth} height={Math.abs(getCY(d.netIncome) - zeroY)} fill="#4dd0e1" rx="1" />}
                                        
                                        {i > 0 && prev.netMargin !== null && d.netMargin !== null && (
                                            <line x1={pXCenter} y1={chartBottom - ((prev.netMargin - minMargin) / (maxMargin - minMargin)) * (chartBottom - chartTop)} x2={xCenter} y2={chartBottom - ((d.netMargin - minMargin) / (maxMargin - minMargin)) * (chartBottom - chartTop)} stroke="#ff9800" strokeWidth="2" />
                                        )}
                                        {d.netMargin !== null && (
                                            <circle cx={xCenter} cy={chartBottom - ((d.netMargin - minMargin) / (maxMargin - minMargin)) * (chartBottom - chartTop)} r={hoveredIdx === i ? 4 : 3} fill="#1e222d" stroke="#ff9800" strokeWidth="2" />
                                        )}
                                    </>
                                )}

                                {chartType === 'balance' && (
                                    <>
                                        {d.assets !== null && <rect x={xCenter - barWidth - 1} y={d.assets >= 0 ? getCY(d.assets) : zeroY} width={barWidth} height={Math.abs(getCY(d.assets) - zeroY)} fill="#b388ff" rx="1" />}
                                        {d.liabilities !== null && <rect x={xCenter + 1} y={d.liabilities >= 0 ? getCY(d.liabilities) : zeroY} width={barWidth} height={Math.abs(getCY(d.liabilities) - zeroY)} fill="#ffca28" rx="1" />}
                                        
                                        {i > 0 && prev.liabilityRatio !== null && d.liabilityRatio !== null && (
                                            <line x1={pXCenter} y1={chartBottom - ((prev.liabilityRatio - minMargin) / (maxMargin - minMargin)) * (chartBottom - chartTop)} x2={xCenter} y2={chartBottom - ((d.liabilityRatio - minMargin) / (maxMargin - minMargin)) * (chartBottom - chartTop)} stroke="#64b5f6" strokeWidth="2" />
                                        )}
                                        {d.liabilityRatio !== null && (
                                            <circle cx={xCenter} cy={chartBottom - ((d.liabilityRatio - minMargin) / (maxMargin - minMargin)) * (chartBottom - chartTop)} r={hoveredIdx === i ? 4 : 3} fill="#1e222d" stroke="#64b5f6" strokeWidth="2" />
                                        )}
                                    </>
                                )}

                                {chartType === 'cashflow' && (
                                    <>
                                        {i > 0 && prev.operating !== null && d.operating !== null && <line x1={pXCenter} y1={getCY(prev.operating)} x2={xCenter} y2={getCY(d.operating)} stroke="#e040fb" strokeWidth="2" />}
                                        {i > 0 && prev.investing !== null && d.investing !== null && <line x1={pXCenter} y1={getCY(prev.investing)} x2={xCenter} y2={getCY(d.investing)} stroke="#2962ff" strokeWidth="2" />}
                                        {i > 0 && prev.financing !== null && d.financing !== null && <line x1={pXCenter} y1={getCY(prev.financing)} x2={xCenter} y2={getCY(d.financing)} stroke="#4db6ac" strokeWidth="2" />}
                                        
                                        {d.operating !== null && <circle cx={xCenter} cy={getCY(d.operating)} r={hoveredIdx === i ? 4 : 3} fill="#1e222d" stroke="#e040fb" strokeWidth="2" />}
                                        {d.investing !== null && <circle cx={xCenter} cy={getCY(d.investing)} r={hoveredIdx === i ? 4 : 3} fill="#1e222d" stroke="#2962ff" strokeWidth="2" />}
                                        {d.financing !== null && <circle cx={xCenter} cy={getCY(d.financing)} r={hoveredIdx === i ? 4 : 3} fill="#1e222d" stroke="#4db6ac" strokeWidth="2" />}
                                    </>
                                )}
                            </g>
                        );
                    })}

                    {/* Transparent Hitboxes for Mouse Hover */}
                    {data.map((d, i) => (
                        <rect 
                            key={`hitbox-${i}`}
                            x={chartLeft + i * stepX}
                            y={chartTop}
                            width={stepX}
                            height={chartBottom - chartTop}
                            fill="transparent"
                            onMouseEnter={() => setHoveredIdx(i)}
                            onMouseLeave={() => setHoveredIdx(null)}
                            style={{ cursor: 'crosshair' }}
                        />
                    ))}

                    {/* Dynamic Floating Tooltip */}
                    {hoveredIdx !== null && (
                        (() => {
                            const d = data[hoveredIdx];
                            const tooltipWidth = 145;
                            const tooltipHeight = 52;
                            let ttX = chartLeft + (hoveredIdx + 0.5) * stepX - tooltipWidth / 2;
                            if (ttX < 10) ttX = 10;
                            if (ttX + tooltipWidth > svgWidth - 10) ttX = svgWidth - tooltipWidth - 10;
                            let ttY = 0;

                            return (
                                <foreignObject x={ttX} y={ttY} width={tooltipWidth} height={tooltipHeight} style={{ pointerEvents: 'none', zIndex: 100 }}>
                                    <div style={{ background: '#1e222d', border: '1px solid var(--tv-color-border, #2a2e39)', borderRadius: '4px', padding: '4px 6px', color: '#e0e3eb', fontSize: '9.5px', boxShadow: '0 4px 10px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', boxSizing: 'border-box', gap: '3px', whiteSpace: 'nowrap' }}>
                                        {chartType === 'income' && (
                                            <>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}><span style={{display:'flex', alignItems:'center', gap:'6px'}}><div style={{width:'6px',height:'6px',borderRadius:'50%',backgroundColor:'#2962ff'}}/>Revenue</span> <span style={{fontWeight: '500'}}>{formatCompactSpace(d.revenue)} USD</span></div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}><span style={{display:'flex', alignItems:'center', gap:'6px'}}><div style={{width:'6px',height:'6px',borderRadius:'50%',backgroundColor:'#4dd0e1'}}/>Net income</span> <span style={{fontWeight: '500'}}>{formatCompactSpace(d.netIncome)} USD</span></div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}><span style={{display:'flex', alignItems:'center', gap:'6px'}}><div style={{width:'6px',height:'6px',borderRadius:'50%',backgroundColor:'#ff9800'}}/>Net margin</span> <span style={{fontWeight: '500'}}>{d.netMargin !== null ? d.netMargin.toFixed(2) + '%' : '--'}</span></div>
                                            </>
                                        )}
                                        {chartType === 'balance' && (
                                            <>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}><span style={{display:'flex', alignItems:'center', gap:'6px'}}><div style={{width:'6px',height:'6px',borderRadius:'50%',backgroundColor:'#b388ff'}}/>Total assets</span> <span style={{fontWeight: '500'}}>{formatCompactSpace(d.assets)} USD</span></div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}><span style={{display:'flex', alignItems:'center', gap:'6px'}}><div style={{width:'6px',height:'6px',borderRadius:'50%',backgroundColor:'#ffca28'}}/>Total liabilities</span> <span style={{fontWeight: '500'}}>{formatCompactSpace(d.liabilities)} USD</span></div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}><span style={{display:'flex', alignItems:'center', gap:'6px'}}><div style={{width:'6px',height:'6px',borderRadius:'50%',backgroundColor:'#64b5f6'}}/>Liab to assets</span> <span style={{fontWeight: '500'}}>{d.liabilityRatio !== null ? d.liabilityRatio.toFixed(2) + '%' : '--'}</span></div>
                                            </>
                                        )}
                                        {chartType === 'cashflow' && (
                                            <>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}><span style={{display:'flex', alignItems:'center', gap:'6px'}}><div style={{width:'6px',height:'6px',borderRadius:'50%',backgroundColor:'#e040fb'}}/>Operating</span> <span style={{fontWeight: '500'}}>{formatCompactSpace(d.operating)} USD</span></div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}><span style={{display:'flex', alignItems:'center', gap:'6px'}}><div style={{width:'6px',height:'6px',borderRadius:'50%',backgroundColor:'#2962ff'}}/>Investing</span> <span style={{fontWeight: '500'}}>{formatCompactSpace(d.investing)} USD</span></div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}><span style={{display:'flex', alignItems:'center', gap:'6px'}}><div style={{width:'6px',height:'6px',borderRadius:'50%',backgroundColor:'#4db6ac'}}/>Financing</span> <span style={{fontWeight: '500'}}>{formatCompactSpace(d.financing)} USD</span></div>
                                            </>
                                        )}
                                    </div>
                                </foreignObject>
                            );
                        })()
                    )}
                </svg>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '12px', color: 'var(--tv-color-text-secondary, #787b86)', marginTop: '8px' }}>
                {chartType === 'income' && (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#2962ff' }}></div>Revenue</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#4dd0e1' }}></div>Net income</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ff9800' }}></div>Net margin %</div>
                    </>
                )}
                {chartType === 'balance' && (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#b388ff' }}></div>Total assets</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ffca28' }}></div>Total liabilities</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#64b5f6' }}></div>Liabilities to assets %</div>
                    </>
                )}
                {chartType === 'cashflow' && (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#e040fb' }}></div>Operating</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#2962ff' }}></div>Investing</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#4db6ac' }}></div>Financing</div>
                    </>
                )}
            </div>
        </div>
    );
};


// --- NATIVE REACT COMPONENT: Earnings Scatter Plot (Interactive) ---
const NativeEarnings = ({ profile, calculatedDays }) => {
    const [hoveredIdx, setHoveredIdx] = useState(null);
    const earningsData = profile?.earnings || [];
    if (earningsData.length === 0) return null;

    const badgeText = (calculatedDays !== undefined && calculatedDays !== null && calculatedDays >= 0) 
        ? calculatedDays 
        : null;

    const vals = [];
    earningsData.forEach(e => {
        if (e.actual !== null) vals.push(e.actual);
        if (e.estimate !== null) vals.push(e.estimate);
    });
    
    let min = vals.length > 0 ? Math.min(0, ...vals) : 0;
    let max = vals.length > 0 ? Math.max(0.1, ...vals) : 4;
    const padding = (max - min) * 0.2;
    max += padding;
    min -= padding / 2;

    const gridLines = [];
    for (let i = 0; i <= 4; i++) {
        gridLines.push(min + (max - min) * (i / 4));
    }

    const svgWidth = 400;
    const svgHeight = 210;
    const chartTop = 45;
    const chartBottom = 165;
    const chartLeft = 10;
    const chartRight = 360;

    const stepX = (chartRight - chartLeft) / Math.max(1, earningsData.length || 4);

    return (
        <div style={{ marginTop: '24px', borderTop: '1px solid var(--tv-color-border, #2a2e39)', paddingTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '14px' }}>Earnings</div>
                {badgeText !== null && (
                    <div style={{ background: 'transparent', border: '1px solid var(--tv-color-text-secondary, #787b86)', borderRadius: '6px', padding: '2px 8px', fontSize: '12px', color: 'var(--tv-color-text-primary, #e0e3eb)' }}>
                        {badgeText}
                    </div>
                )}
            </div>

            <div style={{ position: 'relative', width: '100%', height: 'auto', overflow: 'hidden' }}>
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} width="100%" height="100%" style={{ display: 'block' }}>
                    
                    {hoveredIdx !== null && (
                        <rect 
                            x={chartLeft + hoveredIdx * stepX} 
                            y={chartTop} 
                            width={stepX} 
                            height={chartBottom - chartTop} 
                            fill="rgba(255,255,255,0.04)" 
                            pointerEvents="none" 
                        />
                    )}

                    {gridLines.map((val, i) => {
                        const y = chartBottom - ((val - min) / (max - min)) * (chartBottom - chartTop);
                        return (
                            <g key={i}>
                                <line x1={chartLeft} y1={y} x2={chartRight} y2={y} stroke="var(--tv-color-border, #2a2e39)" strokeWidth="1" />
                                <text x={chartRight + 10} y={y + 4} fill="var(--tv-color-text-secondary, #787b86)" fontSize="11" fontFamily="sans-serif">{val.toFixed(2)}</text>
                            </g>
                        );
                    })}

                    {earningsData.map((e, i) => {
                        const x = chartLeft + (i + 0.5) * stepX;
                        const yActual = e.actual !== null ? chartBottom - ((e.actual - min) / (max - min)) * (chartBottom - chartTop) : null;
                        const yEstimate = e.estimate !== null ? chartBottom - ((e.estimate - min) / (max - min)) * (chartBottom - chartTop) : null;

                        return (
                            <g key={i}>
                                <text x={x} y={chartBottom + 20} fill="var(--tv-color-text-secondary, #787b86)" fontSize="11" fontFamily="sans-serif" textAnchor="middle">{e.period}</text>
                                
                                {yEstimate !== null && (
                                    <circle cx={x} cy={yEstimate} r={hoveredIdx === i ? 7 : 6} fill="transparent" stroke="var(--tv-color-text-secondary, #787b86)" strokeWidth="2" />
                                )}
                                {yActual !== null && (
                                    <circle cx={x} cy={yActual} r={hoveredIdx === i ? 7 : 6} fill="#57b39a" />
                                )}
                            </g>
                        );
                    })}

                    {earningsData.map((d, i) => (
                        <rect 
                            key={`hitbox-${i}`}
                            x={chartLeft + i * stepX}
                            y={chartTop}
                            width={stepX}
                            height={chartBottom - chartTop}
                            fill="transparent"
                            onMouseEnter={() => setHoveredIdx(i)}
                            onMouseLeave={() => setHoveredIdx(null)}
                            style={{ cursor: 'crosshair' }}
                        />
                    ))}

                    {hoveredIdx !== null && (
                        (() => {
                            const d = earningsData[hoveredIdx];
                            const tooltipWidth = 110;
                            const tooltipHeight = 38;
                            let ttX = chartLeft + (hoveredIdx + 0.5) * stepX - tooltipWidth / 2;
                            if (ttX < 10) ttX = 10;
                            if (ttX + tooltipWidth > svgWidth - 10) ttX = svgWidth - tooltipWidth - 10;
                            let ttY = 0;

                            return (
                                <foreignObject x={ttX} y={ttY} width={tooltipWidth} height={tooltipHeight} style={{ pointerEvents: 'none', zIndex: 100 }}>
                                    <div style={{ background: '#1e222d', border: '1px solid var(--tv-color-border, #2a2e39)', borderRadius: '4px', padding: '4px 6px', color: '#e0e3eb', fontSize: '9.5px', boxShadow: '0 4px 10px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', boxSizing: 'border-box', gap: '3px', whiteSpace: 'nowrap' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}><span style={{display:'flex', alignItems:'center', gap:'6px'}}><div style={{width:'6px',height:'6px',borderRadius:'50%',backgroundColor:'#57b39a'}}/>Actual</span> <span style={{fontWeight: '500'}}>{d.actual !== null ? d.actual.toFixed(2) : '--'}</span></div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}><span style={{display:'flex', alignItems:'center', gap:'6px'}}><div style={{width:'6px',height:'6px',borderRadius:'50%',border:'2px solid var(--tv-color-text-secondary, #787b86)'}}/>Estimate</span> <span style={{fontWeight: '500'}}>{d.estimate !== null ? d.estimate.toFixed(2) : '--'}</span></div>
                                    </div>
                                </foreignObject>
                            );
                        })()
                    )}
                </svg>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '12px', color: 'var(--tv-color-text-secondary, #787b86)', marginTop: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#57b39a' }}></div>
                    Actual
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', border: '2px solid var(--tv-color-text-secondary, #787b86)' }}></div>
                    Estimate
                </div>
            </div>
        </div>
    );
};


// --- NATIVE REACT COMPONENT: Dividends Widget ---
const NativeDividends = ({ profile }) => {
    const div = profile?.dividends;
    if (!div || (div.yieldTTM === null && div.payoutRatio === null && div.lastPayment === null)) return null;

    const payoutRatio = div.payoutRatio !== null ? div.payoutRatio : 0;
    const payoutPct = (payoutRatio * 100).toFixed(2);
    
    const size = 140; 
    const strokeWidth = 16;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const dashoffset = circumference - (Math.min(payoutRatio, 1) * circumference);

    return (
        <div style={{ marginTop: '24px', borderTop: '1px solid var(--tv-color-border, #2a2e39)', paddingTop: '16px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '24px' }}>Dividends</div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ position: 'relative', width: `${size}px`, height: `${size}px` }}>
                    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
                        <circle cx={size/2} cy={size/2} r={radius} fill="transparent" stroke="#434651" strokeWidth={strokeWidth} />
                        <circle 
                            cx={size/2} cy={size/2} r={radius} 
                            fill="transparent" stroke="#57b39a" strokeWidth={strokeWidth} 
                            strokeDasharray={circumference} strokeDashoffset={dashoffset} strokeLinecap="butt" transform={`rotate(-90 ${size/2} ${size/2})`}
                        />
                        <text x={size/2} y={size/2 + 6} fill="#57b39a" fontSize="18" fontWeight="bold" fontFamily="sans-serif" textAnchor="middle">
                            {div.payoutRatio !== null ? `${payoutPct}%` : '--'}
                        </text>
                    </svg>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '12px', color: 'var(--tv-color-text-secondary, #787b86)', marginTop: '16px', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#434651' }}></div>Earnings retained</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#57b39a' }}></div>Payout ratio (TTM)</div>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--tv-color-text-secondary, #787b86)' }}>Dividend yield TTM</span>
                    <span style={{ fontWeight: '500', color: 'var(--tv-color-text-primary, #e0e3eb)' }}>{div.yieldTTM !== null ? `${(div.yieldTTM * 100).toFixed(2)}%` : '--'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--tv-color-text-secondary, #787b86)' }}>Last payment</span>
                    <span style={{ fontWeight: '500', color: 'var(--tv-color-text-primary, #e0e3eb)' }}>{formatNum(div.lastPayment)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--tv-color-text-secondary, #787b86)' }}>Last ex-dividend date</span>
                    <span style={{ fontWeight: '500', color: 'var(--tv-color-text-primary, #e0e3eb)' }}>{div.exDividendDate || '--'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--tv-color-text-secondary, #787b86)' }}>Last payment date</span>
                    <span style={{ fontWeight: '500', color: 'var(--tv-color-text-primary, #e0e3eb)' }}>{div.paymentDate || '--'}</span>
                </div>
            </div>
        </div>
    );
};

// --- NATIVE REACT COMPONENT: Performance Widget ---
const NativePerformance = ({ profile }) => {
    const perf = profile?.performance;
    if (!perf) return null;

    const periods = [
        { label: '1W', value: perf['1W'] },
        { label: '1M', value: perf['1M'] },
        { label: '3M', value: perf['3M'] },
        { label: '6M', value: perf['6M'] },
        { label: 'YTD', value: perf['YTD'] },
        { label: '1Y', value: perf['1Y'] },
    ];

    if (periods.every(p => p.value === null || p.value === undefined)) return null;

    return (
        <div style={{ marginTop: '24px', borderTop: '1px solid var(--tv-color-border, #2a2e39)', paddingTop: '16px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '16px' }}>Performance</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {periods.map((p, i) => {
                    const val = p.value;
                    const isNull = val === null || val === undefined;
                    const isUp = !isNull && val >= 0;

                    let color = 'var(--tv-color-text-primary, #e0e3eb)';
                    let bgColor = 'var(--tv-color-popup-background, #1e222d)';
                    let valStr = '--';

                    if (!isNull) {
                        color = isUp ? '#089981' : '#f23645';
                        bgColor = isUp ? 'rgba(8, 153, 129, 0.1)' : 'rgba(242, 54, 69, 0.1)';
                        valStr = (isUp ? '+' : '') + val.toFixed(2) + '%';
                    }

                    return (
                        <div key={i} style={{ 
                            display: 'flex', 
                            flexDirection: 'column', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            padding: '10px 0', 
                            borderRadius: '6px', 
                            backgroundColor: bgColor 
                        }}>
                            <span style={{ color: color, fontWeight: '500', fontSize: '15px', marginBottom: '2px' }}>{valStr}</span>
                            <span style={{ color: 'var(--tv-color-text-secondary, #787b86)', fontSize: '12px' }}>{p.label}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// --- NATIVE REACT COMPONENT: Seasonals Line Chart (Interactive) ---
const NativeSeasonals = ({ profile }) => {
    const [hoverDay, setHoverDay] = useState(null);
    const data = profile?.seasonality; 
    if (!data || data.length === 0) return null;

    const minX = 0;
    const maxX = 365;

    let minY = 0;
    let maxY = 0;
    data.forEach(yr => {
        yr.data.forEach(pt => {
            if (pt.y < minY) minY = pt.y;
            if (pt.y > maxY) maxY = pt.y;
        });
    });

    const padding = (maxY - minY) * 0.1 || 5;
    maxY += padding;
    minY -= padding;

    const svgWidth = 400;
    const svgHeight = 220; 
    const chartTop = 50;   
    const chartBottom = 180;
    const chartLeft = 10;
    const chartRight = 360;

    const getX = (x) => chartLeft + (x / maxX) * (chartRight - chartLeft);
    const getY = (y) => chartBottom - ((y - minY) / (maxY - minY)) * (chartBottom - chartTop);
    const zeroY = getY(0);

    const colors = ['#2962ff', '#089981', '#ff9800']; 

    const paths = data.map((yr, idx) => {
        const pts = yr.data;
        if(pts.length === 0) return null;
        const dStr = pts.map((pt, i) => `${i===0?'M':'L'} ${getX(pt.x)} ${getY(pt.y)}`).join(" ");
        return {
            year: yr.year,
            color: colors[idx % colors.length],
            d: dStr,
            lastPt: pts[pts.length - 1],
            pts: pts
        };
    }).filter(Boolean);

    const months = [
        {label: 'Jan', day: 15}, {label: 'Apr', day: 105}, {label: 'Jul', day: 196}, {label: 'Oct', day: 288}
    ];

    const handleMouseMove = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const svgMouseX = (mouseX / rect.width) * svgWidth;
        let day = ((svgMouseX - chartLeft) / (chartRight - chartLeft)) * 365;
        day = Math.max(0, Math.min(365, Math.round(day)));
        setHoverDay(day);
    };

    const formatDayToDate = (dayOfYear) => {
        const d = new Date(2024, 0); 
        d.setDate(dayOfYear || 1);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    };

    let activePoints = [];
    if (hoverDay !== null) {
        activePoints = paths.map(p => {
            if (p.lastPt.x < hoverDay - 7) return null; 
            
            let closest = p.pts[0];
            let minDiff = Infinity;
            for (const pt of p.pts) {
                const diff = Math.abs(pt.x - hoverDay);
                if (diff < minDiff) {
                    minDiff = diff;
                    closest = pt;
                }
            }
            return { ...p, val: closest.y, ptX: closest.x };
        }).filter(Boolean);
    }

    return (
        <div style={{ marginTop: '24px', borderTop: '1px solid var(--tv-color-border, #2a2e39)', paddingTop: '16px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '8px' }}>Seasonals</div>

            <div style={{ position: 'relative', width: '100%', height: 'auto', overflow: 'hidden' }}>
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} width="100%" height="100%" style={{ display: 'block' }}>
                    
                    {months.map((m, i) => (
                        <g key={i}>
                            <line x1={getX(m.day)} y1={chartTop} x2={getX(m.day)} y2={chartBottom} stroke="var(--tv-color-border, #2a2e39)" strokeWidth="1" strokeDasharray="4 4" />
                            <text x={getX(m.day)} y={chartBottom + 20} fill="var(--tv-color-text-secondary, #787b86)" fontSize="11" fontFamily="sans-serif" textAnchor="middle">{m.label}</text>
                        </g>
                    ))}

                    <line x1={chartLeft} y1={zeroY} x2={chartRight} y2={zeroY} stroke="var(--tv-color-border, #2a2e39)" strokeWidth="1" />

                    {paths.map(p => (
                        <g key={p.year}>
                            <path d={p.d} fill="none" stroke={p.color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
                        </g>
                    ))}

                    {hoverDay !== null && activePoints.length > 0 && (
                        <>
                            <line x1={getX(hoverDay)} y1={chartTop} x2={getX(hoverDay)} y2={chartBottom} stroke="var(--tv-color-text-secondary, #787b86)" strokeWidth="1" />
                            
                            <text x={getX(hoverDay)} y={chartBottom + 20} fill="var(--tv-color-text-primary, #e0e3eb)" fontSize="11" fontFamily="sans-serif" textAnchor="middle" fontWeight="bold">
                                {formatDayToDate(hoverDay)}
                            </text>

                            {activePoints.map(pt => (
                                <circle key={pt.year} cx={getX(pt.ptX)} cy={getY(pt.val)} r="4" fill={pt.color} stroke="#1e222d" strokeWidth="2" />
                            ))}

                            {(() => {
                                const tooltipWidth = 100;
                                const tooltipHeight = activePoints.length * 16 + 12;
                                let ttX = getX(hoverDay) - tooltipWidth / 2;
                                if (ttX < 10) ttX = 10;
                                if (ttX + tooltipWidth > svgWidth - 10) ttX = svgWidth - tooltipWidth - 10;
                                let ttY = 0;

                                return (
                                    <foreignObject x={ttX} y={ttY} width={tooltipWidth} height={tooltipHeight} style={{ pointerEvents: 'none', zIndex: 100 }}>
                                        <div style={{ background: '#1e222d', border: '1px solid var(--tv-color-border, #2a2e39)', borderRadius: '4px', padding: '4px 6px', color: '#e0e3eb', fontSize: '9.5px', boxShadow: '0 4px 10px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', boxSizing: 'border-box', gap: '3px', whiteSpace: 'nowrap' }}>
                                            {activePoints.map(pt => (
                                                <div key={pt.year} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                                    <span style={{display:'flex', alignItems:'center', gap:'6px'}}>
                                                        <div style={{width:'6px',height:'6px',borderRadius:'50%',backgroundColor: pt.color}}/>
                                                        {pt.year}
                                                    </span> 
                                                    <span style={{fontWeight: '500'}}>{pt.val.toFixed(2)}%</span>
                                                </div>
                                            ))}
                                        </div>
                                    </foreignObject>
                                );
                            })()}
                        </>
                    )}

                    <rect 
                        x={chartLeft} y={0} width={chartRight - chartLeft} height={svgHeight} 
                        fill="transparent" 
                        onMouseMove={handleMouseMove} 
                        onMouseLeave={() => setHoverDay(null)} 
                        style={{ cursor: 'crosshair' }} 
                    />
                </svg>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '12px', color: 'var(--tv-color-text-secondary, #787b86)', marginTop: '8px' }}>
                {paths.map(p => (
                    <div key={p.year} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: p.color }}></div>
                        {p.year}
                    </div>
                ))}
            </div>
        </div>
    );
}

// --- NATIVE REACT COMPONENT: Technical Analysis Gauge ---
const NativeTechnicals = ({ profile }) => {
  const tech = profile?.technicals;
  if (!tech) return null;

  const signal = tech.signal || 'NEUTRAL';
  
  const rotationMap = { 'STRONG SELL': -75, 'SELL': -35, 'NEUTRAL': 0, 'BUY': 35, 'STRONG BUY': 75 };
  const rotateDeg = rotationMap[signal] || 0;
  
  const colorMap = { 'STRONG SELL': '#f23645', 'SELL': '#ff9800', 'NEUTRAL': '#787b86', 'BUY': '#089981', 'STRONG BUY': '#089981' };

  return (
    <div style={{ marginTop: '24px', borderTop: '1px solid var(--tv-color-border, #2a2e39)', paddingTop: '16px', paddingBottom: '8px' }}>
      <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
        <span>Technicals</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: '280px', height: '140px', overflow: 'visible' }}>
            <svg viewBox="-10 0 260 140" width="100%" height="100%" style={{ overflow: 'visible' }}>
                
                {/* Background Arc */}
                <path d="M 50 100 A 70 70 0 0 1 190 100" fill="none" stroke="#434651" strokeWidth="4" />
                
                {/* Segment Arcs */}
                <path d="M 50 100 A 70 70 0 0 1 190 100" fill="none" stroke={colorMap[signal]} strokeWidth="6" strokeDasharray="43.98 220" strokeDashoffset={
                    signal === 'STRONG SELL' ? 0 :
                    signal === 'SELL' ? -43.98 :
                    signal === 'NEUTRAL' ? -87.96 :
                    signal === 'BUY' ? -131.94 : -175.92
                } />

                {/* Curved Labels */}
                <text x="35" y="90" textAnchor="end" fontSize="11" fill={signal === 'STRONG SELL' ? '#e0e3eb' : 'var(--tv-color-text-secondary, #787b86)'} fontFamily="sans-serif">Strong sell</text>
                <text x="70" y="35" textAnchor="end" fontSize="11" fill={signal === 'SELL' ? '#e0e3eb' : 'var(--tv-color-text-secondary, #787b86)'} fontFamily="sans-serif">Sell</text>
                <text x="120" y="15" textAnchor="middle" fontSize="11" fill={signal === 'NEUTRAL' ? '#e0e3eb' : 'var(--tv-color-text-secondary, #787b86)'} fontFamily="sans-serif">Neutral</text>
                <text x="170" y="35" textAnchor="start" fontSize="11" fill={signal === 'BUY' ? '#e0e3eb' : 'var(--tv-color-text-secondary, #787b86)'} fontFamily="sans-serif">Buy</text>
                <text x="205" y="90" textAnchor="start" fontSize="11" fill={signal === 'STRONG BUY' ? '#e0e3eb' : 'var(--tv-color-text-secondary, #787b86)'} fontFamily="sans-serif">Strong buy</text>

                {/* Needle */}
                <g style={{ transform: `rotate(${rotateDeg}deg)`, transformOrigin: '120px 100px', transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }}>
                    <line x1="120" y1="100" x2="120" y2="40" stroke="#e0e3eb" strokeWidth="2" strokeLinecap="round" />
                    <circle cx="120" cy="100" r="4" fill="#e0e3eb" />
                </g>

                {/* Main Value */}
                <text x="120" y="130" fill={colorMap[signal]} fontSize="16" fontWeight="bold" fontFamily="sans-serif" textAnchor="middle">
                    {signal === 'STRONG SELL' ? 'Strong sell' : signal === 'SELL' ? 'Sell' : signal === 'NEUTRAL' ? 'Neutral' : signal === 'BUY' ? 'Buy' : 'Strong buy'}
                </text>
            </svg>
        </div>
      </div>
    </div>
  );
};


// --- NATIVE REACT COMPONENT: Analyst Ratings Bow ---
const NativeAnalystsBow = ({ profile, currentPrice }) => {
    const ratings = profile?.analyst_ratings;
    if (!ratings || ratings.total_analysts === 0) return null;

    const breakdown = ratings.breakdown;
    const total = ratings.total_analysts;
    const score = ratings.consensus_score || 3.0;
    const recText = ratings.consensus_text || 'Neutral';
    const targetPrice = ratings.target_price || profile?.targetPrice;

    const colors = {
        strong_buy: '#089981',
        buy: '#26a69a',
        hold: '#787b86',
        sell: '#ff9800',
        strong_sell: '#f23645'
    };

    // Calculate rotation mapping score [1, 5] -> [-90, 90] degrees
    const pct = Math.max(0, Math.min(1, (score - 1) / 4));
    const rotateDeg = (pct * 180) - 90;

    let consensusColor = 'var(--tv-color-text-primary, #e0e3eb)';
    const recUpper = recText.toUpperCase();
    if (recUpper.includes('STRONG BUY')) consensusColor = colors.strong_buy;
    else if (recUpper.includes('BUY')) consensusColor = colors.buy;
    else if (recUpper.includes('STRONG SELL')) consensusColor = colors.strong_sell;
    else if (recUpper.includes('SELL')) consensusColor = colors.sell;
    else consensusColor = colors.hold;

    const rows = [
        { label: 'Strong buy', count: breakdown.strong_buy, color: colors.strong_buy },
        { label: 'Buy', count: breakdown.buy, color: colors.buy },
        { label: 'Hold', count: breakdown.hold, color: colors.hold },
        { label: 'Sell', count: breakdown.sell, color: colors.sell },
        { label: 'Strong sell', count: breakdown.strong_sell, color: colors.strong_sell }
    ];

    // Price Target Formatting
    let targetPctStr = '';
    let targetColor = 'var(--tv-color-text-primary)';
    if (targetPrice && currentPrice) {
        const targetPct = ((targetPrice - currentPrice) / currentPrice) * 100;
        const isUp = targetPct >= 0;
        targetColor = isUp ? '#089981' : '#f23645';
        targetPctStr = `(${isUp ? '+' : ''}${targetPct.toFixed(2)}%)`;
    }

    const arcLen = Math.PI * 80; 
    const dashOffset = arcLen - (pct * arcLen);

    return (
        <div style={{ marginTop: '24px', borderTop: '1px solid var(--tv-color-border, #2a2e39)', paddingTop: '16px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '24px' }}>Analyst Rating</div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '16px' }}>
                
                {/* Left Side: TV Style Gradient Gauge */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ position: 'relative', width: '160px', height: '90px' }}>
                        <svg viewBox="-30 0 260 110" width="100%" height="100%" style={{ overflow: 'visible' }}>
                            <defs>
                                <linearGradient id="ratingGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#f23645" />
                                    <stop offset="25%" stopColor="#ff9800" />
                                    <stop offset="50%" stopColor="#787b86" />
                                    <stop offset="75%" stopColor="#26a69a" />
                                    <stop offset="100%" stopColor="#089981" />
                                </linearGradient>
                            </defs>
                            
                            {/* Background Arc */}
                            <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#434651" strokeWidth="8" strokeLinecap="round" />
                            
                            {/* Foreground Gradient Arc */}
                            <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="url(#ratingGradient)" strokeWidth="8" strokeLinecap="round" strokeDasharray={arcLen} strokeDashoffset={dashOffset} />

                            {/* Outer Labels */}
                            <text x="10" y="95" textAnchor="end" fontSize="11" fill="var(--tv-color-text-secondary, #787b86)" fontFamily="sans-serif">Strong sell</text>
                            <text x="45" y="35" textAnchor="end" fontSize="11" fill="var(--tv-color-text-secondary, #787b86)" fontFamily="sans-serif">Sell</text>
                            <text x="100" y="10" textAnchor="middle" fontSize="11" fill="var(--tv-color-text-secondary, #787b86)" fontFamily="sans-serif">Neutral</text>
                            <text x="155" y="35" textAnchor="start" fontSize="11" fill="var(--tv-color-text-secondary, #787b86)" fontFamily="sans-serif">Buy</text>
                            <text x="190" y="95" textAnchor="start" fontSize="11" fill="var(--tv-color-text-secondary, #787b86)" fontFamily="sans-serif">Strong buy</text>

                            {/* Animated Needle */}
                            <g style={{ transform: `rotate(${rotateDeg}deg)`, transformOrigin: '100px 100px', transition: 'transform 0.5s ease-out' }}>
                                <line x1="100" y1="100" x2="100" y2="35" stroke="#e0e3eb" strokeWidth="2" strokeLinecap="round" />
                                <circle cx="100" cy="100" r="4" fill="#e0e3eb" />
                            </g>
                        </svg>
                    </div>
                    <div style={{ textAlign: 'center', marginTop: '0px' }}>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--tv-color-text-primary, #e0e3eb)', marginTop: '4px' }}>{recText}</div>
                    </div>
                </div>

                {/* Right Side: Horizontal Bar Breakdown */}
                <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {rows.map((r, i) => {
                        const rowPct = total > 0 ? (r.count / total) * 100 : 0;
                        return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', fontSize: '11px', color: 'var(--tv-color-text-secondary, #787b86)' }}>
                                <div style={{ width: '65px', flexShrink: 0 }}>{r.label}</div>
                                <div style={{ flex: 1, height: '6px', background: 'var(--tv-color-popup-background, #1e222d)', borderRadius: '3px', overflow: 'hidden', margin: '0 8px' }}>
                                    <div style={{ width: `${rowPct}%`, height: '100%', background: r.color, borderRadius: '3px', transition: 'width 0.5s ease-out' }} />
                                </div>
                                <div style={{ width: '16px', textAlign: 'right', color: 'var(--tv-color-text-primary, #e0e3eb)' }}>{r.count}</div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 1 Year Price Target exactly like TradingView (No border top here to merge seamlessly) */}
            {targetPrice && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--tv-color-text-secondary, #787b86)' }}>1 year price target</span>
                    <div style={{ fontSize: '14px' }}>
                        <span style={{ fontWeight: 'bold', color: 'var(--tv-color-text-primary, #e0e3eb)', marginRight: '6px' }}>{formatNum(targetPrice)}</span>
                        <span style={{ color: targetColor, fontWeight: '500' }}>{targetPctStr}</span>
                    </div>
                </div>
            )}
        </div>
    );
};


// --- NATIVE REACT COMPONENT: Live News Timeline ---
const NativeNews = ({ profile }) => {
    if (!profile || !profile.news || profile.news.length === 0) return null;
    return (
      <div style={{ marginTop: '24px', borderTop: '1px solid var(--tv-color-border, #2a2e39)', paddingTop: '16px', paddingBottom: '24px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '16px' }}>Top Stories</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {profile.news.map((item, idx) => {
                  let displayDate = item.date;
                  try {
                      const d = new Date(item.date);
                      displayDate = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                  } catch (e) {}

                  return (
                      <a 
                        key={idx} 
                        href={item.link} 
                        target="_blank" 
                        rel="noreferrer"
                        style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', gap: '4px' }}
                      >
                          <span style={{ fontSize: '13px', color: '#2962ff', lineHeight: '1.4' }}>{item.title}</span>
                          <span style={{ fontSize: '11px', color: 'var(--tv-color-text-secondary, #787b86)' }}>{displayDate}</span>
                      </a>
                  );
              })}
          </div>
      </div>
    );
};


// --- Unified Symbol Profile ---
const SymbolProfile = ({ symbol, liveQuote, isClosed }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    if (!symbol) return;
    setLoading(true);
    setExpanded(false);
    
    fetch(`${API_BASE}/ib/profile/${symbol}`)
      .then(res => res.json())
      .then(data => {
        if (active && data.status === 'OK') setProfile(data.profile);
        else if (active) setProfile(null);
        if (active) setLoading(false);
      })
      .catch(() => {
        if (active) { setProfile(null); setLoading(false); }
      });
      
    return () => { active = false; };
  }, [symbol]);

  const companyName = profile?.companyName || symbol;
  const exchange = profile?.exchange || '--';
  const sector = profile?.sector || '--';
  const industry = profile?.industry || '--';
  const summary = profile?.summary && profile.summary !== '--' ? profile.summary : 'No description available.';

  let displayLast = null;
  let displayPrev = null;

  if (liveQuote) {
      if (isClosed) {
          displayLast = liveQuote.rth_close != null ? liveQuote.rth_close : liveQuote.close;
          displayPrev = liveQuote.prev_close;
      } else {
          displayLast = liveQuote.close;
          displayPrev = liveQuote.rth_close != null ? liveQuote.rth_close : liveQuote.prev_close;
      }
  }
  
  let chg = null;
  let chgPct = null;
  if (displayLast != null && displayPrev != null && displayPrev > 0) {
     chg = displayLast - displayPrev;
     chgPct = (chg / displayPrev) * 100;
  } else if (displayLast != null && liveQuote?.open != null && liveQuote.open > 0) {
     chg = displayLast - liveQuote.open;
     chgPct = (chg / liveQuote.open) * 100;
  }

  const isUp = chg >= 0;
  const color = isUp ? '#089981' : '#f23645';

  let mktCap = formatCompact(profile?.marketCap);
  if (mktCap === '--' && profile?.sharesOut && displayLast) {
      mktCap = formatCompact(profile.sharesOut * displayLast);
  }

  let nextEarningsDisplay = '--';
  if (profile?.nextEarningsDate) {
      if (profile?.nextEarningsDays !== undefined && profile?.nextEarningsDays !== null && profile.nextEarningsDays >= 0) {
          nextEarningsDisplay = `${profile.nextEarningsDate} (${profile.nextEarningsDays} more days)`;
      } else {
          nextEarningsDisplay = profile.nextEarningsDate;
      }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', paddingRight: '8px', paddingLeft: '4px' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <div className="symbol-search-icon" style={{ width: 24, height: 24, fontSize: 12 }}>{symbol.charAt(0)}</div>
            <span style={{ fontWeight: 'bold', fontSize: '16px' }}>{symbol}</span>
        </div>

        <div style={{ fontSize: '12px', color: 'var(--tv-color-text-secondary, #787b86)', marginBottom: '12px' }}>
            <div>{companyName} • {exchange}</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '16px' }}>
            <span style={{ fontSize: '28px', fontWeight: 'bold' }}>{displayLast != null ? displayLast.toFixed(2) : '--'}</span>
            <span style={{ fontSize: '12px', color: 'var(--tv-color-text-secondary, #787b86)' }}>USD</span>
            <span style={{ fontSize: '16px', color, marginLeft: '4px', fontWeight: '500' }}>{chg != null ? (chg > 0 ? `+${chg.toFixed(2)}` : chg.toFixed(2)) : ''}</span>
            <span style={{ fontSize: '16px', color, fontWeight: '500' }}>{chgPct != null ? (chgPct > 0 ? `+${chgPct.toFixed(2)}%` : `${chgPct.toFixed(2)}%`) : ''}</span>
        </div>

        <div style={{ marginBottom: '16px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '12px' }}>Key stats</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '10px' }}>
                <span style={{ color: 'var(--tv-color-text-secondary, #787b86)' }}>Next earnings report</span>
                <span style={{ fontWeight: '500' }}>{nextEarningsDisplay}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '10px' }}>
                <span style={{ color: 'var(--tv-color-text-secondary, #787b86)' }}>Volume</span>
                <span style={{ fontWeight: '500' }}>{formatCompact(profile?.volume)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '10px' }}>
                <span style={{ color: 'var(--tv-color-text-secondary, #787b86)' }}>Average Volume (30D)</span>
                <span style={{ fontWeight: '500' }}>{formatCompact(profile?.avgVolume)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '10px' }}>
                <span style={{ color: 'var(--tv-color-text-secondary, #787b86)' }}>Market capitalization</span>
                <span style={{ fontWeight: '500' }}>{mktCap}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '10px' }}>
                <span style={{ color: 'var(--tv-color-text-secondary, #787b86)' }}>Dividend yield (indicated)</span>
                <span style={{ fontWeight: '500' }}>{profile?.dividendYield ? formatNum(profile.dividendYield) + '%' : '--'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '10px' }}>
                <span style={{ color: 'var(--tv-color-text-secondary, #787b86)' }}>Price to earnings Ratio (TTM)</span>
                <span style={{ fontWeight: '500' }}>{formatNum(profile?.pe)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '10px' }}>
                <span style={{ color: 'var(--tv-color-text-secondary, #787b86)' }}>Basic EPS (TTM)</span>
                <span style={{ fontWeight: '500' }}>{formatNum(profile?.eps)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '10px' }}>
                <span style={{ color: 'var(--tv-color-text-secondary, #787b86)' }}>Shares float</span>
                <span style={{ fontWeight: '500' }}>{formatCompact(profile?.floatShares)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '10px' }}>
                <span style={{ color: 'var(--tv-color-text-secondary, #787b86)' }}>Beta (1Y)</span>
                <span style={{ fontWeight: '500' }}>{formatNum(profile?.beta)}</span>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '10px' }}>
                <span style={{ color: 'var(--tv-color-text-secondary, #787b86)' }}>Revenue (TTM)</span>
                <span style={{ fontWeight: '500' }}>{formatCompact(profile?.revenue)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '10px' }}>
                <span style={{ color: 'var(--tv-color-text-secondary, #787b86)' }}>52-Week High</span>
                <span style={{ fontWeight: '500' }}>{formatNum(profile?.high52)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                <span style={{ color: 'var(--tv-color-text-secondary, #787b86)' }}>52-Week Low</span>
                <span style={{ fontWeight: '500' }}>{formatNum(profile?.low52)}</span>
            </div>
        </div>

        <NativeEarnings profile={profile} calculatedDays={profile?.nextEarningsDays} />
        <NativeDividends profile={profile} />
        <NativeFinancials profile={profile} />
        <NativePerformance profile={profile} />
        <NativeSeasonals profile={profile} />
        <NativeTechnicals profile={profile} />
        
        {/* --- NATIVE ANALYSTS GAUGE --- */}
        <NativeAnalystsBow profile={profile} currentPrice={displayLast} />

        {/* Expandable Biography & Tags */}
        <div style={{ marginTop: '16px', borderTop: '1px solid var(--tv-color-border, #2a2e39)', paddingTop: '16px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '8px' }}>Profile</div>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                {sector && sector !== '--' && <span style={{ background: 'var(--tv-color-border, #2a2e39)', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', color: '#fff' }}>{sector}</span>}
                {industry && industry !== '--' && <span style={{ background: 'var(--tv-color-border, #2a2e39)', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', color: '#fff' }}>{industry}</span>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                <span style={{ color: 'var(--tv-color-text-secondary, #787b86)' }}>Employees</span>
                <span style={{ fontWeight: '500' }}>{formatCompact(profile?.employees)}</span>
            </div>
            <div style={{ 
                fontSize: '13px', 
                color: 'var(--tv-color-text-primary, #e0e3eb)', 
                lineHeight: '1.5', 
                overflow: 'hidden', 
                textOverflow: 'ellipsis', 
                display: '-webkit-box', 
                WebkitLineClamp: expanded ? 'unset' : 4, 
                WebkitBoxOrient: 'vertical' 
            }}>
                {summary}
            </div>
            {summary && summary !== 'No description available.' && (
                <div style={{ textAlign: 'center', marginTop: '8px', marginBottom: '12px' }}>
                    <button 
                        onClick={() => setExpanded(!expanded)} 
                        style={{ background: 'transparent', color: '#2962ff', border: 'none', cursor: 'pointer', fontSize: '12px' }}
                    >
                        {expanded ? 'Show Less' : 'Read More'}
                    </button>
                </div>
            )}
        </div>

        <NativeNews profile={profile} />

    </div>
  );
}


// --- MAIN WATCHLIST PANEL ---
export default function WatchlistPanel() {
  const { 
    watchlists, selectedListId, fetchWatchlists, setSelectedList, 
    createWatchlist, updateWatchlistName, deleteWatchlist, 
    addSymbol, removeSymbol, reorderSymbols, loading
  } = useWatchlistStore();
  
  const setSymbol = useChartStore((s) => s.setSymbol);
  const activeChartSymbol = useChartStore((s) => s.symbol); 
  const reloadChart = useChartStore((s) => s.reloadChart);
  const subscribeMultiple = useStatusStore((s) => s.subscribeMultiple);
  
  const marketSession = useStatusStore((s) => s.marketStatus?.session || 'open');
  const isClosed = marketSession !== 'open';
  
  const [newListName, setNewListName] = useState('');
  const [draggedItemIndex, setDraggedItemIndex] = useState(null);

  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');

  const [newSymbol, setNewSymbol] = useState('');
  const [matches, setMatches] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const [liveQuotes, setLiveQuotes] = useState({});
  const [profileHeight, setProfileHeight] = useState(450);

  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const debouncedQuery = useDebounce(newSymbol, 300);

  useEffect(() => {
    fetchWatchlists();
  }, [fetchWatchlists]);

  const activeList = watchlists.find(w => w.id === selectedListId);

  useEffect(() => {
    const handleBarUpdate = (e) => {
      const { symbol, bar } = e.detail;
      setLiveQuotes(prev => ({
        ...prev,
        [symbol]: bar
      }));
    };
    window.addEventListener('liveBarUpdate', handleBarUpdate);
    return () => window.removeEventListener('liveBarUpdate', handleBarUpdate);
  }, []);

  useEffect(() => {
    if (activeList && activeList.items.length > 0) {
      subscribeMultiple(activeList.items.map(i => i.symbol));
    }
  }, [activeList, subscribeMultiple]);

  const handleProfileResize = useCallback((e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = profileHeight;

    const handleMouseMove = (moveEvent) => {
      const deltaY = startY - moveEvent.clientY;
      setProfileHeight(Math.max(150, Math.min(window.innerHeight - 250, startHeight + deltaY)));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [profileHeight]);


  const handleAddList = (e) => {
    e.preventDefault();
    if (newListName.trim()) {
      createWatchlist(newListName.trim());
      setNewListName('');
    }
  };

  const handleStartEdit = () => {
    if (activeList) {
      setEditNameValue(activeList.name);
      setIsEditingName(true);
    }
  };

  const handleSaveEdit = () => {
    if (activeList && editNameValue.trim() && editNameValue.trim() !== activeList.name) {
      updateWatchlistName(activeList.id, editNameValue.trim());
    }
    setIsEditingName(false);
  };

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter') handleSaveEdit();
    if (e.key === 'Escape') setIsEditingName(false);
  };

  useEffect(() => {
    let isCancelled = false;

    const searchSymbols = async () => {
      if (!debouncedQuery || debouncedQuery.length < 1) {
        setMatches([]);
        setIsOpen(false);
        return;
      }
      
      setSearchLoading(true);
      try {
        const { mode } = useStatusStore.getState();
        const res = await fetch(`${API_BASE}/ib/symbol_search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: debouncedQuery, max_results: 10, mode: mode })
        });
        const data = await res.json();
        
        if (isCancelled) return;
        
        if (data.status === 'OK' && data.matches) {
          const filtered = data.matches.filter(m => m.symbol && m.symbol.trim() !== '');
          const unique = filtered.reduce((acc, curr) => {
            const key = `${curr.symbol}-${curr.exchange}`;
            if (!acc.find(m => `${m.symbol}-${m.exchange}` === key)) acc.push(curr);
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
        if (!isCancelled) setSearchLoading(false);
      }
    };
    
    searchSymbols();
    return () => { isCancelled = true; };
  }, [debouncedQuery]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
          inputRef.current && !inputRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectSymbol = useCallback((match) => {
    if (activeList) {
      addSymbol(activeList.id, match.symbol);
    }
    setNewSymbol('');
    setIsOpen(false);
    setMatches([]);
    inputRef.current?.blur();
  }, [activeList, addSymbol]);

  const handleSearchKeyDown = (e) => {
    if (!isOpen || matches.length === 0) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (newSymbol.trim() && activeList) {
          addSymbol(activeList.id, newSymbol.trim().toUpperCase());
          setNewSymbol('');
        }
        setIsOpen(false);
        inputRef.current?.blur();
      }
      return;
    }
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => prev < matches.length - 1 ? prev + 1 : prev);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && matches[selectedIndex]) {
          handleSelectSymbol(matches[selectedIndex]);
        } else if (newSymbol.trim() && activeList) {
          addSymbol(activeList.id, newSymbol.trim().toUpperCase());
          setNewSymbol('');
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

  const handleSymbolClick = (symbol) => {
    setSymbol(symbol);
    reloadChart();
  };

  const onDragStart = (e, index) => {
    setDraggedItemIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragOver = (e, index) => {
    e.preventDefault(); 
  };

  const onDrop = (e, dropIndex) => {
    e.preventDefault();
    if (draggedItemIndex === null || draggedItemIndex === dropIndex) return;

    const newItems = Array.from(activeList.items);
    const [draggedItem] = newItems.splice(draggedItemIndex, 1);
    newItems.splice(dropIndex, 0, draggedItem);
    
    reorderSymbols(activeList.id, newItems);
    setDraggedItemIndex(null);
  };

  if (loading && watchlists.length === 0) {
    return <div className="panel-loading"><div className="spinner" /><span>Loading watchlists...</span></div>;
  }

  return (
    <div className="watchlist-panel" style={{ padding: '16px', color: 'var(--tv-color-text-primary, #e0e3eb)', display: 'flex', flexDirection: 'column', height: '100%' }}>
      
      {/* Top Watchlist Controls */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center', flexShrink: 0 }}>
        {isEditingName ? (
          <div style={{ display: 'flex', flex: 1, gap: '6px' }}>
            <input 
              autoFocus
              type="text" 
              className="tv-input"
              value={editNameValue} 
              onChange={(e) => setEditNameValue(e.target.value)}
              onKeyDown={handleEditKeyDown}
              style={{ flex: 1, padding: '6px', borderRadius: '4px' }}
            />
            <button onClick={handleSaveEdit} style={{ background: '#089981', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer' }}>✓</button>
            <button onClick={() => setIsEditingName(false)} style={{ background: '#f23645', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer' }}>✕</button>
          </div>
        ) : (
          <>
            <select 
              className="tv-select"
              value={selectedListId || ''} 
              onChange={(e) => setSelectedList(e.target.value)}
              style={{ flex: 1, padding: '6px', borderRadius: '4px' }}
            >
              {watchlists.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            {activeList && (
              <>
                <button 
                  onClick={handleStartEdit}
                  style={{ background: 'var(--tv-color-border, #2a2e39)', color: 'var(--tv-color-text-primary, #e0e3eb)', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer' }}
                  title="Rename Watchlist"
                >
                  ✎
                </button>
                <button 
                  onClick={() => deleteWatchlist(activeList.id)}
                  style={{ background: '#f23645', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer' }}
                  title="Delete Watchlist"
                >
                  ✕
                </button>
              </>
            )}
          </>
        )}
      </div>

      {/* Auto-Complete */}
      {activeList && (
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', position: 'relative', flexShrink: 0 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <input 
              ref={inputRef}
              type="text" 
              className="tv-input"
              value={newSymbol} 
              onChange={(e) => setNewSymbol(e.target.value.toUpperCase())} 
              onKeyDown={handleSearchKeyDown}
              onFocus={() => { if (matches.length > 0) setIsOpen(true); }}
              placeholder="Add Symbol (e.g. AAPL)"
              style={{ width: '100%', padding: '6px', borderRadius: '4px', textTransform: 'uppercase', boxSizing: 'border-box' }}
              autoComplete="off"
              spellCheck="false"
            />
            {searchLoading && (
              <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)' }}>
                <div className="spinner-small" />
              </div>
            )}
            {isOpen && matches.length > 0 && (
              <div ref={dropdownRef} className="symbol-search-dropdown" style={{ top: '100%', left: 0, width: '100%', zIndex: 100, marginTop: '4px' }}>
                {matches.map((match, index) => (
                  <div
                    key={`${match.symbol}-${match.exchange}-${index}`}
                    className={`symbol-search-item ${index === selectedIndex ? 'selected' : ''}`}
                    onClick={() => handleSelectSymbol(match)}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
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
          <button 
            onClick={() => {
              if (newSymbol.trim() && activeList) {
                addSymbol(activeList.id, newSymbol.trim().toUpperCase());
                setNewSymbol('');
                setIsOpen(false);
              }
            }} 
            style={{ background: '#089981', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}
          >
            Add
          </button>
        </div>
      )}

      {/* Main Watchlist Table */}
      {activeList && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          
          <div style={{ 
            display: 'flex', 
            padding: '4px 10px', 
            fontSize: '11px', 
            color: 'var(--tv-color-text-secondary, #787b86)', 
            borderBottom: '1px solid var(--tv-color-border, #2a2e39)', 
            marginBottom: '4px' 
          }}>
            <div style={{ flex: 1.5 }}>Symbol</div>
            <div style={{ flex: 1, textAlign: 'right' }}>Last</div>
            <div style={{ flex: 1, textAlign: 'right' }}>Chg</div>
            <div style={{ flex: 1, textAlign: 'right' }}>Chg%</div>
            <div style={{ width: '20px' }}></div>
          </div>

          <div className="watchlist-items" style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
            {activeList.items.length === 0 ? (
               <div style={{ textAlign: 'center', opacity: 0.5, marginTop: '20px' }}>No symbols in this watchlist.</div>
            ) : (
              activeList.items.map((item, index) => {
                
                const quote = liveQuotes[item.symbol];
                
                let displayLast = null;
                let displayPrev = null;

                if (quote) {
                    if (isClosed) {
                        displayLast = quote.rth_close != null ? quote.rth_close : quote.close;
                        displayPrev = quote.prev_close;
                    } else {
                        displayLast = quote.close;
                        displayPrev = quote.rth_close != null ? quote.rth_close : quote.prev_close;
                    }
                }
                
                let chg = null;
                let chgPct = null;
                
                if (displayLast != null && displayPrev != null && displayPrev > 0) {
                   chg = displayLast - displayPrev;
                   chgPct = (chg / displayPrev) * 100;
                } else if (displayLast != null && quote?.open != null && quote.open > 0) {
                   chg = displayLast - quote.open;
                   chgPct = (chg / quote.open) * 100;
                }

                const isUp = chg >= 0;
                const color = isUp ? '#089981' : '#f23645';

                return (
                  <div 
                    key={item.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, index)}
                    onDragOver={(e) => onDragOver(e, index)}
                    onDrop={(e) => onDrop(e, index)}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center',
                      padding: '6px 10px', 
                      background: 'var(--tv-color-popup-background, #1e222d)', 
                      borderBottom: '1px solid var(--tv-color-border, #2a2e39)',
                      cursor: 'pointer',
                      transition: 'background 0.2s ease',
                      color: 'var(--tv-color-text-primary, #e0e3eb)',
                      fontSize: '13px'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--tv-color-border, #2a2e39)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'var(--tv-color-popup-background, #1e222d)'}
                    onClick={() => handleSymbolClick(item.symbol)} 
                  >
                    
                    <div style={{ flex: 1.5, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ cursor: 'grab', color: 'var(--tv-color-text-secondary, #787b86)', fontSize: '14px', width: '12px' }}>☰</span>
                      {item.symbol}
                    </div>
                    
                    <div style={{ flex: 1, textAlign: 'right' }}>
                      {displayLast != null ? displayLast.toFixed(2) : '--'}
                    </div>
                    
                    <div style={{ flex: 1, textAlign: 'right', color: chg != null ? color : 'inherit' }}>
                      {chg != null ? (chg > 0 ? `+${chg.toFixed(2)}` : chg.toFixed(2)) : '--'}
                    </div>

                    <div style={{ flex: 1, textAlign: 'right', color: chgPct != null ? color : 'inherit' }}>
                      {chgPct != null ? (chgPct > 0 ? `+${chgPct.toFixed(2)}%` : `${chgPct.toFixed(2)}%`) : '--'}
                    </div>

                    <div style={{ width: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                      <button 
                        onClick={(e) => { e.stopPropagation(); removeSymbol(activeList.id, item.id); }}
                        style={{ background: 'transparent', color: '#f23645', border: 'none', cursor: 'pointer', padding: '0 4px', fontSize: '12px' }}
                        title="Remove Symbol"
                      >
                        ✕
                      </button>
                    </div>

                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* The Vertical Resizer Handle */}
      {activeChartSymbol && (
        <div
          onMouseDown={handleProfileResize}
          onMouseEnter={(e) => {
              e.currentTarget.querySelector('.resizer-line').style.background = '#2962ff';
              e.currentTarget.querySelector('.resizer-handle').style.background = '#2962ff';
          }}
          onMouseLeave={(e) => {
              e.currentTarget.querySelector('.resizer-line').style.background = 'var(--tv-color-border, #2a2e39)';
              e.currentTarget.querySelector('.resizer-handle').style.background = 'var(--tv-color-text-secondary, #787b86)';
          }}
          style={{
            height: '16px',
            cursor: 'ns-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '4px 0',
            flexShrink: 0,
            position: 'relative'
          }}
        >
          {/* Full width dividing line */}
          <div className="resizer-line" style={{ position: 'absolute', width: '100%', height: '1px', background: 'var(--tv-color-border, #2a2e39)', transition: 'background 0.2s ease' }} />
          {/* Central pill handle */}
          <div className="resizer-handle" style={{ position: 'absolute', width: '36px', height: '4px', background: 'var(--tv-color-text-secondary, #787b86)', borderRadius: '2px', transition: 'background 0.2s ease' }} />
        </div>
      )}

      {/* The Scrollable Pure Native Profile Block */}
      {activeChartSymbol && (
        <div style={{ height: `${profileHeight}px`, flexShrink: 0, overflow: 'hidden' }}>
          <SymbolProfile 
            symbol={activeChartSymbol} 
            liveQuote={liveQuotes[activeChartSymbol]} 
            isClosed={isClosed} 
          />
        </div>
      )}

    </div>
  );
}