import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { ApiError, getOrders, type OrderListItem } from "../lib/api";

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
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

export default function MyOrdersPage() {
  const auth = useAuth();
  const [state, setState] = useState<LoadState>("idle");
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    if (auth.status !== "authenticated") {
      return;
    }

    let cancelled = false;

    const run = async () => {
      setState("loading");
      setErrorMessage("");

      try {
        const response = await getOrders();
        if (cancelled) {
          return;
        }
        setOrders(response.items);
        setState("success");
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          setErrorMessage("Please sign in to view your orders.");
        } else {
          setErrorMessage(error instanceof Error ? error.message : "Could not load orders.");
        }
        setState("error");
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [auth.status, reloadNonce]);

  return (
    <main className="page" aria-live="polite">
      <header className="page-header">
        <h1>My Orders</h1>
        <p>Review your order history and open an order for details.</p>
      </header>

      <section className="panel" aria-label="Order history">
        {auth.status === "loading" && <p>Checking your sign-in status...</p>}

        {auth.status === "unauthenticated" && (
          <div className="status-block empty-block">
            <p>You must be signed in to view your orders.</p>
            <p>
              <Link to="/">Return to catalogue</Link>
            </p>
          </div>
        )}

        {auth.status === "authenticated" && state === "loading" && <p>Loading orders...</p>}

        {auth.status === "authenticated" && state === "error" && (
          <div role="alert" className="status-block error-block">
            <p>{errorMessage || "Could not load orders."}</p>
            <button type="button" onClick={() => setReloadNonce((value) => value + 1)}>
              Retry
            </button>
          </div>
        )}

        {auth.status === "authenticated" && state === "success" && orders.length === 0 && (
          <div className="status-block empty-block">
            <p>No orders yet</p>
            <p>
              <Link to="/">Browse the catalogue</Link>
            </p>
          </div>
        )}

        {auth.status === "authenticated" && state === "success" && orders.length > 0 && (
          <ul className="orders-list">
            {orders.map((order) => (
              <li key={order.id}>
                <article className="order-card">
                  <h2>
                    <Link to={`/orders/${order.id}`}>Order {order.id}</Link>
                  </h2>
                  <dl>
                    <dt>Date</dt>
                    <dd>{formatDate(order.createdAt)}</dd>
                    <dt>Status</dt>
                    <dd>
                      <span className="status-badge">{order.status}</span>
                    </dd>
                    <dt>Total</dt>
                    <dd>{formatCents(order.totalCents)}</dd>
                  </dl>
                  <p>
                    <Link to={`/orders/${order.id}`}>
                      View order details
                      <span className="sr-only"> for {order.id}</span>
                    </Link>
                  </p>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
