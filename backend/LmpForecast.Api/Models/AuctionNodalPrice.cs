namespace LmpForecast.Api.Models;

/// <summary>A row of the "Obligation Nodal Prices RD n" sheet, stored as-is.</summary>
public class AuctionNodalPrice
{
    public long Id { get; set; }
    public long UploadBatchId { get; set; }
    public UploadBatch? UploadBatch { get; set; }
    public string Node { get; set; } = string.Empty;
    public long PnodeId { get; set; }
    public string PeriodType { get; set; } = string.Empty;
    public decimal? Lmp24H { get; set; }
    public decimal? LmpOnPeak { get; set; }
    public decimal? LmpOffPeak { get; set; }
    public decimal? LmpWkndOnPeak { get; set; }
    public decimal? LmpDailyOffPeak { get; set; }
}
