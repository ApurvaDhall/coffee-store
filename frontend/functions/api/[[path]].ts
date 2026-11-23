const WORKER_ORIGIN = "https://coffee-backend.apurvadhall.workers.dev";

export async function onRequest(context: {
  request: Request;
  next: () => Promise<Response>;
}) {
  const requestUrl = new URL(context.request.url);
  const targetUrl = new URL(`${WORKER_ORIGIN}${requestUrl.pathname}${requestUrl.search}`);

  const headers = new Headers(context.request.headers);
  headers.set("X-Forwarded-Host", requestUrl.host);

  const body =
    context.request.method === "GET" || context.request.method === "HEAD"
      ? undefined
      : context.request.body;

  return fetch(targetUrl, {
    method: context.request.method,
    headers,
    body,
    redirect: "manual"
  });
}
