using System.Security.Cryptography;
using LmpForecast.Api.Data;
using LmpForecast.Api.Models;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;

namespace LmpForecast.Api.Services;

public class UploadOptions
{
    public string StoragePath { get; set; } = "App_Data/uploads";
    public long MaxFileSizeBytes { get; set; } = 100 * 1024 * 1024;
}

public class DuplicateUploadException(UploadBatch existing) : Exception("This file has already been uploaded.")
{
    public UploadBatch Existing { get; } = existing;
}

public record AuctionUploadRequest(AuctionType AuctionType, string AuctionPeriod, int Round);

/// <summary>
/// Saves the original file, then bulk-loads its rows with PostgreSQL COPY.
/// Each upload is one upload_batch row; the data rows point back to it.
/// </summary>
public class UploadService(AppDbContext db, Microsoft.Extensions.Options.IOptions<UploadOptions> options, IWebHostEnvironment env, ILogger<UploadService> logger)
{
    private readonly UploadOptions _options = options.Value;

    public async Task<UploadBatch> UploadAuctionAsync(IFormFile file, AuctionUploadRequest request, string userId, CancellationToken ct)
    {
        var (path, hash) = await SaveFileAsync(file, ct);
        var batch = await CreateBatchAsync(UploadDataType.AuctionNodalPrices, file.FileName, path, hash, userId, ct);
        batch.AuctionType = request.AuctionType;
        batch.AuctionPeriod = request.AuctionPeriod.Trim();
        batch.Round = request.Round;
        var coverage = AuctionCoverage.For(request.AuctionType, batch.AuctionPeriod);
        batch.CoverageStart = coverage?.Start;
        batch.CoverageEnd = coverage?.End;

        return await LoadAsync(batch, async conn =>
        {
            await using var stream = File.OpenRead(path);
            var sheet = AuctionNodalPriceReader.FindSheetName(stream)
                ?? throw new InvalidDataException($"No sheet starting with '{AuctionNodalPriceReader.SheetPrefix}' was found in this workbook.");
            batch.SheetName = sheet;
            stream.Position = 0;

            await using var writer = await conn.BeginBinaryImportAsync(
                "COPY auction_nodal_price (upload_batch_id, node, pnode_id, period_type, lmp_24h, lmp_on_peak, lmp_off_peak, lmp_wknd_on_peak, lmp_daily_off_peak) FROM STDIN (FORMAT BINARY)", ct);
            var count = 0;
            foreach (var row in AuctionNodalPriceReader.Read(stream, sheet))
            {
                await writer.StartRowAsync(ct);
                await writer.WriteAsync(batch.Id, NpgsqlDbType.Bigint, ct);
                await writer.WriteAsync(row.Node, NpgsqlDbType.Text, ct);
                await writer.WriteAsync(row.PnodeId, NpgsqlDbType.Bigint, ct);
                await writer.WriteAsync(row.PeriodType, NpgsqlDbType.Text, ct);
                await WriteNullable(writer, row.Lmp24H, ct);
                await WriteNullable(writer, row.LmpOnPeak, ct);
                await WriteNullable(writer, row.LmpOffPeak, ct);
                await WriteNullable(writer, row.LmpWkndOnPeak, ct);
                await WriteNullable(writer, row.LmpDailyOffPeak, ct);
                count++;
            }
            await writer.CompleteAsync(ct);
            await writer.DisposeAsync();

            batch.FtrRowCount = await ImportFtrResultsAsync(conn, batch, path, ct);
            return count;
        }, ct);
    }

    /// <summary>
    /// Reads auction results into auction_ftr_result for an auction uploaded before that table existed.
    /// The original file is read again from disk; nodal prices are left untouched.
    /// </summary>
    public async Task BackfillFtrResultsAsync(UploadBatch batch, CancellationToken ct)
    {
        var coverage = AuctionCoverage.For(batch.AuctionType, batch.AuctionPeriod);
        batch.CoverageStart = coverage?.Start;
        batch.CoverageEnd = coverage?.End;

        var conn = (NpgsqlConnection)db.Database.GetDbConnection();
        await db.Database.OpenConnectionAsync(ct);
        try
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await db.Database.ExecuteSqlAsync($"DELETE FROM auction_ftr_result WHERE upload_batch_id = {batch.Id}", ct);
            await db.Database.ExecuteSqlAsync($"DELETE FROM auction_path_summary WHERE upload_batch_id = {batch.Id}", ct);
            batch.FtrRowCount = File.Exists(batch.StoredFilePath) ? await ImportFtrResultsAsync(conn, batch, batch.StoredFilePath, ct) : 0;
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        finally
        {
            await db.Database.CloseConnectionAsync();
        }
    }

    /// <summary>Copies the "Results" sheet into auction_ftr_result and rebuilds the path summary. Returns 0 when the workbook has no results sheet.</summary>
    private static async Task<int> ImportFtrResultsAsync(NpgsqlConnection conn, UploadBatch batch, string path, CancellationToken ct)
    {
        await using var stream = File.OpenRead(path);
        var sheet = AuctionFtrResultReader.FindSheetName(stream);
        if (sheet is null) return 0;
        stream.Position = 0;

        var count = 0;
        await using (var writer = await conn.BeginBinaryImportAsync(
            "COPY auction_ftr_result (upload_batch_id, ftr_id, class_type, period_type, participant, source_node, source_pnode_id, sink_node, sink_pnode_id, trade_type, hedge_type, cleared_mw, obligation_mcp, option_mcp) FROM STDIN (FORMAT BINARY)", ct))
        {
            foreach (var row in AuctionFtrResultReader.Read(stream, sheet))
            {
                await writer.StartRowAsync(ct);
                await writer.WriteAsync(batch.Id, NpgsqlDbType.Bigint, ct);
                await writer.WriteAsync(row.FtrId, NpgsqlDbType.Bigint, ct);
                await writer.WriteAsync(row.ClassType, NpgsqlDbType.Text, ct);
                await writer.WriteAsync(row.PeriodType, NpgsqlDbType.Text, ct);
                await writer.WriteAsync(row.Participant, NpgsqlDbType.Text, ct);
                await writer.WriteAsync(row.SourceNode, NpgsqlDbType.Text, ct);
                await writer.WriteAsync(row.SourcePnodeId, NpgsqlDbType.Bigint, ct);
                await writer.WriteAsync(row.SinkNode, NpgsqlDbType.Text, ct);
                await writer.WriteAsync(row.SinkPnodeId, NpgsqlDbType.Bigint, ct);
                await writer.WriteAsync(row.TradeType, NpgsqlDbType.Text, ct);
                await writer.WriteAsync(row.HedgeType, NpgsqlDbType.Text, ct);
                await writer.WriteAsync(row.ClearedMw, NpgsqlDbType.Numeric, ct);
                await WriteNullable(writer, row.ObligationMcp, ct);
                await WriteNullable(writer, row.OptionMcp, ct);
                count++;
            }
            await writer.CompleteAsync(ct);
        }

        await using var summary = new NpgsqlCommand(
            """
            INSERT INTO auction_path_summary
                (upload_batch_id, class_type, period_type, hedge_type, source_node, source_pnode_id, sink_node, sink_pnode_id,
                 ftr_count, buy_mw, sell_mw, net_mw, avg_mcp)
            SELECT upload_batch_id, class_type, period_type, hedge_type,
                   min(source_node), source_pnode_id, min(sink_node), sink_pnode_id,
                   count(*),
                   sum(CASE WHEN trade_type = 'Sell' THEN 0 ELSE cleared_mw END),
                   sum(CASE WHEN trade_type = 'Sell' THEN cleared_mw ELSE 0 END),
                   sum(CASE WHEN trade_type = 'Sell' THEN -cleared_mw ELSE cleared_mw END),
                   sum(cleared_mw * CASE WHEN hedge_type = 'Option' THEN option_mcp ELSE obligation_mcp END)
                       / nullif(sum(CASE WHEN (CASE WHEN hedge_type = 'Option' THEN option_mcp ELSE obligation_mcp END) IS NULL THEN 0 ELSE cleared_mw END), 0)
            FROM auction_ftr_result
            WHERE upload_batch_id = @id
            GROUP BY upload_batch_id, class_type, period_type, hedge_type, source_pnode_id, sink_pnode_id
            """, conn);
        summary.Parameters.AddWithValue("id", batch.Id);
        summary.CommandTimeout = 300;
        await summary.ExecuteNonQueryAsync(ct);

        return count;
    }

    public async Task<UploadBatch> UploadDaLmpAsync(IFormFile file, string userId, CancellationToken ct)
    {
        var (path, hash) = await SaveFileAsync(file, ct);
        var batch = await CreateBatchAsync(UploadDataType.DaHourlyLmp, file.FileName, path, hash, userId, ct);

        return await LoadAsync(batch, async conn =>
        {
            await using var stream = File.OpenRead(path);
            await using var writer = await conn.BeginBinaryImportAsync(
                "COPY da_hourly_lmp (upload_batch_id, datetime_beginning_ept, pnode_id, pnode_name, type, zone, system_energy_price_da, congestion_price_da, marginal_loss_price_da, total_lmp_da) FROM STDIN (FORMAT BINARY)", ct);
            var count = 0;
            foreach (var row in DaHourlyLmpReader.Read(stream))
            {
                await writer.StartRowAsync(ct);
                await writer.WriteAsync(batch.Id, NpgsqlDbType.Bigint, ct);
                await writer.WriteAsync(row.DatetimeBeginningEpt, NpgsqlDbType.Timestamp, ct);
                await writer.WriteAsync(row.PnodeId, NpgsqlDbType.Bigint, ct);
                await writer.WriteAsync(row.PnodeName, NpgsqlDbType.Text, ct);
                await writer.WriteAsync(row.Type, NpgsqlDbType.Text, ct);
                if (row.Zone is null) await writer.WriteNullAsync(ct);
                else await writer.WriteAsync(row.Zone, NpgsqlDbType.Text, ct);
                await writer.WriteAsync(row.SystemEnergyPriceDa, NpgsqlDbType.Numeric, ct);
                await writer.WriteAsync(row.CongestionPriceDa, NpgsqlDbType.Numeric, ct);
                await writer.WriteAsync(row.MarginalLossPriceDa, NpgsqlDbType.Numeric, ct);
                await writer.WriteAsync(row.TotalLmpDa, NpgsqlDbType.Numeric, ct);
                count++;
            }
            await writer.CompleteAsync(ct);
            return count;
        }, ct);
    }

    public async Task DeleteAsync(UploadBatch batch, CancellationToken ct)
    {
        db.UploadBatches.Remove(batch);
        await db.SaveChangesAsync(ct);
        if (File.Exists(batch.StoredFilePath))
            File.Delete(batch.StoredFilePath);
    }

    private static Task WriteNullable(NpgsqlBinaryImporter writer, decimal? value, CancellationToken ct) =>
        value is null ? writer.WriteNullAsync(ct) : writer.WriteAsync(value.Value, NpgsqlDbType.Numeric, ct);

    private async Task<(string Path, string Hash)> SaveFileAsync(IFormFile file, CancellationToken ct)
    {
        if (file.Length == 0)
            throw new InvalidDataException("The file is empty.");
        if (file.Length > _options.MaxFileSizeBytes)
            throw new InvalidDataException($"The file is larger than {_options.MaxFileSizeBytes / 1024 / 1024} MB.");

        var folder = Path.IsPathRooted(_options.StoragePath)
            ? _options.StoragePath
            : Path.Combine(env.ContentRootPath, _options.StoragePath);
        Directory.CreateDirectory(folder);

        var safeName = string.Concat(Path.GetFileName(file.FileName).Select(c => Path.GetInvalidFileNameChars().Contains(c) ? '_' : c));
        var path = Path.Combine(folder, $"{DateTime.UtcNow:yyyyMMdd_HHmmss}_{Guid.NewGuid():N}_{safeName}");

        await using (var target = File.Create(path))
            await file.CopyToAsync(target, ct);

        string hash;
        await using (var read = File.OpenRead(path))
            hash = Convert.ToHexStringLower(await SHA256.HashDataAsync(read, ct));

        var existing = await db.UploadBatches.AsNoTracking().FirstOrDefaultAsync(b => b.FileSha256 == hash, ct);
        if (existing is not null)
        {
            if (existing.Status != UploadStatus.Failed)
            {
                File.Delete(path);
                throw new DuplicateUploadException(existing);
            }
            // A failed earlier attempt of the same file is replaced by this one.
            await DeleteAsync(existing, ct);
        }

        return (path, hash);
    }

    private async Task<UploadBatch> CreateBatchAsync(UploadDataType type, string fileName, string path, string hash, string userId, CancellationToken ct)
    {
        var batch = new UploadBatch
        {
            DataType = type,
            OriginalFileName = Path.GetFileName(fileName),
            StoredFilePath = path,
            FileSha256 = hash,
            UploadedByUserId = userId,
            Status = UploadStatus.Processing,
        };
        db.UploadBatches.Add(batch);
        await db.SaveChangesAsync(ct);
        return batch;
    }

    private async Task<UploadBatch> LoadAsync(UploadBatch batch, Func<NpgsqlConnection, Task<int>> copy, CancellationToken ct)
    {
        var conn = (NpgsqlConnection)db.Database.GetDbConnection();
        await db.Database.OpenConnectionAsync(ct);
        try
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            batch.RowCount = await copy(conn);
            batch.Status = UploadStatus.Completed;
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Upload {BatchId} ({File}) failed", batch.Id, batch.OriginalFileName);
            db.ChangeTracker.Clear();
            batch.Status = UploadStatus.Failed;
            batch.RowCount = 0;
            batch.ErrorMessage = ex is InvalidDataException or PostgresException ? ex.Message : "Unexpected error while reading the file.";
            db.UploadBatches.Update(batch);
            await db.SaveChangesAsync(CancellationToken.None);
        }
        finally
        {
            await db.Database.CloseConnectionAsync();
        }
        return batch;
    }
}
