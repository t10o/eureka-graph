import { readFileSync } from 'fs';
import { join } from 'path';
import { PlayGraph, SeriesPoint, DailySummary } from './types.js';
import { 
    extractPlayGraphJsonBlocks, 
    selectTargetGraph, 
    toSeries, 
    detectCensorFlags, 
    extractActualGames,
    extrapolateAug31 
} from './playgraph-utils.js';

/**
 * 単一のHTMLファイルを処理して日別データを生成
 */
export function processDayHtml(filePath: string): {
    day: string;
    series: SeriesPoint[];
    summary: DailySummary;
} | null {
    try {
        const html = readFileSync(filePath, 'utf-8');
        const day = extractDateFromPath(filePath);
        
        if (!day) {
            console.warn(`Could not extract date from path: ${filePath}`);
            return null;
        }
        
        // PlayGraphデータを抽出
        const blocks = extractPlayGraphJsonBlocks(html);
        if (blocks.length === 0) {
            console.warn(`No PlayGraph data found in: ${filePath}`);
            return null;
        }
        
        // 対象グラフを選択
        const targetGraph = selectTargetGraph(blocks);
        if (!targetGraph) {
            console.warn(`No valid target graph found in: ${filePath}`);
            return null;
        }
        
        // SeriesPointに変換
        let series = toSeries(targetGraph);
        
        // 実ゲーム数を抽出
        const actualGames = extractActualGames(html);
        
        // 検閲フラグを検出
        const censorFlags = detectCensorFlags(targetGraph, series, actualGames);
        
        // 8/31の特別扱い
        let specialRuleApplied = false;
        let extrapolatedPointsCount = 0;
        
        if (day === '2024-08-31') {
            series = extrapolateAug31(series);
            specialRuleApplied = true;
            extrapolatedPointsCount = series.filter(p => p.extrapolated).length;
        }
        
        // サマリを作成
        const lastPoint = series[series.length - 1];
        const summary: DailySummary = {
            day,
            lastDiff: lastPoint.diff,
            actualGames,
            censoredRight: censorFlags.censoredRight,
            censoredBottom: censorFlags.censoredBottom,
            specialRuleApplied,
            extrapolatedPointsCount
        };
        
        return { day, series, summary };
        
    } catch (error) {
        console.error(`Error processing ${filePath}:`, error);
        return null;
    }
}

/**
 * ファイルパスから日付を抽出
 */
function extractDateFromPath(filePath: string): string | null {
    const match = filePath.match(/(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
}