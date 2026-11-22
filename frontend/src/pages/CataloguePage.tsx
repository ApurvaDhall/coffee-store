import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ApiError,
  findCoffee,
  getProducts,
  type CoffeeFinderMatch,
  type CoffeeFinderResponse,
  type Product,
  type ProductListResponse
} from "../lib/api";
import ProductImage from "../components/ProductImage";

type LoadState = "idle" | "loading" | "success" | "error";

type Filters = {
  q: string;
  roast: string;
  origin: string;
  minPrice: string;
  maxPrice: string;
  page: string;
  pageSize: string;
};

const DEFAULT_FILTERS: Filters = {
  q: "",
  roast: "",
  origin: "",
  minPrice: "",
  maxPrice: "",
  page: "1",
  pageSize: "12"
};

function readFilters(params: URLSearchParams): Filters {
  return {
    q: params.get("q") ?? DEFAULT_FILTERS.q,
    roast: params.get("roast") ?? DEFAULT_FILTERS.roast,
    origin: params.get("origin") ?? DEFAULT_FILTERS.origin,
    minPrice: params.get("minPrice") ?? DEFAULT_FILTERS.minPrice,
    maxPrice: params.get("maxPrice") ?? DEFAULT_FILTERS.maxPrice,
    page: params.get("page") ?? DEFAULT_FILTERS.page,
    pageSize: params.get("pageSize") ?? DEFAULT_FILTERS.pageSize
  };
}

function toPositiveNumberOrUndefined(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function toIntOrFallback(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

function formatCents(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR"
  }).format(value / 100);
}

export default function CataloguePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [form, setForm] = useState<Filters>(() => readFilters(searchParams));
  const [state, setState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [data, setData] = useState<ProductListResponse | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [finderQuery, setFinderQuery] = useState("");
  const [finderLoading, setFinderLoading] = useState(false);
  const [finderError, setFinderError] = useState("");
  const [finderResult, setFinderResult] = useState<CoffeeFinderResponse | null>(null);

  useEffect(() => {
    setForm(readFilters(searchParams));
  }, [searchParams]);

  const query = useMemo(() => {
    const filters = readFilters(searchParams);

    return {
      q: filters.q || undefined,
      roast: filters.roast || undefined,
      origin: filters.origin || undefined,
      minPrice: toPositiveNumberOrUndefined(filters.minPrice),
      maxPrice: toPositiveNumberOrUndefined(filters.maxPrice),
      page: toIntOrFallback(filters.page, 1),
      pageSize: Math.min(toIntOrFallback(filters.pageSize, 12), 50)
    };
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setState("loading");
      setErrorMessage("");

      try {
        const response = await getProducts(query);
        if (cancelled) {
          return;
        }
        setData(response);
        setState("success");
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message =
          error instanceof ApiError
            ? error.message
            : "Failed to load catalogue (HTTP unknown).";
        setErrorMessage(message);
        setState("error");
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [query, reloadNonce]);

  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 12;
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const updateSearchParams = (next: Partial<Filters>) => {
    const merged: Filters = {
      ...form,
      ...next
    };

    const params = new URLSearchParams();
    Object.entries(merged).forEach(([key, value]) => {
      if (value.trim().length > 0) {
        params.set(key, value);
      }
    });

    setSearchParams(params);
  };

  useEffect(() => {
    if (state === "success" && page > totalPages) {
      const params = new URLSearchParams(searchParams);
      params.set("page", String(totalPages));
      setSearchParams(params, { replace: true });
    }
  }, [page, state, totalPages, searchParams, setSearchParams]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateSearchParams({ page: "1" });
  };

  const onPageChange = (nextPage: number) => {
    const safePage = Math.max(1, Math.min(nextPage, totalPages));
    updateSearchParams({ page: String(safePage) });
  };

  const onFindCoffee = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!finderQuery.trim()) {
      setFinderError("Describe the coffee you are looking for.");
      setFinderResult(null);
      return;
    }

    setFinderLoading(true);
    setFinderError("");
    setFinderResult(null);

    try {
      const response = await findCoffee(finderQuery.trim());
      setFinderResult({
        ...response,
        items: response.items.slice(0, 3)
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        setFinderError("Too many requests. Please try again in a minute.");
      } else {
        setFinderError(error instanceof Error ? error.message : "Coffee Finder is unavailable.");
      }
    } finally {
      setFinderLoading(false);
    }
  };

  return (
    <main className="page" aria-live="polite">
      <header className="page-header">
        <h1>Coffee Catalogue</h1>
        <p>Explore single origins and blends from around the world.</p>
      </header>

      <section className="panel" aria-label="Catalogue filters">
        <h2>Filters</h2>
        <form className="filters-grid" onSubmit={onSubmit}>
          <label htmlFor="q-input">Search</label>
          <input
            id="q-input"
            name="q"
            type="search"
            value={form.q}
            onChange={(event) => setForm((prev) => ({ ...prev, q: event.target.value }))}
            placeholder="Name or origin"
          />

          <label htmlFor="roast-input">Roast level</label>
          <select
            id="roast-input"
            name="roast"
            value={form.roast}
            onChange={(event) => setForm((prev) => ({ ...prev, roast: event.target.value }))}
          >
            <option value="">Any roast</option>
            <option value="light">Light</option>
            <option value="medium">Medium</option>
            <option value="dark">Dark</option>
          </select>

          <label htmlFor="origin-input">Origin</label>
          <input
            id="origin-input"
            name="origin"
            type="text"
            value={form.origin}
            onChange={(event) => setForm((prev) => ({ ...prev, origin: event.target.value }))}
            placeholder="e.g. Ethiopia"
          />

          <label htmlFor="min-price-input">Min price (cents)</label>
          <input
            id="min-price-input"
            name="minPrice"
            type="number"
            min={0}
            step={1}
            value={form.minPrice}
            onChange={(event) => setForm((prev) => ({ ...prev, minPrice: event.target.value }))}
          />

          <label htmlFor="max-price-input">Max price (cents)</label>
          <input
            id="max-price-input"
            name="maxPrice"
            type="number"
            min={0}
            step={1}
            value={form.maxPrice}
            onChange={(event) => setForm((prev) => ({ ...prev, maxPrice: event.target.value }))}
          />

          <label htmlFor="page-size-input">Page size</label>
          <select
            id="page-size-input"
            name="pageSize"
            value={form.pageSize}
            onChange={(event) => setForm((prev) => ({ ...prev, pageSize: event.target.value }))}
          >
            <option value="6">6</option>
            <option value="12">12</option>
            <option value="24">24</option>
            <option value="50">50</option>
          </select>

          <div className="filter-actions">
            <button type="submit">Apply filters</button>
          </div>
        </form>
      </section>

      <section className="panel" aria-label="Coffee finder">
        <h2>Coffee Finder</h2>
        <form className="finder-form" onSubmit={onFindCoffee}>
          <label htmlFor="finder-query">What kind of coffee are you looking for?</label>
          <textarea
            id="finder-query"
            name="query"
            rows={3}
            maxLength={300}
            value={finderQuery}
            onChange={(event) => setFinderQuery(event.target.value)}
            placeholder="For example: a fruity light roast under 2,000 paise"
          />
          <div className="finder-meta">
            <span>{finderQuery.length}/300 characters</span>
            <button type="submit" disabled={finderLoading || !finderQuery.trim()}>
              {finderLoading ? "Finding..." : "Find"}
            </button>
          </div>
        </form>

        {finderLoading && <p>Finding coffees for you...</p>}

        {finderError && (
          <div role="alert" className="status-block error-block">
            <p>{finderError}</p>
          </div>
        )}

        {finderResult && (
          <div className="finder-results" aria-live="polite">
            {finderResult.source === "fallback" && (
              <p className="finder-fallback">
                AI is unavailable, showing keyword matches.
              </p>
            )}

            {finderResult.items.length === 0 ? (
              <p>No coffee matches found.</p>
            ) : (
              <ul className="finder-grid">
                {finderResult.items.map((match: CoffeeFinderMatch) => {
                  const product = match.product;
                  const productId = product?.id ?? match.id;
                  const name = product?.name ?? match.name;
                  const origin = product?.origin ?? match.origin;
                  const roastLevel = product?.roast_level ?? match.roast_level;
                  const priceCents = product?.price_cents ?? match.price_cents;
                  const imageUrl = product?.image_url ?? match.image_url;

                  if (!productId || !name) return null;

                  return (
                    <li key={productId}>
                      <article className="finder-card">
                        <ProductImage
                          src={imageUrl}
                          name={name}
                          className="finder-card-image"
                          width={600}
                          height={450}
                        />
                        <h3>{name}</h3>
                        {(origin || roastLevel) && (
                          <p>{[origin, roastLevel].filter(Boolean).join(" · ")}</p>
                        )}
                        {typeof priceCents === "number" && (
                          <p><strong>{formatCents(priceCents)}</strong></p>
                        )}
                        <p>{match.reason}</p>
                        <Link to={`/products/${encodeURIComponent(productId)}`}>
                          View {name}
                        </Link>
                      </article>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="panel" aria-label="Catalogue results">
        <h2>Products</h2>

        {state === "loading" && <p>Loading products...</p>}

        {state === "error" && (
          <div role="alert" className="status-block error-block">
            <p>{errorMessage || "Could not load products."}</p>
            <button type="button" onClick={() => setReloadNonce((value) => value + 1)}>
              Retry
            </button>
          </div>
        )}

        {state === "success" && (data?.items.length ?? 0) === 0 && (
          <div className="status-block empty-block">
            <p>No coffees match your filters right now.</p>
          </div>
        )}

        {state === "success" && (data?.items.length ?? 0) > 0 && (
          <>
            <p className="result-meta">
              Showing {data?.items.length} of {total} total coffees.
            </p>
            <ul className="product-grid">
              {data?.items.map((product: Product) => (
                <li key={product.id}>
                  <article className="product-card">
                    <ProductImage
                      src={product.image_url}
                      name={product.name}
                      className="product-card-image"
                      width={600}
                      height={450}
                    />
                    <div className="card-content">
                      <h3>
                        <Link to={`/products/${product.id}`}>{product.name}</Link>
                      </h3>
                      <p>
                        <strong>Origin:</strong> {product.origin}
                      </p>
                      <p>
                        <strong>Roast:</strong> {product.roast_level}
                      </p>
                      <p>
                        <strong>Price:</strong> {formatCents(product.price_cents)}
                      </p>
                    </div>
                  </article>
                </li>
              ))}
            </ul>

            <nav className="pagination" aria-label="Pagination">
              <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
                Previous
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
              >
                Next
              </button>
            </nav>
          </>
        )}
      </section>
    </main>
  );
}
