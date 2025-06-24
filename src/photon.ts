
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

export const getVolume = async (pairId: string) => {
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
    // "body": `{\"operationName\":\"GetDetailedStats\",\"variables\":{\"pairId\":\"${pairId}:${Math.floor(Date.now() / 1000 - 86400)}\",\"tokenOfInterest\":\"token1\",\"statsType\":\"FILTERED\"},\"query\":\"query GetDetailedStats($pairId: String!, $tokenOfInterest: TokenOfInterest, $timestamp: Int, $windowSizes: [DetailedStatsWindowSize], $bucketCount: Int, $statsType: TokenPairStatisticsType) {\\n  getDetailedStats(\\n    pairId: $pairId\\n    tokenOfInterest: $tokenOfInterest\\n    timestamp: $timestamp\\n    windowSizes: $windowSizes\\n    bucketCount: $bucketCount\\n    statsType: $statsType\\n  ) {\\n    pairId\\n    tokenOfInterest\\n    statsType\\n    stats_min5 {\\n      ...WindowedDetailedStatsFields\\n      __typename\\n    }\\n    stats_hour1 {\\n      ...WindowedDetailedStatsFields\\n      __typename\\n    }\\n    stats_hour4 {\\n      ...WindowedDetailedStatsFields\\n      __typename\\n    }\\n    stats_hour12 {\\n      ...WindowedDetailedStatsFields\\n      __typename\\n    }\\n    stats_day1 {\\n      ...WindowedDetailedStatsFields\\n      __typename\\n    }\\n    __typename\\n  }\\n}\\n\\nfragment WindowedDetailedStatsFields on WindowedDetailedStats {\\n  windowSize\\n  timestamp\\n  endTimestamp\\n  buckets {\\n    start\\n    end\\n    __typename\\n  }\\n  transactions {\\n    ...DetailedStatsNumberMetricsFields\\n    __typename\\n  }\\n  volume {\\n    ...DetailedStatsStringMetricsFields\\n    __typename\\n  }\\n  buys {\\n    ...DetailedStatsNumberMetricsFields\\n    __typename\\n  }\\n  sells {\\n    ...DetailedStatsNumberMetricsFields\\n    __typename\\n  }\\n  buyers {\\n    ...DetailedStatsNumberMetricsFields\\n    __typename\\n  }\\n  sellers {\\n    ...DetailedStatsNumberMetricsFields\\n    __typename\\n  }\\n  traders {\\n    ...DetailedStatsNumberMetricsFields\\n    __typename\\n  }\\n  buyVolume {\\n    ...DetailedStatsStringMetricsFields\\n    __typename\\n  }\\n  sellVolume {\\n    ...DetailedStatsStringMetricsFields\\n    __typename\\n  }\\n  __typename\\n}\\n\\nfragment DetailedStatsNumberMetricsFields on DetailedStatsNumberMetrics {\\n  change\\n  currentValue\\n  previousValue\\n  buckets\\n  __typename\\n}\\n\\nfragment DetailedStatsStringMetricsFields on DetailedStatsStringMetrics {\\n  change\\n  currentValue\\n  previousValue\\n  buckets\\n  __typename\\n}\"}`,
    "body": `{\"operationName\":\"GetDetailedStats\",\"variables\":{\"pairId\":\"${pairId}:${1399811149}\",\"tokenOfInterest\":\"token1\",\"statsType\":\"FILTERED\"},\"query\":\"query GetDetailedStats($pairId: String!, $tokenOfInterest: TokenOfInterest, $timestamp: Int, $windowSizes: [DetailedStatsWindowSize], $bucketCount: Int, $statsType: TokenPairStatisticsType) {\\n  getDetailedStats(\\n    pairId: $pairId\\n    tokenOfInterest: $tokenOfInterest\\n    timestamp: $timestamp\\n    windowSizes: $windowSizes\\n    bucketCount: $bucketCount\\n    statsType: $statsType\\n  ) {\\n    pairId\\n    tokenOfInterest\\n    statsType\\n    stats_min5 {\\n      ...WindowedDetailedStatsFields\\n      __typename\\n    }\\n    stats_hour1 {\\n      ...WindowedDetailedStatsFields\\n      __typename\\n    }\\n    stats_hour4 {\\n      ...WindowedDetailedStatsFields\\n      __typename\\n    }\\n    stats_hour12 {\\n      ...WindowedDetailedStatsFields\\n      __typename\\n    }\\n    stats_day1 {\\n      ...WindowedDetailedStatsFields\\n      __typename\\n    }\\n    __typename\\n  }\\n}\\n\\nfragment WindowedDetailedStatsFields on WindowedDetailedStats {\\n  windowSize\\n  timestamp\\n  endTimestamp\\n  buckets {\\n    start\\n    end\\n    __typename\\n  }\\n  transactions {\\n    ...DetailedStatsNumberMetricsFields\\n    __typename\\n  }\\n  volume {\\n    ...DetailedStatsStringMetricsFields\\n    __typename\\n  }\\n  buys {\\n    ...DetailedStatsNumberMetricsFields\\n    __typename\\n  }\\n  sells {\\n    ...DetailedStatsNumberMetricsFields\\n    __typename\\n  }\\n  buyers {\\n    ...DetailedStatsNumberMetricsFields\\n    __typename\\n  }\\n  sellers {\\n    ...DetailedStatsNumberMetricsFields\\n    __typename\\n  }\\n  traders {\\n    ...DetailedStatsNumberMetricsFields\\n    __typename\\n  }\\n  buyVolume {\\n    ...DetailedStatsStringMetricsFields\\n    __typename\\n  }\\n  sellVolume {\\n    ...DetailedStatsStringMetricsFields\\n    __typename\\n  }\\n  __typename\\n}\\n\\nfragment DetailedStatsNumberMetricsFields on DetailedStatsNumberMetrics {\\n  change\\n  currentValue\\n  previousValue\\n  buckets\\n  __typename\\n}\\n\\nfragment DetailedStatsStringMetricsFields on DetailedStatsStringMetrics {\\n  change\\n  currentValue\\n  previousValue\\n  buckets\\n  __typename\\n}\"}`,
    "method": "POST",
    "mode": "cors",
    "credentials": "include"
  });

  const result = await data.json()
  console.log("🚀 ~ getVolume ~ result:", result)

  const { stats_min5, stats_hour1, stats_hour4, stats_hour12, stats_day1 } = result.data.getDetailedStats

  const {buyVolume, sellVolume} = stats_hour1
  return {buyVolume: Number(buyVolume.currentValue), sellVolume: Number(sellVolume.currentValue)}
}
