using LmpForecast.Api.Models;

namespace LmpForecast.Api.Dtos;

public record UploadBatchDto(
    long Id,
    string DataType,
    string? AuctionType,
    string? AuctionPeriod,
    int? Round,
    string OriginalFileName,
    string? SheetName,
    int RowCount,
    int? FtrRowCount,
    DateOnly? CoverageStart,
    DateOnly? CoverageEnd,
    string Status,
    string? ErrorMessage,
    string UploadedBy,
    DateTimeOffset UploadedAt)
{
    public static UploadBatchDto From(UploadBatch b, string uploadedBy) => new(
        b.Id, b.DataType.ToString(), b.AuctionType?.ToString(), b.AuctionPeriod, b.Round,
        b.OriginalFileName, b.SheetName, b.RowCount, b.FtrRowCount, b.CoverageStart, b.CoverageEnd, b.Status.ToString(), b.ErrorMessage, uploadedBy, b.UploadedAt);
}
