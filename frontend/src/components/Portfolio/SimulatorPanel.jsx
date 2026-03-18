import React, { useState, useEffect, useRef } from 'react';
import { useSimulatorStore } from '../../store/simulatorStore';
import { useChartStore } from '../../store/chartStore';

// Strip JSON and Python code blocks from message for display (but keep in history for backend)
function stripCodeBlocks(content) {
    return content
        .replace(/```json[\s\S]*?```/g, '')
        .replace(/```python[\s\S]*?```/g, '')
        .trim();
}

export default function SimulatorPanel() {
  const { 
      mode, setMode, provider, setProvider, apiKeys, setApiKey, 
      parameters, updateParams, chatHistory, sendMessage, isProcessing, clearChat, loadPersistedState 
  } = useSimulatorStore();
  const activeSymbol = useChartStore((s) => s.symbol);
  
  const [tab, setTab] = useState('chat'); // 'chat' | 'settings' | 'params'
  const [inputVal, setInputVal] = useState('');
  const chatEndRef = useRef(null);

  useEffect(() => { loadPersistedState(); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatHistory]);

  const handleSend = () => {
      if (!inputVal.trim() || isProcessing) return;
      sendMessage(inputVal, activeSymbol);
      setInputVal('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', color: 'var(--tv-color-text-primary, #e0e3eb)' }}>
      
      {/* Mode Switcher */}
      <div style={{ display: 'flex', padding: '16px', gap: '8px', borderBottom: '1px solid var(--tv-color-border, #2a2e39)' }}>
          <button onClick={() => setMode('single')} style={{ flex: 1, padding: '6px', borderRadius: '4px', background: mode === 'single' ? '#2962ff' : 'transparent', color: mode === 'single' ? '#fff' : 'inherit', border: '1px solid var(--tv-color-border, #2a2e39)', cursor: 'pointer' }}>Single Security</button>
          <button onClick={() => setMode('portfolio')} style={{ flex: 1, padding: '6px', borderRadius: '4px', background: mode === 'portfolio' ? '#089981' : 'transparent', color: mode === 'portfolio' ? '#fff' : 'inherit', border: '1px solid var(--tv-color-border, #2a2e39)', cursor: 'pointer' }}>Portfolio</button>
      </div>

      {/* Internal Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--tv-color-border, #2a2e39)' }}>
          <button onClick={() => setTab('chat')} style={{ flex: 1, background: 'transparent', color: tab === 'chat' ? '#2962ff' : 'inherit', border: 'none', borderBottom: tab === 'chat' ? '2px solid #2962ff' : 'none', padding: '8px', cursor: 'pointer' }}>Planner</button>
          <button onClick={() => setTab('params')} style={{ flex: 1, background: 'transparent', color: tab === 'params' ? '#2962ff' : 'inherit', border: 'none', borderBottom: tab === 'params' ? '2px solid #2962ff' : 'none', padding: '8px', cursor: 'pointer' }}>Params</button>
          <button onClick={() => setTab('settings')} style={{ flex: 1, background: 'transparent', color: tab === 'settings' ? '#2962ff' : 'inherit', border: 'none', borderBottom: tab === 'settings' ? '2px solid #2962ff' : 'none', padding: '8px', cursor: 'pointer' }}>Keys</button>
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column' }}>
          
          {tab === 'params' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ color: 'var(--tv-color-text-secondary, #787b86)' }}>Start Date</label>
                      <input type="date" value={parameters.startDate} onChange={e => updateParams({startDate: e.target.value})} style={{ background: 'var(--tv-color-popup-background, #1e222d)', border: '1px solid var(--tv-color-border, #2a2e39)', color: '#fff', padding: '6px', borderRadius: '4px' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ color: 'var(--tv-color-text-secondary, #787b86)' }}>End Date</label>
                      <input type="date" value={parameters.endDate} onChange={e => updateParams({endDate: e.target.value})} style={{ background: 'var(--tv-color-popup-background, #1e222d)', border: '1px solid var(--tv-color-border, #2a2e39)', color: '#fff', padding: '6px', borderRadius: '4px' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ color: 'var(--tv-color-text-secondary, #787b86)' }}>Initial Capital ($)</label>
                      <input type="number" value={parameters.initialCapital} onChange={e => updateParams({initialCapital: parseFloat(e.target.value)})} style={{ background: 'var(--tv-color-popup-background, #1e222d)', border: '1px solid var(--tv-color-border, #2a2e39)', color: '#fff', padding: '6px', borderRadius: '4px' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ color: 'var(--tv-color-text-secondary, #787b86)' }}>Commission (%)</label>
                      <input type="number" step="0.001" value={parameters.commission} onChange={e => updateParams({commission: parseFloat(e.target.value)})} style={{ background: 'var(--tv-color-popup-background, #1e222d)', border: '1px solid var(--tv-color-border, #2a2e39)', color: '#fff', padding: '6px', borderRadius: '4px' }} />
                  </div>
              </div>
          )}

          {tab === 'settings' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ color: 'var(--tv-color-text-secondary, #787b86)' }}>Active Quant Agent</label>
                      <select value={provider} onChange={e => setProvider(e.target.value)} style={{ background: 'var(--tv-color-popup-background, #1e222d)', border: '1px solid var(--tv-color-border, #2a2e39)', color: '#fff', padding: '6px', borderRadius: '4px' }}>
                          <option value="openai">ChatGPT (OpenAI)</option>
                          <option value="anthropic">Claude (Anthropic)</option>
                          <option value="gemini">Gemini (Google)</option>
                      </select>
                  </div>
                  
                  <div style={{ borderTop: '1px solid var(--tv-color-border, #2a2e39)', margin: '8px 0' }} />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ color: 'var(--tv-color-text-secondary, #787b86)' }}>OpenAI API Key</label>
                      <input type="password" placeholder="sk-..." value={apiKeys.openai} onChange={e => setApiKey('openai', e.target.value)} style={{ background: 'var(--tv-color-popup-background, #1e222d)', border: '1px solid var(--tv-color-border, #2a2e39)', color: '#fff', padding: '6px', borderRadius: '4px' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ color: 'var(--tv-color-text-secondary, #787b86)' }}>Anthropic API Key</label>
                      <input type="password" placeholder="sk-ant-..." value={apiKeys.anthropic} onChange={e => setApiKey('anthropic', e.target.value)} style={{ background: 'var(--tv-color-popup-background, #1e222d)', border: '1px solid var(--tv-color-border, #2a2e39)', color: '#fff', padding: '6px', borderRadius: '4px' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ color: 'var(--tv-color-text-secondary, #787b86)' }}>Google Gemini API Key</label>
                      <input type="password" placeholder="AIza..." value={apiKeys.gemini} onChange={e => setApiKey('gemini', e.target.value)} style={{ background: 'var(--tv-color-popup-background, #1e222d)', border: '1px solid var(--tv-color-border, #2a2e39)', color: '#fff', padding: '6px', borderRadius: '4px' }} />
                  </div>
              </div>
          )}

          {tab === 'chat' && (
              <>
                  <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '16px' }}>
                      {chatHistory.length === 0 && (
                          <div style={{ textAlign: 'center', color: 'var(--tv-color-text-secondary, #787b86)', marginTop: '40px', fontSize: '13px' }}>
                              Describe a trading strategy for {activeSymbol}.<br/>Example: "Buy when 50 SMA crosses above 200 SMA, sell when RSI {'>'} 70."
                          </div>
                      )}
                      {chatHistory.map((msg, i) => (
                          <div key={i} style={{
                              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                              background: msg.role === 'user' ? '#2962ff' : 'var(--tv-color-popup-background, #1e222d)',
                              border: msg.role === 'user' ? 'none' : '1px solid var(--tv-color-border, #2a2e39)',
                              padding: '12px 16px',
                              borderRadius: '8px',
                              maxWidth: '90%',
                              fontSize: '13px',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              lineHeight: '1.4'
                          }}>
                              {msg.role === 'user' ? (
                                  msg.content
                              ) : (
                                  <div dangerouslySetInnerHTML={{ __html: stripCodeBlocks(msg.content) }} />
                              )}
                          </div>
                      ))}
                      {isProcessing && (
                          <div style={{ alignSelf: 'flex-start', fontSize: '12px', color: 'var(--tv-color-text-secondary, #787b86)' }}>
                              Agent is building and running strategy...
                          </div>
                      )}
                      <div ref={chatEndRef} />
                  </div>
                  
                  <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--tv-color-border, #2a2e39)', paddingTop: '12px' }}>
                      <textarea 
                          value={inputVal}
                          onChange={e => setInputVal(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                          placeholder="Define your strategy..."
                          style={{ flex: 1, minHeight: '40px', maxHeight: '120px', resize: 'vertical', background: 'var(--tv-color-popup-background, #1e222d)', border: '1px solid var(--tv-color-border, #2a2e39)', color: '#fff', padding: '8px', borderRadius: '4px', fontFamily: 'inherit', fontSize: '13px' }}
                      />
                      <button onClick={handleSend} disabled={isProcessing} style={{ background: '#2962ff', color: '#fff', border: 'none', borderRadius: '4px', padding: '0 16px', cursor: isProcessing ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                          Run
                      </button>
                  </div>
                  {chatHistory.length > 0 && (
                      <button onClick={clearChat} style={{ background: 'transparent', color: '#f23645', border: 'none', cursor: 'pointer', fontSize: '11px', marginTop: '8px', alignSelf: 'center' }}>Clear History</button>
                  )}
              </>
          )}

      </div>
    </div>
  );
}