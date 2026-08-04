import fetch from "node-fetch";

const API_BASE = "https://api.printful.com";

function authHeader(){
  const key = process.env.PRINTFUL_API_KEY?.trim();
  if(!key) throw new Error("Missing PRINTFUL_API_KEY");
  return { Authorization: `Basic ${Buffer.from(key + ":").toString("base64")}` };
}

export async function listProducts(){
  const res = await fetch(`${API_BASE}/store/products`, {
    headers: { ...authHeader() }
  });

  if(!res.ok) throw new Error(`Printful error: ${res.status}`);
  return res.json();
}

export async function createProduct(product){
  // product: { sync_product } per Printful API
  const res = await fetch(`${API_BASE}/store/products`, {
    method: "POST",
    headers: { ...authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(product)
  });

  const json = await res.json();
  if(!res.ok) throw new Error(JSON.stringify(json));
  return json;
}

export default { listProducts, createProduct };
