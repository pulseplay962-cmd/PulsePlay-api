import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test, { after, before } from "node:test";
import express from "express";

const requests = [];
let mockDb;
let appServer;
let baseUrl;

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

before(async () => {
  mockDb = createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    requests.push({
      method: req.method,
      pathname: url.pathname,
      search: url.search,
    });

    if (url.pathname === "/rest/v1/affiliate_links" && req.method === "GET") {
      if (url.searchParams.has("affiliate_url")) {
        const idFilter = url.searchParams.get("id");
        if (idFilter === "eq.test-link" && url.searchParams.get("status") === "eq.active") {
          return json(res, 200, [{
            id: "test-link",
            product_id: "test-product",
            affiliate_url: "https://merchant.example/item?tag=test",
            status: "active",
          }]);
        }
        return json(res, 200, []);
      }

      return json(res, 200, [{
        id: "test-link",
        product_id: "test-product",
      }]);
    }

    if (url.pathname === "/rest/v1/affiliate_clicks" && req.method === "POST") {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        requests.push({ method: "POST_BODY", pathname: url.pathname, body });
        res.writeHead(201, { "content-type": "application/json" });
        res.end();
      });
      return;
    }

    if (url.pathname === "/rest/v1/rpc/increment_affiliate_clicks" && req.method === "POST") {
      res.writeHead(204);
      return res.end();
    }

    return json(res, 404, { message: "Unexpected mock database request", path: url.pathname });
  });

  mockDb.listen(0, "127.0.0.1");
  await once(mockDb, "listening");
  const dbPort = mockDb.address().port;

  process.env.SUPABASE_URL = `http://127.0.0.1:${dbPort}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

  const { default: monetizationRoutes } = await import("../routes/monetization.js");
  const app = express();
  app.use(express.json());
  app.use("/api/monetization", monetizationRoutes);

  appServer = createServer(app);
  appServer.listen(0, "127.0.0.1");
  await once(appServer, "listening");
  baseUrl = `http://127.0.0.1:${appServer.address().port}`;
});

after(async () => {
  if (appServer) appServer.close();
  if (mockDb) mockDb.close();
});

test("public affiliate map returns only active link and product IDs", async () => {
  const response = await fetch(`${baseUrl}/api/monetization/public-links`);
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.deepEqual(body, {
    success: true,
    links: [{ id: "test-link", product_id: "test-product" }],
  });
  assert.equal(JSON.stringify(body).includes("affiliate_url"), false);
});

test("tracked affiliate redirect records click and redirects to destination", async () => {
  const response = await fetch(
    `${baseUrl}/api/monetization/go/test-link?session_id=test-session&page_path=%2Fstore&campaign=integration-test`,
    { redirect: "manual", headers: { referer: "https://pulseplay.example/store" } },
  );

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://merchant.example/item?tag=test");

  const clickRequest = requests.find(
    (request) => request.method === "POST_BODY" && request.pathname === "/rest/v1/affiliate_clicks",
  );
  assert.ok(clickRequest, "affiliate click should be inserted");
  const click = JSON.parse(clickRequest.body);
  assert.equal(click.affiliate_link_id, "test-link");
  assert.equal(click.product_id, "test-product");
  assert.equal(click.session_id, "test-session");
  assert.equal(click.page_path, "/store");
  assert.equal(click.campaign, "integration-test");
  assert.equal(click.referrer, "https://pulseplay.example/store");

  assert.ok(requests.some(
    (request) => request.method === "POST" && request.pathname === "/rest/v1/rpc/increment_affiliate_clicks",
  ), "click counter RPC should be called");
});

test("inactive or unknown affiliate links do not redirect", async () => {
  const response = await fetch(
    `${baseUrl}/api/monetization/go/unknown-link`,
    { redirect: "manual" },
  );
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("location"), null);
});
