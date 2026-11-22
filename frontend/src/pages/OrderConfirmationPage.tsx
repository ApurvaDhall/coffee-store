import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, getOrderById, type Order } from "../lib/api";
import { useAuth } from "../auth";
import { getGoogleAuthStartUrl } from "../lib/api";

type LoadState = "idle" | "loading" | "success" | "error";

function formatCents(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR"
  }).format(value / 100);
}

export default function OrderConfirmationPage() {
  const auth = useAuth();
  const { id } = useParams();
  const [state, setState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    if (auth.status !== "authenticated") return;

    if (!id) {
      setState("error");
      setErrorMessage("Order id is missing.");
      return;
    }

    let cancelled = false;

    const run = async () => {
      setState("loading");
      setErrorMessage("");

      try {
        const response = await getOrderById(id);
        if (cancelled) {
          return;
        }
        setOrder(response);
        setState("success");
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiError && error.status === 404) {
          setOrder(null);
          setState("success");
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : "Could not load order.");
        setState("error");
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [auth.status, id, reloadNonce]);

  return (
    <main className="page" aria-live="polite">
      <header className="page-header">
        <h1>Order Confirmation</h1>
        <p>Review your placed order.</p>
      </header>

      <section className="panel">
        {auth.status === "loading" && <p>Checking your sign-in status...</p>}

        {auth.status === "unauthenticated" && (
          <div className="status-block empty-block">
            <p>Sign in to view this order confirmation.</p>
            <button type="button" onClick={() => window.location.assign(getGoogleAuthStartUrl())}>
              Sign in with Google
            </button>
          </div>
        )}

        {auth.status === "authenticated" && state === "loading" && <p>Loading order...</p>}

        {auth.status === "authenticated" && state === "error" && (
          <div role="alert" className="status-block error-block">
            <p>{errorMessage || "Could not load order."}</p>
            <button type="button" onClick={() => setReloadNonce((value) => value + 1)}>
              Retry
            </button>
          </div>
        )}

        {state === "success" && !order && (
          <div className="status-block empty-block">
            <p>Order not found.</p>
            <p>
              <Link to="/">Back to catalogue</Link>
            </p>
          </div>
        )}

        {state === "success" && order && (
          <article className="confirmation-card">
            <h2>Thank you for your order</h2>
            <p>
              <strong>Order ID:</strong> {order.id}
            </p>
            <p>
              <strong>Status:</strong> {order.status}
            </p>
            <p>
              <strong>Ship to:</strong> {order.shippingName}
              <br />
              {order.shippingAddress}
            </p>

            <h3>Items</h3>
            <ul className="summary-list">
              {order.items.map((item) => (
                <li key={item.id}>
                  <span className="order-item-placeholder" role="img" aria-label={`${item.nameSnapshot} image unavailable`}>
                    <span aria-hidden="true">☕</span>
                    {item.nameSnapshot} x {item.quantity}
                  </span>
                  <span>{formatCents(item.lineTotalCents)}</span>
                </li>
              ))}
            </ul>

            <p className="summary-total">
              <strong>Order total:</strong> {formatCents(order.totalCents)}
            </p>

            <p>
              <Link to="/">Continue shopping</Link>
            </p>
          </article>
        )}
      </section>
    </main>
  );
}
