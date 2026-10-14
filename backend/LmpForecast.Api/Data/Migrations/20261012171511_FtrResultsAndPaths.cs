using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace LmpForecast.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class FtrResultsAndPaths : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateOnly>(
                name: "coverage_end",
                table: "upload_batch",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "coverage_start",
                table: "upload_batch",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ftr_row_count",
                table: "upload_batch",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "auction_ftr_result",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    upload_batch_id = table.Column<long>(type: "bigint", nullable: false),
                    ftr_id = table.Column<long>(type: "bigint", nullable: false),
                    class_type = table.Column<string>(type: "text", nullable: false),
                    period_type = table.Column<string>(type: "text", nullable: false),
                    participant = table.Column<string>(type: "text", nullable: false),
                    source_node = table.Column<string>(type: "text", nullable: false),
                    source_pnode_id = table.Column<long>(type: "bigint", nullable: false),
                    sink_node = table.Column<string>(type: "text", nullable: false),
                    sink_pnode_id = table.Column<long>(type: "bigint", nullable: false),
                    trade_type = table.Column<string>(type: "text", nullable: false),
                    hedge_type = table.Column<string>(type: "text", nullable: false),
                    cleared_mw = table.Column<decimal>(type: "numeric(18,6)", precision: 18, scale: 6, nullable: false),
                    obligation_mcp = table.Column<decimal>(type: "numeric(18,6)", precision: 18, scale: 6, nullable: true),
                    option_mcp = table.Column<decimal>(type: "numeric(18,6)", precision: 18, scale: 6, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_auction_ftr_result", x => x.id);
                    table.ForeignKey(
                        name: "fk_auction_ftr_result_upload_batch_upload_batch_id",
                        column: x => x.upload_batch_id,
                        principalTable: "upload_batch",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "auction_path_summary",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    upload_batch_id = table.Column<long>(type: "bigint", nullable: false),
                    class_type = table.Column<string>(type: "text", nullable: false),
                    period_type = table.Column<string>(type: "text", nullable: false),
                    hedge_type = table.Column<string>(type: "text", nullable: false),
                    source_node = table.Column<string>(type: "text", nullable: false),
                    source_pnode_id = table.Column<long>(type: "bigint", nullable: false),
                    sink_node = table.Column<string>(type: "text", nullable: false),
                    sink_pnode_id = table.Column<long>(type: "bigint", nullable: false),
                    ftr_count = table.Column<int>(type: "integer", nullable: false),
                    buy_mw = table.Column<decimal>(type: "numeric(18,6)", precision: 18, scale: 6, nullable: false),
                    sell_mw = table.Column<decimal>(type: "numeric(18,6)", precision: 18, scale: 6, nullable: false),
                    net_mw = table.Column<decimal>(type: "numeric(18,6)", precision: 18, scale: 6, nullable: false),
                    avg_mcp = table.Column<decimal>(type: "numeric(18,6)", precision: 18, scale: 6, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_auction_path_summary", x => x.id);
                    table.ForeignKey(
                        name: "fk_auction_path_summary_upload_batch_upload_batch_id",
                        column: x => x.upload_batch_id,
                        principalTable: "upload_batch",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_auction_nodal_price_upload_batch_id_pnode_id_period_type",
                table: "auction_nodal_price",
                columns: new[] { "upload_batch_id", "pnode_id", "period_type" });

            migrationBuilder.CreateIndex(
                name: "ix_auction_ftr_result_sink_pnode_id",
                table: "auction_ftr_result",
                column: "sink_pnode_id");

            migrationBuilder.CreateIndex(
                name: "ix_auction_ftr_result_source_pnode_id",
                table: "auction_ftr_result",
                column: "source_pnode_id");

            migrationBuilder.CreateIndex(
                name: "ix_auction_ftr_result_upload_batch_id",
                table: "auction_ftr_result",
                column: "upload_batch_id");

            migrationBuilder.CreateIndex(
                name: "ix_auction_path_summary_upload_batch_id_class_type_period_type",
                table: "auction_path_summary",
                columns: new[] { "upload_batch_id", "class_type", "period_type", "hedge_type" });

            migrationBuilder.CreateIndex(
                name: "ix_auction_path_summary_upload_batch_id_sink_pnode_id",
                table: "auction_path_summary",
                columns: new[] { "upload_batch_id", "sink_pnode_id" });

            migrationBuilder.CreateIndex(
                name: "ix_auction_path_summary_upload_batch_id_source_pnode_id",
                table: "auction_path_summary",
                columns: new[] { "upload_batch_id", "source_pnode_id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "auction_ftr_result");

            migrationBuilder.DropTable(
                name: "auction_path_summary");

            migrationBuilder.DropIndex(
                name: "ix_auction_nodal_price_upload_batch_id_pnode_id_period_type",
                table: "auction_nodal_price");

            migrationBuilder.DropColumn(
                name: "coverage_end",
                table: "upload_batch");

            migrationBuilder.DropColumn(
                name: "coverage_start",
                table: "upload_batch");

            migrationBuilder.DropColumn(
                name: "ftr_row_count",
                table: "upload_batch");
        }
    }
}
