import type { APIRoute } from 'astro';
import { fetchAllMonthlyData } from '../../api/myslo.js';
import { processDayHtml } from '../../day-processor.js';
import { concatDays } from '../../cumulative-processor.js';

export const GET: APIRoute = async () => {
    try {
        // 全月次データを取得
        const monthlyData = await fetchAllMonthlyData();
        
        // 各月のHTMLを処理して日別データを生成
        const daySeries: Record<string, any[]> = {};
        const summaries: any[] = [];
        const dayOrder: string[] = [];
        
        for (const monthData of monthlyData) {
            // 月次データから日付を生成（仮想的な日付）
            const dateStr = monthData.date.toISOString().split('T')[0];
            
            // HTMLを一時ファイルに保存して処理
            const tempHtml = monthData.html;
            
            // 日別データを処理
            const result = processDayHtmlFromString(tempHtml, dateStr);
            
            if (result) {
                const { day, series, summary } = result;
                daySeries[day] = series;
                summaries.push(summary);
                dayOrder.push(day);
            }
        }
        
        // 日付順にソート
        dayOrder.sort();
        summaries.sort((a, b) => a.day.localeCompare(b.day));
        
        // 日別データをDayPoints形式に変換
        const daySeriesData: DayPoints[] = [];
        for (const day of dayOrder) {
            const dayData = daySeries[day];
            if (dayData && dayData.length > 0) {
                const points = dayData.map(s => ({
                    game: s.game,
                    diff: s.diff,
                    extrapolated: s.extrapolated
                }));
                daySeriesData.push({ day, points });
            }
        }
        
        // buildCumulative関数で累積データを生成
        const points = buildCumulative(daySeriesData);
        
        // データ監査
        sanityCheck(points);
        
        // X軸の最大値を2000の倍数に丸める
        const maxX = Math.ceil((points.at(-1)?.x ?? 0) / 2000) * 2000;
        
        // Chart.js用のデータ形式に変換
        const chartData = {
            datasets: [{
                label: "累積収支",
                data: points,               // {x, y, day, extrapolated?}
                parsing: false,             // x/y をそのまま使う
                showLine: true,             // 点だけになるのを防ぐ
                borderWidth: 2,
                pointRadius: 1.5,
                pointHoverRadius: 2,
                fill: false,
                segment: {
                    // 外挿区間だけ破線
                    borderDash: (ctx: any) => {
                        const a = ctx.p0?.raw as any, b = ctx.p1?.raw as any;
                        return (a?.extrapolated || b?.extrapolated) ? [6,4] : undefined;
                    }
                }
            }],
            maxX: maxX
        };
        
        return new Response(JSON.stringify({
            success: true,
            data: chartData,
            points: points,
            summaries: summaries
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        console.error('Error fetching cumulative data:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to fetch cumulative data'
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }
};

// HTML文字列から日別データを処理する関数
function processDayHtmlFromString(html: string, day: string): {
    day: string;
    series: any[];
    summary: any;
} | null {
    try {
        // PlayGraphデータを抽出
        const blocks = extractPlayGraphJsonBlocks(html);
        if (blocks.length === 0) {
            console.warn(`No PlayGraph data found for: ${day}`);
            return null;
        }
        
        // 対象グラフを選択
        const targetGraph = selectTargetGraph(blocks);
        if (!targetGraph) {
            console.warn(`No valid target graph found for: ${day}`);
            return null;
        }
        
        // 実ゲーム数を抽出
        const actualGames = parseActualGamesFromHtml(html);
        
        // SeriesPointに変換（実ゲーム数に合わせて再スケール）
        let series = toSeries(targetGraph, actualGames);
        
        // 検閲フラグを検出
        const censorFlags = detectCensorFlags(targetGraph, series, actualGames);
        
        // 8/31の特別扱い
        let specialRuleApplied = false;
        let extrapolatedPointsCount = 0;
        
        if (day === '2024-08-31') {
            series = extrapolateAug31(series, 10073, -3000, 50);
            specialRuleApplied = true;
            extrapolatedPointsCount = series.filter(p => p.extrapolated).length;
        }
        
        // サマリを作成
        const lastPoint = series[series.length - 1];
        const summary = {
            day,
            lastDiff: lastPoint.diff,
            actualGames,
            censoredRight: censorFlags.censoredRight,
            censoredBottom: censorFlags.censoredBottom,
            specialRuleApplied,
            extrapolatedPointsCount,
            // 検閲日の検出（実ゲーム数 > 8000 なのにグラフは8000で打ち切り）
            isCensoredRight: actualGames ? actualGames > 8000 && lastPoint.game < actualGames * 0.9 : false
        };
        
        return { day, series, summary };
        
    } catch (error) {
        console.error(`Error processing ${day}:`, error);
        return null;
    }
}

// 必要な関数をインポート
import { 
    extractPlayGraphJsonBlocks, 
    selectTargetGraph, 
    toSeries, 
    detectCensorFlags, 
    extractActualGames,
    parseActualGamesFromHtml,
    extrapolateAug31 
} from '../../playgraph-utils.js';

// buildCumulative関数（累積データの作り直し）
type DayPoints = { day: string; points: { game: number; diff: number; extrapolated?: boolean }[] };

export function buildCumulative(daySeries: DayPoints[]) {
    // 日付順に並べる
    const days = [...daySeries].sort((a, b) => a.day.localeCompare(b.day));

    const out: { x: number; y: number; day: string; extrapolated?: boolean }[] = [];
    let cumGame = 0;   // 累積ゲーム数（前日終端を加算）
    let offset  = 0;   // 累積差枚    （前日終端を加算）

    for (const d of days) {
        if (!d.points?.length) continue;

        // 念のため日内を昇順ソート
        d.points.sort((a,b)=>a.game-b.game);

        // 日内の先頭を0起点にそろえる（日内 diff が絶対値なら、ここで日内オフセットを引く）
        const dayBaseDiff = d.points[0].diff;
        const dayStartGame = d.points[0].game;

        for (const p of d.points) {
            const x = cumGame + (p.game - dayStartGame);      // 累積ゲーム数
            const y = offset   + (p.diff - dayBaseDiff);      // 累積差枚
            out.push({ x, y, day: d.day, extrapolated: !!p.extrapolated });
        }

        // この日の終端でオフセットを更新
        const last = d.points[d.points.length - 1];
        cumGame += last.game - dayStartGame;                 // 今日ぶんを加算
        offset  += last.diff - dayBaseDiff;                  // 今日ぶんを加算
    }

    // 縦軸のゼロ基準（最古を0）
    const base = out[0]?.y ?? 0;
    for (const p of out) p.y -= base;

    // x・y の不正＆重複 x を除去
    const seen = new Set<number>();
    const clean: typeof out = [];
    for (const p of out) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        const k = +p.x.toFixed(6);
        if (seen.has(k)) continue;
        seen.add(k);
        clean.push(p);
    }
    // 念のため昇順
    clean.sort((a,b)=>a.x-b.x);
    return clean;
}

// データ監査関数
function sanityCheck(pts: { x: number; y: number; day: string; extrapolated?: boolean }[]) {
    for (let i = 1; i < pts.length; i++) {
        if (pts[i].x < pts[i-1].x) {
            throw new Error(`xが後退: idx=${i} ${pts[i-1].x} -> ${pts[i].x}`);
        }
    }
    console.log("OK: xは単調増加。最終x=", pts.at(-1)?.x, "最終y=", pts.at(-1)?.y);
}
