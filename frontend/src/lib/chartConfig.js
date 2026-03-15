export function getChartOptions(theme, isMain = true) {
    const isDark = theme === 'dark';
  
    return {
      layout: {
        background: {
          type: 'solid',
          color: isDark ? '#131722' : '#ffffff'
        },
        textColor: isDark ? '#d1d4dc' : '#131722'
      },
      grid: {
        vertLines: {
          color: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'
        },
        horzLines: {
          color: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'
        }
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: isDark ? '#758696' : '#9598a1',
          width: 1,
          style: 2,
          labelBackgroundColor: isDark ? '#2a2e39' : '#f0f3fa'
        },
        horzLine: {
          color: isDark ? '#758696' : '#9598a1',
          width: 1,
          style: 2,
          labelBackgroundColor: isDark ? '#2a2e39' : '#f0f3fa'
        }
      },
      rightPriceScale: {
        borderVisible: true,
        borderColor: isDark ? '#2a2e39' : '#e0e3eb',
        scaleMargins: {
          top: 0.1,
          bottom: 0.1
        }
      },
      timeScale: {
        borderVisible: true,
        borderColor: isDark ? '#2a2e39' : '#e0e3eb',
        timeVisible: true,
        secondsVisible: false
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true
      }
    };
  }
  