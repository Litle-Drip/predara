function analyze() {

  const url = document.getElementById("urlInput").value.toLowerCase()

  let platform = "Unknown platform"

  if (url.includes("kalshi")) {
    platform = "Kalshi"
  }

  else if (url.includes("polymarket")) {
    platform = "Polymarket"
  }

  else if (url.includes("gemini")) {
    platform = "Gemini"
  }

  else if (url.includes("coinbase")) {
    platform = "Coinbase"
  }

  document.getElementById("result").innerHTML =
    "Detected platform: <b>" + platform + "</b>"

}
