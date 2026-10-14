using System.Globalization;
using System.Text.RegularExpressions;
using LmpForecast.Api.Models;

namespace LmpForecast.Api.Services;

/// <summary>
/// Works out which days an auction's FTRs cover. PJM planning years run 1 June to 31 May:
/// annual "2026-2027" covers one planning year, long-term "2026-2029" covers three
/// (period types YR1, YR2, YR3), monthly "2026-10" covers one calendar month.
/// </summary>
public static partial class AuctionCoverage
{
    public static (DateOnly Start, DateOnly End)? For(AuctionType? type, string? period)
    {
        if (type is null || string.IsNullOrWhiteSpace(period)) return null;

        if (type == AuctionType.Monthly)
        {
            var m = MonthPattern().Match(period);
            if (!m.Success) return null;
            var start = new DateOnly(int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture), int.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture), 1);
            return (start, start.AddMonths(1).AddDays(-1));
        }

        var y = YearsPattern().Match(period);
        if (!y.Success) return null;
        var from = int.Parse(y.Groups[1].Value, CultureInfo.InvariantCulture);
        var to = int.Parse(y.Groups[2].Value, CultureInfo.InvariantCulture);
        if (to < from) return null;
        return (new DateOnly(from, 6, 1), new DateOnly(to, 5, 31));
    }

    /// <summary>The period type whose prices apply on a date: YR1/YR2/YR3 for long-term auctions, otherwise null (use whatever the auction has).</summary>
    public static string? PeriodTypeFor(UploadBatch batch, DateOnly date)
    {
        if (batch.AuctionType != AuctionType.LongTerm || batch.CoverageStart is null) return null;
        var planningYear = date.Month >= 6 ? date.Year : date.Year - 1;
        return $"YR{planningYear - batch.CoverageStart.Value.Year + 1}";
    }

    [GeneratedRegex(@"^(\d{4})-(\d{1,2})$")]
    private static partial Regex MonthPattern();

    [GeneratedRegex(@"^(\d{4})\s*-\s*(\d{4})$")]
    private static partial Regex YearsPattern();
}
