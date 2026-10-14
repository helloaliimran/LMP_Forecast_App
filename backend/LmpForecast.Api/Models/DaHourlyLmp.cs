namespace LmpForecast.Api.Models;

/// <summary>A row of a day-ahead hourly LMP CSV, stored as-is.</summary>
public class DaHourlyLmp
{
    public long Id { get; set; }
    public long UploadBatchId { get; set; }
    public UploadBatch? UploadBatch { get; set; }
    public DateTime DatetimeBeginningEpt { get; set; }
    public long PnodeId { get; set; }
    public string PnodeName { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string? Zone { get; set; }
    public decimal SystemEnergyPriceDa { get; set; }
    public decimal CongestionPriceDa { get; set; }
    public decimal MarginalLossPriceDa { get; set; }
    public decimal TotalLmpDa { get; set; }
}
