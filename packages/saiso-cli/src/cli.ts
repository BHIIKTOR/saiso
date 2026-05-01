#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { newCommand } from "./commands/new.js";
import { devCommand } from "./commands/dev.js";
import { addCommand } from "./commands/add.js";
import { testCommand } from "./commands/test.js";
import { configCommand } from "./commands/config.js";
import { switchEnvCommand } from "./commands/switch-env.js";
import { switchServerCommand } from "./commands/switch-server.js";
import { statusCommand } from "./commands/status.js";
import { healthCommand } from "./commands/health.js";
import { mcpCommand } from "./commands/mcp.js";
import { envCommand } from "./commands/env.js";
import { receiptsCommand } from "./commands/receipts.js";
import { identityCommand } from "./commands/identity.js";
import { policyCommand } from "./commands/policy.js";
import { dockerCommand } from "./commands/docker.js";
import { runtimeCommand } from "./commands/runtime.js";
import { pluginCommand } from "./commands/plugin.js";
import { bootstrapProjectPlugins } from "./plugins/host.js";
import packageJson from "../package.json";

const program = new Command();

program
	.name("saiso")
	.description(
		"A developer-first toolkit for building EVM and SVM agents with ElizaOS",
	)
	.version(packageJson.version)
	.option(
		"--no-plugin-lockfile-migrate",
		"Fail plugin startup when lockfile migration would be required",
		false,
	);

// ASCII Art Banner
const banner = `
${chalk.cyan("╔═══════════════════════════════════════╗")}
${chalk.cyan("║")}  ${chalk.bold.yellow("🚀 SAISO - Agent Toolkit")}           ${chalk.cyan("║")}
${chalk.cyan("║")}  ${chalk.gray("Build, Test, Deploy EVM/SVM Agents")}  ${chalk.cyan("║")}
${chalk.cyan("╚═══════════════════════════════════════╝")}
`;

program.addHelpText("beforeAll", banner);

// Register commands
program.addCommand(newCommand);
program.addCommand(devCommand);
program.addCommand(addCommand);
program.addCommand(testCommand);
program.addCommand(configCommand);
program.addCommand(switchEnvCommand);
program.addCommand(switchServerCommand);
program.addCommand(statusCommand);
program.addCommand(healthCommand);
program.addCommand(mcpCommand);
program.addCommand(envCommand);
program.addCommand(receiptsCommand);
program.addCommand(identityCommand);
program.addCommand(policyCommand);
program.addCommand(dockerCommand);
program.addCommand(runtimeCommand);
program.addCommand(pluginCommand);

// Global error handler
process.on("uncaughtException", (error) => {
	console.error(chalk.red("❌ Uncaught Exception:"), error.message);
	process.exit(1);
});

process.on("unhandledRejection", (reason) => {
	console.error(chalk.red("❌ Unhandled Rejection:"), reason);
	process.exit(1);
});

async function main(): Promise<void> {
	const strictStartup = process.env.SAISO_PLUGIN_STRICT_STARTUP === "true";
	const allowMigrate = process.argv.includes("--no-plugin-lockfile-migrate")
		? false
		: true;

	await bootstrapProjectPlugins(program, {
		strictMode: strictStartup,
		allowMigrate,
	});

	await program.parseAsync();
}

main().catch((error) => {
	console.error(chalk.red("❌ Failed to bootstrap SAISO CLI:"), error instanceof Error ? error.message : error);
	process.exit(1);
});
