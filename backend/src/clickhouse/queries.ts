import { runSelectQuery, toSafeInt, toSafeFloat, toSafeString } from "./mcpClient.js";

export async function getCurrentSnapshot(windowMinutes = 10) {
  const w = toSafeInt(windowMinutes);

  const query = `
    SELECT
      title_id,
      title_name,
      region,
      countMerge(viewer_count) AS viewer_count,
      sumMerge(drop_off_count) AS drop_off_count,
      avgMerge(avg_seconds_watched) AS avg_seconds_watched
    FROM audience_stats_agg
    WHERE minute >= now() - INTERVAL ${w} MINUTE
    GROUP BY title_id, title_name, region
    ORDER BY title_id, region
  `;

  return runSelectQuery(query);
}

export async function getAudienceTimeline(
  titleId?: string,
  region?: string,
  windowMinutes = 30
) {
  const w = toSafeInt(windowMinutes);
  const conditions = [`minute >= now() - INTERVAL ${w} MINUTE`];
  if (titleId) conditions.push(`title_id = '${toSafeString(titleId)}'`);
  if (region) conditions.push(`region = '${toSafeString(region)}'`);

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

  return runSelectQuery(query);
}

export async function getRegionalBreakdown(titleId: string, windowMinutes = 10) {
  const tid = toSafeString(titleId);
  const w = toSafeInt(windowMinutes);

  const query = `
    SELECT
      region,
      countMerge(viewer_count) AS viewer_count,
      sumMerge(drop_off_count) AS drop_off_count,
      avgMerge(avg_seconds_watched) AS avg_seconds_watched
    FROM audience_stats_agg
    WHERE title_id = '${tid}'
      AND minute >= now() - INTERVAL ${w} MINUTE
    GROUP BY region
    ORDER BY viewer_count DESC
  `;

  return runSelectQuery(query);
}

export async function getAnomaliesRelative(
  deviationThreshold = 0.25,
  baselineWindowMinutes = 30,
  recentWindowMinutes = 3,
  minViewers = 2
) {
  const dev = toSafeFloat(deviationThreshold);
  const baseline = toSafeInt(baselineWindowMinutes);
  const recent = toSafeInt(recentWindowMinutes);
  const minV = toSafeInt(minViewers);

  const query = `
    WITH baseline AS (
      SELECT
        title_id,
        region,
        sumMerge(drop_off_count) / countMerge(viewer_count) AS avg_drop_off_rate
      FROM audience_stats_agg
      WHERE minute >= now() - INTERVAL ${baseline} MINUTE
        AND minute < now() - INTERVAL ${recent} MINUTE
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
      WHERE minute >= now() - INTERVAL ${recent} MINUTE
      GROUP BY title_id, title_name, region
    ),
    titles_dedup AS (
      SELECT
        title_id,
        argMax(poster_url, updated_at) AS poster_url
      FROM titles
      GROUP BY title_id
    )
    SELECT
      r.title_id AS title_id,
      r.title_name AS title_name,
      r.region AS region,
      r.viewers AS viewer_count,
      r.current_rate AS current_rate,
      b.avg_drop_off_rate AS baseline_rate,
      r.current_rate - b.avg_drop_off_rate AS deviation,
      t.poster_url AS poster_url
    FROM recent r
    INNER JOIN baseline b ON r.title_id = b.title_id AND r.region = b.region
    LEFT JOIN titles_dedup t ON t.title_id = r.title_id
    WHERE r.viewers >= ${minV}
      AND (r.current_rate - b.avg_drop_off_rate) > ${dev}
    ORDER BY deviation DESC
  `;

  return runSelectQuery(query);
}

export async function getTitleMetadata() {
  const query = `
    SELECT
      title_id,
      argMax(title_name, updated_at) AS title_name,
      argMax(poster_url, updated_at) AS poster_url
    FROM titles
    GROUP BY title_id
    ORDER BY title_id
  `;
  return runSelectQuery(query);
}