const { execSync } = require("child_process");
const path = require("path");

function runCommand(command, description) {
  console.log(`\n\x1b[36m[Release System] ${description}...\x1b[0m`);
  try {
    execSync(command, { stdio: "inherit", cwd: path.resolve(__dirname, "..") });
  } catch (error) {
    console.error(`\x1b[31m[Release System] Error executing: ${command}\x1b[0m`);
    process.exit(1);
  }
}

function checkNpmAuth() {
  console.log("\n\x1b[36m[Release System] Checking npm authentication status...\x1b[0m");
  try {
    const username = execSync("npm whoami", { encoding: "utf8" }).trim();
    console.log(`\x1b[32m[Release System] Authenticated as npm user: ${username}\x1b[0m`);
  } catch (error) {
    console.error("\x1b[31m[Release System] Error: You are not logged into npm. Run 'npm login' first.\x1b[0m");
    process.exit(1);
  }
}

function main() {
  console.log("\x1b[35m=== KALLO RELEASE WORKFLOW ===\x1b[0m");

  // 1. Verify npm session
  checkNpmAuth();

  // 2. Typecheck workspace
  runCommand("pnpm run check-types", "Typechecking workspace");

  // 3. Clean and build packages
  runCommand("pnpm run build", "Building all packages and applications");

  // 4. Publish workspace packages
  runCommand(
    'pnpm -r --filter "./packages/*" publish --access public --no-git-checks',
    "Publishing packages to npm",
  );

  console.log("\n\x1b[32m[Release System] Release completed successfully! 🍊\x1b[0m\n");
}

main();
