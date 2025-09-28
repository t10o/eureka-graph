#!/usr/bin/env node

import { glob } from 'glob';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { processDayHtml } from './day-processor.js';
import { concatDays } from './cumulative-processor.js';
import { 
    writeDayCsv, 
    writeDailySummaryCsv, 
    writeCumulativeCsv 
} from './csv-writer.js';
import { generateCumulativeChart } from './chart-generator.js';
import { SeriesPoint, DailySummary } from './types.js';

interface CliOptions {
    out: string;
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
        console.error('Usage: pnpm tsx src/cli.ts "data/**/*.html" --out out');
        process.exit(1);
    }
    
    const pattern = args[0];
    const outIndex = args.indexOf('--out');
    const outputDir = outIndex !== -1 && args[outIndex + 1] ? args[outIndex + 1] : 'out';
    
    console.log(`Processing files matching: ${pattern}`);
    console.log(`Output directory: ${outputDir}`);
    
    // 出力ディレクトリを作成
    mkdirSync(outputDir, { recursive: true });
    
    try {
        // HTMLファイルを検索
        const files = await glob(pattern);
        console.log(`Found ${files.length} files`);
        
        if (files.length === 0) {
            console.warn('No files found matching the pattern');
            return;
        }
        
        // 各ファイルを処理
        const daySeries: Record<string, SeriesPoint[]> = {};
        const summaries: DailySummary[] = [];
        const dayOrder: string[] = [];
        
        for (const file of files) {
            console.log(`Processing: ${file}`);
            const result = processDayHtml(file);
            
            if (result) {
                const { day, series, summary } = result;
                daySeries[day] = series;
                summaries.push(summary);
                dayOrder.push(day);
                
                // 日別CSVを出力
                writeDayCsv(outputDir, day, series);
            }
        }
        
        // 日付順にソート
        dayOrder.sort();
        summaries.sort((a, b) => a.day.localeCompare(b.day));
        
        // 日別サマリCSVを出力
        writeDailySummaryCsv(outputDir, summaries);
        
        // 累積データを生成
        const cumulativePoints = concatDays(daySeries, dayOrder);
        
        // 累積CSVを出力
        writeCumulativeCsv(outputDir, cumulativePoints);
        
        // 累積グラフを生成
        await generateCumulativeChart(outputDir, cumulativePoints);
        
        console.log('\n=== Summary ===');
        console.log(`Processed ${summaries.length} days`);
        console.log(`Total data points: ${cumulativePoints.length}`);
        
        const aug31Summary = summaries.find(s => s.day === '2024-08-31');
        if (aug31Summary) {
            console.log(`8/31 special rule applied: ${aug31Summary.specialRuleApplied}`);
            console.log(`8/31 extrapolated points: ${aug31Summary.extrapolatedPointsCount}`);
        }
        
        const censoredDays = summaries.filter(s => s.censoredRight || s.censoredBottom);
        if (censoredDays.length > 0) {
            console.log(`Censored days: ${censoredDays.map(s => s.day).join(', ')}`);
        }
        
        console.log('\nAll files written to:', outputDir);
        
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}