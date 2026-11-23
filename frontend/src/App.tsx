import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthContext } from "./auth";
import {
  ApiError,
  clearGuestCart,
  getAuthMe,
  getCart,
  getGoogleAuthStartUrl,
  getLogoutUrl,
  getGuestCart,
  setCartItemQuantity,
  type AuthMeResponse
} from "./lib/api";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminOrdersPage from "./pages/admin/AdminOrdersPage";
import AdminProductsPage from "./pages/admin/AdminProductsPage";
import CartPage from "./pages/CartPage";
import CataloguePage from "./pages/CataloguePage";
import CheckoutPage from "./pages/CheckoutPage";
import OrderConfirmationPage from "./pages/OrderConfirmationPage";
import OrderDetailPage from "./pages/OrderDetailPage";
import MyOrdersPage from "./pages/MyOrdersPage";
import ProductDetailPage from "./pages/ProductDetailPage";

function Shell() {
  const [status, setStatus] = useState<"loading" | "authenticated" | "unauthenticated">("loading");
  const [profile, setProfile] = useState<AuthMeResponse | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const me = await getAuthMe();
      setProfile(me);
      setStatus("authenticated");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setProfile(null);
        setStatus("unauthenticated");
        return;
      }
      setProfile(null);
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (status !== "authenticated") return;

    const guestCart = getGuestCart();
    if (Object.keys(guestCart).length === 0) return;

    void (async () => {
      try {
        const cart = await getCart();
        for (const [productId, guestQuantity] of Object.entries(guestCart)) {
          const existingQuantity = cart.items.find((item) => item.productId === productId)?.quantity ?? 0;
          await setCartItemQuantity(
            productId,
            Math.min(existingQuantity + guestQuantity, 20)
          );
        }
        clearGuestCart();
      } catch {
        // Keep the guest cart so it can be merged on a later authenticated refresh.
      }
    })();
  }, [status]);

  const onSignIn = () => {
    window.location.assign(getGoogleAuthStartUrl());
  };

  const onSignOut = () => {
    setSigningOut(true);
    window.location.assign(getLogoutUrl());
  };

  return (
    <AuthContext.Provider value={{ status, profile, refresh }}>
      <div className="app-shell">
        <header className="top-header">
          <div className="top-header__brand">
            <Link to="/">Roast Republic</Link>
          </div>

          <nav aria-label="Main navigation" className="top-header__nav">
            <Link to="/">Catalogue</Link>
            <Link to="/cart">Cart</Link>
            <Link to="/checkout">Checkout</Link>
            <Link to="/orders">My Orders</Link>
            {status === "authenticated" && profile?.isAdmin && (
              <Link to="/admin">Admin</Link>
            )}
          </nav>

          <div className="top-header__auth" aria-live="polite">
            {status === "loading" && <span>Checking session...</span>}

            {status === "authenticated" && profile && (
              <>
                <span>Signed in as {profile.user.name}</span>
                <button type="button" onClick={onSignOut} disabled={signingOut}>
                  {signingOut ? "Signing out..." : "Sign out"}
                </button>
              </>
            )}

            {status === "unauthenticated" && (
              <button type="button" onClick={onSignIn}>
                Sign in with Google
              </button>
            )}
          </div>
        </header>

        <Outlet />
      </div>
    </AuthContext.Provider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<CataloguePage />} />
          <Route path="/products/:id" element={<ProductDetailPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/orders" element={<MyOrdersPage />} />
          <Route path="/orders/:id" element={<OrderDetailPage />} />
          <Route path="/orders/:id/confirmation" element={<OrderConfirmationPage />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminProductsPage />} />
            <Route path="orders" element={<AdminOrdersPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
