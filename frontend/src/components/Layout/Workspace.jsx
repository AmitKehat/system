// src/components/Layout/Workspace.jsx
import React from 'react';
import StatusBar from '../StatusBar/StatusBar';
import TopToolbar from '../Toolbar/TopToolbar';
import LeftToolbar from '../Toolbar/LeftToolbar';
import RightToolbar from '../Toolbar/RightToolbar';
import ChartContainer from '../Chart/ChartContainer';
import IndicatorDialog from '../Indicators/IndicatorDialog';
import IndicatorSettings from '../Indicators/IndicatorSettings';
import PortfolioSidebar from '../Portfolio/PortfolioSidebar';

export default function Workspace() {
  return (
    <>
      <StatusBar />
      <TopToolbar />
      <div className="workspace">
        <LeftToolbar />
        <div className="workspace-main">
          <ChartContainer />
        </div>
        <PortfolioSidebar />
        <RightToolbar />
      </div>
      
      <IndicatorDialog />
      <IndicatorSettings />
    </>
  );
}
