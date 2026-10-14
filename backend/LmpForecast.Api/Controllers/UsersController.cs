using System.Security.Claims;
using LmpForecast.Api.Data;
using LmpForecast.Api.Dtos;
using LmpForecast.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LmpForecast.Api.Controllers;

/// <summary>User and role management, SuperAdmin only.</summary>
[ApiController]
[Route("api/users")]
[Authorize(Roles = Roles.SuperAdmin)]
public class UsersController(UserManager<ApplicationUser> userManager, AppDbContext db) : ControllerBase
{
    [HttpGet("roles")]
    public IEnumerable<string> GetRoles() => Roles.All;

    [HttpGet]
    public async Task<IEnumerable<UserDto>> List()
    {
        var users = await userManager.Users.OrderBy(u => u.CreatedAt).ToListAsync();
        var userRoles = await (from ur in db.UserRoles
                               join r in db.Roles on ur.RoleId equals r.Id
                               select new { ur.UserId, r.Name }).ToListAsync();
        var lookup = userRoles.ToLookup(x => x.UserId, x => x.Name!);
        return users.Select(u => AuthController.ToDto(u, lookup[u.Id].ToList()));
    }

    [HttpPut("{id}/roles")]
    public async Task<ActionResult<UserDto>> SetRoles(string id, SetRolesRequest request)
    {
        var unknown = request.Roles.Except(Roles.All).ToList();
        if (unknown.Count > 0)
            return BadRequest(new { message = $"Unknown roles: {string.Join(", ", unknown)}" });

        var user = await userManager.FindByIdAsync(id);
        if (user is null) return NotFound();

        var current = await userManager.GetRolesAsync(user);
        if (current.Contains(Roles.SuperAdmin) && !request.Roles.Contains(Roles.SuperAdmin) && await IsLastSuperAdmin(user))
            return BadRequest(new { message = "You cannot remove the last SuperAdmin." });

        await userManager.RemoveFromRolesAsync(user, current.Except(request.Roles));
        await userManager.AddToRolesAsync(user, request.Roles.Except(current));
        return AuthController.ToDto(user, await userManager.GetRolesAsync(user));
    }

    [HttpPut("{id}/active")]
    public async Task<ActionResult<UserDto>> SetActive(string id, SetActiveRequest request)
    {
        var user = await userManager.FindByIdAsync(id);
        if (user is null) return NotFound();
        if (!request.IsActive && user.Id == User.FindFirstValue(ClaimTypes.NameIdentifier))
            return BadRequest(new { message = "You cannot disable your own account." });

        user.IsActive = request.IsActive;
        await userManager.UpdateAsync(user);
        return AuthController.ToDto(user, await userManager.GetRolesAsync(user));
    }

    private async Task<bool> IsLastSuperAdmin(ApplicationUser user) =>
        (await userManager.GetUsersInRoleAsync(Roles.SuperAdmin)).All(u => u.Id == user.Id);
}
