using System.Globalization;
using ClosedXML.Excel;
using LmpForecast.Api.Data;
using LmpForecast.Api.Models;
using LmpForecast.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LmpForecast.Api.Controllers;

/// <summary>Annual auction price versus actual day-ahead congestion.</summary>
[ApiController]
[Route("api/analysis/annual")]
[Authorize]
public class AnalysisController(AppDbContext db, AnnualAnalysisService analysis) : ControllerBase
{
    private const int MaxPathRows = 5000;

    [HttpGet("options")]
    public async Task<object> Options(CancellationToken ct)
    {
        var auctions = await db.UploadBatches.AsNoTracking()
            .Where(b => b.DataType == UploadDataType.AuctionNodalPrices && b.Status == UploadStatus.Completed && b.AuctionType == AuctionType.Annual)
            .OrderByDescending(b => b.CoverageStart).ThenByDescending(b => b.Round)
            .Select(b => new { b.Id, label = "Annual " + b.AuctionPeriod + " RD " + b.Round, b.AuctionPeriod, b.Round, b.CoverageStart, b.CoverageEnd })
            .ToListAsync(ct);
        var first = await db.DaHourlyLmps.MinAsync(r => (DateTime?)r.DatetimeBeginningEpt, ct);
        var last = await db.DaHourlyLmps.MaxAsync(r => (DateTime?)r.DatetimeBeginningEpt, ct);
        return new
        {
            auctions,
            rounds = auctions.Select(a => a.Round).Distinct().OrderBy(r => r),
            daFirstMonth = first?.ToString("yyyy-MM"),
            daLastMonth = last?.ToString("yyyy-MM"),
        };
    }

    /// <param name="from">First month, yyyy-MM.</param>
    /// <param name="to">Last month (inclusive), yyyy-MM.</param>
    /// <param name="classes">Comma-separated: 24H, OnPeak, WkndOnPeak, DailyOffPeak.</param>
    [HttpGet]
    public async Task<ActionResult<object>> Run([FromQuery] string from, [FromQuery] string to, [FromQuery] string? classes, [FromQuery] int? round,
        [FromQuery] long? sourcePnodeId, [FromQuery] long? sinkPnodeId, CancellationToken ct)
    {
        if (!TryBuild(from, to, classes, round, sourcePnodeId, sinkPnodeId, out var req, out var error))
            return BadRequest(new { message = error });

        var result = await analysis.RunAsync(req, ct);
        var p = result.Paths;
        return Ok(new
        {
            result.Segments,
            summary = new
            {
                pathCount = p.Count,
                totalAuction = p.Sum(x => x.AuctionPrice),
                totalActual = p.Sum(x => x.ActualPrice),
                totalError = p.Sum(x => x.Error),
                meanAbsError = p.Count == 0 ? 0 : Math.Round(p.Average(x => Math.Abs(x.Error)), 2),
                // Share of paths where the auction got the direction (sign) of congestion right.
                directionHitRate = p.Count == 0 ? 0 : Math.Round(100m * p.Count(x => Math.Sign(x.AuctionPrice) == Math.Sign(x.ActualPrice)) / p.Count, 1),
                truncated = p.Count > MaxPathRows,
            },
            paths = p.Take(MaxPathRows),
            result.Nodes,
            result.SeriesLabel,
            result.Series,
        });
    }

    [HttpGet("export")]
    public async Task<IActionResult> Export([FromQuery] string from, [FromQuery] string to, [FromQuery] string? classes, [FromQuery] int? round,
        [FromQuery] long? sourcePnodeId, [FromQuery] long? sinkPnodeId, CancellationToken ct)
    {
        if (!TryBuild(from, to, classes, round, sourcePnodeId, sinkPnodeId, out var req, out var error))
            return BadRequest(new { message = error });

        var result = await analysis.RunAsync(req, ct);
        using var wb = new XLWorkbook();

        var ws = wb.AddWorksheet("Paths");
        string[] headers = ["Date from", "Date to", "Auction", "Source", "Source PNODEID", "Sink", "Sink PNODEID", "Class type", "Hours", "Cleared MW", "Auction price ($/MW)", "Actual price ($/MW)", "Error (Actual − Auction)", "Error %"];
        for (var i = 0; i < headers.Length; i++) ws.Cell(1, i + 1).Value = headers[i];
        var row = 2;
        foreach (var p in result.Paths)
        {
            ws.Cell(row, 1).Value = p.From.ToDateTime(TimeOnly.MinValue);
            ws.Cell(row, 2).Value = p.To.ToDateTime(TimeOnly.MinValue);
            ws.Cell(row, 3).Value = p.Auction;
            ws.Cell(row, 4).Value = p.SourceNode;
            ws.Cell(row, 5).Value = p.SourcePnodeId;
            ws.Cell(row, 6).Value = p.SinkNode;
            ws.Cell(row, 7).Value = p.SinkPnodeId;
            ws.Cell(row, 8).Value = p.ClassType;
            ws.Cell(row, 9).Value = p.Hours;
            ws.Cell(row, 10).Value = p.ClearedMw;
            ws.Cell(row, 11).Value = p.AuctionPrice;
            ws.Cell(row, 12).Value = p.ActualPrice;
            ws.Cell(row, 13).Value = p.Error;
            if (p.AuctionPrice != 0) ws.Cell(row, 14).Value = p.Error / Math.Abs(p.AuctionPrice);
            row++;
        }
        StyleTable(ws, headers.Length, row - 1, dateCols: [1, 2], moneyCols: [11, 12, 13], percentCol: 14);

        var wn = wb.AddWorksheet("Nodes");
        string[] nodeHeaders = ["Node", "PNODEID", "Class type", "Hours", "Auction price ($/MW)", "Actual price ($/MW)", "Error (Actual − Auction)"];
        for (var i = 0; i < nodeHeaders.Length; i++) wn.Cell(1, i + 1).Value = nodeHeaders[i];
        row = 2;
        foreach (var n in result.Nodes)
        {
            wn.Cell(row, 1).Value = n.Name;
            wn.Cell(row, 2).Value = n.PnodeId;
            wn.Cell(row, 3).Value = n.ClassType;
            wn.Cell(row, 4).Value = n.Hours;
            wn.Cell(row, 5).Value = n.AuctionPrice;
            wn.Cell(row, 6).Value = n.ActualPrice;
            wn.Cell(row, 7).Value = n.Error;
            row++;
        }
        StyleTable(wn, nodeHeaders.Length, row - 1, dateCols: [], moneyCols: [5, 6, 7], percentCol: null);

        var wsum = wb.AddWorksheet("Summary");
        wsum.Cell(1, 1).Value = "Annual auction price vs actual DA congestion";
        wsum.Cell(1, 1).Style.Font.Bold = true;
        wsum.Cell(2, 1).Value = $"Range {req.From:yyyy-MM-dd} to {req.To:yyyy-MM-dd}; classes {string.Join(", ", req.Classes)}";
        wsum.Cell(3, 1).Value = "Auction price = (sink − source nodal price) × class hours with DA data ÷ class hours in the planning year. Actual = Σ hourly (sink − source) DA congestion.";
        string[] segHeaders = ["Planning year", "From", "To", "Auction", "DA hours", "Calendar hours"];
        for (var i = 0; i < segHeaders.Length; i++) wsum.Cell(5, i + 1).Value = segHeaders[i];
        row = 6;
        foreach (var s in result.Segments)
        {
            wsum.Cell(row, 1).Value = s.PlanningYear;
            wsum.Cell(row, 2).Value = s.From.ToDateTime(TimeOnly.MinValue);
            wsum.Cell(row, 3).Value = s.To.ToDateTime(TimeOnly.MinValue);
            wsum.Cell(row, 4).Value = s.AuctionLabel ?? "No annual auction uploaded";
            wsum.Cell(row, 5).Value = s.DaHours;
            wsum.Cell(row, 6).Value = s.CalendarHours;
            row++;
        }
        wsum.Range(5, 1, 5, segHeaders.Length).Style.Font.Bold = true;
        wsum.Columns(2, 3).Style.DateFormat.Format = "yyyy-mm-dd";
        wsum.Columns().AdjustToContents(5, row);

        await using var ms = new MemoryStream();
        wb.SaveAs(ms);
        var name = $"annual_analysis_{req.From:yyyyMM}_{req.To:yyyyMM}.xlsx";
        return File(ms.ToArray(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", name);
    }

    private static void StyleTable(IXLWorksheet ws, int cols, int lastRow, int[] dateCols, int[] moneyCols, int? percentCol)
    {
        if (lastRow >= 2)
        {
            var table = ws.Range(1, 1, lastRow, cols).CreateTable();
            table.Theme = XLTableTheme.TableStyleMedium2;
        }
        else
        {
            ws.Range(1, 1, 1, cols).Style.Font.Bold = true;
        }
        foreach (var c in dateCols) ws.Column(c).Style.DateFormat.Format = "yyyy-mm-dd";
        foreach (var c in moneyCols) ws.Column(c).Style.NumberFormat.Format = "#,##0.00;[Red]-#,##0.00";
        if (percentCol is not null) ws.Column(percentCol.Value).Style.NumberFormat.Format = "0.0%";
        ws.SheetView.FreezeRows(1);
        ws.Columns(1, cols).AdjustToContents(1, Math.Min(lastRow, 500));
    }

    private static bool TryBuild(string from, string to, string? classes, int? round, long? src, long? snk, out AnalysisRequest req, out string error)
    {
        req = null!;
        error = string.Empty;
        if (!DateOnly.TryParseExact(from + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var f) ||
            !DateOnly.TryParseExact(to + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var t))
        {
            error = "from and to must be months, yyyy-MM.";
            return false;
        }
        if (t < f)
        {
            error = "The end month is before the start month.";
            return false;
        }
        if (t.DayNumber - f.DayNumber > 366 * 5)
        {
            error = "Choose a range of five years or less.";
            return false;
        }
        var list = (classes ?? PjmCalendar.AllHours).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Distinct().ToList();
        var allowed = PjmCalendar.BaseClasses.Append(PjmCalendar.AllHours).ToHashSet();
        if (list.Any(c => !allowed.Contains(c)))
        {
            error = "classes must be 24H, OnPeak, WkndOnPeak or DailyOffPeak.";
            return false;
        }
        req = new AnalysisRequest(f, t.AddMonths(1).AddDays(-1), list, round, src, snk);
        return true;
    }
}
