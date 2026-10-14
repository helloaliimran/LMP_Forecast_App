using System.Security.Claims;
using LmpForecast.Api.Dtos;
using LmpForecast.Api.Models;
using LmpForecast.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace LmpForecast.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(UserManager<ApplicationUser> userManager, TokenService tokens) : ControllerBase
{
    [HttpPost("register")]
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest request)
    {
        var user = new ApplicationUser
        {
            UserName = request.Email,
            Email = request.Email,
            FullName = request.FullName.Trim(),
        };
        var result = await userManager.CreateAsync(user, request.Password);
        if (!result.Succeeded)
            return ValidationProblem(new ValidationProblemDetails(result.Errors.GroupBy(e => e.Code).ToDictionary(g => g.Key, g => g.Select(e => e.Description).ToArray())));

        await userManager.AddToRoleAsync(user, Roles.User);
        return await BuildResponse(user);
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request)
    {
        var user = await userManager.FindByEmailAsync(request.Email);
        if (user is null || !await userManager.CheckPasswordAsync(user, request.Password))
            return Unauthorized(new { message = "Invalid email or password." });
        if (!user.IsActive)
            return Unauthorized(new { message = "This account has been disabled. Contact an administrator." });

        return await BuildResponse(user);
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<UserDto>> Me()
    {
        var user = await userManager.FindByIdAsync(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        if (user is null || !user.IsActive)
            return Unauthorized();
        return ToDto(user, await userManager.GetRolesAsync(user));
    }

    private async Task<AuthResponse> BuildResponse(ApplicationUser user)
    {
        var roles = await userManager.GetRolesAsync(user);
        var (token, expiresAt) = tokens.CreateToken(user, roles);
        return new AuthResponse(token, expiresAt, ToDto(user, roles));
    }

    internal static UserDto ToDto(ApplicationUser u, IList<string> roles) =>
        new(u.Id, u.Email ?? string.Empty, u.FullName, u.IsActive, u.CreatedAt, roles);
}
