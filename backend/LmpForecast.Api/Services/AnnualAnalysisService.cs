using LmpForecast.Api.Data;
using LmpForecast.Api.Models;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace LmpForecast.Api.Services;

public record AnalysisRequest(DateOnly From, DateOnly To, IReadOnlyList<string> Classes, int? Round, long? SourcePnodeId, long? SinkPnodeId);

public record AnalysisSegment(DateOnly From, DateOnly To, string PlanningYear, long? AuctionId, string? AuctionLabel, int DaHours, int CalendarHours);

public record PathResult(
    DateOnly From, DateOnly To, string Auction,
    long SourcePnodeId, string SourceNode, long SinkPnodeId, string SinkNode,
    string ClassType, int Hours, decimal ClearedMw,
    decimal AuctionPrice, decimal ActualPrice, decimal Error);

public record NodeResult(long PnodeId, string Name, string ClassType, int Hours, decimal AuctionPrice, decimal ActualPrice, decimal Error);

public record MonthPoint(string Month, string ClassType, int Hours, decimal AuctionPrice, decimal ActualPrice, decimal Error);

public record AnalysisResult(
    IReadOnlyList<AnalysisSegment> Segments,
    IReadOnlyList<PathResult> Paths,
    IReadOnlyList<NodeResult> Nodes,
    string? SeriesLabel,
    IReadOnlyList<MonthPoint> Series);

/// <summary>
/// Annual FTR auction price versus actual day-ahead congestion.
///
/// Auction price of a path = sink nodal price − source nodal price ("Obligation Nodal Prices",
/// $/MW for the whole planning year). For a date range it is prorated by the hours of that class
/// that have DA data: price × hours in range ÷ class hours in the planning year.
/// Actual = Σ over those hours of (sink DA congestion − source DA congestion), $/MW.
/// Error = Actual − Auction. 24H is the sum of the three classes.
/// A range crossing 1 June is split by planning year, each part using its own annual auction.
/// </summary>
public class AnnualAnalysisService(AppDbContext db)
{
    private record Key(long PnodeId, DateOnly Month, string Class);

    public async Task<AnalysisResult> RunAsync(AnalysisRequest req, CancellationToken ct)
    {
        var classes = req.Classes.Count == 0 ? [PjmCalendar.AllHours] : req.Classes;
        var auctions = await db.UploadBatches.AsNoTracking()
            .Where(b => b.DataType == UploadDataType.AuctionNodalPrices && b.Status == UploadStatus.Completed && b.AuctionType == AuctionType.Annual)
            .ToListAsync(ct);

        var segments = new List<AnalysisSegment>();
        var paths = new List<PathResult>();
        var nodeTotals = new Dictionary<(long, string), (string Name, int Hours, decimal Auction, decimal Actual)>();
        var series = new Dictionary<(DateOnly, string), (int Hours, decimal Auction, decimal Actual)>();
        string? seriesLabel = null;

        var pyStart = req.From.Month >= 6 ? req.From.Year : req.From.Year - 1;
        for (var y = pyStart; new DateOnly(y, 6, 1) <= req.To; y++)
        {
            var pyFrom = new DateOnly(y, 6, 1);
            var pyTo = new DateOnly(y + 1, 5, 31);
            var segFrom = req.From > pyFrom ? req.From : pyFrom;
            var segTo = req.To < pyTo ? req.To : pyTo;
            var label = $"{y}-{y + 1}";
            var calendarHours = (segTo.DayNumber - segFrom.DayNumber + 1) * 24;

            var auction = auctions
                .Where(b => b.CoverageStart == pyFrom && (req.Round == null || b.Round == req.Round))
                .OrderByDescending(b => b.Round).ThenByDescending(b => b.UploadedAt)
                .FirstOrDefault();
            if (auction is null)
            {
                segments.Add(new AnalysisSegment(segFrom, segTo, label, null, null, 0, calendarHours));
                continue;
            }
            var auctionLabel = $"Annual {auction.AuctionPeriod} RD {auction.Round}";

            // Nodal prices for this auction (annual period type "All").
            var focusIds = new[] { req.SourcePnodeId, req.SinkPnodeId }.Where(i => i != null).Select(i => i!.Value).ToList();
            var nodal = (await db.AuctionNodalPrices.AsNoTracking().Where(n => n.UploadBatchId == auction.Id).ToListAsync(ct)).GroupBy(n => n.PnodeId).ToDictionary(g => g.Key, g => g.First());

            // Actual congestion summed per node, month and class.
            var actual = await LoadActualAsync(segFrom, segTo, ct);
            var daNodes = actual.Keys.Select(k => k.PnodeId).ToHashSet();
            var classHours = PjmCalendar.ClassHours(pyFrom, pyTo.AddDays(1));
            segments.Add(new AnalysisSegment(segFrom, segTo, label, auction.Id, auctionLabel,
                actual.Count == 0 ? 0 : actual.GroupBy(k => k.Key.PnodeId).Max(g => g.Sum(x => x.Value.Hours)), calendarHours));

            var names = actual.Keys.Select(k => k.PnodeId).Distinct().ToDictionary(id => id, id => nodal.TryGetValue(id, out var n) ? n.Node : id.ToString());

            // Index actual by node for speed.
            var byNode = actual.GroupBy(k => k.Key.PnodeId).ToDictionary(g => g.Key, g => g.ToDictionary(x => x.Key, x => x.Value));
            (int Hours, decimal Auction, decimal Actual) Value(long id, DateOnly? month, string cls)
            {
                if (!byNode.TryGetValue(id, out var rows) || !nodal.TryGetValue(id, out var price)) return (0, 0, 0);
                var bases = cls == PjmCalendar.AllHours ? PjmCalendar.BaseClasses : [cls];
                int hours = 0; decimal auc = 0, act = 0;
                foreach (var b in bases)
                {
                    var classPrice = b switch
                    {
                        PjmCalendar.OnPeak => price.LmpOnPeak,
                        PjmCalendar.WkndOnPeak => price.LmpWkndOnPeak,
                        _ => price.LmpDailyOffPeak,
                    } ?? 0;
                    foreach (var (k, v) in rows)
                    {
                        if (k.Class != b || (month != null && k.Month != month)) continue;
                        hours += v.Hours;
                        act += v.Sum;
                        auc += classHours[b] == 0 ? 0 : classPrice * v.Hours / classHours[b];
                    }
                }
                return (hours, auc, act);
            }

            // Node totals across segments.
            foreach (var id in daNodes.Where(nodal.ContainsKey))
            {
                foreach (var cls in classes)
                {
                    var v = Value(id, null, cls);
                    var key = (id, cls);
                    nodeTotals[key] = nodeTotals.TryGetValue(key, out var t)
                        ? (t.Name, t.Hours + v.Hours, t.Auction + v.Auction, t.Actual + v.Actual)
                        : (names[id], v.Hours, v.Auction, v.Actual);
                }
            }

            // Which paths: the one chosen, or cleared obligation paths with DA data at both ends.
            List<(long Src, string SrcName, long Snk, string SnkName)> pairs;
            var cleared = await db.AuctionPathSummaries.AsNoTracking()
                .Where(p => p.UploadBatchId == auction.Id && p.HedgeType == "Obligation")
                .Where(p => req.SourcePnodeId == null || p.SourcePnodeId == req.SourcePnodeId)
                .Where(p => req.SinkPnodeId == null || p.SinkPnodeId == req.SinkPnodeId)
                .Select(p => new { p.SourcePnodeId, p.SourceNode, p.SinkPnodeId, p.SinkNode, p.ClassType, Mw = p.BuyMw + p.SellMw })
                .ToListAsync(ct);
            var clearedMw = cleared.GroupBy(p => (p.SourcePnodeId, p.SinkPnodeId, p.ClassType)).ToDictionary(g => g.Key, g => g.Sum(x => x.Mw));

            if (req.SourcePnodeId is not null && req.SinkPnodeId is not null)
            {
                pairs = [(req.SourcePnodeId.Value, Name(req.SourcePnodeId.Value), req.SinkPnodeId.Value, Name(req.SinkPnodeId.Value))];
            }
            else
            {
                pairs = cleared
                    .Where(p => p.SourcePnodeId != p.SinkPnodeId && daNodes.Contains(p.SourcePnodeId) && daNodes.Contains(p.SinkPnodeId))
                    .Select(p => (p.SourcePnodeId, p.SourceNode, p.SinkPnodeId, p.SinkNode))
                    .Distinct()
                    .ToList();
            }
            string Name(long id) => names.TryGetValue(id, out var n) ? n : nodal.TryGetValue(id, out var p) ? p.Node : id.ToString();

            foreach (var (src, srcName, snk, snkName) in pairs)
            {
                foreach (var cls in classes)
                {
                    var s = Value(src, null, cls);
                    var k = Value(snk, null, cls);
                    if (s.Hours == 0 || k.Hours == 0) continue;
                    clearedMw.TryGetValue((src, snk, cls), out var mw);
                    var auc = k.Auction - s.Auction;
                    var act = k.Actual - s.Actual;
                    paths.Add(new PathResult(segFrom, segTo, auctionLabel, src, srcName, snk, snkName, cls, Math.Min(s.Hours, k.Hours), mw,
                        Math.Round(auc, 2), Math.Round(act, 2), Math.Round(act - auc, 2)));
                }
            }

            // Month-by-month series for the chosen path or node.
            var months = actual.Keys.Select(k => k.Month).Distinct().OrderBy(m => m).ToList();
            if (focusIds.Count > 0)
            {
                seriesLabel = req.SourcePnodeId is not null && req.SinkPnodeId is not null
                    ? $"{Name(req.SourcePnodeId.Value)} → {Name(req.SinkPnodeId.Value)}"
                    : Name(focusIds[0]);
                foreach (var m in months)
                {
                    foreach (var cls in classes)
                    {
                        (int Hours, decimal Auction, decimal Actual) v;
                        if (req.SourcePnodeId is not null && req.SinkPnodeId is not null)
                        {
                            var s = Value(req.SourcePnodeId.Value, m, cls);
                            var k = Value(req.SinkPnodeId.Value, m, cls);
                            if (s.Hours == 0 || k.Hours == 0) continue;
                            v = (Math.Min(s.Hours, k.Hours), k.Auction - s.Auction, k.Actual - s.Actual);
                        }
                        else
                        {
                            v = Value(focusIds[0], m, cls);
                            if (v.Hours == 0) continue;
                        }
                        series[(m, cls)] = v;
                    }
                }
            }
        }

        var nodes = nodeTotals
            .Select(kv => new NodeResult(kv.Key.Item1, kv.Value.Name, kv.Key.Item2, kv.Value.Hours,
                Math.Round(kv.Value.Auction, 2), Math.Round(kv.Value.Actual, 2), Math.Round(kv.Value.Actual - kv.Value.Auction, 2)))
            .OrderByDescending(n => Math.Abs(n.Error))
            .ToList();
        var seriesPoints = series
            .OrderBy(kv => kv.Key.Item1)
            .Select(kv => new MonthPoint(kv.Key.Item1.ToString("yyyy-MM"), kv.Key.Item2, kv.Value.Hours,
                Math.Round(kv.Value.Auction, 2), Math.Round(kv.Value.Actual, 2), Math.Round(kv.Value.Actual - kv.Value.Auction, 2)))
            .ToList();

        return new AnalysisResult(segments, paths.OrderByDescending(p => Math.Abs(p.Error)).ToList(), nodes, seriesLabel, seriesPoints);
    }

    /// <summary>Σ DA congestion and hour count per node, month and class (duplicate hours averaged first).</summary>
    private async Task<Dictionary<Key, (decimal Sum, int Hours)>> LoadActualAsync(DateOnly from, DateOnly to, CancellationToken ct)
    {
        var holidays = PjmCalendar.NercHolidays(from.Year, to.Year).Select(d => d.ToDateTime(TimeOnly.MinValue)).ToArray();
        var conn = (NpgsqlConnection)db.Database.GetDbConnection();
        var opened = conn.State != System.Data.ConnectionState.Open;
        if (opened) await conn.OpenAsync(ct);
        try
        {
            await using var cmd = new NpgsqlCommand(
                """
                WITH h AS (
                    SELECT pnode_id, datetime_beginning_ept AS dt, avg(congestion_price_da) AS c
                    FROM da_hourly_lmp
                    WHERE datetime_beginning_ept >= @from AND datetime_beginning_ept < @to
                    GROUP BY pnode_id, datetime_beginning_ept
                )
                SELECT pnode_id,
                       date_trunc('month', dt)::date AS m,
                       CASE WHEN extract(hour FROM dt) < 7 OR extract(hour FROM dt) > 22 THEN 'DailyOffPeak'
                            WHEN extract(isodow FROM dt) >= 6 OR date_trunc('day', dt) = ANY(@holidays) THEN 'WkndOnPeak'
                            ELSE 'OnPeak' END AS cls,
                       sum(c), count(*)
                FROM h
                GROUP BY 1, 2, 3
                """, conn);
            cmd.Parameters.AddWithValue("from", from.ToDateTime(TimeOnly.MinValue));
            cmd.Parameters.AddWithValue("to", to.AddDays(1).ToDateTime(TimeOnly.MinValue));
            cmd.Parameters.AddWithValue("holidays", holidays);
            cmd.CommandTimeout = 300;

            var result = new Dictionary<Key, (decimal, int)>();
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                var key = new Key(reader.GetInt64(0), DateOnly.FromDateTime(reader.GetDateTime(1)), reader.GetString(2));
                result[key] = (reader.GetDecimal(3), (int)reader.GetInt64(4));
            }
            return result;
        }
        finally
        {
            if (opened) await conn.CloseAsync();
        }
    }
}
