namespace LmpForecast.Api.Services;

/// <summary>
/// PJM FTR class hours, in prevailing Eastern time (the EPT timestamps in the DA files):
/// OnPeak = hours beginning 07:00–22:00 on weekdays that are not NERC holidays;
/// WkndOnPeak = the same hours on weekends and NERC holidays;
/// DailyOffPeak = hours beginning 23:00–06:00 every day; 24H = all hours.
/// </summary>
public static class PjmCalendar
{
    public const string OnPeak = "OnPeak";
    public const string WkndOnPeak = "WkndOnPeak";
    public const string DailyOffPeak = "DailyOffPeak";
    public const string AllHours = "24H";

    public static readonly string[] BaseClasses = [OnPeak, WkndOnPeak, DailyOffPeak];

    public static string ClassOf(DateTime hourBeginning, ISet<DateOnly> holidays)
    {
        if (hourBeginning.Hour < 7 || hourBeginning.Hour > 22) return DailyOffPeak;
        var day = DateOnly.FromDateTime(hourBeginning);
        return hourBeginning.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday || holidays.Contains(day) ? WkndOnPeak : OnPeak;
    }

    /// <summary>NERC holidays: New Year's, Memorial Day, Independence Day, Labor Day, Thanksgiving, Christmas (Sunday holidays move to Monday).</summary>
    public static HashSet<DateOnly> NercHolidays(int fromYear, int toYear)
    {
        var set = new HashSet<DateOnly>();
        for (var y = fromYear; y <= toYear; y++)
        {
            set.Add(Observed(new DateOnly(y, 1, 1)));
            set.Add(LastWeekday(y, 5, DayOfWeek.Monday));
            set.Add(Observed(new DateOnly(y, 7, 4)));
            set.Add(NthWeekday(y, 9, DayOfWeek.Monday, 1));
            set.Add(NthWeekday(y, 11, DayOfWeek.Thursday, 4));
            set.Add(Observed(new DateOnly(y, 12, 25)));
        }
        return set;
    }

    /// <summary>Number of hours of each class between two days (end exclusive), 24 clock hours per day.</summary>
    public static Dictionary<string, int> ClassHours(DateOnly from, DateOnly toExclusive)
    {
        var holidays = NercHolidays(from.Year, toExclusive.Year);
        var counts = BaseClasses.ToDictionary(c => c, _ => 0);
        for (var d = from; d < toExclusive; d = d.AddDays(1))
        {
            var start = d.ToDateTime(TimeOnly.MinValue);
            for (var h = 0; h < 24; h++)
                counts[ClassOf(start.AddHours(h), holidays)]++;
        }
        return counts;
    }

    private static DateOnly Observed(DateOnly d) => d.DayOfWeek == DayOfWeek.Sunday ? d.AddDays(1) : d;

    private static DateOnly NthWeekday(int year, int month, DayOfWeek dow, int n)
    {
        var d = new DateOnly(year, month, 1);
        while (d.DayOfWeek != dow) d = d.AddDays(1);
        return d.AddDays(7 * (n - 1));
    }

    private static DateOnly LastWeekday(int year, int month, DayOfWeek dow)
    {
        var d = new DateOnly(year, month, 1).AddMonths(1).AddDays(-1);
        while (d.DayOfWeek != dow) d = d.AddDays(-1);
        return d;
    }
}
