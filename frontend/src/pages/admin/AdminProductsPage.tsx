import { FormEvent, useEffect, useState } from "react";
import {
  ApiError,
  createAdminProduct,
  getAdminProducts,
  updateAdminProduct,
  type AdminProductInput,
  type Product
} from "../../lib/api";

type LoadState = "loading" | "success" | "error";

type ProductFormState = {
  name: string;
  origin: string;
  roast_level: "light" | "medium" | "dark";
  priceRupees: string;
  image_url: string;
  description: string;
  stock: string;
};

const blankForm: ProductFormState = {
  name: "",
  origin: "",
  roast_level: "medium",
  priceRupees: "",
  image_url: "",
  description: "",
  stock: "0"
};

function rupeesToPaise(value: string): number {
  const rupees = Number(value);
  return Math.round(rupees * 100);
}

function paiseToRupees(value: number): string {
  return (value / 100).toFixed(2);
}

function formFromProduct(product: Product): ProductFormState {
  return {
    name: product.name,
    origin: product.origin,
    roast_level: product.roast_level as "light" | "medium" | "dark",
    priceRupees: paiseToRupees(product.price_cents),
    image_url: product.image_url ?? "",
    description: product.description ?? "",
    stock: String(product.stock)
  };
}

function formatCents(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR"
  }).format(value / 100);
}

export default function AdminProductsPage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [addForm, setAddForm] = useState<ProductFormState>(blankForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ProductFormState>(blankForm);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoadState("loading");
      setErrorMessage("");

      try {
        const response = await getAdminProducts({ page: 1, pageSize: 50 });
        if (cancelled) return;
        setProducts(response.items);
        setLoadState("success");
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 403) {
          setErrorMessage("403 Forbidden: You do not have permission to manage products.");
        } else {
          setErrorMessage(error instanceof Error ? error.message : "Could not load products.");
        }
        setLoadState("error");
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [reloadNonce]);

  const toInput = (form: ProductFormState): AdminProductInput | null => {
    const priceCents = rupeesToPaise(form.priceRupees);
    const stock = Number(form.stock);

    if (!form.name.trim() || !form.origin.trim()) {
      setErrorMessage("Name and origin are required.");
      return null;
    }
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      setErrorMessage("Price in rupees must be zero or greater.");
      return null;
    }
    if (!Number.isInteger(stock) || stock < 0) {
      setErrorMessage("Stock must be a whole number zero or greater.");
      return null;
    }

    return {
      name: form.name.trim(),
      origin: form.origin.trim(),
      roast_level: form.roast_level,
      price_cents: priceCents,
      image_url: form.image_url.trim(),
      description: form.description.trim(),
      stock
    };
  };

  const onAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = toInput(addForm);
    if (!input) return;

    setSavingId("add");
    setErrorMessage("");

    try {
      const created = await createAdminProduct(input);
      setProducts((current) => [created, ...current]);
      setAddForm(blankForm);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not create product.");
    } finally {
      setSavingId(null);
    }
  };

  const onEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingId) return;

    const input = toInput(editForm);
    if (!input) return;

    setSavingId(editingId);
    setErrorMessage("");

    try {
      const updated = await updateAdminProduct(editingId, input);
      setProducts((current) => current.map((item) => (item.id === editingId ? updated : item)));
      setEditingId(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not update product.");
    } finally {
      setSavingId(null);
    }
  };

  const startEdit = (product: Product) => {
    setEditingId(product.id);
    setEditForm(formFromProduct(product));
    setErrorMessage("");
  };

  return (
    <>
      <section className="panel">
        <h2>Add product</h2>
        <ProductForm
          idPrefix="add"
          form={addForm}
          setForm={setAddForm}
          onSubmit={onAdd}
          submitLabel="Add product"
          saving={savingId === "add"}
        />
      </section>

      {errorMessage && (
        <div role="alert" className="status-block error-block">
          <p>{errorMessage}</p>
        </div>
      )}

      <section className="panel" aria-label="Product administration">
        <h2>Products</h2>
        {loadState === "loading" && <p>Loading products...</p>}

        {loadState === "error" && (
          <div role="alert" className="status-block error-block">
            <p>{errorMessage}</p>
            <button type="button" onClick={() => setReloadNonce((value) => value + 1)}>
              Retry
            </button>
          </div>
        )}

        {loadState === "success" && products.length === 0 && (
          <div className="status-block empty-block">
            <p>No products yet.</p>
          </div>
        )}

        {loadState === "success" && products.length > 0 && (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Admin product inventory</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Origin</th>
                  <th scope="col">Roast</th>
                  <th scope="col">Price</th>
                  <th scope="col">Stock</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <td>{product.name}</td>
                    <td>{product.origin}</td>
                    <td>{product.roast_level}</td>
                    <td>{formatCents(product.price_cents)}</td>
                    <td>{product.stock}</td>
                    <td>
                      <button type="button" onClick={() => startEdit(product)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editingId && (
        <section className="panel">
          <h2>Edit product</h2>
          <ProductForm
            idPrefix="edit"
            form={editForm}
            setForm={setEditForm}
            onSubmit={onEdit}
            submitLabel="Save changes"
            saving={savingId === editingId}
          />
          <button type="button" onClick={() => setEditingId(null)} disabled={savingId === editingId}>
            Cancel
          </button>
        </section>
      )}
    </>
  );
}

function ProductForm(props: {
  idPrefix: string;
  form: ProductFormState;
  setForm: (form: ProductFormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitLabel: string;
  saving: boolean;
}) {
  const setField = (field: keyof ProductFormState, value: string) => {
    props.setForm({
      ...props.form,
      [field]: value
    });
  };

  return (
    <form className="admin-form" onSubmit={props.onSubmit}>
      <label htmlFor={`${props.idPrefix}-name`}>Name</label>
      <input id={`${props.idPrefix}-name`} value={props.form.name} onChange={(event) => setField("name", event.target.value)} required />

      <label htmlFor={`${props.idPrefix}-origin`}>Origin</label>
      <input id={`${props.idPrefix}-origin`} value={props.form.origin} onChange={(event) => setField("origin", event.target.value)} required />

      <label htmlFor={`${props.idPrefix}-roast`}>Roast level</label>
      <select id={`${props.idPrefix}-roast`} value={props.form.roast_level} onChange={(event) => setField("roast_level", event.target.value)}>
        <option value="light">Light</option>
        <option value="medium">Medium</option>
        <option value="dark">Dark</option>
      </select>

      <label htmlFor={`${props.idPrefix}-price`}>Price (rupees)</label>
      <input id={`${props.idPrefix}-price`} type="number" min="0" step="0.01" value={props.form.priceRupees} onChange={(event) => setField("priceRupees", event.target.value)} required />

      <label htmlFor={`${props.idPrefix}-image`}>Image URL</label>
      <input id={`${props.idPrefix}-image`} type="url" value={props.form.image_url} onChange={(event) => setField("image_url", event.target.value)} />

      <label htmlFor={`${props.idPrefix}-description`}>Description</label>
      <textarea id={`${props.idPrefix}-description`} rows={4} value={props.form.description} onChange={(event) => setField("description", event.target.value)} />

      <label htmlFor={`${props.idPrefix}-stock`}>Stock</label>
      <input id={`${props.idPrefix}-stock`} type="number" min="0" step="1" value={props.form.stock} onChange={(event) => setField("stock", event.target.value)} required />

      <button type="submit" disabled={props.saving}>{props.saving ? "Saving..." : props.submitLabel}</button>
    </form>
  );
}
