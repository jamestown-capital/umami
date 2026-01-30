import clickhouse from '@/lib/clickhouse';
import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/prisma';

const FUNCTION_NAME = 'getWebsiteSession';

export async function getWebsiteSession(...args: [websiteId: string, sessionId: string]) {
  return runQuery({
    [PRISMA]: () => relationalQuery(...args),
    [CLICKHOUSE]: () => clickhouseQuery(...args),
  });
}

async function relationalQuery(websiteId: string, sessionId: string) {
  const { rawQuery, getTimestampDiffSQL } = prisma;

  return rawQuery(
    `
    select id,
      distinct_id as "distinctId",
      website_id as "websiteId",
      browser,
      os,
      device,
      screen,
      language,
      country,
      region,
      city,
      user_agent as "userAgent",
      min(min_time) as "firstAt",
      max(max_time) as "lastAt",
      count(distinct visit_id) as visits,
      sum(views) as views,
      sum(events) as events,
      sum(${getTimestampDiffSQL('min_time', 'max_time')}) as "totaltime"
    from (select
          session.session_id as id,
          session.distinct_id,
          website_event.visit_id,
          session.website_id,
          session.browser,
          session.os,
          session.device,
          session.screen,
          session.language,
          session.country,
          session.region,
          session.city,
          session.user_agent,
          min(website_event.created_at) as min_time,
          max(website_event.created_at) as max_time,
          sum(case when website_event.event_type = 1 then 1 else 0 end) as views,
          sum(case when website_event.event_type = 2 then 1 else 0 end) as events
    from session
    join website_event on website_event.session_id = session.session_id
    where session.website_id = {{websiteId::uuid}}
      and session.session_id = {{sessionId::uuid}}
    group by session.session_id, session.distinct_id, visit_id, session.website_id, session.browser, session.os, session.device, session.screen, session.language, session.country, session.region, session.city, session.user_agent) t
    group by id, distinct_id, website_id, browser, os, device, screen, language, country, region, city, user_agent;
    `,
    { websiteId, sessionId },
    FUNCTION_NAME,
  ).then(result => result?.[0]);
}

async function clickhouseQuery(websiteId: string, sessionId: string) {
  const { rawQuery, getDateStringSQL } = clickhouse;

  return rawQuery(
    `
    select id,
      websiteId,
      distinctId,
      browser,
      os,
      device,
      screen,
      language,
      country,
      region,
      city,
      userAgent,
      ${getDateStringSQL('min(min_time)')} as firstAt,
      ${getDateStringSQL('max(max_time)')} as lastAt,
      uniq(visit_id) visits,
      sum(views) as views,
      sum(events) as events,
      sum(max_time-min_time) as totaltime
    from (select
              s.session_id as id,
              s.distinct_id as distinctId,
              s.visit_id,
              s.website_id as websiteId,
              s.browser,
              s.os,
              s.device,
              s.screen,
              s.language,
              s.country,
              s.region,
              s.city,
              any(e.user_agent) as userAgent,
              min(s.min_time) as min_time,
              max(s.max_time) as max_time,
              sum(s.views) as views,
              length(groupArrayArray(s.event_name)) as events
        from website_event_stats_hourly s
        left join website_event e on e.session_id = s.session_id and e.website_id = s.website_id
        where s.website_id = {websiteId:UUID}
          and s.session_id = {sessionId:UUID}
        group by s.session_id, s.distinct_id, s.visit_id, s.website_id, s.browser, s.os, s.device, s.screen, s.language, s.country, s.region, s.city) t
    group by id, websiteId, distinctId, browser, os, device, screen, language, country, region, city, userAgent;
    `,
    { websiteId, sessionId },
    FUNCTION_NAME,
  ).then(result => result?.[0]);
}
