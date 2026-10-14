using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using LmpForecast.Api.Models;
using Microsoft.IdentityModel.Tokens;

namespace LmpForecast.Api.Services;

public class JwtOptions
{
    public string Issuer { get; set; } = "LmpForecast";
    public string Audience { get; set; } = "LmpForecast";
    public string Key { get; set; } = string.Empty;
    public int ExpiryMinutes { get; set; } = 480;
}

public class TokenService(Microsoft.Extensions.Options.IOptions<JwtOptions> options)
{
    private readonly JwtOptions _options = options.Value;

    public (string Token, DateTime ExpiresAt) CreateToken(ApplicationUser user, IEnumerable<string> roles)
    {
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id),
            new(JwtRegisteredClaimNames.Email, user.Email ?? string.Empty),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new(ClaimTypes.NameIdentifier, user.Id),
            new(ClaimTypes.Name, user.FullName),
        };
        claims.AddRange(roles.Select(r => new Claim(ClaimTypes.Role, r)));

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.Key));
        var expiresAt = DateTime.UtcNow.AddMinutes(_options.ExpiryMinutes);
        var token = new JwtSecurityToken(
            _options.Issuer,
            _options.Audience,
            claims,
            expires: expiresAt,
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));

        return (new JwtSecurityTokenHandler().WriteToken(token), expiresAt);
    }
}
