import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, deleteCartItem, getCart, getGoogleAuthStartUrl, setCartItemQuantity, type CartResponse } from "../lib/api";
import { useAuth } from "../auth";
import ProductImage from "../components/ProductImage";

type LoadState = "idle" | "loading" | "success" | "error";

function formatCents(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR"
  }).format(value / 100);
}

export default function CartPage() {
  const auth = useAuth();
  const [state, setState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [data, setData] = useState<CartResponse | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [pendingProductId, setPendingProductId] = useState<string | null>(null);

  useEffect(() => {
    if (auth.status !== "authenticated") return;

    let cancelled = false;

    const run = async () => {
      setState("loading");
      setErrorMessage("");

      try {
        const response = await getCart();
        if (cancelled) {
          return;
        }
        setData(response);
        setState("success");
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          setErrorMessage("Please sign in to view your cart.");
        } else {
          setErrorMessage(error instanceof Error ? error.message : "Could not load cart.");
        }
        setState("error");
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [auth.status, reloadNonce]);

  const updateQuantity = async (productId: string, quantity: number) => {
    setPendingProductId(productId);
    setErrorMessage("");

    try {
      await setCartItemQuantity(productId, quantity);
      const refreshed = await getCart();
      setData(refreshed);
      setState("success");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not update item quantity.");
      setState("error");
    } finally {
      setPendingProductId(null);
    }
  };

  const removeItem = async (productId: string) => {
    setPendingProductId(productId);
    setErrorMessage("");

    try {
      await deleteCartItem(productId);
      const refreshed = await getCart();
      setData(refreshed);
      setState("success");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not remove item.");
      setState("error");
    } finally {
      setPendingProductId(null);
    }
  };

  return (
    <main className="page" aria-live="polite">
      <header className="page-header">
        <h1>Your Cart</h1>
        <p>Review your selected coffees before checkout.</p>
      </header>

      <section className="panel" aria-label="Cart contents">
        {auth.status === "loading" && <p>Checking your sign-in status...</p>}

        {auth.status === "unauthenticated" && (
          <div className="status-block empty-block">
            <p>Sign in to view and manage your cart.</p>
            <button type="button" onClick={() => window.location.assign(getGoogleAuthStartUrl())}>
              Sign in with Google
            </button>
          </div>
        )}

        {auth.status === "authenticated" && state === "loading" && <p>Loading cart...</p>}

        {auth.status === "authenticated" && state === "error" && (
          <div role="alert" className="status-block error-block">
            <p>{errorMessage || "Could not load your cart."}</p>
            <button type="button" onClick={() => setReloadNonce((value) => value + 1)}>
              Retry
            </button>
          </div>
        )}

        {auth.status === "authenticated" && state === "success" && (data?.items.length ?? 0) === 0 && (
          <div className="status-block empty-block">
            <p>Your cart is empty.</p>
            <p>
              <Link to="/">Browse the catalogue</Link>
            </p>
          </div>
        )}

        {auth.status === "authenticated" && state === "success" && (data?.items.length ?? 0) > 0 && data && (
          <>
            <ul className="cart-list">
              {data.items.map((item) => (
                <li key={item.productId}>
                  <article className="cart-item">
                    <ProductImage
                      src={item.product.imageUrl}
                      name={item.product.name}
                      className="cart-item-image"
                      width={600}
                      height={450}
                    />

                    <div className="cart-copy">
                      <h2>
                        <Link to={`/products/${item.productId}`}>{item.product.name}</Link>
                      </h2>
                      <p>
                        <strong>Origin:</strong> {item.product.origin}
                      </p>
                      <p>
                        <strong>Unit price:</strong> {formatCents(item.product.priceCents)}
                      </p>
                      <p>
                        <strong>Line total:</strong> {formatCents(item.lineTotalCents)}
                      </p>
                    </div>

                    <div className="cart-actions">
                      <label htmlFor={`qty-${item.productId}`}>Quantity</label>
                      <input
                        key={`${item.productId}-${item.quantity}`}
                        id={`qty-${item.productId}`}
                        type="number"
                        min={1}
                        max={Math.min(20, item.product.stock)}
                        defaultValue={item.quantity}
                        disabled={pendingProductId === item.productId}
                        onBlur={(event) => {
                          const next = Number(event.target.value);
                          if (!Number.isInteger(next) || next < 1 || next > Math.min(20, item.product.stock)) {
                            event.target.value = String(item.quantity);
                            return;
                          }
                          if (next !== item.quantity) {
                            void updateQuantity(item.productId, next);
                          }
                        }}
                      />
                      <button
                        type="button"
                        disabled={pendingProductId === item.productId}
                        onClick={() => removeItem(item.productId)}
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                </li>
              ))}
            </ul>

            <footer className="cart-footer">
              <p>
                <strong>Total:</strong> {formatCents(data.cartTotalCents)}
              </p>
              <Link className="cta-link" to="/checkout">
                Proceed to Checkout
              </Link>
            </footer>
          </>
        )}
      </section>
    </main>
  );
}
