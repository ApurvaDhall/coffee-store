import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { ApiError, createOrder, getCart, type CartResponse } from "../lib/api";

type LoadState = "idle" | "loading" | "success" | "error";

function formatCents(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR"
  }).format(value / 100);
}

function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `idem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export default function CheckoutPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [cart, setCart] = useState<CartResponse | null>(null);
  const [shippingName, setShippingName] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const idempotencyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (auth.status !== "authenticated") {
      return;
    }

    let cancelled = false;

    const run = async () => {
      setState("loading");
      setErrorMessage("");

      try {
        const response = await getCart();
        if (cancelled) {
          return;
        }
        setCart(response);
        setState("success");
      } catch (error) {
        if (cancelled) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : "Could not load cart.");
        setState("error");
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [auth.status, reloadNonce]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");

    if (!shippingName.trim() || !shippingAddress.trim()) {
      setErrorMessage("Shipping name and address are required.");
      return;
    }

    setSubmitting(true);

    try {
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = createIdempotencyKey();
      }
      const idempotencyKey = idempotencyKeyRef.current;
      const order = await createOrder(
        {
          shippingName: shippingName.trim(),
          shippingAddress: shippingAddress.trim()
        },
        idempotencyKey
      );
      navigate(`/orders/${order.id}/confirmation`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setErrorMessage("Please sign in before checking out.");
      } else {
        setErrorMessage(error instanceof Error ? error.message : "Checkout failed.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page" aria-live="polite">
      <header className="page-header">
        <h1>Checkout</h1>
        <p>Confirm shipping details and place your order.</p>
      </header>

      {auth.status === "loading" && (
        <section className="panel">
          <p>Checking your sign-in status...</p>
        </section>
      )}

      {auth.status === "unauthenticated" && (
        <section className="panel">
          <div className="status-block empty-block">
            <p>You must be signed in to checkout.</p>
            <p>
              <Link to="/">Return to catalogue</Link>
            </p>
          </div>
        </section>
      )}

      {auth.status === "authenticated" && (
        <section className="panel">
          {state === "loading" && <p>Loading checkout data...</p>}

          {state === "error" && (
            <div role="alert" className="status-block error-block">
              <p>{errorMessage || "Could not load checkout data."}</p>
              <button type="button" onClick={() => setReloadNonce((value) => value + 1)}>
                Retry
              </button>
            </div>
          )}

          {state === "success" && (cart?.items.length ?? 0) === 0 && (
            <div className="status-block empty-block">
              <p>Your cart is empty, so there is nothing to checkout.</p>
              <p>
                <Link to="/">Browse coffees</Link>
              </p>
            </div>
          )}

          {state === "success" && cart && cart.items.length > 0 && (
            <div className="checkout-grid">
              <section aria-label="Order summary">
                <h2>Order Summary</h2>
                <ul className="summary-list">
                  {cart.items.map((item) => (
                    <li key={item.productId}>
                      <span>
                        {item.product.name} x {item.quantity}
                      </span>
                      <span>{formatCents(item.lineTotalCents)}</span>
                    </li>
                  ))}
                </ul>
                <p className="summary-total">
                  <strong>Total:</strong> {formatCents(cart.cartTotalCents)}
                </p>
              </section>

              <section aria-label="Shipping form">
                <h2>Shipping</h2>
                <form className="checkout-form" onSubmit={onSubmit}>
                  <label htmlFor="shipping-name">Full name</label>
                  <input
                    id="shipping-name"
                    type="text"
                    value={shippingName}
                    onChange={(event) => setShippingName(event.target.value)}
                    required
                  />

                  <label htmlFor="shipping-address">Address</label>
                  <textarea
                    id="shipping-address"
                    value={shippingAddress}
                    onChange={(event) => setShippingAddress(event.target.value)}
                    rows={4}
                    required
                  />

                  {errorMessage && (
                    <p role="alert" className="inline-error">
                      {errorMessage}
                    </p>
                  )}

                  <button type="submit" disabled={submitting}>
                    {submitting ? "Placing order..." : "Place order"}
                  </button>
                </form>
              </section>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
