using System.Globalization;
using CsvHelper;
using CsvHelper.Configuration;
using LmpForecast.Api.Models;

namespace LmpForecast.Api.Services;

/// <summary>Reads a PJM day-ahead hourly LMP CSV (one header row, rows stored as-is).</summary>
public static class DaHourlyLmpReader
{
    private static readonly string[] RequiredColumns =
    [
        "datetime_beginning_ept", "pnode_id", "pnode_name", "type", "zone",
        "system_energy_price_da", "congestion_price_da", "marginal_loss_price_da", "total_lmp_da",
    ];

    public static IEnumerable<DaHourlyLmp> Read(Stream stream)
    {
        var config = new CsvConfiguration(CultureInfo.InvariantCulture)
        {
            PrepareHeaderForMatch = a => a.Header.Trim().ToLowerInvariant(),
            TrimOptions = TrimOptions.Trim,
        };
        using var textReader = new StreamReader(stream, leaveOpen: true);
        using var csv = new CsvReader(textReader, config);

        if (!csv.Read() || !csv.ReadHeader())
            throw new InvalidDataException("The CSV file is empty.");
        var header = csv.HeaderRecord!.Select(h => h.Trim().ToLowerInvariant()).ToHashSet();
        var missing = RequiredColumns.Where(c => !header.Contains(c)).ToList();
        if (missing.Count > 0)
            throw new InvalidDataException($"Missing columns: {string.Join(", ", missing)}.");

        while (csv.Read())
        {
            var row = csv.Parser.Row;
            yield return new DaHourlyLmp
            {
                DatetimeBeginningEpt = ParseDate(csv.GetField("datetime_beginning_ept"), row),
                PnodeId = ParseLong(csv.GetField("pnode_id"), row, "pnode_id"),
                PnodeName = csv.GetField("pnode_name") ?? string.Empty,
                Type = csv.GetField("type") ?? string.Empty,
                Zone = NullIfEmpty(csv.GetField("zone")),
                SystemEnergyPriceDa = ParseDecimal(csv.GetField("system_energy_price_da"), row, "system_energy_price_da"),
                CongestionPriceDa = ParseDecimal(csv.GetField("congestion_price_da"), row, "congestion_price_da"),
                MarginalLossPriceDa = ParseDecimal(csv.GetField("marginal_loss_price_da"), row, "marginal_loss_price_da"),
                TotalLmpDa = ParseDecimal(csv.GetField("total_lmp_da"), row, "total_lmp_da"),
            };
        }
    }

    private static string? NullIfEmpty(string? s) => string.IsNullOrWhiteSpace(s) ? null : s;

    private static DateTime ParseDate(string? s, int row)
    {
        string[] formats = ["yyyy-MM-ddTHH:mm:ss", "yyyy-MM-dd HH:mm:ss", "M/d/yyyy h:mm:ss tt", "M/d/yyyy H:mm"];
        if (DateTime.TryParseExact(s, formats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
            return DateTime.SpecifyKind(d, DateTimeKind.Unspecified);
        throw new InvalidDataException($"Row {row}: '{s}' is not a valid datetime_beginning_ept.");
    }

    private static long ParseLong(string? s, int row, string column) =>
        long.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out var v)
            ? v
            : throw new InvalidDataException($"Row {row}: '{s}' is not a valid {column}.");

    private static decimal ParseDecimal(string? s, int row, string column) =>
        decimal.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var v)
            ? v
            : throw new InvalidDataException($"Row {row}: '{s}' is not a valid {column}.");
}
