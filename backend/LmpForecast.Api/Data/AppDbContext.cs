using LmpForecast.Api.Models;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace LmpForecast.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : IdentityDbContext<ApplicationUser>(options)
{
    public DbSet<UploadBatch> UploadBatches => Set<UploadBatch>();
    public DbSet<AuctionNodalPrice> AuctionNodalPrices => Set<AuctionNodalPrice>();
    public DbSet<DaHourlyLmp> DaHourlyLmps => Set<DaHourlyLmp>();
    public DbSet<AuctionFtrResult> AuctionFtrResults => Set<AuctionFtrResult>();
    public DbSet<AuctionPathSummary> AuctionPathSummaries => Set<AuctionPathSummary>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<ApplicationUser>(e =>
        {
            e.Property(u => u.FullName).HasMaxLength(200);
        });

        builder.Entity<UploadBatch>(e =>
        {
            e.ToTable("upload_batch");
            e.Property(b => b.DataType).HasConversion<string>().HasMaxLength(32);
            e.Property(b => b.AuctionType).HasConversion<string>().HasMaxLength(16);
            e.Property(b => b.Status).HasConversion<string>().HasMaxLength(16);
            e.Property(b => b.AuctionPeriod).HasMaxLength(32);
            e.Property(b => b.OriginalFileName).HasMaxLength(260);
            e.Property(b => b.StoredFilePath).HasMaxLength(500);
            e.Property(b => b.FileSha256).HasMaxLength(64).IsFixedLength();
            e.Property(b => b.SheetName).HasMaxLength(100);
            e.HasIndex(b => b.FileSha256).IsUnique();
            e.HasOne(b => b.UploadedByUser).WithMany().HasForeignKey(b => b.UploadedByUserId).OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<AuctionNodalPrice>(e =>
        {
            e.ToTable("auction_nodal_price");
            e.HasIndex(p => new { p.UploadBatchId, p.PnodeId, p.PeriodType });
            e.Property(p => p.Lmp24H).HasColumnName("lmp_24h");
            foreach (var name in new[] { nameof(AuctionNodalPrice.Lmp24H), nameof(AuctionNodalPrice.LmpOnPeak), nameof(AuctionNodalPrice.LmpOffPeak), nameof(AuctionNodalPrice.LmpWkndOnPeak), nameof(AuctionNodalPrice.LmpDailyOffPeak) })
                e.Property(name).HasPrecision(18, 6);
            e.HasIndex(p => p.UploadBatchId);
            e.HasIndex(p => p.PnodeId);
            e.HasOne(p => p.UploadBatch).WithMany().HasForeignKey(p => p.UploadBatchId).OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<AuctionFtrResult>(e =>
        {
            e.ToTable("auction_ftr_result");
            e.Property(p => p.ClearedMw).HasPrecision(18, 6);
            e.Property(p => p.ObligationMcp).HasPrecision(18, 6);
            e.Property(p => p.OptionMcp).HasPrecision(18, 6);
            e.HasIndex(p => p.UploadBatchId);
            e.HasIndex(p => p.SourcePnodeId);
            e.HasIndex(p => p.SinkPnodeId);
            e.HasOne(p => p.UploadBatch).WithMany().HasForeignKey(p => p.UploadBatchId).OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<AuctionPathSummary>(e =>
        {
            e.ToTable("auction_path_summary");
            foreach (var name in new[] { nameof(AuctionPathSummary.BuyMw), nameof(AuctionPathSummary.SellMw), nameof(AuctionPathSummary.NetMw), nameof(AuctionPathSummary.AvgMcp) })
                e.Property(name).HasPrecision(18, 6);
            e.HasIndex(p => new { p.UploadBatchId, p.ClassType, p.PeriodType, p.HedgeType });
            e.HasIndex(p => new { p.UploadBatchId, p.SourcePnodeId });
            e.HasIndex(p => new { p.UploadBatchId, p.SinkPnodeId });
            e.HasOne(p => p.UploadBatch).WithMany().HasForeignKey(p => p.UploadBatchId).OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<DaHourlyLmp>(e =>
        {
            e.ToTable("da_hourly_lmp");
            e.Property(p => p.DatetimeBeginningEpt).HasColumnType("timestamp without time zone");
            foreach (var name in new[] { nameof(DaHourlyLmp.SystemEnergyPriceDa), nameof(DaHourlyLmp.CongestionPriceDa), nameof(DaHourlyLmp.MarginalLossPriceDa), nameof(DaHourlyLmp.TotalLmpDa) })
                e.Property(name).HasPrecision(18, 6);
            e.HasIndex(p => new { p.PnodeId, p.DatetimeBeginningEpt });
            e.HasIndex(p => p.UploadBatchId);
            e.HasOne(p => p.UploadBatch).WithMany().HasForeignKey(p => p.UploadBatchId).OnDelete(DeleteBehavior.Cascade);
        });
    }
}
