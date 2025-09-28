import { PlayGraph, SeriesPoint, CensorFlags } from './types.js';

/**
 * HTMLからPlayGraphのJSONブロックを抽出
 */
export function extractPlayGraphJsonBlocks(html: string): PlayGraph[] {
    const blocks: PlayGraph[] = [];
    const regex = /new PlayGraph\([^,]+,\s*'([^']+)'\)/g;
    let match;

    while ((match = regex.exec(html)) !== null) {
        try {
            const jsonStr = match[1];
            const graphData = JSON.parse(jsonStr);
            
            if (graphData.GRAPH_RECT && graphData.PLAY_INFO && graphData.PLAY_LOG) {
                blocks.push(graphData as PlayGraph);
            }
        } catch (error) {
            console.warn('Failed to parse PlayGraph JSON:', error);
            // 改行除去など軽整形を試みる
            try {
                const cleanedJson = match[1].replace(/\n/g, '').replace(/\r/g, '');
                const graphData = JSON.parse(cleanedJson);
                if (graphData.GRAPH_RECT && graphData.PLAY_INFO && graphData.PLAY_LOG) {
                    blocks.push(graphData as PlayGraph);
                }
            } catch (retryError) {
                console.warn('Retry parsing also failed:', retryError);
            }
        }
    }

    return blocks;
}

/**
 * 対象グラフを選択（点数が最大のグラフ）
 */
export function selectTargetGraph(blocks: PlayGraph[]): PlayGraph | null {
    if (blocks.length === 0) return null;
    
    // 点数が最大のグラフを選択
    return blocks.reduce((max, current) => 
        current.PLAY_LOG.length > max.PLAY_LOG.length ? current : max
    );
}

/**
 * PlayGraphをSeriesPointに変換（座標→値変換）
 */
export function toSeries(pg: PlayGraph): SeriesPoint[] {
    const { GRAPH_RECT, PLAY_INFO, PLAY_LOG } = pg;
    const { x, y, w, h } = GRAPH_RECT;
    const { total, min, max } = PLAY_INFO;

    return PLAY_LOG.map(([px, py]) => {
        const game = (px - x) / w * total;
        const diff = max - (py - y) / h * (max - min);
        
        return {
            game: Math.round(game * 10) / 10, // 小数点第1位で丸め
            diff: Math.round(diff * 10) / 10
        };
    });
}

/**
 * 検閲フラグを検出
 */
export function detectCensorFlags(
    pg: PlayGraph, 
    series: SeriesPoint[], 
    actualGames?: number
): CensorFlags {
    const { PLAY_INFO, GRAPH_RECT } = pg;
    const { total, min } = PLAY_INFO;
    const { y, h } = GRAPH_RECT;
    
    // 右端検閲：PLAY_INFO.total === 8000 かつ 実ゲーム数 > 8000
    const censoredRight = total === 8000 && actualGames !== undefined && actualGames > 8000;
    
    // 下端検閲：PLAY_INFO.min === -2000 かつ PLAY_LOG に py ≈ y + h が連続
    let censoredBottom = false;
    if (min === -2000) {
        const bottomThreshold = y + h - 5; // 5pxのマージン
        let consecutiveBottomCount = 0;
        
        for (const [px, py] of pg.PLAY_LOG) {
            if (py >= bottomThreshold) {
                consecutiveBottomCount++;
                if (consecutiveBottomCount >= 3) { // 3点以上連続
                    censoredBottom = true;
                    break;
                }
            } else {
                consecutiveBottomCount = 0;
            }
        }
    }
    
    return { censoredRight, censoredBottom };
}

/**
 * 下端張り付き開始インデックスを検出
 */
export function findBottomStartIndex(
    series: SeriesPoint[], 
    bottomValue: number, 
    eps: number = 10
): number | null {
    for (let i = 0; i < series.length; i++) {
        if (Math.abs(series[i].diff - bottomValue) <= eps) {
            return i;
        }
    }
    return null;
}

/**
 * 下端開始前の傾きを推定
 */
export function estimateSlopeBeforeBottom(
    series: SeriesPoint[], 
    bottomIndex: number, 
    windowSize: number = 5
): number {
    if (bottomIndex < 2) return 0;
    
    const startIndex = Math.max(0, bottomIndex - windowSize);
    const endIndex = bottomIndex;
    
    if (endIndex - startIndex < 2) return 0;
    
    const points = series.slice(startIndex, endIndex);
    if (points.length < 2) return 0;
    
    // 最小二乗法で傾きを計算
    const n = points.length;
    const sumX = points.reduce((sum, p) => sum + p.game, 0);
    const sumY = points.reduce((sum, p) => sum + p.diff, 0);
    const sumXY = points.reduce((sum, p) => sum + p.game * p.diff, 0);
    const sumXX = points.reduce((sum, p) => sum + p.game * p.game, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return isNaN(slope) ? 0 : slope;
}

/**
 * 8/31の特別扱い（外挿）
 */
export function extrapolateAug31(
    series: SeriesPoint[], 
    targetGame: number = 10073, 
    targetMinDiff: number = -3000, 
    stepGame: number = 50
): SeriesPoint[] {
    if (series.length === 0) return series;
    
    const lastPoint = series[series.length - 1];
    const bottomIndex = findBottomStartIndex(series, -2000);
    
    let extrapolatedPoints: SeriesPoint[] = [];
    let currentGame = lastPoint.game;
    let currentDiff = lastPoint.diff;
    
    // 下端張り付き開始点から傾きを推定
    const slope = bottomIndex !== null ? 
        estimateSlopeBeforeBottom(series, bottomIndex) : 0;
    
    while (currentGame < targetGame) {
        currentGame += stepGame;
        currentDiff += slope * stepGame;
        
        // -3000枚以下になったら-3000に丸める
        if (currentDiff < targetMinDiff) {
            currentDiff = targetMinDiff;
        }
        
        extrapolatedPoints.push({
            game: Math.round(currentGame * 10) / 10,
            diff: Math.round(currentDiff * 10) / 10,
            extrapolated: true
        });
    }
    
    return [...series, ...extrapolatedPoints];
}

/**
 * HTMLから実ゲーム数を抽出
 */
export function extractActualGames(html: string): number | undefined {
    const match = html.match(/<td class="cName">ゲーム数<\/td>\s*<td class="param">(\d+)G<\/td>/);
    return match ? parseInt(match[1]) : undefined;
}

/**
 * ファイルパスから日付を抽出
 */
export function extractDateFromPath(filePath: string): string | null {
    const match = filePath.match(/(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
}