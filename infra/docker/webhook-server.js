const http = require("http");

const port = Number(process.env.PORT || 9000);

const server = http.createServer((req, res) => {
  if (req.method !== "POST") {
    res.statusCode = 404;
    res.end("Not Found");
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString("utf8");
  });
  req.on("end", () => {
    let parsed = body;
    try {
      parsed = JSON.parse(body);
    } catch {
      // Leave as raw string if not JSON.
    }
    console.log("Webhook received:", parsed);
    res.statusCode = 200;
    res.end("ok");
  });
});

server.listen(port, () => {
  console.log(`Webhook receiver listening on ${port}`);
});
