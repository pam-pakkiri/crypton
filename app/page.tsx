"use client";

import { useEffect, useState, useRef } from "react";
import {
  User, Wallet, Bell, Smartphone, Moon, Sun, Rocket,
  AlertTriangle, Maximize2, Minimize2, CheckCircle2,
  Activity, TrendingUp, BarChart3, Settings, Globe, Zap,
  Search, Menu, X, ChevronDown, ChevronUp, ArrowRight
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ChartComponent } from "../components/Chart";

interface TickerData {
  last: number;
  percentage: number;
  high: number;
  low: number;
  funding?: number;
}

interface ActiveBot {
  symbol: string;
  leverage: number;
  margin_mode: string;
  risk: number;
  budget: number;
  strategy?: string;
  regime?: string;
  atr?: number;
}

export default function Home() {
  // --- State ---
  const [isOnline, setIsOnline] = useState<boolean>(false);
  const [activeBots, setActiveBots] = useState<ActiveBot[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [assets, setAssets] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [openOrders, setOpenOrders] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<string>("positions");
  const [lastError, setLastError] = useState<string | null>(null);
  const [size, setSize] = useState("");
  const [isMounted, setIsMounted] = useState(false);
  const [panelMinimized, setPanelMinimized] = useState(false);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"market" | "limit" | "stop">("market");
  const [price, setPrice] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sidebarMode, setSidebarMode] = useState<'auto' | 'manual'>('auto');

  // Config
  const [symbol, setSymbol] = useState<string>("BTC/USDT");
  const [leverage, setLeverage] = useState<number>(5);
  const [marginMode, setMarginMode] = useState<string>("isolated");
  const [risk, setRisk] = useState<number>(1);
  const [tradeAmount, setTradeAmount] = useState<number>(100);
  const [strategy, setStrategy] = useState("mq5");

  const [interval, setChartInterval] = useState("15m");

  // Tickers and Orderbook
  const [tickers, setTickers] = useState<Record<string, TickerData>>({});
  const [orderBook, setOrderBook] = useState<{ bids: any[][], asks: any[][] }>({ bids: [], asks: [] });

  // Refs for Throttling
  const tickerBuffer = useRef<Record<string, TickerData>>({});
  const orderBookBuffer = useRef<{ bids: any[][], asks: any[][] } | null>(null);

  // History and Chart Data
  const [history, setHistory] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [markers, setMarkers] = useState<any[]>([]);

  const wsRef = useRef<WebSocket | null>(null);

  // --- API Calls ---
  const fetchStatus = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8000/bot/status");
      if (res.ok) {
        const data = await res.json();
        setBalance(data.balance);
        setAssets(data.assets || []);
        setPositions(data.positions || []);
        setOpenOrders(data.open_orders || []);
        setActiveBots(data.active_bots || []);
        setIsOnline(true);
      }
    } catch (e) {
      setIsOnline(false);
      setLastError("API Connection Error");
    }
  };

  const fetchTickers = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8000/tickers");
      if (res.ok) {
        const data = await res.json();
        setTickers(data);
        tickerBuffer.current = data; // Sync buffer
      }
    } catch (e) { console.error("Tickers error:", e); }
  };

  const handleStartBot = async (targetSymbol: string) => {
    try {
      setLastError(null);
      const res = await fetch("http://127.0.0.1:8000/bot/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: targetSymbol,
          leverage,
          margin_mode: marginMode,
          risk_per_trade: risk / 100,
          trade_amount: tradeAmount,
          strategy
        }),
      });
      if (res.ok) {
        fetchStatus();
      } else {
        setLastError("Bot failed to start");
      }
    } catch (e) { setLastError("Failed to start bot"); }
  };

  const handleStopBot = async (targetSymbol: string) => {
    try {
      setLastError(null);
      const res = await fetch("http://127.0.0.1:8000/bot/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: targetSymbol })
      });
      if (res.ok) {
        fetchStatus();
      } else {
        setLastError("Bot failed to stop");
      }
    } catch (e) { setLastError("Failed to stop bot"); }
  };

  const handleManualOrder = async (side: "buy" | "sell") => {
    try {
      setLastError(null);
      if (!size || parseFloat(size) <= 0) {
        setLastError("Please enter a valid size");
        return;
      }

      const res = await fetch("http://127.0.0.1:8000/bot/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          side,
          amount: parseFloat(size),
          type: orderType,
          price: (orderType === 'limit' || orderType === 'stop') ? parseFloat(price) : undefined
        }),
      });

      const data = await res.json();
      if (data.status === "success" || data.status === "started") {
        fetchStatus();
        setSize("");
      } else {
        setLastError(data.message || "Order failed");
      }
    } catch (e) {
      setLastError("Failed to place order");
    }
  };

  const handleClosePosition = async (p: any) => {
    try {
      const res = await fetch("http://127.0.0.1:8000/bot/close_position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: p.symbol,
          side: p.size > 0 ? "BUY" : "SELL",
          amount: p.size
        }),
      });
      if (res.ok) {
        fetchStatus();
      } else {
        setLastError("Failed to close position");
      }
    } catch (e) { setLastError("Close position failed"); }
  };

  const fetchOrderBook = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/orderbook?symbol=${encodeURIComponent(symbol)}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setOrderBook(data);
      }
    } catch (e) { console.error("OrderBook error:", e); }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/history?symbol=${encodeURIComponent(symbol)}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data);

        // Map trades to markers
        const newMarkers = data.map((t: any) => ({
          time: t.timestamp / 1000,
          position: t.side.toLowerCase() === 'buy' ? 'belowBar' : 'aboveBar',
          color: t.side.toLowerCase() === 'buy' ? '#0ecb81' : '#f6465d',
          shape: t.side.toLowerCase() === 'buy' ? 'arrowUp' : 'arrowDown',
          text: t.side.toUpperCase()
        }));
        setMarkers(newMarkers);
      }
    } catch (e) { console.error("History error:", e); }
  };

  const fetchKlines = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}`);
      if (res.ok) {
        const data = await res.json();
        setChartData(data);
      }
    } catch (e) {
      console.error("Klines error", e);
    }
  };

  const symbolRef = useRef(symbol);
  useEffect(() => {
    symbolRef.current = symbol;
    fetchOrderBook();
    fetchKlines();
    fetchHistory();
    // Simulate Markers for Demo if empty
    if (markers.length === 0) {
      setMarkers([
        { time: Math.floor(Date.now() / 1000) - 3600, position: 'belowBar', color: '#0ecb81', shape: 'arrowUp', text: 'BUY' },
      ]);
    }
  }, [symbol, interval]);

  useEffect(() => {
    setIsMounted(true);
    fetchStatus();
    fetchTickers();

    const connectWS = () => {
      console.log("Connecting WebSocket...");
      const ws = new WebSocket("ws://127.0.0.1:8000/ws");
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.e === "24hrTicker") {
            const s = data.s;
            const displaySymbol = s.includes('USDT') ? s.replace('USDT', '/USDT') : s;

            // Buffer the update
            tickerBuffer.current[displaySymbol] = {
              last: parseFloat(data.c),
              percentage: parseFloat(data.P),
              high: parseFloat(data.h),
              low: parseFloat(data.l)
            };
          }

          if (data.e === "depthUpdate") {
            const s = data.s;
            const displaySymbol = s.includes('USDT') ? s.replace('USDT', '/USDT') : s;
            // Only update buffer if matches current symbol
            if (displaySymbol === symbolRef.current) {
              // For simplicity, we just replace the buffer. A real merge is complex.
              // Assuming backend sends snapshot or we accept a slight visual jump for performance.
              orderBookBuffer.current = {
                bids: data.b,
                asks: data.a
              };
            }
          }
        } catch (err) { }
      };

      ws.onclose = () => {
        console.log("WS Closed. Reconnecting...");
        setTimeout(connectWS, 3000);
      };
    };

    connectWS();

    // Throttled UI Updates Loop (300ms)
    // This decouples high-freq WS messages from React Rendering
    const throttleTimer = setInterval(() => {
      // Flush Tickers
      if (Object.keys(tickerBuffer.current).length > 0) {
        setTickers(prev => ({ ...prev, ...tickerBuffer.current }));
        // Don't clear tickerBuffer entirely, just let it accumulate overwrites. 
        // Actually, we can clear it if we merge with prev.
        // But keeping 'tickers' state minimal: we merge buffer into state.
        tickerBuffer.current = {};
      }

      // Flush Orderbook
      if (orderBookBuffer.current) {
        setOrderBook(orderBookBuffer.current);
        orderBookBuffer.current = null;
      }
    }, 300);

    const intervalTimer = setInterval(() => {
      fetchStatus();
      fetchKlines(); // Poll for new candles
      fetchHistory(); // Poll for new algo signals
    }, 5000);

    return () => {
      clearInterval(intervalTimer);
      clearInterval(throttleTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const isBotRunning = (s: string) => activeBots.some(b => b.symbol === s);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#0b0e11] text-[#eaecef] selection:bg-primary/30 font-sans">
      {/* Premium Header */}
      <header className="h-12 bg-[#161a1e] border-b border-white/5 flex items-center justify-between px-3 md:px-5 shrink-0 z-50">
        <div className="flex items-center gap-3 md:gap-6 h-full">
          {/* Logo and CRYPTON text */}
          <div className="flex items-center gap-2 cursor-pointer hover:opacity-90 transition-opacity" onClick={() => window.location.reload()}>
            <div className="relative">
              <div className="w-1.5 h-1.5 bg-[#0ecb81] rounded-full absolute -top-0.5 -right-0.5 animate-pulse shadow-[0_0_8px_#0ecb81]" />
              <div className="w-8 h-8 bg-gradient-to-br from-[#21262d] to-[#0b0e11] text-[#f0b90b] border border-[#f0b90b]/20 rounded-lg flex items-center justify-center font-black text-xl shadow-[0_0_20px_rgba(240,185,11,0.15)] ring-1 ring-white/5">C</div>
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#f0b90b] to-[#f8d347] font-black text-lg tracking-tighter uppercase drop-shadow-sm">CRYPTON</span>
              <span className="text-[9px] text-[#848e9c] font-bold tracking-[0.3em] pl-0.5 opacity-80">ALGO BOT</span>
            </div>
          </div>

          <div className="h-6 w-px bg-white/5 mx-1 hidden md:block" />

          <nav className="flex items-center gap-4 md:gap-7 text-[11px] md:text-[12px] font-bold h-full">
            <a href="#" className="hidden lg:flex items-center h-full text-[#848e9c] hover:text-white transition-colors border-b-2 border-transparent hover:border-[#f0b90b] px-1">Markets</a>
            <a href="#" className="flex items-center h-full text-white border-b-2 border-[#f0b90b] px-1">Trade</a>
            <a href="#" className="hidden sm:flex items-center h-full text-[#848e9c] hover:text-white transition-colors border-b-2 border-transparent hover:border-[#f0b90b] px-1">History</a>
          </nav>
        </div>

        <div className="flex items-center gap-2 md:gap-5">
          <div className="hidden sm:flex items-center gap-4 mr-2">
            <div className="flex flex-col items-end">
              <span className="text-[9px] text-[#848e9c] font-bold uppercase tracking-tighter">Balance</span>
              <span className="text-[11px] font-black text-white">{balance.toLocaleString()} USDT</span>
            </div>
          </div>

          <button className="bg-[#f0b90b] hover:bg-[#f0b90b]/90 text-black text-[10px] font-black px-4 py-1.5 rounded transition-all whitespace-nowrap shadow-lg shadow-[#f0b90b]/10 flex items-center gap-2">
            <Zap size={12} fill="currentColor" />
            DEPLOY LIVE
          </button>

          <div className="flex items-center gap-3 md:gap-4 text-[#848e9c] scale-90 md:scale-110">
            <div className="cursor-pointer hover:text-white transition-colors" title="Profile"><User size={20} strokeWidth={2} /></div>
            <div className="cursor-pointer hover:text-white transition-colors hidden sm:block" title="Wallet"><Wallet size={20} strokeWidth={2} /></div>
            <div className="relative cursor-pointer group" title="Notifications">
              <Bell size={20} strokeWidth={2} className="group-hover:text-white transition-colors" />
              <span className="absolute top-0 right-0 w-2 h-2 bg-[#f6465d] rounded-full border-2 border-[#161a1e]"></span>
            </div>
          </div>
        </div>
      </header>

      {/* Top Ticker Stats Bar (Hidden on mobile or condensed) */}
      <div className="h-10 bg-[#161a1e] border-b border-white/5 flex items-center justify-between px-4 shrink-0 overflow-x-auto no-scrollbar whitespace-nowrap z-40">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 mr-4 min-w-[100px]">
            <span className="text-sm font-black text-white uppercase">{symbol}</span>
            <span className="text-[10px] bg-white/5 px-1 rounded text-[#848e9c]">Perp</span>
          </div>

          <div className="flex gap-6">
            <div className="flex flex-col">
              <span className="text-[8px] text-[#848e9c] uppercase font-bold">Price</span>
              <span className={`text-[11px] font-mono font-bold ${tickers[symbol]?.percentage >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                {(tickers[symbol]?.last || 0).toLocaleString()}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] text-[#848e9c] uppercase font-bold">24h Change</span>
              <span className={`text-[11px] font-mono ${tickers[symbol]?.percentage >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                {tickers[symbol]?.percentage >= 0 ? '+' : ''}{tickers[symbol]?.percentage.toFixed(2)}%
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] text-[#848e9c] uppercase font-bold">Interval</span>
              <div className="flex items-center gap-1 bg-black/20 rounded px-1">
                {['1m', '15m', '1h', '4h', '1d'].map(tf => (
                  <button
                    key={tf}
                    onClick={() => setChartInterval(tf)}
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-all ${interval === tf ? 'bg-white/10 text-[#f0b90b]' : 'text-[#848e9c] hover:text-white'}`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col hidden sm:flex">
              <span className="text-[8px] text-[#848e9c] uppercase font-bold">24h High</span>
              <span className="text-[11px] font-mono text-white">{(tickers[symbol]?.high || 0).toLocaleString()}</span>
            </div>
            <div className="flex flex-col hidden sm:flex">
              <span className="text-[8px] text-[#848e9c] uppercase font-bold">24h Low</span>
              <span className="text-[11px] font-mono text-white">{(tickers[symbol]?.low || 0).toLocaleString()}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] text-[#848e9c] uppercase font-bold">Funding</span>
              <span className="text-[11px] font-mono text-[#f0b90b]">{(tickers[symbol]?.funding || 0.0001).toFixed(4)}%</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 ml-4">
          <div className="flex items-center gap-1 text-[10px] text-[#848e9c]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#0ecb81]" />
            <span className="hidden xs:inline">System Connected</span>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Left Sidebar: Market Watch (Responsive hidden) */}
        <aside className="w-56 bg-[#161a1e] border-r border-white/5 hidden xl:flex flex-col overflow-hidden shrink-0">
          <div className="p-2 border-b border-white/5 flex items-center justify-between shrink-0">
            <span className="text-[10px] font-bold text-[#848e9c] uppercase tracking-wider">Markets</span>
            <div className="flex gap-2">
              <div className="relative">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search..."
                  className="bg-black/20 border border-white/5 rounded px-2 py-0.5 text-[10px] w-24 focus:w-32 transition-all outline-none focus:border-[#f0b90b]/30 text-white placeholder-white/20"
                />
                <Search size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar no-scrollbar">
            {Object.entries(tickers)
              .filter(([s]) => s.toLowerCase().includes(searchTerm.toLowerCase()))
              .map(([s, t]) => (
                <div
                  key={s}
                  onClick={() => setSymbol(s)}
                  className={`flex items-center justify-between px-3 py-2 border-b border-white/[0.01] cursor-pointer transition-all ${symbol === s ? 'bg-gradient-to-r from-[#f0b90b]/10 to-transparent border-l-2 border-[#f0b90b]' : 'hover:bg-white/5 hover:pl-4'}`}
                >
                  <div className="flex flex-col">
                    <span className={`text-[11px] font-bold ${symbol === s ? 'text-[#f0b90b]' : 'text-[#eaecef]'}`}>{s.split('/')[0]}</span>
                    <span className="text-[8px] text-[#848e9c]">Perp</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className={`text-[10px] font-mono font-bold ${t.percentage >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>{t.last.toLocaleString()}</span>
                    <span className={`text-[9px] ${t.percentage >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>{t.percentage >= 0 ? '+' : ''}{t.percentage.toFixed(2)}%</span>
                  </div>
                </div>
              ))}
          </div>
        </aside>

        {/* Center: Orderbook + Chart Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex-1 flex flex-col sm:flex-row overflow-hidden">
            {/* Order Book (Hidden on small screens) */}
            <aside className="w-52 bg-[#161a1e] border-r border-white/5 hidden lg:flex flex-col overflow-hidden shrink-0">
              <div className="flex-1 flex flex-col font-mono text-[10px]">
                {/* Asks */}
                <div className="flex-1 flex flex-col-reverse justify-end overflow-hidden p-1 gap-px">
                  {orderBook.asks.slice(0, 15).map((ask, i) => (
                    <div key={i} className="flex justify-between px-2 py-0.5 relative group">
                      <div className="absolute inset-y-0 right-0 bg-[#f6465d]/10 transition-all duration-300" style={{ width: `${Math.min(100, (parseFloat(ask[1]) * 80))}%` }}></div>
                      <span className="text-[#f6465d] relative z-10">{parseFloat(ask[0]).toLocaleString(undefined, { minimumFractionDigits: 1 })}</span>
                      <span className="text-[#848e9c] relative z-10">{parseFloat(ask[1]).toFixed(3)}</span>
                    </div>
                  ))}
                </div>
                {/* Spread */}
                <div className="py-1.5 px-3 border-y border-white/5 bg-white/[0.02] flex items-center justify-between shrink-0">
                  <span className="text-xs font-bold text-[#0ecb81]">{(tickers[symbol]?.last || 0).toLocaleString()}</span>
                  <span className="text-[9px] text-[#848e9c]">{(tickers[symbol]?.funding || 0.0001).toFixed(4)}%</span>
                </div>
                {/* Bids */}
                <div className="flex-1 flex flex-col justify-start overflow-hidden p-1 gap-px">
                  {orderBook.bids.slice(0, 15).map((bid, i) => (
                    <div key={i} className="flex justify-between px-2 py-0.5 relative group">
                      <div className="absolute inset-y-0 right-0 bg-[#0ecb81]/10 transition-all duration-300" style={{ width: `${Math.min(100, (parseFloat(bid[1]) * 80))}%` }}></div>
                      <span className="text-[#0ecb81] relative z-10">{parseFloat(bid[0]).toLocaleString(undefined, { minimumFractionDigits: 1 })}</span>
                      <span className="text-[#848e9c] relative z-10">{parseFloat(bid[1]).toFixed(3)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </aside>

            {/* Chart Area */}
            <main className="flex-1 bg-black flex flex-col relative overflow-hidden">
              {/* Watermark */}
              <div className="absolute inset-0 opacity-5 pointer-events-none flex items-center justify-center">
                <span className="text-8xl font-black rotate-12 select-none tracking-widest text-primary">CRYPTON</span>
              </div>

              {/* Native Chart */}
              <div className="absolute inset-0 z-10">
                <ChartComponent
                  data={chartData}
                  markers={markers}
                  symbol={symbol}
                  colors={{ backgroundColor: '#0b0e11', textColor: '#d1d4dc' }}
                />
              </div>

              <div className="absolute top-2 right-2 z-20 flex gap-1 scale-75 origin-top-right">
                <button onClick={() => setPanelMinimized(!panelMinimized)} className="bg-[#161a1e]/80 p-2 rounded border border-white/10 text-white font-bold opacity-50 hover:opacity-100 transition-opacity">
                  {panelMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                </button>
              </div>
            </main>
          </div>

          {/* Bottom Panel (Tabs) */}
          <div className={`bg-[#161a1e] border-t border-white/5 flex flex-col overflow-hidden transition-all duration-300 ${panelMinimized ? 'h-8' : 'flex-1 max-h-[40%]'}`}>
            <div className="h-8 flex items-center justify-between border-b border-white/5 px-4 shrink-0">
              <div className="flex h-full">
                {['positions', 'orders', 'history', 'assets'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 h-full text-[10px] font-bold uppercase tracking-wider transition-colors border-b-2 ${activeTab === tab ? 'text-[#f0b90b] border-[#f0b90b] bg-[#f0b90b]/5' : 'text-[#848e9c] border-transparent hover:text-white'}`}
                  >
                    {tab} {tab === 'positions' && positions.length > 0 && `(${positions.length})`}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setPanelMinimized(!panelMinimized)}
                className="text-[#848e9c] hover:text-white p-1 transition-colors"
                title={panelMinimized ? "Expand" : "Collapse"}
              >
                {panelMinimized ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>

            {!panelMinimized && (
              <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="w-full text-left whitespace-nowrap">
                  <thead className="text-[9px] text-[#848e9c] uppercase sticky top-0 bg-[#161a1e] border-b border-white/5 z-10">
                    {activeTab === 'positions' && (
                      <tr>
                        <th className="p-2 w-1"></th>
                        <th className="p-2">Symbol</th>
                        <th className="p-2">Side</th>
                        <th className="p-2">Size</th>
                        <th className="p-2">Entry</th>
                        <th className="p-2">Mark</th>
                        <th className="p-2">TP / SL</th>
                        <th className="p-2">ATR</th>
                        <th className="p-2">PNL (ROI %)</th>
                        <th className="p-2 text-right">
                          <button onClick={() => positions.forEach(p => handleClosePosition(p))} className="text-[#f0b90b] underline font-black mr-4">Close All</button>
                        </th>
                      </tr>
                    )}
                    {activeTab === 'assets' && (
                      <tr>
                        <th className="p-2">Asset</th>
                        <th className="p-2">Balance</th>
                        <th className="p-2 text-right">Unrealized PNL</th>
                      </tr>
                    )}
                    {activeTab === 'history' && (
                      <tr>
                        <th className="p-2">Time</th>
                        <th className="p-2">Symbol</th>
                        <th className="p-2">Side</th>
                        <th className="p-2">Price</th>
                        <th className="p-2">Size</th>
                        <th className="p-2 text-right">Realized PNL</th>
                      </tr>
                    )}
                  </thead>
                  <tbody className="text-[10px]">
                    {activeTab === 'positions' && positions.map((p, i) => {
                      // Find Active Orders for this position
                      const pOrders = openOrders.filter(o => o.symbol === p.symbol);
                      const slOrder = pOrders.find(o => o.type === 'STOP_MARKET');
                      // TP often limit orders or TAKE_PROFIT
                      const tpOrder = pOrders.find(o => o.type === 'LIMIT' || o.type === 'TAKE_PROFIT');

                      const botInfo = activeBots.find(b => b.symbol.replace('/', '') === p.symbol); // API symbol often has / removed? Check this.

                      return (
                        <tr key={i} className="border-b border-white/[0.02] hover:bg-white/5 transition-colors group relative">
                          <td className="p-0 w-1 relative">
                            <div className={`absolute inset-y-1 left-0 w-0.5 rounded-r ${p.size > 0 ? 'bg-[#0ecb81]' : 'bg-[#f6465d]'}`} />
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-1.5 font-bold">
                              <span>{p.symbol}</span>
                              <span className="text-[7px] bg-white/10 text-[#848e9c] px-1 rounded">{p.leverage}x</span>
                            </div>
                          </td>
                          <td className={`p-2 font-bold ${p.size > 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>{p.size > 0 ? 'LONG' : 'SHORT'}</td>
                          <td className="p-2 font-mono">{(p.size).toLocaleString()}</td>
                          <td className="p-2 font-mono text-[#848e9c]">{p.entryPrice.toLocaleString()}</td>
                          <td className="p-2 font-mono">{(tickers[p.symbol]?.last || p.entryPrice).toLocaleString()}</td>

                          {/* TP / SL Column */}
                          <td className="p-2">
                            <div className="flex flex-col gap-0.5 font-mono text-[9px]">
                              <span className="text-[#0ecb81]" title="Take Profit">
                                TP: {tpOrder ? parseFloat(tpOrder.price).toLocaleString() : '--'}
                              </span>
                              <span className="text-[#f6465d]" title="Stop Loss">
                                SL: {slOrder ? parseFloat(slOrder.stopPrice).toLocaleString() : '--'}
                              </span>
                            </div>
                          </td>

                          {/* ATR Column */}
                          <td className="p-2 font-mono text-[#f0b90b]">
                            {botInfo?.atr ? botInfo.atr.toFixed(2) : '--'}
                          </td>

                          <td className="p-2">
                            <div className="flex flex-col">
                              <span className={`font-bold ${p.unrealizedProfit >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                                {p.unrealizedProfit >= 0 ? '+' : ''}{p.unrealizedProfit.toFixed(2)}
                              </span>
                              <span className={`text-[8px] ${p.unrealizedProfit >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                                ({(((p.unrealizedProfit / (Math.abs(p.size) / p.leverage))) * 100).toFixed(2)}%)
                              </span>
                            </div>
                          </td>
                          <td className="p-2 text-right">
                            <button onClick={() => handleClosePosition(p)} className="text-[#f0b90b] font-black mr-4 hover:brightness-125 transition-all">MARKET</button>
                          </td>
                        </tr>
                      )
                    })}
                    {activeTab === 'history' && history.map((h, i) => (
                      <tr key={i} className="border-b border-white/[0.02] hover:bg-white/5 transition-colors h-10">
                        <td className="p-2 font-mono text-[#848e9c]">{new Date(h.timestamp).toLocaleString()}</td>
                        <td className="p-2 font-bold">{h.symbol}</td>
                        <td className={`p-2 font-bold ${h.side === 'buy' ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>{h.side.toUpperCase()}</td>
                        <td className="p-2 font-mono">{h.price}</td>
                        <td className="p-2 font-mono">{h.amount}</td>
                        <td className={`p-2 font-mono text-right ${h.pnl >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>{h.pnl}</td>
                      </tr>
                    ))}
                    {activeTab === 'assets' && assets.map((a, i) => (
                      <tr key={i} className="border-b border-white/[0.02] hover:bg-white/5 transition-colors h-10">
                        <td className="p-2 font-bold text-white/90">{a.asset}</td>
                        <td className="p-2 font-mono">{parseFloat(a.balance).toFixed(2)}</td>
                        <td className={`p-2 font-mono text-right ${parseFloat(a.unrealizedProfit) >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                          {parseFloat(a.unrealizedProfit).toFixed(4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar: Order Form */}
        <aside className="w-full md:w-64 bg-[#161a1e] border-l border-white/5 flex flex-col shrink-0 overflow-y-auto custom-scrollbar no-scrollbar scroll-smooth">
          {/* Sidebar Mode Tabs */}
          <div className="flex h-10 border-b border-white/5 shrink-0">
            <button
              onClick={() => setSidebarMode('auto')}
              className={`flex-1 text-[10px] font-black uppercase transition-all flex items-center justify-center gap-1 ${sidebarMode === 'auto' ? 'text-[#f0b90b] bg-[#f0b90b]/5 border-b-2 border-[#f0b90b]' : 'text-[#848e9c] hover:text-white border-b-2 border-transparent'}`}
            >
              <Zap size={12} /> Auto Bot
            </button>
            <button
              onClick={() => setSidebarMode('manual')}
              className={`flex-1 text-[10px] font-black uppercase transition-all flex items-center justify-center gap-1 ${sidebarMode === 'manual' ? 'text-white bg-white/5 border-b-2 border-white/50' : 'text-[#848e9c] hover:text-white border-b-2 border-transparent'}`}
            >
              <Activity size={12} /> Manual
            </button>
          </div>

          <div className="p-4 flex flex-col gap-5">

            {/* MANUAL MODE SPECIFIC UI */}
            {sidebarMode === 'manual' && (
              <>
                {/* Buy/Sell Tabs */}
                <div className="flex bg-black/30 p-1 rounded-lg border border-white/5">
                  <button
                    onClick={() => setSide('buy')}
                    className={`flex-1 py-1.5 text-[10px] font-black uppercase rounded transition-all ${side === 'buy' ? 'bg-[#0ecb81] text-black shadow-lg shadow-[#0ecb81]/20' : 'text-[#848e9c] hover:text-white'}`}
                  >
                    Buy Long
                  </button>
                  <button
                    onClick={() => setSide('sell')}
                    className={`flex-1 py-1.5 text-[10px] font-black uppercase rounded transition-all ${side === 'sell' ? 'bg-[#f6465d] text-white shadow-lg shadow-[#f6465d]/20' : 'text-[#848e9c] hover:text-white'}`}
                  >
                    Sell Short
                  </button>
                </div>

                {/* Order Type */}
                <div className="flex gap-1 bg-black/30 p-1 rounded-sm border border-white/5">
                  {['market', 'limit', 'stop'].map((type) => (
                    <button
                      key={type}
                      onClick={() => setOrderType(type as any)}
                      className={`flex-1 py-1 text-[9px] rounded-sm transition-all ${orderType === type ? 'font-black bg-white/10 text-white' : 'font-bold text-[#848e9c] hover:text-white'}`}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Price Input */}
                {(orderType === 'limit' || orderType === 'stop') && (
                  <div className="relative group animate-in slide-in-from-top-2 duration-300">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[9px] text-[#848e9c] font-black uppercase">Price</span>
                    <input
                      type="number"
                      value={price}
                      onChange={e => setPrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-[#0b0e11]/50 border border-white/10 focus:border-[#f0b90b]/50 text-xs font-mono p-2.5 pl-14 rounded-lg outline-none text-right placeholder-[#848e9c]/30 shadow-inner"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-[#848e9c]">USDT</span>
                  </div>
                )}

                {/* Size Input */}
                <div className="relative group">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[9px] text-[#848e9c] font-black uppercase">Size</span>
                  <input
                    type="number"
                    value={size}
                    onChange={e => setSize(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-[#0b0e11] border border-white/5 focus:border-[#f0b90b]/50 text-xs font-mono p-2.5 pl-12 rounded outline-none text-right placeholder-[#848e9c]/30"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-[#848e9c]">USDT</span>
                </div>
              </>
            )}

            {/* AUTO MODE SPECIFIC UI */}
            {sidebarMode === 'auto' && (
              <>
                {/* Strategy Selection */}
                <div className="flex flex-col gap-2">
                  <span className="text-[9px] font-bold text-[#848e9c] uppercase tracking-widest pl-1">Bot Strategy</span>
                  <div className="grid grid-cols-1 gap-1.5">
                    {[
                      { id: 'mq5', name: 'MQ5 PRO', color: '#f0b90b' },
                      { id: 'institutional', name: 'INSTITUTIONAL', color: '#3b82f6' },
                      { id: 'scalping', name: 'SCALPING', color: '#ec4899' }
                    ].map(s => (
                      <button
                        key={s.id}
                        onClick={() => setStrategy(s.id)}
                        className={`py-3 text-[10px] font-black rounded border transition-all relative overflow-hidden group ${strategy === s.id
                          ? 'bg-white/5 border-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.05)]'
                          : 'bg-white/[0.02] border-transparent text-[#848e9c] hover:bg-white/5'
                          }`}
                      >
                        {strategy === s.id && <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: s.color }} />}
                        <div className="flex items-center justify-between px-3">
                          <span className={strategy === s.id ? 'translate-x-1' : ''} style={{ transition: 'transform 0.2s' }}>{s.name}</span>
                          {strategy === s.id && <span className="text-[8px] bg-white/10 px-1.5 rounded text-white/50">ACTIVE</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* SHARED CONTROLS (Leverage) */}
            <div className="flex flex-col gap-4 pt-2 border-t border-white/5">
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[9px] font-bold text-[#848e9c] tracking-tight">
                  <span className="uppercase">LEVERAGE</span>
                  <span className="text-white">{leverage}x</span>
                </div>
                <input
                  type="range" min="1" max="125" step="1"
                  value={leverage}
                  onChange={(e) => setLeverage(parseFloat(e.target.value))}
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#f0b90b]"
                />
              </div>

              {/* Auto Mode Specific Sliders */}
              {sidebarMode === 'auto' && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-[9px] font-bold text-[#848e9c] tracking-tight">
                      <span className="uppercase">RISK PER TRADE</span>
                      <span className="text-white">{risk}%</span>
                    </div>
                    <input
                      type="range" min="0.1" max="5.0" step="0.1"
                      value={risk}
                      onChange={(e) => setRisk(parseFloat(e.target.value))}
                      className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#f0b90b]"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-[9px] font-bold text-[#848e9c] tracking-tight">
                      <span className="uppercase">TOTAL BUDGET</span>
                      <span className="text-white">{tradeAmount} USDT</span>
                    </div>
                    <input
                      type="range" min="10" max="5000" step="10"
                      value={tradeAmount}
                      onChange={(e) => setTradeAmount(parseFloat(e.target.value))}
                      className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#f0b90b]"
                    />
                  </div>
                </>
              )}
            </div>

            {/* ACTION BUTTONS */}
            <div className="pt-2 flex flex-col gap-2">
              {sidebarMode === 'auto' ? (
                <>
                  <button
                    onClick={() => handleStartBot(symbol)}
                    className="w-full bg-[#f0b90b] hover:bg-[#f0b90b]/90 text-black font-black py-3 rounded text-[11px] transition-all shadow-[0_0_20px_rgba(240,185,11,0.2)] hover:shadow-[0_0_30px_rgba(240,185,11,0.3)] active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Rocket size={14} /> {isBotRunning(symbol) ? 'UPDATE BOT CONFIG' : 'ACTIVATE AUTO-PILOT'}
                  </button>
                  {isBotRunning(symbol) && (
                    <button
                      onClick={() => handleStopBot(symbol)}
                      className="w-full bg-[#f6465d]/10 hover:bg-[#f6465d]/20 text-[#f6465d] border border-[#f6465d]/20 font-bold py-2 rounded text-[10px] transition-all flex items-center justify-center gap-2"
                    >
                      <AlertTriangle size={12} /> STOP TRADING
                    </button>
                  )}
                </>
              ) : (
                <button
                  onClick={() => handleManualOrder(side)}
                  className={`w-full font-black py-3 rounded text-[11px] transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 ${side === 'buy' ? 'bg-[#0ecb81] hover:bg-[#0ecb81]/90 text-black shadow-[0_0_20px_rgba(14,203,129,0.2)]' : 'bg-[#f6465d] hover:bg-[#f6465d]/90 text-white shadow-[0_0_20px_rgba(246,70,93,0.2)]'
                    }`}
                >
                  {side === 'buy' ? 'BUY / LONG' : 'SELL / SHORT'}
                </button>
              )}
            </div>

            {/* Active Bots */}
            {activeBots.length > 0 && (
              <div className="mt-2 flex flex-col gap-2">
                <span className="text-[9px] font-black text-[#848e9c] uppercase tracking-widest pl-1">Active Sessions ({activeBots.length})</span>
                <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar no-scrollbar">
                  {activeBots.map((bot, i) => {
                    const strategyNames: Record<string, string> = {
                      'SmartFuturesStrategy': 'MQ5 Pro',
                      'InstitutionalStrategy': 'Institutional',
                      'ScalpingStrategy': 'Scalper'
                    };
                    const displayName = strategyNames[bot.strategy || ''] || bot.strategy || 'Unknown';

                    return (
                      <div key={i} className="p-2.5 bg-gradient-to-br from-[#f0b90b]/5 to-transparent rounded-lg border border-[#f0b90b]/20 relative overflow-hidden group shadow-lg transition-all hover:bg-white/5">
                        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#f0b90b] shadow-[0_0_10px_#f0b90b]" />
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] font-bold text-white uppercase">{bot.symbol}</span>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1 text-[8px] text-[#f0b90b] font-black">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#f0b90b] animate-pulse" />
                              LIVE
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleStopBot(bot.symbol); }}
                              className="text-[#f6465d] hover:text-white hover:bg-[#f6465d] p-0.5 rounded transition-colors"
                              title="Stop Bot"
                            >
                              <X size={12} strokeWidth={3} />
                            </button>
                          </div>
                        </div>
                        <div className="flex justify-between text-[9px] text-[#848e9c]">
                          <span className="uppercase font-bold tracking-tight">{displayName}</span>
                          <span className="font-mono opacity-80">{bot.leverage}x | {(bot.risk * 100).toFixed(1)}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {lastError && (
            <div className="mt-auto p-3 bg-[#f6465d]/20 border-t border-[#f6465d]/30 text-[#f6465d] text-[10px] font-bold flex gap-2 items-center">
              <AlertTriangle size={14} /> {lastError}
              <button onClick={() => setLastError(null)} className="ml-auto opacity-50 hover:opacity-100">✕</button>
            </div>
          )}
        </aside>
      </div>

      {/* Connectivity Footer */}
      <footer className="h-6 bg-[#161a1e] border-t border-white/5 flex items-center justify-between px-4 shrink-0 z-50">
        <div className="flex items-center gap-4 text-[9px] font-bold text-[#848e9c]">
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-[#0ecb81] animate-pulse' : 'bg-[#f6465d]'}`} />
            <span className={isOnline ? 'text-[#0ecb81]' : 'text-[#f6465d]'}>{isOnline ? 'CONNECTED' : 'OFFLINE'}</span>
          </div>
          <span className="hidden sm:block">STABILITY: 100.0%</span>
          <span className="hidden sm:block">LATENCY: 5ms</span>
        </div>
        <div className="flex items-center gap-3 text-[9px] text-[#848e9c]/50 font-black">
          <span>v1.0.10-PRO</span>
          <span className="text-[#f0b90b]/50">SECURE TERMINAL</span>
        </div>
      </footer>
    </div>
  );
}
