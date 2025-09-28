import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { SeriesPoint, DailySummary, CumulativePoint } from './types.js';

/**
 * SeriesPointをCSVに変換
 */
export function seriesToCsv(series: SeriesPoint[]): string {
    const headers = ['game', 'diff', 'extrapolated'];
    const rows = series.map(point => [
        point.game.toString(),
        point.diff.toString(),
        point.extrapolated ? 'true' : 'false'
    ]);
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
}

/**
 * DailySummaryをCSVに変換
 */
export function dailySummaryToCsv(summaries: DailySummary[]): string {
    const headers = [
        'day', 
        'last_diff', 
        'actual_games', 
        'censored_right', 
        'censored_bottom', 
        'special_rule_applied', 
        'extrapolated_points_count'
    ];
    
    const rows = summaries.map(summary => [
        summary.day,
        summary.lastDiff.toString(),
        summary.actualGames?.toString() || '',
        summary.censoredRight.toString(),
        summary.censoredBottom.toString(),
        summary.specialRuleApplied.toString(),
        summary.extrapolatedPointsCount.toString()
    ]);
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
}

/**
 * CumulativePointをCSVに変換
 */
export function cumulativeToCsv(points: CumulativePoint[]): string {
    const headers = ['cum_game', 'cum_diff', 'day', 'extrapolated'];
    const rows = points.map(point => [
        point.cumGame.toString(),
        point.cumDiff.toString(),
        point.day,
        point.extrapolated ? 'true' : 'false'
    ]);
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
}

/**
 * 日別CSVファイルを出力
 */
export function writeDayCsv(
    outputDir: string, 
    day: string, 
    series: SeriesPoint[]
): void {
    const dayDir = join(outputDir, 'days');
    mkdirSync(dayDir, { recursive: true });
    
    const csv = seriesToCsv(series);
    const filePath = join(dayDir, `${day}.csv`);
    writeFileSync(filePath, csv, 'utf-8');
    
    console.log(`Written: ${filePath}`);
}

/**
 * 日別サマリCSVを出力
 */
export function writeDailySummaryCsv(
    outputDir: string, 
    summaries: DailySummary[]
): void {
    const csv = dailySummaryToCsv(summaries);
    const filePath = join(outputDir, 'daily_summary.csv');
    writeFileSync(filePath, csv, 'utf-8');
    
    console.log(`Written: ${filePath}`);
}

/**
 * 累積CSVを出力
 */
export function writeCumulativeCsv(
    outputDir: string, 
    points: CumulativePoint[]
): void {
    const csv = cumulativeToCsv(points);
    const filePath = join(outputDir, 'all_time_curve.csv');
    writeFileSync(filePath, csv, 'utf-8');
    
    console.log(`Written: ${filePath}`);
}