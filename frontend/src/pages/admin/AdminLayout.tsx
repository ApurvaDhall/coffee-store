import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../auth";

export default function AdminLayout() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === "loading") {
    return (
      <main className="page">
        <section className="panel" aria-live="polite">
          <p>Checking admin access...</p>
        </section>
      </main>
    );
  }

  if (auth.status === "unauthenticated") {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  if (!auth.profile?.isAdmin) {
    return (
      <main className="page">
        <header className="page-header">
          <h1>Admin Area</h1>
        </header>
        <section className="panel">
          <div role="alert" className="status-block error-block">
            <p><strong>403 Forbidden</strong></p>
            <p>You do not have permission to access this area.</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="page-header">
        <h1>Admin Area</h1>
        <nav aria-label="Admin navigation" className="admin-nav">
          <Link to="/admin">Products</Link>
          <Link to="/admin/orders">Orders</Link>
        </nav>
      </header>
      <Outlet />
    </main>
  );
}
