"use client";

import React, { useEffect, useRef, useState } from 'react';
import { IChartApi, ISeriesApi, CandlestickData, Time, ColorType, HistogramData, LineData } from 'lightweight-charts';

// --- Helpers ---
function calculateEMA(data: CandlestickData[], period: number): LineData[] {
    const k = 2 / (period + 1);
    let ema = data[0].close as number;
    const emaData: LineData[] = [];

    for (const d of data) {
        ema = (d.close as number) * k + ema * (1 - k);
        emaData.push({ time: d.time, value: ema });
    }
    return emaData;
}

interface Marker {
    time: Time;
    position: 'aboveBar' | 'belowBar';
    color: string;
    shape: 'arrowDown' | 'arrowUp';
    text: string;
}

interface ChartComponentProps {
    data: any[]; // Expecting { time, open, high, low, close, volume }
    markers?: Marker[];
    symbol: string;
    colors?: {
        backgroundColor?: string;
        lineColor?: string;
        textColor?: string;
    };
}

export const ChartComponent: React.FC<ChartComponentProps> = ({ data, markers = [], symbol, colors: {
    backgroundColor = '#0b0e11',
    lineColor = '#2962FF',
    textColor = '#d1d4dc',
} = {} }) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const ema7Ref = useRef<ISeriesApi<"Line"> | null>(null);
    const ema25Ref = useRef<ISeriesApi<"Line"> | null>(null);
    const ema99Ref = useRef<ISeriesApi<"Line"> | null>(null);

    const [legend, setLegend] = useState<any>(null);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        let chart: IChartApi;

        const initChart = async () => {
            const { createChart, ColorType } = await import('lightweight-charts');

            if (!chartContainerRef.current) return;

            chart = createChart(chartContainerRef.current, {
                layout: {
                    background: { type: ColorType.Solid, color: backgroundColor },
                    textColor,
                },
                width: chartContainerRef.current.clientWidth,
                height: 500,
                grid: {
                    vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
                    horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
                },
                timeScale: {
                    timeVisible: true,
                    secondsVisible: false,
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                },
                rightPriceScale: {
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                },
                // @ts-ignore - Watermark types vary by version, suppressing for safety
                watermark: {
                    visible: true,
                    fontSize: 60,
                    horzAlign: 'center',
                    vertAlign: 'center',
                    color: 'rgba(255, 255, 255, 0.03)',
                    text: 'CRYPTON',
                },
                crosshair: {
                    mode: 1, // Magnet
                    vertLine: {
                        labelBackgroundColor: '#2962FF',
                    },
                    horzLine: {
                        labelBackgroundColor: '#2962FF',
                    },
                },
            });
            chartRef.current = chart;

            // --- Candlestick Series ---
            const { CandlestickSeries, HistogramSeries, LineSeries } = await import('lightweight-charts');

            const mainSeries = chart.addSeries(CandlestickSeries, {
                upColor: '#0ecb81',
                downColor: '#f6465d',
                borderVisible: false,
                wickUpColor: '#0ecb81',
                wickDownColor: '#f6465d',
            });
            seriesRef.current = mainSeries;

            // --- EMA Series (7, 25, 99) ---
            const ema7 = chart.addSeries(LineSeries, { color: '#00bcd4', lineWidth: 1, crosshairMarkerVisible: false, priceLineVisible: false, title: 'EMA 7' });
            const ema25 = chart.addSeries(LineSeries, { color: '#ff9800', lineWidth: 1, crosshairMarkerVisible: false, priceLineVisible: false, title: 'EMA 25' });
            const ema99 = chart.addSeries(LineSeries, { color: '#d500f9', lineWidth: 1, crosshairMarkerVisible: false, priceLineVisible: false, title: 'EMA 99' });

            ema7Ref.current = ema7;
            ema25Ref.current = ema25;
            ema99Ref.current = ema99;

            // --- Volume Series ---
            const volumeSeries = chart.addSeries(HistogramSeries, {
                color: '#26a69a',
                priceFormat: { type: 'volume' },
                priceScaleId: '', // Overlay
            });
            volumeRef.current = volumeSeries;

            // Apply scale margins to the overlay scale to keep volume at bottom
            chart.priceScale('').applyOptions({
                scaleMargins: {
                    top: 0.8, // 80% space reserved for price, bottom 20% for volume
                    bottom: 0,
                },
            });

            // --- Initial Data ---
            if (data && data.length > 0) {
                mainSeries.setData(data);

                // Process Volume
                const volumeData = data.map((d: any) => ({
                    time: d.time,
                    value: d.volume,
                    color: d.close >= d.open ? 'rgba(14, 203, 129, 0.3)' : 'rgba(246, 70, 93, 0.3)',
                }));
                volumeSeries.setData(volumeData);

                // Process EMAs
                ema7.setData(calculateEMA(data, 7));
                ema25.setData(calculateEMA(data, 25));
                ema99.setData(calculateEMA(data, 99));
            }


            // --- Tooltip / Crosshair Logic ---
            chart.subscribeCrosshairMove((param) => {
                if (param.time) {
                    const dataPoint = param.seriesData.get(mainSeries) as any;
                    const volPoint = param.seriesData.get(volumeSeries) as any;
                    if (dataPoint) {
                        setLegend({
                            open: dataPoint.open,
                            high: dataPoint.high,
                            low: dataPoint.low,
                            close: dataPoint.close,
                            volume: volPoint ? volPoint.value : 0,
                            change: ((dataPoint.close - dataPoint.open) / dataPoint.open) * 100
                        });
                    }
                } else {
                    setLegend(null);
                }
            });

            // --- Markers ---
            if (markers.length > 0) {
                const api = mainSeries as any;
                if (typeof api.setMarkers === 'function') {
                    api.setMarkers(markers as any[]);
                }
            }

            const handleResize = () => {
                if (chartContainerRef.current) {
                    chart.applyOptions({ width: chartContainerRef.current.clientWidth });
                }
            };

            window.addEventListener('resize', handleResize);
        };

        initChart();

        return () => {
            if (chartRef.current) {
                chartRef.current.remove();
                chartRef.current = null;
            }
        };
    }, []);

    // Update Data Effect
    useEffect(() => {
        if (!seriesRef.current || data.length === 0) return;

        seriesRef.current.setData(data);

        if (volumeRef.current) {
            const volumeData = data.map((d: any) => ({
                time: d.time,
                value: d.volume,
                color: d.close >= d.open ? 'rgba(14, 203, 129, 0.3)' : 'rgba(246, 70, 93, 0.3)',
            }));
            volumeRef.current.setData(volumeData);
        }

        if (ema7Ref.current) ema7Ref.current.setData(calculateEMA(data, 7));
        if (ema25Ref.current) ema25Ref.current.setData(calculateEMA(data, 25));
        if (ema99Ref.current) ema99Ref.current.setData(calculateEMA(data, 99));

    }, [data]);

    // Update Markers Effect
    useEffect(() => {
        if (!seriesRef.current) return;
        try {
            const api = seriesRef.current as any;
            if (typeof api.setMarkers === 'function') {
                api.setMarkers(markers as any[]);
            } else {
                // console.warn("setMarkers not supported on this series instance");
            }
        } catch (e) {
            console.error("Error setting markers:", e);
        }
    }, [markers]);

    return (
        <div className="w-full h-full relative group">
            <div ref={chartContainerRef} className="w-full h-full" />

            {/* Legend / Tooltip */}
            <div className="absolute top-4 left-4 z-10 p-3 rounded-lg backdrop-blur-md bg-black/40 border border-white/10 text-xs font-mono select-none pointer-events-none transition-opacity opacity-0 group-hover:opacity-100">
                <div className="flex items-center gap-4 text-gray-400 mb-1">
                    <span className="font-bold text-white text-sm">{symbol}</span>
                    <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#00bcd4]"></span> EMA 7
                        <span className="w-2 h-2 rounded-full bg-[#ff9800]"></span> EMA 25
                        <span className="w-2 h-2 rounded-full bg-[#d500f9]"></span> EMA 99
                    </span>
                </div>
                {legend ? (
                    <div className="flex gap-4">
                        <div>O: <span className="text-white">{legend.open.toFixed(2)}</span></div>
                        <div>H: <span className="text-white">{legend.high.toFixed(2)}</span></div>
                        <div>L: <span className="text-white">{legend.low.toFixed(2)}</span></div>
                        <div>C: <span className={legend.close >= legend.open ? "text-[#0ecb81]" : "text-[#f6465d]"}>{legend.close.toFixed(2)}</span></div>
                        <div>V: <span className="text-gray-300">{Math.round(legend.volume).toLocaleString()}</span></div>
                        <div className={legend.change >= 0 ? "text-[#0ecb81]" : "text-[#f6465d]"}>
                            {legend.change >= 0 ? "+" : ""}{legend.change.toFixed(2)}%
                        </div>
                    </div>
                ) : (
                    <div className="text-gray-500 italic">Hover for details</div>
                )}
            </div>
        </div>
    );
};
