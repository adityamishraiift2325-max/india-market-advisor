import { Routes, Route, NavLink } from 'react-router-dom';
import Overview from './pages/Overview.jsx';
import Sectors from './pages/Sectors.jsx';
import Allocate from './pages/Allocate.jsx';
import AllocateClassic from './pages/AllocateClassic.jsx';
import DeepDive from './pages/DeepDive.jsx';
import SIPHealth from './pages/SIPHealth.jsx';
import SIPSimulator from './pages/SIPSimulator.jsx';
import Settings from './pages/Settings.jsx';
import MacroStrip from './components/MacroStrip.jsx';
import MacroAlertBanner from './components/MacroAlertBanner.jsx';
import { MacroAlertProvider } from './context/MacroAlertContext.jsx';
import { AllocateProvider } from './context/AllocateContext.jsx';
import { RefreshProvider } from './context/RefreshContext.jsx';

export default function App() {
  return (
    <RefreshProvider>
    <MacroAlertProvider>
    <AllocateProvider>
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">₹</span>
          <div>
            <h1>India Market Advisor</h1>
            <p className="tagline">Live market intelligence + AI allocation</p>
          </div>
        </div>
        <nav className="nav">
          <NavLink to="/" end>Overview</NavLink>
          <NavLink to="/sectors">Sectors</NavLink>
          <NavLink to="/allocate">Allocate</NavLink>
          <NavLink to="/sip-health">SIP Health</NavLink>
          <NavLink to="/sip-simulator">Simulator</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
      </header>

      <MacroStrip />
      <MacroAlertBanner />

      <main className="content">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/sectors" element={<Sectors />} />
          <Route path="/sectors/:key" element={<DeepDive />} />
          <Route path="/allocate" element={<Allocate />} />
          <Route path="/allocate/classic" element={<AllocateClassic />} />
          <Route path="/sip-health" element={<SIPHealth />} />
          <Route path="/sip-simulator" element={<SIPSimulator />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>

      <footer className="footer">
        Educational tool — not investment advice. Data may be delayed or illustrative.
      </footer>
    </div>
    </AllocateProvider>
    </MacroAlertProvider>
    </RefreshProvider>
  );
}
