import { Routes, Route } from 'react-router-dom';
import { AddonProvider } from './context';
import Admin from './pages/Admin';
import PoolWidget from './widgets/PoolWidget';

/**
 * Routes :
 *   /              → page de l'addon (ADMIN)
 *   /widget/pool   → achat rapide, affiché sur la page « Pool de proxies » du panel
 */
export default function App() {
  return (
    <AddonProvider>
      <Routes>
        <Route path="/" element={<Admin />} />
        <Route path="/widget/pool" element={<PoolWidget />} />
      </Routes>
    </AddonProvider>
  );
}
