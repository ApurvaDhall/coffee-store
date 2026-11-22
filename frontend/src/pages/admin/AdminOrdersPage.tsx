import { useEffect, useState } from "react";
import {
  ApiError,
  getAdminOrders,
  updateAdminOrderStatus,
  type OrderListItem,
  type OrderStatus
} from "../../lib/api";

type LoadState = "loading" | "success" | "error";

const statuses: OrderStatus[] = ["paid", "processing", "shipped", "delivered", "cancelled"];

function formatCents(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR"
  }).format(value / 100);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

export default function AdminOrdersPage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoadState("loading");
      setErrorMessage("");

      try {
        const response = await getAdminOrders({ page, pageSize });
        if (cancelled) return;
        setOrders(response.items);
        setTotal(response.total);
        setLoadState("success");
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 403) {
          setErrorMessage("403 Forbidden: You do not have permission to manage orders.");
        } else {
          setErrorMessage(error instanceof Error ? error.message : "Could not load orders.");
        }
        setLoadState("error");
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [page, pageSize, reloadNonce]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const onStatusChange = async (order: OrderListItem, nextStatus: OrderStatus) => {
    if (nextStatus === "cancelled") {
      const confirmed = window.confirm(`Cancel order ${order.id}?`);
      if (!confirmed) return;
    }

    setSavingId(order.id);
    setErrorMessage("");

    try {
      await updateAdminOrderStatus(order.id, nextStatus);
      setOrders((current) =>
        current.map((item) => (item.id === order.id ? { ...item, status: nextStatus } : item))
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not update order status.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="panel" aria-label="Admin orders">
      <h2>Orders</h2>

      {errorMessage && (
        <div role="alert" className="status-block error-block">
          <p>{errorMessage}</p>
        </div>
      )}

      {loadState === "loading" && <p>Loading orders...</p>}

      {loadState === "error" && (
        <div role="alert" className="status-block error-block">
          <p>{errorMessage}</p>
          <button type="button" onClick={() => setReloadNonce((value) => value + 1)}>
            Retry
          </button>
        </div>
      )}

      {loadState === "success" && orders.length === 0 && (
        <div className="status-block empty-block">
          <p>No orders yet.</p>
        </div>
      )}

      {loadState === "success" && orders.length > 0 && (
        <>
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Admin orders</caption>
              <thead>
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col">Date</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Total</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.id}</td>
                    <td>{formatDate(order.createdAt)}</td>
                    <td>{order.shippingName}</td>
                    <td>{formatCents(order.totalCents)}</td>
                    <td>
                      <label htmlFor={`status-${order.id}`} className="sr-only">
                        Status for order {order.id}
                      </label>
                      <select
                        id={`status-${order.id}`}
                        value={order.status}
                        disabled={savingId === order.id}
                        onChange={(event) =>
                          void onStatusChange(order, event.target.value as OrderStatus)
                        }
                      >
                        {statuses.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <nav className="pagination" aria-label="Admin order pagination">
            <button type="button" onClick={() => setPage((value) => value - 1)} disabled={page <= 1}>
              Previous
            </button>
            <span>Page {page} of {totalPages}</span>
            <button
              type="button"
              onClick={() => setPage((value) => value + 1)}
              disabled={page >= totalPages}
            >
              Next
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
