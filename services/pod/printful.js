import fetch from "node-fetch";

const API_BASE = "https://api.printful.com";

function getHeaders() {
  const key = process.env.PRINTFUL_API_KEY?.trim();
  const storeId = process.env.PRINTFUL_STORE_ID?.trim();

  if (!key) {
    throw new Error("Missing PRINTFUL_API_KEY");
  }

  if (!storeId) {
    throw new Error("Missing PRINTFUL_STORE_ID");
  }

  return {
    Authorization: `Bearer ${key}`,
    "X-PF-Store-Id": storeId,
    "Content-Type": "application/json",
  };
}


export async function listProducts() {

  const res = await fetch(
    `${API_BASE}/store/products`,
    {
      method: "GET",
      headers: getHeaders(),
    }
  );

  const json = await res.json();

  if (!res.ok) {
    throw new Error(
      JSON.stringify(json)
    );
  }

  return json;
}


export async function getProduct(id) {

  if (!id) {
    throw new Error("Printful product ID is required");
  }

  const res = await fetch(
    `${API_BASE}/store/products/${id}`,
    {
      method: "GET",
      headers: getHeaders(),
    }
  );

  const json = await res.json();

  if (!res.ok) {
    throw new Error(
      JSON.stringify(json)
    );
  }

  return json;
}


export async function createProduct(product) {

  const res = await fetch(
    `${API_BASE}/store/products`,
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(product),
    }
  );

  const json = await res.json();

  if (!res.ok) {
    throw new Error(
      JSON.stringify(json)
    );
  }

  return json;
}


export async function createOrder(order) {
  if (!order || !order.recipient) {
    throw new Error('Printful order recipient is required');
  }

  if (!Array.isArray(order.items) || order.items.length === 0) {
    throw new Error('Printful order items are required');
  }

  const res = await fetch(
    API_BASE + '/orders',
    {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(order),
    }
  );

  const json = await res.json();

  if (!res.ok) {
    throw new Error(JSON.stringify(json));
  }

  return json;
}


export default {
  listProducts,
  getProduct,
  createProduct,
  createOrder,
};
