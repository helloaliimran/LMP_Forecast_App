using System.Globalization;
using LmpForecast.Api.Data;
using LmpForecast.Api.Models;
using LmpForecast.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LmpForecast.Api.Controllers;

/// <summary>Source → sink FTR network for the welcome screen.</summary>
[ApiController]
[Route("api/network")]
[Authorize]
public class NetworkController(AppDbContext db) : ControllerBase
{
    public record AuctionOption(long Id, string Label, string AuctionType, string? Period, int? Round, DateOnly? CoverageStart, DateOnly? CoverageEnd, int FtrRowCount);

    [HttpGet("options")]
    public async Task<object> Options(CancellationToken ct)
    {
        var auctions = await AuctionsWithResults().OrderByDescending(b => b.CoverageStart).ThenByDescending(b => b.Round).ToListAsync(ct);
        var ids = auctions.Select(a => a.Id).ToList();
        var classTypes = await db.AuctionPathSummaries.Where(p => ids.Contains(p.UploadBatchId)).Select(p => p.ClassType).Distinct().OrderBy(x => x).ToListAsync(ct);
        var hedgeTypes = await db.AuctionPathSummaries.Where(p => ids.Contains(p.UploadBatchId)).Select(p => p.HedgeType).Distinct().OrderBy(x => x).ToListAsync(ct);
        var daFirst = await db.DaHourlyLmps.MinAsync(r => (DateTime?)r.DatetimeBeginningEpt, ct);
        var daLast = await db.DaHourlyLmps.MaxAsync(r => (DateTime?)r.DatetimeBeginningEpt, ct);

        return new
        {
            auctions = auctions.Select(ToOption),
            classTypes,
            hedgeTypes,
            daFirstDay = daFirst is null ? (DateOnly?)null : DateOnly.FromDateTime(daFirst.Value),
            daLastDay = daLast is null ? (DateOnly?)null : DateOnly.FromDateTime(daLast.Value),
        };
    }

    /// <summary>
    /// Nodes that appear as a source or sink in an auction, matched by name or PNODEID.
    /// With role=source only sources are listed (role=sink: only sinks); otherPnodeId limits
    /// the list to nodes that have a path with that node at the other end.
    /// </summary>
    [HttpGet("nodes")]
    public async Task<object> Nodes([FromQuery] long auctionId, [FromQuery] string? q, [FromQuery] string role = "either", [FromQuery] long? otherPnodeId = null, CancellationToken ct = default)
    {
        var paths = db.AuctionPathSummaries.Where(p => p.UploadBatchId == auctionId);
        var sources = paths.Where(p => otherPnodeId == null || p.SinkPnodeId == otherPnodeId)
            .Select(p => new { Id = p.SourcePnodeId, Name = p.SourceNode, Mw = p.BuyMw + p.SellMw });
        var sinks = paths.Where(p => otherPnodeId == null || p.SourcePnodeId == otherPnodeId)
            .Select(p => new { Id = p.SinkPnodeId, Name = p.SinkNode, Mw = p.BuyMw + p.SellMw });
        var ends = role switch
        {
            "source" => sources,
            "sink" => sinks,
            _ => sources.Concat(sinks),
        };

        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim();
            var isId = long.TryParse(term, NumberStyles.Integer, CultureInfo.InvariantCulture, out var id);
            var pattern = $"%{term.Replace("%", "").Replace("_", "")}%";
            ends = ends.Where(e => EF.Functions.ILike(e.Name, pattern) || (isId && e.Id == id));
        }

        return await ends.GroupBy(e => e.Id)
            .Select(g => new { pnodeId = g.Key, name = g.Min(e => e.Name), totalMw = g.Sum(e => e.Mw) })
            .OrderByDescending(n => n.totalMw)
            .Take(25)
            .ToListAsync(ct);
    }

    /// <summary>
    /// Top source → sink paths for the chosen auction and filters, with each node's auction
    /// nodal price and, for hubs and zones, its day-ahead LMP over the chosen month or day.
    /// </summary>
    /// <param name="date">"yyyy-MM" for a month or "yyyy-MM-dd" for a day.</param>
    /// <param name="auctionId">Optional; when missing, the auction covering the date is used.</param>
    /// <param name="sourcePnodeId">Only paths starting at this node.</param>
    /// <param name="sinkPnodeId">Only paths ending at this node.</param>
    /// <param name="pnodeId">Only paths touching this node at either end.</param>
    [HttpGet("paths")]
    public async Task<ActionResult<object>> Paths(
        [FromQuery] string? date,
        [FromQuery] long? auctionId,
        [FromQuery] string? classType,
        [FromQuery] string? hedgeType,
        [FromQuery] long? sourcePnodeId,
        [FromQuery] long? sinkPnodeId,
        [FromQuery] long? pnodeId,
        [FromQuery] int top = 100,
        [FromQuery] decimal minMw = 0,
        CancellationToken ct = default)
    {
        top = Math.Clamp(top, 1, 1000);

        // Date window: a whole month or a single day.
        DateOnly? windowStart = null, windowEnd = null;
        var granularity = "none";
        if (!string.IsNullOrWhiteSpace(date))
        {
            if (DateOnly.TryParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day))
            {
                (windowStart, windowEnd, granularity) = (day, day, "day");
            }
            else if (DateOnly.TryParseExact(date + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var month))
            {
                (windowStart, windowEnd, granularity) = (month, month.AddMonths(1).AddDays(-1), "month");
            }
            else
            {
                return BadRequest(new { message = "date must be yyyy-MM or yyyy-MM-dd." });
            }
        }

        var auction = auctionId is not null
            ? await AuctionsWithResults().FirstOrDefaultAsync(b => b.Id == auctionId, ct)
            : await PickAuctionAsync(windowStart, ct);
        if (auction is null)
            return Ok(new { auction = (AuctionOption?)null, message = windowStart is null ? "No auction results have been uploaded yet." : "No uploaded auction covers this date.", nodes = Array.Empty<object>(), paths = Array.Empty<object>() });

        var periodType = windowStart is null ? null : AuctionCoverage.PeriodTypeFor(auction, windowStart.Value);
        var coversDate = windowStart is null || (auction.CoverageStart <= windowEnd && auction.CoverageEnd >= windowStart);

        var query = db.AuctionPathSummaries.AsNoTracking().Where(p => p.UploadBatchId == auction.Id);
        if (periodType is not null) query = query.Where(p => p.PeriodType == periodType);
        if (!string.IsNullOrWhiteSpace(classType) && classType != "All") query = query.Where(p => p.ClassType == classType);
        if (!string.IsNullOrWhiteSpace(hedgeType) && hedgeType != "All") query = query.Where(p => p.HedgeType == hedgeType);
        if (sourcePnodeId is not null) query = query.Where(p => p.SourcePnodeId == sourcePnodeId);
        if (sinkPnodeId is not null) query = query.Where(p => p.SinkPnodeId == sinkPnodeId);
        if (pnodeId is not null) query = query.Where(p => p.SourcePnodeId == pnodeId || p.SinkPnodeId == pnodeId);

        var grouped = query
            .GroupBy(p => new { p.SourcePnodeId, p.SinkPnodeId })
            .Select(g => new
            {
                g.Key.SourcePnodeId,
                SourceNode = g.Min(p => p.SourceNode),
                g.Key.SinkPnodeId,
                SinkNode = g.Min(p => p.SinkNode),
                ClearedMw = g.Sum(p => p.BuyMw + p.SellMw),
                NetMw = g.Sum(p => p.NetMw),
                FtrCount = g.Sum(p => p.FtrCount),
                McpWeighted = g.Sum(p => (p.AvgMcp ?? 0) * (p.BuyMw + p.SellMw)),
            })
            .Where(p => p.ClearedMw >= minMw);

        var totalPaths = await grouped.CountAsync(ct);
        var rows = await grouped.OrderByDescending(p => p.ClearedMw).Take(top).ToListAsync(ct);

        var nodeIds = rows.SelectMany(r => new[] { r.SourcePnodeId, r.SinkPnodeId }).Distinct().ToList();

        // Auction nodal price for each node (column follows the class type; 24H when "All").
        var nodalQuery = db.AuctionNodalPrices.AsNoTracking().Where(n => n.UploadBatchId == auction.Id && nodeIds.Contains(n.PnodeId));
        if (periodType is not null) nodalQuery = nodalQuery.Where(n => n.PeriodType == periodType);
        var nodal = (await nodalQuery.ToListAsync(ct))
            .GroupBy(n => n.PnodeId)
            .ToDictionary(g => g.Key, g => g.First());
        decimal? NodalPrice(long id)
        {
            if (!nodal.TryGetValue(id, out var n)) return null;
            return classType switch
            {
                "OnPeak" => n.LmpOnPeak,
                "WkndOnPeak" => n.LmpWkndOnPeak,
                "DailyOffPeak" => n.LmpDailyOffPeak,
                _ => n.Lmp24H,
            };
        }

        // Day-ahead LMP over the window, for nodes that have it (hubs and zones in the uploaded files).
        var da = new Dictionary<long, (decimal Lmp, decimal Congestion)>();
        if (windowStart is not null)
        {
            var from = windowStart.Value.ToDateTime(TimeOnly.MinValue);
            var to = windowEnd!.Value.AddDays(1).ToDateTime(TimeOnly.MinValue);
            var daRows = await db.DaHourlyLmps.AsNoTracking()
                .Where(r => r.DatetimeBeginningEpt >= from && r.DatetimeBeginningEpt < to && nodeIds.Contains(r.PnodeId))
                .GroupBy(r => r.PnodeId)
                .Select(g => new { g.Key, Lmp = g.Average(r => r.TotalLmpDa), Congestion = g.Average(r => r.CongestionPriceDa) })
                .ToListAsync(ct);
            da = daRows.ToDictionary(r => r.Key, r => (r.Lmp, r.Congestion));
        }

        var nodeMw = rows.SelectMany(r => new[] { (Id: r.SourcePnodeId, Name: r.SourceNode, r.ClearedMw), (Id: r.SinkPnodeId, Name: r.SinkNode, r.ClearedMw) })
            .GroupBy(x => x.Id)
            .Select(g => new
            {
                pnodeId = g.Key,
                name = g.First().Name,
                totalMw = g.Sum(x => x.ClearedMw),
                nodalPrice = NodalPrice(g.Key),
                daAvgLmp = da.TryGetValue(g.Key, out var d) ? d.Lmp : (decimal?)null,
                daAvgCongestion = da.TryGetValue(g.Key, out var d2) ? d2.Congestion : (decimal?)null,
            })
            .ToList();

        var paths = rows.Select(r => new
        {
            r.SourcePnodeId,
            r.SourceNode,
            r.SinkPnodeId,
            r.SinkNode,
            r.ClearedMw,
            r.NetMw,
            r.FtrCount,
            avgMcp = r.ClearedMw == 0 ? (decimal?)null : r.McpWeighted / r.ClearedMw,
            // What the path actually paid on average in the window: sink congestion minus source congestion ($/MWh).
            daSpread = da.TryGetValue(r.SinkPnodeId, out var snk) && da.TryGetValue(r.SourcePnodeId, out var src) ? snk.Congestion - src.Congestion : (decimal?)null,
        });

        return Ok(new
        {
            auction = ToOption(auction),
            periodType,
            coversDate,
            window = windowStart is null ? null : new { start = windowStart, end = windowEnd, granularity },
            daNodes = da.Count,
            totalPaths,
            nodes = nodeMw,
            paths,
        });
    }

    private IQueryable<UploadBatch> AuctionsWithResults() =>
        db.UploadBatches.AsNoTracking().Where(b => b.DataType == UploadDataType.AuctionNodalPrices && b.Status == UploadStatus.Completed && b.FtrRowCount > 0);

    /// <summary>Monthly beats annual beats long-term for the same date; then the latest round.</summary>
    private async Task<UploadBatch?> PickAuctionAsync(DateOnly? date, CancellationToken ct)
    {
        var all = await AuctionsWithResults().ToListAsync(ct);
        var candidates = date is null ? all : all.Where(b => b.CoverageStart <= date && b.CoverageEnd >= date).ToList();
        if (date is null && candidates.Count == 0) return null;
        static int Rank(AuctionType? t) => t switch { AuctionType.Monthly => 0, AuctionType.Annual => 1, _ => 2 };
        return candidates
            .OrderBy(b => Rank(b.AuctionType))
            .ThenByDescending(b => b.CoverageStart)
            .ThenByDescending(b => b.Round)
            .ThenByDescending(b => b.UploadedAt)
            .FirstOrDefault();
    }

    private static AuctionOption ToOption(UploadBatch b) => new(
        b.Id,
        $"{(b.AuctionType == AuctionType.LongTerm ? "Long Term" : b.AuctionType.ToString())} {b.AuctionPeriod} RD {b.Round}",
        b.AuctionType?.ToString() ?? string.Empty,
        b.AuctionPeriod,
        b.Round,
        b.CoverageStart,
        b.CoverageEnd,
        b.FtrRowCount ?? 0);
}
