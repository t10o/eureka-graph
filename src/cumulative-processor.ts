import { SeriesPoint, CumulativePoint } from './types.js';

/**
 * 日別データを累積データに連結
 */
export function concatDays(
    daySeries: Record<string, SeriesPoint[]>, 
    dayOrder: string[]
): CumulativePoint[] {
    const result: CumulativePoint[] = [];
    let cumulativeOffset = 0;
    
    for (const day of dayOrder) {
        const series = daySeries[day];
        if (!series) continue;
        
        for (const point of series) {
            result.push({
                cumGame: point.game,
                cumDiff: point.diff + cumulativeOffset,
                day,
                extrapolated: point.extrapolated
            });
        }
        
        // 次の日のオフセットを更新（この日の最後のポイントの差枚を使用）
        const lastPoint = series[series.length - 1];
        cumulativeOffset += lastPoint.diff;
    }
    
    return result;
}