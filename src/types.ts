export type PlayInfo = { 
    total: number; 
    min: number; 
    max: number; 
};

export type GraphRect = { 
    x: number; 
    y: number; 
    w: number; 
    h: number; 
};

export type PlayGraph = { 
    GRAPH_RECT: GraphRect; 
    PLAY_INFO: PlayInfo; 
    PLAY_LOG: [number, number][]; 
};

export type SeriesPoint = { 
    game: number; 
    diff: number; 
    extrapolated?: boolean; 
};

export type CensorFlags = {
    censoredRight: boolean;
    censoredBottom: boolean;
};

export type DailySummary = {
    day: string;
    lastDiff: number;
    actualGames?: number;
    censoredRight: boolean;
    censoredBottom: boolean;
    specialRuleApplied: boolean;
    extrapolatedPointsCount: number;
};

export type CumulativePoint = {
    cumGame: number;
    cumDiff: number;
    day: string;
    extrapolated?: boolean;
};
