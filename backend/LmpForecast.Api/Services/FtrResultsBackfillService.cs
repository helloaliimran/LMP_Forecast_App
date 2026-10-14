using LmpForecast.Api.Data;
using LmpForecast.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace LmpForecast.Api.Services;

/// <summary>
/// On startup, reads the "Results" sheet for auction uploads made before
/// auction_ftr_result existed, using the original file kept on disk.
/// </summary>
public class FtrResultsBackfillService(IServiceScopeFactory scopes, ILogger<FtrResultsBackfillService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var uploads = scope.ServiceProvider.GetRequiredService<UploadService>();

        List<UploadBatch> pending;
        try
        {
            pending = await db.UploadBatches
                .Where(b => b.DataType == UploadDataType.AuctionNodalPrices && b.Status == UploadStatus.Completed && b.FtrRowCount == null)
                .OrderBy(b => b.Id)
                .ToListAsync(stoppingToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Could not check for auction uploads to backfill");
            return;
        }

        foreach (var batch in pending)
        {
            try
            {
                await uploads.BackfillFtrResultsAsync(batch, stoppingToken);
                logger.LogInformation("Backfilled {Rows} FTR results for upload {Id} ({File})", batch.FtrRowCount, batch.Id, batch.OriginalFileName);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Could not backfill FTR results for upload {Id} ({File})", batch.Id, batch.OriginalFileName);
                db.ChangeTracker.Clear();
            }
        }
    }
}
