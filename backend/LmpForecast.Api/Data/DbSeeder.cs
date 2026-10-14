using LmpForecast.Api.Models;
using Microsoft.AspNetCore.Identity;

namespace LmpForecast.Api.Data;

public static class DbSeeder
{
    /// <summary>Creates the roles and, if configured, the first SuperAdmin account.</summary>
    public static async Task SeedAsync(IServiceProvider services, IConfiguration config, ILogger logger)
    {
        var roleManager = services.GetRequiredService<RoleManager<IdentityRole>>();
        foreach (var role in Roles.All)
        {
            if (!await roleManager.RoleExistsAsync(role))
                await roleManager.CreateAsync(new IdentityRole(role));
        }

        var email = config["SeedSuperAdmin:Email"];
        var password = config["SeedSuperAdmin:Password"];
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
            return;

        var userManager = services.GetRequiredService<UserManager<ApplicationUser>>();
        if (await userManager.FindByEmailAsync(email) is not null)
            return;

        var user = new ApplicationUser
        {
            UserName = email,
            Email = email,
            EmailConfirmed = true,
            FullName = config["SeedSuperAdmin:FullName"] ?? "Super Admin",
        };
        var result = await userManager.CreateAsync(user, password);
        if (!result.Succeeded)
        {
            logger.LogError("Could not seed SuperAdmin: {Errors}", string.Join("; ", result.Errors.Select(e => e.Description)));
            return;
        }
        await userManager.AddToRoleAsync(user, Roles.SuperAdmin);
        logger.LogInformation("Seeded SuperAdmin {Email}", email);
    }
}
