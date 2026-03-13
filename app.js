async function analyze() {

  const url = document.getElementById("urlInput").value.trim()

  const result = document.getElementById("result")

  result.innerHTML = "Analyzing..."

  const lowerUrl = url.toLowerCase()

  let platform = "unknown"

  if (lowerUrl.includes("kalshi")) platform = "kalshi"
  if (lowerUrl.includes("polymarket")) platform = "polymarket"
  if (lowerUrl.includes("gemini")) platform = "gemini"
  if (lowerUrl.includes("coinbase")) platform = "coinbase"

  if (platform === "polymarket") {

    try {

      // Extract slug and strip any query params or hash fragments
      const eventPart = url.split("/event/")[1]
      if (!eventPart) throw new Error("Invalid Polymarket URL. Expected: polymarket.com/event/<slug>")
      const slug = eventPart.split("?")[0].split("#")[0].replace(/\/$/, "")

      // Use the local server proxy to avoid CORS/ad-blocker issues
      const api = `/api/polymarket?slug=${encodeURIComponent(slug)}`

      const res = await fetch(api)

      if (!res.ok) throw new Error(`API request failed with status ${res.status}`)

      const data = await res.json()

      // Response is an array — grab the first matching event
      const event = Array.isArray(data) ? data[0] : data
      if (!event) throw new Error("No event found for that URL.")

      const market = event.markets && event.markets[0]
      if (!market) throw new Error("No market data found in event.")

      // outcomes and outcomePrices are JSON strings in the API response
      const outcomes = typeof market.outcomes === "string"
        ? JSON.parse(market.outcomes)
        : market.outcomes

      const prices = typeof market.outcomePrices === "string"
        ? JSON.parse(market.outcomePrices)
        : market.outcomePrices

      let html = `
        <h2>${event.title}</h2>
        <p><b>Volume:</b> $${parseFloat(event.volume || 0).toLocaleString()}</p>
        <h3>Outcomes</h3>
      `

      outcomes.forEach((name, i) => {
        const price = prices ? parseFloat(prices[i]) : 0
        html += `<p>${name} — ${Math.round(price * 100)}%</p>`
      })

      result.innerHTML = html

    } catch (err) {

      console.error("Polymarket fetch error:", err)
      result.innerHTML = `Could not fetch Polymarket data: ${err.message}`

    }

  }

  else if (platform === "kalshi") {

    try {

      // Extract the last path segment as the ticker (uppercase)
      // The proxy will try market endpoint first, then event endpoint as fallback
      if (!url.includes("/markets/") && !url.includes("/events/")) {
        throw new Error("Invalid Kalshi URL. Expected: kalshi.com/markets/... or kalshi.com/events/...")
      }
      const cleanPath = url.split("?")[0].split("#")[0].replace(/\/$/, "")
      const ticker = cleanPath.split("/").pop().toUpperCase()

      const api = `/api/kalshi?ticker=${encodeURIComponent(ticker)}`

      const res = await fetch(api)

      const data = await res.json()

      if (!res.ok) throw new Error(data.error || `API request failed with status ${res.status}`)

      // Market URL response: { market: { title, yes_bid, no_bid, volume } }
      function renderMarket(m) {
        // Use midpoint of bid/ask for best probability estimate
        const yesBid = m.yes_bid || 0
        const yesAsk = m.yes_ask || 0
        const yesPct = yesAsk > 0
          ? Math.round((yesBid + yesAsk) / 2 * 100)
          : Math.round(yesBid * 100)
        const noPct = 100 - yesPct

        const volume = (m.volume || 0).toLocaleString()
        const openInterest = (m.open_interest || 0).toLocaleString()
        const status = m.status ? m.status.charAt(0).toUpperCase() + m.status.slice(1) : ""
        const result = m.result ? `<p><b>Result:</b> ${m.result.toUpperCase()}</p>` : ""
        const closeTime = m.close_time
          ? `<p><b>Closes:</b> ${new Date(m.close_time).toLocaleString()}</p>`
          : ""

        return `
          <div style="margin: 16px 0; padding: 14px; background: #1a1a1a; border-radius: 8px; text-align: left;">
            <p style="font-size:17px; font-weight:bold; margin:0 0 10px">${m.title}</p>
            <p>Yes — <b>${yesPct}%</b> &nbsp;|&nbsp; No — <b>${noPct}%</b></p>
            <p><b>Volume:</b> ${volume} contracts &nbsp;|&nbsp; <b>Open Interest:</b> ${openInterest}</p>
            <p><b>Status:</b> ${status}</p>
            ${result}
            ${closeTime}
          </div>
        `
      }

      if (data.market) {

        result.innerHTML = `<h2 style="margin-bottom:4px">${data.market.title}</h2>` + renderMarket(data.market)

      } else if (data.event) {

        const ev = data.event
        let html = `<h2 style="margin-bottom:4px">${ev.title}</h2>`
        ;(ev.markets || []).forEach(m => { html += renderMarket(m) })
        result.innerHTML = html

      } else {
        throw new Error("Unexpected response from Kalshi API.")
      }

    } catch (err) {

      console.error("Kalshi fetch error:", err)
      result.innerHTML = `Could not fetch Kalshi data: ${err.message}`

    }

  }

  else {

    result.innerHTML =
      "Platform detected but data fetching not added yet."

  }

}
