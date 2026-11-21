import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { CatalogProvider } from './data/CatalogContext.js';
import { Layout } from './components/Layout.js';
import { CatalogPage } from './pages/CatalogPage.js';
import { MethodDetailPage } from './pages/MethodDetailPage.js';
import { ComparePage } from './pages/ComparePage.js';
import { PlannerPage } from './pages/PlannerPage.js';
import { SystematikPage } from './pages/SystematikPage.js';
import { ApiMcpPage } from './pages/ApiMcpPage.js';

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
            <Route path="/systematik" element={<SystematikPage />} />
            <Route path="/api-mcp" element={<ApiMcpPage />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </CatalogProvider>
  );
}
