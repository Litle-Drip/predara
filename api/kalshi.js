const https = require("https")

module.exports = (req, res) => {
  const apiKey = process.env.KALSHI_API_KEY

  if (!apiKey) {
    res.status(503).json({ error: "Kalshi API key not configured. Add KALSHI_API_KEY to Vercel environment variables." })
    return
  }

  const ticker = req.query.ticker
  const type = req.query.type  // "market" or "event" — passed explicitly from the frontend

  if (!ticker) {
    res.status(400).json({ error: "Missing ticker" })
    return
  }

  const isMarket = type === "market"

  const apiPath = isMarket
    ? `/trade-api/v2/markets/${encodeURIComponent(ticker)}`
    : `/trade-api/v2/events/${encodeURIComponent(ticker)}?with_nested_markets=true`

  const options = {
    hostname: "trading-api.kalshi.com",
    path: apiPath,
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  }

  https.request(options, (apiRes) => {
    let body = ""
    apiRes.on("data", (chunk) => { body += chunk })
    apiRes.on("end", () => {
      res.setHeader("Access-Control-Allow-Origin", "*")
      res.status(apiRes.statusCode).send(body)
    })
  }).on("error", (err) => {
    res.status(502).json({ error: err.message })
  }).end()
}
