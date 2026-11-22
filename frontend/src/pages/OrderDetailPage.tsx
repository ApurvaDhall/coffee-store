import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth";
import { ApiError, getOrderById, type Order } from "../lib/api";

type LoadState = "idle" | "loading" | "success" | "error";

function formatCents(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR"
  }).format(value / 100);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

export default function OrderDetailPage() {
  const auth = useAuth();
  const { id } = useParams();
  const [state, setState] = useState<LoadState>("idle");
  const [order, setOrder] = useState<Order | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    if (auth.status !== "authenticated") {
      return;
    }

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
        <h1>Order Details</h1>
        <p>
          <Link to="/orders">Back to My Orders</Link>
        </p>
      </header>

      <section className="panel">
        {auth.status === "loading" && <p>Checking your sign-in status...</p>}

        {auth.status === "unauthenticated" && (
          <div className="status-block empty-block">
            <p>You must be signed in to view order details.</p>
            <p>
              <Link to="/orders">Sign in and return to My Orders</Link>
            </p>
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

        {auth.status === "authenticated" && state === "success" && !order && (
          <div className="status-block empty-block">
            <p>Order not found.</p>
            <p>
              <Link to="/orders">Back to My Orders</Link>
            </p>
          </div>
        )}

        {auth.status === "authenticated" && state === "success" && order && (
          <article className="order-detail-card">
            <h2>Order {order.id}</h2>

            <dl>
              <dt>Date</dt>
              <dd>{formatDate(order.createdAt)}</dd>
              <dt>Status</dt>
              <dd>
                <span className="status-badge">{order.status}</span>
              </dd>
              <dt>Ship to</dt>
              <dd>
                {order.shippingName}
                <br />
                {order.shippingAddress}
              </dd>
              <dt>Total</dt>
              <dd>{formatCents(order.totalCents)}</dd>
            </dl>

            <h3>Items</h3>
            {order.items.length === 0 ? (
              <p>No items are recorded for this order.</p>
            ) : (
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
            )}
          </article>
        )}
      </section>
    </main>
  );
}
