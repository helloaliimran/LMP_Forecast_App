using System.Globalization;
using ExcelDataReader;
using LmpForecast.Api.Models;

namespace LmpForecast.Api.Services;

/// <summary>Reads the auction "… Results RD n" sheet: one header row, one cleared FTR per row.</summary>
public static class AuctionFtrResultReader
{
    public static string? FindSheetName(Stream stream)
    {
        using var reader = ExcelReaderFactory.CreateReader(stream, new ExcelReaderConfiguration { LeaveOpen = true });
        do
        {
            if (reader.Name.Contains("Results", StringComparison.OrdinalIgnoreCase))
                return reader.Name;
        } while (reader.NextResult());
        return null;
    }

    public static IEnumerable<AuctionFtrResult> Read(Stream stream, string sheetName)
    {
        using var reader = ExcelReaderFactory.CreateReader(stream, new ExcelReaderConfiguration { LeaveOpen = true });
        while (reader.Name != sheetName)
        {
            if (!reader.NextResult())
                throw new InvalidDataException($"Sheet '{sheetName}' not found.");
        }
        if (!reader.Read())
            throw new InvalidDataException($"Sheet '{sheetName}' is empty.");

        var header = Enumerable.Range(0, reader.FieldCount).Select(i => reader.GetValue(i)?.ToString()?.Trim()).ToArray();
        int Col(string name)
        {
            var i = Array.FindIndex(header, h => string.Equals(h, name, StringComparison.OrdinalIgnoreCase));
            if (i < 0) throw new InvalidDataException($"Column '{name}' not found in sheet '{sheetName}'.");
            return i;
        }

        var ftrId = Col("FTRID");
        var classType = Col("Class Type");
        var periodType = Col("Period Type");
        var participant = Col("Participant");
        var sourceNode = Col("Source Node");
        var sourceId = Col("Source PNODEID");
        var sinkNode = Col("Sink Node");
        var sinkId = Col("Sink PNODEID");
        var tradeType = Col("Trade Type");
        var hedgeType = Col("Hedge Type");
        var mw = Col("Cleared MW");
        var obligationMcp = Col("Obligation MCP");
        // Long-term auctions have no options, so their sheets have no "Option MCP" column.
        var optionMcp = Array.FindIndex(header, h => string.Equals(h, "Option MCP", StringComparison.OrdinalIgnoreCase));

        var row = 1;
        while (reader.Read())
        {
            row++;
            if (reader.GetValue(ftrId) is null)
                continue;

            yield return new AuctionFtrResult
            {
                FtrId = ToLong(reader.GetValue(ftrId), row, "FTRID"),
                ClassType = Text(reader, classType),
                PeriodType = Text(reader, periodType),
                Participant = Text(reader, participant),
                SourceNode = Text(reader, sourceNode),
                SourcePnodeId = ToLong(reader.GetValue(sourceId), row, "Source PNODEID"),
                SinkNode = Text(reader, sinkNode),
                SinkPnodeId = ToLong(reader.GetValue(sinkId), row, "Sink PNODEID"),
                TradeType = Text(reader, tradeType),
                HedgeType = Text(reader, hedgeType),
                ClearedMw = ToDecimal(reader.GetValue(mw)) ?? 0,
                ObligationMcp = ToDecimal(reader.GetValue(obligationMcp)),
                OptionMcp = optionMcp < 0 ? null : ToDecimal(reader.GetValue(optionMcp)),
            };
        }
    }

    private static string Text(IExcelDataReader reader, int col) => reader.GetValue(col)?.ToString()?.Trim() ?? string.Empty;

    private static long ToLong(object? value, int row, string column) => value switch
    {
        double d => (long)d,
        string s when long.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out var l) => l,
        _ => throw new InvalidDataException($"Results row {row}: '{value}' is not a valid {column}."),
    };

    private static decimal? ToDecimal(object? value) => value switch
    {
        double d => Math.Round((decimal)d, 6),
        string s when decimal.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var m) => m,
        _ => null,
    };
}
