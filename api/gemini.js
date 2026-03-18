const https = require("https")

const REQUEST_TIMEOUT_MS = 10000
const PAGE_TIMEOUT_MS    = 8000

function isSafeParam(str) {
  return typeof str === "string" && /^[A-Za-z0-9_\-\.]+$/.test(str)
}

function isSafeUrl(str) {
  if (typeof str !== "string") return false
  try {
    const u = new URL(str)
    return (u.protocol === "https:" || u.protocol === "http:") &&
           u.hostname.endsWith("gemini.com")
  } catch { return false }
}

// Fetch a URL server-side and return the response body as a string.
function fetchHtml(targetUrl) {
  return new Promise((resolve, reject) => {
    const req = https.get(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    }, (apiRes) => {
      // Follow one redirect
      if ((apiRes.statusCode === 301 || apiRes.statusCode === 302) && apiRes.headers.location) {
        return fetchHtml(apiRes.headers.location).then(resolve).catch(reject)
      }
      let body = ""
      apiRes.on("data", (chunk) => { body += chunk })
      apiRes.on("end", () => resolve({ status: apiRes.statusCode, body }))
    })
    req.setTimeout(PAGE_TIMEOUT_MS, () => { req.destroy(); reject(new Error("timeout")) })
    req.on("error", reject)
  })
}

// Extract the first Builder.io CDN asset URL from page HTML.
// Looks inside __NEXT_DATA__ JSON first, then falls back to a raw regex.
function extractContractUrl(html) {
  // Try __NEXT_DATA__ JSON first (Next.js bakes page props into the HTML)
  const ndMatch = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i)
  if (ndMatch) {
    try {
      const nd = JSON.parse(ndMatch[1])
      const ndStr = JSON.stringify(nd)
      // Find all builder.io CDN asset URLs in the JSON blob
      const hits = [...ndStr.matchAll(/https?:\/\/cdn\.builder\.io\/o\/assets[^"\\]+/g)]
      if (hits.length) return hits[0][0].replace(/\\u0026/g, "&").replace(/\\\//g, "/")
    } catch (_) { /* fall through */ }
  }
  // Raw search across the full HTML
  const m = html.match(/https?:\/\/cdn\.builder\.io\/o\/assets[^\s"'<>]+/)
  return m ? m[0] : null
}

module.exports = async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type")
    return res.status(204).end()
  }

  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Content-Type", "application/json")

  const ticker  = req.query.ticker
  const pageUrl = req.query.pageUrl  // full market page URL (optional)

  if (!ticker || !isSafeParam(ticker)) {
    return res.status(400).json({ error: "Missing or invalid ticker" })
  }
  if (pageUrl && !isSafeUrl(pageUrl)) {
    return res.status(400).json({ error: "Invalid pageUrl" })
  }

  const target = `https://api.gemini.com/v1/prediction-markets/events/${encodeURIComponent(ticker)}`

  // Fetch Gemini event API + optionally scrape the market page in parallel
  const eventFetch = new Promise((resolve, reject) => {
    const proxyReq = https.get(target, (apiRes) => {
      let body = ""
      apiRes.on("data", (chunk) => { body += chunk })
      apiRes.on("end", () => resolve({ status: apiRes.statusCode, body }))
    })
    proxyReq.setTimeout(REQUEST_TIMEOUT_MS, () => {
      proxyReq.destroy()
      reject(new Error("Gemini API request timed out"))
    })
    proxyReq.on("error", reject)
  })

  const pageFetch = pageUrl
    ? fetchHtml(pageUrl).catch(() => null)
    : Promise.resolve(null)

  let eventResult, pageResult
  try {
    ;[eventResult, pageResult] = await Promise.all([eventFetch, pageFetch])
  } catch (err) {
    return res.status(502).json({ error: err.message })
  }

  if (eventResult.status !== 200) {
    if (eventResult.status === 404) {
      return res.status(404).json({ error: `Ticker "${ticker}" not found on Gemini. Make sure you have the full ticker (e.g. TPC2026T5, not TPC2026T).` })
    }
    return res.status(eventResult.status).json({ error: `Gemini API returned ${eventResult.status}` })
  }

  let data
  try { data = JSON.parse(eventResult.body) } catch {
    return res.status(502).json({ error: "Invalid response from Gemini API" })
  }

  // Attach contract terms URL if we found one on the market page
  if (pageResult && pageResult.status === 200) {
    const contractUrl = extractContractUrl(pageResult.body)
    if (contractUrl) data._contract_url = contractUrl
  }

  return res.status(200).json(data)
}
