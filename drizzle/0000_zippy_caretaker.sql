CREATE TABLE "chart_template_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"name_en" varchar(120) NOT NULL,
	"name_ar" varchar(120) NOT NULL,
	"kind" varchar(20) NOT NULL,
	"parent_code" varchar(20),
	CONSTRAINT "chart_template_accounts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "migration_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_document_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(40) NOT NULL,
	"label_en" varchar(100) NOT NULL,
	"label_ar" varchar(100) NOT NULL,
	CONSTRAINT "system_document_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "system_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(40) NOT NULL,
	"label_en" varchar(100) NOT NULL,
	"label_ar" varchar(100) NOT NULL,
	CONSTRAINT "system_roles_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "system_tax_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(24) NOT NULL,
	"rate" numeric(7, 4) NOT NULL,
	"classification" varchar(24) NOT NULL,
	CONSTRAINT "system_tax_rates_code_unique" UNIQUE("code"),
	CONSTRAINT "system_tax_rates_rate_range" CHECK ("system_tax_rates"."rate" >= 0 AND "system_tax_rates"."rate" <= 1)
);
--> statement-breakpoint
CREATE TABLE "system_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(24) NOT NULL,
	"label_en" varchar(100) NOT NULL,
	"label_ar" varchar(100) NOT NULL,
	CONSTRAINT "system_units_code_unique" UNIQUE("code")
);
