import { clickhouse } from "./client.js";

export async function getCurrentSnapshot(windowMinutes = 10) {
  const query = `
    SELECT
      title_id,
      title_name,
      region,
      countMerge(viewer_count) AS viewer_count,
      sumMerge(drop_off_count) AS drop_off_count,
      avgMerge(avg_seconds_watched) AS avg_seconds_watched
    FROM audience_stats_agg
    WHERE minute >= now() - INTERVAL {windowMinutes:UInt32} MINUTE
    GROUP BY title_id, title_name, region
    ORDER BY title_id, region
  `;

  const resultSet = await clickhouse.query({
    query,
    query_params: { windowMinutes },
    format: "JSONEachRow",
  });

  return resultSet.json();
}

export async function getAudienceTimeline(
  titleId?: string,
  region?: string,
  windowMinutes = 30
) {
  const conditions = ["minute >= now() - INTERVAL {windowMinutes:UInt32} MINUTE"];
  if (titleId) conditions.push("title_id = {titleId:String}");
  if (region) conditions.push("region = {region:String}");

  const query = `
    SELECT
      minute,
      title_id,
      title_name,
      region,
      countMerge(viewer_count) AS viewer_count,
      sumMerge(drop_off_count) AS drop_off_count,
      avgMerge(avg_seconds_watched) AS avg_seconds_watched
    FROM audience_stats_agg
    WHERE ${conditions.join(" AND ")}
    GROUP BY minute, title_id, title_name, region
    ORDER BY minute ASC
  `;

  const resultSet = await clickhouse.query({
    query,
    query_params: { windowMinutes, titleId, region },
    format: "JSONEachRow",
  });

  return resultSet.json();
}

export async function getRegionalBreakdown(titleId: string, windowMinutes = 10) {
  const query = `
    SELECT
      region,
      countMerge(viewer_count) AS viewer_count,
      sumMerge(drop_off_count) AS drop_off_count,
      avgMerge(avg_seconds_watched) AS avg_seconds_watched
    FROM audience_stats_agg
    WHERE title_id = {titleId:String}
      AND minute >= now() - INTERVAL {windowMinutes:UInt32} MINUTE
    GROUP BY region
    ORDER BY viewer_count DESC
  `;

  const resultSet = await clickhouse.query({
    query,
    query_params: { titleId, windowMinutes },
    format: "JSONEachRow",
  });

  return resultSet.json();
}

export async function getAnomaliesRelative(
  deviationThreshold = 0.25,
  baselineWindowMinutes = 30,
  recentWindowMinutes = 2
) {
  const query = `
    WITH baseline AS (
      SELECT
        title_id,
        region,
        sumMerge(drop_off_count) / countMerge(viewer_count) AS avg_drop_off_rate
      FROM audience_stats_agg
      WHERE minute >= now() - INTERVAL {baselineWindowMinutes:UInt32} MINUTE
        AND minute < now() - INTERVAL {recentWindowMinutes:UInt32} MINUTE
      GROUP BY title_id, region
    ),
    recent AS (
      SELECT
        title_id,
        title_name,
        region,
        countMerge(viewer_count) AS viewers,
        sumMerge(drop_off_count) AS dropoffs,
        dropoffs / viewers AS current_rate
      FROM audience_stats_agg
      WHERE minute >= now() - INTERVAL {recentWindowMinutes:UInt32} MINUTE
      GROUP BY title_id, title_name, region
    )
    SELECT
      r.title_id,
      r.title_name,
      r.region,
      r.viewers AS viewer_count,
      r.current_rate,
      b.avg_drop_off_rate AS baseline_rate,
      r.current_rate - b.avg_drop_off_rate AS deviation
    FROM recent r
    INNER JOIN baseline b ON r.title_id = b.title_id AND r.region = b.region
    WHERE r.viewers >= 3
      AND (r.current_rate - b.avg_drop_off_rate) > {deviationThreshold:Float32}
    ORDER BY deviation DESC
  `;

  const resultSet = await clickhouse.query({
    query,
    query_params: { deviationThreshold, baselineWindowMinutes, recentWindowMinutes },
    format: "JSONEachRow",
  });

  return resultSet.json();
}