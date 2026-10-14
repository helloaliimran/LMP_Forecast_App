using System.Globalization;
using ExcelDataReader;
using LmpForecast.Api.Models;

namespace LmpForecast.Api.Services;

/// <summary>
/// Reads the "Obligation Nodal Prices RD n" sheet. The sheet has two header rows
/// (row 1: Node, PNODEID, Period Type, LMP, LMP...; row 2: 24H, On Peak, ...),
/// which are merged here into one set of columns.
/// </summary>
public static class AuctionNodalPriceReader
{
    public const string SheetPrefix = "Obligation Nodal Prices";

    public static string? FindSheetName(Stream stream)
    {
        using var reader = ExcelReaderFactory.CreateReader(stream, new ExcelReaderConfiguration { LeaveOpen = true });
        do
        {
            if (reader.Name.StartsWith(SheetPrefix, StringComparison.OrdinalIgnoreCase))
                return reader.Name;
        } while (reader.NextResult());
        return null;
    }

    public static IEnumerable<AuctionNodalPrice> Read(Stream stream, string sheetName)
    {
        using var reader = ExcelReaderFactory.CreateReader(stream, new ExcelReaderConfiguration { LeaveOpen = true });
        while (reader.Name != sheetName)
        {
            if (!reader.NextResult())
                throw new InvalidDataException($"Sheet '{sheetName}' not found.");
        }

        if (!reader.Read())
            throw new InvalidDataException("The sheet is empty.");
        var top = ReadRow(reader);
        if (!reader.Read())
            throw new InvalidDataException("The sheet has no second header row.");
        var sub = ReadRow(reader);

        int Col(string topName)
        {
            var i = Array.FindIndex(top, h => string.Equals(h, topName, StringComparison.OrdinalIgnoreCase));
            if (i < 0) throw new InvalidDataException($"Column '{topName}' not found in the header.");
            return i;
        }
        int? LmpCol(string subName)
        {
            var i = Array.FindIndex(sub, h => string.Equals(h, subName, StringComparison.OrdinalIgnoreCase));
            return i < 0 ? null : i;
        }

        var node = Col("Node");
        var pnode = Col("PNODEID");
        var period = Col("Period Type");
        var lmp24 = LmpCol("24H") ?? throw new InvalidDataException("Column 'LMP 24H' not found in the header.");
        var onPeak = LmpCol("On Peak");
        var offPeak = LmpCol("Off Peak");
        var wkndOnPeak = LmpCol("Wknd On Peak");
        var dailyOffPeak = LmpCol("Daily Off Peak");

        var rowNumber = 2;
        while (reader.Read())
        {
            rowNumber++;
            var nodeName = reader.GetValue(node)?.ToString()?.Trim();
            if (string.IsNullOrEmpty(nodeName))
                continue;

            yield return new AuctionNodalPrice
            {
                Node = nodeName,
                PnodeId = ToLong(reader.GetValue(pnode), rowNumber, "PNODEID"),
                PeriodType = reader.GetValue(period)?.ToString()?.Trim() ?? string.Empty,
                Lmp24H = ToDecimal(reader, lmp24),
                LmpOnPeak = ToDecimal(reader, onPeak),
                LmpOffPeak = ToDecimal(reader, offPeak),
                LmpWkndOnPeak = ToDecimal(reader, wkndOnPeak),
                LmpDailyOffPeak = ToDecimal(reader, dailyOffPeak),
            };
        }
    }

    private static string?[] ReadRow(IExcelDataReader reader) =>
        Enumerable.Range(0, reader.FieldCount).Select(i => reader.GetValue(i)?.ToString()?.Trim()).ToArray();

    private static long ToLong(object? value, int row, string column) => value switch
    {
        double d => (long)d,
        string s when long.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out var l) => l,
        _ => throw new InvalidDataException($"Row {row}: '{value}' is not a valid {column}."),
    };

    private static decimal? ToDecimal(IExcelDataReader reader, int? column)
    {
        if (column is null) return null;
        return reader.GetValue(column.Value) switch
        {
            null => null,
            double d => Math.Round((decimal)d, 6),
            string s when decimal.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var m) => m,
            _ => null,
        };
    }
}
