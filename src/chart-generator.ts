import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { CumulativePoint } from './types.js';

/**
 * 累積グラフをPNGとして出力
 */
export async function generateCumulativeChart(
    outputDir: string,
    points: CumulativePoint[]
): Promise<void> {
    const width = 1200;
    const height = 800;
    
    // ChartJSNodeCanvasのインスタンスを作成
    const chartJSNodeCanvas = new ChartJSNodeCanvas({ 
        width, 
        height,
        backgroundColour: 'white'
    });
    
    // データを分離（実データと外挿データ）
    const realData = points.filter(p => !p.extrapolated);
    const extrapolatedData = points.filter(p => p.extrapolated);
    
    // Chart.jsの設定
    const configuration = {
        type: 'line' as const,
        data: {
            datasets: [
                {
                    label: '実データ',
                    data: realData.map(p => ({ x: p.cumGame, y: p.cumDiff })),
                    borderColor: '#0066cc',
                    backgroundColor: 'rgba(0, 102, 204, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1
                },
                {
                    label: '8/31後半は外挿（推測）',
                    data: extrapolatedData.map(p => ({ x: p.cumGame, y: p.cumDiff })),
                    borderColor: '#cc6600',
                    backgroundColor: 'rgba(204, 102, 0, 0.1)',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: false,
            plugins: {
                title: {
                    display: true,
                    text: '累積差枚グラフ',
                    font: {
                        size: 20,
                        weight: 'bold'
                    }
                },
                legend: {
                    display: true,
                    position: 'top' as const
                }
            },
            scales: {
                x: {
                    type: 'linear' as const,
                    title: {
                        display: true,
                        text: 'ゲーム数'
                    },
                    ticks: {
                        callback: function(value: any) {
                            return `${(value / 1000).toFixed(0)}K`;
                        }
                    }
                },
                y: {
                    type: 'linear' as const,
                    title: {
                        display: true,
                        text: '差枚'
                    },
                    ticks: {
                        callback: function(value: any) {
                            return value.toFixed(0);
                        }
                    }
                }
            }
        }
    };
    
    // グラフを生成
    const imageBuffer = await chartJSNodeCanvas.renderToBuffer(configuration);
    
    // ファイルに保存
    const filePath = join(outputDir, 'all_time_curve.png');
    writeFileSync(filePath, imageBuffer);
    
    console.log(`Written: ${filePath}`);
}