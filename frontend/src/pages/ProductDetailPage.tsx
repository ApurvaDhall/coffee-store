import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth";
import {
  ApiError,
  getCart,
  getGoogleAuthStartUrl,
  getGuestCart,
  getProductById,
  setCartItemQuantity,
  setGuestCart,
  type Product
} from "../lib/api";
import ProductImage from "../components/ProductImage";

type LoadState = "idle" | "loading" | "success" | "error";

function formatCents(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR"
  }).format(value / 100);
}

export default function ProductDetailPage() {
  const auth = useAuth();
  const { id } = useParams();
  const [state, setState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [adding, setAdding] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    if (!id) {
      setState("error");
      setErrorMessage("Invalid product id.");
      return;
    }

    let cancelled = false;

    const run = async () => {
      setState("loading");
      setErrorMessage("");
      setActionMessage("");

      try {
        const item = await getProductById(id);
        if (cancelled) {
          return;
        }
        setProduct(item);
        setState("success");
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiError && error.status === 404) {
          setProduct(null);
          setState("success");
          return;
        }
        setState("error");
        setErrorMessage(error instanceof Error ? error.message : "Failed to load product.");
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [id, reloadNonce]);

  const onAddToCart = async () => {
    if (!product) {
      return;
    }

    if (auth.status !== "authenticated") {
      const guestCart = getGuestCart();
      guestCart[product.id] = Math.min((guestCart[product.id] ?? 0) + 1, 20, product.stock);
      if (guestCart[product.id] < 1) {
        setActionMessage("This product is out of stock.");
        return;
      }
      setGuestCart(guestCart);
      setActionMessage("Cart saved. Continue with Google sign-in.");
      window.location.assign(getGoogleAuthStartUrl());
      return;
    }

    setAdding(true);
    setActionMessage("");

    try {
      const cart = await getCart();
      const existing = cart.items.find((item) => item.productId === product.id);
      const nextQuantity = Math.min((existing?.quantity ?? 0) + 1, 20, product.stock);
      if (nextQuantity < 1) {
        setActionMessage("This product is out of stock.");
        return;
      }
      await setCartItemQuantity(product.id, nextQuantity);
      setActionMessage("Added to cart.");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Could not add to cart.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <main className="page" aria-live="polite">
      <header className="page-header">
        <h1>Product Detail</h1>
        <p>
          <Link to="/">Back to catalogue</Link>
        </p>
      </header>

      <section className="panel">
        {state === "loading" && <p>Loading product...</p>}

        {state === "error" && (
          <div role="alert" className="status-block error-block">
            <p>{errorMessage || "Could not load product."}</p>
            <button type="button" onClick={() => setReloadNonce((value) => value + 1)}>
              Retry
            </button>
          </div>
        )}

        {state === "success" && !product && (
          <div className="status-block empty-block">
            <p>This product is not available.</p>
          </div>
        )}

        {state === "success" && product && (
          <article className="product-detail">
            <figure>
              <ProductImage
                src={product.image_url}
                name={product.name}
                className="product-detail-image"
                width={600}
                height={450}
                eager
              />
              <figcaption>{product.name}</figcaption>
            </figure>

            <div className="detail-content">
              <h2>{product.name}</h2>
              <p>{product.description || "No description available yet."}</p>
              <dl>
                <dt>Origin</dt>
                <dd>{product.origin}</dd>
                <dt>Roast</dt>
                <dd>{product.roast_level}</dd>
                <dt>Price</dt>
                <dd>{formatCents(product.price_cents)}</dd>
                <dt>Stock</dt>
                <dd>{product.stock}</dd>
              </dl>

              <button
                type="button"
                onClick={onAddToCart}
                disabled={adding || product.stock <= 0}
                aria-disabled={adding || product.stock <= 0}
              >
                {product.stock <= 0 ? "Out of stock" : adding ? "Adding..." : "Add to cart"}
              </button>
              {actionMessage && <p className="action-message">{actionMessage}</p>}
            </div>
          </article>
        )}
      </section>
    </main>
  );
}
