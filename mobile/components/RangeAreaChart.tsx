import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { metrics, type ChartSegmentPoint, type Metric } from '../types';
import { dateTime, fmt, metricDigits } from './ui';

type Props = {
  rows: ChartSegmentPoint[];
  metric: Metric;
  periodIndex: number;
};

export function RangeAreaChart({ rows, metric, periodIndex }: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const digits = metricDigits(metric);
  const unit = metrics[metric].unit;

  const validPoints = useMemo(
    () => rows.filter((r) => !r.isGap && r.avg !== null && r.min !== null && r.max !== null),
    [rows]
  );

  const chartHeight = 230;
  const padLeft = 48;
  const padRight = 20;
  const padTop = 18;
  const padBottom = 32;
  const plotHeight = chartHeight - padTop - padBottom;

  const minContainerWidth = Math.max(300, screenWidth - 64);
  const pointSpacing = rows.length > 80 ? 8 : rows.length > 35 ? 14 : 24;
  const chartWidth = Math.max(
    minContainerWidth,
    padLeft + padRight + Math.max(1, rows.length - 1) * pointSpacing
  );
  const plotWidth = chartWidth - padLeft - padRight;

  const { yMin, yMax, yTicks } = useMemo(() => {
    if (validPoints.length === 0) {
      return { yMin: 0, yMax: 100, yTicks: [0, 25, 50, 75, 100] };
    }
    let minVal = Infinity;
    let maxVal = -Infinity;
    for (const p of validPoints) {
      if (p.min !== null && p.min < minVal) minVal = p.min;
      if (p.max !== null && p.max > maxVal) maxVal = p.max;
    }
    const span = Math.max(maxVal - minVal, metric === 'current' ? 0.2 : 1.5);
    const lo = Math.max(0, minVal - span * 0.12);
    const hi = maxVal + span * 0.12;
    const step = (hi - lo) / 4;
    return {
      yMin: lo,
      yMax: hi,
      yTicks: [lo, lo + step, lo + step * 2, lo + step * 3, hi],
    };
  }, [validPoints, metric]);

  const getX = (index: number): number => {
    if (rows.length <= 1) return padLeft + plotWidth / 2;
    return padLeft + (index / (rows.length - 1)) * plotWidth;
  };

  const getY = (val: number): number => {
    if (yMax <= yMin) return padTop + plotHeight / 2;
    const ratio = (val - yMin) / (yMax - yMin);
    return padTop + plotHeight * (1 - Math.max(0, Math.min(1, ratio)));
  };

  /**
   * Divide os pontos em segmentos contínuos separados por lacunas (`isGap: true`).
   * NUNCA interpola linhas nem faixas através de lacunas de dados.
   */
  const { segments, gapRanges } = useMemo(() => {
    const segs: { index: number; point: ChartSegmentPoint }[][] = [];
    const gaps: { startX: number; endX: number }[] = [];
    let current: { index: number; point: ChartSegmentPoint }[] = [];
    let lastValidIndex: number | null = null;

    rows.forEach((point, idx) => {
      if (point.isGap || point.avg === null || point.min === null || point.max === null) {
        if (current.length > 0) {
          segs.push(current);
          lastValidIndex = current[current.length - 1].index;
          current = [];
        }
      } else {
        if (current.length === 0 && lastValidIndex !== null && idx - lastValidIndex > 1) {
          gaps.push({
            startX: getX(lastValidIndex),
            endX: getX(idx),
          });
        }
        current.push({ index: idx, point });
      }
    });

    if (current.length > 0) {
      segs.push(current);
    }

    return { segments: segs, gapRanges: gaps };
  }, [rows, chartWidth, yMin, yMax]);

  const formatTickTime = (timeMs: number) => {
    try {
      return new Intl.DateTimeFormat(
        'pt-BR',
        periodIndex === 2
          ? { day: '2-digit', month: '2-digit', hour: '2-digit' }
          : { hour: '2-digit', minute: '2-digit' }
      ).format(new Date(timeMs));
    } catch {
      const d = new Date(timeMs);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  };

  const xLabelIndices = useMemo(() => {
    if (rows.length === 0) return [];
    const count = Math.min(6, Math.max(2, Math.floor(chartWidth / 90)));
    const indices: number[] = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.round((i / (count - 1)) * (rows.length - 1));
      if (!indices.includes(idx)) indices.push(idx);
    }
    return indices;
  }, [rows.length, chartWidth]);

  const activePoint =
    selectedIndex !== null && rows[selectedIndex] && !rows[selectedIndex].isGap
      ? rows[selectedIndex]
      : validPoints[validPoints.length - 1] ?? null;

  return (
    <View>
      {activePoint && activePoint.avg !== null && activePoint.min !== null && activePoint.max !== null ? (
        <View
          accessible
          accessibilityLabel={`Amostra selecionada em ${dateTime(activePoint.timestamp)}: Mínima ${fmt(activePoint.min, digits)} ${unit}, Média ${fmt(activePoint.avg, digits)} ${unit}, Máxima ${fmt(activePoint.max, digits)} ${unit}`}
          className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3 flex-row flex-wrap items-center justify-between gap-2"
        >
          <View>
            <Text className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {selectedIndex !== null ? 'Ponto selecionado' : 'Último ponto da página'}
            </Text>
            <Text className="text-xs font-bold text-slate-800 mt-0.5">
              {dateTime(activePoint.timestamp)}
            </Text>
          </View>
          <View className="flex-row items-center gap-3">
            <View>
              <Text className="text-[10px] font-semibold text-slate-500">Mín</Text>
              <Text className="text-xs font-extrabold text-slate-700">
                {fmt(activePoint.min, digits)} {unit}
              </Text>
            </View>
            <View>
              <Text className="text-[10px] font-semibold text-blue-600">Média</Text>
              <Text className="text-xs font-extrabold text-blue-700">
                {fmt(activePoint.avg, digits)} {unit}
              </Text>
            </View>
            <View>
              <Text className="text-[10px] font-semibold text-slate-500">Máx</Text>
              <Text className="text-xs font-extrabold text-slate-900">
                {fmt(activePoint.max, digits)} {unit}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        contentContainerStyle={{ paddingBottom: 6 }}
      >
        <Pressable
          onPress={(e) => {
            const tapX = e.nativeEvent.locationX;
            if (rows.length === 0) return;
            const ratio = Math.max(0, Math.min(1, (tapX - padLeft) / plotWidth));
            const nearestIdx = Math.round(ratio * (rows.length - 1));
            setSelectedIndex(nearestIdx);
          }}
        >
          <Svg width={chartWidth} height={chartHeight}>
            <Defs>
              <LinearGradient id="bandGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#60a5fa" stopOpacity="0.45" />
                <Stop offset="1" stopColor="#93c5fd" stopOpacity="0.2" />
              </LinearGradient>
            </Defs>

            {/* Linhas horizontais de grade e rótulos do eixo Y */}
            {yTicks.map((tickVal, idx) => {
              const y = getY(tickVal);
              return (
                <React.Fragment key={idx}>
                  <Line
                    x1={padLeft}
                    y1={y}
                    x2={chartWidth - padRight}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeWidth={1}
                  />
                  <SvgText
                    x={padLeft - 6}
                    y={y + 4}
                    fontSize="10"
                    fill="#64748b"
                    textAnchor="end"
                    fontWeight="600"
                  >
                    {fmt(tickVal, digits)}
                  </SvgText>
                </React.Fragment>
              );
            })}

            {/* Destaque visual explícito para lacunas sem dados (sem interpolação) */}
            {gapRanges.map((gap, idx) => (
              <React.Fragment key={`gap-${idx}`}>
                <Rect
                  x={gap.startX}
                  y={padTop}
                  width={Math.max(4, gap.endX - gap.startX)}
                  height={plotHeight}
                  fill="#fef3c7"
                  fillOpacity={0.45}
                />
                <Line
                  x1={gap.startX}
                  y1={padTop}
                  x2={gap.startX}
                  y2={padTop + plotHeight}
                  stroke="#d97706"
                  strokeWidth={1}
                  strokeDasharray="4,4"
                />
                <Line
                  x1={gap.endX}
                  y1={padTop}
                  x2={gap.endX}
                  y2={padTop + plotHeight}
                  stroke="#d97706"
                  strokeWidth={1}
                  strokeDasharray="4,4"
                />
              </React.Fragment>
            ))}

            {/* Faixa Mín/Máx e Linha da Média para cada segmento contínuo */}
            {segments.map((seg, segIdx) => {
              if (seg.length === 0) return null;

              if (seg.length === 1) {
                const { index, point } = seg[0];
                const cx = getX(index);
                const cyAvg = getY(point.avg!);
                const cyMin = getY(point.min!);
                const cyMax = getY(point.max!);
                return (
                  <React.Fragment key={`seg-${segIdx}`}>
                    <Line
                      x1={cx}
                      y1={cyMax}
                      x2={cx}
                      y2={cyMin}
                      stroke="#60a5fa"
                      strokeWidth={4}
                    />
                    <Circle cx={cx} cy={cyAvg} r={3.5} fill="#1d4ed8" />
                  </React.Fragment>
                );
              }

              const upperCoords = seg.map(
                ({ index, point }) => `${getX(index).toFixed(1)},${getY(point.max!).toFixed(1)}`
              );
              const lowerCoords = [...seg]
                .reverse()
                .map(
                  ({ index, point }) => `${getX(index).toFixed(1)},${getY(point.min!).toFixed(1)}`
                );

              const bandPath = `M ${upperCoords.join(' L ')} L ${lowerCoords.join(' L ')} Z`;
              const avgCoords = seg.map(
                ({ index, point }) => `${getX(index).toFixed(1)},${getY(point.avg!).toFixed(1)}`
              );
              const avgPath = `M ${avgCoords.join(' L ')}`;

              return (
                <React.Fragment key={`seg-${segIdx}`}>
                  <Path d={bandPath} fill="url(#bandGrad)" stroke="#93c5fd" strokeWidth={0.8} />
                  <Path
                    d={avgPath}
                    fill="none"
                    stroke="#1d4ed8"
                    strokeWidth={2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </React.Fragment>
              );
            })}

            {/* Marcador do ponto selecionado */}
            {selectedIndex !== null &&
            rows[selectedIndex] &&
            !rows[selectedIndex].isGap &&
            rows[selectedIndex].avg !== null ? (
              <>
                <Line
                  x1={getX(selectedIndex)}
                  y1={padTop}
                  x2={getX(selectedIndex)}
                  y2={padTop + plotHeight}
                  stroke="#1e40af"
                  strokeWidth={1.2}
                  strokeDasharray="3,3"
                />
                <Circle
                  cx={getX(selectedIndex)}
                  cy={getY(rows[selectedIndex].avg!)}
                  r={4.5}
                  fill="#1d4ed8"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
              </>
            ) : null}

            {/* Rótulos do eixo X */}
            {xLabelIndices.map((idx) => {
              const row = rows[idx];
              if (!row) return null;
              return (
                <SvgText
                  key={`x-${idx}`}
                  x={getX(idx)}
                  y={chartHeight - 8}
                  fontSize="10"
                  fill="#64748b"
                  textAnchor="middle"
                  fontWeight="600"
                >
                  {formatTickTime(row.time)}
                </SvgText>
              );
            })}
          </Svg>
        </Pressable>
      </ScrollView>
    </View>
  );
}

