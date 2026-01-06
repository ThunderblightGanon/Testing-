const sampleIndices = [
    { symbol: 'SPX', name: 'S&P 500', price: 5832.41, change: 45.23, percent: 0.78 },
    { symbol: 'INDU', name: 'Dow Jones', price: 42156.34, change: 234.12, percent: 0.56 },
    { symbol: 'CCMP', name: 'Nasdaq', price: 19247.81, change: -12.34, percent: -0.06 },
    { symbol: 'VIX', name: 'Volatility', price: 13.45, change: -0.67, percent: -4.74 }
];

const sampleNews = [
    { title: 'Fed signals pause in rate hikes amid cooling inflation', ticker: 'SPX', time: '2 hours ago', sentiment: 'positive' },
    { title: 'Tesla reports better-than-expected Q4 deliveries', ticker: 'TSLA', time: '3 hours ago', sentiment: 'positive' },
    { title: 'Apple announces new AI features in iOS update', ticker: 'AAPL', time: '4 hours ago', sentiment: 'positive' },
    { title: 'Oil prices rise on supply concerns from Middle East', ticker: 'XLE', time: '5 hours ago', sentiment: 'negative' },
    { title: 'Microsoft cloud division surpasses growth targets', ticker: 'MSFT', time: '6 hours ago', sentiment: 'positive' }
];

const sectors = [
    { name: 'Technology', change: 2.34 },
    { name: 'Healthcare', change: 1.12 },
    { name: 'Finance', change: -0.45 },
    { name: 'Energy', change: -1.23 },
    { name: 'Utilities', change: 0.89 },
    { name: 'Consumer', change: 1.45 },
    { name: 'Industrials', change: 0.67 },
    { name: 'Materials', change: -0.34 }
];

const FINNHUB_API_KEY = 'd5eaap9r01qjckl2rtg0d5eaap9r01qjckl2rtgg';
const ALERT_THRESHOLD = 2;

let watchlist = [];
let currentView = 'watchlist';
const candleCache = {};

function renderIndices() {
    const container = document.getElementById('indicesList');
    container.innerHTML = sampleIndices.map(index => `
        <div class="ticker-card">
            <div class="ticker-header">
                <span class="ticker-symbol">${index.symbol}</span>
                <span class="ticker-price ${index.change >= 0 ? 'up' : 'down'}">${index.price.toFixed(2)}</span>
            </div>
            <div class="ticker-change">
                <span>${index.name}</span>
                <span>
                    <span class="change-value ${index.change >= 0 ? 'up' : 'down'}">${index.change >= 0 ? '+' : ''}${index.change.toFixed(2)}</span>
                    <span class="change-percent">(${index.percent >= 0 ? '+' : ''}${index.percent.toFixed(2)}%)</span>
                </span>
            </div>
        </div>
    `).join('');
}

function renderNews() {
    const container = document.getElementById('newsFeed');
    container.innerHTML = sampleNews.map(news => `
        <div class="news-item">
            <div class="news-title">
                <span class="news-ticker">${news.ticker}</span>
                ${news.title}
            </div>
            <div class="news-meta">
                <span>${news.time}</span>
                <span style="color: ${news.sentiment === 'positive' ? '#22c55e' : '#ff6b6b'}">● ${news.sentiment}</span>
            </div>
        </div>
    `).join('');
}

function renderSectors() {
    const container = document.getElementById('sectorsList');
    container.innerHTML = sectors.map(sector => `
        <div class="sector-item">
            <div class="sector-name">${sector.name}</div>
            <div class="sector-change ${sector.change >= 0 ? 'up' : 'down'}">
                ${sector.change >= 0 ? '+' : ''}${sector.change.toFixed(2)}%
            </div>
        </div>
    `).join('');
}

function renderMarketStats() {
    const container = document.getElementById('marketStats');
    container.innerHTML = `
        <div class="metric-box">
            <div class="metric-label">Market Open</div>
            <div class="metric-value">09:30 EST</div>
            <div class="metric-change">US Equities</div>
        </div>
        <div class="metric-box">
            <div class="metric-label">Advance/Decline</div>
            <div class="metric-value">1,847 / 1,234</div>
            <div class="metric-change up">+35 Unchanged</div>
        </div>
        <div class="metric-box">
            <div class="metric-label">Market Cap</div>
            <div class="metric-value">$48.2T</div>
            <div class="metric-change up">+$420B</div>
        </div>
        <div class="metric-box">
            <div class="metric-label">Yield Curve</div>
            <div class="metric-value">3.84% / 4.12%</div>
            <div class="metric-change down">-2bps</div>
        </div>
    `;
}

async function fetchRealPrice(symbol) {
    try {
        const response = await fetch(
            `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`
        );
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        const data = await response.json();
        if (typeof data.c !== 'number') return null;
        return {
            price: data.c,
            change: data.d ?? 0,
            percent: data.dp ?? 0,
            high: data.h ?? null,
            low: data.l ?? null,
            open: data.o ?? null,
            prevClose: data.pc ?? null
        };
    } catch (err) {
        console.error('Finnhub error for', symbol, err);
        return null;
    }
}

async function fetchIntradayCandles(symbol) {
    try {
        const now = Math.floor(Date.now() / 1000);
        const from = now - 6 * 60 * 60;
        const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=5&from=${from}&to=${now}&token=${FINNHUB_API_KEY}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Candle API error: ${res.status}`);
        const data = await res.json();
        if (data.s !== 'ok' || !Array.isArray(data.c) || data.c.length === 0) return null;
        return data.c;
    } catch (err) {
        console.error('Candle error for', symbol, err);
        return null;
    }
}

function drawSparkline(canvas, prices) {
    if (!canvas || !prices || prices.length < 2) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const span = max - min || 1;

    ctx.beginPath();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = prices[prices.length - 1] >= prices[0] ? '#22c55e' : '#ff6b6b';

    prices.forEach((p, i) => {
        const x = (i / (prices.length - 1)) * (w - 4) + 2;
        const y = h - ((p - min) / span) * (h - 4) - 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
}

async function addToWatchlist() {
    const input = document.getElementById('symbolInput');
    const symbol = input.value.toUpperCase().trim();
    if (!symbol) {
        alert('Please enter a stock symbol');
        return;
    }
    if (watchlist.find(w => w.symbol === symbol)) {
        alert('Stock already in watchlist');
        return;
    }

    const btn = document.getElementById('addButton');
    const oldText = btn.textContent;
    btn.textContent = 'Loading...';
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
        percent: priceData.percent.toFixed(2)
    });
    input.value = '';
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
        }
    }
    updateWatchlist();
}

function removeFromWatchlist(symbol) {
    watchlist = watchlist.filter(w => w.symbol !== symbol);
    updateWatchlist();
}

function updateWatchlist() {
    const container = document.getElementById('watchlist');
    if (watchlist.length === 0) {
        container.innerHTML =
            '<div class="empty-state"><div class="empty-state-icon">📋</div><p>No stocks in watchlist. Add one above.</p></div>';
        return;
    }

    container.innerHTML = watchlist.map(stock => {
        const changeNum = parseFloat(stock.change);
        const percentNum = parseFloat(stock.percent);
        const isUp = changeNum >= 0;
        const alert = Math.abs(percentNum) >= ALERT_THRESHOLD;

        return `
            <div class="ticker-card ${alert ? 'alert-row' : ''}" data-symbol="${stock.symbol}">
                <div class="ticker-header">
                    <span class="ticker-symbol">${stock.symbol}</span>
                    <span class="ticker-price ${isUp ? 'up' : 'down'}">$${stock.price}</span>
                </div>
                <div class="ticker-change">
                    <span>
                        <span class="change-value ${isUp ? 'up' : 'down'}">
                            ${isUp ? '+' : ''}${stock.change}
                        </span>
                        <span class="change-percent">
                            (${percentNum >= 0 ? '+' : ''}${stock.percent}%)
                        </span>
                        ${alert ? `<span class="alert-badge">Alert ${percentNum.toFixed(1)}%</span>` : ''}
                    </span>
                    <span class="ticker-right">
                        <canvas class="sparkline" id="spark-${stock.symbol}"></canvas>
                        <button class="btn-danger" data-symbol="${stock.symbol}" data-role="remove">Remove</button>
                    </span>
                </div>
            </div>
        `;
    }).join('');

    // Wire card clicks
    document.querySelectorAll('.ticker-card').forEach(card => {
        const symbol = card.getAttribute('data-symbol');
        card.addEventListener('click', () => showDetails(symbol));
    });

    // Wire remove buttons
    document.querySelectorAll('button[data-role="remove"]').forEach(btn => {
        const symbol = btn.getAttribute('data-symbol');
        btn.addEventListener('click', e => {
            e.stopPropagation();
            removeFromWatchlist(symbol);
        });
    });

    // Draw sparklines
    watchlist.forEach(async stock => {
        const canvas = document.getElementById(`spark-${stock.symbol}`);
        if (!canvas) return;
        canvas.width = 80;
        canvas.height = 24;

        if (candleCache[stock.symbol]) {
            drawSparkline(canvas, candleCache[stock.symbol]);
        } else {
            const prices = await fetchIntradayCandles(stock.symbol);
            if (prices) {
                candleCache[stock.symbol] = prices;
                drawSparkline(canvas, prices);
            }
        }
    });
}

async function fetchCompanyProfile(symbol) {
    try {
        const url = `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Profile error: ${res.status}`);
        const data = await res.json();
        if (!data || Object.keys(data).length === 0) return null;
        return data;
    } catch (err) {
        console.error('Profile error for', symbol, err);
        return null;
    }
}

async function fetchCompanyNews(symbol) {
    try {
        const today = new Date();
        const fromDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        const fmt = d => d.toISOString().slice(0, 10);
        const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${fmt(fromDate)}&to=${fmt(today)}&token=${FINNHUB_API_KEY}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`News error: ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data)) return [];
        return data.slice(0, 5);
    } catch (err) {
        console.error('News error for', symbol, err);
        return [];
    }
}

async function showDetails(symbol) {
    const panel = document.getElementById('panel-details');
    const title = document.getElementById('detailsTitle');
    const body = document.getElementById('detailsBody');

    panel.style.display = 'block';
    title.textContent = `${symbol} – Details`;
    body.innerHTML = `<div style="font-size:13px; color:var(--color-text-secondary);">Loading...</div>`;

    const [profile, quote, news] = await Promise.all([
        fetchCompanyProfile(symbol),
        fetchRealPrice(symbol),
        fetchCompanyNews(symbol)
    ]);

    let profileHtml = '';
    if (profile) {
        profileHtml = `
            <div style="margin-bottom:12px;">
                <div style="font-size:14px; font-weight:600;">${profile.name || symbol}</div>
                <div style="font-size:12px; color:var(--color-text-secondary);">
                    ${profile.exchange || ''} · ${profile.country || ''} · ${profile.currency || ''}
                </div>
            </div>
        `;
    }

    let quoteHtml = '';
    if (quote) {
        const isUp = quote.change >= 0;
        quoteHtml = `
            <div style="margin-bottom:12px;">
                <div style="font-size:24px; font-weight:700;">
                    $${quote.price.toFixed(2)}
                    <span style="font-size:13px; margin-left:6px; color:${isUp ? '#22c55e' : '#ff6b6b'};">
                        ${isUp ? '+' : ''}${quote.change.toFixed(2)} (${quote.percent >= 0 ? '+' : ''}${quote.percent.toFixed(2)}%)
                    </span>
                </div>
                <div style="font-size:11px; color:var(--color-text-secondary);">
                    O: ${quote.open?.toFixed ? quote.open.toFixed(2) : '-'} ·
                    H: ${quote.high?.toFixed ? quote.high.toFixed(2) : '-'} ·
                    L: ${quote.low?.toFixed ? quote.low.toFixed(2) : '-'} ·
                    Prev: ${quote.prevClose?.toFixed ? quote.prevClose.toFixed(2) : '-'}
                </div>
            </div>
        `;
    }

    let newsHtml = '';
    if (news && news.length) {
        newsHtml = `
            <div style="margin-top:8px;">
                <div style="font-size:11px; text-transform:uppercase; color:var(--color-text-secondary); margin-bottom:4px;">Recent News</div>
                ${news
                    .map(
                        n => `
                    <div style="margin-bottom:8px;">
                        <div style="font-size:12px; font-weight:600;">${n.headline}</div>
                        <div style="font-size:11px; color:var(--color-text-secondary);">
                            ${n.source || ''} · ${n.datetime ? new Date(n.datetime * 1000).toLocaleString() : ''}
                        </div>
                    </div>
                `
                    )
                    .join('')}
            </div>
        `;
    } else {
        newsHtml = `<div style="font-size:11px; color:var(--color-text-secondary); margin-top:8px;">No recent company news.</div>`;
    }

    body.innerHTML = profileHtml + quoteHtml + newsHtml;
}

function switchView(view) {
    currentView = view;
    const header = document.getElementById('headerTitle');
    const views = {
        watchlist: 'Markets Overview',
        news: 'Breaking News',
        sectors: 'Sector Analysis',
        screener: 'Stock Screener',
        alerts: 'Price Alerts'
    };
    header.textContent = views[view] || 'Markets Overview';
}

function handleSearch() {
    // Placeholder
}

function init() {
    renderIndices();
    renderNews();
    renderSectors();
    renderMarketStats();
    updateWatchlist();

    document.getElementById('addButton').addEventListener('click', addToWatchlist);
    document.getElementById('searchInput').addEventListener('keyup', handleSearch);

    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            switchView(item.getAttribute('data-view'));
        });
    });

    document.addEventListener('click', e => {
        const panel = document.getElementById('panel-details');
        if (!panel) return;
        if (panel.style.display === 'none') return;
        if (!panel.contains(e.target)) {
            panel.style.display = 'none';
        }
    });

    setInterval(refreshPrices, 30000);
}

document.addEventListener('DOMContentLoaded', init);
