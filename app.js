// ===== Config =====
const ALPHA_VANTAGE_KEY = "ETNWWSKIJ0NQ0J41"; // or your own AV key
const ALERT_THRESHOLD = 2;

// *** PUT YOUR GROQ KEY HERE FOR LOCAL USE ONLY ***
const GROQ_API_KEY = "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"; // local-only

let watchlist = [];

// ===== Alpha Vantage quote fetch (direct, exposes AV key – fine for local) =====
async function fetchRealPrice(symbol) {
  try {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(
      symbol
    )}&apikey=${ALPHA_VANTAGE_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Quote API error: ${res.status}`);
    const data = await res.json();
    const q = data["Global Quote"];
    if (!q || !q["05. price"]) return null;

    const price = parseFloat(q["05. price"]);
    const change = parseFloat(q["09. change"] || "0");
    const percentStr = q["10. change percent"] || "0%";
    const percent = parseFloat(percentStr.replace("%", "") || "0");

    return {
      price,
      change,
      percent,
      open: parseFloat(q["02. open"] || "0"),
      high: parseFloat(q["03. high"] || "0"),
      low: parseFloat(q["04. low"] || "0"),
      prevClose: parseFloat(q["08. previous close"] || "0")
    };
  } catch (err) {
    console.error("Alpha Vantage quote error for", symbol, err);
    return null;
  }
}

// ===== Groq AI call (direct, key in this file – local-only) =====
async function askGroqDirect(symbol, quote) {
  const aiBox = document.getElementById("aiSummaryBox");
  if (!aiBox) return;

  aiBox.innerHTML =
    '<div class="ai-summary-loading">Generating AI summary...</div>';

  const moveLine =
    typeof quote?.price === "number"
      ? `Current price is ${quote.price.toFixed(2)} USD with a move of ${
          quote.change >= 0 ? "+" : ""
        }${quote.change.toFixed(2)} (${quote.percent >= 0 ? "+" : ""}${quote.percent.toFixed(2)}%).`
      : "Recent price data is limited in this context.";

  const prompt = `
You are an equity analyst explaining a single stock to a retail investor.

Stock: ${symbol}

Recent price context:
${moveLine}

Task:
- In 3–5 sentences, summarise what might be driving this stock's recent move.
- Mention whether the move looks large or modest in % terms.
- Use simple language and avoid investment advice.
`;

  try {
    const resp = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: "llama-3.1-70b-versatile",
          messages: [
            {
              role: "system",
              content: "You are a concise, neutral finance assistant."
            },
            { role: "user", content: prompt }
          ]
        })
      }
    );

    if (!resp.ok) {
      aiBox.innerHTML =
        '<div class="ai-summary-loading" style="color:#ff6b6b;">AI request failed.</div>';
      return;
    }

    const data = await resp.json();
    const answer = data.choices?.[0]?.message?.content || "No AI answer.";

    aiBox.innerHTML = `
      <div class="ai-summary-title">AI summary</div>
      <div class="ai-summary-text">${answer}</div>
    `;
  } catch (err) {
    console.error("Groq error:", err);
    aiBox.innerHTML =
      '<div class="ai-summary-loading" style="color:#ff6b6b;">Error talking to AI.</div>';
  }
}

// ===== Details panel =====
async function showDetails(symbol) {
  const details = document.getElementById("detailsContent");
  details.innerHTML =
    '<div style="font-size:13px; color:var(--color-text-secondary);">Loading stock details...</div>';

  const fromList = watchlist.find((w) => w.symbol === symbol);
  const quote = fromList?.raw || (await fetchRealPrice(symbol));

  let headerHtml = `
    <div style="margin-bottom:12px;">
      <div style="font-size:16px; font-weight:600; margin-bottom:4px;">${symbol}</div>
    </div>
  `;

  let quoteHtml = "";
  if (quote) {
    const isUp = quote.change >= 0;
    quoteHtml = `
      <div style="margin-bottom:12px;">
        <div class="price-line">
          $${quote.price.toFixed(2)}
          <span style="color:${isUp ? "#22c55e" : "#ff6b6b"};">
            ${isUp ? "+" : ""}${quote.change.toFixed(2)}
            (${quote.percent >= 0 ? "+" : ""}${quote.percent.toFixed(2)}%)
          </span>
        </div>
        <div class="meta-row">
          O: ${quote.open ? quote.open.toFixed(2) : "-"}
          · H: ${quote.high ? quote.high.toFixed(2) : "-"}
          · L: ${quote.low ? quote.low.toFixed(2) : "-"}
          · Prev: ${quote.prevClose ? quote.prevClose.toFixed(2) : "-"}
        </div>
      </div>
    `;
  } else {
    quoteHtml =
      '<div class="meta-row">Recent price data unavailable from Alpha Vantage.</div>';
  }

  details.innerHTML = `
    ${headerHtml}
    ${quoteHtml}
    <div id="aiSummaryBox" style="margin-top:12px;"></div>
    <div style="margin-top:8px;">
      <button class="btn" id="refreshAiBtn">Refresh AI summary</button>
    </div>
  `;

  const refreshBtn = document.getElementById("refreshAiBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => askGroqDirect(symbol, quote));
  }

  askGroqDirect(symbol, quote);
}

// ===== Watchlist =====
function updateWatchlist() {
  const container = document.getElementById("watchlist");
  if (watchlist.length === 0) {
    container.innerHTML =
      '<div class="empty-state"><div class="empty-state-icon">📋</div><p>No stocks in watchlist. Add one above.</p></div>';
    return;
  }

  container.innerHTML = watchlist
    .map((stock) => {
      const changeNum = parseFloat(stock.change);
      const percentNum = parseFloat(stock.percent);
      const isUp = changeNum >= 0;
      const alert = Math.abs(percentNum) >= ALERT_THRESHOLD;

      return `
        <div class="ticker-card ${alert ? "alert-row" : ""}" data-symbol="${
          stock.symbol
        }">
          <div class="ticker-header">
            <span class="ticker-symbol">${stock.symbol}</span>
            <span class="ticker-price ${isUp ? "up" : "down"}">$${stock.price}</span>
          </div>
          <div class="ticker-change">
            <span>
              <span class="change-value ${isUp ? "up" : "down"}">
                ${isUp ? "+" : ""}${stock.change}
              </span>
              <span class="change-percent">
                (${percentNum >= 0 ? "+" : ""}${stock.percent}%)
              </span>
              ${
                alert
                  ? `<span class="alert-badge">Alert ${percentNum.toFixed(
                      1
                    )}%</span>`
                  : ""
              }
            </span>
            <span>
              <button class="btn-danger" data-symbol="${
                stock.symbol
              }" data-role="remove">Remove</button>
            </span>
          </div>
        </div>
      `;
    })
    .join("");

  document.querySelectorAll(".ticker-card").forEach((card) => {
    const symbol = card.getAttribute("data-symbol");
    card.addEventListener("click", () => showDetails(symbol));
  });

  document
    .querySelectorAll("button[data-role='remove']")
    .forEach((btn) => {
      const symbol = btn.getAttribute("data-symbol");
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeFromWatchlist(symbol);
      });
    });
}

async function addToWatchlist() {
  const input = document.getElementById("symbolInput");
  const symbol = input.value.toUpperCase().trim();
  if (!symbol) {
    alert("Please enter a stock symbol");
    return;
  }
  if (watchlist.find((w) => w.symbol === symbol)) {
    alert("Stock already in watchlist");
    return;
  }

  const btn = document.getElementById("addButton");
  const oldText = btn.textContent;
  btn.textContent = "Loading...";
  btn.disabled = true;

  const priceData = await fetchRealPrice(symbol);

  btn.textContent = oldText;
  btn.disabled = false;

  if (!priceData) {
    alert(`Could not fetch price for ${symbol}. Check symbol or try again.`);
    return;
  }

  watchlist.push({
    symbol,
    price: priceData.price.toFixed(2),
    change: priceData.change.toFixed(2),
    percent: priceData.percent.toFixed(2),
    raw: priceData
  });
  input.value = "";
  updateWatchlist();
}

function removeFromWatchlist(symbol) {
  watchlist = watchlist.filter((w) => w.symbol !== symbol);
  updateWatchlist();
}

async function refreshPrices() {
  if (watchlist.length === 0) return;
  for (let stock of watchlist) {
    const priceData = await fetchRealPrice(stock.symbol);
    if (priceData) {
      stock.price = priceData.price.toFixed(2);
      stock.change = priceData.change.toFixed(2);
      stock.percent = priceData.percent.toFixed(2);
      stock.raw = priceData;
    }
  }
  updateWatchlist();
}

function init() {
  document.getElementById("addButton").addEventListener("click", addToWatchlist);
  document
    .getElementById("symbolInput")
    .addEventListener("keyup", (e) => {
      if (e.key === "Enter") addToWatchlist();
    });

  setInterval(refreshPrices, 60000);
}

document.addEventListener("DOMContentLoaded", init);
