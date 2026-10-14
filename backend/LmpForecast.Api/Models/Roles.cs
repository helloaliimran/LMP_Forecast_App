namespace LmpForecast.Api.Models;

public static class Roles
{
    public const string SuperAdmin = "SuperAdmin";
    public const string Admin = "Admin";
    public const string User = "User";

    public static readonly string[] All = [SuperAdmin, Admin, User];

    // Used in [Authorize(Roles = ...)] for anyone allowed to upload data.
    public const string Uploaders = SuperAdmin + "," + Admin;
}
