namespace LmpForecast.Api.Models;

/// <summary>A row of the auction "Results RD n" sheet (one cleared FTR), stored as-is.</summary>
public class AuctionFtrResult
{
    public long Id { get; set; }
    public long UploadBatchId { get; set; }
    public UploadBatch? UploadBatch { get; set; }
    public long FtrId { get; set; }
    public string ClassType { get; set; } = string.Empty;
    public string PeriodType { get; set; } = string.Empty;
    public string Participant { get; set; } = string.Empty;
    public string SourceNode { get; set; } = string.Empty;
    public long SourcePnodeId { get; set; }
    public string SinkNode { get; set; } = string.Empty;
    public long SinkPnodeId { get; set; }
    public string TradeType { get; set; } = string.Empty;
    public string HedgeType { get; set; } = string.Empty;
    public decimal ClearedMw { get; set; }
    public decimal? ObligationMcp { get; set; }
    public decimal? OptionMcp { get; set; }
}

/// <summary>
/// Cleared MW per auction, class type, period type, hedge type and source → sink path.
/// Rebuilt from auction_ftr_result after each upload so the welcome screen stays fast.
/// </summary>
public class AuctionPathSummary
{
    public long Id { get; set; }
    public long UploadBatchId { get; set; }
    public UploadBatch? UploadBatch { get; set; }
    public string ClassType { get; set; } = string.Empty;
    public string PeriodType { get; set; } = string.Empty;
    public string HedgeType { get; set; } = string.Empty;
    public string SourceNode { get; set; } = string.Empty;
    public long SourcePnodeId { get; set; }
    public string SinkNode { get; set; } = string.Empty;
    public long SinkPnodeId { get; set; }
    public int FtrCount { get; set; }
    public decimal BuyMw { get; set; }
    public decimal SellMw { get; set; }
    public decimal NetMw { get; set; }
    /// <summary>MW-weighted clearing price (obligation MCP, or option MCP for options).</summary>
    public decimal? AvgMcp { get; set; }
}
