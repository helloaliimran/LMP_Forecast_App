using System.ComponentModel.DataAnnotations;

namespace LmpForecast.Api.Dtos;

public record RegisterRequest(
    [Required, MaxLength(200)] string FullName,
    [Required, EmailAddress] string Email,
    [Required, MinLength(8)] string Password);

public record LoginRequest([Required, EmailAddress] string Email, [Required] string Password);

public record UserDto(string Id, string Email, string FullName, bool IsActive, DateTimeOffset CreatedAt, IList<string> Roles);

public record AuthResponse(string Token, DateTime ExpiresAt, UserDto User);

public record SetRolesRequest([Required] List<string> Roles);

public record SetActiveRequest(bool IsActive);
