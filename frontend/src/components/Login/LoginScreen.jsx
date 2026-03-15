import React, { useState } from 'react';
import { useStatusStore } from '../../store/statusStore';
import './LoginScreen.css';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { login, isLoggingIn, loginError } = useStatusStore();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username || !password) return;
    // Mode is now inherently 'live' as the master auth
    await login(username, password);
  };

  return (
    <div className="login-wrapper">
      <div className="ib-logo-header">
        <div className="ib-logo-icon"></div>
        <h1>Trading System Access</h1>
      </div>
      
      <div className="login-card">
        <div className="login-card-header">
          <h2>Secure Login</h2>
          {/* Mode toggle removed for unified Data Master / Execution Slave architecture */}
        </div>

        {loginError && <div className="login-error">⚠️ {loginError}</div>}

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>Master Username</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="off" />
          </div>
          
          <div className="form-group">
            <label>Master Password</label>
            <div className="password-input-wrap">
              <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="off" />
              <button type="button" className="toggle-password" onClick={() => setShowPassword(!showPassword)} tabIndex="-1">
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <button type="submit" className="submit-btn" disabled={!username || !password || isLoggingIn}>
            {isLoggingIn ? "Authenticating Web Session..." : "Connect"}
          </button>
        </form>
        
        <div className="login-footer">
          <p>This login authenticates your web session against the remote server.</p>
          <p>The Live Data Master and Paper Execution Gateway run continuously in the background.</p>
        </div>
      </div>
    </div>
  );
}