import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { CatalogProvider } from './data/CatalogContext.js';
import { Layout } from './components/Layout.js';
import { CatalogPage } from './pages/CatalogPage.js';
import { MethodDetailPage } from './pages/MethodDetailPage.js';
import { ComparePage } from './pages/ComparePage.js';
import { PlannerPage } from './pages/PlannerPage.js';
import { DifferentiationPage } from './pages/DifferentiationPage.js';
import { SystematikPage } from './pages/SystematikPage.js';
import { ApiMcpPage } from './pages/ApiMcpPage.js';
import { ImpressumPage } from './pages/ImpressumPage.js';
import { DatenschutzPage } from './pages/DatenschutzPage.js';
import { NutzungsbedingungenPage } from './pages/NutzungsbedingungenPage.js';

export function App() {
  return (
    <CatalogProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<CatalogPage />} />
            <Route path="/methoden/:kennung" element={<MethodDetailPage />} />
            <Route path="/vergleich" element={<ComparePage />} />
            <Route path="/planer" element={<PlannerPage />} />
            <Route path="/differenzierung" element={<DifferentiationPage />} />
            <Route path="/systematik" element={<SystematikPage />} />
            <Route path="/api-mcp" element={<ApiMcpPage />} />
            <Route path="/impressum" element={<ImpressumPage />} />
            <Route path="/datenschutz" element={<DatenschutzPage />} />
            <Route path="/nutzungsbedingungen" element={<NutzungsbedingungenPage />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </CatalogProvider>
  );
}
