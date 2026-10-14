using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using LmpForecast.Api.Data;
using LmpForecast.Api.Dtos;
using LmpForecast.Api.Models;
using LmpForecast.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LmpForecast.Api.Controllers;

[ApiController]
[Route("api/uploads")]
[Authorize(Roles = Roles.Uploaders)]
public class UploadsController(AppDbContext db, UploadService uploads) : ControllerBase
{
    public class AuctionUploadForm
    {
        [Required] public IFormFile File { get; set; } = null!;
        [Required] public AuctionType? AuctionType { get; set; }
        [Required, MaxLength(32)] public string AuctionPeriod { get; set; } = string.Empty;
        [Range(1, 20)] public int Round { get; set; }
    }

    public class FileUploadForm
    {
        [Required] public IFormFile File { get; set; } = null!;
    }

    [HttpPost("auction")]
    [RequestSizeLimit(200 * 1024 * 1024)]
    public async Task<ActionResult<UploadBatchDto>> UploadAuction([FromForm] AuctionUploadForm form, CancellationToken ct)
    {
        if (!Path.GetExtension(form.File.FileName).Equals(".xlsx", StringComparison.OrdinalIgnoreCase)
            && !Path.GetExtension(form.File.FileName).Equals(".xls", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { message = "Auction results must be an Excel file (.xlsx or .xls)." });

        return await Run(() => uploads.UploadAuctionAsync(form.File, new AuctionUploadRequest(form.AuctionType!.Value, form.AuctionPeriod, form.Round), UserId, ct));
    }

    [HttpPost("da-lmp")]
    [RequestSizeLimit(200 * 1024 * 1024)]
    public async Task<ActionResult<UploadBatchDto>> UploadDaLmp([FromForm] FileUploadForm form, CancellationToken ct)
    {
        if (!Path.GetExtension(form.File.FileName).Equals(".csv", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { message = "Day-ahead LMP data must be a .csv file." });

        return await Run(() => uploads.UploadDaLmpAsync(form.File, UserId, ct));
    }

    [HttpGet]
    public async Task<IEnumerable<UploadBatchDto>> List([FromQuery] UploadDataType? dataType, CancellationToken ct)
    {
        var query = db.UploadBatches.AsNoTracking().Include(b => b.UploadedByUser).AsQueryable();
        if (dataType is not null)
            query = query.Where(b => b.DataType == dataType);
        var batches = await query.OrderByDescending(b => b.UploadedAt).Take(500).ToListAsync(ct);
        return batches.Select(b => UploadBatchDto.From(b, b.UploadedByUser?.FullName ?? "?"));
    }

    /// <summary>First rows of an upload, exactly as stored, for a quick look.</summary>
    [HttpGet("{id:long}/rows")]
    public async Task<ActionResult<object>> Rows(long id, [FromQuery] int skip = 0, [FromQuery] int take = 100, CancellationToken ct = default)
    {
        take = Math.Clamp(take, 1, 1000);
        var batch = await db.UploadBatches.AsNoTracking().FirstOrDefaultAsync(b => b.Id == id, ct);
        if (batch is null) return NotFound();

        if (batch.DataType == UploadDataType.AuctionNodalPrices)
        {
            var rows = await db.AuctionNodalPrices.AsNoTracking().Where(r => r.UploadBatchId == id).OrderBy(r => r.Id).Skip(skip).Take(take)
                .Select(r => new { r.Node, r.PnodeId, r.PeriodType, r.Lmp24H, r.LmpOnPeak, r.LmpOffPeak, r.LmpWkndOnPeak, r.LmpDailyOffPeak })
                .ToListAsync(ct);
            return new { total = batch.RowCount, rows };
        }
        else
        {
            var rows = await db.DaHourlyLmps.AsNoTracking().Where(r => r.UploadBatchId == id).OrderBy(r => r.Id).Skip(skip).Take(take)
                .Select(r => new { r.DatetimeBeginningEpt, r.PnodeId, r.PnodeName, r.Type, r.Zone, r.SystemEnergyPriceDa, r.CongestionPriceDa, r.MarginalLossPriceDa, r.TotalLmpDa })
                .ToListAsync(ct);
            return new { total = batch.RowCount, rows };
        }
    }

    [HttpDelete("{id:long}")]
    public async Task<IActionResult> Delete(long id, CancellationToken ct)
    {
        var batch = await db.UploadBatches.FirstOrDefaultAsync(b => b.Id == id, ct);
        if (batch is null) return NotFound();
        await uploads.DeleteAsync(batch, ct);
        return NoContent();
    }

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

    private async Task<ActionResult<UploadBatchDto>> Run(Func<Task<UploadBatch>> upload)
    {
        try
        {
            var batch = await upload();
            var dto = UploadBatchDto.From(batch, User.FindFirstValue(ClaimTypes.Name) ?? "?");
            return batch.Status == UploadStatus.Failed ? UnprocessableEntity(dto) : Ok(dto);
        }
        catch (DuplicateUploadException ex)
        {
            return Conflict(new { message = $"This file was already uploaded as '{ex.Existing.OriginalFileName}' on {ex.Existing.UploadedAt:yyyy-MM-dd HH:mm} UTC." });
        }
        catch (InvalidDataException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }
}
