using LmpForecast.Api.Data;
using LmpForecast.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LmpForecast.Api.Controllers;

[ApiController]
[Route("api/dashboard")]
[Authorize]
public class DashboardController(AppDbContext db) : ControllerBase
{
    [HttpGet("summary")]
    public async Task<object> Summary(CancellationToken ct) => new
    {
        users = await db.Users.CountAsync(ct),
        auctionUploads = await db.UploadBatches.CountAsync(b => b.DataType == UploadDataType.AuctionNodalPrices && b.Status == UploadStatus.Completed, ct),
        daLmpUploads = await db.UploadBatches.CountAsync(b => b.DataType == UploadDataType.DaHourlyLmp && b.Status == UploadStatus.Completed, ct),
        auctionRows = await db.AuctionNodalPrices.LongCountAsync(ct),
        ftrRows = await db.AuctionFtrResults.LongCountAsync(ct),
        daLmpRows = await db.DaHourlyLmps.LongCountAsync(ct),
        latestDaLmpHour = await db.DaHourlyLmps.MaxAsync(r => (DateTime?)r.DatetimeBeginningEpt, ct),
    };

    /// <summary>
    /// Hubs and zones with their average day-ahead LMP and congestion for the latest
    /// uploaded day; drives the node network on the welcome screen. Empty until DA LMP is uploaded.
    /// </summary>
    [HttpGet("network")]
    public async Task<object> Network(CancellationToken ct)
    {
        var latest = await db.DaHourlyLmps.MaxAsync(r => (DateTime?)r.DatetimeBeginningEpt, ct);
        if (latest is null)
            return new { day = (DateTime?)null, nodes = Array.Empty<object>() };

        var day = latest.Value.Date;
        var nodes = await db.DaHourlyLmps.AsNoTracking()
            .Where(r => r.DatetimeBeginningEpt >= day && r.DatetimeBeginningEpt < day.AddDays(1))
            .GroupBy(r => new { r.PnodeId, r.PnodeName, r.Type, r.Zone })
            .Select(g => new
            {
                id = g.Key.PnodeId,
                name = g.Key.PnodeName,
                type = g.Key.Type,
                zone = g.Key.Zone,
                avgLmp = g.Average(r => r.TotalLmpDa),
                avgCongestion = g.Average(r => r.CongestionPriceDa),
                hourly = g.OrderBy(r => r.DatetimeBeginningEpt).Select(r => r.TotalLmpDa).ToList(),
            })
            .ToListAsync(ct);
        return new { day, nodes };
    }
}
