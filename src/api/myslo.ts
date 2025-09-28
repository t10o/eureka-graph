// 2023/12から現在までの全月次データを取得
export const fetchAllMonthlyData = async () => {
    const data: Array<{date: Date, html: string}> = [];
    const currentDate = new Date();
    
    // 2023年12月から開始
    const startDate = new Date(2023, 11, 1); // 11 = 12月（0ベース）
    
    for (let date = new Date(startDate); date <= currentDate; date.setMonth(date.getMonth() + 1)) {
        try {
            const month = date.getMonth() + 1;
            const year = date.getFullYear();
            const dateString = `${year}${month.toString().padStart(2, '0')}`;
            
            const response = await fetch(`https://sammyqr.jp/smartphone/B1/record/index?date=${dateString}&site_type=0&commit=%E9%81%B8%E6%8A%9E`, {
                headers: {
                    'Host': 'sammyqr.jp',
                    'Sec-Fetch-Site': 'same-origin',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Cookie': import.meta.env.COOKIE,
                    'Connection': 'keep-alive',
                    'Sec-Fetch-Mode': 'navigate',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MysloApp/2.2.3',
                    'Referer': `https://sammyqr.jp/smartphone/B1/record/index?date=${dateString}&site_type=0&commit=%E9%81%B8%E6%8A%9E`,
                    'Sec-Fetch-Dest': 'document',
                    'Accept-Language': 'ja',
                }
            });
            
            const html = await response.text();
            
            data.push({
                date: new Date(date),
                html: html
            });

            // リクエスト間隔を空ける
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            console.error(`Error fetching data for ${date.getFullYear()}/${date.getMonth() + 1}:`, error);
        }
    }
    
    return data;
}

// HTMLからPlayGraphのJSONデータを抽出
export const extractPlayGraphData = (html: string) => {
    const playGraphRegex = /new PlayGraph\([^,]+,\s*'([^']+)'\)/g;
    const graphDataList: any[] = [];
    let graphMatch;
    
    while ((graphMatch = playGraphRegex.exec(html)) !== null) {
        try {
            const graphData = JSON.parse(graphMatch[1]);
            if (graphData.PLAY_LOG && graphData.PLAY_LOG.length > 0) {
                graphDataList.push(graphData);
            }
        } catch (e) {
            console.error('Error parsing PlayGraph data:', e);
        }
    }
    
    return graphDataList;
}

// HTMLからゲーム数と収支データを抽出
export const parseGameData = (html: string) => {
    const gameData: Array<{games: number, balance: number, date: string, playLog: Array<[number, number]>}> = [];
    
    // 各セッションのデータを抽出
    const sessionRegex = /<div class="dispTime">[\s\S]*?<span>([^<]+)<\/span>[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>[\s\S]*?<div class="play_graph" id="play_graph_\d+"><\/div>/g;
    let sessionMatch;
    
    while ((sessionMatch = sessionRegex.exec(html)) !== null) {
        const dateStr = sessionMatch[1];
        const tableHtml = sessionMatch[2];
        
        // ゲーム数を抽出
        const gamesMatch = tableHtml.match(/<td class="cName">ゲーム数<\/td>\s*<td class="param">(\d+)G<\/td>/);
        if (!gamesMatch) continue;
        
        const games = parseInt(gamesMatch[1]);
        
        // このセッションのPlayGraphデータを取得
        const playGraphDataList = extractPlayGraphData(html);
        const playLog = playGraphDataList.length > 0 ? playGraphDataList[0].PLAY_LOG : [];
        
        // 最後のポイントの収支を取得
        const balance = playLog.length > 0 ? playLog[playLog.length - 1][1] : 0;
        
        gameData.push({
            games,
            balance,
            date: dateStr,
            playLog: playLog
        });
    }
    
    return gameData;
}

// 全月次データから通算データを計算
export const calculateCumulativeData = (monthlyData: Array<{date: Date, html: string}>) => {
    const allSessions: Array<{games: number, balance: number, date: string, cumulativeGames: number, cumulativeBalance: number, playLog: Array<[number, number]>}> = [];
    let totalGames = 0;
    let totalBalance = 0;
    
    // 月次データを古い順にソート
    monthlyData.sort((a, b) => a.date.getTime() - b.date.getTime());
    
    for (const monthData of monthlyData) {
        const sessions = parseGameData(monthData.html);
        
        for (const session of sessions) {
            // 各セッションのゲーム数と収支を累積
            totalGames += session.games;
            totalBalance += session.balance;
            
            allSessions.push({
                ...session,
                cumulativeGames: totalGames,
                cumulativeBalance: totalBalance
            });
        }
    }
    
    return allSessions;
}

// 全セッションのPlayGraphデータを結合
// 全セッションのPlayGraphデータを結合
export const combinePlayGraphData = (sessions: Array<{games: number, balance: number, date: string, cumulativeGames: number, cumulativeBalance: number, playLog: Array<[number, number]>}>) => {
    const combinedPlayLog: Array<[number, number]> = [];
    let cumulativeGames = 0;
    let previousSessionEndBalance = 0;
    
    for (let i = 0; i < sessions.length; i++) {
        const session = sessions[i];
        
        if (session.playLog.length > 0) {
            // セッションの開始時の収支オフセット
            const sessionStartBalance = session.playLog[0][1];
            const balanceOffset = previousSessionEndBalance - sessionStartBalance;
            
            // 各セッションのPlayLogを通算座標に変換
            for (let j = 0; j < session.playLog.length; j++) {
                const [sessionGames, sessionBalance] = session.playLog[j];
                
                // X座標: 累積ゲーム数 + セッション内ゲーム数
                const globalGames = cumulativeGames + sessionGames;
                // Y座標: セッション内収支 + オフセット
                const globalBalance = sessionBalance + balanceOffset;
                combinedPlayLog.push([globalGames, globalBalance]);
            }
            
            // 次のセッションのために累積値を更新
            const lastPoint = session.playLog[session.playLog.length - 1];
            cumulativeGames += lastPoint[0]; // セッション内の最終ゲーム数
            previousSessionEndBalance = lastPoint[1] + balanceOffset; // セッション終了時の収支
        }
    }
    
    return combinedPlayLog;
}

// PlayGraphのデータ形式に変換
export const convertToPlayGraphData = (sessions: Array<{games: number, balance: number, date: string, cumulativeGames: number, cumulativeBalance: number, playLog: Array<[number, number]>}>) => {
    // グラフの範囲設定
    const maxGames = 8000; // 8000G以上は丸める
    const minBalance = -2000; // -2000枚未満は丸める
    const maxBalance = 4000;
    
    // 全セッションのPlayGraphデータを結合
    const combinedPlayLog = combinePlayGraphData(sessions);
    
    // 範囲制限を適用
    const clampedPlayLog = combinedPlayLog.map(([games, balance]) => [
        Math.min(games, maxGames),
        Math.max(minBalance, Math.min(balance, maxBalance))
    ]);
    
    // PlayGraphの設定
    const graphConfig = {
        CANVAS_WIDTH: 1080,
        CANVAS_HEIGHT: 816,
        CANVAS_FRAME: 14,
        FONT_SIZE: 34,
        GRAPH_RECT: {
            x: 119,
            y: 68,
            w: 893,
            h: 646
        },
        GRAPH_LINE: 7,
        AXIS_UNIT: {
            x: 2000,
            y: 2000
        },
        PLAY_INFO: {
            total: maxGames,
            min: minBalance,
            max: maxBalance
        },
        PLAY_LOG: clampedPlayLog,
        LINE_FLAG: true,
        LIGHT_MODE: true
    };
    
    return graphConfig;
}