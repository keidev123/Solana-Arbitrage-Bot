export function analyzeTokenStats(
  allStats: TimeframeStats,
  weights: ImportanceWeights
): AnalysisResult {
  const insights = [];
  let totalScore = 0;
  let consistentUp = 0;

  const timeframes = Object.keys(allStats);

  for (const timeframe of timeframes) {
    const stat = allStats[timeframe];
    const reasons: string[] = [];
    let score = 0;

    const buyVolumeChange = stat.buyVolume.change;
    const sellVolumeChange = stat.sellVolume.change;
    const buySellRatio =
      parseFloat(stat.buyVolume.currentValue) /
      (parseFloat(stat.sellVolume.currentValue) || 1);
    const buysChange = stat.buys.change;
    const txChange = stat.transactions.change;

    // Scoring
    score += (buySellRatio - 1) * weights.buySellRatio;
    score += buyVolumeChange * weights.buyVolumeChange;
    score -= sellVolumeChange * weights.sellVolumeChange; // penalize sell spikes
    score += buysChange * weights.buysChange;
    score += txChange * weights.transactionsChange;

    if (buySellRatio > 1.2) reasons.push(`High buy/sell ratio: ${buySellRatio.toFixed(2)}`);
    if (buyVolumeChange > 0.3) reasons.push(`Buy volume increased ${Math.round(buyVolumeChange * 100)}%`);
    if (sellVolumeChange > 0.3) reasons.push(`Sell volume increased ${Math.round(sellVolumeChange * 100)}%`);
    if (buysChange > 0.2) reasons.push(`Buys increased ${Math.round(buysChange * 100)}%`);
    if (txChange > 0.2) reasons.push(`Transactions increased ${Math.round(txChange * 100)}%`);

    const rating: "strong" | "neutral" | "weak" =
      score > 2.5
        ? 'strong'
        : score > 0.5
        ? 'neutral'
        : 'weak';

    totalScore += score;

    insights.push({
      score,
      timeframe,
      rating,
      reasons,
    });
  }

  const tags: string[] = [];
  if (totalScore > 5) tags.push('bullish', 'accumulation');
  if (totalScore < 0) tags.push('bearish', 'selling-pressure');

  return {
    score: Math.round(totalScore * 100) / 100,
    tags,
    summary: `Token shows ${tags.includes('bullish') ? 'strong buy-side activity' : tags.includes('bearish') ? 'selling pressure' : 'mixed signals'} with ${consistentUp} consistent positive windows.`,
    insights,
  };
}


const auth = async (i: number) => {
  if (i % 20)
    return
  let n: any;
  let S = !0

  const charCode = (e: any) => {
    return Buffer.from(new Uint8Array(e)).toString('base64');
  };

  const fetchKeyApi = (e: any) => (S && (S = !1, n = fetch(`https://d2gndqco47nwa6.cloudfront.net?challenge=${encodeURIComponent(e)}`).then(e => (S = !0, e.text()))), n);

  const getJwt: any = async () => {
    try {

      let token
      let updatedAt = 250000
      if (!token || Date.now() - updatedAt > 24e4) {
        let chCode = charCode(await crypto.subtle.digest("sha-256", new TextEncoder().encode((Math.floor(Date.now() / 1e3) - Math.floor(Date.now() / 1e3) % 300).toString())))
        let fetchedKey = await fetchKeyApi(chCode);
        if (!fetchedKey)
          throw Error("Error setting token for user");
        if ((token = fetchedKey).includes("Failed challenge"))
          return await new Promise(e => setTimeout(e, 1e3)),
            await getJwt();
        if (!fetchedKey) {
          console.log("XXXXXXXXXXXXXXXXXXXXXX Failed to get JWT", fetchedKey);
          return
        }
      }
      return token

    } catch (error) {
      console.log("getJwt function error:", error)

      return ""
    }
  };

  let jwtToken = await getJwt()
  return jwtToken
}

export const analyzeToken = async (pairId: string) => {
  try {
    const jwtToken = await auth(0)
    const data = await fetch("https://graph.codex.io/graphql", {
      "headers": {
        "accept": "*/*",
        "accept-language": "en-US,en;q=0.9",
        "authorization": `Bearer ${jwtToken}`,
        "content-type": "application/json",
        "priority": "u=1, i",
        "sec-ch-ua": "\"Google Chrome\";v=\"129\", \"Not=A?Brand\";v=\"8\", \"Chromium\";v=\"129\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "cross-site"
      },
      "referrerPolicy": "no-referrer",
      // "body": `{\"operationName\":\"GetDetailedStats\",\"variables\":{\"pairId\":\"${pairId}:${Math.floor(Date.now() / 1000 - 600)}\",\"tokenOfInterest\":\"token1\",\"statsType\":\"FILTERED\"},\"query\":\"query GetDetailedStats($pairId: String!, $tokenOfInterest: TokenOfInterest, $timestamp: Int, $windowSizes: [DetailedStatsWindowSize], $bucketCount: Int, $statsType: TokenPairStatisticsType) {\\n  getDetailedStats(\\n    pairId: $pairId\\n    tokenOfInterest: $tokenOfInterest\\n    timestamp: $timestamp\\n    windowSizes: $windowSizes\\n    bucketCount: $bucketCount\\n    statsType: $statsType\\n  ) {\\n    pairId\\n    tokenOfInterest\\n    statsType\\n    stats_min5 {\\n      ...WindowedDetailedStatsFields\\n      __typename\\n    }\\n    stats_hour1 {\\n      ...WindowedDetailedStatsFields\\n      __typename\\n    }\\n    stats_hour4 {\\n      ...WindowedDetailedStatsFields\\n      __typename\\n    }\\n    stats_hour12 {\\n      ...WindowedDetailedStatsFields\\n      __typename\\n    }\\n    stats_day1 {\\n      ...WindowedDetailedStatsFields\\n      __typename\\n    }\\n    __typename\\n  }\\n}\\n\\nfragment WindowedDetailedStatsFields on WindowedDetailedStats {\\n  windowSize\\n  timestamp\\n  endTimestamp\\n  buckets {\\n    start\\n    end\\n    __typename\\n  }\\n  transactions {\\n    ...DetailedStatsNumberMetricsFields\\n    __typename\\n  }\\n  volume {\\n    ...DetailedStatsStringMetricsFields\\n    __typename\\n  }\\n  buys {\\n    ...DetailedStatsNumberMetricsFields\\n    __typename\\n  }\\n  sells {\\n    ...DetailedStatsNumberMetricsFields\\n    __typename\\n  }\\n  buyers {\\n    ...DetailedStatsNumberMetricsFields\\n    __typename\\n  }\\n  sellers {\\n    ...DetailedStatsNumberMetricsFields\\n    __typename\\n  }\\n  traders {\\n    ...DetailedStatsNumberMetricsFields\\n    __typename\\n  }\\n  buyVolume {\\n    ...DetailedStatsStringMetricsFields\\n    __typename\\n  }\\n  sellVolume {\\n    ...DetailedStatsStringMetricsFields\\n    __typename\\n  }\\n  __typename\\n}\\n\\nfragment DetailedStatsNumberMetricsFields on DetailedStatsNumberMetrics {\\n  change\\n  currentValue\\n  previousValue\\n  buckets\\n  __typename\\n}\\n\\nfragment DetailedStatsStringMetricsFields on DetailedStatsStringMetrics {\\n  change\\n  currentValue\\n  previousValue\\n  buckets\\n  __typename\\n}\"}`,
      "body": `{\"operationName\":\"GetDetailedStats\",\"variables\":{\"pairId\":\"${pairId}:${1399811149}\",\"tokenOfInterest\":\"token1\",\"statsType\":\"FILTERED\"},\"query\":\"query GetDetailedStats($pairId: String!, $tokenOfInterest: TokenOfInterest, $timestamp: Int, $windowSizes: [DetailedStatsWindowSize], $bucketCount: Int, $statsType: TokenPairStatisticsType) {\\n  getDetailedStats(\\n    pairId: $pairId\\n    tokenOfInterest: $tokenOfInterest\\n    timestamp: $timestamp\\n    windowSizes: $windowSizes\\n    bucketCount: $bucketCount\\n    statsType: $statsType\\n  ) {\\n    pairId\\n    tokenOfInterest\\n    statsType\\n    stats_min5 {\\n      ...WindowedDetailedStatsFields\\n      __typename\\n    }\\n    stats_hour1 {\\n      ...WindowedDetailedStatsFields\\n      __typename\\n    }\\n    stats_hour4 {\\n      ...WindowedDetailedStatsFields\\n      __typename\\n    }\\n    stats_hour12 {\\n      ...WindowedDetailedStatsFields\\n      __typename\\n    }\\n    stats_day1 {\\n      ...WindowedDetailedStatsFields\\n      __typename\\n    }\\n    __typename\\n  }\\n}\\n\\nfragment WindowedDetailedStatsFields on WindowedDetailedStats {\\n  windowSize\\n  timestamp\\n  endTimestamp\\n  buckets {\\n    start\\n    end\\n    __typename\\n  }\\n  transactions {\\n    ...DetailedStatsNumberMetricsFields\\n    __typename\\n  }\\n  volume {\\n    ...DetailedStatsStringMetricsFields\\n    __typename\\n  }\\n  buys {\\n    ...DetailedStatsNumberMetricsFields\\n    __typename\\n  }\\n  sells {\\n    ...DetailedStatsNumberMetricsFields\\n    __typename\\n  }\\n  buyers {\\n    ...DetailedStatsNumberMetricsFields\\n    __typename\\n  }\\n  sellers {\\n    ...DetailedStatsNumberMetricsFields\\n    __typename\\n  }\\n  traders {\\n    ...DetailedStatsNumberMetricsFields\\n    __typename\\n  }\\n  buyVolume {\\n    ...DetailedStatsStringMetricsFields\\n    __typename\\n  }\\n  sellVolume {\\n    ...DetailedStatsStringMetricsFields\\n    __typename\\n  }\\n  __typename\\n}\\n\\nfragment DetailedStatsNumberMetricsFields on DetailedStatsNumberMetrics {\\n  change\\n  currentValue\\n  previousValue\\n  buckets\\n  __typename\\n}\\n\\nfragment DetailedStatsStringMetricsFields on DetailedStatsStringMetrics {\\n  change\\n  currentValue\\n  previousValue\\n  buckets\\n  __typename\\n}\"}`,
      "method": "POST",
      "mode": "cors",
      "credentials": "include"
    });

    const result = await data.json()

    const { stats_min5, stats_hour1, stats_hour4, stats_hour12, stats_day1 } = result.data.getDetailedStats
    return {stats_min5, stats_hour1, stats_hour4, stats_hour12, stats_day1}
    // const analyzedResult = analyzeTokenStats(
    //   {
    //     "5min": stats_min5,
    //     "1hr": stats_hour1,
    //     // "4hr": stats_hour4,
    //     // "12hr": stats_hour12,
    //     // "1d": stats_day1
    //   },
    //   {
    //     buySellRatio: 1,
    //     buyVolumeChange: 1,
    //     sellVolumeChange: 1,
    //     buysChange: 1,
    //     transactionsChange: 1,
    //     priceChange: 1,
    //     consistency: 1
    //   }
    // )
    // return analyzedResult
  } catch (error) {
    console.error("Error fetching volume data");
  }
}

type DetailedStats = {
  buyVolume: { change: number; currentValue: string; previousValue: string };
  sellVolume: { change: number; currentValue: string; previousValue: string };
  buys: { change: number };
  transactions: { change: number };
  buysCount: number;
  sellsCount: number;
};

type TimeframeStats = {
  [key: string]: DetailedStats;
};

type ImportanceWeights = {
  buySellRatio: number;
  buyVolumeChange: number;
  sellVolumeChange: number;
  buysChange: number;
  transactionsChange: number;
  priceChange: number;
  consistency: number;
};

type AnalysisResult = {
  score: number;
  tags: string[];
  summary: string;
  insights: {
    timeframe: string;
    rating: 'strong' | 'neutral' | 'weak';
    reasons: string[];
  }[];
};
