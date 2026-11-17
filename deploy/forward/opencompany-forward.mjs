// The public front proxies to i1 on port 3000; the application itself runs on i2.
// This forwards that port straight through, so the public URL keeps one origin and one
// copy of the application, with no DNS or proxy change when it moves.
//
// Plain TCP on purpose: the TLS-terminating proxy in front still owns the certificate,
// the Host header arrives unchanged, and the application never learns it moved.
//
// Installed by deploy/install-forward.sh as opencompany-forward.service.
import net from "node:net";

const listenPort = Number(process.env.FORWARD_PORT ?? 3000);
const targetHost = process.env.FORWARD_HOST ?? "192.168.1.52";
const targetPort = Number(process.env.FORWARD_TARGET_PORT ?? 3001);

const server = net.createServer((client) => {
  const upstream = net.connect(targetPort, targetHost);

  const close = () => {
    client.destroy();
    upstream.destroy();
  };

  client.pipe(upstream);
  upstream.pipe(client);
  client.on("error", close);
  upstream.on("error", close);
  client.on("end", () => upstream.end());
  upstream.on("end", () => client.end());
});

// A connection to a stopped application must not take the listener down with it.
server.on("error", (error) => {
  console.error(`[forward] ${String(error)}`);
});

server.listen(listenPort, "0.0.0.0", () => {
  console.log(`[forward] :${listenPort} -> ${targetHost}:${targetPort}`);
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    console.log(`[forward] ${signal}; closing :${listenPort}`);
    server.close(() => process.exit(0));
  });
}
