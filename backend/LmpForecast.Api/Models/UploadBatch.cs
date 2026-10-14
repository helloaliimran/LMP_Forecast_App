namespace LmpForecast.Api.Models;

public enum UploadDataType
{
    AuctionNodalPrices,
    DaHourlyLmp,
}

public enum AuctionType
{
    Annual,
    LongTerm,
    Monthly,
}

public enum UploadStatus
{
    Processing,
    Completed,
    Failed,
}

/// <summary>One row per uploaded file.</summary>
public class UploadBatch
{
    public long Id { get; set; }
    public UploadDataType DataType { get; set; }
    public AuctionType? AuctionType { get; set; }
    public string? AuctionPeriod { get; set; }
    public int? Round { get; set; }
    /// <summary>First and last day the auction's FTRs cover (planning years run June to May).</summary>
    public DateOnly? CoverageStart { get; set; }
    public DateOnly? CoverageEnd { get; set; }
    public string OriginalFileName { get; set; } = string.Empty;
    public string StoredFilePath { get; set; } = string.Empty;
    public string FileSha256 { get; set; } = string.Empty;
    public string? SheetName { get; set; }
    public int RowCount { get; set; }
    /// <summary>Cleared FTR rows read from the "Results" sheet (auction uploads only).</summary>
    public int? FtrRowCount { get; set; }
    public UploadStatus Status { get; set; } = UploadStatus.Processing;
    public string? ErrorMessage { get; set; }
    public string UploadedByUserId { get; set; } = string.Empty;
    public ApplicationUser? UploadedByUser { get; set; }
    public DateTimeOffset UploadedAt { get; set; } = DateTimeOffset.UtcNow;
}
