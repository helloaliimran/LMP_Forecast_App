# Build context: the backend/ folder (on Render: Root Directory = backend, Dockerfile Path = ./Dockerfile).

FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
COPY LmpForecast.Api/LmpForecast.Api.csproj LmpForecast.Api/
RUN dotnet restore LmpForecast.Api/LmpForecast.Api.csproj
COPY LmpForecast.Api/ LmpForecast.Api/
RUN dotnet publish LmpForecast.Api/LmpForecast.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
# Uploaded files are written under App_Data; the runtime image runs as the non-root "app" user.
RUN mkdir -p /app/App_Data/uploads && chown -R $APP_UID /app/App_Data
USER $APP_UID

ENV ASPNETCORE_ENVIRONMENT=Production
# Render tells the container which port to listen on through $PORT (10000 by default).
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["sh", "-c", "ASPNETCORE_HTTP_PORTS=$PORT exec dotnet LmpForecast.Api.dll"]
