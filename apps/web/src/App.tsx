import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { CatalogProvider } from './data/CatalogContext.js';
import { Layout } from './components/Layout.js';
import { CatalogPage } from './pages/CatalogPage.js';
import { MethodDetailPage } from './pages/MethodDetailPage.js';
import { ComparePage } from './pages/ComparePage.js';

export function App() {
  return (
    <CatalogProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<CatalogPage />} />
            <Route path="/methoden/:kennung" element={<MethodDetailPage />} />
            <Route path="/vergleich" element={<ComparePage />} />
            <Route path="/planer" element={<div className="page-section">Planer folgt in Task 8…</div>} />
            <Route path="/systematik" element={<div className="page-section">Systematik folgt in Task 8…</div>} />
            <Route path="/api-mcp" element={<div className="page-section">API &amp; MCP folgt in Task 8…</div>} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </CatalogProvider>
  );
}
